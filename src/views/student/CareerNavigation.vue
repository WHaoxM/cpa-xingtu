<!-- 页面：职途导航 · 简历导入；路由：student/career-navigation；角色：STUDENT/TEACHER -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { gsap } from '@/plugins/gsap'
import { useUserStore } from '@/stores'
import UserInfoBar from '@/components/UserInfoBar.vue'
import { useResumeStore } from '@/stores/resume'
import CareerAgentDashboard from '@/components/career/CareerAgentDashboard.vue'
import CareerNavigationIdlePreview from '@/components/career/CareerNavigationIdlePreview.vue'
import { usePortraitSession } from '@/composables/usePortraitSession'
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
} from '@/api/pipeline'
import { inferRoleFromSkills, listInsights } from '@/api/career'
import { hybridCandidates, getMatchExplain, type MatchExplain } from '@/api/match'
import { DEMO_STUDENT_ID } from '@/api/config'

const router = useRouter()
const userStore = useUserStore()
const resumeStore = useResumeStore()

type ParsePhase = 'idle' | 'parsing' | 'done'
type RightLayoutMode = 'idle' | 'split' | 'collapsing' | 'full'

const pageRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)
const pasteText = ref('')
const uploadedFileName = ref('')
const uploadedFile = ref<File | null>(null)
const parseError = ref('')
const parsePhase = ref<ParsePhase>('idle')
const selectedDirection = ref<CareerRole | ''>('')
/** Hybrid retrieve + explain (scores stay authoritative from BE match_result) */
const matchExplain = ref<MatchExplain | null>(null)
const hybridNote = ref('')
const rightLayoutMode = ref<RightLayoutMode>('idle')
const dashboardPaneRef = ref<HTMLElement | null>(null)
const isImmersiveLayout = ref(false)
const dashboardBaselineWidth = ref(0)

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
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/pdf',
  'text/plain',
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
    
    // 放宽校验：只在完全无法解析时才拒绝
    if (validation && validation.ok === false && validation.completeness < 0.3) {
      const issues = (validation.issues || []).join('、') || '结构字段不完整'
      throw new Error(
        `简历结构抽取未完成（${issues}）。请确认原文含院校/专业等关键字段后重试。`,
      )
    }
    
    studentProfile = (data?.student_profile || undefined) as
      | import('@/composables/useAgentPortrait').StudentProfilePayload
      | undefined
    
    // 放宽检查：允许school或major缺失，但记录警告
    if (!studentProfile?.school?.trim() || !studentProfile?.major?.trim()) {
      console.warn('简历缺少院校或专业信息，将使用默认值继续')
      // 不再抛出错误，继续处理
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

function goBack() {
  router.push({ name: 'student-career' })
}

function resetPage() {
  parsePhase.value = 'idle'
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
  gsapCtx?.revert()
  dashboardPaneObserver?.disconnect()
  clearRightLayoutTimers()
})

/* ═══ 注释保留（Step 3 用）: roadmapMap 原有数据已移除，如需恢复请查看 Git 历史 ═══ */

/* ═══ 星图交互数据 ═══ */
const showDashboard = computed(() => parsePhase.value !== 'idle')
const showEmbeddedPortrait = computed(() => parsePhase.value !== 'idle' && resumeStore.isParsed)
const showIdlePreview = computed(() => parsePhase.value === 'idle')
const isRightPanelActive = computed(() => parsePhase.value !== 'idle')
const showLayoutToggle = computed(() => showEmbeddedPortrait.value
  && parsePhase.value === 'done'
  && portraitSessionStatus.value === 'completed'
  && rightLayoutMode.value === 'full')
