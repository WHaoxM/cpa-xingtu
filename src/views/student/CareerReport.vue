<!-- 页面：职业生涯发展报告；路由：student/career-report；角色：STUDENT -->
<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as d3 from 'd3'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useResumeStore } from '@/stores/resume'
import { useUserStore } from '@/stores'
import UserInfoBar from '@/components/UserInfoBar.vue'
import { useLearningStore } from '@/stores/learning'
import { useReportStore } from '@/stores/report'
import {
  JOB_PORTRAITS, CAREER_PATH_EDGES,
  deriveStudentSevenDim, getGrowthPlan,
  type JobPortrait, type JobLevel,
} from '@/mock/careerReportData'
import { CAREER_DOMAINS } from '@/composables/useCareerInsights'
import D3RadarChart from '@/components/charts/D3RadarChart.vue'
import type { RadarDatum } from '@/components/charts/D3RadarChart.vue'
import { gsap } from '@/plugins/gsap'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import parchmentBaseUrl from '@/assets/images/parchment-base.jpg'
import { useAgentArtifactHandoff, commitMockArtifactHandoff } from '@/composables/useAgentArtifactHandoff'
import { getApiMode } from '@/api/config'
import { getReportList } from '@/api/report'
import { openAgentWithResource } from '@/composables/useAgentResourceHandoff'
import { hasServerReportCollection } from '@/composables/agentResourceHandoffContract'
import { useCareerClimbing } from '@/composables/useCareerClimbing'
import CareerRelationGraph from '@/components/career/CareerRelationGraph.vue'
import CareerStartingPoint from '@/components/career/CareerStartingPoint.vue'
import ServerPortraitDetail from '@/components/reports/ServerPortraitDetail.vue'
import { followupLocation } from '@/utils/portraitFollowup'
const parchmentBg = `url("${parchmentBaseUrl}")`

const route = useRoute()
const router = useRouter()
const hasArtifactQuery = computed(() => Object.prototype.hasOwnProperty.call(route.query, 'artifact_id'))
const artifactId = computed(() => typeof route.query.artifact_id === 'string' ? route.query.artifact_id.trim() : '')
const handoff = useAgentArtifactHandoff(() => artifactId.value)
const isRealPath = computed(() => getApiMode() === 'http' && !hasArtifactQuery.value)
const climb = reactive(useCareerClimbing(() => isRealPath.value))
const hasClimbTarget = computed(() => isRealPath.value ? !!climb.selected : !!selectedJob.value)
const selectedClimbId = computed(() => isRealPath.value ? 'personal-start' : selectedJobId.value)
const selectedPathNode = ref('personal-start')
const wallNoteOpen = ref(false)
const diagnosticFacts = computed(() => climb.report?.chapters.filter(c => ['projects','experience','achievements'].includes(c.id)).flatMap(c => c.items) || [])
function diagnosticFactParts(fields:Record<string,unknown>|string|null){
  if(typeof fields==='string')return fields ? [{label:'经历记录',text:fields}] : []
  const parts:{label:string;text:string}[]=[]
  for(const key of ['role','desc','description']){
    const text=fields?.[key]
    if(typeof text!=='string'||!text.trim())continue
    if(key==='description'&&parts.some(part=>part.label==='经历记录'&&part.text===text))continue
    parts.push({label:key==='role'?'参与角色':'经历记录',text})
  }
  return parts
}
const personalQuestion=computed(()=>{
  const question=climb.latest?.result?.question
  if(!question)return ''
  const value=climb.positioning
  const alreadyShown=value?[value.starting_point,value.next_action.text,...value.connections.map(item=>item.text),...value.uncertainties.map(item=>item.text)]:[]
  return alreadyShown.some(text=>text.trim()===question.trim())?'':question
})
function wallReadingTarget(id:string){
  if(id==='personal-start')return climb.positioning?'career-personal-start':'career-path-evidence'
  if(id==='personal-next')return climb.positioning?'career-personal-next':'career-path-position'
  return 'career-path-direction'
}
function focusPathPart(id:string){
  const target=document.getElementById(id)
  target?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})
  target?.focus({preventScroll:true})
}
function respondToNextStep(){
  if(climb.positioning?.next_action.kind==='practice'){climb.discuss();return}
  focusPathPart('career-path-response')
  document.querySelector<HTMLTextAreaElement>('#career-path-response textarea')?.focus({preventScroll:true})
}
watch(()=>climb.latest?.status,(status,previous)=>{
  if(status==='completed'&&previous&&previous!=='completed')void nextTick(()=>{
    const panel=document.getElementById('career-path-position');if(panel)panel.scrollTop=0
    focusPathPart('career-path-position')
  })
})
function followCurrentPortrait(focus?:'resume'|'self-report') {
  if(climb.workbench){const location=followupLocation(climb.workbench,focus||'resume');if(location)void router.push(location)}
}
type ReportArtifactPreview = { type?: string; markdown?: string; chapters?: string[]; word_count?: number }
const artifactReady = computed(() => handoff.ready.value && handoff.artifact.value?.kind === 'career_report')
const reportPreview = computed<ReportArtifactPreview | null>(() => artifactReady.value
  ? handoff.artifact.value?.preview as ReportArtifactPreview ?? null
  : null)

function backToAgent() {
  void router.push({ name: 'student-ai-assistant', query: handoff.sessionId.value ? { session_id: handoff.sessionId.value } : {} })
}

function browseOrdinaryReport() {
  const query = { ...route.query }
  delete query.artifact_id
  delete query.session_id
  void router.replace({ path: route.path, query })
}
const resumeStore = useResumeStore()
const userStore = useUserStore()
const learningStore = useLearningStore()
const reportStore = useReportStore()
const hasServerReports = ref(false)

function askAgentToCheckExistingReports() {
  if (!hasServerReports.value || hasArtifactQuery.value) return
  // This editor's calculated text and local saves are not server evidence.
  openAgentWithResource(router, { kind: 'career_resource', uri: 'career://me/reports' })
}

const reportSaved = ref(false)

/* 关注方向：targetRoles 优先，如果为空则 fallback 到 predictedRole 或默认 */
const effectiveTargetRoles = computed<string[]>(() => {
  if (isRealPath.value) return climb.role ? [climb.role] : []
  if (learningStore.targetRoles.length > 0) return learningStore.targetRoles.map(r => r.role)
  const predicted = resumeStore.insights?.predictedRole
  if (predicted) return [predicted]
  return ['机器学习工程师']
})

function saveCareerReport() {
  if(isRealPath.value)return
  const today = new Date().toISOString().slice(0, 10)
  if (artifactReady.value && handoff.artifact.value) {
    reportStore.addRecord({
      type: 'career',
      title: `${today} · ${handoff.artifact.value.title}`,
      snapshot: {
        artifactId: handoff.artifact.value.artifact_id,
        sourceSessionId: handoff.sessionId.value,
        markdown: reportTextEditable.value,
        chapters: reportPreview.value?.chapters || [],
      },
    })
    reportSaved.value = true
    return
  }
  const roles = effectiveTargetRoles.value
  const topJob = selectedJob.value
  reportStore.addRecord({
    type: 'career',
    title: `${today} · ${roles.join(' / ')}方向分析`,
    snapshot: {
      targetRoles: roles,
      selectedJobId: selectedJobId.value,
      selectedJobTitle: topJob?.title ?? '',
      topMatchScore: effectiveMatchScore.value,
      studentDimSnapshot: studentDim.value,
    },
  })
  reportSaved.value = true
}

/* ══ 界面状态 ══ */
const activeMode = ref<'analysis' | 'report'>('analysis')
const selectedJobId = ref<string>('')
const reportTextEditable = ref('')
const agentReportOriginal = ref('')
const climbingSvgEl = ref<SVGSVGElement | null>(null)
let climbTimeline: gsap.core.Timeline | null = null
const expandedStages = ref<Set<string>>(new Set())
const checkResults = ref<Array<{ section: string; found: boolean }>>([])
const showCheckResults = ref(false)
const polishLoading = ref(false)
const polishDiff = ref<{ before: string; after: string } | null>(null)
const showExportMenu = ref(false)
const activeSkillEdge = ref<{ fromId: string; toId: string; skills: string[]; fromTitle: string; toTitle: string } | null>(null)
const planLoading = ref(false)
const planStages = ref<Array<{ phase: string; phaseLabel: string; goal: string; tasks: string[]; milestone: string }>>([])
const radarLoading = ref(false)
const radarReady = ref(false)
let planTimers: ReturnType<typeof setTimeout>[] = []

/* ══ 定常配置 ══ */
const DIM_NAMES = ['专业技能', '证书资质', '创新能力', '学习能力', '抗压能力', '沟通能力', '实习经验'] as const

const LINE_COLORS: Record<string, string> = {
  frontend:    '#C4622D',
  data:        '#B8962E',
  qa:          '#3A8A7A',
  fullstack:   '#6A5B8A',
  general:     '#7A6F5A',
  algorithm:   '#5B7E91',
  'data-analyst': '#B8962E',
  backend:     '#2E7D5E',
  ai:          '#8B4A9C',
  bigdata:     '#C45E2A',
  ops:         '#4A6FA5',
  embedded:    '#6B5E3A',
  security:    '#9C2E2E',
  cloud:       '#2E6B9C',
  database:    '#5A7A4A',
  support:     '#8A7A5A',
  multimedia:  '#9C5E2E',
}

/* ══ 攀岩墙白名单：只展示 CAREER_DOMAINS 15 职业的岗位 ══ */
const CLIMB_JOB_IDS = new Set<string>([
  /* 后端：Python 后端工程师 */
  'be-python-intern', 'be-python-junior', 'be-python-mid', 'be-python-senior',
  /* ML：推荐算法工程师 */
  'algo-recsys-intern', 'algo-recsys-junior', 'algo-recsys-mid', 'algo-recsys-senior',
  /* ML：深度学习工程师 */
  'dl-junior', 'dl-mid', 'dl-senior',
  /* ML：LLM 应用工程师 */
  'ai-llm-intern', 'ai-llm-junior', 'ai-llm-mid', 'ai-llm-senior',
  /* ML：AI Agent 开发工程师 */
  'ai-agent-intern', 'ai-agent-junior', 'ai-agent-mid', 'ai-agent-senior',
  /* ML：NLP 工程师 */
  'ai-nlp-junior', 'ai-nlp-senior',
  /* ML：NLP 算法工程师 */
  'algo-nlp-junior', 'algo-nlp-senior',
  /* ML：搜索算法工程师 */
  'algo-search-junior', 'algo-search-senior',
])

const LEVEL_ORDER: Record<JobLevel, number> = {
  intern: 0, junior: 1, mid: 2, senior: 3, lead: 4, expert: 5,
}

/* ══ 推荐岗位：优先展示 targetRoles 对应岗位（基于 CAREER_DOMAINS 15 职业）══ */
const recommendedIds = computed<Set<string>>(() => {
  const matched = resumeStore.matchedCareers
  const roleToIds: Record<string, string[]> = {
    '前端开发': ['fe-junior', 'fe-mid', 'fe-react-junior', 'fe-vis-junior'],
    '后端开发': ['be-java-junior', 'be-java-mid', 'be-go-junior', 'be-python-junior'],
    '测试开发': ['qa-junior', 'qa-mid', 'qa-plat-junior', 'qa-perf-junior'],
    '数据分析': ['da-biz-junior', 'da-biz-mid', 'da-dev-junior', 'da-growth-junior'],
    '机器学习工程师': ['ai-agent-intern', 'ai-agent-junior', 'ai-llm-junior', 'ai-nlp-junior', 'algo-recsys-junior', 'dl-junior', 'be-python-junior'],
  }
  const ids = new Set<string>()
  for (const role of effectiveTargetRoles.value) {
    ;(roleToIds[role] ?? []).forEach(id => ids.add(id))
  }
  for (const c of matched.slice(0, 3)) {
    ;(roleToIds[c.role] ?? []).slice(0, 2).forEach(id => ids.add(id))
  }
  if (ids.size === 0) {
    ;['ai-agent-intern', 'ai-agent-junior', 'ai-llm-junior', 'ai-nlp-junior', 'be-python-junior'].forEach(id => ids.add(id))
  }
  return ids
})

const selectedJob = computed(() => JOB_PORTRAITS.find(j => j.id === selectedJobId.value) ?? null)

/* 统一匹配度：与气泡图一致，推荐岗位 +0.2 */
function getDisplayMatchScore(job: JobPortrait | null | undefined): number {
  if (!job) return 0
  return recommendedIds.value.has(job.id) ? Math.min(0.95, job.matchScore + 0.2) : job.matchScore
}

const effectiveMatchScore = computed(() => {
  return getDisplayMatchScore(selectedJob.value)
})

/* ══ 学生七维 ══ */
const studentDim = computed(() => {
  if (isRealPath.value) return {} as ReturnType<typeof deriveStudentSevenDim>
  const stored = resumeStore.portraitDimensions
  if (stored) return stored
  const skills = resumeStore.parsedSkills
  const confidence = resumeStore.insights?.confidence ?? 0.5
  return deriveStudentSevenDim(skills, confidence)
})

/* ══ 成长计划 ══ */
const growthPlan = computed(() => selectedJobId.value ? getGrowthPlan(selectedJobId.value) : [])

/* ══ 分组气泡图 ══ */
type ReportBubbleJob = Pick<JobPortrait, 'id'|'title'|'salaryRange'> & {
  domainId: string
  domainName: string
  domainColor: string
  displayMatchScore: number
}

type ReportBubbleGroup = {
  domainId: string
  domainName: string
  domainColor: string
  jobs: ReportBubbleJob[]
}

interface ReportBubbleDomainNode extends d3.SimulationNodeDatum {
  id: string
  name: string
  color: string
  r: number
  labelY: number
  jobs: ReportBubbleJobNode[]
  _phaseX?: number
  _phaseY?: number
}

interface ReportBubbleJobNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  matchScore: number
  salaryRange: string
  domainId: string
  domainName: string
  domainColor: string
  r: number
  _phaseX?: number
  _phaseY?: number
}

const bubbleSvgRef = ref<SVGSVGElement | null>(null)
const analysisMainRef = ref<HTMLElement | null>(null)
const bubblePanelRef = ref<HTMLElement | null>(null)
let motionQuery: MediaQueryList | null = null
let bubbleResizeObserver: ResizeObserver | null = null
let bubbleOuterSim: d3.Simulation<ReportBubbleDomainNode, undefined> | null = null
let bubbleInnerSims: Array<d3.Simulation<ReportBubbleJobNode, undefined>> = []

const REPORT_DOMAIN_ID_BY_LINE: Record<string, string> = {
  frontend: 'frontend',
  backend: 'backend',
  qa: 'qa',
  data: 'data',
  'data-analyst': 'data',
  algorithm: 'ml',
  ai: 'ml',
}

const REPORT_DOMAIN_META_BY_ID = new Map(CAREER_DOMAINS.map(domain => [domain.id, domain] as const))

function getReportBubbleDomainMeta(job: JobPortrait) {
  const mappedId = REPORT_DOMAIN_ID_BY_LINE[job.lineId] ?? 'frontend'
  const domain = REPORT_DOMAIN_META_BY_ID.get(mappedId) ?? CAREER_DOMAINS[0]!
  return {
    domainId: domain.id,
    domainName: domain.name,
    domainColor: domain.color,
  }
}

