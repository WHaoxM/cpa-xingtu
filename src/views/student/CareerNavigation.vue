<!-- 页面：职途导航 · 简历导入；路由：student/career-navigation；角色：STUDENT/TEACHER -->
<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { gsap } from '@/plugins/gsap'
import { useUserStore } from '@/stores'
import UserInfoBar from '@/components/UserInfoBar.vue'
import { useResumeStore } from '@/stores/resume'
import CareerAgentDashboard from '@/components/career/CareerAgentDashboard.vue'
import CareerNavigationIdlePreview from '@/components/career/CareerNavigationIdlePreview.vue'
import ResumeDiagnosticReport from '@/components/career/ResumeDiagnosticReport.vue'
import { usePortraitSession } from '@/composables/usePortraitSession'
import { openAgentWithResource } from '@/composables/useAgentResourceHandoff'
import type { AgentPortraitInput } from '@/composables/useAgentPortrait'
import TalentPortrait from '@/views/student/TalentPortrait.vue'
import {
  getCareerInsightsMock,
  CAREER_DOMAINS,
  DEFAULT_CAREER_ROLE,
  mapCatalogRoleToDomain,
} from '@/composables/useCareerInsights'
import type { CareerRole } from '@/composables/useCareerInsights'
import {
  uploadResumeFile,
  extractSkillsOnly,
  nsleResume,
  uploadResumeCandidate,
  getResumeCandidate,
  confirmResumeCandidate,
  runConfirmedStudentPipeline,
  getPipelineEvents,
  getPipelineStatus,
  type ResumeCandidate,
  type ConfirmedPipelineResult,
  type PipelineTaskEvent,
} from '@/api/pipeline'
import { inferRoleFromSkills, listInsights } from '@/api/career'
import {
  generateResumeDiagnosticReport,
  getLatestResumeDiagnosticReport,
  type ResumeDiagnosticReport as ResumeDiagnosticReportData,
} from '@/api/report'
import { hybridCandidates, getMatchExplain, type MatchExplain } from '@/api/match'
import { DEMO_STUDENT_ID, getApiMode } from '@/api/config'
import { ApiError } from '@/api/types'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const resumeStore = useResumeStore()

type ParsePhase = 'idle' | 'parsing' | 'confirming' | 'needs_repair' | 'verified' | 'done'
type RightLayoutMode = 'idle' | 'split' | 'collapsing' | 'full'

const pageRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)
const pasteText = ref('')
const uploadedFileName = ref('')
const uploadedFile = ref<File | null>(null)
const parseError = ref('')
const parsePhase = ref<ParsePhase>('idle')
const isHttpMode = getApiMode() === 'http'
const resumeCandidate = ref<ResumeCandidate | null>(null)
const confirmedProfile = ref<ConfirmedPipelineResult | null>(null)
const authoritativePortrait = ref<ConfirmedPipelineResult | null>(null)
const partialPortrait = ref<ConfirmedPipelineResult | null>(null)
const resumeDiagnosticReport = ref<ResumeDiagnosticReportData | null>(null)
const resumeReportLoading = ref(false)
const resumeReportError = ref('')
const rightRealView = ref<'portrait' | 'report'>('portrait')
const taskEvents = ref<PipelineTaskEvent[]>([])
const taskSnapshot = ref<{ task_id: string; pipeline: string; status: string } | null>(null)
const eventError = ref('')
type StoredTaskStatus = {
  task_id: string
  pipeline: string
  status: string
  result?: Record<string, unknown>
}
type PortraitDimension = { dimension_score?: number | null; evidence?: string[]; missing_fields?: string[] }
type PortraitCandidate = {
  D1_basic?: PortraitDimension
  D2_skill?: PortraitDimension
  D3_quality?: PortraitDimension
  D4_potential?: PortraitDimension
  summary?: { competitiveness_score?: number | null }
}
let eventCursor = 0
let eventPollTimer: number | null = null
let eventTaskId = ''
let resumeReportRequestSeq = 0
function stopEventPoll() {
  if (eventPollTimer != null) window.clearTimeout(eventPollTimer)
  eventPollTimer = null
}
async function replayTaskEvents(taskId: string, reset = false) {
  if (!isHttpMode || !/^task_[A-Za-z0-9]+$/.test(taskId)) return
  if (reset || eventTaskId !== taskId) {
    stopEventPoll()
    eventTaskId = taskId
    eventCursor = 0
    taskEvents.value = []
    taskSnapshot.value = null
  }
  try {
    let more = true
    while (more) {
      const env = await getPipelineEvents(taskId, eventCursor)
      if (eventTaskId !== taskId) return
      if (!env.success || !env.data) throw new Error(env.error || '任务事件读取失败')
      taskSnapshot.value = env.data.task
      taskEvents.value.push(...env.data.events)
      eventCursor = env.data.cursor
      more = env.data.has_more
    }
    eventError.value = ''
    if (taskSnapshot.value?.status === 'pending' || taskSnapshot.value?.status === 'running') {
      eventPollTimer = window.setTimeout(() => { void replayTaskEvents(taskId) }, 2000)
    }
  } catch (e) {
    eventError.value = e instanceof Error ? e.message : '事件不可用'
  }
}
function handoffTaskToAgent(taskId: string) {
  openAgentWithResource(router, { kind: 'pipeline_task', taskId })
}
function handoffResumeReportToAgent(reportId: string) {
  openAgentWithResource(router, {
    kind: 'career_resource', uri: `career://me/resume-reports/${reportId}`,
  })
}
const CANDIDATE_LABELS: Record<string, string> = {
  name: '姓名', school: '学校', major: '专业', degree: '学历', grade: '年级',
  target_role: '求职方向', skills: '技能', projects: '项目经历',
  competitions: '竞赛与荣誉', certificates: '证书', research: '科研经历',
  leadership_roles: '组织经历', internship_months: '实习月数',
  languages: '语言能力', gpa: '绩点', rank_percent: '排名百分位',
  phone: '电话', email: '邮箱', semantic_facts: '原文支持的能力事实',
}
const FACT_LABELS: Record<string, string> = {
  school_tier: '学校层次的可核对依据',
  major_category: '专业类别的可核对依据',
  communication: '沟通能力的原文证据',
  teamwork: '团队协作的原文证据',
  stress_tolerance: '抗压能力的原文证据',
  responsibility: '责任感的原文证据',
}
const INTERNAL_CANDIDATE_KEYS = new Set([
  'source', 'source_sha256', 'raw_text_chars', 'structure_path', 'chunk_count',
  'failed_offsets', 'error', 'next_action',
])
const candidateProfile = computed(() => resumeCandidate.value?.candidate_profile || {})
const candidateFields = computed(() => Object.entries(candidateProfile.value)
  .filter(([key, value]) => !key.startsWith('_') && !INTERNAL_CANDIDATE_KEYS.has(key)
    && value !== null && value !== undefined && value !== ''))
const candidateSkills = computed(() => {
  const raw = candidateProfile.value.skills
  return Array.isArray(raw) ? raw.map(item => typeof item === 'string' ? item : String(item?.name || ''))
    .filter(Boolean) : []
})
function resumeField(item: Record<string, unknown>, key: string): string {
  return typeof item[key] === 'string' ? item[key].trim() : ''
}
const candidateProjects = computed(() => {
  const items = candidateProfile.value.projects
  if (!Array.isArray(items)) return []
  return items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({
      name: resumeField(item, 'name'),
      role: resumeField(item, 'role'),
      isTeam: typeof item.is_team === 'boolean' ? item.is_team : null,
      description: resumeField(item, 'desc'),
    }))
    .filter(item => item.name || item.description)
})
const candidateCompetitions = computed(() => {
  const items = candidateProfile.value.competitions
  if (!Array.isArray(items)) return []
  return items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({
      name: resumeField(item, 'name'),
      level: resumeField(item, 'level'),
      award: resumeField(item, 'award'),
    }))
    .filter(item => item.name)
})
const evidencePageCount = computed(() => resumeCandidate.value?.source_evidence?.page_count)
const observedPageCount = computed(() => resumeCandidate.value?.source_evidence?.observed_pages?.length ?? 0)
const missingFactLabels = computed(() => (partialPortrait.value?.missing_fields || [])
  .map(key => FACT_LABELS[String(key)] || String(key)))
const portraitCandidate = computed(() => (partialPortrait.value?.portrait_candidate || null) as PortraitCandidate | null)
const publishedPortrait = computed(() => (authoritativePortrait.value?.portrait || null) as PortraitCandidate | null)
function verifiedDimensionScore(dimension?: PortraitDimension): number | null {
  const score = dimension?.dimension_score
  return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100 ? score : null
}
const portraitDimensions = computed(() => {
  const portrait = publishedPortrait.value || portraitCandidate.value
  return [
    { key: 'D1', label: '基础背景', data: portrait?.D1_basic },
    { key: 'D2', label: '职业技能', data: portrait?.D2_skill },
    { key: 'D3', label: '职业素养', data: portrait?.D3_quality },
    { key: 'D4', label: '成长潜力', data: portrait?.D4_potential },
  ].map(dimension => ({
    ...dimension,
    score: verifiedDimensionScore(dimension.data),
  }))
})
const portraitScoreCount = computed(() => portraitDimensions.value.filter(dimension => dimension.score !== null).length)
const showBackendPortrait = computed(() => isHttpMode && !!(partialPortrait.value || authoritativePortrait.value))
const showBackendWorkspace = computed(() => isHttpMode && (!!confirmedProfile.value?.profile_ready || showBackendPortrait.value))
const realPortraitData = computed(() => {
  if (!showBackendPortrait.value) return null
  const profile = candidateProfile.value
  return {
    status: partialPortrait.value ? 'partial' as const : 'completed' as const,
    taskId: (partialPortrait.value || authoritativePortrait.value)?.task_id || '',
    name: typeof profile.name === 'string' ? profile.name : '',
    school: typeof profile.school === 'string' ? profile.school : '',
    major: typeof profile.major === 'string' ? profile.major : '',
    degree: typeof profile.degree === 'string' ? profile.degree : '',
    targetRole: typeof profile.target_role === 'string' ? profile.target_role : '',
    pagesObserved: observedPageCount.value,
    pageCount: typeof evidencePageCount.value === 'number' ? evidencePageCount.value : null,
    skills: candidateSkills.value,
    projects: candidateProjects.value,
    competitions: candidateCompetitions.value,
    dimensions: portraitDimensions.value.map(dimension => ({
      key: dimension.key, label: dimension.label, score: dimension.score,
      evidence: dimension.data?.evidence || [],
    })),
    missingFacts: missingFactLabels.value,
    totalScore: verifiedDimensionScore({ dimension_score: publishedPortrait.value?.summary?.competitiveness_score }),
  }
})
function displayCandidateValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未提供'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.map(displayCandidateValue).join('、')
  return Object.entries(value)
    .filter(([key, item]) => key !== 'source_sha256' && item !== null && item !== undefined && item !== '')
    .map(([key, item]) => `${CANDIDATE_LABELS[key] || FACT_LABELS[key] || key}：${displayCandidateValue(item)}`)
    .join('；')
}
function candidateLabel(key: string): string { return CANDIDATE_LABELS[key] || key }