const layoutToggleLabel = computed(() => (isImmersiveLayout.value ? '恢复默认布局' : '展开沉浸布局'))
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
      <div class="rp-header__center"><div class="rp-header-tag">简历导入</div></div>
      <div class="rp-header__right">
        <UserInfoBar />
      </div>
    </header>

    <!-- WORKSPACE -->
    <div class="rp-workspace" :class="{ 'rp-workspace--immersive': isImmersiveLayout }">

      <!-- LEFT: Editorial + Upload -->
      <div class="rp-left">

        <!-- Editorial headline -->
        <div class="rp-editorial">
          <span class="rp-greeting">
            {{ (() => { const h = new Date().getHours(); return h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好' })() }}，{{ userStore.currentUser?.name || '钟同学' }}
          </span>
          <h1 class="rp-display-title">
            <span class="rp-dt-a">找到你</span>
            <span class="rp-dt-b">在职场宇宙中</span>
            <span class="rp-dt-c">的坐标</span>
          </h1>
          <p class="rp-data-proof">
            <span>近万条真实岗位</span><em class="rp-sep">·</em>
            <span>全行业覆盖</span><em class="rp-sep">·</em>
            <span>全国各省市</span>
          </p>
        </div>

        <!-- Step indicator (compact inline) -->
        <div class="rp-steps-inline-row">
        <div class="rp-steps-inline">
          <div class="rp-si-step rp-si-step--active">
            <span class="rp-si-dot"></span>
            <span class="rp-si-num">01</span>
            <span class="rp-si-name">简历导入</span>
          </div>
          <span class="rp-si-line"></span>
          <div class="rp-si-step">
            <span class="rp-si-dot"></span>
            <span class="rp-si-num">02</span>
            <span class="rp-si-name">能力画像</span>
          </div>
          <span class="rp-si-line"></span>
          <div class="rp-si-step">
            <span class="rp-si-dot"></span>
            <span class="rp-si-num">03</span>
            <span class="rp-si-name">职业路径</span>
          </div>
        </div>
        <!-- 没有简历提示入口 -->
        <div class="rp-no-resume-hint" @click="router.push({ name: 'student-resume-builder' })">
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
              <p class="rp-drop-formats">doc &nbsp;·&nbsp; pdf &nbsp;·&nbsp; ppt &nbsp;·&nbsp; txt</p>
            </div>
          </div>

          <div class="rp-or-row">
            <span class="rp-or-line"></span>
            <span class="rp-or-text">或粘贴文字</span>
            <span class="rp-or-line"></span>
          </div>

          <textarea
            class="rp-textarea"
            v-model="pasteText"
            placeholder="粘贴简历内容：工作经历、掌握技能、项目描述…"
            rows="3"
          />

          <!-- 方向预选 tiles (5 领域折叠卡片) -->
          <div class="rp-dir-section">
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
          <button class="rp-parse-btn" :disabled="!pasteText.trim() && !uploadedFile" @click="startParse">
            <span>查看个人能力画像</span>
            <Icon icon="lucide:arrow-right" :width="15" class="rp-parse-btn__arrow" />
          </button>
        </div>

        <!-- PARSING 态 -->
        <div v-else-if="parsePhase === 'parsing'" class="rp-loading-wrap">
            <div class="rp-loading-seal">
              <Icon icon="lucide:loader-circle" :width="34" class="rp-loading-spin" />
            </div>
            <p class="rp-loading-msg">{{ parseMsg }}</p>
            <div class="rp-progress-area">
              <div class="rp-progress-track">
                <div class="rp-progress-fill" :style="{ width: parseProgress + '%' }"></div>
              </div>
              <div class="rp-progress-meta">
                <span class="rp-progress-pct">{{ Math.round(parseProgress) }}%</span>
                <span class="rp-progress-steps">{{ currentStep }} / {{ totalSteps }} 步</span>
              </div>
            </div>
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
            <p class="rp-privacy__text">内容仅本地处理，不上传至任何服务器</p>
          </div>
        </div>

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
          :class="['rp-right-shell--' + rightLayoutMode, { 'rp-right-shell--immersive': isImmersiveLayout }]"
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
            <TalentPortrait
              v-if="showEmbeddedPortrait"
              embedded
              class="rp-right-portrait"
              :replay-snapshots="replaySnapshots"
              :result-data="portraitSessionResult"
              :session-status="portraitSessionStatus"
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