function getReportBubbleTextColor(color: string, isSelected = false): string {
  const normalized = color.trim().replace(/^#/, '')
  const hex = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized

  if (!/^[\da-fA-F]{6}$/.test(hex)) {
    return isSelected ? 'rgba(255,252,246,0.99)' : 'rgba(255,252,246,0.96)'
  }

  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  if (brightness >= 160) {
    return isSelected ? 'rgba(30,18,8,0.98)' : 'rgba(43,27,13,0.96)'
  }
  return isSelected ? 'rgba(255,252,246,0.99)' : 'rgba(255,252,246,0.96)'
}

function getReportBubbleLabel(title: string): string {
  const compact = title.replace(/（[^）]+）/g, '').replace(/\s+/g, '')
  const aliasRules: Array<[RegExp, string]> = [
    [/Java后端工程师/, 'Java后端'],
    [/Go后端工程师/, 'Go后端'],
    [/Python后端工程师/, 'Python后端'],
    [/推荐算法工程师/, '推荐算法'],
    [/深度学习工程师/, '深度学习'],
    [/LLM应用工程师/, 'LLM应用'],
    [/数据分析师/, '数据分析'],
    [/数据开发工程师/, '数据开发'],
    [/增长分析师/, '增长数分'],
    [/测试开发工程师/, '测试开发'],
    [/质量平台工程师/, '质量平台'],
    [/性能测试工程师/, '性能测试'],
    [/可视化工程师/, '数据可视化'],
  ]

  for (const [pattern, replacement] of aliasRules) {
    if (pattern.test(compact)) return compact.replace(pattern, replacement)
  }

  return compact
    .replace(/工程师/g, '')
    .replace(/分析师/g, '分析')
    .replace(/技术负责人/g, '负责人')
}

function getReportBubbleLines(title: string, r: number): string[] {
  const label = getReportBubbleLabel(title)
  if (r < 20) return [label.slice(0, Math.min(4, label.length))]
  if (label.length <= 4) return [label]

  const boundary = label.search(/[a-zA-Z][^\x00-\x7F]|[^\x00-\x7F][a-zA-Z]/)
  const split = boundary > 0 ? boundary + 1 : Math.ceil(label.length / 2)
  const line1 = label.slice(0, split).trim()
  const line2 = label.slice(split).trim()
  if (!line2) return [line1]
  return [line1, r < 24 && line2.length > 5 ? `${line2.slice(0, 4)}…` : line2]
}

function getReportBubbleTitleOffset(r: number, lineCount: number): number {
  if (lineCount >= 2) return r >= 24 ? 4.5 : 3.5
  return r >= 24 ? 6 : 4.5
}

function getReportBubbleScoreOffset(r: number, lineCount: number): number {
  if (lineCount >= 2) return r >= 24 ? -Math.min(r * 0.64, 16) : -Math.min(r * 0.58, 12)
  return r >= 24 ? -Math.min(r * 0.56, 14) : -Math.min(r * 0.5, 10)
}

const bubbleJobs = computed<ReportBubbleJob[]>(() => {
  if(isRealPath.value) return climb.visible.map(c=>({id:c.role,title:c.role,salaryRange:'',displayMatchScore:0,
    domainId:'live-'+strHash(c.category),domainName:c.category,domainColor:['#C4622D','#5B7E91','#B8962E'][strHash(c.category)%3]!}))
  const weighted = [...JOB_PORTRAITS]
    .filter(job => CLIMB_JOB_IDS.has(job.id))
    .sort((a, b) => getDisplayMatchScore(b) - getDisplayMatchScore(a))

  const roleToIds: Record<string, string[]> = {
    '前端开发': ['fe-junior', 'fe-mid', 'fe-react-junior', 'fe-vis-junior'],
    '后端开发': ['be-java-junior', 'be-java-mid', 'be-go-junior', 'be-python-junior'],
    '测试开发': ['qa-junior', 'qa-mid', 'qa-plat-junior', 'qa-perf-junior'],
    '数据分析': ['da-biz-junior', 'da-biz-mid', 'da-dev-junior', 'da-growth-junior'],
    '机器学习工程师': ['ai-agent-intern', 'ai-agent-junior', 'ai-llm-junior', 'ai-nlp-junior', 'algo-recsys-junior', 'dl-junior', 'be-python-junior'],
  }

  const evalRole = resumeStore.evaluatingRole
  let pinnedJob: JobPortrait | null = null
  if (evalRole) {
    const ids = new Set(roleToIds[evalRole] ?? [])
    pinnedJob = weighted.find(job => ids.has(job.id)) ?? null
  }

  const highScoreJobs = weighted.filter(job => getDisplayMatchScore(job) > 0.4)
  let selectedJobs = highScoreJobs.length >= 8
    ? highScoreJobs.slice(0, 8)
    : weighted.slice(0, Math.min(8, weighted.length))

  if (pinnedJob && !selectedJobs.some(job => job.id === pinnedJob.id)) {
    selectedJobs = [pinnedJob, ...selectedJobs.slice(0, 7)]
  }

  if (selectedJob.value && CLIMB_JOB_IDS.has(selectedJob.value.id) && !selectedJobs.some(job => job.id === selectedJob.value!.id)) {
    selectedJobs = [selectedJob.value, ...selectedJobs.slice(0, 7)]
  }

  const mapped = selectedJobs
    .map(job => {
      const meta = getReportBubbleDomainMeta(job)
      return {
        ...job,
        ...meta,
        displayMatchScore: getDisplayMatchScore(job),
      }
    })
    .sort((a, b) => b.displayMatchScore - a.displayMatchScore)

  const seenStacks = new Set<string>()
  const deduped: typeof mapped = []
  for (const job of mapped) {
    const key = job.stack || job.title
    if (seenStacks.has(key)) continue
    seenStacks.add(key)
    deduped.push(job)
  }

  return deduped
})

const bubbleGroups = computed<ReportBubbleGroup[]>(() => {
  const groups = new Map<string, ReportBubbleGroup>()
  bubbleJobs.value.forEach(job => {
    const existing = groups.get(job.domainId)
    if (existing) {
      existing.jobs.push(job)
      return
    }
    groups.set(job.domainId, {
      domainId: job.domainId,
      domainName: job.domainName,
      domainColor: job.domainColor,
      jobs: [job],
    })
  })

  return [...groups.values()]
    .map(group => ({
      ...group,
      jobs: [...group.jobs].sort((a, b) => b.displayMatchScore - a.displayMatchScore),
    }))
    .sort(
      (a, b) => CAREER_DOMAINS.findIndex(domain => domain.id === a.domainId)
        - CAREER_DOMAINS.findIndex(domain => domain.id === b.domainId),
    )
})

function stopBubbleChart() {
  if (bubbleOuterSim) {
    bubbleOuterSim.stop()
    bubbleOuterSim = null
  }
  bubbleInnerSims.forEach(sim => sim.stop())
  bubbleInnerSims = []
}

function makeElasticCollideForce<N extends d3.SimulationNodeDatum & { r: number }>(nodes: N[], restitution = 0.68) {
  return () => {
    for (let i = 0; i < nodes.length; i++) {
      for (let k = i + 1; k < nodes.length; k++) {
        const a = nodes[i]!
        const b = nodes[k]!
        const dx = (b.x ?? 0) - (a.x ?? 0)
        const dy = (b.y ?? 0) - (a.y ?? 0)
        const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6
        const minDistance = a.r + b.r + 2
        if (dist >= minDistance) continue

        const overlap = minDistance - dist
        const m1 = a.r * a.r
        const m2 = b.r * b.r
        const total = m1 + m2
        const nx = dx / dist
        const ny = dy / dist

        a.x = (a.x ?? 0) - nx * overlap * (m2 / total)
        a.y = (a.y ?? 0) - ny * overlap * (m2 / total)
        b.x = (b.x ?? 0) + nx * overlap * (m1 / total)
        b.y = (b.y ?? 0) + ny * overlap * (m1 / total)

        const dvx = (a.vx ?? 0) - (b.vx ?? 0)
        const dvy = (a.vy ?? 0) - (b.vy ?? 0)
        const dvn = dvx * nx + dvy * ny
        if (dvn <= 0) continue

        const impulse = (1 + restitution) * dvn / (1 / m1 + 1 / m2)
        a.vx = (a.vx ?? 0) - (impulse / m1) * nx
        a.vy = (a.vy ?? 0) - (impulse / m1) * ny
        b.vx = (b.vx ?? 0) + (impulse / m2) * nx
        b.vy = (b.vy ?? 0) + (impulse / m2) * ny
      }
    }
  }
}

function initBubbleChart() {
  const svg = bubbleSvgRef.value
  if (!svg) return
  const focusedJob = svg.contains(document.activeElement)
    ? document.activeElement?.closest('.job-node')?.getAttribute('data-job-id') : null

  stopBubbleChart()

  const groups = bubbleGroups.value
  const root = d3.select(svg)
  root.selectAll('*').remove()
  if (!groups.length) return

  const width = svg.clientWidth || 360
  const height = svg.clientHeight || 300
  if (svg.clientWidth === 0 || svg.clientHeight === 0) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const minSide = Math.min(width, height)
  const baseJobR = Math.min(30, Math.max(18, minSide / 15))
  const labelPadding = 12
  const fontFamily = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif'

  const defs = root.append('defs')

  const inkBleedFilter = defs.append('filter')
    .attr('id', 'cr-bubble-ink-bleed')
    .attr('x', '-18%').attr('y', '-18%').attr('width', '136%').attr('height', '136%')
  inkBleedFilter.append('feTurbulence')
    .attr('type', 'fractalNoise').attr('baseFrequency', 0.045)
    .attr('numOctaves', 3).attr('seed', 7).attr('result', 'noise')
  inkBleedFilter.append('feDisplacementMap')
    .attr('in', 'SourceGraphic').attr('in2', 'noise').attr('scale', 0.8).attr('result', 'displaced')
  inkBleedFilter.append('feGaussianBlur')
    .attr('in', 'displaced').attr('stdDeviation', 0.15)

  const selectedFilter = defs.append('filter')
    .attr('id', 'cr-bubble-ink-selected')
    .attr('x', '-35%').attr('y', '-35%').attr('width', '170%').attr('height', '170%')
  selectedFilter.append('feGaussianBlur')
    .attr('in', 'SourceAlpha').attr('stdDeviation', 5).attr('result', 'blur')
  selectedFilter.append('feFlood')
    .attr('flood-color', 'rgba(190,42,0,0.35)').attr('result', 'color')
  selectedFilter.append('feComposite')
    .attr('in', 'color').attr('in2', 'blur').attr('operator', 'in').attr('result', 'glow')
  const selectedMerge = selectedFilter.append('feMerge')
  selectedMerge.append('feMergeNode').attr('in', 'glow')
  selectedMerge.append('feMergeNode').attr('in', 'SourceGraphic')

  groups.forEach(group => {
    const jobGradient = defs.append('radialGradient')
      .attr('id', `cr-job-${group.domainId}`)
      .attr('cx', '50%').attr('cy', '50%').attr('r', '50%')
    jobGradient.append('stop').attr('offset', '0%').attr('stop-color', group.domainColor).attr('stop-opacity', 0.92)
    jobGradient.append('stop').attr('offset', '52%').attr('stop-color', group.domainColor).attr('stop-opacity', 0.8)
    jobGradient.append('stop').attr('offset', '80%').attr('stop-color', group.domainColor).attr('stop-opacity', 0.72)
    jobGradient.append('stop').attr('offset', '100%').attr('stop-color', group.domainColor).attr('stop-opacity', 0.5)

    const domainGradient = defs.append('radialGradient')
      .attr('id', `cr-domain-${group.domainId}`)
      .attr('cx', '50%').attr('cy', '50%').attr('r', '50%')
    domainGradient.append('stop').attr('offset', '0%').attr('stop-color', group.domainColor).attr('stop-opacity', 0.02)
    domainGradient.append('stop').attr('offset', '58%').attr('stop-color', group.domainColor).attr('stop-opacity', 0.05)
    domainGradient.append('stop').attr('offset', '88%').attr('stop-color', group.domainColor).attr('stop-opacity', 0.16)
    domainGradient.append('stop').attr('offset', '100%').attr('stop-color', group.domainColor).attr('stop-opacity', 0.22)
  })

  const domainCount = groups.length
  const angleStep = domainCount > 0 ? (Math.PI * 2) / domainCount : 0
  const spread = Math.min(width, height) * (domainCount <= 2 ? 0.22 : 0.28)

  const domainNodes: ReportBubbleDomainNode[] = groups.map((group, index) => {
    const jobs: ReportBubbleJobNode[] = group.jobs.map(job => ({
      id: job.id,
      title: job.title,
      matchScore: job.displayMatchScore,
      salaryRange: job.salaryRange,
      domainId: group.domainId,
      domainName: group.domainName,
      domainColor: group.domainColor,
      r: isRealPath.value ? 32 : Math.max(24, Math.round(18 + job.displayMatchScore * 18)),
      x: (Math.random() - 0.5) * 20,
      y: (Math.random() - 0.5) * 20,
    }))

    const maxJobR = d3.max(jobs, job => job.r) ?? baseJobR
    const avgJobR = d3.mean(jobs, job => job.r) ?? baseJobR
    const domainRadius = Math.max(maxJobR * 2.1 + 10, maxJobR + avgJobR + jobs.length * 8)

    let x = width / 2
    let y = height / 2
    if (domainCount === 2) {
      x = width / 2 + (index === 0 ? -1 : 1) * spread * 0.92
    } else if (domainCount > 2) {
      const angle = angleStep * index - Math.PI / 2
      x = width / 2 + Math.cos(angle) * spread
      y = height / 2 + Math.sin(angle) * spread * 0.86
    }

    return {
      id: group.domainId,
      name: group.domainName,
      color: group.domainColor,
      r: domainRadius,
      labelY: -domainRadius - 8,
      jobs,
      x,
      y,
    }
  })

  // Keep nested groups inside a narrow panel without changing jobs or scores.
  const totalDiameter = d3.sum(domainNodes, domain => domain.r * 2)
  const fit = Math.min(1, (width - 36) / Math.max(1, totalDiameter + 12),
    (height - 48) / Math.max(1, d3.max(domainNodes, domain => domain.r * 2) ?? 1))
  domainNodes.forEach(domain => {
    domain.r *= fit
    domain.labelY = -domain.r - 8
    domain.jobs.forEach(job => { job.r *= fit })
  })

  const domainGroups = root.selectAll<SVGGElement, ReportBubbleDomainNode>('g.cr-domain-group')
    .data(domainNodes)
    .enter()
    .append('g')
    .attr('class', 'cr-domain-group')

  domainGroups.append('circle')
    .attr('class', 'domain-bg')
    .attr('r', domain => domain.r)
    .attr('fill', domain => `url(#cr-domain-${domain.id})`)
    .attr('stroke', domain => domain.color)
    .attr('stroke-width', 0.8)
    .attr('stroke-opacity', 0.28)

  const domainLabels = domainGroups.append('text')
    .attr('class', 'domain-label')
    .attr('x', 0)
    .attr('y', domain => domain.labelY)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'auto')
    .attr('fill', domain => domain.color)
    .attr('font-size', 12)
    .attr('font-weight', '700')
    .attr('font-family', 'KaiTi, STKaiti, serif')
    .attr('paint-order', 'stroke')
    .attr('stroke', 'rgba(245,245,243,0.92)')
    .attr('stroke-width', 3)
    .text(domain => domain.name)

  domainNodes.forEach((domainNode, index) => {
    const domainGroup = d3.select(domainGroups.nodes()[index]!)
    const jobNodes = domainNode.jobs

    const jobGroups = domainGroup.selectAll<SVGGElement, ReportBubbleJobNode>('g.job-node')
      .data(jobNodes)
      .enter()
      .append('g')
      .attr('class', 'job-node')
      .attr('data-job-id', job => job.id)
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('aria-label', job => isRealPath.value ? `选择方向：${job.title}` : `${job.title}，匹配度 ${Math.round(job.matchScore * 100)}%`)
      .attr('data-direction', job => isRealPath.value ? job.title : null)
      .style('cursor', 'pointer')
      .on('click', (_event, job) => {
        selectJob(job.id, true)
      })
      .on('keydown', (event: KeyboardEvent, job) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        selectJob(job.id, true)
      })

    jobGroups.append('circle')
      .attr('class', 'job-circle')
      .attr('r', job => job.r)
      .attr('fill', job => `url(#cr-job-${job.domainId})`)
      .attr('stroke', 'none')
      .attr('filter', 'url(#cr-bubble-ink-bleed)')

    jobGroups.append('text')
      .attr('class', 'job-text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', job => getReportBubbleTextColor(job.domainColor))
      .attr('font-size', job => Math.max(11, job.r * 0.34))
      .attr('font-family', fontFamily)
      .attr('font-weight', '600')
      .attr('letter-spacing', '0.02em')
      .attr('pointer-events', 'none')
      .each(function (job) {
        const text = d3.select(this)
        const lines = getReportBubbleLines(job.title, job.r)
        text.attr('y', getReportBubbleTitleOffset(job.r, lines.length))
        if (lines.length <= 1) {
          text.text(lines[0] ?? '')
          return
        }

        text.text('')
        text.append('tspan').attr('x', 0).attr('dy', '-0.45em').text(lines[0] ?? '')
        text.append('tspan').attr('x', 0).attr('dy', '1.15em').text(lines[1] ?? '')
      })

    jobGroups.append('text')
      .attr('class', 'job-score')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('y', job => getReportBubbleScoreOffset(job.r, getReportBubbleLines(job.title, job.r).length))
      .attr('fill', job => getReportBubbleTextColor(job.domainColor))
      .attr('fill-opacity', 0.92)
      .attr('font-size', job => Math.max(11, job.r * 0.32))
      .attr('font-family', '"Inter", "DIN Alternate", "PingFang SC", "Microsoft YaHei", sans-serif')
      .attr('font-weight', '700')
      .attr('letter-spacing', '0.01em')
      .attr('paint-order', 'stroke')
      .attr('stroke', 'rgba(245,245,243,0.18)')
      .attr('stroke-width', 1)
      .attr('pointer-events', 'none')
      .style('font-variant-numeric', 'tabular-nums')
      .text(job => isRealPath.value ? '' : `${Math.round(job.matchScore * 100)}%`)

    jobGroups.append('title').text(job => isRealPath.value ? job.title : `${job.title}\n匹配度 ${Math.round(job.matchScore * 100)}%\n${job.salaryRange}`)

    const innerBound = Math.max(20, domainNode.r - (d3.max(jobNodes, job => job.r) ?? 0) - 6)
    jobNodes.forEach(job => {
      job._phaseX = Math.random() * Math.PI * 2
      job._phaseY = Math.random() * Math.PI * 2
    })

    const innerSimulation = d3.forceSimulation(jobNodes)
      .alphaDecay(0)
      .alphaTarget(0.15)
      .velocityDecay(0.18)
      .force('elasticCollide', makeElasticCollideForce(jobNodes, 0.64))
      .force('center', d3.forceCenter(0, 0).strength(0.02))
      .force('wander', () => {
        jobNodes.forEach(job => {
          job._phaseX = (job._phaseX ?? 0) + 0.009 + Math.random() * 0.004
          job._phaseY = (job._phaseY ?? 0) + 0.009 + Math.random() * 0.004
          job.vx = (job.vx ?? 0) + Math.sin(job._phaseX) * 0.06
          job.vy = (job.vy ?? 0) + Math.cos(job._phaseY) * 0.06
        })
      })
      .on('tick', () => {
        jobNodes.forEach(job => {
          const distance = Math.sqrt((job.x ?? 0) ** 2 + (job.y ?? 0) ** 2)
          if (distance > innerBound && distance > 0) {
            const ratio = innerBound / distance
            job.x = (job.x ?? 0) * ratio
            job.y = (job.y ?? 0) * ratio
            const nx = (job.x ?? 0) / innerBound
            const ny = (job.y ?? 0) / innerBound
            const radialVelocity = (job.vx ?? 0) * nx + (job.vy ?? 0) * ny
            if (radialVelocity > 0) {
              job.vx = (job.vx ?? 0) - 1.65 * radialVelocity * nx
              job.vy = (job.vy ?? 0) - 1.65 * radialVelocity * ny
            }
          }
        })
        jobGroups.attr('transform', job => `translate(${job.x ?? 0},${job.y ?? 0})`)
      })

    bubbleInnerSims.push(innerSimulation)
    if (reducedMotion) {
      innerSimulation.stop().force('wander', null).tick(160)
      jobGroups.attr('transform', job => `translate(${job.x ?? 0},${job.y ?? 0})`)
    }
  })

  domainNodes.forEach(domain => {
    domain._phaseX = Math.random() * Math.PI * 2
    domain._phaseY = Math.random() * Math.PI * 2
  })

  bubbleOuterSim = d3.forceSimulation(domainNodes)
    .alphaDecay(0)
    .alphaTarget(0.12)
    .velocityDecay(0.18)
    .force('elasticCollide', makeElasticCollideForce(domainNodes, 0.7))
    .force('center', d3.forceCenter(width / 2, height / 2).strength(0.01))
    .force('wander', () => {
      domainNodes.forEach(domain => {
        domain._phaseX = (domain._phaseX ?? 0) + 0.007 + Math.random() * 0.003
        domain._phaseY = (domain._phaseY ?? 0) + 0.007 + Math.random() * 0.003
        domain.vx = (domain.vx ?? 0) + Math.sin(domain._phaseX) * 0.085
        domain.vy = (domain.vy ?? 0) + Math.cos(domain._phaseY) * 0.085
      })
    })
    .force('bound', () => {
      const minVelocity = 0.45
      domainNodes.forEach(domain => {
        const pad = domain.r + 14
        if ((domain.x ?? 0) < pad) {
          domain.x = pad
          domain.vx = Math.max(minVelocity, Math.abs(domain.vx ?? 0)) * 0.8
        }
        if ((domain.x ?? 0) > width - pad) {
          domain.x = width - pad
          domain.vx = -Math.max(minVelocity, Math.abs(domain.vx ?? 0)) * 0.8
        }
        if ((domain.y ?? 0) < pad) {
          domain.y = pad
          domain.vy = Math.max(minVelocity, Math.abs(domain.vy ?? 0)) * 0.8
        }
        if ((domain.y ?? 0) > height - pad) {
          domain.y = height - pad
          domain.vy = -Math.max(minVelocity, Math.abs(domain.vy ?? 0)) * 0.8
        }
      })
    })
    .on('tick', () => {
      domainGroups.attr('transform', domain => `translate(${domain.x ?? width / 2},${domain.y ?? height / 2})`)
      const svgRect = svg.getBoundingClientRect()
      domainLabels
        .attr('x', 0)
        .attr('y', domain => domain.labelY)
        .each(function (domain) {
          const label = d3.select(this)
          const rect = (this as SVGTextElement).getBoundingClientRect()
          let offsetX = 0
          let offsetY = 0
          const left = rect.left - svgRect.left
          const right = rect.right - svgRect.left
          const top = rect.top - svgRect.top
          const bottom = rect.bottom - svgRect.top
          if (left < labelPadding) offsetX += labelPadding - left
          if (right > width - labelPadding) offsetX -= right - (width - labelPadding)
          if (top < labelPadding) offsetY += labelPadding - top
          if (bottom > height - labelPadding) offsetY -= bottom - (height - labelPadding)
          if (offsetX !== 0 || offsetY !== 0) {
            label
              .attr('x', offsetX)
              .attr('y', domain.labelY + offsetY)
          }
        })
    })

  updateBubbleSelection()
  if(focusedJob){
    Array.from(svg.querySelectorAll<SVGGElement>('.job-node'))
      .find(node=>node.getAttribute('data-job-id')===focusedJob)?.focus({preventScroll:true})
  }
  if (reducedMotion && bubbleOuterSim) {
    bubbleOuterSim.stop().force('wander', null).tick(160)
    domainGroups.attr('transform', domain => `translate(${domain.x ?? width / 2},${domain.y ?? height / 2})`)
  }
}