let candidateLoadSeq = 0
watch(() => route.query.task_id, async value => {
  const seq = ++candidateLoadSeq
  if (!isHttpMode || typeof value !== 'string') return
  stopEventPoll()
  resumeCandidate.value = null
  confirmedProfile.value = null
  partialPortrait.value = null
  authoritativePortrait.value = null
  resumeDiagnosticReport.value = null
  resumeReportRequestSeq += 1
  resumeReportLoading.value = false
  resumeReportError.value = ''
  rightRealView.value = 'portrait'
  taskSnapshot.value = null
  eventError.value = ''
  parseError.value = ''
  if (!/^task_[A-Za-z0-9]+$/.test(value)) {
    parseError.value = '无效的简历任务引用'
    parsePhase.value = 'idle'
    return
  }
  parsePhase.value = 'parsing'
  try {
    const env = await getResumeCandidate(value)
    if (seq !== candidateLoadSeq) return
    if (!env.success || !env.data) throw new Error(env.error || '无法读取简历候选')
    resumeCandidate.value = env.data
    uploadedFileName.value = '会话中的简历候选'
    if (env.data.status === 'completed' && env.data.confirmed && env.data.profile_ready) {
      confirmedProfile.value = {
        task_id: value, status: 'completed', profile_ready: true,
        resource_id: env.data.student_id,
      }
      const portrait = env.data.portrait_task
      if (portrait?.status === 'partial') partialPortrait.value = { ...portrait }
      if (portrait?.status === 'completed' && portrait.portrait_id && portrait.portrait) {
        authoritativePortrait.value = { ...portrait, portrait_ready: true }
      }
      if (!portrait?.portrait && portrait?.status !== 'partial') rightRealView.value = 'report'
      parsePhase.value = 'verified'
      void loadResumeDiagnosticReport(false)
      void replayTaskEvents(portrait?.task_id || value, true)
    } else {
      parsePhase.value = env.data.status === 'needs_input' ? 'confirming' : 'needs_repair'
      void replayTaskEvents(value, true)
    }
  } catch (e) {
    if (seq !== candidateLoadSeq) return
    try {
      // The candidate endpoint is the authority for L0 ownership/current
      // confirmation. Do not revive a superseded L0 from generic task status.
      const stored = await getPipelineStatus(value)
      if (seq !== candidateLoadSeq) return
      const task = stored.data as StoredTaskStatus | undefined
      if (stored.success && task?.pipeline === 'L2_generate_portrait') {
        const result = { task_id: value, ...(task.result || {}) } as ConfirmedPipelineResult
        if (task.status === 'partial') {
          partialPortrait.value = { ...result, status: 'partial' }
        } else if (task.status === 'completed' && result.portrait_id && result.portrait) {
          authoritativePortrait.value = { ...result, status: 'completed', portrait_ready: true }
        }
        if (partialPortrait.value || authoritativePortrait.value) {
          parsePhase.value = 'verified'
          void replayTaskEvents(value, true)
          return
        }
      }
      await replayTaskEvents(value, true)
      if (seq !== candidateLoadSeq) return
      parseError.value = taskSnapshot.value
        ? '这份资料目前不能作为待确认简历打开；可在下方查看任务记录。'
        : (e instanceof Error ? e.message : '无法读取简历候选')
    } catch {
      parseError.value = e instanceof Error ? e.message : '无法读取简历候选'
    }
    parsePhase.value = 'idle'
  }
}, { immediate: true })
const selectedDirection = ref<CareerRole | ''>('')
/** Hybrid retrieve + explain (scores stay authoritative from BE match_result) */
const matchExplain = ref<MatchExplain | null>(null)
const hybridNote = ref('')
const rightLayoutMode = ref<RightLayoutMode>('idle')
const dashboardPaneRef = ref<HTMLElement | null>(null)
const isImmersiveLayout = ref(false)
const dashboardBaselineWidth = ref(0)
watch(showBackendPortrait, visible => {
  if (!isHttpMode) return
  rightLayoutMode.value = visible ? 'full' : 'idle'
  isImmersiveLayout.value = visible
}, { immediate: true })
watch(showBackendWorkspace, visible => {
  if (!isHttpMode || !visible) return
  rightLayoutMode.value = 'full'
  isImmersiveLayout.value = true
}, { immediate: true })

const {
  status: portraitSessionStatus,
  currentPhase: portraitCurrentPhase,
  traceEvents,
  replaySnapshots,
  result: portraitSessionResult,
  progress: sessionProgress,
  currentLabel: sessionCurrentLabel,
  leftPanelMessage,
  leftPanelProgress,
  currentStep,
  totalSteps,
  run: runPortraitSession,
  reset: resetPortraitSession,
} = usePortraitSession()

const parseProgress = computed(() => leftPanelProgress.value)
const parseMsg = computed(() => leftPanelMessage.value)

const ACCEPTED_MIME = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/bmp',
  'image/webp',
  'image/tiff',
].join(',')

let gsapCtx: ReturnType<typeof gsap.context> | null = null
let rightLayoutDelayTimer: number | null = null
let rightLayoutSettleTimer: number | null = null
let dashboardPaneObserver: ResizeObserver | null = null

function clearRightLayoutTimers() {
  if (rightLayoutDelayTimer != null) {
    window.clearTimeout(rightLayoutDelayTimer)
    rightLayoutDelayTimer = null
  }
  if (rightLayoutSettleTimer != null) {
    window.clearTimeout(rightLayoutSettleTimer)
    rightLayoutSettleTimer = null
  }
}

function updateDashboardBaselineWidth(width: number) {
  if (rightLayoutMode.value === 'split' && width > 0) {
    dashboardBaselineWidth.value = Math.round(width)
  }
}

function setupDashboardPaneObserver() {
  if (typeof ResizeObserver === 'undefined') return
  dashboardPaneObserver = new ResizeObserver(entries => {
    const entry = entries[0]
    if (!entry) return
    updateDashboardBaselineWidth(entry.contentRect.width)
  })
  if (dashboardPaneRef.value) {
    dashboardPaneObserver.observe(dashboardPaneRef.value)
  }
}

function openRightSplitLayout() {
  clearRightLayoutTimers()
  rightLayoutMode.value = 'split'
}

function collapseRightDashboard() {
  clearRightLayoutTimers()
  updateDashboardBaselineWidth(dashboardPaneRef.value?.getBoundingClientRect().width ?? 0)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rightLayoutMode.value = 'full'
    return
  }
  rightLayoutDelayTimer = window.setTimeout(() => {
    rightLayoutMode.value = 'collapsing'
    rightLayoutSettleTimer = window.setTimeout(() => {
      rightLayoutMode.value = 'full'
    }, 460)
  }, 180)
}

function setupEntrance() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  gsapCtx = gsap.context(() => {
    gsap.from('.rp-header', { opacity: 0, y: -18, duration: 0.45, ease: 'power2.out', clearProps: 'opacity,transform' })
    gsap.from('.rp-editorial', { opacity: 0, y: -12, duration: 0.5, ease: 'power2.out', delay: 0.1, clearProps: 'opacity,transform' })
    gsap.from('.rp-left', { opacity: 0, x: -20, duration: 0.45, ease: 'power2.out', delay: 0.05, clearProps: 'opacity,transform' })
    gsap.from('.rp-right', { opacity: 0, x: 20, duration: 0.5, ease: 'power2.out', delay: 0.15, clearProps: 'opacity,transform' })
  }, pageRef.value!)
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleFile(file)
}

function onDrop(e: DragEvent) {
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}

function handleFile(file: File) {
  uploadedFile.value = file
  uploadedFileName.value = file.name
  pasteText.value = ''
}


async function resolveResumeText(studentId: string): Promise<{
  text: string
  parseSkills: Array<{ name: string; weight: number; category: string }>
  name?: string
  studentProfile?: import('@/composables/useAgentPortrait').StudentProfilePayload
}> {
  void studentId
  let text = ''

  // L0: file → MinerU/text；粘贴 → 原文
  if (uploadedFile.value && !pasteText.value.trim()) {
    const env = await uploadResumeFile(uploadedFile.value, { extractSkills: false })
    const data = (env.data || {}) as { text?: string; raw_text?: string }
    text = String(data.text || data.raw_text || '').trim()
    if (!text) throw new Error('文件解析未返回可用文本，请改用粘贴简历')
  } else {
    text = pasteText.value.trim()
    if (!text) throw new Error('请粘贴简历文本或上传文件')
  }

  // Resume Structure Truth：canonical LLM student_profile；缺校/专业拒评（禁止正则修补）
  let parseSkills: Array<{ name: string; weight: number; category: string }> = []
  let name: string | undefined
  let studentProfile: import('@/composables/useAgentPortrait').StudentProfilePayload | undefined
  try {
    const env = await nsleResume({ text })
    const data = env.data
    const validation = data?.structure_validation
    
    // 结构字段未通过服务端校验时不可进入画像评分；不能以默认值补造院校/专业。
    if (!validation || validation.ok !== true) {
      const issues = (validation?.issues || []).join('、') || '结构字段不完整'
      throw new Error(
        `简历结构抽取未完成（${issues}）。请确认原文含院校/专业等关键字段后重试。`,
      )
    }
    
    studentProfile = (data?.student_profile || undefined) as
      | import('@/composables/useAgentPortrait').StudentProfilePayload
      | undefined
    
    if (!studentProfile?.school?.trim() || !studentProfile?.major?.trim()) {
      throw new Error('简历缺少院校或专业等关键字段，不能用默认值继续评分；请先核对结构化结果。')
    }
    
    name = studentProfile?.name
    const skills = data?.skills || []
    parseSkills = skills.map((s, i) => {
      const skillName = typeof s === 'string' ? s : String(s?.name ?? '')
      const category = typeof s === 'object' && s && 'category' in s
        ? String((s as { category?: string }).category || '通用')
        : '通用'
      return { name: skillName, weight: Math.max(0.45, 0.95 - i * 0.04), category }
    }).filter(s => s.name)
  } catch (e) {
    console.warn('[career-navigation] nsle/resume failed', e)
    if (e instanceof Error && (e.message.includes('结构') || e.message.includes('院校'))) {
      throw e
    }
    throw new Error('模型抽取失败（NS-LE）。请确认后端 LLM 可用后重试，勿使用空画像评分。')
  }
  return { text, parseSkills, name, studentProfile }
}

type RolePack = {
  /** BE catalog role — preserved for Portrait / Match */
  catalogRole: string
  /** UI domain for local mock skill graphs only */
  domainRole: CareerRole
  confidence: number
  candidates: Array<{
    role: string
    score: number
    coverage?: number
    matched_skills?: string[]
    missing_core_skills?: string[]
  }>
}