function updateBubbleSelection() {
  const svg = bubbleSvgRef.value
  if (!svg) return

  const selectedId=isRealPath.value?climb.role:selectedJobId.value
  const selectedDomainId = isRealPath.value ? bubbleJobs.value.find(j=>j.id===selectedId)?.domainId : selectedJob.value ? getReportBubbleDomainMeta(selectedJob.value).domainId : ''

  d3.select(svg).selectAll<SVGGElement, ReportBubbleJobNode>('g.job-node').each(function (job) {
    const group = d3.select(this)
    const isSelected = job.id === selectedId
    group.select('.job-circle')
      .classed('job-circle--selected', isSelected)
      .attr('r', isSelected ? job.r + 3 : job.r)
      .attr('filter', isSelected ? 'url(#cr-bubble-ink-selected)' : 'url(#cr-bubble-ink-bleed)')
    group.select('.job-text')
      .attr('font-weight', isSelected ? '700' : '600')
      .attr('fill', getReportBubbleTextColor(job.domainColor, isSelected))
    group.select('.job-score')
      .attr('fill', getReportBubbleTextColor(job.domainColor, isSelected))
      .attr('fill-opacity', isSelected ? 0.98 : 0.92)
  })

  d3.select(svg).selectAll<SVGCircleElement, ReportBubbleDomainNode>('.domain-bg').each(function (domain) {
    const isActive = selectedDomainId === domain.id
    d3.select(this)
      .attr('stroke-opacity', isActive ? 0.5 : 0.28)
      .attr('stroke-width', isActive ? 1.5 : 0.8)
  })
}

watch(
  bubbleGroups,
  async () => {
    if (!bubbleSvgRef.value) return
    await nextTick()
    initBubbleChart()
  },
  { deep: true },
)

watch(selectedJobId, () => updateBubbleSelection())

/* ══ 攀岩墙布局 ══ */
type ClimbNode = { id: string; title: string; level: JobLevel|'evidence'; lineId: string; salaryRange: string; x: number; y: number }
type ClimbHold = { x: number; y: number; label: string; mastered: boolean; edgeType: 'promote' | 'transfer' }
type ClimbRope = { path: string; type: 'promote' | 'transfer'; fromId: string; toId: string; holds: ClimbHold[]; allSkills: string[]; omittedCount: number }

const CW_W = 400, CW_H = 900
const CW_NODE_R = 28

/* ── 攀岩岩点造型 (6 种不规则 SVG path) ── */
const HOLD_SHAPES: string[] = [
  /* Jug 碗型 */    'M-14,-8 C-14,-13 -8,-15 0,-15 C8,-15 14,-13 14,-8 C14,-2 10,7 5,11 C2,13 -2,13 -5,11 C-10,7 -14,-2 -14,-8Z',
  /* Crimp 捏点 */  'M-16,-5 C-16,-10 -10,-12 0,-12 C10,-12 16,-10 16,-5 C16,1 11,6 7,8 C3,10 -3,10 -7,8 C-11,6 -16,1 -16,-5Z',
  /* Pinch 侧拉 */  'M-12,-11 C-7,-15 3,-14 9,-10 C15,-6 16,0 13,5 C10,10 4,13 -1,12 C-7,11 -14,7 -15,1 C-16,-4 -15,-8 -12,-11Z',
  /* Sloper 圆球 */ 'M-11,-10 C-5,-15 5,-15 11,-10 C16,-4 16,4 11,10 C5,15 -5,15 -11,10 C-16,4 -16,-4 -11,-10Z',
  /* Volume 多面 */ 'M0,-14 L13,-6 L14,5 L6,13 L-6,13 L-14,5 L-13,-6Z',
  /* Pocket 口袋 */ 'M-13,-7 C-13,-13 -6,-14 0,-14 C6,-14 13,-13 13,-7 C13,-2 9,3 6,5 C3,3 -3,3 -6,5 C-9,3 -13,-2 -13,-7Z',
]

function getHoldShapeIndex(label: string): number {
  return strHash(label) % HOLD_SHAPES.length
}
function getHoldRotation(label: string): number {
  return (strHash(label + '_rot') % 60) - 30
}

function strHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const masteredSkillNames = computed(() => {
  const set = new Set<string>()
  for (const s of resumeStore.parsedSkills) set.add(s.name.toLowerCase())
  return set
})

function isSkillMastered(skill: string): boolean {
  if (isRealPath.value) return false
  const lower = skill.toLowerCase()
  for (const s of masteredSkillNames.value) {
    if (lower.includes(s) || s.includes(lower)) return true
  }
  return false
}

const climbLayout = computed<{ nodes: ClimbNode[]; ropes: ClimbRope[] }>(() => {
  if (isRealPath.value) return { nodes: [], ropes: [] }
  if (!selectedJob.value) return { nodes: [], ropes: [] }
  const selId = selectedJob.value.id
  const selLineId = selectedJob.value.lineId

  /* ── 1. 收集同 lineId 内晋升链（双向 BFS，找到完整连通分量）── */
  const promoteAdj = new Map<string, Array<typeof CAREER_PATH_EDGES[0]>>()
  const reverseAdj = new Map<string, Array<typeof CAREER_PATH_EDGES[0]>>()
  for (const e of CAREER_PATH_EDGES) {
    if (e.type !== 'promote' || !CLIMB_JOB_IDS.has(e.fromId) || !CLIMB_JOB_IDS.has(e.toId)) continue
    const fj = JOB_PORTRAITS.find(j => j.id === e.fromId)
    const tj = JOB_PORTRAITS.find(j => j.id === e.toId)
    if (fj?.lineId !== selLineId || tj?.lineId !== selLineId) continue
    if (!promoteAdj.has(e.fromId)) promoteAdj.set(e.fromId, [])
    promoteAdj.get(e.fromId)!.push(e)
    if (!reverseAdj.has(e.toId)) reverseAdj.set(e.toId, [])
    reverseAdj.get(e.toId)!.push(e)
  }
  const promotionEdges: typeof CAREER_PATH_EDGES = []
  const promotionIds = new Set<string>([selId])
  const queue = [selId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const e of (promoteAdj.get(cur) ?? [])) {
      if (!promotionIds.has(e.toId)) {
        promotionIds.add(e.toId); promotionEdges.push(e); queue.push(e.toId)
      }
    }
    for (const e of (reverseAdj.get(cur) ?? [])) {
      if (!promotionIds.has(e.fromId)) {
        promotionIds.add(e.fromId); promotionEdges.push(e); queue.push(e.fromId)
      }
    }
  }

  /* ── 2. 转岗边：每个晋升节点最多 2 条转岗（优先出边）── */
  const transferEdges: typeof CAREER_PATH_EDGES = []
  const usedTransferIds = new Set<string>()
  const nodeTransferCount = new Map<string, number>()
  // 收集所有可用转岗边
  const allTransferCandidates: typeof CAREER_PATH_EDGES = []
  for (const e of CAREER_PATH_EDGES) {
    if (e.type !== 'transfer' || !CLIMB_JOB_IDS.has(e.fromId) || !CLIMB_JOB_IDS.has(e.toId)) continue
    if (promotionIds.has(e.fromId) || promotionIds.has(e.toId)) allTransferCandidates.push(e)
  }
  // 按优先级排序：选中岗位直接相关 > 同 lineId > 跨 lineId
  allTransferCandidates.sort((a, b) => {
    const aDirectly = (a.fromId === selId || a.toId === selId) ? 0 : 1
    const bDirectly = (b.fromId === selId || b.toId === selId) ? 0 : 1
    if (aDirectly !== bDirectly) return aDirectly - bDirectly
    const aOther = promotionIds.has(a.fromId) ? a.toId : a.fromId
    const bOther = promotionIds.has(b.fromId) ? b.toId : b.fromId
    const aJob = JOB_PORTRAITS.find(j => j.id === aOther)
    const bJob = JOB_PORTRAITS.find(j => j.id === bOther)
    const aSame = aJob?.lineId === selLineId ? 0 : 1
    const bSame = bJob?.lineId === selLineId ? 0 : 1
    return aSame - bSame
  })
  // 每个晋升节点最多 2 条，全局最多 4 条
  const MAX_TRANSFERS = 4
  for (const e of allTransferCandidates) {
    if (transferEdges.length >= MAX_TRANSFERS) break
    const srcId = promotionIds.has(e.fromId) ? e.fromId : e.toId
    const tgtId = srcId === e.fromId ? e.toId : e.fromId
    if ((nodeTransferCount.get(srcId) ?? 0) >= 2) continue
    if (usedTransferIds.has(tgtId) || promotionIds.has(tgtId)) continue
    transferEdges.push(e)
    usedTransferIds.add(tgtId)
    nodeTransferCount.set(srcId, (nodeTransferCount.get(srcId) ?? 0) + 1)
  }

  /* ── 3. 汇总节点 ── */
  const allJobIds = new Set<string>(promotionIds)
  for (const e of transferEdges) { allJobIds.add(e.fromId); allJobIds.add(e.toId) }
  const allJobs = [...allJobIds].map(id => JOB_PORTRAITS.find(j => j.id === id)!).filter(Boolean)
  const allEdges = [...promotionEdges, ...transferEdges]

  /* ── 4. 布局：选中岗位底部居中，晋升链向上，转岗横向 ── */
  const pad = 55
  const mainLineJobs = allJobs.filter(j => promotionIds.has(j.id))
    .sort((a, b) => (LEVEL_ORDER[a.level] ?? 0) - (LEVEL_ORDER[b.level] ?? 0))
  const transferJobs = allJobs.filter(j => !promotionIds.has(j.id))

  const mainCount = mainLineJobs.length
  const mainYStep = mainCount > 1 ? (CW_H - pad * 2) / (mainCount - 1) : 0
  const nodes: ClimbNode[] = []

  mainLineJobs.forEach((j, i) => {
    nodes.push({
      id: j.id, title: j.title, level: j.level, lineId: j.lineId, salaryRange: j.salaryRange,
      x: Math.round(CW_W / 2),
      y: Math.round(CW_H - pad - i * mainYStep),
    })
  })

  // 为每个转岗节点找到其源晋升节点，放在源节点附近
  // 按源节点分组，同源 2 个转岗 → 一左一右；1 个转岗 → hash 决定侧
  const nodeMap0 = new Map(nodes.map(n => [n.id, n]))
  const srcToTransfers = new Map<string, typeof transferJobs>()
  for (const j of transferJobs) {
    const edge = transferEdges.find(e => e.fromId === j.id || e.toId === j.id)
    const srcId = edge ? (promotionIds.has(edge.fromId) ? edge.fromId : edge.toId) : selId
    if (!srcToTransfers.has(srcId)) srcToTransfers.set(srcId, [])
    srcToTransfers.get(srcId)!.push(j)
  }
  for (const [srcId, group] of srcToTransfers) {
    const srcNode = nodeMap0.get(srcId)
    const srcY = srcNode?.y ?? (CW_H / 2)
    const xOff = 120
    if (group.length >= 2) {
      // 两个转岗：一左一右
      group.forEach((j, gi) => {
        const side = gi === 0 ? -1 : 1
        const yJitter = (strHash(j.id) % 24) - 12
        nodes.push({
          id: j.id, title: j.title, level: j.level, lineId: j.lineId, salaryRange: j.salaryRange,
          x: Math.max(CW_NODE_R + 8, Math.min(CW_W - CW_NODE_R - 8, Math.round(CW_W / 2 + side * xOff))),
          y: Math.max(pad, Math.min(CW_H - pad, Math.round(srcY + yJitter))),
        })
      })
    } else {
      // 单个转岗：hash 决定侧
      const j = group[0]!
      const side = strHash(j.id) % 2 === 0 ? -1 : 1
      const yJitter = (strHash(j.id) % 24) - 12
      nodes.push({
        id: j.id, title: j.title, level: j.level, lineId: j.lineId, salaryRange: j.salaryRange,
        x: Math.max(CW_NODE_R + 8, Math.min(CW_W - CW_NODE_R - 8, Math.round(CW_W / 2 + side * xOff))),
        y: Math.max(pad, Math.min(CW_H - pad, Math.round(srcY + yJitter))),
      })
    }
  }

  /* 防重叠 */
  const nodeMinDist = CW_NODE_R * 2 + 14
  for (let iter = 0; iter < 12; iter++) {
    for (let ai = 0; ai < nodes.length; ai++) {
      for (let bi = ai + 1; bi < nodes.length; bi++) {
        const a = nodes[ai]!, b = nodes[bi]!
        const ddx = b.x - a.x, ddy = b.y - a.y
        const dist = Math.sqrt(ddx * ddx + ddy * ddy)
        if (dist < nodeMinDist && dist > 0.1) {
          const half = (nodeMinDist - dist) / 2 + 2
          const nx = ddx / dist, ny = ddy / dist
          const aMain = promotionIds.has(a.id), bMain = promotionIds.has(b.id)
          if (!aMain) a.x = Math.max(CW_NODE_R + 8, Math.min(CW_W - CW_NODE_R - 8, Math.round(a.x - nx * half)))
          a.y = Math.max(pad, Math.min(CW_H - pad, Math.round(a.y - ny * half)))
          if (!bMain) b.x = Math.max(CW_NODE_R + 8, Math.min(CW_W - CW_NODE_R - 8, Math.round(b.x + nx * half)))
          b.y = Math.max(pad, Math.min(CW_H - pad, Math.round(b.y + ny * half)))
        }
      }
    }
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const ropes: ClimbRope[] = []
  const placedSkills = new Set<string>()
  const placedHoldPositions: Array<{ x: number; y: number }> = []

  for (const edge of allEdges) {
    const fn = nodeMap.get(edge.fromId), tn = nodeMap.get(edge.toId)
    if (!fn || !tn) continue

    let path: string
    let evalCurve: (t: number) => { x: number; y: number }

    if (edge.type === 'promote') {
      const midY = (fn.y + tn.y) / 2
      const cpx = fn.x + (strHash(edge.fromId + edge.toId) % 24 - 12)
      path = `M ${fn.x} ${fn.y} Q ${cpx} ${midY} ${tn.x} ${tn.y}`
      evalCurve = (t) => ({
        x: (1 - t) * (1 - t) * fn.x + 2 * (1 - t) * t * cpx + t * t * tn.x,
        y: (1 - t) * (1 - t) * fn.y + 2 * (1 - t) * t * midY + t * t * tn.y,
      })
    } else {
      const dx = tn.x - fn.x
      const sag = Math.max(30, Math.abs(dx) * 0.35)
      const cx1 = fn.x + dx * 0.25, cy1 = fn.y + sag
      const cx2 = fn.x + dx * 0.75, cy2 = tn.y + sag
      path = `M ${fn.x} ${fn.y} C ${cx1} ${cy1} ${cx2} ${cy2} ${tn.x} ${tn.y}`
      evalCurve = (t) => ({
        x: (1-t)**3*fn.x + 3*(1-t)**2*t*cx1 + 3*(1-t)*t**2*cx2 + t**3*tn.x,
        y: (1-t)**3*fn.y + 3*(1-t)**2*t*cy1 + 3*(1-t)*t**2*cy2 + t**3*tn.y,
      })
    }

    /* 技能抓手：每条边最多 3 个显示 */
    const uniqueSkills = edge.skills.filter(s => !placedSkills.has(s))
    const displaySkills = uniqueSkills.slice(0, 3)
    displaySkills.forEach(s => placedSkills.add(s))
    const omittedCount = Math.max(0, edge.skills.length - displaySkills.length)

    const holds: ClimbHold[] = displaySkills.map((skill, si) => {
      const slots = displaySkills.length + (omittedCount > 0 ? 1 : 0) + 1
      const t = (si + 1) / slots
      const { x: bx, y: by } = evalCurve(t)
      const hash = strHash(skill), hash2 = strHash(skill + '__scatter')
      let ox = (hash % 100) - 50, oy = (hash2 % 70) - 35
      for (let it = 0; it < 8; it++) {
        for (const nd of nodes) {
          const dx2 = (bx + ox) - nd.x, dy2 = (by + oy) - nd.y
          const d = Math.sqrt(dx2 * dx2 + dy2 * dy2)
          if (d < CW_NODE_R + 18 && d > 0.1) {
            const p = (CW_NODE_R + 18 - d) + 8
            ox += (dx2 / d) * p; oy += (dy2 / d) * p
          }
        }
        for (const ph of placedHoldPositions) {
          const dx3 = (bx + ox) - ph.x, dy3 = (by + oy) - ph.y
          const d3 = Math.sqrt(dx3 * dx3 + dy3 * dy3)
          if (d3 < 54 && d3 > 0.1) {
            const p3 = (54 - d3) + 5
            ox += (dx3 / d3) * p3; oy += (dy3 / d3) * p3
          }
        }
      }
      const fx = Math.max(14, Math.min(CW_W - 14, Math.round(bx + ox)))
      const fy = Math.max(14, Math.min(CW_H - 14, Math.round(by + oy)))
      placedHoldPositions.push({ x: fx, y: fy })
      return { x: fx, y: fy, label: skill, mastered: isSkillMastered(skill), edgeType: edge.type }
    })

    ropes.push({ path, type: edge.type, fromId: edge.fromId, toId: edge.toId, holds, allSkills: edge.skills, omittedCount })
  }

  return { nodes, ropes }
})

/* ══ 差距数值 ══ */
const dimGaps = computed(() => {
  if (!selectedJob.value) return [] as Array<{ name: string; mine: number; need: number; gap: number }>
  return DIM_NAMES.map(name => {
    const mine = studentDim.value[name]
    const need = selectedJob.value!.sevenDim[name]
    return { name, mine, need, gap: need - mine }
  })
})

/* ══ D3 雷达图数据 ══ */
const crRadarData = computed<RadarDatum[]>(() => {
  const job = selectedJob.value
  if (!job) return []
  return DIM_NAMES.map(name => ({
    axis: name,
    value: studentDim.value[name],
    ref: job.sevenDim[name],
  }))
})
const reportRadarColors = ['#a62a13', '#876313', '#2f773c', '#245f99', '#7652a6', '#95551f', '#237180']

function openSkillDetails(rope: ClimbRope) {
  if(isRealPath.value){selectedPathNode.value=rope.toId;return}
  activeSkillEdge.value = {
    fromId: rope.fromId, toId: rope.toId, skills: rope.allSkills,
    fromTitle: JOB_PORTRAITS.find(job => job.id === rope.fromId)?.title ?? '',
    toTitle: JOB_PORTRAITS.find(job => job.id === rope.toId)?.title ?? '',
  }
}

/* ══ GSAP 攀岩墙动画 ══ */
function animateClimbingWall() {
  if (!climbingSvgEl.value) return
  climbTimeline?.kill()

  /* 清除上一轮 GSAP 残留的 inline style（CSS transform 会覆盖 SVG transform 属性，
     导致切换岗位后节点位置与连线不一致）。
     注意：不能用 gsap.set(el, { clearProps:'all' })，它会破坏 GSAP 内部的
     SVG transform 分解缓存，导致 translate(x,y) 丢失、节点不可见。
     直接 removeAttribute('style') 只清 CSS 行内样式，不影响 SVG 属性。 */
  const svg = climbingSvgEl.value
  svg.querySelectorAll('.cw-rope-path, .cw-hold, .cw-job-node').forEach(el => {
    el.removeAttribute('style')
  })
  const climberEl = svg.querySelector('.cw-climber')
  if (climberEl) climberEl.removeAttribute('style')
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const tl = gsap.timeline()
  climbTimeline = tl

  const ropePaths = svg.querySelectorAll('.cw-rope-path')
  ropePaths.forEach((path, i) => {
    const el = path as SVGPathElement
    const len = el.getTotalLength()
    el.style.strokeDasharray = `${len}`
    el.style.strokeDashoffset = `${len}`
    tl.to(el, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut' }, i * 0.3)
  })

  const holds = svg.querySelectorAll('.cw-hold')
  if (holds.length) {
    tl.fromTo(holds, { scale: 0, transformOrigin: 'center center' }, { scale: 1, stagger: 0.03, ease: 'back.out(2)', duration: 0.3 }, '-=0.4')
  }

  const jobNodes = svg.querySelectorAll('.cw-job-node')
  if (jobNodes.length) {
    tl.fromTo(jobNodes, { scale: 0.8, opacity: 0.5, transformOrigin: 'center center' }, { scale: 1, opacity: 1, stagger: 0.1, ease: 'elastic.out(1, 0.5)', duration: 0.6 }, '-=0.3')
  }

  const climber = svg.querySelector('.cw-climber')
  if (climber && ropePaths.length > 0 && !isRealPath.value) {
    const firstRope = ropePaths[0] as SVGPathElement
    tl.to(climber, {
      motionPath: { path: firstRope, align: firstRope, alignOrigin: [0.5, 0.5] },
      duration: 1.5, ease: 'power1.inOut',
    }, '-=0.2')
    tl.fromTo(climber, { scale: 1 }, { scale: 1.2, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.inOut' })
  }
}

watch(() => climbLayout.value, async () => { await nextTick(); animateClimbingWall() })

/* ══ 报告文本 ══ */
const reportText = computed(() => {
  if(isRealPath.value)return ''
  const job = selectedJob.value
  const user = userStore.currentUser?.name ?? '钟同学'
  if (!job) return ''
  const gaps = dimGaps.value.filter(d => d.gap > 0).map(d => `${d.name}（差 ${d.gap} 分）`).join('、') || '无明显差距'
  const plan = growthPlan.value.map(s => `**${s.phaseLabel}**：${s.goal}`).join('\n')
  return `# 职业生涯发展报告\n\n**学生**：${user}    **目标岗位**：${job.title}    **生成日期**：${new Date().toLocaleDateString('zh-CN')}\n\n## 岗位匹配摘要\n\n根据简历能力画像分析，系统匹配度最高岗位为「${job.title}」，匹配度 ${Math.round(effectiveMatchScore.value * 100)}%。\n${job.desc}。工资区间：${job.salaryRange}\n\n## 七维能力差距\n\n主要待补齐维度：${gaps}\n\n## 个性化成长计划\n\n${plan}\n\n## 关键技能要求\n\n${job.keySkills.map(s => `- ${s}`).join('\n')}\n`
})

/* ══ Markdown → HTML ══ */
function mdToHtml(md: string): string {
  return md
    .replace(/^# (.+)$/gm, '<h2 class="rp-h2">$1</h2>')
    .replace(/^## (.+)$/gm, '<h3 class="rp-h3">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/gs, '<ul class="rp-list">$&</ul>')
    .replace(/\n{2,}/g, '</p><p class="rp-p">')
    .replace(/^(?!<)(.+)/gm, '<p class="rp-p">$1</p>')
}

const reportHtml = computed(() => mdToHtml(reportTextEditable.value || reportText.value))

/* ══ 报告编辑工具 ══ */
function switchToReport() {
  if (!reportTextEditable.value) reportTextEditable.value = reportText.value
  activeMode.value = 'report'
}

function checkCompleteness() {
  const text = reportTextEditable.value
  const sections = [
    { section: '岗位匹配摘要', found: text.includes('岗位匹配摘要') },
    { section: '七维能力差距', found: text.includes('七维能力差距') },
    { section: '个性化成长计划', found: text.includes('成长计划') },
    { section: '关键技能要求', found: text.includes('技能要求') },
  ]
  checkResults.value = sections
  showCheckResults.value = true
}

function autoFillMissing() {
  const text = reportTextEditable.value
  let patched = text
  if (!text.includes('岗位匹配摘要') && selectedJob.value) {
    patched += `\n\n## 岗位匹配摘要\n\n匹配度 ${Math.round(effectiveMatchScore.value * 100)}%。${selectedJob.value.desc}\n`
  }
  if (!text.includes('七维能力差距')) {
    const gaps = dimGaps.value.filter(d => d.gap > 0).map(d => `${d.name}（差 ${d.gap} 分）`).join('、') || '无明显差距'
    patched += `\n\n## 七维能力差距\n\n主要待补齐维度：${gaps}\n`
  }
  if (!text.includes('成长计划')) {
    const plan = growthPlan.value.map(s => `**${s.phaseLabel}**：${s.goal}`).join('\n')
    patched += `\n\n## 个性化成长计划\n\n${plan}\n`
  }
  if (!text.includes('技能要求') && selectedJob.value) {
    patched += `\n\n## 关键技能要求\n\n${selectedJob.value.keySkills.map(s => `- ${s}`).join('\n')}\n`
  }
  reportTextEditable.value = patched
  checkCompleteness()
}

function polishReport() {
  polishLoading.value = true
  polishDiff.value = null
  const before = reportTextEditable.value
  setTimeout(() => {
    let after = before
    after = after.replace(/匹配度 (\d+)%/g, '综合匹配度达 $1%')
    after = after.replace(/主要待补齐维度/g, '根据七维能力模型分析，主要待补齐维度')
    after = after.replace(/工资区间/g, '市场薪资参考区间')
    if (!after.includes('总结与展望')) {
      after += '\n\n## 总结与展望\n\n通过系统的技能补齐与实践积累，有望在 12–18 个月内达成目标岗位的核心能力要求。建议持续关注行业动态，及时调整成长路径。\n'
    }
    polishDiff.value = { before, after }
    polishLoading.value = false
  }, 1500)
}

function applyPolish() {
  if (polishDiff.value) {
    reportTextEditable.value = polishDiff.value.after
    polishDiff.value = null
  }
}

function refreshReportData() {
  reportTextEditable.value = artifactReady.value ? agentReportOriginal.value : reportText.value
}

function exportPrint() { showExportMenu.value = false; window.print() }

function exportCopy() {
  showExportMenu.value = false
  navigator.clipboard.writeText(reportTextEditable.value || reportText.value)
}

function exportDownload() {
  showExportMenu.value = false
  const blob = new Blob([reportTextEditable.value || reportText.value], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = '职业发展报告.md'; a.click()
  URL.revokeObjectURL(url)
}

const wordCount = computed(() => (reportTextEditable.value || reportText.value).length)

function scrollToJobs() {
  bubblePanelRef.value?.scrollIntoView({ behavior: 'auto', block: 'start' })
}

function selectJob(id: string, fromBubble = false) {
  if(isRealPath.value){
    if(id.startsWith('reference-')){selectedPathNode.value=id;wallNoteOpen.value=true;return}
    if(id.startsWith('personal-')){selectedPathNode.value=id;wallNoteOpen.value=true;focusPathPart(wallReadingTarget(id));return}
    selectedPathNode.value='personal-start';climb.choose(id);return
  }
  // Expanding the wall above the mobile picker must not move the picker out of view.
  const main = analysisMainRef.value
  const oldPickerTop = fromBubble && window.matchMedia('(max-width: 1023px)').matches
    ? bubblePanelRef.value?.getBoundingClientRect().top
    : undefined
  selectedJobId.value = id
  activeSkillEdge.value = null
  if (main && oldPickerTop !== undefined) {
    void nextTick(() => {
      const newTop = bubblePanelRef.value?.getBoundingClientRect().top
      if (newTop !== undefined) main.scrollTop += newTop - oldPickerTop
    })
  }
  /* 延迟加载成长计划，模拟 Agent 分析过程 */
  planTimers.forEach(t => clearTimeout(t))
  planTimers = []
  planStages.value = []
  if (!id) { planLoading.value = false; radarLoading.value = false; radarReady.value = false; return }
  planLoading.value = true
  radarLoading.value = true
  radarReady.value = false
  planTimers.push(setTimeout(() => { radarReady.value = true }, 700))
  planTimers.push(setTimeout(() => { radarLoading.value = false }, 1400))
  const raw = getGrowthPlan(id)
  if (!raw.length) { planLoading.value = false; return }
  planTimers.push(setTimeout(() => {
    if (raw[0]) planStages.value = [{ ...raw[0], tasks: [] }]
  }, 900))
  /* 短期任务逐条 */
  if (raw[0]) {
    raw[0].tasks.forEach((_, ti) => {
      planTimers.push(setTimeout(() => {
        if (planStages.value[0]) planStages.value[0].tasks = raw[0]!.tasks.slice(0, ti + 1)
      }, 1100 + ti * 140))
    })
  }
  const shortDone = 1100 + (raw[0]?.tasks.length ?? 0) * 140 + 400
  /* 中期卡片 */
  if (raw[1]) {
    planTimers.push(setTimeout(() => {
      planStages.value = [...planStages.value, { ...raw[1]!, tasks: [] }]
    }, shortDone))
    raw[1].tasks.forEach((_, ti) => {
      planTimers.push(setTimeout(() => {
        if (planStages.value[1]) planStages.value[1].tasks = raw[1]!.tasks.slice(0, ti + 1)
      }, shortDone + 200 + ti * 140))
    })
    const midDone = shortDone + 200 + raw[1].tasks.length * 140 + 200
    planTimers.push(setTimeout(() => { planLoading.value = false }, midDone))
  } else {
    planTimers.push(setTimeout(() => { planLoading.value = false }, shortDone))
  }
}
function goBack() { artifactReady.value || hasArtifactQuery.value ? backToAgent() : router.push({ name: 'student-career-navigation' }) }
function goToFavorites() { router.push({ name: 'student-favorites' }) }
function goToLearningCenter() {
  if (!selectedJob.value) return
  router.push({ name: 'student-learning', query: { role: selectedJob.value.title } })
}
function toggleStage(phase: string) {
  if (expandedStages.value.has(phase)) expandedStages.value.delete(phase)
  else expandedStages.value.add(phase)
}
async function initReportVisualization() {
  await nextTick()
  stopBubbleChart()
  bubbleResizeObserver?.disconnect()
  bubbleResizeObserver = null
  if (hasArtifactQuery.value || activeMode.value !== 'analysis') return
  initBubbleChart()
  if (bubbleSvgRef.value) {
    bubbleResizeObserver = new ResizeObserver(() => initBubbleChart())
    bubbleResizeObserver.observe(bubbleSvgRef.value)
  }
}

function refreshMotionPreference() {
  if (activeMode.value === 'analysis' && !hasArtifactQuery.value) initBubbleChart()
  animateClimbingWall()
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionQuery.addEventListener('change', refreshMotionPreference)
  void initReportVisualization()
})

watch(activeMode, async mode => {
  showExportMenu.value = false
  if (mode === 'analysis') {
    await initReportVisualization()
    animateClimbingWall()
  } else {
    stopBubbleChart()
    bubbleResizeObserver?.disconnect()
    bubbleResizeObserver = null
    climbTimeline?.kill()
  }
}, { flush: 'post' })

onMounted(async () => {
  const uid = userStore.currentUser?.id
  if (getApiMode() !== 'http' || !uid) return
  try {
    const rows = await getReportList(uid)
    hasServerReports.value = hasServerReportCollection(getApiMode(), rows)
  } catch {
    hasServerReports.value = false
  }
})

watch(hasArtifactQuery, async (hasArtifact, previous) => {
  if (hasArtifact) {
    stopBubbleChart()
    bubbleResizeObserver?.disconnect()
    bubbleResizeObserver = null
  } else if (previous) {
    activeMode.value = 'analysis'
    reportTextEditable.value = ''
    agentReportOriginal.value = ''
    reportSaved.value = false
    await initReportVisualization()
  }
})

watch(artifactReady, ready => {
  if (!ready) return
  const artifact = handoff.artifact.value
  const markdown = reportPreview.value?.markdown
  agentReportOriginal.value = typeof markdown === 'string' && markdown.trim()
    ? markdown
    : `# ${artifact?.title || '职业报告'}\n\n## 报告摘要\n\n${artifact?.summary || '请在此编辑来自 Agent 对话的报告。'}\n`
  reportTextEditable.value = agentReportOriginal.value
  activeMode.value = 'report'
  reportSaved.value = false
}, { immediate: true })

watch(reportTextEditable, markdown => {
  const artifact = handoff.artifact.value
  if (!artifactReady.value || !artifact) return
  const preview = (artifact.preview && typeof artifact.preview === 'object' ? artifact.preview : {}) as ReportArtifactPreview
  preview.markdown = markdown
  preview.chapters = [...markdown.matchAll(/^##\s+(.+)$/gm)].map(match => match[1] || '').filter(Boolean)
  preview.word_count = markdown.length
  artifact.preview = preview
  commitMockArtifactHandoff(handoff.sessionId.value, artifact)
})

onBeforeUnmount(() => {
  motionQuery?.removeEventListener('change', refreshMotionPreference)
  stopBubbleChart()
  if (bubbleResizeObserver) {
    bubbleResizeObserver.disconnect()
    bubbleResizeObserver = null
  }
  climbTimeline?.kill()
  planTimers.forEach(t => clearTimeout(t))
})
</script>

<template>
  <div class="cr-page" @keydown.esc="activeSkillEdge = null; showExportMenu = false">

    <!-- ══ HEADER ══ -->
    <header class="cr-header">
      <div class="cr-header__left">
        <button class="cr-back" @click="goBack">
          <Icon icon="lucide:arrow-left" :width="14"/><span>返回</span>
        </button>
      </div>
      <div class="cr-header__tabs">
        <button v-if="!hasArtifactQuery" class="cr-tab" :class="{ 'cr-tab--active': activeMode === 'analysis' }" @click="activeMode = 'analysis'">
          <Icon icon="lucide:bar-chart-3" :width="13"/><span>{{ isRealPath ? '职业攀岩路径' : '职业分析' }}</span>
        </button>
        <button v-if="!isRealPath && (!hasArtifactQuery || artifactReady)" class="cr-tab" :class="{ 'cr-tab--active': activeMode === 'report' }" @click="switchToReport">
          <Icon icon="lucide:file-text" :width="13"/><span>报告编辑</span>
        </button>
      </div>
      <div class="cr-header__right">
        <button v-if="hasArtifactQuery" class="cr-back" @click="browseOrdinaryReport">退出对话产物</button>
        <button
          v-if="!isRealPath && (!hasArtifactQuery || artifactReady)"
          class="cr-save-btn"
          :disabled="reportSaved"
          @click="saveCareerReport"
          title="保存本次报告到我的报告"
        >
          <Icon :icon="reportSaved ? 'lucide:check' : 'lucide:save'" :width="12"/>
          <span>{{ reportSaved ? '已保存' : '保存报告' }}</span>
        </button>
        <!-- 导出按钮（仅报告模式） -->
        <div v-if="(!hasArtifactQuery || artifactReady) && activeMode === 'report'" class="cr-export-wrap">
          <button class="cr-export-btn" @click="showExportMenu = !showExportMenu">
            <Icon icon="lucide:download" :width="12"/><span>导出</span><Icon icon="lucide:chevron-down" :width="10"/>
          </button>
          <div v-if="showExportMenu" class="cr-export-menu">
            <button @click="exportPrint"><Icon icon="lucide:printer" :width="12"/>打印 / PDF</button>
            <button @click="exportCopy"><Icon icon="lucide:copy" :width="12"/>复制到剪贴板</button>
            <button @click="exportDownload"><Icon icon="lucide:file-down" :width="12"/>下载 .md 文件</button>
          </div>
        </div>
        <!-- 生成报告按钮（仅分析模式） -->
        <button v-else-if="!isRealPath && !hasArtifactQuery" class="cr-report-btn" :disabled="!selectedJob" @click="switchToReport">
          <Icon icon="lucide:file-text" :width="12"/><span>生成报告</span>
        </button>
        <button class="cr-my-reports-btn" @click="router.push({ name: 'student-my-reports' })">
          <Icon icon="lucide:book-open" :width="12"/><span>我的报告</span>
        </button>
        <button v-if="hasServerReports && !hasArtifactQuery" class="cr-my-reports-btn cr-discuss-btn" aria-label="与 Agent 讨论已有报告" title="仅引用服务端已有报告，由 Agent 逐份核验；不包含本页计算或本地保存内容" @click="askAgentToCheckExistingReports">
          <Icon icon="lucide:message-circle" :width="12"/><span>与 Agent 讨论已有报告</span>
        </button>
      </div>
      <div class="cr-header__identity"><UserInfoBar /></div>
    </header>
    <nav v-if="isRealPath" class="cr-personal-jumps" aria-label="职业攀岩路径内容定位"><button @click="focusPathPart('career-path-wall')">攀岩路径</button><button @click="focusPathPart('career-path-position')">我的起点与下一步</button><button @click="focusPathPart('career-path-evidence')">本人画像与经历</button></nav>

    <section v-if="hasArtifactQuery && !artifactReady" class="cr-agent-state" role="status">
      <Icon :icon="handoff.loading.value ? 'lucide:loader-circle' : 'lucide:circle-alert'" :width="26" />
      <h2>{{ handoff.loading.value ? '正在读取对话报告' : '无法打开这份报告' }}</h2>
      <p v-if="!handoff.loading.value">{{ handoff.error.value || '成果物类型与职业报告不匹配。' }}</p>
      <button type="button" @click="browseOrdinaryReport">浏览普通职业报告</button>
    </section>

    <div v-if="artifactReady" class="cr-agent-context">
      <strong>来自 Agent 对话 · 演示报告</strong>
      <span>{{ handoff.artifact.value?.title }} · 编辑内容将同步到原对话产物</span>
    </div>

    <!-- ═══════════════════════════════════════════ -->
    <!--              模式 A：职业分析                 -->
    <!-- ═══════════════════════════════════════════ -->
    <div v-if="(!hasArtifactQuery || artifactReady) && activeMode === 'analysis'" ref="analysisMainRef" class="cr-main" :class="{ 'cr-main--selected': hasClimbTarget, 'cr-main--real': isRealPath }" aria-label="职业报告分析">

      <!-- ══ 左栏：攀岩墙路径图 ══ -->
      <div id="career-path-wall" class="cr-left" tabindex="-1">
        <div class="cr-panel-title">
          <Icon icon="lucide:mountain" :width="12"/>
          <span>{{ isRealPath ? '职业关联图谱' : '职业攀岩路径' }}</span>
          <span v-if="hasClimbTarget" class="cr-panel-sub">{{ isRealPath ? '关联方向 · ' + climb.role : selectedJob?.title + ' 所在线路' }}</span>
        </div>

        <CareerRelationGraph v-if="isRealPath" :focus-role="climb.role" compact @select-role="climb.choose" />
        <div v-else class="cr-cw-wrap">
          <svg
            v-if="climbLayout.nodes.length"
            ref="climbingSvgEl"
            class="cr-cw-svg"
            :viewBox="`0 0 ${CW_W} ${isRealPath ? 680 : CW_H}`"
            preserveAspectRatio="xMidYMid meet"
            overflow="visible"
            fill="none"
          >
            <defs>
              <!-- 墙面纹理滤镜 -->
              <filter id="cw-wall-tex" x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" seed="5" result="noise"/>
                <feDiffuseLighting in="noise" lighting-color="#f5f1e8" surfaceScale="0.6" result="lit">
                  <feDistantLight azimuth="225" elevation="50"/>
                </feDiffuseLighting>
                <feComposite in="SourceGraphic" in2="lit" operator="arithmetic" k1="0.12" k2="0.88" k3="0" k4="0"/>
              </filter>
              <!-- T-nut 螺栓孔网格 -->
              <pattern id="cw-tnut" x="0" y="0" width="56" height="56" patternUnits="userSpaceOnUse">
                <circle cx="28" cy="28" r="2.6" fill="rgba(0,0,0,0.13)"/>
                <circle cx="28" cy="28" r="1" fill="rgba(0,0,0,0.07)"/>
              </pattern>
              <!-- 拼板缝隙 -->
              <pattern id="cw-seams" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="200" stroke="rgba(0,0,0,0.04)" stroke-width="1"/>
                <line x1="0" y1="0" x2="200" y2="0" stroke="rgba(0,0,0,0.03)" stroke-width="1"/>
              </pattern>
              <!-- 岩点渐变：已掌握 (绿) -->
              <radialGradient id="cw-hold-green" cx="40%" cy="35%" r="60%">
                <stop offset="0%" stop-color="#6DD4A8" stop-opacity="1"/>
                <stop offset="60%" stop-color="#3DB88C" stop-opacity="1"/>
                <stop offset="100%" stop-color="#2A8A66" stop-opacity="1"/>
              </radialGradient>
              <!-- 岩点渐变：未掌握 (橙红) -->
              <radialGradient id="cw-hold-orange" cx="40%" cy="35%" r="60%">
                <stop offset="0%" stop-color="#F4A574" stop-opacity="1"/>
                <stop offset="60%" stop-color="#E8764A" stop-opacity="1"/>
                <stop offset="100%" stop-color="#C45530" stop-opacity="1"/>
              </radialGradient>
              <!-- 岩点渐变：未掌握 蓝(转岗) -->
              <radialGradient id="cw-hold-blue" cx="40%" cy="35%" r="60%">
                <stop offset="0%" stop-color="#8AB8E0" stop-opacity="1"/>
                <stop offset="60%" stop-color="#5A9BD4" stop-opacity="1"/>
                <stop offset="100%" stop-color="#3A78B0" stop-opacity="1"/>
              </radialGradient>
              <!-- 岩点渐变：已掌握 蓝(转岗) -->
              <radialGradient id="cw-hold-blue-ok" cx="40%" cy="35%" r="60%">
                <stop offset="0%" stop-color="#7ED4B8" stop-opacity="1"/>
                <stop offset="60%" stop-color="#4ABEAA" stop-opacity="1"/>
                <stop offset="100%" stop-color="#2E9C8A" stop-opacity="1"/>
              </radialGradient>
              <!-- 路线箭头 marker -->
              <marker id="cw-arrow-promote" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6" fill="none" stroke="rgba(210,80,45,0.5)" stroke-width="1.2"/>
              </marker>
              <marker id="cw-arrow-transfer" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6" fill="none" stroke="rgba(74,130,200,0.45)" stroke-width="1.2"/>
              </marker>
              <!-- 节点渐变 -->
              <radialGradient id="cw-node-idle" cx="45%" cy="40%" r="55%">
                <stop offset="0%" stop-color="#F0ECE6" stop-opacity="1"/>
                <stop offset="100%" stop-color="#D8D2C8" stop-opacity="1"/>
              </radialGradient>
              <!-- 节点投影滤镜 -->
              <filter id="cw-node-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.22)"/>
              </filter>
              <filter id="cw-hold-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="rgba(0,0,0,0.28)"/>
              </filter>
            </defs>

            <!-- 墙面底色 + 纹理（大幅超出 viewBox，配合 overflow=visible 覆盖全容器） -->
            <rect x="-400" y="-200" :width="CW_W + 800" :height="CW_H + 400" fill="var(--cr-wall-base)"/>
            <rect x="-400" y="-200" :width="CW_W + 800" :height="CW_H + 400" fill="var(--cr-wall-light)" filter="url(#cw-wall-tex)"/>
            <rect x="-400" y="-200" :width="CW_W + 800" :height="CW_H + 400" fill="url(#cw-tnut)"/>
            <rect x="-400" y="-200" :width="CW_W + 800" :height="CW_H + 400" fill="url(#cw-seams)"/>

            <!-- 路线色带（底层宽带 + 上层细线） -->
            <g v-for="rope in climbLayout.ropes" :key="rope.type+':'+rope.fromId+'-'+rope.toId">
              <path
                class="cw-rope-tape"
                :d="rope.path"
                :stroke="rope.type === 'promote' ? 'rgba(210,80,45,0.18)' : 'rgba(74,130,200,0.15)'"
                :stroke-width="rope.type === 'promote' ? 8 : 7"
                fill="none" stroke-linecap="round" stroke-linejoin="round"
              />
              <path
                class="cw-rope-path"
                :d="rope.path"
                :stroke="rope.type === 'promote' ? 'rgba(210,80,45,0.55)' : 'rgba(74,130,200,0.45)'"
                :stroke-width="rope.type === 'promote' ? 2.5 : 2"
                fill="none" stroke-linecap="round"
                :stroke-dasharray="rope.type === 'transfer' ? '8 4' : 'none'"
                :marker-end="rope.type === 'promote' ? 'url(#cw-arrow-promote)' : 'url(#cw-arrow-transfer)'"
              />
            </g>

            <!-- 技能岩点 + 省略标记 -->
            <g v-for="rope in climbLayout.ropes" :key="'h:'+rope.type+':'+rope.fromId+'-'+rope.toId">
              <g v-for="hold in rope.holds" :key="hold.label" class="cw-hold"
                :transform="`translate(${hold.x},${hold.y}) rotate(${getHoldRotation(hold.label)})`"
                role="button" tabindex="0" :aria-label="`查看技能：${hold.label}`"
                @click.stop="openSkillDetails(rope)"
                @keydown.enter.prevent="openSkillDetails(rope)" @keydown.space.prevent="openSkillDetails(rope)"
              >
                <circle r="22" fill="transparent"/>
                <!-- 岩点造型 -->
                <path
                  :d="HOLD_SHAPES[getHoldShapeIndex(hold.label)]"
                  :fill="hold.mastered
                    ? (hold.edgeType === 'promote' ? 'url(#cw-hold-green)' : 'url(#cw-hold-blue-ok)')
                    : (hold.edgeType === 'promote' ? 'url(#cw-hold-orange)' : 'url(#cw-hold-blue)')"
                  :stroke="hold.mastered ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.12)'"
                  stroke-width="0.8"
                  filter="url(#cw-hold-shadow)"
                />
                <!-- 螺栓孔 -->
                <circle r="2" fill="rgba(0,0,0,0.15)" cy="-1"/>
                <circle r="0.8" fill="rgba(0,0,0,0.08)" cy="-1"/>
                <!-- 技能标签（反转旋转，保持水平） -->
                <text :y="18" text-anchor="middle" class="cw-hold-text"
                  :transform="`rotate(${-getHoldRotation(hold.label)})`">
                  {{ hold.label.length > 6 ? hold.label.slice(0,6) + '…' : hold.label }}
                </text>
                <title>{{ isRealPath ? hold.label+'（点击查看相关内容）' : hold.label+(hold.mastered ? ' ✓ 已掌握' : ' ✗ 未掌握')+'（点击查看全部技能）' }}</title>
              </g>
              <g v-if="rope.omittedCount > 0 && rope.holds.length > 0" class="cw-hold cw-hold--more"
                :transform="`translate(${(rope.holds[rope.holds.length - 1]?.x ?? 0) + 38},${rope.holds[rope.holds.length - 1]?.y ?? 0})`"
                role="button" tabindex="0" :aria-label="`查看其余 ${rope.omittedCount} 项技能`"
                @click.stop="openSkillDetails(rope)"
                @keydown.enter.prevent="openSkillDetails(rope)" @keydown.space.prevent="openSkillDetails(rope)"
              >
                <circle r="22" fill="transparent"/>
                <circle r="12" fill="rgba(120,115,105,0.12)" stroke="rgba(120,115,105,0.3)" stroke-width="1.2" stroke-dasharray="3 2"/>
                <text y="4" text-anchor="middle" class="cw-hold-text" style="fill:rgba(100,90,78,0.7)">+{{ rope.omittedCount }}</text>
                <title>还有 {{ rope.omittedCount }} 项技能，点击查看</title>
              </g>
            </g>

            <!-- 岗位节点（立体攀岩平台） -->
            <g
              v-for="node in climbLayout.nodes" :key="node.id"
              class="cw-job-node"
              :transform="`translate(${node.x},${node.y})`"
              role="button" tabindex="0" :aria-label="`${node.title}，${node.salaryRange}`"
              @click="selectJob(node.id)"
              @keydown.enter.prevent="selectJob(node.id)" @keydown.space.prevent="selectJob(node.id)"
              filter="url(#cw-node-shadow)"
            >
              <!-- 选中态外发光环 -->
              <circle v-if="(isRealPath ? selectedPathNode : selectedJobId) === node.id"
                :r="CW_NODE_R + 7" fill="none"
                :stroke="LINE_COLORS[node.lineId] ?? '#E85D3A'" stroke-width="2"
                opacity="0.3" class="cw-node-glow"
              />
              <!-- 主体圆盘 -->
              <circle
                :r="CW_NODE_R"
                :fill="(isRealPath ? selectedPathNode : selectedJobId) === node.id
                  ? (LINE_COLORS[node.lineId] ?? '#E85D3A')
                  : 'url(#cw-node-idle)'"
                :stroke="LINE_COLORS[node.lineId] ?? '#E85D3A'"
                :stroke-width="(isRealPath ? selectedPathNode : selectedJobId) === node.id ? 2.5 : 1.8"
              />
              <!-- 高光弧线 -->
              <circle
                :r="CW_NODE_R - 5" fill="none"
                :stroke="(isRealPath ? selectedPathNode : selectedJobId) === node.id ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.35)'"
                stroke-width="0.8"
              />
              <!-- 螺栓固定孔 -->
              <circle r="2.5" :cy="-(CW_NODE_R - 3)" fill="rgba(0,0,0,0.12)"/>
              <circle r="2.5" :cy="CW_NODE_R - 3" fill="rgba(0,0,0,0.12)"/>
              <!-- 文字 -->
              <text y="-3" text-anchor="middle"
                class="cw-node-title"
                :class="{ 'cw-node-title--active': (isRealPath ? selectedPathNode : selectedJobId) === node.id }">
                {{ node.title.length > 6 ? node.title.slice(0,6) : node.title }}
              </text>
              <text y="9" text-anchor="middle"
                class="cw-node-sub"
                :class="{ 'cw-node-sub--active': (isRealPath ? selectedPathNode : selectedJobId) === node.id }">
                {{ node.salaryRange }}
              </text>
              <title>{{ node.title }} · {{ node.salaryRange }}</title>
            </g>

            <!-- 攀登者标记 -->
            <g v-if="hasClimbTarget" class="cw-climber"
              :transform="`translate(${climbLayout.nodes.find(n => n.id === selectedClimbId)?.x ?? CW_W/2},${(climbLayout.nodes.find(n => n.id === selectedClimbId)?.y ?? CW_H - 50) + 28})`"
            >
              <!-- 脉冲光圈 -->
              <circle r="10" fill="none" stroke="rgba(210,80,45,0.4)" stroke-width="1.5" class="cw-climber-pulse"/>
              <circle r="5" fill="rgba(210,80,45,0.15)"/>
              <!-- 攀登者简笔图标 -->
              <g transform="scale(0.6) translate(-12,-16)">
                <circle cx="12" cy="4" r="3.5" fill="#5A534E" stroke="#fff" stroke-width="0.6"/>
                <path d="M12,8 L12,18 M8,12 L16,12 M12,18 L8,24 M12,18 L16,24" stroke="#5A534E" stroke-width="2" stroke-linecap="round" fill="none"/>
              </g>
              <text y="22" text-anchor="middle" class="cw-origin-label">{{ isRealPath ? '从本人经历出发' : '当前位置' }}</text>
            </g>

          </svg>

          <!-- 图例（HTML 浮层，固定在容器左上角） -->
          <div v-if="!isRealPath" class="cw-legend-overlay">
            <div class="cw-legend-item"><span class="cw-legend-line cw-legend-line--promote"></span><span>晋升路径</span></div>
            <div class="cw-legend-item"><span class="cw-legend-line cw-legend-line--transfer"></span><span>转岗路径</span></div>
            <div class="cw-legend-item"><span class="cw-legend-dot cw-legend-dot--mastered"></span><span>已掌握</span></div>
            <div class="cw-legend-item"><span class="cw-legend-dot cw-legend-dot--unmastered"></span><span>未掌握</span></div>
          </div>
          <div v-if="isRealPath && hasClimbTarget && wallNoteOpen" class="cw-personal-note" role="status">
            <button class="cw-sp-close" aria-label="关闭路线说明" @click="wallNoteOpen=false"><Icon icon="lucide:x" :width="16" /></button>
            <strong>{{ selectedPathNode.startsWith('reference-') ? climbLayout.nodes.find(n=>n.id===selectedPathNode)?.title : selectedPathNode==='personal-target' ? climb.role : selectedPathNode==='personal-next' ? '先做的一件事' : '从已有经历开始' }}</strong>
            <p>{{ selectedPathNode.startsWith('reference-') ? '这是职业发展的参考，不表示你的当前职级，也不是晋升承诺。' : selectedPathNode==='personal-target' ? '这是你选择探索的方向，不表示已达到岗位要求。' : selectedPathNode==='personal-next' ? '优先一步的具体内容和原因，见个人解读。' : '从已确认的经历出发，阅读你与这个方向的联系。' }}</p>
            <button type="button" class="cw-personal-note__read" @click="focusPathPart(wallReadingTarget(selectedPathNode))">{{ selectedPathNode==='personal-start' ? '阅读我的起点' : selectedPathNode==='personal-next' ? '阅读下一步' : '查看所选方向' }}<Icon icon="lucide:arrow-right" :width="12"/></button>
          </div>

          <!-- 技能详情浮动面板 -->
          <div v-if="activeSkillEdge" class="cw-skill-panel" role="region" aria-label="路线技能详情" @click.stop>
            <div class="cw-sp-header">
              <span class="cw-sp-title">{{ activeSkillEdge.fromTitle }} → {{ activeSkillEdge.toTitle }}</span>
              <button class="cw-sp-close" aria-label="关闭技能详情" @click="activeSkillEdge = null"><Icon icon="lucide:x" :width="16"/></button>
            </div>
            <ul class="cw-sp-list">
              <li v-for="skill in activeSkillEdge.skills" :key="skill" class="cw-sp-item">
                <span class="cw-sp-dot" :class="isSkillMastered(skill) ? 'cw-sp-dot--ok' : 'cw-sp-dot--gap'"></span>
                <span class="cw-sp-name">{{ skill }}</span>
                <span v-if="isSkillMastered(skill)" class="cw-sp-tag cw-sp-tag--ok">已掌握</span>
                <span v-else class="cw-sp-tag cw-sp-tag--gap">待提升</span>
              </li>
            </ul>
          </div>

          <!-- 未选岗位引导 -->
          <div v-if="!hasClimbTarget" class="cr-guide-overlay">
            <Icon icon="lucide:mountain" :width="28" class="cr-guide-icon"/>
            <p class="cr-guide-text cr-guide-desktop">请先在右侧<br/><strong>点击岗位气泡</strong></p>
            <Icon icon="lucide:arrow-right" :width="18" class="cr-guide-arrow cr-guide-desktop"/>
            <p class="cr-guide-text cr-guide-mobile">选择目标岗位后，查看你的攀岩路径</p>
            <button class="cr-guide-mobile cr-report-btn" @click="scrollToJobs">选择目标岗位 <Icon icon="lucide:arrow-down" :width="16"/></button>
          </div>
        </div>
      </div>

      <!-- ══ 中栏 ══ -->
      <div class="cr-center">

        <div v-if="isRealPath" class="cr-hero cr-real-heading">
          <div class="cr-hero__info"><div class="cr-hero-job">{{ climb.selected ? '围绕「'+climb.role+'」查看职业关联' : '选择一个职业方向' }}</div><p class="cr-hero-desc">图中只显示已发布职业资料共享的规范技能。个人进展另依据本人确认资料展示，不代表晋升顺序或岗位匹配。</p></div>
          <button type="button" class="cr-real-button cr-real-button--quiet cr-source-refresh" :disabled="climb.loading" @click="climb.load">刷新资料</button>
        </div>

        <!-- ① Hero 概览条 -->
        <div v-if="!isRealPath && selectedJob" class="cr-hero">
          <div class="cr-hero__gauge">
            <svg viewBox="0 0 80 80" class="cr-hero-ring">
              <circle cx="40" cy="40" r="34" fill="none" stroke="var(--bg-300)" stroke-width="5"/>
              <circle cx="40" cy="40" r="34" fill="none"
                :stroke="LINE_COLORS[selectedJob.lineId] ?? '#8B2500'"
                stroke-width="5" stroke-linecap="round"
                :stroke-dasharray="`${Math.round(effectiveMatchScore * 213.6)} 213.6`"
                transform="rotate(-90 40 40)"/>
              <text x="40" y="38" text-anchor="middle" class="cr-hero-pct">{{ Math.round(effectiveMatchScore * 100) }}%</text>
              <text x="40" y="50" text-anchor="middle" class="cr-hero-pct-label">匹配度</text>
            </svg>
          </div>
          <div class="cr-hero__info">
            <div class="cr-hero-job">{{ selectedJob.title }}</div>
            <div class="cr-hero-desc">{{ selectedJob.desc }}</div>
            <button class="cr-hero-courses-btn" @click="goToLearningCenter">
              <Icon icon="lucide:book-open" :width="13"/>
              <span>查看岗位课程</span>
            </button>
          </div>
        </div>

        <!-- 中栏上半：气泡图 + 雷达图 -->
        <div class="cr-center-top">

          <!-- ③ 气泡图 -->
          <div ref="bubblePanelRef" class="cr-bubble-panel">
            <div class="cr-panel-title">
              <Icon icon="lucide:circle-dot" :width="12"/>
              <span>{{ isRealPath ? '选择想探索的方向' : '岗位匹配气泡图' }}</span>
              <span v-if="selectedJob" class="cr-panel-sub">气泡越大匹配度越高</span>
              <span v-else class="cr-panel-sub cr-panel-sub--hint">点击气泡选择目标岗位</span>
            </div>
            <div v-if="isRealPath" id="career-path-direction" class="cr-real-picker" tabindex="-1">
              <nav v-if="!climb.selected && climb.recentRoles.length" class="cr-recent-directions" aria-label="接着看上次的方向"><span>接着看</span><button v-for="r in climb.recentRoles" :key="r" class="cr-real-button cr-real-button--quiet" @click="climb.choose(r)">{{ r }}</button></nav>
              <label>查找方向<input v-model="climb.search" placeholder="输入方向名称" maxlength="100" /></label>
              <select :value="climb.role" aria-label="目标职业方向" @change="climb.choose(($event.target as HTMLSelectElement).value)"><option value="">选择一个方向</option><option v-for="c in climb.catalogue" :key="c.role" :value="c.role">{{ c.role }}</option></select>
              <p v-if="climb.loading" role="status">正在读取本人资料与方向目录…</p>
              <p v-else-if="climb.role && !climb.selected">目录中还没有“{{ climb.role }}”这一同名方向，请在这里选择想了解的方向；不会把名称相近的岗位自动当作同一个。</p>
              <p v-else-if="!climb.catalogue.length">暂时无法取得职业方向，请刷新资料后再看。</p>
              <p v-else>气泡大小只为排版，不表示匹配程度。</p>
            </div>
            <div class="cr-bubble-canvas">
              <svg ref="bubbleSvgRef" class="cr-bubble-svg"></svg>
            </div>
            <nav v-if="isRealPath && climb.pages>1" class="cr-real-pagination" aria-label="职业方向翻页"><button :disabled="climb.page===0" @click="climb.page--">上一组</button><span>{{ climb.page+1 }} / {{ climb.pages }}</span><button :disabled="climb.page+1>=climb.pages" @click="climb.page++">下一组</button></nav>
          </div>

          <!-- ② 雷达图 + 差距条 -->
          <div id="career-path-position" class="cr-radar-panel" tabindex="-1">
            <template v-if="isRealPath">
              <div class="cr-panel-title"><Icon icon="lucide:map-pin" :width="12"/><span>我的起点与下一步</span></div>
              <CareerStartingPoint v-if="climb.positioning" :value="climb.positioning" actionable @respond="respondToNextStep" />
              <div v-else class="cr-real-intro"><h2>{{ climb.role ? '先理解你已经做过的事' : '先选一个你想了解的方向' }}</h2><p>{{ climb.role ? '结合本人确认的经历和方向资料，看看哪些能衔接、哪些还需了解。不必先填计划或投入时间。' : '选择方向不会自动认定你已经适合它，也不会自动生成计划。' }}</p></div>
              <div class="cr-real-discussion" :data-analysis-status="climb.latest?.status || ''">
                <p v-if="climb.positioning" class="cr-saved-position" role="status"><Icon icon="lucide:check" :width="12"/>解读已保存</p>
                <p v-if="climb.sourceError" role="alert">{{ climb.sourceError }}</p>
                <p v-else-if="climb.workbench && !climb.workbench.source_confirmation_task_id">还没有可读取的确认简历。先返回职途导航核对本人资料。</p>
                <p v-if="climb.legacy" class="cr-real-warning">这是一份旧版解读，仍可回看。可以重新解读，核对具体职责和下一步。</p>
                <p v-else-if="climb.stale && climb.record" class="cr-real-warning">本人资料或方向已变化。旧解读保留在历史讨论中，不作为当前起点。</p>
                <details v-if="(climb.stale || climb.legacy) && climb.latest?.result?.positioning"><summary>回看当时的解读</summary><CareerStartingPoint :value="climb.latest.result.positioning" /></details>
                <p v-if="climb.latest?.status==='failed'" role="alert">这次分析没有完成，你的输入已保留；没有生成新结论或计划。</p>
                <p v-if="climb.active" role="status">{{ climb.latest?.status==='queued' ? '请求已保存，等待分析服务接手…' : '正在结合本人经历和方向资料分析…' }}</p>
                <p v-if="personalQuestion && !climb.stale && !climb.legacy" class="cr-personal-question">{{ personalQuestion }}</p>
                <form id="career-path-response" tabindex="-1" @submit.prevent="climb.submit">
                  <label v-if="climb.record">补充与这个问题有关的经历<textarea v-model="climb.message" maxlength="2000" rows="3" placeholder="说清你负责了什么、怎样完成，或哪些还没做过；暂时不确定也可以。" /></label>
                  <button type="submit" class="cr-real-button" :disabled="climb.busy || climb.active || climb.loading || !climb.selected || !climb.workbench?.source_confirmation_task_id || !!climb.sourceError">{{ climb.busy ? '正在保存请求…' : climb.active ? '分析进行中' : climb.positioning ? '结合补充，更新解读' : '看看我从哪里开始' }}</button>
                </form>
                <p v-if="climb.error" role="alert">{{ climb.error }} <button @click="climb.reloadProgress">核对已保存进展</button></p>
                <button v-if="climb.record" class="cr-real-button cr-real-button--quiet" @click="climb.discuss">继续讨论／做一次尝试 <Icon icon="lucide:arrow-right" :width="12"/></button>
              </div>
            </template>
            <template v-else>
            <div class="cr-panel-title">
              <Icon icon="lucide:radar" :width="12"/>
              <span>七维能力差距</span>
              <span class="cr-radar-legend">
                <span class="cr-legend-dot" style="background:#C0501A"></span><span>我的能力</span>
                <span class="cr-legend-dot cr-legend-dot--dashed" style="border-color:#2B6CB0"></span><span>岗位要求</span>
              </span>
            </div>
            <div v-if="!selectedJob" class="cr-radar-empty">
              <Icon icon="lucide:radar" :width="24" class="cr-guide-icon"/>
              <p>点击气泡选择岗位<br/>即可查看能力差距</p>
            </div>
            <!-- 骨架屏 -->
            <div v-else-if="radarLoading && !radarReady" class="cr-radar-skeleton">
              <div class="cr-skel-radar-circle"></div>
              <div class="cr-skel-bar cr-skel-bar--text" style="width:70%;margin:8px auto 0"></div>
              <div class="cr-skel-bar cr-skel-bar--text cr-skel-bar--short" style="width:50%;margin:4px auto 0"></div>
            </div>
            <!-- 雷达图淡入 -->
            <template v-else>
              <div class="cr-plan-fadein cr-radar-chart-area">
                <D3RadarChart :data="crRadarData" :segment-colors="reportRadarColors" :show-legend="true" :height="280" />
              </div>
            </template>
            </template>
          </div>
        </div>

        <!-- ⑤ 成长计划 -->
        <div class="cr-center-bottom">
          <div class="cr-planning">
            <template v-if="isRealPath">
              <div class="cr-panel-title"><Icon icon="lucide:book-open" :width="12"/><span>本次参考资料</span></div>
              <section id="career-path-evidence" class="cr-real-resume" aria-label="本人的简历解读" tabindex="-1">
                <p v-if="climb.reportError" role="alert">{{ climb.reportError }}</p>
                <template v-else-if="climb.report">
                  <section class="cr-source-section"><h2>已确认的经历</h2>
                    <article v-for="item in diagnosticFacts" :key="item.id"><h3>{{ item.label }}</h3><dl class="cr-source-fact"><template v-for="(part,index) in diagnosticFactParts(item.fields)" :key="index"><dt>{{ part.label }}</dt><dd>{{ part.text }}</dd></template></dl></article>
                  </section>
                  <section v-if="climb.report.analysis" class="cr-source-section"><h2>简历整体解读</h2>
                    <p v-if="climb.report.analysis.summary?.text">{{ climb.report.analysis.summary.text }}</p>
                    <div v-if="climb.report.analysis.strengths?.length" class="cr-source-analysis"><h3>已有经历的解读</h3><p v-for="(s,i) in climb.report.analysis.strengths" :key="'s'+i">{{ s.text }}</p></div>
                    <div v-if="climb.report.analysis.questions?.length" class="cr-source-analysis"><h3>还需讲清的问题</h3><p v-for="(q,i) in climb.report.analysis.questions" :key="'q'+i">{{ q.text }}</p></div>
                  </section>
                  <p v-if="!diagnosticFacts.length">当前确认资料未记录具体项目或实践；可以先澄清一段本人做过的事，不补造经历。</p>
                </template>
                <p v-else>{{ climb.workbench?.resume_diagnostic.state==='processing' ? '简历解读正在整理，已有画像仍可阅读。' : '暂未取得可读取的简历解读，可返回职途导航查看进度。' }}</p>
              </section>
              <section v-if="climb.portrait" class="cr-real-portrait" aria-label="本次参考的能力画像"><h2 class="cr-source-portrait-title">能力画像资料</h2><ServerPortraitDetail :snapshot="climb.portrait" @action="followCurrentPortrait" @current="climb.load" /></section>
              <p v-else class="cr-real-resume">{{ climb.portraitError || (climb.workbench?.portrait.state==='processing' ? '画像仍在分析；不会用默认分数代替。' : '当前还没有可读取的画像；已确认经历仍可用于方向解读。') }}</p>
            </template>
            <template v-else>
            <div class="cr-panel-title">
              <Icon icon="lucide:calendar-check" :width="12"/>
              <template v-if="planLoading">
                <span>AI 正在分析 {{ selectedJob?.title }} 成长路径</span>
                <Icon icon="lucide:loader-2" :width="12" class="cr-spin" style="margin-left:4px; color:var(--primary-100)"/>
              </template>
              <template v-else>
                <span>个性化成长计划</span>
                <span v-if="!selectedJob" class="cr-panel-sub">选中岗位后生成</span>
              </template>
            </div>

            <!-- 未选岗位 -->
            <div v-if="!selectedJob" class="cr-planning-empty">
              <Icon icon="lucide:sparkles" :width="20" class="cr-guide-icon"/>
              <p>选择目标岗位后<br/>AI 将生成专属成长方案</p>
            </div>

            <!-- 骨架屏（已选岗位但计划还没加载出来） -->
            <div v-else-if="planLoading && !planStages.length" class="cr-plan-skeleton">
              <div class="cr-skel-card" v-for="n in 2" :key="n">
                <div class="cr-skel-bar cr-skel-bar--title"></div>
                <div class="cr-skel-bar cr-skel-bar--text"></div>
                <div class="cr-skel-bar cr-skel-bar--text cr-skel-bar--short"></div>
                <div class="cr-skel-bar cr-skel-bar--text"></div>
              </div>
            </div>

            <!-- 逐步显示的计划卡片 -->
            <div v-else-if="planStages.length" class="cr-plan-stages">
              <div v-for="(stage, si) in planStages" :key="stage.phase" class="cr-plan-stage cr-plan-fadein"
                :class="`cr-plan-stage--${stage.phase}`"
                :style="{ animationDelay: si * 0.15 + 's' }">
                <button type="button" class="cr-ps-head" :aria-expanded="expandedStages.has(stage.phase)" :aria-controls="`cr-tasks-${stage.phase}`" @click="toggleStage(stage.phase)">
                  <Icon :icon="stage.phase === 'short' ? 'lucide:target' : 'lucide:rocket'" :width="14" class="cr-ps-icon"/>
                  <span class="cr-ps-label">{{ stage.phaseLabel }}</span>
                  <Icon :icon="expandedStages.has(stage.phase) ? 'lucide:chevron-up' : 'lucide:chevron-down'" :width="12" class="cr-ps-toggle"/>
                </button>
                <span class="cr-ps-goal">{{ stage.goal }}</span>
                <ul :id="`cr-tasks-${stage.phase}`" class="cr-ps-list" :class="{ 'cr-ps-list--collapsed': !expandedStages.has(stage.phase) }">
                  <li v-for="(t, ti) in stage.tasks" :key="ti" class="cr-task-fadein" :style="{ animationDelay: ti * 0.08 + 's' }">
                    <Icon icon="lucide:circle" :width="8" class="cr-ps-bullet"/>{{ t }}
                  </li>
                </ul>
                <button v-if="!expandedStages.has(stage.phase) && stage.tasks.length > 3" class="cr-ps-expand" @click="toggleStage(stage.phase)">
                  展开全部 ({{ stage.tasks.length }}项)
                </button>
                <div v-if="stage.milestone && !planLoading" class="cr-ps-milestone">
                  <Icon icon="lucide:flag" :width="10"/>{{ stage.milestone }}
                </div>
                <div v-if="si < planStages.length - 1" class="cr-ps-arrow">
                  <Icon icon="lucide:arrow-right" :width="16"/>
                </div>
              </div>
            </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════ -->
    <!--              模式 B：报告编辑                 -->
    <!-- ═══════════════════════════════════════════ -->
    <div v-else-if="!hasArtifactQuery || artifactReady" class="cr-report-main">

      <!-- 左栏：报告预览 -->
      <div class="cr-rp-preview">
        <div class="cr-rp-preview-inner" v-html="reportHtml"></div>
      </div>

      <!-- 右栏：工具栏 + 编辑区 -->
      <div class="cr-rp-right">

        <!-- ⑥ 工具栏 -->
        <div class="cr-rp-toolbar">
          <div class="cr-rp-toolbar-title">
            <Icon icon="lucide:wrench" :width="12"/>编辑工具
          </div>

          <!-- 完整性检查 -->
          <button class="cr-tool-btn" @click="checkCompleteness">
            <Icon icon="lucide:search-check" :width="13"/><span>完整性检查</span>
          </button>
          <div v-if="showCheckResults" class="cr-check-results">
            <div v-for="r in checkResults" :key="r.section" class="cr-check-item" :class="{ 'cr-check-item--ok': r.found }">
              <Icon :icon="r.found ? 'lucide:check-circle' : 'lucide:alert-circle'" :width="12"/>
              {{ r.section }}
            </div>
            <button v-if="checkResults.some(r => !r.found)" class="cr-tool-btn cr-tool-btn--sm" @click="autoFillMissing">
              <Icon icon="lucide:plus-circle" :width="11"/>一键补全缺失章节
            </button>
          </div>

          <!-- 智能润色 -->
          <button class="cr-tool-btn" :disabled="polishLoading" @click="polishReport">
            <Icon :icon="polishLoading ? 'lucide:loader-2' : 'lucide:sparkles'" :width="13" :class="{ 'cr-spin': polishLoading }"/>
            <span>{{ polishLoading ? '润色中…' : '智能润色' }}</span>
          </button>
          <div v-if="polishDiff" class="cr-polish-diff">
            <div class="cr-polish-actions">
              <button class="cr-tool-btn cr-tool-btn--sm cr-tool-btn--ok" @click="applyPolish">
                <Icon icon="lucide:check" :width="11"/>应用润色
              </button>
              <button class="cr-tool-btn cr-tool-btn--sm" @click="polishDiff = null">
                <Icon icon="lucide:x" :width="11"/>撤销
              </button>
            </div>
          </div>

          <!-- 数据刷新 -->
          <button class="cr-tool-btn" @click="refreshReportData">
            <Icon icon="lucide:refresh-cw" :width="13"/><span>数据摘要刷新</span>
          </button>
        </div>

        <!-- ⑦ 编辑区 -->
        <div class="cr-rp-editor-wrap">
          <textarea v-model="reportTextEditable" class="cr-rp-editor" aria-label="Markdown 报告内容" placeholder="在此编辑 Markdown 报告内容…"></textarea>
        </div>
      </div>
    </div>

    <!-- ══ FOOTER ══ -->
    <footer v-if="!hasArtifactQuery || artifactReady" class="cr-footer">
      <div class="cr-footer__meta">
      <span class="cr-footer-source">{{ isRealPath ? '本人确认经历 · 方向探索解读，不代表职级认证' : artifactReady ? '数据来源：Agent 对话演示产物' : '数据来源：简历解析 + 岗位模型匹配' }}</span>
      <span v-if="activeMode === 'report'" class="cr-footer-wc">字数：{{ wordCount }}</span>
      <span v-if="!isRealPath" class="cr-footer-time">{{ new Date().toLocaleDateString('zh-CN') }}</span>
      </div>
      <div class="cr-footer__actions">
      <button v-if="!isRealPath && activeMode === 'analysis'" class="cr-footer-go" @click="switchToReport">
        进入报告编辑 <Icon icon="lucide:arrow-right" :width="11"/>
      </button>
      <button v-if="!isRealPath" class="cr-footer-fav" @click="goToFavorites">
        <Icon icon="lucide:heart" :width="11"/>
        查看心仪岗位匹配度
      </button>
      </div>
    </footer>

  </div>
</template>

<style scoped>
.cr-personal-jumps{display:none}.cr-personal-jumps button{min-height:44px;background:transparent;border:0;border-bottom:1px solid var(--bg-300);color:var(--primary-100);font:inherit;font-size:12px;cursor:pointer}.cr-personal-jumps button:focus-visible{outline:2px solid var(--primary-100);outline-offset:-3px}@media(max-width:1023px){.cr-personal-jumps{display:grid;grid-template-columns:1fr 1.3fr 1.3fr;flex-shrink:0}}
.cr-real-heading{flex-wrap:wrap}.cr-real-button{min-height:44px;padding:9px 15px;background:var(--primary-100);color:#fff;border:1px solid var(--primary-100);border-radius:5px;font:inherit;cursor:pointer}.cr-real-button:disabled{opacity:.5;cursor:not-allowed}.cr-real-button--quiet{background:transparent;color:var(--primary-100);margin-top:12px}.cr-real-button:focus-visible,.cr-real-picker :is(input,select):focus-visible{outline:2px solid var(--primary-100);outline-offset:3px}.cr-real-picker{padding:14px 18px;font-size:12px;display:flex;gap:10px;flex-wrap:wrap}.cr-real-picker label{display:flex;align-items:center;gap:8px}.cr-real-picker input,.cr-real-picker select{max-width:100%;min-height:44px;padding:8px;border:1px solid var(--bg-300);background:#fffcf7;color:var(--text-100);font:inherit}.cr-real-picker p{width:100%;color:var(--text-300);margin:0}.cr-real-pagination{display:flex;justify-content:center;align-items:center;gap:18px;padding:5px}.cr-real-pagination button{min-height:44px;border:0;background:transparent;color:var(--primary-100);font:inherit;cursor:pointer}.cr-real-pagination button:disabled{opacity:.4}.cr-real-intro,.cr-real-discussion,.cr-real-resume{padding:20px 24px;font-size:14px;line-height:1.8;color:var(--text-200)}.cr-real-intro h2,.cr-real-resume h2{font:500 22px/1.5 var(--font-title);color:var(--text-100)}.cr-real-resume h3{font-size:15px;margin-bottom:5px}.cr-real-resume article{border-top:1px solid var(--bg-300);padding-top:8px;margin-top:12px}.cr-real-resume article p:empty{display:none}.cr-real-discussion p,.cr-real-resume p{white-space:pre-wrap;overflow-wrap:anywhere}.cr-real-discussion label{display:grid;gap:8px;margin-bottom:12px}.cr-real-discussion textarea{box-sizing:border-box;width:100%;resize:vertical;background:#fffcf7;border:1px solid var(--bg-300);padding:12px;font:inherit;color:inherit}.cr-real-discussion [role=alert],.cr-real-warning{color:#963e1c}.cr-personal-question{border-left:2px solid var(--primary-100);padding-left:12px}.cr-real-portrait{border-top:1px solid var(--bg-300);margin:0 24px 20px}.cr-real-portrait>summary,.cr-real-resume summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-size:13px;color:var(--primary-100)}.cw-legend-personal{display:grid;gap:6px;max-width:calc(100% - 30px);opacity:1;font-size:12px}.cw-legend-personal small{max-width:180px;line-height:1.7;color:var(--text-200)}.cw-personal-note{position:absolute;bottom:20px;left:16px;right:16px;padding:12px 15px;background:#fffcf3ed;border-left:2px solid var(--primary-100);font-size:12px;line-height:1.7}.cw-personal-note p{margin:5px 0 0;max-height:125px;overflow:auto}.cr-main--real .cr-radar-panel{overflow-y:auto}.cr-main--real .cr-bubble-canvas{min-height:260px}.cr-main--real .cr-center-top{min-height:520px;flex:0 0 auto}.cr-main--real .cr-center-bottom{flex:0 0 auto}.cr-main--real .cr-center{overflow-y:auto}.cr-main--real .cr-planning{overflow:visible}.cr-main--real .cr-footer-source{white-space:normal}
@media(max-width:1023px){.cr-main--real .cr-center{overflow:visible}.cr-main--real .cr-radar-panel{overflow:visible}.cr-real-heading{gap:12px}.cr-real-picker{padding:12px}.cr-real-picker label,.cr-real-picker select{width:100%}.cr-real-picker input{min-width:0;flex:1;font-size:16px}.cr-real-picker select,.cr-real-discussion textarea{font-size:16px}.cr-main--real .cr-center-top{min-height:0}.cr-main--real .cr-left{position:relative}.cr-main--real .cr-left>.cr-panel-title{min-height:44px}.cr-real-discussion{padding:18px}.cr-real-resume{padding:18px}.cr-main--real .cr-bubble-canvas{height:300px}.cw-personal-note{bottom:15px}}
.cr-agent-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28px; text-align: center; }
.cr-agent-state h2 { margin: 12px 0 5px; font-size: 18px; }
.cr-agent-state p { color: var(--text-200); }
.cr-agent-state button { margin-top: 12px; padding: 8px 14px; border: 1px solid var(--bg-300); border-radius: 7px; background: var(--bg-200); cursor: pointer; }
.cr-agent-context { display: flex; gap: 12px; align-items: center; padding: 8px 20px; border-bottom: 1px solid var(--bg-300); background: color-mix(in srgb, var(--primary-100) 5%, var(--bg-100)); font-size: 12px; }
.cr-agent-context strong { color: var(--primary-100); }
.cr-agent-context span { color: var(--text-200); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* ══ 页面容器 ══ */
.cr-page {
  position: relative; width: 100%; height: 100vh; max-height: 100vh;
  background: var(--bg-100); display: flex; flex-direction: column;
  font-family: var(--font-title); overflow: hidden;
}

/* ══ HEADER ══ */
.cr-header {
  position: relative; z-index: 20;
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; height: 48px; min-height: 48px;
  background: linear-gradient(180deg, var(--bg-200) 0%, var(--bg-100) 100%);
  border-bottom: 1px solid var(--bg-300);
  box-shadow: 0 2px 16px rgba(26,20,16,0.09);
}
.cr-header__left  { display: flex; align-items: center; gap: 10px; }
.cr-header__tabs  { display: flex; align-items: center; gap: 0; position: absolute; left: 50%; transform: translateX(-50%); }
.cr-header__right { display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
.cr-back {
  display: flex; align-items: center; gap: 4px; background: transparent;
  border: 1px solid var(--bg-300); color: var(--text-200);
  font-size: 12px; padding: 4px 10px; cursor: pointer; border-radius: var(--radius-sm);
  transition: border-color 300ms ease, color 300ms ease, transform 150ms ease, box-shadow 150ms ease; font-family: var(--font-ui);
}
.cr-back:hover { border-color: var(--primary-100); color: var(--primary-100); transform: translateY(-1px); box-shadow: 0 3px 8px rgba(139,37,0,0.12); }
.cr-tab {
  display: flex; align-items: center; gap: 5px; cursor: pointer;
  background: transparent; border: none; border-bottom: 2px solid transparent;
  color: var(--text-300); font-size: 12px; padding: 6px 18px; height: 100%;
  font-family: var(--font-ui); transition: color 300ms ease, border-color 300ms ease;
}
.cr-tab--active {
  color: var(--primary-100); font-weight: 600;
  border-bottom: 2px solid var(--primary-100);
}
.cr-tab:hover:not(.cr-tab--active) { color: var(--text-200); }
.cr-report-btn {
  display: flex; align-items: center; gap: 5px; cursor: pointer;
  background: var(--primary-100); border: 1px solid var(--primary-100);
  color: #fff; border-radius: var(--radius-sm); font-weight: 600;
  font-size: 11px; padding: 5px 14px; font-family: var(--font-ui);
  transition: background 300ms ease, transform 150ms ease, box-shadow 150ms ease;
}
.cr-report-btn:hover:not(:disabled) {
  background: var(--primary-300);
  transform: translateY(-1px); box-shadow: 0 3px 10px rgba(139,37,0,0.22);
}
.cr-report-btn:disabled { opacity: 0.4; cursor: not-allowed; background: var(--bg-300); border-color: var(--bg-300); color: var(--text-300); }

/* 导出按钮 */
.cr-export-wrap { position: relative; }
.cr-export-btn {
  display: flex; align-items: center; gap: 4px; cursor: pointer;
  background: color-mix(in srgb, var(--primary-100) 8%, var(--bg-200) 92%);
  border: 1px solid rgba(139,37,0,0.35); color: var(--text-200); border-radius: var(--radius-sm);
  font-size: 11px; padding: 5px 12px; font-family: var(--font-ui);
  transition: background 300ms ease, transform 150ms ease, box-shadow 150ms ease;
}
.cr-save-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: var(--radius-sm); font-family: var(--font-ui);
  font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.3s;
  background: rgba(139,105,20,0.15); border: 1px solid rgba(196,150,30,0.4);
  color: rgba(139,105,20,1);
}
.cr-save-btn:hover:not(:disabled) { background: rgba(139,105,20,0.3); }
.cr-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cr-my-reports-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: var(--radius-sm); font-family: var(--font-ui);
  font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.3s;
  background: rgba(139,105,20,0.15); border: 1px solid rgba(196,150,30,0.4);
  color: rgba(139,105,20,1);
}
.cr-my-reports-btn:hover { background: rgba(139,105,20,0.3); }

.cr-export-btn:hover { background: color-mix(in srgb, var(--primary-100) 15%, var(--bg-200) 85%); transform: translateY(-1px); box-shadow: 0 3px 8px rgba(139,37,0,0.12); }
.cr-export-menu {
  position: absolute; top: 100%; right: 0; margin-top: 4px;
  background: var(--bg-200); border: 1px solid var(--bg-300);
  box-shadow: 0 6px 24px rgba(26,20,16,0.15); z-index: 30;
  display: flex; flex-direction: column; min-width: 160px;
  border-radius: 6px; overflow: hidden;
}
.cr-export-menu button {
  display: flex; align-items: center; gap: 8px; padding: 8px 14px;
  background: none; border: none; cursor: pointer; font-size: 11px;
  color: var(--text-200); font-family: var(--font-ui); text-align: left;
  transition: background 150ms ease;
}
.cr-export-menu button:hover { background: var(--bg-300); }

/* ══ FOOTER ══ */
.cr-footer {
  flex-shrink: 0; display: flex; align-items: center; gap: 16px;
  padding: 0 20px; height: 28px; min-height: 28px;
  background: var(--bg-200); border-top: 1px solid var(--bg-300);
  font-size: 10px; color: var(--text-300); font-family: var(--font-ui);
}
.cr-footer-source { opacity: 0.7; }
.cr-footer-wc { margin-left: auto; }
.cr-footer-time { opacity: 0.6; }
.cr-footer-go {
  margin-left: auto; display: flex; align-items: center; gap: 4px;
  background: none; border: 1px solid rgba(139,37,0,0.25); color: var(--primary-100);
  cursor: pointer; font-size: 10px; padding: 2px 10px; font-family: var(--font-ui);
  transition: background 300ms ease; border-radius: var(--radius-sm);
}
.cr-footer-go:hover { background: rgba(139,37,0,0.06); }
.cr-footer-fav {
  display: flex; align-items: center; gap: 4px;
  background: none; border: 1px solid rgba(139,37,0,0.25); color: var(--primary-100);
  cursor: pointer; font-size: 10px; padding: 2px 10px; font-family: var(--font-ui);
  transition: background 300ms ease; border-radius: var(--radius-sm);
}
.cr-footer-fav:hover { background: rgba(139,37,0,0.06); }

/* ══ 分析模式主布局 ══ */
.cr-main {
  flex: 1; display: grid; grid-template-columns: clamp(320px, 29vw, 420px) minmax(0, 1fr);
  overflow: hidden; min-height: 0; position: relative; z-index: 1;
}

/* ══ 左栏：攀岩墙 ══ */
.cr-left {
  display: flex; flex-direction: column;
  border-right: 1px solid var(--bg-300); overflow: hidden;
  background: linear-gradient(180deg, var(--bg-200) 0%, var(--bg-100) 60%);
  box-shadow: 4px 0 16px -4px rgba(26,20,16,0.06);
}
.cr-cw-wrap {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  display: flex; justify-content: center; padding: 0;
  position: relative;
  background:
    /* T-nut 螺栓孔（与 SVG pattern 同参数） */
    radial-gradient(circle at 28px 28px, rgba(0,0,0,0.13) 2.3px, transparent 2.6px),
    /* 拼板缝隙 */
    repeating-linear-gradient(90deg, transparent, transparent 199px, rgba(0,0,0,0.04) 199px, rgba(0,0,0,0.04) 200px),
    repeating-linear-gradient(0deg, transparent, transparent 199px, rgba(0,0,0,0.03) 199px, rgba(0,0,0,0.03) 200px),
    /* 墙面底色 */
    var(--cr-wall-base);
  background-size: 56px 56px, 200px 200px, 200px 200px, auto;
}
.cr-cw-wrap::-webkit-scrollbar { width: 3px; }
.cr-cw-wrap::-webkit-scrollbar-thumb { background: rgba(100,95,88,0.3); border-radius: 2px; }
.cr-cw-svg { display: block; width: 100%; height: auto; cursor: default; }

/* ── 岗位节点 ── */
.cw-job-node { cursor: pointer; }
/* CSS transform would replace the SVG translate and move the hit target away. */
.cw-job-node:hover > circle { stroke-width: 2.5px; }
.cw-node-title { font-size: 11px; fill: #3D3D3D; font-weight: 600; pointer-events: none; }
.cw-node-title--active { fill: #fff; }
.cw-node-sub { font-size: 9px; fill: #6B6560; pointer-events: none; }
.cw-node-sub--active { fill: rgba(255,255,255,0.88); }
.cw-node-glow { animation: cw-glow-pulse 2s ease-in-out infinite; }
@keyframes cw-glow-pulse {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.45; }
}

/* ── 岩点 ── */
.cw-hold { cursor: pointer; }
.cw-hold:hover > path { stroke: #514b42; stroke-width: 1.5px; }
.cw-hold--more { cursor: pointer; opacity: 0.8; }
.cw-hold--more:hover { opacity: 1; }
.cw-hold-text { font-size: 9px; fill: #4A4540; pointer-events: none; font-weight: 600; }

/* ── 路线色带 ── */
.cw-rope-tape { pointer-events: none; }
.cw-rope-path { transition: stroke-width 250ms ease, stroke 250ms ease; pointer-events: stroke; }
.cw-rope-path:hover { stroke-width: 4 !important; }

/* ── 攀登者 ── */
.cw-origin-label { font-size: 8px; fill: #8B5E3C; font-weight: 600; font-family: var(--font-ui); }
.cw-climber-pulse {
  animation: cw-pulse 2s ease-in-out infinite;
  transform-origin: center;
}
@keyframes cw-pulse {
  0%, 100% { transform: scale(0.8); opacity: 0.5; }
  50% { transform: scale(1.5); opacity: 0; }
}

/* ── 图例 ── */
.cw-legend-overlay {
  position: absolute; top: 6px; left: 6px; z-index: 2;
  display: flex; flex-direction: column; gap: 5px;
  padding: 6px 10px; border-radius: 6px;
  background: rgba(230,226,220,0.92); backdrop-filter: blur(4px);
  border: 1px solid rgba(0,0,0,0.06);
  pointer-events: none;
}
.cw-legend-item { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 600; color: #5A5550; font-family: var(--font-ui); white-space: nowrap; }
.cw-legend-line { display: inline-block; width: 20px; height: 3px; border-radius: 2px; flex-shrink: 0; }
.cw-legend-line--promote { background: rgba(210,80,45,0.5); }
.cw-legend-line--transfer { background: rgba(74,130,200,0.45); border-top: 1px dashed rgba(74,130,200,0.6); }
.cw-legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.cw-legend-dot--mastered { background: #3DB88C; }
.cw-legend-dot--unmastered { background: #E8764A; }
/* ── 引导覆盖层 ── */
.cr-guide-overlay {
  position: absolute; inset: 0; z-index: 5;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  background: rgba(237,229,214,0.55); backdrop-filter: blur(2px);
  color: var(--text-300); text-align: center;
}
.cr-guide-text { font-size: 12px; line-height: 1.6; color: var(--text-200); }
.cr-guide-text strong { color: var(--primary-100); }
.cr-guide-icon { color: var(--bg-400); opacity: 0.6; }
.cr-guide-arrow {
  color: var(--primary-100); animation: cr-pulse-arrow 1.6s ease-in-out infinite;
}
@keyframes cr-pulse-arrow {
  0%, 100% { transform: translateX(0); opacity: 0.6; }
  50% { transform: translateX(6px); opacity: 1; }
}
.cr-panel-sub--hint {
  color: var(--primary-100); font-weight: 500;
  animation: cr-pulse-arrow 2s ease-in-out infinite;
}

/* ── 技能详情浮动面板 ── */
.cw-skill-panel {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  width: 180px; max-height: 280px; overflow-y: auto;
  background: rgba(255,252,245,0.96); border: 1px solid rgba(139,37,0,0.2);
  border-radius: 8px; box-shadow: 0 4px 16px rgba(26,20,16,0.15);
  padding: 10px 12px; z-index: 10; backdrop-filter: blur(6px);
}
.cw-sp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.cw-sp-title { font-size: 10px; font-weight: 600; color: var(--text-100); font-family: var(--font-title); line-height: 1.3; }
.cw-sp-close {
  flex-shrink: 0; background: none; border: none; cursor: pointer;
  color: var(--text-300); padding: 2px; display: flex; align-items: center;
}
.cw-sp-close:hover { color: var(--primary-100); }
.cw-sp-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 5px; }
.cw-sp-item { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--text-200); }
.cw-sp-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.cw-sp-dot--ok { background: #3DB88C; }
.cw-sp-dot--gap { background: #E85D3A; }
.cw-sp-name { flex: 1; min-width: 0; font-family: var(--font-ui); }
.cw-sp-tag { font-size: 9px; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; font-family: var(--font-ui); }
.cw-sp-tag--ok { background: rgba(62,184,140,0.15); color: #2A9D6E; }
.cw-sp-tag--gap { background: rgba(232,93,58,0.12); color: #B8421A; }

/* ══ 中栏 ══ */
.cr-center { display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

/* ── ① Hero 概览条 ── */
.cr-hero {
  flex-shrink: 0; display: flex; align-items: center; gap: 16px;
  padding: 10px 16px; height: 90px;
  background: linear-gradient(135deg, var(--bg-200) 0%, color-mix(in srgb, var(--primary-100) 5%, var(--bg-100) 95%) 100%);
  border-bottom: 1px solid var(--bg-300);
  box-shadow: 0 2px 12px rgba(26,20,16,0.07);
}
.cr-hero__gauge { flex-shrink: 0; }
.cr-hero-ring { width: 70px; height: 70px; }
.cr-hero-pct { font-size: 14px; font-weight: 600; fill: var(--primary-100, #8B2500); font-family: var(--font-ui); }
.cr-hero-pct-label { font-size: 7px; fill: var(--text-300, #999); }
.cr-hero__info { flex: 1; min-width: 0; }
.cr-hero-job { font-size: 16px; font-weight: 600; color: var(--primary-300); font-family: var(--font-title); letter-spacing: 0.02em; }
.cr-hero-desc { font-size: 11px; color: var(--text-300); margin-top: 4px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cr-hero-courses-btn {
  display: inline-flex; align-items: center; gap: 4px; margin-top: 8px;
  padding: 4px 12px; border: 1px solid var(--primary-200, #C0501A); border-radius: 14px;
  background: transparent; color: var(--primary-200, #C0501A); font-size: 11px;
  cursor: pointer; transition: all 0.2s;
}
.cr-hero-courses-btn:hover {
  background: var(--primary-200, #C0501A); color: #fff;
}
/* ── 中栏上：气泡 + 雷达 ── */
.cr-center-top {
  flex: 0 0 420px; display: grid; grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--bg-300); overflow: hidden;
}
.cr-bubble-panel, .cr-radar-panel { display: flex; flex-direction: column; overflow: hidden; }
.cr-bubble-panel {
  border-right: 1px solid var(--bg-300);
  background: linear-gradient(180deg, #F7F5F0 0%, #F0EDE6 100%);
  position: relative;
}
.cr-bubble-panel::before {
  content: ''; position: absolute; inset: 0; z-index: 0;
  pointer-events: none;
  opacity: 0.1;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' seed='3'/%3E%3CfeDiffuseLighting lighting-color='%23fff' surfaceScale='1.5'%3E%3CfeDistantLight azimuth='45' elevation='55'/%3E%3C/feDiffuseLighting%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E");
  background-size: cover;
}
.cr-radar-panel { background: var(--bg-100); position: relative; }
.cr-radar-panel::before {
  content: ''; position: absolute; inset: 0; z-index: 0;
  pointer-events: none; opacity: 0.04;
  background-image: v-bind(parchmentBg);
  background-size: cover; background-position: center;
}

/* ── 气泡图 SVG ── */
.cr-bubble-canvas {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  padding: 0 10px 10px;
}
.cr-bubble-svg {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: block;
}
@keyframes cr-ink-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.78; }
}
.cr-bubble-canvas :deep(.job-circle) {
  transition: r 0.25s ease, opacity 0.25s ease;
}
.cr-bubble-canvas :deep(.job-circle--selected) {
  animation: cr-ink-pulse 2s ease-in-out infinite;
}
.cr-bubble-canvas :deep(.domain-bg) {
  transition: stroke-opacity 0.3s ease, stroke-width 0.3s ease;
}
.cr-bubble-canvas :deep(.domain-label),
.cr-bubble-canvas :deep(.job-text),
.cr-bubble-canvas :deep(.job-score) {
  user-select: none;
}

/* ── ② 雷达图 + 差距条 ── */
.cr-radar-chart-area { flex: 1; min-height: 0; overflow: hidden; transition: flex-basis 0.5s ease, height 0.5s ease; }
.cr-radar-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--bg-400); font-size: 11px; text-align: center; line-height: 1.7;
}
.cr-radar { flex-shrink: 0; width: 100%; height: 250px; }
.cr-radar-legend {
  display: flex; align-items: center; gap: 10px; margin-left: auto;
  font-size: 11px; font-weight: 600; color: var(--text-200); font-family: var(--font-ui);
  background: rgba(139,37,0,0.04); padding: 2px 10px; border-radius: 12px;
}
.cr-legend-dot {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  flex-shrink: 0; box-shadow: 0 0 0 2px rgba(255,255,255,0.6);
}
.cr-legend-dot--dashed {
  background: transparent !important;
  border: 2px dashed;
  border-radius: 3px;
  width: 10px; height: 10px;
}

/* ── ⑤ 成长计划 ── */
.cr-center-bottom { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 200px; background: linear-gradient(180deg, var(--bg-100) 0%, var(--bg-200) 100%); }
.cr-planning { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.cr-planning-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; color: var(--bg-400);
  font-size: 11px; text-align: center; line-height: 1.6;
}
.cr-plan-stages { flex: 1; display: flex; gap: 14px; overflow-x: auto; overflow-y: hidden; padding: 10px 16px 14px; }
.cr-plan-stages::-webkit-scrollbar { height: 3px; }
.cr-plan-stages::-webkit-scrollbar-thumb { background: rgba(139,37,0,0.2); }
.cr-plan-stage {
  flex: 1; min-width: 240px; position: relative;
  background: var(--bg-100); border: 1px solid var(--bg-300); border-radius: 8px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto;
  box-shadow: 0 2px 10px rgba(26,20,16,0.06), inset 0 1px 0 rgba(255,255,255,0.6);
  transition: transform 300ms ease, box-shadow 300ms ease;
}
.cr-plan-stage:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(26,20,16,0.10), inset 0 1px 0 rgba(255,255,255,0.6);
}
.cr-plan-stage::-webkit-scrollbar { width: 2px; }
.cr-plan-stage--short { border-top: 3px solid var(--primary-100); }
.cr-plan-stage--mid   { border-top: 3px solid #8B6914; }
.cr-ps-head {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  user-select: none;
}
.cr-ps-icon { flex-shrink: 0; color: var(--primary-100); }
.cr-plan-stage--mid .cr-ps-icon { color: #8B6914; }
.cr-ps-label {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-sm);
  display: inline-block; width: fit-content; font-family: var(--font-ui);
}
.cr-plan-stage--short .cr-ps-label { background: color-mix(in srgb, var(--primary-100) 18%, var(--bg-100) 82%); color: var(--primary-100); border: 1px solid rgba(139,37,0,0.35); }
.cr-plan-stage--mid   .cr-ps-label { background: color-mix(in srgb, #8B6914 18%, var(--bg-100) 82%); color: #8B6914; border: 1px solid rgba(139,105,20,0.35); }
.cr-ps-toggle { margin-left: auto; color: var(--text-300); }
.cr-ps-goal { font-size: 12px; color: var(--text-100); font-weight: 500; line-height: 1.55; }
.cr-ps-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.cr-ps-list--collapsed li:nth-child(n+4) { display: none; }
.cr-ps-list li { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; color: var(--text-100); line-height: 1.5; }
.cr-ps-bullet { flex-shrink: 0; margin-top: 3px; color: var(--primary-100); }
.cr-plan-stage--mid .cr-ps-bullet { color: #8B6914; }
.cr-ps-expand {
  background: none; border: 1px dashed var(--bg-300); color: var(--text-300);
  font-size: 10px; padding: 3px 8px; cursor: pointer; font-family: var(--font-ui);
  transition: color 300ms ease; align-self: flex-start; border-radius: var(--radius-sm);
}
.cr-ps-expand:hover { color: var(--primary-100); border-color: rgba(139,37,0,0.3); }
.cr-ps-milestone {
  display: flex; align-items: flex-start; gap: 5px; font-size: 11px;
  color: #8B6914; padding-top: 8px; font-weight: 600;
  border-top: 1px solid var(--bg-300); margin-top: auto; font-family: var(--font-ui);
}
.cr-ps-arrow {
  position: absolute; right: -18px; top: 50%; transform: translateY(-50%);
  color: var(--bg-400); z-index: 2;
}

/* ── 雷达骨架屏 ── */
.cr-radar-skeleton {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px; padding: 20px;
}
.cr-skel-radar-circle {
  width: 140px; height: 140px; border-radius: 50%;
  background: linear-gradient(135deg, var(--bg-300) 25%, rgba(139,37,0,0.04) 50%, var(--bg-300) 75%);
  background-size: 200% 200%;
  animation: cr-shimmer 1.5s ease-in-out infinite;
}

/* ── 骨架屏 ── */
.cr-plan-skeleton {
  flex: 1; display: flex; gap: 14px; padding: 14px 16px; overflow: hidden;
}
.cr-skel-card {
  flex: 1; min-width: 200px; padding: 16px; border-radius: 8px;
  background: var(--bg-200); display: flex; flex-direction: column; gap: 12px;
}
.cr-skel-bar {
  height: 12px; border-radius: 6px;
  background: linear-gradient(90deg, var(--bg-300) 25%, rgba(139,37,0,0.06) 50%, var(--bg-300) 75%);
  background-size: 200% 100%;
  animation: cr-shimmer 1.5s ease-in-out infinite;
}
.cr-skel-bar--title { width: 50%; height: 14px; margin-bottom: 4px; }
.cr-skel-bar--text  { width: 85%; }
.cr-skel-bar--short { width: 60%; }
@keyframes cr-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── 计划卡片淡入 ── */
.cr-plan-fadein {
  animation: cr-slide-up 0.45s ease-out both;
}
@keyframes cr-slide-up {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
.cr-task-fadein {
  animation: cr-task-in 0.3s ease-out both;
}
@keyframes cr-task-in {
  from { opacity: 0; transform: translateX(-6px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* ══ 公用面板标题 ══ */
.cr-panel-title {
  flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; color: var(--text-100);
  font-family: var(--font-title); letter-spacing: 0.02em;
  padding: 9px 14px 8px 12px;
  border-left: 3px solid var(--primary-100);
  border-bottom: 1px solid var(--bg-300);
  background: linear-gradient(90deg, rgba(139,37,0,0.05) 0%, var(--bg-200) 60%);
}
.cr-panel-sub { font-size: 9.5px; font-weight: 400; color: var(--text-300); margin-left: 4px; font-family: var(--font-ui); }

/* ══ 报告编辑模式 ══ */
.cr-report-main {
  flex: 1; display: grid; grid-template-columns: 55% 45%;
  overflow: hidden; min-height: 0;
}

/* 左：预览区 */
.cr-rp-preview {
  overflow-y: auto; padding: 24px 32px;
  border-right: 1px solid var(--bg-300);
  background: var(--bg-100);
}
.cr-rp-preview::-webkit-scrollbar { width: 4px; }
.cr-rp-preview::-webkit-scrollbar-thumb { background: rgba(139,37,0,0.2); }
.cr-rp-preview-inner :deep(.rp-h2) {
  font-size: 18px; font-weight: 600; color: var(--text-100); font-family: var(--font-title);
  letter-spacing: 0.02em; margin: 16px 0 8px; padding-bottom: 6px;
  border-bottom: 2px solid #8B6914;
}
.cr-rp-preview-inner :deep(.rp-h3) {
  font-size: 14px; font-weight: 600; color: var(--text-100); font-family: var(--font-title);
  margin: 14px 0 6px; padding-left: 10px;
  border-left: 3px solid var(--primary-100);
}
.cr-rp-preview-inner :deep(.rp-p) {
  font-size: 12px; color: var(--text-200); line-height: 1.8; margin: 6px 0;
  font-family: var(--font-ui);
}
.cr-rp-preview-inner :deep(.rp-list) {
  list-style: none; padding: 0 0 0 16px; margin: 6px 0;
}
.cr-rp-preview-inner :deep(.rp-list li) {
  font-size: 12px; color: var(--text-200); line-height: 1.7; padding: 2px 0;
  font-family: var(--font-ui);
}
.cr-rp-preview-inner :deep(.rp-list li::before) {
  content: '●'; color: var(--primary-100); margin-right: 8px; font-size: 8px;
}
.cr-rp-preview-inner :deep(strong) { color: var(--text-100); }

/* 右：工具栏 + 编辑区 */
.cr-rp-right { display: flex; flex-direction: column; overflow: hidden; }

.cr-rp-toolbar {
  flex-shrink: 0; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;
  border-bottom: 1px solid var(--bg-300); background: var(--bg-200);
}
.cr-rp-toolbar-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; color: var(--text-200); font-family: var(--font-title);
  margin-bottom: 4px;
}
.cr-tool-btn {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  background: var(--bg-100); border: 1px solid var(--bg-300); color: var(--text-200);
  font-size: 11px; padding: 7px 12px; font-family: var(--font-ui); border-radius: var(--radius-sm);
  transition: background 300ms ease, border-color 300ms ease, transform 150ms ease;
}
.cr-tool-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--primary-100) 6%, var(--bg-100) 94%); border-color: rgba(139,37,0,0.3); transform: translateY(-1px); }
.cr-tool-btn:disabled { opacity: 0.5; cursor: wait; }
.cr-tool-btn--sm { font-size: 10px; padding: 4px 10px; }
.cr-tool-btn--ok { color: #5B7744; border-color: rgba(91,119,68,0.4); }
.cr-tool-btn--ok:hover { background: rgba(91,119,68,0.08); }

.cr-check-results {
  display: flex; flex-direction: column; gap: 4px; padding: 6px 0 2px;
}
.cr-check-item {
  display: flex; align-items: center; gap: 6px; font-size: 10px;
  color: #8B2500; font-family: var(--font-ui);
}
.cr-check-item--ok { color: #5B7744; }

.cr-polish-diff { padding: 6px 0 2px; }
.cr-polish-actions { display: flex; gap: 6px; }

@keyframes cr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.cr-spin { animation: cr-spin 1s linear infinite; }

/* 编辑区 */
.cr-rp-editor-wrap { flex: 1; overflow: hidden; }
.cr-rp-editor {
  width: 100%; height: 100%; resize: none;
  background: var(--bg-100); border: none; outline: none;
  color: var(--text-200); font-size: 12px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  padding: 16px; line-height: 1.7;
}
.cr-rp-editor:focus { background: color-mix(in srgb, var(--primary-100) 2%, var(--bg-100) 98%); }

/* Report-local finish: preserve the wall and chart workspace, not a new theme. */
.cr-page {
  --cr-wall-base: #e8e3d8;
  --cr-wall-light: #f1ede4;
  height: 100%; max-height: 100dvh; min-height: 0;
  color: var(--color-text); font-family: var(--font-ui); font-size: 14px;
  scrollbar-color: var(--color-border-strong) var(--color-background);
  scrollbar-width: thin;
}
.cr-page ::selection { background: var(--vermilion-100); color: var(--ink-900); }
.cr-page button { white-space: nowrap; touch-action: manipulation; }
.cr-page button:focus-visible, .cr-page textarea:focus-visible {
  outline: 2px solid var(--color-primary); outline-offset: 2px;
}
.cr-bubble-canvas :deep(.job-node:focus-visible) { outline: none; }
.cr-bubble-canvas :deep(.job-node:focus-visible .job-circle) {
  stroke: var(--color-primary); stroke-width: 3px;
}
.cr-header {
  display: grid; grid-template-columns: auto minmax(160px, 1fr) auto auto;
  gap: 16px; height: auto; min-height: 60px; padding: 8px 20px;
  background: var(--color-surface); box-shadow: 0 2px 8px rgba(26,26,26,.04);
  border-color: var(--color-border);
}
.cr-header__tabs { position: static; transform: none; justify-content: center; min-width: 0; align-self: stretch; }
.cr-header__right { flex-wrap: wrap; gap: 8px; min-width: 0; }
.cr-header__identity { min-width: 0; }
.cr-back, .cr-tab, .cr-report-btn, .cr-export-btn, .cr-save-btn, .cr-my-reports-btn {
  min-height: 36px; font-size: 13px; line-height: 1.3; border-radius: 6px;
}
.cr-tab { padding: 8px 14px; border-radius: 0; }
.cr-report-btn, .cr-export-btn, .cr-save-btn, .cr-my-reports-btn { padding: 8px 12px; justify-content: center; }
.cr-save-btn, .cr-my-reports-btn { background: var(--gold-100); border-color: var(--gold-300); color: var(--gold-700); }
.cr-save-btn, .cr-my-reports-btn, .cr-export-btn { transition: background-color .2s ease, color .2s ease, border-color .2s ease; }
.cr-save-btn:disabled { opacity: 1; background: var(--color-background); color: var(--color-text-muted); border-color: var(--color-border); }
.cr-export-btn { background: var(--color-surface); color: var(--color-primary); }
.cr-export-menu { background: var(--color-surface); }
.cr-export-menu button { min-height: 44px; font-size: 13px; }
.cr-panel-title {
  flex-wrap: wrap; min-width: 0; min-height: 44px; padding: 10px 14px;
  font-size: 14px; line-height: 1.45; gap: 6px;
  background: color-mix(in srgb, var(--color-surface) 84%, var(--cr-wall-light));
  border-bottom-color: var(--color-border);
}
.cr-panel-sub { font-size: 12px; color: var(--color-text-muted); overflow-wrap: anywhere; }
.cr-left { min-width: 0; box-shadow: none; }
.cr-center { min-width: 0; overflow-y: auto; }
.cr-center-top { flex: 0 0 clamp(340px, 43vh, 420px); grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cr-bubble-panel, .cr-radar-panel { min-width: 0; }
.cr-bubble-panel { background: var(--color-surface); }
.cr-radar-panel { background: color-mix(in srgb, var(--color-surface) 88%, var(--cr-wall-light)); }
.cr-radar-chart-area { display: grid; align-content: center; }
.cr-radar-legend { flex-wrap: wrap; gap: 6px; padding: 0; background: none; font-size: 12px; }
.cr-hero { height: auto; min-height: 104px; background: var(--color-surface); box-shadow: none; }
.cr-hero-job { font-size: 18px; color: var(--color-primary-dark); overflow-wrap: anywhere; }
.cr-hero-desc { color: var(--color-text-muted); font-size: 13px; white-space: normal; }
.cr-hero-courses-btn { min-height: 32px; color: var(--color-primary); border-color: var(--vermilion-300); font-size: 12px; border-radius: 6px; }
.cr-hero-courses-btn:hover { background: var(--vermilion-100); color: var(--color-primary-dark); }
.cr-hero-pct-label { font-size: 10px; fill: var(--color-text-muted); }
.cr-center-bottom { min-height: 260px; background: var(--color-background); }
.cr-plan-stages { padding: 12px; gap: 12px; }
.cr-plan-stage { min-width: 0; padding: 14px; box-shadow: none; background: var(--color-surface); overflow-x: hidden; }
.cr-ps-arrow { display: none; }
.cr-ps-head { min-height: 32px; border: 0; padding: 0; background: none; text-align: left; }
.cr-ps-list li { font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
.cr-ps-label, .cr-ps-goal { font-size: 13px; }
.cr-ps-task, .cr-ps-tasks, .cr-ps-milestone, .cr-ps-expand { font-size: 12px; line-height: 1.65; }
.cr-ps-task span { overflow-wrap: anywhere; }
.cr-guide-overlay { background: rgba(241,237,228,.7); backdrop-filter: none; }
.cr-guide-text { font-size: 14px; }
.cr-radar-empty { font-size: 13px; color: var(--color-text-muted); }
.cr-guide-mobile { display: none; }
.cw-legend-overlay { background: rgba(255,253,248,.94); border-color: rgba(92,78,58,.15); backdrop-filter: none; }
.cw-legend-item { font-size: 12px; color: #514b42; }
.cw-node-title { font-size: 12px; fill: #292722; }
.cw-node-title--active { fill: #fff; }
.cw-node-sub { font-size: 10px; fill: #575146; }
.cw-node-sub--active { fill: #fff; }
.cw-hold-text { font-size: 10px; fill: #37342e; }
.cw-job-node:focus-visible, .cw-hold:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.cw-skill-panel { width: min(280px, calc(100% - 24px)); max-height: min(70%, 380px); padding: 12px; background: #fffdf8; }
.cw-sp-header { align-items: flex-start; }
.cw-sp-title, .cw-sp-item { font-size: 12px; line-height: 1.55; }
.cw-sp-name { overflow-wrap: anywhere; }
.cw-sp-tag { font-size: 11px; }
.cw-sp-close { min-width: 44px; min-height: 44px; align-items: center; justify-content: center; }
.cr-footer {
  height: auto; min-height: 52px; padding: 8px 20px; justify-content: space-between;
  gap: 12px; background: var(--color-surface); border-color: var(--color-border);
  font-size: 12px; color: var(--color-text-muted);
}
.cr-footer__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; min-width: 0; }
.cr-footer__actions { display: flex; flex-shrink: 0; gap: 8px; }
.cr-footer-source, .cr-footer-time { opacity: 1; }
.cr-footer-wc, .cr-footer-go { margin-left: 0; }
.cr-footer-go, .cr-footer-fav { min-height: 36px; padding: 6px 12px; font-size: 12px; justify-content: center; border-radius: 6px; }
.cr-rp-preview-inner { overflow-wrap: anywhere; }
.cr-rp-preview-inner :deep(pre) { white-space: pre-wrap; }
.cr-rp-right { min-width: 0; }
.cr-tool-btn { font-size: 13px; min-height: 36px; }
.cr-rp-editor { caret-color: var(--color-primary); }

@media (min-width: 1024px) and (max-width: 1279px) {
  .cr-header { gap: 10px; padding-inline: 12px; }
  .cr-header__identity :deep(.uib__text) { display: none; }
  .cr-discuss-btn span { display: none; }
  .cr-radar-legend { margin-left: 0; }
}

@media (max-width: 1023px) {
  .cr-header {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 6px; padding: 6px 12px 10px; min-height: 0;
  }
  .cr-header__left { grid-column: 1; grid-row: 1; }
  .cr-header__tabs { grid-column: 2; grid-row: 1; }
  .cr-header__identity { grid-column: 3; grid-row: 1; }
  .cr-header__right { grid-column: 1 / -1; grid-row: 2; gap: 8px; justify-content: stretch; }
  .cr-header__right > * { flex: 1 1 0; min-width: 0; }
  .cr-header__right .cr-discuss-btn { flex-basis: 100%; }
  .cr-header button { min-height: 44px; }
  .cr-header__right button { width: 100%; }
  .cr-tab { flex: 1; justify-content: center; padding: 8px 6px; font-size: 13px; }
  .cr-tab > svg { display: none; }
  .cr-back { padding: 6px 8px; }
  .cr-header__identity :deep(.uib) { gap: 0; }
  .cr-header__identity :deep(.uib__text) { display: none; }
  .cr-header__identity :deep(.uib__msg-btn), .cr-header__identity :deep(.uib__card) {
    width: 44px; min-height: 44px; padding: 4px; justify-content: center;
  }
  .cr-main, .cr-report-main {
    display: flex; flex-direction: column; min-height: 0; overflow-x: hidden; overflow-y: auto;
    overscroll-behavior-y: contain; overflow-anchor: none;
  }
  .cr-left, .cr-center { flex: none; width: 100%; overflow: visible; border-right: 0; }
  .cr-cw-wrap { display: block; flex: none; width: 100%; height: 256px; overflow: hidden; }
  .cr-main--selected .cr-cw-wrap { height: auto; aspect-ratio: 400 / 900; }
  .cr-cw-svg { width: 100%; height: 100%; }
  .cr-guide-desktop { display: none; }
  .cr-guide-mobile { display: flex; }
  .cr-guide-overlay { gap: 12px; padding: 16px; }
  .cr-guide-overlay .cr-report-btn { min-height: 44px; padding: 10px 16px; }
  .cr-center-top { display: flex; flex: none; flex-direction: column; overflow: visible; }
  .cr-bubble-panel, .cr-radar-panel { flex: none; overflow: visible; border-right: 0; border-bottom: 1px solid var(--color-border); }
  .cr-bubble-panel { scroll-margin-top: 8px; }
  .cr-bubble-canvas { flex: none; height: 340px; padding: 8px 12px 12px; }
  .cr-radar-chart-area { min-height: 320px; padding: 12px; }
  .cr-radar-empty, .cr-radar-skeleton { min-height: 320px; }
  .cr-hero { padding: 16px; }
  .cr-hero-courses-btn { min-height: 44px; }
  .cr-center-bottom, .cr-planning { flex: none; overflow: visible; min-height: 0; }
  .cr-planning-empty { min-height: 180px; font-size: 13px; }
  .cr-plan-stages { flex: none; flex-direction: column; overflow: visible; padding: 12px; }
  .cr-plan-stage { flex: none; width: 100%; overflow: visible; }
  .cr-ps-head { min-height: 44px; }
  .cr-ps-list li { font-size: 14px; }
  .cr-ps-milestone { font-size: 13px; }
  .cr-ps-expand { min-height: 44px; }
  .cw-skill-panel { position: fixed; z-index: 40; right: 12px; left: 12px; width: auto; top: 50%; max-height: min(60dvh, 380px); }
  .cr-radar-legend { margin-left: 0; }
  .cr-footer { flex-direction: column; align-items: stretch; padding: 8px 12px max(8px, env(safe-area-inset-bottom)); gap: 6px; }
  .cr-footer__meta { justify-content: space-between; gap: 4px 8px; line-height: 1.5; }
  .cr-footer__actions { width: 100%; }
  .cr-footer__actions button { flex: 1; min-width: 0; min-height: 44px; padding: 6px; }
  .cr-rp-right { flex: none; order: -1; overflow: visible; }
  .cr-rp-toolbar { padding: 12px; }
  .cr-tool-btn { min-height: 44px; }
  .cr-rp-editor-wrap { flex: none; height: clamp(360px, 55dvh, 520px); }
  .cr-rp-editor { font-size: 16px; line-height: 1.7; }
  .cr-rp-preview { flex: none; min-height: 240px; overflow: visible; padding: 20px 16px; border-right: 0; border-top: 1px solid var(--color-border); }
  .cr-agent-context { flex-wrap: wrap; }
  .cr-agent-context span { white-space: normal; }
}

/* ══ prefers-reduced-motion ══ */
@media (prefers-reduced-motion: reduce) {
  .cr-page *, .cr-page *::before, .cr-page *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  .cr-bubble-canvas :deep(*) { animation: none !important; transition: none !important; }
}

/* ══ 打印 ══ */
@media print {
  .cr-back, .cr-report-btn, .cr-footer, .cr-header__tabs, .cr-export-wrap { display: none !important; }
  .cr-page { height: auto; background: #fff; }
  .cr-report-main { display: block; }
  .cr-rp-right { display: none; }
  .cr-rp-preview { border: none; padding: 20px; }
}
/* Keep both original visualization panes bounded when the real interpretation is long. */
.cr-main--real .cr-center-top{height:clamp(480px,68vh,620px);min-height:480px;grid-template-rows:minmax(0,1fr)}
.cr-main--real .cr-cw-svg{width:100%;height:100%;max-height:100%}
.cr-recent-directions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-basis:100%}.cr-recent-directions .cr-real-button{margin-top:0}.cr-saved-position{font-size:12px;color:var(--text-300)}
.cr-source-refresh{margin-top:0}.cw-personal-note__read{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:6px 0;border:0;background:none;color:var(--primary-100);font:inherit;cursor:pointer}.cw-personal-note__read:focus-visible{outline:2px solid var(--primary-100);outline-offset:3px}.cr-source-section+.cr-source-section{margin-top:32px;padding-top:26px;border-top:1px solid var(--bg-300)}.cr-source-section>h2{margin:0 0 18px;font-size:20px}.cr-source-fact{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 16px;margin:8px 0 0;line-height:1.85}.cr-source-fact dt{color:var(--text-300);font-size:12px}.cr-source-fact dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.cr-source-analysis{margin-top:24px}.cr-source-analysis>h3{margin-bottom:12px}.cr-source-analysis>p+p{margin-top:18px}.cr-real-portrait>.cr-source-portrait-title{padding:22px 24px 0;margin:0;font:500 20px/1.5 var(--font-title);color:var(--text-100)}.cr-saved-position{display:flex;align-items:center;gap:5px;margin-top:0;font-size:12px;color:var(--text-200)}@media(max-width:600px){.cr-source-fact{grid-template-columns:1fr;gap:2px}.cr-source-fact dd+dt{margin-top:12px}.cr-real-portrait>.cr-source-portrait-title{padding:20px 18px 0}}
@media(max-width:1023px){.cr-main--real .cr-center-top{height:auto;min-height:0;grid-template-rows:none}.cr-main--real.cr-main--selected .cr-cw-wrap{aspect-ratio:400/680}.cr-main--real .cr-cw-svg{max-height:none}}
</style>