async function resolveRoleFromSkills(
  skills: Array<{ name: string; weight?: number; category?: string }>,
): Promise<RolePack> {
  const domainFallback: CareerRole = selectedDirection.value || DEFAULT_CAREER_ROLE

  if (!skills.length) {
    return {
      catalogRole: domainFallback,
      domainRole: domainFallback,
      confidence: 0.45,
      candidates: [{ role: domainFallback, score: 0.45 }],
    }
  }

  try {
    const pack = await inferRoleFromSkills({
      skills: skills.map(s => ({
        name: s.name,
        confidence: s.weight,
        category: s.category,
      })),
      top_k: 5,
      preferred_role: selectedDirection.value || undefined,
    })
    const catalog = String(pack.predicted_role || '').trim()
    const candidates = (pack.candidates || [])
      .map(r => ({
        role: String(r.role_name || '').trim(),
        score: Number(r.score) || 0,
        coverage: r.coverage,
        matched_skills: r.matched_skills,
        missing_core_skills: r.missing_core_skills,
      }))
      .filter(c => c.role)
      .sort((a, b) => b.score - a.score)

    if (catalog || candidates.length) {
      const top = catalog || candidates[0]!.role
      return {
        catalogRole: top,
        domainRole: mapCatalogRoleToDomain(top),
        confidence: Math.min(0.95, Number(pack.confidence) || candidates[0]?.score || 0.6),
        candidates: candidates.length
          ? candidates.slice(0, 5)
          : [{ role: top, score: Number(pack.confidence) || 0.6 }],
      }
    }
  } catch (e) {
    console.warn('[career-navigation] infer-role failed', e)
  }

  // Fallback: catalog insights by skill overlap names — still no resume text / explore
  try {
    const list = await listInsights({ limit: 16 })
    const skillSet = new Set(skills.map(s => s.name.toLowerCase()))
    const scored = list
      .map(item => {
        const core = (item.core_skills || []).map(s => String(s).toLowerCase())
        const hits = core.filter(s => skillSet.has(s)).length
        const score = core.length ? hits / core.length : 0
        return { role: item.role_name, score }
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
    if (scored.length) {
      const top = scored[0]!
      return {
        catalogRole: top.role,
        domainRole: mapCatalogRoleToDomain(top.role),
        confidence: Math.min(0.7, 0.4 + top.score * 0.4),
        candidates: scored.slice(0, 5),
      }
    }
  } catch (e) {
    console.warn('[career-navigation] insights list failed', e)
  }

  return {
    catalogRole: domainFallback,
    domainRole: domainFallback,
    confidence: 0.5,
    candidates: [{ role: domainFallback, score: 0.5 }],
  }
}

async function startParse() {
  if (!pasteText.value.trim() && !uploadedFile.value) return

  isImmersiveLayout.value = false
  dashboardBaselineWidth.value = 0
  parseError.value = ''
  parsePhase.value = 'parsing'
  resumeStore.reset()
  resumeCandidate.value = null
  confirmedProfile.value = null
  authoritativePortrait.value = null
  partialPortrait.value = null

  if (isHttpMode) {
    try {
      if (!uploadedFile.value) throw new Error('真实管线目前需上传文件；粘贴文本尚未接入可确认的持久任务。')
      const env = await uploadResumeCandidate(uploadedFile.value)
      if (!env.success || !env.data?.task_id) throw new Error(env.error || '简历解析未返回权威任务 ID')
      resumeCandidate.value = env.data
      parsePhase.value = env.data.status === 'needs_input' ? 'confirming' : 'needs_repair'
      // Keep the server-owned task reference in the URL so a refresh replays
      // the same candidate/confirmation and its linked L2 state.
      if (route.query.task_id !== env.data.task_id) {
        void router.replace({ query: { ...route.query, task_id: env.data.task_id } })
      } else {
        void replayTaskEvents(env.data.task_id, true)
      }
    } catch (e) {
      parseError.value = e instanceof Error ? e.message : '解析失败'
      parsePhase.value = 'idle'
    }
    return
  }

  const studentId = userStore.currentUser?.id || DEMO_STUDENT_ID

  try {
    const { text, parseSkills, studentProfile } = await resolveResumeText(studentId)

    // Stronger skill extract (dictionary path; LLM optional)
    let apiSkills = parseSkills
    try {
      const ext = await extractSkillsOnly({ text, use_llm: true })
      const skills = (ext.data?.skills || []) as Array<{ name?: string; category?: string; confidence?: number }>
      if (skills.length) {
        apiSkills = skills.map((s, i) => ({
          name: String(s.name || ''),
          weight: Math.min(0.98, Math.max(0.4, Number(s.confidence) || (0.9 - i * 0.03))),
          category: String(s.category || '通用'),
        })).filter(s => s.name)
      }
    } catch (e) {
      console.warn('[career-navigation] extract/skills failed', e)
    }

    const rolePack = selectedDirection.value
      ? {
          catalogRole: selectedDirection.value,
          domainRole: selectedDirection.value,
          confidence: 0.8,
          candidates: [{ role: selectedDirection.value, score: 0.8 }],
        }
      : await resolveRoleFromSkills(apiSkills)

    // Mock graphs keyed by domain; predictedRole keeps BE catalog name (e.g. RAG工程师)
    const insights = getCareerInsightsMock(rolePack.domainRole)
    insights.predictedRole = rolePack.catalogRole
    insights.domainRole = rolePack.domainRole
    insights.confidence = rolePack.confidence
    insights.candidates = rolePack.candidates.length
      ? rolePack.candidates
      : insights.candidates
    insights.salary.predicted.role = rolePack.catalogRole
    insights.salary.target.role = rolePack.catalogRole

    const parsedSkills = apiSkills.length
      ? apiSkills
      : insights.skillGraph.nodes.slice(0, 12).map(n => ({
          name: n.name,
          weight: n.heat / 100,
          category: n.category,
        }))

    // Hybrid retrieve (not score) + optional explain when job_portrait fixture exists
    matchExplain.value = null
    hybridNote.value = ''
    try {
      const hybrid = await hybridCandidates({
        skills: parsedSkills.map(s => ({ name: s.name })),
        preferred_role: rolePack.catalogRole,
        top_k: 5,
      })
      hybridNote.value = hybrid.note || ''
      if (hybrid.candidates?.length) {
        insights.candidates = hybrid.candidates.map(c => ({
          role: String(c.position_name || c.role_name || c.id),
          score: Number(c.retrieve_score) || 0,
          matched_skills: c.matched_keywords,
        }))
        const jobId = hybrid.candidates[0]?.job_portrait_id
        if (jobId) {
          matchExplain.value = await getMatchExplain(DEMO_STUDENT_ID, String(jobId))
        }
      }
    } catch (e) {
      console.warn('[career-navigation] hybrid/explain optional failed', e)
    }

    resumeStore.setResult({
      rawText: pasteText.value || text,
      fileName: uploadedFileName.value,
      insights,
      skills: parsedSkills,
    })
    openRightSplitLayout()

    const portraitInput: AgentPortraitInput = {
      resumeText: text,
      parsedSkills,
      predictedRole: insights.predictedRole,
      confidence: insights.confidence,
      matchedCareers: insights.candidates,
      studentProfile,
    }

    await runPortraitSession(portraitInput)
    parsePhase.value = 'done'
    collapseRightDashboard()
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : '分析失败，请检查后端是否已启动'
    parsePhase.value = 'idle'
    isImmersiveLayout.value = false
    dashboardBaselineWidth.value = 0
    resumeStore.reset()
    resetPortraitSession()
    clearRightLayoutTimers()
    rightLayoutMode.value = 'idle'
  }
}

async function confirmParsedResume() {
  const taskId = resumeCandidate.value?.task_id
  if (!taskId || parsePhase.value !== 'confirming') return
  parseError.value = ''
  parsePhase.value = 'parsing'
  try {
    const confirmation = await confirmResumeCandidate(taskId)
    if (!confirmation.success || !confirmation.data?.profile_ready || confirmation.data.resource_id !== resumeCandidate.value?.student_id) {
      throw new Error(confirmation.error || '简历确认未能从权威档案回读')
    }
    confirmedProfile.value = confirmation.data
    void replayTaskEvents(taskId, true)
    // The resume-scope report is independent from L2 portrait scoring. Start it
    // as soon as the authoritative resume confirmation is complete.
    parsePhase.value = 'verified'
    rightRealView.value = 'report'
    void loadResumeDiagnosticReport(true)
    void generateConfirmedPortrait(false)
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : '确认或画像生成失败'
    parsePhase.value = confirmedProfile.value ? 'verified' : 'confirming'
  }
}

async function loadResumeDiagnosticReport(generate = false) {
  if (!isHttpMode || !confirmedProfile.value?.profile_ready || resumeReportLoading.value) return
  const seq = ++resumeReportRequestSeq
  resumeReportLoading.value = true
  resumeReportError.value = ''
  try {
    if (generate) {
      const generated = await generateResumeDiagnosticReport()
      if (seq !== resumeReportRequestSeq) return
      if (!generated.success || !generated.data) throw new Error(generated.error || '简历诊断报告未返回有效内容')
      resumeDiagnosticReport.value = generated.data
    } else {
      try {
        const latest = await getLatestResumeDiagnosticReport()
        if (seq !== resumeReportRequestSeq) return
        if (latest.success && latest.data) {
          resumeDiagnosticReport.value = latest.data
        } else {
          throw new Error(latest.error || '简历诊断报告尚不可用')
        }
      } catch (error) {
        // A missing current-version report is the only condition that triggers
        // idempotent generation. Other failures remain visible and retryable.
        if (error instanceof ApiError && error.status === 404) {
          const generated = await generateResumeDiagnosticReport()
          if (seq !== resumeReportRequestSeq) return
          if (!generated.success || !generated.data) throw new Error(generated.error || '简历诊断报告未返回有效内容')
          resumeDiagnosticReport.value = generated.data
        } else {
          throw error
        }
      }
    }
    rightRealView.value = showBackendPortrait.value ? rightRealView.value : 'report'
  } catch (error) {
    const body = error instanceof ApiError && error.body && typeof error.body === 'object'
      ? error.body as { status?: string; error?: string; next_action?: string }
      : null
    resumeReportError.value = body?.status === 'stale'
      ? '这份报告对应旧的简历确认版本，请重新读取当前报告。'
      : body?.status === 'needs_input'
        ? '请先完成简历事实确认，再生成诊断报告。'
        : (error instanceof Error ? error.message : '简历诊断报告读取失败')
  } finally {
    if (seq === resumeReportRequestSeq) resumeReportLoading.value = false
  }
}

async function generateConfirmedPortrait(showParsingState = true) {
  if (!confirmedProfile.value?.profile_ready || partialPortrait.value || authoritativePortrait.value) return
  parseError.value = ''
  if (showParsingState) parsePhase.value = 'parsing'
  try {
    const portrait = await runConfirmedStudentPipeline('L2_generate_portrait')
    if (!portrait.success || !portrait.data?.task_id) {
      throw new Error(portrait.error || '画像任务未返回可追踪结果')
    }
    if (portrait.data.status === 'partial') {
      partialPortrait.value = portrait.data
    } else if (portrait.data.status === 'completed' && portrait.data.portrait_id && portrait.data.portrait) {
      authoritativePortrait.value = portrait.data
    } else {
      throw new Error('画像未形成可核验的成果')
    }
    rightRealView.value = 'portrait'
    void replayTaskEvents(portrait.data.task_id, true)
  } catch (e) {
    const body = e instanceof ApiError && e.body && typeof e.body === 'object'
      ? e.body as { status?: string; data?: ConfirmedPipelineResult; error?: string }
      : null
    if (e instanceof ApiError && e.status === 501 && body?.status === 'partial' && body.data?.task_id) {
      partialPortrait.value = body.data
      rightRealView.value = 'portrait'
      void replayTaskEvents(body.data.task_id, true)
    } else {
      parseError.value = e instanceof Error ? e.message : '画像分析失败，请稍后重试'
    }
  } finally {
    if (showParsingState) parsePhase.value = 'verified'
  }
}

function goBack() {
  router.push({ name: 'student-career' })
}

function resetPage() {
  stopEventPoll()
  eventTaskId = ''
  eventCursor = 0
  taskEvents.value = []
  taskSnapshot.value = null
  eventError.value = ''
  candidateLoadSeq += 1
  parsePhase.value = 'idle'
  if (route.query.task_id) void router.replace({ query: { ...route.query, task_id: undefined } })
  resumeCandidate.value = null
  confirmedProfile.value = null
  authoritativePortrait.value = null
  partialPortrait.value = null
  resumeDiagnosticReport.value = null
  resumeReportRequestSeq += 1
  resumeReportLoading.value = false
  resumeReportError.value = ''
  rightRealView.value = 'portrait'
  isImmersiveLayout.value = false
  dashboardBaselineWidth.value = 0
  pasteText.value = ''
  uploadedFileName.value = ''
  uploadedFile.value = null
  parseError.value = ''
  matchExplain.value = null
  hybridNote.value = ''
  resumeStore.reset()
  resetPortraitSession()
  clearRightLayoutTimers()
  rightLayoutMode.value = 'idle'
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function toggleImmersiveLayout() {
  if (!showLayoutToggle.value) return
  isImmersiveLayout.value = !isImmersiveLayout.value
}

/* ═══ 占位：roadmapMap 保留供 Step 3（career-path）使用 ═══
type Stage = { id: string; level: number; name: string; alias: string; years: string; salary: string; salaryNum: [number,number]; icon: string; skills: string[]; milestones: string[]; status: 'completed'|'current'|'locked' }
═══════════════════════════════════════════════════════════ */

onMounted(async () => {
  await nextTick()
  setupEntrance()
  setupDashboardPaneObserver()
  if (resumeStore.draftText) {
    pasteText.value = resumeStore.draftText
    resumeStore.clearDraftText()
  }
})

onBeforeUnmount(() => {
  stopEventPoll()
  gsapCtx?.revert()
  dashboardPaneObserver?.disconnect()
  clearRightLayoutTimers()
})

/* ═══ 注释保留（Step 3 用）: roadmapMap 原有数据已移除，如需恢复请查看 Git 历史 ═══ */

/* ═══ 星图交互数据 ═══ */
const showDashboard = computed(() => !isHttpMode && parsePhase.value !== 'idle')
const showEmbeddedPortrait = computed(() => !isHttpMode && parsePhase.value !== 'idle' && resumeStore.isParsed)
const showIdlePreview = computed(() => isHttpMode ? !showBackendWorkspace.value : parsePhase.value === 'idle')
const isRightPanelActive = computed(() => showBackendWorkspace.value || (!isHttpMode && parsePhase.value !== 'idle'))
const showLayoutToggle = computed(() => showBackendWorkspace.value || (showEmbeddedPortrait.value
  && parsePhase.value === 'done'
  && portraitSessionStatus.value === 'completed'
  && rightLayoutMode.value === 'full'))
const layoutToggleLabel = computed(() => showBackendWorkspace.value
  ? (isImmersiveLayout.value ? '查看解析过程' : '展开全屏画像')
  : (isImmersiveLayout.value ? '恢复默认布局' : '展开沉浸布局'))
const rightShellStyle = computed(() => ({
  '--rp-immersive-dashboard-width': `${dashboardBaselineWidth.value > 0 ? Math.round(dashboardBaselineWidth.value) : 260}px`,
}))
</script>

<template>
  <div class="rp-page" ref="pageRef">

    <!-- HEADER -->
    <header class="rp-header">
      <div class="rp-header__left">
        <button class="rp-back" @click="goBack"><Icon icon="lucide:arrow-left" :width="14"/><span>返回</span></button>
        <span class="rp-brand-name">职途导航</span>
      </div>
      <div class="rp-header__center"><div class="rp-header-tag">{{ showBackendPortrait ? '个人能力画像' : '简历导入' }}</div></div>
      <div class="rp-header__right">
        <UserInfoBar />
      </div>
    </header>

    <!-- WORKSPACE -->
    <div class="rp-workspace" :class="{ 'rp-workspace--immersive': isImmersiveLayout }">

      <!-- LEFT: Editorial + Upload -->
      <div class="rp-left">

        <!-- Editorial headline -->
        <div v-if="parsePhase === 'idle'" class="rp-editorial">
          <span class="rp-greeting">
            {{ (() => { const h = new Date().getHours(); return h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好' })() }}，{{ userStore.currentUser?.name || '同学' }}
          </span>
          <h1 v-if="isHttpMode" class="rp-display-title">
            <span class="rp-dt-a">先核对真实经历</span>
            <span class="rp-dt-b">再看见能力证据</span>
            <span class="rp-dt-c">让职业判断有据可依</span>
          </h1>
          <h1 v-else class="rp-display-title">
            <span class="rp-dt-a">找到你</span>
            <span class="rp-dt-b">在职场宇宙中</span>
            <span class="rp-dt-c">的坐标</span>
          </h1>
          <p v-if="isHttpMode" class="rp-data-proof">
            <span>从真实简历出发</span><em class="rp-sep">·</em>
            <span>逐页核对证据</span><em class="rp-sep">·</em>
            <span>确认后再评估</span>
          </p>
          <p v-else class="rp-data-proof">
            <span>近万条真实岗位</span><em class="rp-sep">·</em>
            <span>全行业覆盖</span><em class="rp-sep">·</em>
            <span>全国各省市</span>
          </p>
        </div>
        <div v-else class="rp-stage-intro">
          <span class="rp-stage-intro__eyebrow">{{ isHttpMode ? '职途导航 · 真实资料' : '职途导航 · 演示样例' }}</span>
          <h1>{{ isHttpMode ? (parsePhase === 'verified' ? '从简历走向能力画像' : '先看清简历里有什么') : '看看样例能力画像' }}</h1>
          <p>{{ isHttpMode ? '每一步都以已上传资料和服务端记录为准，未确认的事实不会变成正式分数。' : '这是固定样例的交互演示，不代表对刚才输入的简历完成了真实解析或评分。' }}</p>
        </div>

        <!-- Step indicator (compact inline) -->
        <div class="rp-steps-inline-row">
        <div class="rp-steps-inline">
          <div class="rp-si-step" :class="{ 'rp-si-step--active': parsePhase !== 'verified' }">
            <span class="rp-si-dot"></span>
            <span class="rp-si-num">01</span>
            <span class="rp-si-name">简历导入</span>
          </div>
          <span class="rp-si-line"></span>
          <div class="rp-si-step" :class="{ 'rp-si-step--active': parsePhase === 'verified' }">
            <span class="rp-si-dot"></span>
            <span class="rp-si-num">02</span>
            <span class="rp-si-name">能力画像</span>
          </div>
          <span class="rp-si-line"></span>
          <div class="rp-si-step">
            <span class="rp-si-dot"></span>
            <span class="rp-si-num">03</span>
            <span class="rp-si-name">{{ isHttpMode ? '岗位方向' : '职业路径' }}</span>
          </div>
        </div>
        <!-- 没有简历提示入口 -->
        <div v-if="parsePhase === 'idle'" class="rp-no-resume-hint" @click="router.push({ name: 'student-resume-builder' })">
          <Icon icon="lucide:help-circle" :width="13" class="rp-no-resume-hint__icon"/>
          <span>没有简历</span>
          <div class="rp-no-resume-hint__tip">没有简历？点击快速制作简历吧！</div>
        </div>
        </div><!-- /.rp-steps-inline-row -->

        <!-- IDLE 态 -->
        <div v-if="parsePhase === 'idle'" class="rp-idle-form">
          <div
            class="rp-drop-zone"
            :class="{ 'rp-drop-zone--over': isDragOver }"
            @dragover.prevent="isDragOver = true"
            @dragleave.prevent="isDragOver = false"
            @drop.prevent="onDrop"
            @click="triggerFileInput"
          >
            <input ref="fileInputRef" type="file" :accept="ACCEPTED_MIME" class="rp-file-input" @change="onFileChange" />
            <div class="rp-drop-corner rp-drop-corner--tl"></div>
            <div class="rp-drop-corner rp-drop-corner--tr"></div>
            <div class="rp-drop-corner rp-drop-corner--bl"></div>
            <div class="rp-drop-corner rp-drop-corner--br"></div>
            <div class="rp-drop-body">
              <div class="rp-drop-icon-wrap">
                <Icon icon="lucide:file-up" :width="20" class="rp-drop-icon" />
              </div>
              <p class="rp-drop-title">{{ uploadedFileName || '拖入简历文件' }}</p>
              <p class="rp-drop-formats">docx &nbsp;·&nbsp; pdf &nbsp;·&nbsp; txt &nbsp;·&nbsp; 图片</p>
            </div>
          </div>

          <div v-if="!isHttpMode" class="rp-or-row">
            <span class="rp-or-line"></span>
            <span class="rp-or-text">或粘贴文字</span>
            <span class="rp-or-line"></span>
          </div>

          <textarea
            v-if="!isHttpMode"
            class="rp-textarea"
            v-model="pasteText"
            placeholder="粘贴简历内容：工作经历、掌握技能、项目描述…"
            rows="3"
          />

          <!-- 方向预选 tiles (5 领域折叠卡片) -->
          <div v-if="!isHttpMode" class="rp-dir-section">
            <p class="rp-dir-label">
              {{ selectedDirection ? '已选方向' : '偏好方向' }}
              <span v-if="!selectedDirection" class="rp-dir-hint">（可选，辅助分析）</span>
            </p>
            <div class="rp-dir-domains">
              <div
                v-for="(domain, di) in CAREER_DOMAINS"
                :key="domain.id"
                v-show="!selectedDirection || selectedDirection === domain.role"
                class="rp-dir-domain"
                :class="{ 'rp-dir-domain--active': selectedDirection === domain.role }"
                @click="selectedDirection = selectedDirection === domain.role ? '' : domain.role"
              >
                <div class="rp-dir-domain__head">
                  <span class="rp-dir-domain__dot" :style="{ background: domain.color }"></span>
                  <Icon :icon="(['lucide:monitor','lucide:server','lucide:bug','lucide:bar-chart-2','lucide:cpu'])[di] || 'lucide:briefcase'" :width="13" class="rp-dir-domain__icon" />
                  <span class="rp-dir-domain__name">{{ domain.name }}</span>
                  <Icon icon="lucide:chevron-down" :width="11" class="rp-dir-domain__chevron" />
                </div>
                <Transition name="rp-dir-expand">
                  <div v-if="selectedDirection === domain.role" class="rp-dir-domain__jobs">
                    <span v-for="job in domain.jobs" :key="job" class="rp-dir-job">{{ job }}</span>
                    <button class="rp-dir-change-btn" @click.stop="selectedDirection = ''">
                      <Icon icon="lucide:repeat-2" :width="10"/>
                      切换方向
                    </button>
                  </div>
                </Transition>
              </div>
            </div>
          </div>

          <p v-if="parseError" class="rp-parse-error">{{ parseError }}</p>
          <p v-if="isHttpMode" class="rp-real-note">当前真实流程只接收文件上传；粘贴文本和预选方向尚未进入确认管线。上传后逐页核对，再尝试生成有证据的画像。</p>
          <p v-else class="rp-real-note rp-demo-note">纯演示使用固定样例画像；上传或粘贴内容仅用于触发演示，不会被真实解析。</p>
          <button class="rp-parse-btn" :disabled="isHttpMode ? !uploadedFile : (!pasteText.trim() && !uploadedFile)" @click="startParse">
            <span>{{ isHttpMode ? '解析并核对简历' : '查看演示能力画像' }}</span>
            <Icon icon="lucide:arrow-right" :width="15" class="rp-parse-btn__arrow" />
          </button>
        </div>

        <!-- PARSING 态 -->
        <div v-else-if="parsePhase === 'parsing'" class="rp-loading-wrap">
            <div class="rp-loading-seal">
              <Icon icon="lucide:loader-circle" :width="34" class="rp-loading-spin" />
            </div>
            <p class="rp-loading-msg">{{ isHttpMode ? '服务端正在处理；此处不显示模拟百分比' : parseMsg }}</p>
            <div v-if="!isHttpMode" class="rp-progress-area">
              <div class="rp-progress-track">
                <div class="rp-progress-fill" :style="{ width: parseProgress + '%' }"></div>
              </div>
              <div class="rp-progress-meta">
                <span class="rp-progress-pct">{{ Math.round(parseProgress) }}%</span>
                <span class="rp-progress-steps">{{ currentStep }} / {{ totalSteps }} 步</span>
              </div>
            </div>
        </div>

        <!-- 真实后端返回的候选与证据；用户确认前不宣称画像完成。 -->
        <div v-else-if="parsePhase === 'confirming' || parsePhase === 'needs_repair'" class="rp-confirm-wrap">
          <span class="rp-result-kicker">01 · 简历识别</span>
          <h3>{{ parsePhase === 'confirming' ? '请核对提取出的资料' : '这份简历还需要补充' }}</h3>
          <p v-if="evidencePageCount" class="rp-result-lead">已取得 {{ observedPageCount }} / {{ evidencePageCount }} 页的文字证据。识别出文字不等于内容逐字无误，请结合原件核对。</p>
          <p v-else class="rp-result-lead">已取得简历候选；当前文件的总页数尚未核验，请对照原件检查。</p>
          <p v-if="resumeCandidate?.source_evidence?.missing_pages?.length" class="rp-evidence-warning">第 {{ resumeCandidate.source_evidence.missing_pages.join('、') }} 页暂无可核对文字。此时不会按完整简历确认，建议重新上传清晰文件。</p>
          <p v-if="resumeCandidate?.structure_validation?.issues?.length" class="rp-evidence-warning">部分关键资料尚未被结构化识别；请查看下方提取内容并对照原件。若原件中已有对应信息，仍需重新解析或修复识别，不能直接当作缺少经历。</p>
          <details class="rp-candidate-review" open>
            <summary>核对已提取字段（{{ candidateFields.length }} 项）</summary>
            <dl class="rp-candidate-fields">
              <template v-for="([key, value]) in candidateFields" :key="key">
                <dt>{{ candidateLabel(key) }}</dt>
                <dd v-if="Array.isArray(value)">
                  <span v-if="!value.length">未提取</span>
                  <ol v-else><li v-for="(item, index) in value" :key="index">{{ displayCandidateValue(item) }}</li></ol>
                </dd>
                <dd v-else>{{ displayCandidateValue(value) }}</dd>
              </template>
            </dl>
          </details>
          <details v-if="resumeCandidate?.source_evidence?.blocks?.length" class="rp-evidence-blocks">
            <summary>对照逐页原文（{{ resumeCandidate.source_evidence.blocks.length }} 段）</summary>
            <article v-for="block in resumeCandidate.source_evidence.blocks" :key="block.block_id">
              <strong>第 {{ block.page }} 页 · {{ block.block_type }}</strong>
              <p>{{ block.text }}</p>
            </article>
          </details>
          <p v-if="parseError" class="rp-parse-error">{{ parseError }}</p>
          <button v-if="parsePhase === 'confirming' && !resumeCandidate?.source_evidence?.missing_pages?.length" class="rp-parse-btn" @click="confirmParsedResume">资料无误，确认并尝试生成画像</button>
          <button v-if="isHttpMode && resumeCandidate?.task_id" class="rp-result-reset" @click="handoffTaskToAgent(resumeCandidate.task_id)">带这份简历去 AI 助手讨论</button>
          <button class="rp-result-reset" @click="resetPage">重新上传</button>
        </div>

        <div v-else-if="parsePhase === 'verified'" class="rp-confirm-wrap">
          <span class="rp-result-kicker">02 · 能力画像</span>
          <h3>{{ authoritativePortrait ? '画像已保存' : partialPortrait ? '画像候选已生成' : '简历已确认' }}</h3>
          <p v-if="partialPortrait" class="rp-result-lead">已有 {{ portraitScoreCount }} / 4 个维度形成候选分数；另有 {{ missingFactLabels.length }} 项依据待核对。画像仍为候选，不生成总分或岗位匹配分；简历诊断报告会独立整理已确认资料。</p>
          <p v-else-if="!authoritativePortrait" class="rp-result-lead">简历事实已经确认。即使能力画像仍需补充，简历范围内的诊断报告也会继续生成；岗位匹配与市场结论需要可信岗位来源后另行展示。</p>
          <p v-if="authoritativePortrait" class="rp-result-lead">能力画像已写入服务端，正在右侧全屏展示。</p>
          <div v-if="confirmedProfile?.profile_ready" class="rp-report-progress">
            <div class="rp-report-progress__head">
              <span class="rp-result-kicker">简历诊断报告</span>
              <span class="rp-report-progress__state" :class="{
                'rp-report-progress__state--done': resumeDiagnosticReport?.status === 'completed',
                'rp-report-progress__state--partial': resumeDiagnosticReport?.status === 'partial' || resumeReportError,
              }">
                <Icon :icon="resumeReportLoading ? 'lucide:loader-circle' : resumeDiagnosticReport?.status === 'completed' ? 'lucide:circle-check' : resumeDiagnosticReport?.status === 'partial' ? 'lucide:circle-alert' : resumeReportError ? 'lucide:triangle-alert' : 'lucide:clock-3'" :width="13" />
                {{ resumeReportLoading ? '正在生成' : resumeDiagnosticReport?.status === 'completed' ? '简历章节已完成' : resumeDiagnosticReport?.status === 'partial' ? '部分章节待补充' : resumeReportError ? '暂时不可用' : '等待报告' }}
              </span>
            </div>
            <p>报告仅使用已确认简历及其证据，不依赖岗位匹配分；实体候选如果尚未归一化，会明确保留为待核验状态。</p>
            <p v-if="resumeReportError" class="rp-report-progress__error">{{ resumeReportError }}</p>
            <div class="rp-report-progress__actions">
              <button type="button" :disabled="resumeReportLoading" @click="rightRealView = 'report'; isImmersiveLayout = true; loadResumeDiagnosticReport(!resumeDiagnosticReport)">
                <Icon icon="lucide:file-text" :width="13" />{{ resumeDiagnosticReport ? '查看完整简历报告' : '生成简历诊断报告' }}
              </button>
              <button v-if="resumeDiagnosticReport?.report_id" type="button" @click="handoffResumeReportToAgent(resumeDiagnosticReport.report_id)">
                <Icon icon="lucide:message-circle" :width="13" />带这份报告去 AI 助手讨论
              </button>
              <button v-if="resumeReportError" type="button" :disabled="resumeReportLoading" @click="loadResumeDiagnosticReport(true)">重试</button>
            </div>
          </div>
          <button v-if="showBackendPortrait && !isImmersiveLayout" class="rp-parse-btn" @click="isImmersiveLayout = true">查看全屏能力画像</button>
          <details v-if="missingFactLabels.length" class="rp-missing-facts">
            <summary>查看尚需核对的依据 <span>{{ missingFactLabels.length }} 项</span></summary>
            <ul><li v-for="label in missingFactLabels" :key="label">{{ label }}</li></ul>
            <p>缺少可引用证据不等于没有这些能力。请对照原件补充有依据的经历；本页暂不能直接修改已确认事实。</p>
          </details>
          <p v-if="parseError" class="rp-parse-error">{{ parseError }}</p>
          <button v-if="confirmedProfile?.profile_ready && !partialPortrait && !authoritativePortrait" class="rp-parse-btn" @click="() => generateConfirmedPortrait()">尝试生成有证据的画像</button>
          <button v-if="isHttpMode && (partialPortrait?.task_id || authoritativePortrait?.task_id || confirmedProfile?.task_id)" class="rp-result-reset" @click="handoffTaskToAgent((partialPortrait?.task_id || authoritativePortrait?.task_id || confirmedProfile?.task_id)!)">带这份资料去 AI 助手讨论</button>
          <p class="rp-result-next">需要更正原简历？重新上传后再次核对。AI 助手可讨论差距，但目前不能替你完成事实确认。</p>
          <button class="rp-result-reset" @click="resetPage">重新上传</button>
        </div>

        <!-- DONE 态 -->
        <div v-else class="rp-done-wrap">
          <div class="rp-done-status">
            <Icon icon="lucide:circle-check-big" :width="16" class="rp-done-icon" />
            <span>解析完成，查看右侧结果</span>
            <button class="rp-result-reset" @click="resetPage">
              <Icon icon="lucide:rotate-ccw" :width="12" />重新上传
            </button>
          </div>
          <div class="rp-privacy">
            <Icon icon="lucide:shield-check" :width="12" class="rp-privacy__icon" />
            <p class="rp-privacy__text">{{ isHttpMode ? '简历已上传至后端并按账号处理' : '演示数据在本地处理' }}</p>
          </div>
        </div>

        <details v-if="isHttpMode && (taskSnapshot || eventError)" class="rp-task-details" aria-label="技术任务记录">
          <summary>技术任务记录 <span>供排查使用</span></summary>
          <p v-if="taskSnapshot">{{ taskSnapshot.pipeline }} · {{ taskSnapshot.task_id }} · {{ taskSnapshot.status }}</p>
          <p v-if="eventError">事件暂不可读取：{{ eventError }}；页面不推测进度。</p>
          <ol v-if="taskEvents.length">
            <li v-for="event in taskEvents" :key="event.event_id">{{ event.occurred_at }} · {{ event.status }}</li>
          </ol>
          <p v-else-if="taskSnapshot">当前任务没有可回放事件；状态来自服务端记录。</p>
        </details>

      </div>

      <!-- RIGHT: Star Map -->
      <div class="rp-right" :class="{ 'rp-right--active': isRightPanelActive }">
        <CareerNavigationIdlePreview
          class="rp-right-idle-preview"
          :class="{ 'rp-right-idle-preview--visible': showIdlePreview }"
          :aria-hidden="!showIdlePreview"
        />
        <div
          class="rp-right-shell"
          :class="['rp-right-shell--' + rightLayoutMode, { 'rp-right-shell--immersive': isImmersiveLayout, 'rp-right-shell--real': showBackendWorkspace }]"
          :style="rightShellStyle"
        >
          <div class="rp-right-portrait-pane">
            <button
              v-if="showLayoutToggle"
              type="button"
              class="rp-layout-toggle"
              :class="{ 'rp-layout-toggle--active': isImmersiveLayout }"
              :aria-label="layoutToggleLabel"
              :aria-pressed="isImmersiveLayout"
              @click="toggleImmersiveLayout"
            >
              <Icon :icon="isImmersiveLayout ? 'lucide:minimize-2' : 'lucide:maximize-2'" :width="14" />
              <span>{{ layoutToggleLabel }}</span>
            </button>
            <nav v-if="showBackendWorkspace" class="rp-real-view-tabs" aria-label="真实成果视图">
              <button type="button" :class="{ 'rp-real-view-tab--active': rightRealView === 'portrait' }"
                :disabled="!realPortraitData" @click="rightRealView = 'portrait'">
                <Icon icon="lucide:orbit" :width="13" />能力画像
              </button>
              <button type="button" :class="{ 'rp-real-view-tab--active': rightRealView === 'report' }"
                @click="rightRealView = 'report'">
                <Icon icon="lucide:file-text" :width="13" />简历诊断报告
              </button>
            </nav>
            <TalentPortrait
              v-if="showEmbeddedPortrait"
              embedded
              class="rp-right-portrait"
              :replay-snapshots="replaySnapshots"
              :result-data="portraitSessionResult"
              :session-status="portraitSessionStatus"
            />
            <TalentPortrait
              v-if="showBackendWorkspace && rightRealView === 'portrait' && realPortraitData"
              embedded
              class="rp-right-portrait"
              :real-portrait="realPortraitData"
            />
            <div v-else-if="showBackendWorkspace && rightRealView === 'portrait'" class="rp-portrait-pending">
              <Icon icon="lucide:chart-no-axes-combined" :width="24" />
              <strong>{{ partialPortrait ? '能力画像仍有依据待补充' : '能力画像尚未生成' }}</strong>
              <p>简历诊断报告可以先查看；能力画像只在服务端形成可核验结果后显示。</p>
              <button v-if="confirmedProfile?.profile_ready && !partialPortrait && !authoritativePortrait" type="button" @click="() => generateConfirmedPortrait()">重试生成画像</button>
            </div>
            <ResumeDiagnosticReport
              v-else-if="showBackendWorkspace && rightRealView === 'report'"
              class="rp-right-portrait"
              :report="resumeDiagnosticReport"
              :loading="resumeReportLoading"
              :error="resumeReportError"
              @refresh-jobs="loadResumeDiagnosticReport(false)"
              @upgrade-report="loadResumeDiagnosticReport(true)"
            />
          </div>
          <div class="rp-right-dashboard-pane" ref="dashboardPaneRef">
            <CareerAgentDashboard
              v-if="showDashboard"
              class="rp-right-dashboard"
              :status="portraitSessionStatus"
              :current-phase="portraitCurrentPhase"
              :trace-events="traceEvents"
              :progress="sessionProgress"
              :current-label="sessionCurrentLabel"
              :current-step="currentStep"
              :total-steps="totalSteps"
            />
            <aside v-if="matchExplain" class="rp-match-explain" aria-label="匹配解释">
              <h3 class="rp-match-explain__title">匹配解释（分数只读）</h3>
              <p class="rp-match-explain__score">
                总分 {{ matchExplain.total_score ?? '—' }}
                · 覆盖率 {{ matchExplain.skill_coverage ?? '—' }}
                <span v-if="matchExplain.scores_authoritative">· 权威分</span>
              </p>
              <p v-if="matchExplain.keyword_coverage?.highlight_missing?.length" class="rp-match-explain__gap">
                缺失技能：{{ matchExplain.keyword_coverage.highlight_missing.join('、') }}
              </p>
              <ul v-if="matchExplain.related_courses?.length" class="rp-match-explain__courses">
                <li v-for="(c, i) in matchExplain.related_courses.slice(0, 4)" :key="i">
                  {{ c.title || c.course_id }} <span v-if="c.skill">({{ c.skill }})</span>
                </li>
              </ul>
              <p v-if="hybridNote" class="rp-match-explain__note">{{ hybridNote }}</p>
            </aside>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rp-real-note,
.rp-confirm-wrap {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-muted);
}
.rp-real-note { margin: 10px 0; }
.rp-confirm-wrap { display: grid; gap: 12px; padding: 18px 4px; }
.rp-confirm-wrap h3 { margin: 0; color: var(--color-text); font-size: 17px; }
.rp-confirm-wrap p { margin: 0; overflow-wrap: anywhere; }
.rp-report-progress { display: grid; gap: 8px; margin: 4px 0; padding: 13px 14px; border: 1px solid color-mix(in srgb, var(--color-primary-dark, #8B1A00) 17%, var(--color-border) 83%); background: color-mix(in srgb, var(--color-primary-dark, #8B1A00) 3%, #fff 97%); }
.rp-report-progress__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.rp-report-progress__state { display: inline-flex; align-items: center; gap: 5px; color: #776d60; font-size: 11px; white-space: nowrap; }
.rp-report-progress__state--done { color: #486546; }
.rp-report-progress__state--partial { color: #a33f24; }
.rp-report-progress__state svg { animation: rp-report-spin .9s linear infinite; }
.rp-report-progress__state--done svg,.rp-report-progress__state--partial svg { animation: none; }
.rp-report-progress p { color: var(--color-text-muted); font-size: 11px; line-height: 1.6; }
.rp-report-progress__error { color: #a33f24 !important; }
.rp-report-progress__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.rp-report-progress__actions button { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px; border: 1px solid var(--color-border); background: #fff; color: var(--color-text); font: inherit; font-size: 11px; cursor: pointer; }
.rp-report-progress__actions button:first-child { border-color: color-mix(in srgb, var(--color-primary-dark, #8B1A00) 40%, var(--color-border) 60%); color: var(--color-primary-dark, #8B1A00); }
.rp-report-progress__actions button:disabled { opacity: .55; cursor: wait; }
@keyframes rp-report-spin { to { transform: rotate(360deg); } }
.rp-stage-intro {
  padding: 4px 0 10px;
  border-bottom: 1px solid var(--color-border);
}
.rp-stage-intro__eyebrow,
.rp-result-kicker {
  color: var(--color-primary-dark, #8B1A00);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
}
.rp-stage-intro h1 {
  margin: 3px 0 2px;
  color: var(--color-text);
  font-size: 20px;
  line-height: 1.35;
}
.rp-stage-intro p,
.rp-result-lead,
.rp-result-next { color: var(--color-text-muted); font-size: 12px; line-height: 1.65; }
.rp-evidence-warning {
  padding: 10px 12px;
  border-left: 3px solid var(--color-primary-dark, #8B1A00);
  background: color-mix(in srgb, var(--color-primary-dark, #8B1A00) 6%, white 94%);
  color: var(--color-text);
}
.rp-candidate-review,
.rp-task-details {
  border: 1px solid var(--color-border);
  background: #fff;
  padding: 10px 12px;
  min-width: 0;
}
.rp-candidate-review summary,
.rp-task-details summary { cursor: pointer; color: var(--color-text); font-weight: 650; }
.rp-task-details { margin-top: 8px; color: var(--color-text-muted); font-size: 11px; line-height: 1.5; }
.rp-task-details summary span { color: var(--color-text-subtle); font-weight: 400; }
.rp-task-details p { overflow-wrap: anywhere; }
.rp-task-details ol { padding-left: 22px; }
.rp-candidate-review .rp-candidate-fields { margin-top: 10px; }
.rp-candidate-fields { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 8px; margin: 0; }
.rp-candidate-fields dt { font-weight: 600; color: var(--color-text); overflow-wrap: anywhere; }
.rp-candidate-fields dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.rp-candidate-fields ol { margin: 0; padding-left: 18px; }
.rp-candidate-fields li + li { margin-top: 5px; }
.rp-evidence-blocks { max-height: 320px; overflow: auto; }
.rp-evidence-blocks article { border-top: 1px solid var(--color-border); padding: 10px 0; }
.rp-evidence-blocks article p { white-space: pre-wrap; }
.rp-missing-facts {
  padding: 12px 14px;
  background: white;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.rp-missing-facts summary { cursor: pointer; font-weight: 650; }
.rp-missing-facts summary span { float: right; color: var(--color-primary-dark, #8B1A00); font-size: 11px; }
.rp-missing-facts ul { margin: 7px 0 0; padding-left: 18px; }
.rp-missing-facts li + li { margin-top: 3px; }
.rp-match-explain {
  margin-top: 12px;
  padding: 12px 14px;
  border: 1px solid var(--parchment-400, #CBCBC8);
  background: var(--parchment-200, #EDEDEB);
  font-size: 13px;
  line-height: 1.45;
}
.rp-match-explain__title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.rp-match-explain__score,
.rp-match-explain__gap,
.rp-match-explain__note {
  margin: 4px 0;
  color: var(--parchment-700, #555);
}
.rp-match-explain__courses {
  margin: 6px 0 0;
  padding-left: 1.1em;
}
/* ── CSS vars ── */
:root {
  --rp-bg: var(--parchment-100, #F5F5F3);
  --rp-panel: var(--parchment-200, #EDEDEB);
  --rp-border: var(--parchment-400, #CBCBC8);
  --rp-muted: var(--parchment-500, #ABABAB);
  --rp-red: var(--color-primary-dark, #8B1A00);
  --rp-gold: var(--color-gold-dark, #8B6A00);
  --rp-text: var(--color-text, #111);
  --rp-sub: var(--color-text-muted, #666);
  --rp-hint: var(--color-text-subtle, #999);
  --rp-dark: #111111;
  --rp-dark2: #0D0D0D;
}

/* ── Page container ── */
.rp-page {
  position: relative;
  width: 100%;
  height: 100vh;
  max-height: 100vh;
  background: var(--rp-bg);
  display: flex;
  flex-direction: column;
  font-family: var(--font-title, 'LXGW WenKai', sans-serif);
  overflow: hidden;
}
.rp-page::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image: radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0);
  background-size: 4px 4px;
}

/* ═══ HEADER ═══ */
.rp-header {
  position: relative;
  z-index: 10;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 28px;
  height: 48px;
  min-height: 48px;
  background: var(--rp-panel);
  border-bottom: 1px solid var(--rp-border);
  flex-shrink: 0;
}
.rp-header__left { display: flex; align-items: center; gap: 14px; }
.rp-header__center { display: flex; justify-content: center; }
.rp-header__right {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  --uib-icon-color: var(--rp-sub);
  --uib-icon-hover: var(--rp-text);
  --uib-avatar-bg: color-mix(in srgb, var(--rp-red) 18%, var(--rp-panel) 82%);
  --uib-avatar-color: var(--rp-red);
  --uib-name-color: var(--rp-text);
  --uib-role-color: var(--rp-sub);
}

.rp-back {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px; border: 1px solid var(--rp-border);
  background: transparent; color: var(--rp-sub);
  font-size: 12px; font-family: inherit; cursor: pointer;
  transition: all 0.3s ease; letter-spacing: 0.02em;
}
.rp-back:hover { border-color: var(--rp-red); color: var(--rp-red); }

.rp-brand-name { font-size: 13px; font-weight: 600; color: var(--rp-text); letter-spacing: 0.06em; }

.rp-header-tag {
  font-size: 16px; font-weight: 600; letter-spacing: 0.04em;
  color: var(--rp-text);
}


/* ═══ WORKSPACE ═══ */
.rp-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 480px) minmax(0, 1fr);
  position: relative;
  z-index: 1;
  overflow: hidden;
  transition: grid-template-columns 0.48s cubic-bezier(0.4, 0, 0.2, 1), grid-template-rows 0.48s cubic-bezier(0.4, 0, 0.2, 1);
}

.rp-workspace--immersive {
  grid-template-columns: 0 minmax(0, 1fr);
}


/* ═══ LEFT PANEL ═══ */
.rp-left {
  padding: 24px 36px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  border-right: 1px solid var(--rp-border);
  background: var(--rp-bg);
  position: relative;
  z-index: 1;
  transition:
    opacity 0.32s ease,
    transform 0.48s cubic-bezier(0.4, 0, 0.2, 1),
    padding 0.48s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.2s ease;
}

.rp-workspace--immersive .rp-left {
  opacity: 0;
  transform: translateX(-24px);
  pointer-events: none;
  overflow: hidden;
  padding: 0;
  border-right-color: transparent;
}

/* Editorial Headline */
.rp-editorial {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--rp-border);
}
.rp-greeting {
  font-size: 11px; letter-spacing: 0.10em;
  color: var(--rp-hint); text-transform: uppercase; font-weight: 600;
}
.rp-display-title {
  display: flex; flex-direction: column; gap: 0; margin: 4px 0 0;
}
.rp-dt-a {
  display: block; font-size: 20px; font-weight: 400;
  color: var(--rp-sub); letter-spacing: 0.04em; line-height: 1.3;
}
.rp-dt-b {
  display: block; font-size: 34px; font-weight: 600;
  color: var(--rp-text); letter-spacing: 0.01em; line-height: 1.1; margin: 1px 0;
}
.rp-dt-c {
  display: block; font-size: 24px; font-weight: 600;
  color: var(--rp-red); letter-spacing: 0.03em; line-height: 1.15;
}
.rp-data-proof {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: var(--rp-hint); margin: 4px 0 0; letter-spacing: 0.02em;
}
.rp-sep { font-style: normal; color: var(--rp-muted); font-size: 10px; }

/* Step indicator row wrapper */
.rp-steps-inline-row {
  display: flex; align-items: center; gap: 12px;
  background: var(--rp-panel); border: 1.5px solid rgba(0,0,0,0.22);
  padding: 8px 14px; transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}
.rp-steps-inline-row:hover { box-shadow: 0 3px 10px rgba(0,0,0,0.08); }

/* 没有简历提示 */
.rp-no-resume-hint {
  position: relative;
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; color: rgba(120,120,120,0.55);
  cursor: pointer; padding: 3px 6px; border-radius: 4px;
  transition: color 0.2s ease, background 0.2s ease;
  white-space: nowrap;
}
.rp-no-resume-hint:hover { color: rgba(160,140,120,0.85); background: color-mix(in srgb, var(--rp-red) 8%, transparent 92%); }
.rp-no-resume-hint__icon { flex-shrink: 0; }
.rp-no-resume-hint__tip {
  position: absolute; bottom: calc(100% + 7px); left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.94); color: rgba(220,220,215,0.9);
  font-size: 11px; white-space: nowrap; padding: 6px 10px;
  border-radius: 5px; border: 1px solid rgba(200,200,200,0.15);
  pointer-events: none; opacity: 0; transition: opacity 0.15s ease;
  z-index: 10;
}
.rp-no-resume-hint__tip::after {
  content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  border: 5px solid transparent; border-top-color: rgba(0,0,0,0.94);
}
.rp-no-resume-hint:hover .rp-no-resume-hint__tip { opacity: 1; }

/* Step indicator (inline compact) */
.rp-steps-inline { display: flex; align-items: center; gap: 8px; }
.rp-si-step { display: flex; align-items: center; gap: 5px; opacity: 0.35; transition: opacity 0.2s ease; }
.rp-si-step--active { opacity: 1; }
.rp-si-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--rp-muted); flex-shrink: 0; transition: background 0.3s ease; }
.rp-si-step--active .rp-si-dot { background: var(--rp-red); }
.rp-si-num { font-size: 10px; font-weight: 600; color: var(--rp-hint); letter-spacing: 0.06em; }
.rp-si-step--active .rp-si-num { color: var(--rp-red); }
.rp-si-name { font-size: 11px; color: var(--rp-sub); letter-spacing: 0.02em; white-space: nowrap; }
.rp-si-step--active .rp-si-name { font-weight: 600; color: var(--rp-text); }
.rp-si-line { flex: 1; max-width: 28px; height: 1px; background: var(--rp-border); }

/* Idle form wrapper (natural height, left panel scrolls) */
.rp-idle-form {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.10);
  border-radius: 4px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.rp-idle-form .rp-textarea {
  flex: none;
  min-height: 72px;
  resize: none;
}

/* Done state wrapper */
.rp-done-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Drop Zone */
.rp-drop-zone {
  position: relative;
  background: var(--rp-panel);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
  user-select: none;
  border: 2px dashed rgba(0,0,0,0.26);
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
}
.rp-drop-zone:hover,
.rp-drop-zone--over {
  background: color-mix(in srgb, var(--rp-red) 4%, var(--rp-panel) 96%);
  border-color: var(--rp-red);
  box-shadow: 0 4px 16px rgba(139,26,0,0.12);
}

.rp-drop-corner {
  position: absolute;
  width: 14px;
  height: 14px;
  pointer-events: none;
  transition: width 0.25s ease, height 0.25s ease, border-color 0.25s ease;
}
.rp-drop-corner--tl { top: 0; left: 0; border-top: 2px solid var(--rp-gold); border-left: 2px solid var(--rp-gold); }
.rp-drop-corner--tr { top: 0; right: 0; border-top: 2px solid var(--rp-gold); border-right: 2px solid var(--rp-gold); }
.rp-drop-corner--bl { bottom: 0; left: 0; border-bottom: 2px solid var(--rp-gold); border-left: 2px solid var(--rp-gold); }
.rp-drop-corner--br { bottom: 0; right: 0; border-bottom: 2px solid var(--rp-gold); border-right: 2px solid var(--rp-gold); }
.rp-drop-zone:hover .rp-drop-corner,
.rp-drop-zone--over .rp-drop-corner { border-color: var(--rp-red); width: 20px; height: 20px; }

.rp-file-input {
  position: absolute; inset: 0; opacity: 0;
  width: 100%; height: 100%; cursor: pointer; z-index: -1;
}

.rp-drop-body { display: flex; flex-direction: column; align-items: center; gap: 5px; z-index: 1; }

.rp-drop-icon-wrap {
  width: 40px; height: 40px; border: 1.5px solid var(--rp-muted);
  display: grid; place-items: center; background: var(--rp-panel);
  margin-bottom: 2px; transition: all 0.25s ease;
}
.rp-drop-zone:hover .rp-drop-icon-wrap,
.rp-drop-zone--over .rp-drop-icon-wrap {
  border-color: var(--rp-red);
  background: color-mix(in srgb, var(--rp-red) 6%, var(--rp-panel) 94%);
}
.rp-drop-icon { color: var(--rp-gold); }

.rp-drop-title {
  font-size: 14px; font-weight: 600; color: var(--rp-text);
  letter-spacing: 0.04em; margin: 0;
  text-align: center; max-width: 240px; word-break: break-all;
}
.rp-drop-formats { font-size: 11px; color: var(--rp-hint); margin: 0; letter-spacing: 0.04em; }

/* Or divider */
.rp-or-row { display: flex; align-items: center; gap: 8px; }
.rp-or-line { flex: 1; height: 1px; background: var(--rp-border); }
.rp-or-text { font-size: 11px; color: var(--rp-hint); letter-spacing: 0.04em; white-space: nowrap; }

/* ── Textarea ── */
.rp-textarea {
  width: 100%; box-sizing: border-box;
  background: var(--rp-panel); border: 1.5px solid rgba(0,0,0,0.20); border-left: 3px solid rgba(0,0,0,0.20);
  padding: 9px 12px; font-size: 12px; color: var(--rp-text);
  font-family: var(--font-body, 'Noto Sans SC', sans-serif);
  line-height: 1.65; resize: none; min-height: 72px; outline: none;
  transition: border-left-color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.rp-textarea:focus { border-left-color: var(--rp-red); border-color: var(--rp-red); box-shadow: 0 2px 10px rgba(139,26,0,0.10); }
.rp-textarea::placeholder { color: var(--rp-muted); }

/* Direction section */
.rp-dir-section { display: flex; flex-direction: column; gap: 7px; }
.rp-dir-label { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; color: var(--rp-sub); text-transform: uppercase; margin: 0; }
.rp-dir-hint { font-weight: 400; color: var(--rp-hint); font-size: 9px; }
/* Domain cards */
.rp-dir-domains { display: flex; flex-direction: column; gap: 5px; }
.rp-dir-domain {
  border: 1.5px solid rgba(0,0,0,0.18); background: var(--rp-panel);
  cursor: pointer; transition: all 0.22s ease; overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}
.rp-dir-domain:hover { border-color: var(--rp-gold); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.rp-dir-domain--active { border-width: 2px; border-color: var(--rp-red); background: color-mix(in srgb, var(--rp-red) 4%, var(--rp-panel) 96%); box-shadow: 0 3px 12px rgba(139,26,0,0.12); }
.rp-dir-domain__head { display: flex; align-items: center; gap: 7px; padding: 8px 11px; min-height: 34px; }
.rp-dir-domain__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.rp-dir-domain__icon { flex-shrink: 0; color: var(--rp-hint); transition: color 0.2s ease; }
.rp-dir-domain--active .rp-dir-domain__icon { color: var(--rp-red); }
.rp-dir-domain__name { flex: 1; font-size: 12px; font-weight: 500; color: var(--rp-sub); letter-spacing: 0.03em; white-space: nowrap; }
.rp-dir-domain--active .rp-dir-domain__name { color: var(--rp-text); font-weight: 600; }
.rp-dir-domain__chevron { flex-shrink: 0; color: var(--rp-hint); transition: transform 0.25s ease, color 0.2s ease; }
.rp-dir-domain--active .rp-dir-domain__chevron { transform: rotate(180deg); color: var(--rp-red); }
.rp-dir-domain__jobs { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 11px 9px 25px; }
.rp-dir-job {
  font-size: 10px; color: var(--rp-sub); letter-spacing: 0.02em; padding: 3px 8px;
  background: color-mix(in srgb, var(--rp-red) 3%, var(--rp-bg) 97%);
  border: 1px solid color-mix(in srgb, var(--rp-red) 12%, var(--rp-border) 88%);
}
.rp-dir-change-btn {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: 3px; padding: 3px 9px;
  background: transparent; border: 1px solid var(--rp-muted);
  color: var(--rp-hint); font-size: 10px; font-family: inherit; letter-spacing: 0.04em;
  cursor: pointer; transition: all 0.2s ease;
}
.rp-dir-change-btn:hover { border-color: var(--rp-red); color: var(--rp-red); }
/* Direction expand transition */
.rp-dir-expand-enter-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.rp-dir-expand-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.rp-dir-expand-enter-from { opacity: 0; transform: translateY(-4px); }
.rp-dir-expand-leave-to { opacity: 0; transform: translateY(-4px); }

/* Parse button */
.rp-parse-error {
  margin: 0 0 10px;
  color: #8b1a00;
  font-size: 12px;
  line-height: 1.5;
}
.rp-parse-btn {
  width: 100%; height: 46px;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  background: var(--rp-red); border: none; color: var(--rp-bg);
  font-size: 14px; font-family: var(--font-title, inherit);
  letter-spacing: 0.1em; cursor: pointer;
  transition: background 0.2s ease, box-shadow 0.2s ease; position: relative; overflow: hidden;
  box-shadow: 0 2px 8px rgba(139,26,0,0.15);
}
.rp-parse-btn::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
  transform: translateX(-100%); transition: transform 0.45s ease;
}
.rp-parse-btn:hover:not(:disabled)::before { transform: translateX(100%); }
.rp-parse-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--rp-red) 80%, #fff 20%); box-shadow: 0 4px 14px rgba(139,26,0,0.22); }
.rp-parse-btn:hover:not(:disabled) .rp-parse-btn__arrow { transform: translateX(4px); }
.rp-parse-btn__arrow { transition: transform 0.2s ease; }
.rp-parse-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Loading ── */
.rp-loading-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 20px 0;
}
.rp-loading-seal {
  width: 60px; height: 60px;
  border: 2px solid color-mix(in srgb, var(--rp-red) 25%, var(--rp-border) 75%);
  display: grid; place-items: center;
  background: color-mix(in srgb, var(--rp-red) 4%, var(--rp-panel) 96%);
}
.rp-loading-spin { color: var(--rp-red); animation: rp-spin 1.2s linear infinite; }
@keyframes rp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.rp-loading-msg { font-size: 13px; color: var(--rp-sub); letter-spacing: 0.03em; margin: 0; }
.rp-progress-area { width: 300px; display: flex; flex-direction: column; gap: 8px; }
.rp-progress-track {
  width: 100%; height: 12px;
  background: rgba(0,0,0,0.14);
  border-radius: 999px;
  overflow: hidden;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.15);
}
.rp-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #D4A017 0%, #C0392B 60%, #8B1A00 100%);
  border-radius: 999px;
  transition: width 0.2s ease;
  box-shadow: 0 2px 10px rgba(192,57,43,0.55);
  position: relative;
  overflow: hidden;
}
.rp-progress-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%);
  animation: rp-shimmer 1.8s ease-in-out infinite;
}
@keyframes rp-shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
.rp-progress-meta { display: flex; justify-content: space-between; align-items: center; }
.rp-progress-pct { font-size: 13px; font-weight: 800; color: var(--rp-red); letter-spacing: 0.04em; }
.rp-progress-steps { font-size: 11px; font-weight: 500; color: var(--rp-sub); letter-spacing: 0.02em; }

/* Done state (left) */
.rp-done-status {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; background: color-mix(in srgb, #5B7744 5%, var(--rp-panel) 95%);
  border: 1px solid color-mix(in srgb, #5B7744 20%, var(--rp-border) 80%);
  font-size: 13px; font-weight: 600; color: var(--rp-text);
}
.rp-done-icon { color: #5B7744; flex-shrink: 0; }
.rp-done-status span { flex: 1; }

.rp-result-reset {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border: 1px solid var(--rp-border);
  background: transparent; color: var(--rp-hint);
  font-size: 11px; font-family: inherit; cursor: pointer;
  transition: all 0.2s ease; letter-spacing: 0.04em;
}
.rp-result-reset:hover { border-color: var(--rp-red); color: var(--rp-red); }

.rp-privacy {
  display: flex; align-items: flex-start; gap: 7px;
  padding: 8px 10px;
  background: color-mix(in srgb, #5B7744 4%, var(--rp-panel) 96%);
  border: 1px solid color-mix(in srgb, #5B7744 15%, var(--rp-border) 85%);
}
.rp-privacy__icon { color: #5B7744; flex-shrink: 0; margin-top: 1px; }
.rp-privacy__text { font-size: 11px; color: var(--rp-sub); line-height: 1.6; margin: 0; }

/* ═══ RIGHT PANEL (light) ═══ */
.rp-left::-webkit-scrollbar { width: 3px; }
.rp-left::-webkit-scrollbar-track { background: transparent; }
.rp-left::-webkit-scrollbar-thumb { background: rgba(139,37,0,0.2); border-radius: 2px; }

.rp-right {
  background-color: var(--parchment-100, #F5F5F3);
  background-size: auto, auto, 200px 150px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  border-left: 1px solid var(--rp-border);
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.rp-right--active {
  background-image:
    radial-gradient(ellipse at 35% 35%, rgba(190,42,0,0.04) 0%, transparent 55%),
    radial-gradient(ellipse at 70% 65%, rgba(27,78,139,0.03) 0%, transparent 50%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150'%3E%3Cpath d='M0 50 C40 20 80 80 120 50 S160 20 200 50' stroke='%23000' stroke-opacity='0.035' fill='none' stroke-width='0.9'/%3E%3Cpath d='M0 80 C40 50 80 110 120 80 S160 50 200 80' stroke='%23000' stroke-opacity='0.035' fill='none' stroke-width='0.9'/%3E%3Cpath d='M0 20 C40 -10 80 50 120 20 S160 -10 200 20' stroke='%23000' stroke-opacity='0.035' fill='none' stroke-width='0.9'/%3E%3Cpath d='M0 110 C40 80 80 140 120 110 S160 80 200 110' stroke='%23000' stroke-opacity='0.025' fill='none' stroke-width='0.9'/%3E%3Cpath d='M0 130 C40 100 80 160 120 130 S160 100 200 130' stroke='%23000' stroke-opacity='0.02' fill='none' stroke-width='0.9'/%3E%3C/svg%3E");
}

.rp-right-idle-preview {
  position: absolute;
  inset: 0;
  z-index: 2;
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  transition: opacity 0.22s ease, transform 0.24s ease;
}

.rp-right-idle-preview :deep(.cnip-surface--radar) {
  align-self: start;
  height: auto;
}

.rp-right-idle-preview--visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.rp-right-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  z-index: 1;
  overflow: hidden;
  --rp-immersive-dashboard-width: 260px;
  --rp-immersive-dashboard-width-current: var(--rp-immersive-dashboard-width);
}

.rp-right-portrait-pane,
.rp-right-dashboard-pane {
  position: relative;
  flex-shrink: 0;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  transition:
    width 0.45s cubic-bezier(0.4, 0, 0.2, 1),
    height 0.45s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.35s ease 0.1s,
    transform 0.45s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.2s ease;
}

.rp-right-portrait-pane {
  width: 0;
  opacity: 0;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--rp-bg) 84%, #ffffff 16%),
    color-mix(in srgb, var(--rp-panel) 42%, var(--rp-bg) 58%)
  );
}

.rp-right-dashboard-pane {
  width: 0;
  opacity: 0;
  transform: translateX(18px);
  background: #111111;
  border-left: 0 solid transparent;
}

.rp-right-shell--split .rp-right-portrait-pane {
  width: 75%;
  opacity: 1;
}

.rp-right-shell--split .rp-right-dashboard-pane {
  width: 25%;
  opacity: 1;
  transform: translateX(0);
  border-left-width: 1px;
  border-left-color: var(--rp-border);
}

.rp-right-shell--collapsing .rp-right-portrait-pane,
.rp-right-shell--full .rp-right-portrait-pane {
  width: 100%;
  opacity: 1;
}

.rp-right-shell--collapsing .rp-right-dashboard-pane,
.rp-right-shell--full .rp-right-dashboard-pane {
  width: 0;
  opacity: 0;
  transform: translateX(22px);
  border-left-width: 0;
  border-left-color: transparent;
}

.rp-right-shell--immersive .rp-right-portrait-pane {
  width: calc(100% - var(--rp-immersive-dashboard-width-current));
  opacity: 1;
}

.rp-right-shell--immersive .rp-right-dashboard-pane {
  width: var(--rp-immersive-dashboard-width-current);
  opacity: 1;
  transform: translateX(0);
  border-left-width: 1px;
  border-left-color: var(--rp-border);
}

/* 真实任务的结果回到原来的画像舞台；全屏时不预留演示 Dashboard 栏。 */
.rp-right-shell--real.rp-right-shell--immersive .rp-right-portrait-pane,
.rp-right-shell--real .rp-right-portrait-pane { width: 100%; height: 100%; opacity: 1; }
.rp-right-shell--real .rp-right-dashboard-pane { display: none; width: 0; }
.rp-right-shell--real .rp-right-portrait :deep(.tp-portrait--real) { padding-top: 66px; }

.rp-right-dashboard,
.rp-right-portrait {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.rp-layout-toggle {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 8;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--rp-border) 82%, #ffffff 18%);
  background: color-mix(in srgb, #ffffff 76%, var(--rp-panel) 24%);
  color: var(--rp-text);
  font-size: 12px;
  font-family: inherit;
  letter-spacing: 0.03em;
  box-shadow: 0 10px 24px rgba(72, 48, 24, 0.12);
  backdrop-filter: blur(10px);
  cursor: pointer;
  transition:
    transform 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;
}

.rp-layout-toggle:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--rp-red) 26%, var(--rp-border) 74%);
  background: color-mix(in srgb, var(--rp-red) 8%, #ffffff 92%);
  color: var(--rp-red);
  box-shadow: 0 14px 28px rgba(139, 26, 0, 0.14);
}

.rp-layout-toggle:active {
  transform: translateY(0);
}

.rp-layout-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--rp-red) 42%, #ffffff 58%);
  outline-offset: 2px;
}

.rp-layout-toggle--active {
  border-color: color-mix(in srgb, var(--rp-red) 28%, var(--rp-border) 72%);
  background: color-mix(in srgb, var(--rp-red) 10%, #ffffff 90%);
  color: var(--rp-red);
}
.rp-real-view-tabs { position: absolute; top: 16px; left: 18px; z-index: 8; display: inline-flex; gap: 3px; padding: 4px; border: 1px solid #ded8cf; background: #ffffffdc; box-shadow: 0 8px 20px #4d392015; backdrop-filter: blur(10px); }
.rp-real-view-tabs button { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 11px; border: 1px solid transparent; background: transparent; color: #77716a; font: inherit; font-size: 11px; cursor: pointer; }
.rp-real-view-tabs button:hover:not(:disabled) { color: #91371f; }
.rp-real-view-tabs button:disabled { opacity: .42; cursor: not-allowed; }
.rp-real-view-tabs .rp-real-view-tab--active { border-color: #e2d2c6; background: #f8f4ef; color: #91371f; }
.rp-portrait-pending { display: grid; align-content: center; justify-items: center; gap: 12px; width: 100%; height: 100%; padding: 72px 24px 24px; background: radial-gradient(ellipse at 50% 44%, #e9e1d7 0%, #f7f5f1 62%, #eee9e2 100%); color: #8a705f; text-align: center; }
.rp-portrait-pending strong { color: #332f29; font: 500 22px/1.3 Georgia, 'Noto Serif SC', serif; }
.rp-portrait-pending p { max-width: 440px; margin: 0; color: #78746e; font-size: 12px; line-height: 1.7; }
.rp-portrait-pending button { margin-top: 5px; padding: 9px 15px; border: 1px solid #caa896; background: #fff; color: #91371f; font: inherit; font-size: 12px; cursor: pointer; }

.rp-orbital-scene {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: hidden;
}

.rp-orbital-field {
  position: relative;
  width: min(100%, calc(100vh - 200px));
  aspect-ratio: 1 / 1;
}

.rp-orbital-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* ── Orbital group animations (Kepler: inner ring = fast, outer = slow) ── */
.rp-domain-group {
  transform-box: view-box;
  transform-origin: 50% 50%;
  transition: opacity 0.35s ease, filter 0.35s ease;
}
.rp-domain-group--0 { animation: rp-orbit  50s linear infinite; }
.rp-domain-group--1 { animation: rp-orbit  65s linear infinite reverse; }
.rp-domain-group--2 { animation: rp-orbit  80s linear infinite; }
.rp-domain-group--3 { animation: rp-orbit  95s linear infinite reverse; }
.rp-domain-group--4 { animation: rp-orbit 120s linear infinite; }
@keyframes rp-orbit { to { transform: rotate(360deg); } }

/* hover: dim other groups, highlight active group */
.rp-domain-group--dimmed { opacity: 0.28; filter: grayscale(0.35); }
.rp-domain-group--lit { filter: brightness(1.06); }
.rp-domain-group--lit .rp-star-node { filter: drop-shadow(0 0 5px currentColor); }

/* ── Center ripple ── */
.rp-ripple {
  fill: none; stroke: var(--rp-red); stroke-width: 1.8;
  animation: rp-ripple 4s ease-out infinite;
  pointer-events: none;
}
.rp-ripple--2 { animation-delay: -2.67s; }
.rp-ripple--3 { animation-delay: -1.33s; }
@keyframes rp-ripple {
  0%   { r: 25; opacity: 0.18; stroke-width: 1.8; }
  100% { r: 120; opacity: 0;   stroke-width: 0.3; }
}

/* ── Energy flow on constellation links ── */
.rp-star-link {
  stroke-dasharray: 6 6;
  stroke-dashoffset: 0;
  animation: rp-energy-flow 3s linear infinite;
  transition: stroke-opacity 0.25s ease;
}
@keyframes rp-energy-flow { to { stroke-dashoffset: -24; } }

/* ── Node breathe pulse ── */
.rp-star-node {
  transform-box: fill-box;
  transform-origin: center;
  animation: rp-breathe 4s ease-in-out infinite;
  transition: stroke-opacity 0.22s ease, stroke-width 0.22s ease, fill 0.22s ease;
}
.rp-star-node:nth-child(3n+1) { animation-delay: 0s; }
.rp-star-node:nth-child(3n+2) { animation-delay: -1.33s; }
.rp-star-node:nth-child(3n)   { animation-delay: -2.67s; }
@keyframes rp-breathe {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.10); filter: drop-shadow(0 0 4px currentColor); }
}
.rp-star-node--active {
  filter: drop-shadow(0 0 5px currentColor);
}

/* ── Label counter-rotation (keeps text horizontal while group orbits) ── */
.rp-star-label {
  font-size: 8.5px;
  font-family: var(--font-body, 'Noto Sans SC', sans-serif);
  letter-spacing: 0.02em;
  pointer-events: none;
  user-select: none;
  transform-box: fill-box;
  transform-origin: center;
  transition: fill 0.22s ease;
}
/* Group 0 rotates CW → label counter-rotates CCW (reverse) */
.rp-star-label--0 { animation: rp-orbit  50s linear infinite reverse; }
.rp-star-label--1 { animation: rp-orbit  65s linear infinite; }
.rp-star-label--2 { animation: rp-orbit  80s linear infinite reverse; }
.rp-star-label--3 { animation: rp-orbit  95s linear infinite; }
.rp-star-label--4 { animation: rp-orbit 120s linear infinite reverse; }

/* Background dot cloud (slightly denser) */
.rp-dots circle { fill: rgba(0,0,0,0.07); }

/* Orbital center */
.rp-orbital-center {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  z-index: 2;
  pointer-events: none;
}
.rp-orbital-avatar {
  width: 50px; height: 50px; border-radius: 50%;
  background: linear-gradient(135deg, #C03418 0%, #7A1E08 100%);
  border: 2px solid rgba(192,52,24,0.45);
  box-shadow: 0 4px 18px rgba(192,52,24,0.22), 0 1px 4px rgba(0,0,0,0.08);
  display: grid; place-items: center;
  font-size: 18px; font-weight: 600; color: #F0EDE8;
  font-family: var(--font-title, 'LXGW WenKai', sans-serif);
}
.rp-oc-name {
  font-size: 10px; font-weight: 600;
  color: var(--ink-700, #3D3D3D); letter-spacing: 0.06em; white-space: nowrap;
}
.rp-oc-status {
  font-size: 9px; letter-spacing: 0.06em;
  color: var(--ink-300, #999999); white-space: nowrap; text-align: center;
  max-width: 130px; line-height: 1.4;
  transition: opacity 0.3s ease;
}


/* Click popup card */
.rp-star-popup {
  position: absolute;
  z-index: 20;
  width: 210px;
  background: #ffffff;
  border: 1px solid var(--rp-border);
  border-radius: var(--radius-md, 8px);
  box-shadow: 0 8px 28px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06);
  padding: 13px 15px;
  display: flex; flex-direction: column; gap: 8px;
}
.rp-star-popup__head {
  display: flex; align-items: center; justify-content: space-between;
}
.rp-star-popup__domain {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase;
}
.rp-star-popup__close {
  width: 20px; height: 20px; border-radius: 50%;
  border: 1px solid var(--rp-border);
  background: transparent; color: var(--rp-hint);
  display: grid; place-items: center; cursor: pointer;
  transition: all 0.2s ease; flex-shrink: 0;
}
.rp-star-popup__close:hover { border-color: var(--rp-red); color: var(--rp-red); }
.rp-star-popup__title {
  margin: 0;
  font-size: 13px; font-weight: 600;
  color: var(--ink-900, #111111); letter-spacing: 0.02em; line-height: 1.35;
  font-family: var(--font-title, inherit);
}
.rp-star-popup__desc {
  margin: 0;
  font-size: 11px; color: var(--ink-500, #666666);
  line-height: 1.65; letter-spacing: 0.02em;
}

/* Popup enter/leave transition */
.rp-pop-enter-active { transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.34,1.56,0.64,1); }
.rp-pop-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.rp-pop-enter-from  { opacity: 0; transform: scale(0.92) translateY(-4px); }
.rp-pop-leave-to    { opacity: 0; transform: scale(0.95); }

/* Right footer data strip */
.rp-right-footer {
  flex-shrink: 0;
  height: 50px;
  background: var(--parchment-200, #EDEDEB);
  border-top: 1px solid var(--rp-border);
  display: flex; align-items: center; justify-content: center;
  gap: 14px; padding: 0 24px;
}
.rp-rf-item { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.rp-rf-val { font-size: 13px; font-weight: 600; color: var(--ink-900, #111111); letter-spacing: 0.02em; line-height: 1; }
.rp-rf-lbl { font-size: 9px; color: var(--ink-500, #666666); letter-spacing: 0.06em; white-space: nowrap; }
.rp-rf-sep { color: var(--parchment-400, #CBCBC8); font-size: 12px; }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .rp-domain-group,
  .rp-star-node,
  .rp-star-link,
  .rp-star-label,
  .rp-ripple { animation: none !important; }
  .rp-workspace,
  .rp-left,
  .rp-right-idle-preview,
  .rp-right-portrait-pane,
  .rp-right-dashboard-pane,
  .rp-layout-toggle { transition: none; }
  .rp-domain-group { transition: opacity 0.1s; }
  .rp-pop-enter-active, .rp-pop-leave-active { transition: opacity 0.1s ease; }
}

/* ══════════════════════════════════════════
   打印 / 导出报告样式
══════════════════════════════════════════ */
@media print {
  .rp-header,
  .rp-left,
  .rp-orbital-scene,
  .rp-right-footer,
  .rp-right-idle-preview,
  .rp-right-dashboard-pane,
  .rp-layout-toggle { display: none !important; }

  .rp-page,
  .rp-workspace,
  .rp-right,
  .rp-right-shell,
  .rp-right-portrait-pane {
    display: block !important;
    position: static !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    opacity: 1 !important;
    transform: none !important;
    background: #fff !important;
  }

  .rp-workspace {
    grid-template-columns: 1fr !important;
    padding: 0 !important;
  }
}
/* Responsive */
@media (max-width: 1280px) { .rp-workspace { grid-template-columns: minmax(0, 420px) minmax(0, 1fr); } }
@media (max-width: 1024px) {
  .rp-workspace { grid-template-columns: minmax(0, 340px) minmax(0, 1fr); }
  .rp-left { padding: 18px 22px 16px; gap: 10px; }
  .rp-dt-b { font-size: 28px; }
  .rp-dt-c { font-size: 20px; }
  .rp-right-shell { --rp-immersive-dashboard-width-current: min(var(--rp-immersive-dashboard-width), 40%); }
}
@media (max-width: 768px) {
  .rp-workspace { grid-template-columns: 1fr; grid-template-rows: auto 1fr; overflow-y: auto; }
  .rp-workspace--immersive { grid-template-rows: 0 minmax(0, 1fr); overflow: hidden; }
  .rp-right { min-height: 540px; }
  .rp-workspace--immersive .rp-right { min-height: 0; }
  .rp-right-shell { flex-direction: column; }
  .rp-right-portrait-pane,
  .rp-right-dashboard-pane { width: 100% !important; }
  .rp-right-shell--idle .rp-right-portrait-pane,
  .rp-right-shell--idle .rp-right-dashboard-pane {
    height: 0;
    opacity: 0;
  }
  .rp-right-shell--split .rp-right-portrait-pane {
    height: 64%;
    opacity: 1;
  }
  .rp-right-shell--split .rp-right-dashboard-pane {
    height: 36%;
    opacity: 1;
    transform: translateY(0);
    border-left-width: 0;
    border-top: 1px solid var(--rp-border);
  }
  .rp-right-shell--collapsing .rp-right-portrait-pane,
  .rp-right-shell--full .rp-right-portrait-pane {
    height: 100%;
    opacity: 1;
  }
  .rp-right-shell--collapsing .rp-right-dashboard-pane,
  .rp-right-shell--full .rp-right-dashboard-pane {
    height: 0;
    opacity: 0;
    transform: translateY(18px);
    border-top-width: 0;
  }
  .rp-right-shell--immersive .rp-right-portrait-pane {
    height: calc(100% - clamp(192px, 30vh, 260px));
    opacity: 1;
  }
  .rp-right-shell--immersive .rp-right-dashboard-pane {
    height: clamp(192px, 30vh, 260px);
    opacity: 1;
    transform: translateY(0);
    border-left-width: 0;
    border-top: 1px solid var(--rp-border);
  }
  .rp-layout-toggle {
    top: 12px;
    right: 12px;
    height: 32px;
    padding: 0 10px;
    font-size: 11px;
  }
  .rp-orbital-field { width: min(100%, 380px); }
  .rp-star-popup { width: 180px; }
}

</style>
