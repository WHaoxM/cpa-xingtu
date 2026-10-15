<!-- 页面：个人能力画像；路由：student/career-portrait；角色：STUDENT -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { gsap } from '@/plugins/gsap'
import UserInfoBar from '@/components/UserInfoBar.vue'
import { useResumeStore } from '@/stores/resume'
import { useReportStore } from '@/stores/report'
import { callAgentPortraitStreaming, PHASE_META } from '@/composables/useAgentPortrait'
import type { AgentPortraitResult, AgentPhase, PhaseData, PersonInfo, AbilityDimension, SummarySource } from '@/composables/useAgentPortrait'
import type { PortraitReplaySnapshot, PortraitSessionStatus } from '@/composables/usePortraitSession'
import D3FlowerChart, { DEFAULT_FLOWER_COLORS } from '@/components/charts/D3FlowerChart.vue'
import D3RadarChart, { type RadarDatum } from '@/components/charts/D3RadarChart.vue'
import { useAgentArtifactHandoff } from '@/composables/useAgentArtifactHandoff'
import { openAgentWithResource } from '@/composables/useAgentResourceHandoff'
import { getApiMode } from '@/api/config'
import type { PortraitPreview, SevenDim } from '@/types'

function dimBarStyle(idx: number, score: number): Record<string, string> {
  const hex = DEFAULT_FLOWER_COLORS[idx] ?? DEFAULT_FLOWER_COLORS[0]!
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return {
    width: score + '%',
    background: `linear-gradient(90deg, rgba(${r},${g},${b},0.60), rgba(${r},${g},${b},1.0))`,
  }
}

type RealPortraitData = {
  status: 'partial' | 'completed'
  name: string
  school: string
  major: string
  degree: string
  targetRole: string
  pagesObserved: number
  pageCount: number | null
  skills: string[]
  projects: Array<{ name: string; role: string; isTeam: boolean | null; description: string }>
  competitions: Array<{ name: string; level: string; award: string }>
  dimensions: Array<{ key: string; label: string; score: number | null; evidence: string[]; selfReported: boolean }>
  missingFacts: string[]
}

const props = withDefaults(defineProps<{
  embedded?: boolean
  replaySnapshots?: PortraitReplaySnapshot[]
  resultData?: AgentPortraitResult | null
  sessionStatus?: PortraitSessionStatus
  realPortrait?: RealPortraitData | null
}>(), {
  embedded: false,
  replaySnapshots: () => [],
  resultData: null,
  sessionStatus: 'idle',
  realPortrait: null,
})
const realFlowerData = computed(() => (props.realPortrait?.dimensions || []).map(dimension => ({
  axis: dimension.label,
  value: dimension.score,
})))
const realScoreCount = computed(() => props.realPortrait?.dimensions.filter(dimension => dimension.score !== null).length ?? 0)
const realVisualKey = computed(() => props.realPortrait?.dimensions.map(dimension => dimension.score ?? 'pending').join('-') || '')
const realSkillTerms = computed(() => {
  const terms: Array<{ label: string; mentions: number }> = []
  const byLabel = new Map<string, (typeof terms)[number]>()
  for (const raw of props.realPortrait?.skills || []) {
    const label = raw.trim()
    if (!label) continue
    const existing = byLabel.get(label)
    if (existing) existing.mentions += 1
    else {
      const term = { label, mentions: 1 }
      byLabel.set(label, term)
      terms.push(term)
    }
  }
  return terms
})
const realCompetitionGroups = computed(() => {
  const groups: Array<{ name: string; levels: string[]; awards: string[]; mentions: number }> = []
  const byName = new Map<string, (typeof groups)[number]>()
  for (const competition of props.realPortrait?.competitions || []) {
    const name = competition.name.trim()
    if (!name) continue
    let group = byName.get(name)
    if (!group) {
      group = { name, levels: [], awards: [], mentions: 0 }
      byName.set(name, group)
      groups.push(group)
    }
    group.mentions += 1
    const level = competition.level && competition.level !== '其他' ? competition.level.trim() : ''
    const award = competition.award && competition.award !== '其他' ? competition.award.trim() : ''
    if (level && !group.levels.includes(level)) group.levels.push(level)
    if (award && award !== level && !group.awards.includes(award)) group.awards.push(award)
  }
  return groups
})

const router = useRouter()
const route = useRoute()
const artifactId = computed(() => {
  const value = route.query.artifact_id
  return typeof value === 'string' ? value : ''
})
const artifactHandoff = useAgentArtifactHandoff(() => artifactId.value)
const artifactPreview = computed<PortraitPreview | null>(() => {
  const artifact = artifactHandoff.artifact.value
  if (!artifact || artifact.kind !== 'portrait') return null
  const preview = artifact.preview as PortraitPreview | undefined
  if (!preview || typeof preview !== 'object' || preview.type !== 'portrait_preview') return null
  const scores = preview.scores
  if (!scores || !['d1', 'd2', 'd3', 'd4'].every(key => {
    const score = scores[key as keyof typeof scores]
    return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100
  })) return null
  return preview
})
const artifactError = computed(() => {
  if (!artifactId.value || artifactHandoff.loading.value) return ''
  return artifactHandoff.error.value || (!artifactPreview.value ? '这份成果物缺少可用于四维画像的有效分数，无法展示为能力画像。' : '')
})
function returnToAgent() {
  void router.push({ name: 'student-ai-assistant', query: artifactHandoff.sessionId.value ? { session_id: artifactHandoff.sessionId.value } : {} })
}
function discussCurrentPortrait() {
  openAgentWithResource(router, { kind: 'career_resource', uri: 'career://me/portrait' })
}
const resumeStore = useResumeStore()
const reportStore = useReportStore()

/* ═══ 完整结果（保存/导出用） ═══ */
const portraitData = ref<AgentPortraitResult | null>(null)
const portraitSaved = ref(false)
const pageRef = ref<HTMLElement | null>(null)

/* ═══ 阶段渐进渲染 ═══ */
const portraitAgentLoading = ref(false)
const currentPhase = ref<AgentPhase | 'idle' | 'done'>('idle')
const phaseIndex = computed(() => {
  const map: Record<string, number> = { idle: -1, parsing: 0, evaluating: 1, analyzing: 2, summarizing: 3, done: 4 }
  return map[currentPhase.value] ?? -1
})

const phasePersonInfo = ref<PersonInfo | null>(null)
const phaseCompleteness = ref(0)
type DisplayDimension = Omit<AbilityDimension, 'key' | 'level' | 'source'> & {
  key: string
  level?: AbilityDimension['level']
  source?: AbilityDimension['source']
}
const phaseDimensions = ref<DisplayDimension[]>([])
const phaseCompetitiveness = ref(0)
const phaseSkillTags = ref<{ name: string; weight: number; category: string }[]>([])
const phaseHonors = ref<PersonInfo['honors']>([])
const phaseProjects = ref<PersonInfo['projects']>([])

/* ═══ AI 综评（string | ReadableStream 双模式） ═══ */
const displaySummary = ref('')
const summaryDone = ref(false)
let typingTimer: ReturnType<typeof setInterval> | null = null
let fullSummaryText = ''

const phaseOrder: Record<AgentPhase, number> = {
  parsing: 0,
  evaluating: 1,
  analyzing: 2,
  summarizing: 3,
}

const processedPhases = new Set<AgentPhase>()

function startTyping(fullText: string) {
  displaySummary.value = ''
  summaryDone.value = false
  fullSummaryText = fullText
  let idx = 0
  typingTimer = setInterval(() => {
    displaySummary.value += fullText[idx++] ?? ''
    if (idx >= fullText.length) {
      clearInterval(typingTimer!)
      typingTimer = null
      summaryDone.value = true
    }
  }, 28)
}

async function streamToDisplay(stream: ReadableStream<string>) {
  const reader = stream.getReader()
  displaySummary.value = ''
  summaryDone.value = false
  fullSummaryText = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      displaySummary.value += value
      fullSummaryText = displaySummary.value
    }
  } finally {
    reader.releaseLock()
    summaryDone.value = true
  }
}

function renderSummary(source: SummarySource) {
  if (typeof source === 'string') {
    startTyping(source)
  } else {
    streamToDisplay(source)
  }
}

function stopTyping() {
  if (typingTimer) { clearInterval(typingTimer); typingTimer = null }
  displaySummary.value = fullSummaryText || portraitData.value?.agentSummary || ''
  summaryDone.value = true
}

function resetPortraitState() {
  stopTyping()
  processedPhases.clear()
  portraitSaved.value = false
  portraitData.value = null
  portraitAgentLoading.value = false
  currentPhase.value = 'idle'
  phasePersonInfo.value = null
  phaseCompleteness.value = 0
  phaseDimensions.value = []
  phaseCompetitiveness.value = 0
  phaseSkillTags.value = []
  phaseHonors.value = []
  phaseProjects.value = []
  displaySummary.value = ''
  summaryDone.value = false
  fullSummaryText = ''
}

function exportPortrait() {
  window.print()
}

function savePortraitReport() {
  if (!portraitData.value) return
  const predictedRole = resumeStore.insights?.predictedRole ?? '未知方向'
  const today = new Date().toISOString().slice(0, 10)
  reportStore.addRecord({
    type: 'portrait',
    title: `${today} · ${predictedRole}方向画像`,
    snapshot: {
      predictedRole,
      competitivenessScore: portraitData.value.competitivenessScore,
      completenessScore: portraitData.value.completenessScore,
      sevenDim: portraitData.value.dimensions,
      skillTags: portraitData.value.skillTags,
      personInfo: portraitData.value.personInfo,
    },
  })
  portraitSaved.value = true
}

function goToCareerReport() {
  router.push({ name: 'student-career-report' })
}

function goToResumeBuilder() {
  router.push({ name: 'student-resume-builder' })
}

function goBack() {
  router.push({ name: 'student-career-navigation' })
}

/* ═══ D3 雷达图数据（基于阶段 ref） ═══ */
const radarData = computed<RadarDatum[]>(() => {
  if (!phaseDimensions.value.length) return []
  return phaseDimensions.value.map(d => ({
    axis: d.label,
    value: d.score,
    level: d.level,
    desc: d.desc,
  }))
})

/* ═══ 建议（基于阶段 ref） ═══ */
const portraitSuggestions = computed(() => {
  if (!phaseDimensions.value.length) return []
  const dims = phaseDimensions.value
  const sorted = [...dims].sort((a, b) => a.score - b.score)
  const topDim = [...dims].sort((a, b) => b.score - a.score)[0]!
  const weak1 = sorted[0]!
  const weak2 = sorted[1]!
  const actionMap: Record<string, string> = {
    professional: '系统学习行业主流技术栈，完成 2-3 个完整项目',
    certificate:  '备考 1-2 项行业认可证书（如软考、云计算认证）',
    innovation:   '参与开源项目或黑客马拉松，积累创新实践经历',
    learning:     '制定系统学习计划，建立个人技术知识体系',
    stress:       '争取高强度项目经历，参与团队协作与冲刺开发',
    communication:'加入技术社区，进行技术分享或撰写技术博客',
    internship:   '积极寻求暑期/兼职实习，优先匹配目标方向岗位',
  }
  return [
    { type: 'strength', label: '核心优势', text: `「${topDim.label}」是你的突出优势（${topDim.score}分），持续深耕可成为核心竞争力` },
    { type: 'improve',  label: '优先提升', text: `「${weak1.label}」得分偏低（${weak1.score}分）：${actionMap[weak1.key] ?? '针对性提升该维度'}` },
    { type: 'improve',  label: '建议加强', text: `「${weak2.label}」（${weak2.score}分）仍有提升空间：${actionMap[weak2.key] ?? '持续关注并加强'}` },
  ]
})

/* ═══ 每阶段入场动画 ═══ */
const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function animatePhase1() {
  if (reducedMotion) return
  gsap.fromTo('.tp-portrait__header', { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' })
}

function animatePhase2() {
  if (reducedMotion) return
  gsap.fromTo('.tp-portrait__radar-wrap', { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.2)' })
  gsap.fromTo('.tp-portrait__dim-item', { opacity: 0, x: 14 }, { opacity: 1, x: 0, stagger: 0.05, duration: 0.28, ease: 'power2.out', delay: 0.1 })
  gsap.fromTo('.tp-portrait__tag', { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, stagger: 0.03, duration: 0.22, ease: 'back.out(1.4)', delay: 0.2 })
}

function animatePhase3() {
  if (reducedMotion) return
  gsap.fromTo('.tp-portrait__honor-card', { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.06, duration: 0.3, ease: 'power2.out' })
  gsap.fromTo('.tp-portrait__project-card', { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.08, duration: 0.3, ease: 'power2.out', delay: 0.12 })
}

function animatePhase4() {
  if (reducedMotion) return
  gsap.fromTo('.tp-portrait__summary', { opacity: 0 }, { opacity: 1, duration: 0.4 })
  gsap.fromTo('.tp-portrait__step-guide', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, delay: 0.15, ease: 'power2.out' })
}

/* ═══ 阶段回调处理 ═══ */
function applyPhaseData(data: PhaseData) {
  if (artifactId.value) return
  if (portraitAgentLoading.value) {
    portraitAgentLoading.value = false
  }

  switch (data.phase) {
    case 'parsing':
      phasePersonInfo.value = data.personInfo
      phaseCompleteness.value = data.completenessScore
      currentPhase.value = 'parsing'
      nextTick(() => animatePhase1())
      break
    case 'evaluating':
      phaseDimensions.value = data.dimensions
      phaseCompetitiveness.value = data.competitivenessScore
      phaseSkillTags.value = data.skillTags
      currentPhase.value = 'evaluating'
      {
        const dimMap: Record<string, number> = {}
        for (const d of data.dimensions) dimMap[d.key] = d.score
        const seven: SevenDim = {
          专业技能: dimMap.professional ?? 0,
          证书资质: dimMap.certificate ?? 0,
          创新能力: dimMap.innovation ?? 0,
          学习能力: dimMap.learning ?? 0,
          抗压能力: dimMap.stress ?? 0,
          沟通能力: dimMap.communication ?? 0,
          实习经验: dimMap.internship ?? 0,
        }
        resumeStore.setPortraitDimensions(seven)
      }
      nextTick(() => animatePhase2())
      break
    case 'analyzing':
      phaseHonors.value = data.honors
      phaseProjects.value = data.projects
      currentPhase.value = 'analyzing'
      nextTick(() => animatePhase3())
      break
    case 'summarizing':
      currentPhase.value = 'summarizing'
      nextTick(() => {
        animatePhase4()
        renderSummary(data.agentSummary)
      })
      break
  }
}

function syncEmbeddedSnapshots(snapshots: PortraitReplaySnapshot[]) {
  const orderedSnapshots = [...snapshots].sort((a, b) => phaseOrder[a.phase] - phaseOrder[b.phase])
  portraitData.value = props.resultData ?? null
  if (!orderedSnapshots.length) {
    portraitAgentLoading.value = props.sessionStatus === 'running'
    if (props.sessionStatus === 'completed') {
      currentPhase.value = 'done'
    }
    return
  }
  for (const snapshot of orderedSnapshots) {
    if (processedPhases.has(snapshot.phase)) continue
    applyPhaseData(snapshot.data)
    processedPhases.add(snapshot.phase)
  }
  if (props.sessionStatus === 'completed') {
    portraitAgentLoading.value = false
    currentPhase.value = 'done'
  }
}

watch(
  () => props.sessionStatus,
  status => {
    if (!props.embedded) return
    if (status === 'idle') {
      resetPortraitState()
      return
    }
    if (!props.replaySnapshots.length) {
      portraitAgentLoading.value = status === 'running'
    }
    if (status === 'completed' && props.replaySnapshots.length) {
      portraitAgentLoading.value = false
      currentPhase.value = 'done'
    }
  },
  { immediate: true },
)

watch(
  () => props.resultData,
  data => {
    if (!props.embedded) return
    portraitData.value = data ?? null
  },
  { immediate: true },
)

watch(
  () => props.replaySnapshots,
  snapshots => {
    if (!props.embedded) return
    syncEmbeddedSnapshots(snapshots)
  },
  { deep: true, immediate: true },
)

async function initializePortrait() {
  if (props.realPortrait) return
  if (!resumeStore.isParsed) {
    if (!props.embedded) {
      router.replace({ name: 'student-career-navigation' })
    }
    return
  }

  if (props.embedded) {
    return
  }

  await nextTick()
  if (artifactId.value) return
  resetPortraitState()
  portraitAgentLoading.value = true
  try {
    const result = await callAgentPortraitStreaming(
      {
        resumeText: resumeStore.rawText || resumeStore.fileName,
        parsedSkills: resumeStore.parsedSkills,
        predictedRole: resumeStore.insights?.predictedRole ?? '前端开发',
        confidence: resumeStore.insights?.confidence ?? 0.7,
        matchedCareers: resumeStore.matchedCareers,
      },
      applyPhaseData,
    )
    if (artifactId.value) return
    portraitData.value = result
    currentPhase.value = 'done'
  } catch {
    portraitAgentLoading.value = false
  }
}

onMounted(() => {
  if (!artifactId.value) void initializePortrait()
})

watch(artifactId, (current, previous) => {
  if (!current && previous && !props.embedded) void initializePortrait()
})

watch([artifactId, artifactPreview], ([id, preview]) => {
  if (!id || props.embedded) return
  resetPortraitState()
  if (!preview?.scores) return
  const labels: Record<'d1' | 'd2' | 'd3' | 'd4', string> = {
    d1: '基础素质', d2: '专业技能', d3: '项目经验', d4: '综合潜力',
  }
  phaseDimensions.value = (['d1', 'd2', 'd3', 'd4'] as const).map(key => ({
    key,
    label: labels[key],
    score: preview.scores![key]!,
    desc: '',
  }))
  displaySummary.value = artifactHandoff.artifact.value?.summary || ''
  summaryDone.value = true
  currentPhase.value = 'done'
}, { immediate: true })

onBeforeUnmount(() => {
  if (typingTimer) clearInterval(typingTimer)
})
</script>

<template>
  <div :class="['tp-page', { 'tp-page--embedded': props.embedded }]" ref="pageRef">

    <!-- HEADER -->
    <header v-if="!props.embedded" class="tp-header">
      <div class="tp-header__left">
        <button class="tp-back" @click="artifactId ? returnToAgent() : goBack()"><Icon icon="lucide:arrow-left" :width="14"/><span>{{ artifactId ? '返回 Agent 对话' : '重新上传' }}</span></button>
        <span class="tp-brand-name">职途导航</span>
        <div class="tp-header-tag">个人能力画像</div>
      </div>
      <div class="tp-header__right">
        <UserInfoBar />
        <button v-if="!artifactId" class="tp-export-btn" @click="exportPortrait">
          <Icon icon="lucide:download" :width="12"/><span>导出报告</span>
        </button>
      </div>
    </header>

    <!-- ═══ 阶段进度指示器 ═══ -->
    <div v-if="!artifactId && phaseIndex >= 0 && currentPhase !== 'done'" class="tp-phase-bar">
      <div
        v-for="(pm, idx) in PHASE_META" :key="pm.key"
        class="tp-phase-step"
        :class="{
          'tp-phase-step--done': phaseIndex > idx,
          'tp-phase-step--active': phaseIndex === idx,
          'tp-phase-step--waiting': phaseIndex < idx,
        }"
      >
        <span class="tp-phase-dot">
          <Icon v-if="phaseIndex > idx" icon="lucide:check" :width="9"/>
          <Icon v-else-if="phaseIndex === idx" icon="lucide:loader-circle" :width="9" class="tp-loading-spin"/>
          <span v-else class="tp-phase-num">{{ idx + 1 }}</span>
        </span>
        <span class="tp-phase-label">{{ pm.label }}</span>
        <span v-if="idx < PHASE_META.length - 1" class="tp-phase-line" :class="{ 'tp-phase-line--done': phaseIndex > idx }"/>
      </div>
    </div>

    <!-- 同一画像组件的真实任务视图：保留原有全屏构图，缺证维度不补零。 -->
    <div v-if="props.realPortrait" class="tp-portrait tp-portrait--real">
      <div class="tp-artifact__intro tp-real__intro">
        <span class="tp-portrait__section-lbl">职途导航 · 简历证据画像</span>
        <div class="tp-real__title-row">
          <h1>{{ props.realPortrait.status === 'partial' ? '当前可了解的能力信息' : '你的个人能力画像' }}</h1>
          <span class="tp-real__state">{{ props.realPortrait.status === 'partial' ? '当前结果 · 有待核对项' : '已保存画像' }}</span>
        </div>
        <p>{{ props.realPortrait.status === 'partial' ? '这份结果来自已确认的简历。没有足够依据的维度留空，但已知经历和能力线索现在就可以阅读。' : '以下内容来自已保存的服务端画像及其对应简历，不使用本地演示分数。' }}</p>
        <button v-if="getApiMode() === 'http'" type="button" class="tp-real__agent-link" @click="discussCurrentPortrait">
          与 AI 助手讨论当前画像 <Icon icon="lucide:arrow-up-right" :width="15" />
        </button>
        <p v-if="getApiMode() === 'http'" class="tp-real__handoff-note">助手会按当前登录身份重新读取最新画像；若本页是历史任务快照，以服务端当前版本为准。</p>
      </div>

      <div class="tp-portrait__header">
        <div class="tp-portrait__header-top">
          <div class="tp-portrait__avatar">{{ props.realPortrait.name ? props.realPortrait.name.charAt(0) : '职' }}</div>
          <div class="tp-portrait__info">
            <div class="tp-portrait__name-row">
              <span class="tp-portrait__name">{{ props.realPortrait.name || '简历档案' }}</span>
              <span v-if="props.realPortrait.degree" class="tp-portrait__grade">{{ props.realPortrait.degree }}</span>
              <span v-if="props.realPortrait.targetRole" class="tp-portrait__target">{{ props.realPortrait.targetRole }}</span>
            </div>
            <div v-if="props.realPortrait.school || props.realPortrait.major" class="tp-portrait__school-row">
              <Icon icon="lucide:school" :width="12" class="tp-portrait__meta-icon" />
              <span v-if="props.realPortrait.school">{{ props.realPortrait.school }}</span>
              <span v-if="props.realPortrait.school && props.realPortrait.major" class="tp-portrait__sep">·</span>
              <span v-if="props.realPortrait.major">{{ props.realPortrait.major }}</span>
            </div>
          </div>
        </div>
        <dl class="tp-real__result-summary">
          <div><dt>现在已知</dt><dd>简历提及 {{ realSkillTerms.length }} 个不同技术词、{{ props.realPortrait.projects.length }} 项项目；{{ realScoreCount }} 个维度有可查看的依据分数。{{ props.realPortrait.pageCount !== null ? `已取得 ${props.realPortrait.pagesObserved} / ${props.realPortrait.pageCount} 页文字证据。` : '' }}</dd></div>
          <div><dt>仍不确定</dt><dd>{{ props.realPortrait.missingFacts.length ? props.realPortrait.missingFacts.slice(0, 3).join('、') + (props.realPortrait.missingFacts.length > 3 ? '等依据' : '的依据') : '本次画像没有缺证维度；这不代表已经完成岗位匹配。' }}</dd></div>
           <div><dt>可以先做</dt><dd>查看简历经历与诊断报告，再向下探索职业方向。若原简历有遗漏，可补充后重新上传核对；未知维度不会按零分计。</dd></div>
        </dl>
      </div>

      <div class="tp-portrait__viz-row">
        <div class="tp-portrait__radar-wrap tp-real__flower">
          <D3FlowerChart :key="realVisualKey" :data="realFlowerData" :colors="DEFAULT_FLOWER_COLORS" :zoom="1.6" />
        </div>
        <div class="tp-portrait__dims">
          <div v-for="(dimension, index) in props.realPortrait.dimensions" :key="dimension.key" class="tp-portrait__dim-item">
            <div class="tp-portrait__dim-top">
              <span class="tp-portrait__dim-label">{{ dimension.label }}</span>
              <span class="tp-real__dim-status">{{ dimension.score === null ? '待核对' : dimension.selfReported ? '含用户自述' : props.realPortrait.status === 'partial' ? '候选分' : '已保存' }}</span>
            </div>
            <div class="tp-portrait__dim-bar-wrap">
              <div class="tp-portrait__dim-track" :class="{ 'tp-real__track-pending': dimension.score === null }">
                <div v-if="dimension.score !== null" class="tp-portrait__dim-bar" :style="dimBarStyle(index, dimension.score)"></div>
              </div>
              <span class="tp-portrait__dim-score">{{ dimension.score === null ? '—' : dimension.score }}</span>
            </div>
            <details v-if="dimension.evidence.length" class="tp-real__evidence">
              <summary>查看 {{ dimension.evidence.length }} 条{{ dimension.selfReported ? '自述' : '依据' }}</summary>
              <ul><li v-for="(evidence, evidenceIndex) in dimension.evidence" :key="evidenceIndex">{{ evidence }}</li></ul>
            </details>
          </div>
        </div>
      </div>
      <p class="tp-real__legend">彩色花瓣与进度条表示服务端分数；灰色轮廓和虚线表示尚无可确认分数，而不是零分。</p>

      <div v-if="props.realPortrait.skills.length || props.realPortrait.projects.length || props.realPortrait.competitions.length" class="tp-portrait__highlights tp-real__highlights">
        <div v-if="props.realPortrait.projects.length || props.realPortrait.competitions.length" class="tp-real__section-heading">
          <div><span class="tp-portrait__section-lbl">简历中的实践</span><h2>项目与竞赛经历</h2></div>
          <span class="tp-real__source-label">简历提取内容 · 可对照原件核对</span>
        </div>
        <div v-if="props.realPortrait.projects.length || props.realPortrait.competitions.length" class="tp-real__story-grid">
          <section v-if="props.realPortrait.projects.length" class="tp-real__story-column" aria-label="项目经历">
            <div class="tp-real__column-heading"><Icon icon="lucide:layers-3" :width="17" /><h3>项目经历</h3><span>{{ props.realPortrait.projects.length }} 项</span></div>
            <div v-for="(project, index) in props.realPortrait.projects" :key="index" class="tp-portrait__project-card tp-real__project-card">
              <div class="tp-portrait__project-accent"></div>
              <div class="tp-portrait__project-body">
                <div class="tp-real__project-title"><span class="tp-real__ordinal">{{ String(index + 1).padStart(2, '0') }}</span><h4>{{ project.name || '未命名项目' }}</h4></div>
                <div v-if="project.role || project.isTeam !== null" class="tp-real__project-meta"><span v-if="project.role">{{ project.role }}</span><span v-if="project.isTeam !== null">{{ project.isTeam ? '团队项目' : '独立项目' }}</span></div>
                <p v-if="project.description" class="tp-portrait__project-desc">{{ project.description }}</p>
              </div>
            </div>
          </section>
          <section v-if="props.realPortrait.competitions.length" class="tp-real__story-column tp-real__awards" aria-label="竞赛记录">
            <div class="tp-real__column-heading"><Icon icon="lucide:award" :width="17" /><h3>竞赛记录</h3><span>{{ realCompetitionGroups.length }} 个名称</span></div>
            <div v-for="competition in realCompetitionGroups" :key="competition.name" class="tp-real__award-row">
              <span class="tp-real__award-content">
                <strong class="tp-real__award-name">{{ competition.name }}</strong>
                <small v-if="competition.mentions > 1" class="tp-real__award-detail">简历中同名记录 {{ competition.mentions }} 条，请核对是否为不同届次或奖项。</small>
                <small v-if="competition.levels.length || competition.awards.length" class="tp-real__award-detail">
                  <template v-if="competition.levels.length">提取到的级别：{{ competition.levels.join('、') }}</template>
                  <template v-if="competition.levels.length && competition.awards.length">；</template>
                  <template v-if="competition.awards.length">提取到的奖项：{{ competition.awards.join('、') }}</template>
                </small>
              </span>
            </div>
          </section>
        </div>
        <details v-if="realSkillTerms.length" class="tp-real__skill-area">
          <summary><Icon icon="lucide:list-checks" :width="16" /><span>核对简历中的技术词</span><small>{{ realSkillTerms.length }} 个不同词</small><Icon icon="lucide:chevron-down" :width="15" class="tp-real__skill-chevron" /></summary>
          <p class="tp-real__hint">这里是原文提及的工具、技术和方法，可能包含重复；提及不等于掌握，也不能单独证明能力。</p>
          <ul class="tp-real__skill-list"><li v-for="term in realSkillTerms" :key="term.label"><span>{{ term.label }}</span><small v-if="term.mentions > 1">提及 {{ term.mentions }} 次</small></li></ul>
        </details>
      </div>

      <div v-if="props.realPortrait.missingFacts.length" class="tp-portrait__summary tp-real__followup">
        <span class="tp-portrait__section-lbl">下一步 · 补足可核对依据</span>
        <p>{{ props.realPortrait.missingFacts.length }} 项事实仍需核对；简历诊断独立整理，完成后可查看。正式岗位匹配仍要满足证据条件，这不代表你没有相关能力。</p>
        <div class="tp-real__fact-list"><span v-for="fact in props.realPortrait.missingFacts" :key="fact">{{ fact }}</span></div>
      </div>
    </div>

    <!-- 初始加载中（Phase 1 到达前） -->
    <div v-else-if="artifactId && artifactHandoff.loading.value" class="tp-loading-wrap" role="status">
      <Icon icon="lucide:loader-circle" :width="34" class="tp-loading-spin" />
      <p class="tp-loading-msg">正在载入本次 Agent 画像…</p>
    </div>
    <div v-else-if="artifactId && artifactError" class="tp-loading-wrap" role="alert">
      <Icon icon="lucide:circle-alert" :width="34" />
      <p class="tp-loading-msg">{{ artifactError }}</p>
      <button type="button" class="tp-artifact__back" @click="returnToAgent">返回原对话</button>
    </div>
    <div v-else-if="portraitAgentLoading" class="tp-loading-wrap">
      <div class="tp-loading-seal">
        <Icon icon="lucide:loader-circle" :width="34" class="tp-loading-spin" />
      </div>
      <p class="tp-loading-msg">正在连接 Agent 分析服务…</p>
    </div>

    <!-- 画像内容（按阶段渐进渲染） -->
    <div v-else-if="phaseIndex >= 0" class="tp-portrait">

      <div v-if="artifactId" class="tp-artifact__intro">
        <span class="tp-portrait__section-lbl">本次 Agent 对话生成</span>
        <h1>{{ artifactHandoff.artifact.value?.title || '四维能力画像' }}</h1>
        <p>以下四维分数直接来自同一份对话产物；其他简历档案与七维评价未随本产物提供。</p>
      </div>

      <!-- [A] 个人信息 + 评分横幅（Phase ① parsing） -->
      <div v-if="phasePersonInfo" class="tp-portrait__header">
        <div class="tp-portrait__header-top">
          <div class="tp-portrait__avatar">{{ phasePersonInfo.name.charAt(0) }}</div>
          <div class="tp-portrait__info">
            <div class="tp-portrait__name-row">
              <span class="tp-portrait__name">{{ phasePersonInfo.name }}</span>
              <span class="tp-portrait__grade">{{ phasePersonInfo.grade }}</span>
              <span class="tp-portrait__target">{{ phasePersonInfo.targetRole }}</span>
            </div>
            <div class="tp-portrait__school-row">
              <Icon icon="lucide:school" :width="10" class="tp-portrait__meta-icon"/>
              <span>{{ phasePersonInfo.school }}</span>
              <span class="tp-portrait__sep">·</span>
              <span>{{ phasePersonInfo.major }}</span>
              <template v-if="phasePersonInfo.gpa">
                <span class="tp-portrait__sep">·</span>
                <span>GPA {{ phasePersonInfo.gpa }}</span>
              </template>
            </div>
          </div>
        </div>
        <!-- 评分横幅 -->
        <div class="tp-portrait__score-banner">
          <div class="tp-portrait__score-card tp-portrait__score-card--completeness">
            <span class="tp-portrait__score-val">{{ phaseCompleteness }}<em>%</em></span>
            <span class="tp-portrait__score-lbl">完整度</span>
          </div>
          <div class="tp-portrait__score-card tp-portrait__score-card--competitiveness" :class="{ 'tp-portrait__score-card--pending': !phaseCompetitiveness }">
            <template v-if="phaseCompetitiveness">
              <span class="tp-portrait__score-val">{{ phaseCompetitiveness }}<em>分</em></span>
            </template>
            <template v-else>
              <span class="tp-portrait__score-val tp-portrait__score-val--pending">--<em>分</em></span>
            </template>
            <span class="tp-portrait__score-lbl">竞争力</span>
          </div>
          <div class="tp-portrait__score-card tp-portrait__score-card--honors">
            <div class="tp-portrait__honor-row">
              <span class="tp-portrait__honor-item">
                <Icon icon="lucide:award" :width="11"/>
                <strong>{{ phasePersonInfo.honors.filter(h => h.type === 'cert').length }}</strong> 证书
              </span>
              <span class="tp-portrait__honor-item">
                <Icon icon="lucide:briefcase" :width="11"/>
                <strong>{{ phasePersonInfo.honors.filter(h => h.type === 'intern').length }}</strong> 实习
              </span>
              <span class="tp-portrait__honor-item">
                <Icon icon="lucide:trophy" :width="11"/>
                <strong>{{ phasePersonInfo.honors.filter(h => h.type === 'award').length }}</strong> 获奖
              </span>
            </div>
            <span class="tp-portrait__score-lbl">荣誉档案</span>
          </div>
        </div>
      </div>

      <!-- [B+C] 雷达图 + 分项评分（Phase ② evaluating） -->
      <div v-if="phaseDimensions.length" class="tp-portrait__viz-row">
        <div class="tp-portrait__radar-wrap">
          <D3RadarChart v-if="artifactId" :data="radarData" :show-legend="false" />
          <D3FlowerChart v-else :data="radarData" :colors="DEFAULT_FLOWER_COLORS" />
        </div>
        <div class="tp-portrait__dims">
          <div
            v-for="(dim, dimIdx) in phaseDimensions" :key="dim.key"
            class="tp-portrait__dim-item"
          >
            <div class="tp-portrait__dim-top">
              <span class="tp-portrait__dim-label">{{ dim.label }}</span>
              <span v-if="!artifactId" class="tp-portrait__dim-badge"
                :class="`tp-portrait__dim-badge--${dim.level === '优秀' ? 'good' : dim.level === '良好' ? 'mid' : 'low'}`">
                {{ dim.level }}
              </span>
              <span v-if="!artifactId" class="tp-portrait__dim-src"
                :class="{ 'tp-portrait__dim-src--agent': dim.source === 'agent' }"
                :title="dim.source === 'agent' ? 'AI 模型计算（后端论文算法）' : '基于简历数据直接计算'">
                <Icon :icon="dim.source === 'agent' ? 'lucide:bot' : 'lucide:calculator'" :width="9"/>
              </span>
            </div>
            <div class="tp-portrait__dim-bar-wrap">
              <div class="tp-portrait__dim-track">
                <div class="tp-portrait__dim-bar"
                  :style="dimBarStyle(dimIdx, dim.score)"
                  :class="`tp-portrait__dim-bar--${dim.level === '优秀' ? 'good' : dim.level === '良好' ? 'mid' : 'low'}`">
                </div>
              </div>
              <span class="tp-portrait__dim-score">{{ dim.score }}</span>
            </div>
            <p v-if="dim.desc" class="tp-portrait__dim-desc">{{ dim.desc }}</p>
          </div>
          <!-- 技能标签（内嵌于维度面板底部） -->
          <div v-if="phaseSkillTags.length" class="tp-portrait__tags-inline">
            <span class="tp-portrait__tags-inline-lbl">技能清单</span>
            <div class="tp-portrait__tags">
              <span
                v-for="tag in phaseSkillTags" :key="tag.name"
                class="tp-portrait__tag"
                :class="`tp-portrait__tag--${tag.category === '前端' ? 'fe' : tag.category === '后端' ? 'be' : tag.category === '测试' ? 'qa' : (tag.category === '数据' || tag.category === '机器学习') ? 'data' : 'gen'}`"
                :style="{ opacity: 0.55 + tag.weight * 0.45, fontSize: (9 + tag.weight * 3) + 'px' }"
                :title="'权重: ' + Math.round(tag.weight * 100) + '%'"
              >{{ tag.name }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="artifactId && (artifactPreview?.strengths?.length || artifactPreview?.weaknesses?.length)" class="tp-artifact__insights">
        <div v-if="artifactPreview?.strengths?.length"><strong>优势</strong><span v-for="item in artifactPreview.strengths" :key="item">{{ item }}</span></div>
        <div v-if="artifactPreview?.weaknesses?.length"><strong>待提升</strong><span v-for="item in artifactPreview.weaknesses" :key="item">{{ item }}</span></div>
      </div>

      <!-- [D] 经历亮点（Phase ③ analyzing） -->
      <div v-if="phaseHonors.length || phaseProjects.length" class="tp-portrait__highlights">
        <span class="tp-portrait__section-lbl">经历亮点</span>
        <div class="tp-portrait__highlights-grid">
          <!-- 荣誉/证书/实习列 -->
          <div class="tp-portrait__highlights-col">
            <div
              v-for="h in phaseHonors" :key="h.label"
              class="tp-portrait__honor-card"
              :class="`tp-portrait__honor-card--${h.type}`"
            >
              <Icon :icon="h.type === 'cert' ? 'lucide:award' : h.type === 'intern' ? 'lucide:briefcase' : 'lucide:trophy'" :width="13" class="tp-portrait__honor-icon"/>
              <span class="tp-portrait__honor-lbl">{{ h.label }}</span>
            </div>
          </div>
          <!-- 项目经历列 -->
          <div class="tp-portrait__highlights-col">
            <div
              v-for="(proj, i) in phaseProjects" :key="i"
              class="tp-portrait__project-card"
            >
              <div class="tp-portrait__project-accent"></div>
              <div class="tp-portrait__project-body">
                <div class="tp-portrait__project-head">
                  <span class="tp-portrait__project-name">{{ proj.name }}</span>
                  <span class="tp-portrait__project-role">{{ proj.role }}</span>
                </div>
                <p class="tp-portrait__project-desc">{{ proj.desc }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- [E] AI 综合评语 + 建议 + 自我评价（Phase ④ summarizing） -->
      <div v-if="currentPhase === 'summarizing' || currentPhase === 'done'" class="tp-portrait__summary">
        <span class="tp-portrait__section-lbl">
          <Icon icon="lucide:bot" :width="10" style="vertical-align: middle; margin-right: 4px;"/>{{ artifactId ? '本次产物摘要' : 'AI 综合评语' }}
        </span>
        <p class="tp-portrait__summary-text" @click="!artifactId && stopTyping()">
          {{ displaySummary }}<span v-if="!summaryDone && !artifactId" class="tp-typing-cursor">|</span>
        </p>
        <!-- 三条具体建议 -->
        <div v-if="!artifactId" class="tp-portrait__suggestions">
          <div
            v-for="(s, i) in portraitSuggestions" :key="i"
            class="tp-portrait__suggestion"
            :class="`tp-portrait__suggestion--${s.type}`"
          >
            <span class="tp-portrait__suggestion-lbl">{{ s.label }}</span>
            <span class="tp-portrait__suggestion-text">{{ s.text }}</span>
          </div>
        </div>
        <template v-if="phasePersonInfo?.selfSummary">
          <div class="tp-portrait__summary-divider"></div>
          <span class="tp-portrait__section-lbl" style="margin-top: 2px;">自我评价</span>
          <p class="tp-portrait__self-summary">{{ phasePersonInfo.selfSummary }}</p>
        </template>
      </div>

      <!-- [H] 操作区（Phase ④ 完成后显示） -->
      <div v-if="!artifactId && (currentPhase === 'summarizing' || currentPhase === 'done')" class="tp-portrait__step-guide">
        <div class="tp-portrait__step-guide-inner">
          <div class="tp-portrait__step-guide-info">
            <span class="tp-portrait__step-guide-title">能力画像已生成 —— 下一步</span>
            <p class="tp-portrait__step-guide-desc">保存画像报告，或根据你关注的方向查看人岗匹配分析</p>
          </div>
          <div class="tp-portrait__step-actions">
            <button
              class="tp-portrait__step-guide-btn tp-portrait__step-guide-btn--secondary"
              :disabled="portraitSaved"
              @click="savePortraitReport"
            >
              <Icon :icon="portraitSaved ? 'lucide:check' : 'lucide:save'" :width="13"/>
              {{ portraitSaved ? '已保存' : '保存画像报告' }}
            </button>
            <button
              class="tp-portrait__step-guide-btn"
              :disabled="!summaryDone"
              @click="goToCareerReport"
            >
              <Icon icon="lucide:map" :width="13"/>
              查看人岗匹配报告
              <Icon icon="lucide:arrow-right" :width="12"/>
            </button>
            <button
              class="tp-portrait__step-guide-btn tp-portrait__step-guide-btn--ghost"
              :disabled="!summaryDone"
              @click="exportPortrait"
            >
              <Icon icon="lucide:printer" :width="13"/>
              打印报告
            </button>
            <button
              class="tp-portrait__step-guide-btn tp-portrait__step-guide-btn--ghost"
              @click="goToResumeBuilder"
            >
              <Icon icon="lucide:file-text" :width="13"/>
              制作简历
            </button>
          </div>
        </div>
      </div>

    </div>

  </div>
</template>

<style scoped>
/* ── CSS vars ── */
.tp-page {
  --tp-bg: #F5F5F3;
  --tp-panel: #EDEDEB;
  --tp-border: #E3E3E0;
  --tp-red: #8B2500;
  --tp-gold: #8B6914;
  --tp-text: #111111;
  --tp-sub: #666666;
  --tp-hint: #999999;
  --tp-dark: #151515;
  --tp-dark2: #111111;
}

/* ── Page container ── */
.tp-page {
  position: relative;
  width: 100%;
  height: 100vh;
  max-height: 100vh;
  background: #151515;
  display: flex;
  flex-direction: column;
  font-family: var(--font-title), sans-serif;
  overflow: hidden;
}
.tp-artifact__intro {
  padding: 18px 22px;
  border: 1px solid rgba(212, 201, 181, .22);
  border-radius: 12px;
  background: rgba(212, 201, 181, .06);
}
.tp-artifact__intro h1 { margin: 6px 0; color: #f3eee5; font-size: clamp(21px, 3vw, 30px); }
.tp-artifact__intro p { margin: 0; color: rgba(212, 201, 181, .78); font-size: 12px; line-height: 1.6; }
.tp-artifact__back { border: 1px solid rgba(212, 201, 181, .5); border-radius: 7px; padding: 8px 13px; background: transparent; color: #eee5d6; cursor: pointer; }
.tp-artifact__insights { display: grid; gap: 10px; padding: 16px 20px; border: 1px solid rgba(212, 201, 181, .16); border-radius: 10px; }
.tp-artifact__insights div { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.tp-artifact__insights strong { min-width: 55px; color: rgba(212, 201, 181, .9); font-size: 11px; }
.tp-artifact__insights span { border-radius: 6px; background: rgba(212, 201, 181, .12); padding: 5px 8px; color: #f3eee5; font-size: 11px; }

.tp-page--embedded {
  height: 100%;
  min-height: 0;
  max-height: none;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--tp-bg) 72%, #ffffff 28%),
    color-mix(in srgb, var(--tp-panel) 34%, var(--tp-bg) 66%)
  );
  color: var(--tp-text);
  --tp-embedded-surface: color-mix(in srgb, var(--tp-bg) 22%, #ffffff 78%);
  --tp-embedded-surface-soft: color-mix(in srgb, var(--tp-panel) 52%, #ffffff 48%);
  --tp-embedded-border: color-mix(in srgb, var(--tp-border) 82%, #ffffff 18%);
  --tp-embedded-text: var(--tp-text);
  --tp-embedded-sub: var(--tp-sub);
  --tp-embedded-muted: var(--tp-hint);
  --tp-embedded-blue: var(--color-secondary, #1B4E79);
  --tp-embedded-green: #447755;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.42);
}

/* ═══ HEADER ═══ */
.tp-header {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  height: 48px;
  min-height: 48px;
  background: #0a0a0a;
  border-bottom: 1px solid rgba(212,201,181,0.12);
  flex-shrink: 0;
}
.tp-header__left { display: flex; align-items: center; gap: 14px; }
.tp-header__right {
  display: flex; align-items: center; gap: 8px;
  --uib-icon-color: rgba(168,152,122,0.6);
  --uib-icon-hover: rgba(220,170,130,0.9);
  --uib-avatar-bg: rgba(139,37,0,0.22);
  --uib-avatar-color: rgba(220,140,100,0.9);
  --uib-name-color: rgba(220,220,220,0.85);
  --uib-role-color: rgba(168,152,122,0.7);
}

.tp-back {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px; border: 1px solid rgba(212,201,181,0.22);
  background: transparent; color: rgba(168,152,122,0.88);
  font-size: 12px; font-family: inherit; cursor: pointer;
  transition: all 0.3s ease; letter-spacing: 0.02em;
}
.tp-back:hover { border-color: rgba(139,37,0,0.55); color: rgba(200,120,90,0.9); }

.tp-brand-name { font-size: 13px; font-weight: 600; color: rgba(220,220,220,0.5); letter-spacing: 0.04em; }

.tp-header-tag {
  font-size: 10px; letter-spacing: 0.06em;
  color: rgba(220,170,130,0.9);
  border: 1px solid rgba(139,37,0,0.35);
  background: rgba(139,37,0,0.12);
  padding: 3px 12px;
}


.tp-export-btn {
  display: flex; align-items: center; gap: 5px;
  background: rgba(139,37,0,0.06); border: 1px solid rgba(139,37,0,0.35);
  padding: 4px 10px; cursor: pointer; font-size: 10px; letter-spacing: 0.02em;
  font-family: inherit; color: rgba(210,150,100,0.85);
  transition: all 0.3s ease;
}
.tp-export-btn:hover { background: rgba(139,37,0,0.12); border-color: rgba(139,37,0,0.55); }

/* ── Loading ── */
.tp-loading-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.tp-loading-seal {
  width: 60px; height: 60px;
  border: 2px solid rgba(139,37,0,0.35);
  display: grid; place-items: center;
  background: rgba(139,37,0,0.06);
}
.tp-loading-spin { color: rgba(200,80,40,0.9); animation: tp-spin 1.2s linear infinite; }
@keyframes tp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.tp-loading-msg { font-size: 13px; color: rgba(200,200,200,0.88); letter-spacing: 0.02em; margin: 0; }

.tp-page--embedded .tp-loading-wrap {
  padding: 24px 16px;
}

/* ── Phase Progress Bar ── */
.tp-phase-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 10px 28px;
  background: rgba(10,10,10,0.85);
  border-bottom: 1px solid rgba(212,201,181,0.08);
  flex-shrink: 0;
}

.tp-page--embedded .tp-phase-bar {
  padding: 10px 18px;
}
.tp-phase-step {
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
}
.tp-phase-dot {
  width: 20px; height: 20px;
  border-radius: 50%;
  display: grid; place-items: center;
  font-size: 10px; font-weight: 700;
  border: 1.5px solid rgba(212,201,181,0.18);
  background: rgba(20,20,20,0.9);
  color: rgba(168,152,122,0.5);
  transition: all 0.35s ease;
  flex-shrink: 0;
}
.tp-phase-step--done .tp-phase-dot {
  border-color: rgba(139,105,20,0.6);
  background: rgba(139,105,20,0.18);
  color: rgba(196,170,90,0.95);
}
.tp-phase-step--active .tp-phase-dot {
  border-color: rgba(192,52,24,0.7);
  background: rgba(192,52,24,0.15);
  color: rgba(220,100,60,0.95);
  box-shadow: 0 0 8px rgba(192,52,24,0.3);
}
.tp-phase-num { font-size: 9px; }
.tp-phase-label {
  font-size: 11px; letter-spacing: 0.03em;
  color: rgba(168,152,122,0.45);
  transition: color 0.3s ease;
  white-space: nowrap;
}
.tp-phase-step--done .tp-phase-label { color: rgba(196,170,90,0.8); }
.tp-phase-step--active .tp-phase-label { color: rgba(220,170,130,0.95); font-weight: 600; }
.tp-phase-line {
  display: inline-block;
  width: 28px; height: 1.5px;
  background: rgba(212,201,181,0.12);
  margin: 0 6px;
  transition: background 0.35s ease;
  flex-shrink: 0;
}
.tp-phase-line--done { background: rgba(139,105,20,0.45); }

/* ── Pending score card ── */
.tp-portrait__score-card--pending { opacity: 0.45; }
.tp-portrait__score-val--pending { color: rgba(168,152,122,0.5) !important; }

/* ══════════════════════════════════════════
   Portrait 主容器
══════════════════════════════════════════ */
.tp-portrait {
  flex: 1; min-height: 0;
  overflow-y: auto;
  padding: 20px 22px 20px;
  display: flex; flex-direction: column; gap: 14px;
  background: var(--tp-dark, #151515);
  color: rgba(220,205,185,0.9);
}
.tp-page--embedded .tp-portrait {
  padding: 18px 18px 20px;
}
.tp-portrait::-webkit-scrollbar { width: 3px; }
.tp-portrait::-webkit-scrollbar-track { background: transparent; }
.tp-portrait::-webkit-scrollbar-thumb { background: rgba(192,52,24,0.42); }

.tp-portrait__section-lbl {
  display: block;
  font-size: 9px; font-weight: 600; letter-spacing: 0.06em;
  color: rgba(200,200,200,0.7); text-transform: uppercase;
  margin-bottom: 6px;
}

/* ── [A] 个人信息 + 评分横幅 ── */
.tp-portrait__header {
  display: flex; flex-direction: column; gap: 10px;
  padding: 14px 16px;
  background: rgba(237,229,214,0.05);
  border: 1px solid rgba(212,201,181,0.15);
  border-radius: 8px;
}
.tp-portrait__header-top { display: flex; align-items: center; gap: 12px; }
.tp-portrait__avatar {
  width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg, rgba(192,52,24,0.75), rgba(196,150,30,0.65));
  border: 1.5px solid rgba(192,52,24,0.62);
  display: grid; place-items: center;
  font-size: 18px; font-weight: 600; color: rgba(240,225,200,0.9);
}
.tp-portrait__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.tp-portrait__name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tp-portrait__name { font-size: 16px; font-weight: 600; color: rgba(230,230,230,0.95); letter-spacing: 0.02em; }
.tp-portrait__grade {
  font-size: 10px; padding: 2px 8px; border-radius: 10px;
  background: rgba(196,150,30,0.22); border: 1px solid rgba(196,150,30,0.48);
  color: rgba(238,198,88,0.98); letter-spacing: 0.02em;
}
.tp-portrait__target { font-size: 11px; font-weight: 600; color: rgba(218,78,52,0.97); letter-spacing: 0.02em; }
.tp-portrait__school-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.tp-portrait__school-row span { font-size: 11px; color: rgba(202,188,162,0.92); }
.tp-portrait__meta-icon { color: rgba(165,148,118,0.72); flex-shrink: 0; }
.tp-portrait__sep { color: rgba(128,112,86,0.6) !important; }

/* 评分横幅 */
.tp-portrait__score-banner {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
}
.tp-portrait__score-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 10px 12px; border-radius: 6px; gap: 3px;
}
.tp-portrait__score-card--completeness {
  background: rgba(80,165,90,0.18); border: 1px solid rgba(80,165,90,0.5);
}
.tp-portrait__score-card--competitiveness {
  background: rgba(200,60,38,0.18); border: 1px solid rgba(200,60,38,0.48);
}
.tp-portrait__score-card--honors {
  background: rgba(196,150,30,0.14); border: 1px solid rgba(196,150,30,0.38);
}
.tp-portrait__score-val {
  font-size: 26px; font-weight: 600; line-height: 1; letter-spacing: -0.02em;
}
.tp-portrait__score-card--completeness .tp-portrait__score-val { color: rgb(95,218,128); }
.tp-portrait__score-card--competitiveness .tp-portrait__score-val { color: rgb(240,100,68); }
.tp-portrait__score-val em { font-size: 12px; font-weight: 600; font-style: normal; opacity: 0.7; }
.tp-portrait__score-lbl { font-size: 9px; color: rgba(168,152,122,0.88); letter-spacing: 0.1em; }
.tp-portrait__honor-row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.tp-portrait__honor-item {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; color: rgba(215,200,175,0.97); letter-spacing: 0.04em;
}
.tp-portrait__honor-item strong { color: rgba(245,220,158,1); font-size: 13px; }

/* ── [B+C] 雷达 + 分项评分 ── */
.tp-portrait__viz-row {
  display: grid; grid-template-columns: 1.1fr 1fr; gap: 16px; align-items: stretch;
}
.tp-portrait__radar-wrap {
  background: rgba(237,229,214,0.03);
  border: 1px solid rgba(212,201,181,0.1);
  border-radius: 8px; overflow: visible;
  min-height: 220px; flex-shrink: 0;
}

.tp-portrait__dims { display: flex; flex-direction: column; gap: 8px; justify-content: center; }
.tp-portrait__dim-item { display: flex; flex-direction: column; gap: 2px; }
.tp-portrait__dim-top { display: flex; align-items: center; gap: 5px; }
.tp-portrait__dim-label { font-size: 12px; font-weight: 600; color: rgba(228,212,190,1.0); flex: 1; }
.tp-portrait__dim-badge {
  font-size: 9px; padding: 1px 6px; border-radius: 8px; letter-spacing: 0.02em;
}
.tp-portrait__dim-badge--good { background: rgba(80,165,90,0.22); color: rgb(100,218,138); border: 1px solid rgba(80,165,90,0.48); }
.tp-portrait__dim-badge--mid  { background: rgba(196,150,30,0.18); color: rgb(238,200,85); border: 1px solid rgba(196,150,30,0.48); }
.tp-portrait__dim-badge--low  { background: rgba(200,60,38,0.15); color: rgb(242,108,78); border: 1px solid rgba(200,60,38,0.38); }
.tp-portrait__dim-src {
  display: inline-flex; align-items: center; padding: 2px 5px; cursor: default;
  border: 1px solid rgba(196,185,166,0.25); color: rgba(175,155,110,0.82); border-radius: 3px;
}
.tp-portrait__dim-src--agent { border-color: rgba(145,88,200,0.48); color: rgba(198,158,232,0.95); }
.tp-portrait__dim-bar-wrap {
  display: grid; grid-template-columns: 1fr 28px; align-items: center; gap: 6px;
}
.tp-portrait__dim-track {
  height: 3px; background: rgba(212,201,181,0.22); border-radius: 2px; overflow: hidden;
}
.tp-portrait__dim-bar {
  height: 100%; border-radius: 2px;
  transition: width 0.7s cubic-bezier(0.22,0.61,0.36,1) 0.2s;
}
.tp-portrait__dim-bar--good { background: linear-gradient(90deg, rgba(80,165,90,0.8), rgb(100,218,138)); }
.tp-portrait__dim-bar--mid  { background: linear-gradient(90deg, rgba(196,150,30,0.8), rgb(238,200,85)); }
.tp-portrait__dim-bar--low  { background: linear-gradient(90deg, rgba(200,60,38,0.7), rgb(242,108,78)); }
.tp-portrait__dim-score { font-size: 11px; font-weight: 600; color: rgba(225,225,225,0.95); text-align: right; }
.tp-portrait__dim-desc { font-size: 10px; color: rgba(178,162,132,0.85); line-height: 1.45; margin: 0; }

/* 技能标签内嵌 */
.tp-portrait__tags-inline {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(212,201,181,0.1);
}
.tp-portrait__tags-inline-lbl {
  display: block; font-size: 9px; font-weight: 600; letter-spacing: 0.06em;
  color: rgba(200,200,200,0.7); text-transform: uppercase; margin-bottom: 6px;
}
.tp-portrait__tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tp-portrait__tag {
  padding: 3px 10px; border-radius: 3px; letter-spacing: 0.04em;
  transition: border-color 0.3s ease; cursor: default;
  border: 1px solid;
}
.tp-portrait__tag--fe { color: rgb(235,158,112); background: rgba(200,60,38,0.12); border-color: rgba(200,60,38,0.32); }
.tp-portrait__tag--be { color: rgb(242,205,90); background: rgba(196,150,30,0.12); border-color: rgba(196,150,30,0.35); }
.tp-portrait__tag--qa { color: rgb(135,178,228); background: rgba(74,120,168,0.12); border-color: rgba(74,120,168,0.32); }
.tp-portrait__tag--data { color: rgb(102,205,158); background: rgba(74,168,122,0.12); border-color: rgba(74,168,122,0.32); }
.tp-portrait__tag--gen { color: rgba(215,200,178,0.97); background: rgba(196,185,166,0.1); border-color: rgba(196,185,166,0.28); }

/* ── [D] 经历亮点 ── */
.tp-portrait__highlights {
  padding: 12px 14px;
  background: rgba(237,229,214,0.03);
  border: 1px solid rgba(212,201,181,0.1);
  border-radius: 8px;
  display: flex; flex-direction: column; gap: 8px;
}
.tp-portrait__highlights-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.tp-portrait__highlights-col { display: flex; flex-direction: column; gap: 6px; }
.tp-portrait__honor-card {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 6px; border: 1px solid;
  flex: 1; min-width: 160px;
}
.tp-portrait__honor-card--cert { background: rgba(196,150,30,0.13); border-color: rgba(196,150,30,0.42); }
.tp-portrait__honor-card--intern { background: rgba(74,120,168,0.12); border-color: rgba(74,120,168,0.38); }
.tp-portrait__honor-card--award { background: rgba(200,60,38,0.12); border-color: rgba(200,60,38,0.38); }
.tp-portrait__honor-icon { flex-shrink: 0; opacity: 0.9; }
.tp-portrait__honor-card--cert .tp-portrait__honor-icon { color: rgb(242,202,85); }
.tp-portrait__honor-card--intern .tp-portrait__honor-icon { color: rgb(132,178,228); }
.tp-portrait__honor-card--award .tp-portrait__honor-icon { color: rgb(238,148,108); }
.tp-portrait__honor-lbl { font-size: 11px; color: rgba(215,200,178,0.97); letter-spacing: 0.02em; }
.tp-portrait__project-card {
  display: flex; overflow: hidden;
  background: rgba(240,235,224,0.04);
  border: 1px solid rgba(212,201,181,0.1);
  border-radius: 6px;
  transition: border-color 0.3s ease;
}
.tp-portrait__project-card:hover { border-color: rgba(192,52,24,0.48); }
.tp-portrait__project-accent { width: 3px; flex-shrink: 0; background: rgba(200,60,38,0.8); }
.tp-portrait__project-body { flex: 1; padding: 9px 12px; display: flex; flex-direction: column; gap: 4px; }
.tp-portrait__project-head { display: flex; align-items: center; gap: 8px; }
.tp-portrait__project-name { font-size: 13px; font-weight: 600; color: rgba(240,240,240,0.99); }
.tp-portrait__project-role {
  font-size: 10px; padding: 1px 7px; border-radius: 8px;
  background: rgba(196,150,30,0.16); border: 1px solid rgba(196,150,30,0.42);
  color: rgb(242,205,90);
}
.tp-portrait__project-desc {
  font-size: 11px; color: rgba(195,180,158,0.92); line-height: 1.5; margin: 0;
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

/* ── [E] AI 综合评语 ── */
.tp-portrait__summary {
  padding: 12px 14px;
  background: rgba(139,37,0,0.05);
  border: 1px solid rgba(139,37,0,0.15);
  border-radius: 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.tp-portrait__summary-text {
  font-size: 11px; color: rgba(212,196,172,0.97); line-height: 1.7; margin: 0;
  letter-spacing: 0.02em; cursor: pointer;
}
.tp-typing-cursor {
  display: inline-block; width: 1px; height: 1em;
  background: rgba(200,140,100,0.8); vertical-align: text-bottom; margin-left: 1px;
  animation: tp-blink 0.9s step-end infinite;
}
@keyframes tp-blink { 0%,100% { opacity:1 } 50% { opacity:0 } }
.tp-portrait__summary-divider {
  height: 1px; background: rgba(139,37,0,0.12); margin: 2px 0;
}
.tp-portrait__self-summary {
  font-size: 11px; color: rgba(188,172,150,0.88); line-height: 1.6; margin: 0;
  font-style: italic;
}
.tp-portrait__suggestions {
  display: flex; flex-direction: column; gap: 5px;
  margin-top: 4px;
}
.tp-portrait__suggestion {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 6px 10px; border-radius: 5px; border: 1px solid;
  font-size: 11px; line-height: 1.45;
}
.tp-portrait__suggestion--strength {
  background: rgba(94,159,107,0.07); border-color: rgba(94,159,107,0.22);
}
.tp-portrait__suggestion--improve {
  background: rgba(212,168,85,0.07); border-color: rgba(212,168,85,0.22);
}
.tp-portrait__suggestion-lbl {
  flex-shrink: 0; font-size: 9px; font-weight: 600; letter-spacing: 0.04em;
  padding: 1px 6px; border-radius: 3px; white-space: nowrap; margin-top: 1px;
}
.tp-portrait__suggestion--strength .tp-portrait__suggestion-lbl {
  background: rgba(80,165,90,0.22); color: rgb(100,218,138);
}
.tp-portrait__suggestion--improve .tp-portrait__suggestion-lbl {
  background: rgba(196,150,30,0.22); color: rgb(238,200,85);
}
.tp-portrait__suggestion-text { color: rgba(208,192,168,0.97); }

/* ── [H] 步骤引导 ── */
.tp-portrait__step-guide {
  border: 1px solid rgba(139,37,0,0.2);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(139,37,0,0.06), rgba(139,105,20,0.04));
  padding: 14px 16px;
}
.tp-portrait__step-guide-inner {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
}
.tp-portrait__step-guide-info { display: flex; flex-direction: column; gap: 4px; }
.tp-portrait__step-guide-title {
  font-size: 12px; font-weight: 600; color: rgba(240,240,240,1); letter-spacing: 0.02em;
}
.tp-portrait__step-guide-desc {
  font-size: 10px; color: rgba(182,165,138,0.88); line-height: 1.5; margin: 0; max-width: 380px;
}
.tp-portrait__step-guide-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 6px; font-family: inherit;
  font-size: 11px; font-weight: 600; letter-spacing: 0.02em;
  border: 1px solid rgba(192,58,32,0.7); color: rgba(242,182,142,0.99);
  background: rgba(192,58,32,0.25); cursor: pointer;
  white-space: nowrap; transition: background 0.3s, border-color 0.3s;
}
.tp-portrait__step-guide-btn:hover:not(:disabled) {
  background: rgba(192,58,32,0.42); border-color: rgba(192,58,32,0.9);
}
.tp-portrait__step-guide-btn:disabled {
  opacity: 0.38; cursor: not-allowed;
  border-color: rgba(139,37,0,0.2); color: rgba(160,130,100,0.5);
  background: rgba(139,37,0,0.05);
}
.tp-portrait__step-guide-btn--secondary {
  background: rgba(139,105,20,0.18);
  border-color: rgba(196,150,30,0.5);
  color: rgba(220,185,100,1);
}
.tp-portrait__step-guide-btn--secondary:hover:not(:disabled) {
  background: rgba(139,105,20,0.35);
  border-color: rgba(196,150,30,0.9);
}
.tp-portrait__step-guide-btn--ghost {
  background: transparent;
  border-color: rgba(160,130,100,0.3);
  color: rgba(182,165,138,0.88);
}
.tp-portrait__step-guide-btn--ghost:hover:not(:disabled) {
  background: rgba(255,255,255,0.06);
  border-color: rgba(160,130,100,0.6);
}
.tp-portrait__step-actions {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}

.tp-page--embedded .tp-loading-wrap {
  padding: 32px 20px;
}
.tp-page--embedded .tp-loading-seal {
  width: 68px;
  height: 68px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--tp-red) 24%, var(--tp-embedded-border) 76%);
  background: linear-gradient(
    180deg,
    var(--tp-embedded-surface),
    var(--tp-embedded-surface-soft)
  );
  box-shadow: var(--shadow-sm);
}
.tp-page--embedded .tp-loading-msg {
  color: var(--tp-embedded-sub);
}
.tp-page--embedded .tp-phase-bar {
  padding: 11px 18px;
  background: color-mix(in srgb, var(--tp-panel) 72%, #ffffff 28%);
  border-bottom: 1px solid var(--tp-embedded-border);
}
.tp-page--embedded .tp-phase-dot {
  border-color: color-mix(in srgb, var(--tp-embedded-border) 78%, var(--tp-gold) 22%);
  background: rgba(255,255,255,0.9);
  color: var(--tp-embedded-muted);
}
.tp-page--embedded .tp-phase-step--done .tp-phase-dot {
  border-color: color-mix(in srgb, var(--tp-gold) 46%, var(--tp-embedded-border) 54%);
  background: color-mix(in srgb, var(--tp-gold) 10%, #ffffff 90%);
  color: var(--tp-gold);
}
.tp-page--embedded .tp-phase-step--active .tp-phase-dot {
  border-color: color-mix(in srgb, var(--tp-red) 60%, var(--tp-embedded-border) 40%);
  background: color-mix(in srgb, var(--tp-red) 8%, #ffffff 92%);
  color: var(--tp-red);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tp-red) 12%, transparent 88%);
}
.tp-page--embedded .tp-phase-label {
  color: var(--tp-embedded-muted);
}
.tp-page--embedded .tp-phase-step--done .tp-phase-label {
  color: color-mix(in srgb, var(--tp-gold) 76%, var(--tp-embedded-sub) 24%);
}
.tp-page--embedded .tp-phase-step--active .tp-phase-label {
  color: var(--tp-red);
}
.tp-page--embedded .tp-phase-line {
  background: color-mix(in srgb, var(--tp-embedded-border) 72%, transparent 28%);
}
.tp-page--embedded .tp-phase-line--done {
  background: color-mix(in srgb, var(--tp-gold) 42%, var(--tp-embedded-border) 58%);
}
.tp-page--embedded .tp-portrait {
  padding: 20px 20px 22px;
  gap: 16px;
  background: transparent;
  color: var(--tp-embedded-text);
}
.tp-page--embedded .tp-portrait::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--tp-red) 28%, var(--tp-embedded-border) 72%);
}
.tp-page--embedded .tp-portrait__section-lbl,
.tp-page--embedded .tp-portrait__tags-inline-lbl {
  color: var(--tp-embedded-muted);
}
.tp-page--embedded .tp-portrait__header,
.tp-page--embedded .tp-portrait__radar-wrap,
.tp-page--embedded .tp-portrait__dims,
.tp-page--embedded .tp-portrait__highlights,
.tp-page--embedded .tp-portrait__summary,
.tp-page--embedded .tp-portrait__step-guide {
  border-radius: var(--radius-lg, 14px);
  border: 1px solid var(--tp-embedded-border);
  background: linear-gradient(
    180deg,
    var(--tp-embedded-surface),
    var(--tp-embedded-surface-soft)
  );
  box-shadow: var(--shadow-sm);
}
.tp-page--embedded .tp-portrait__header {
  gap: 12px;
}
.tp-page--embedded .tp-portrait__avatar {
  box-shadow: 0 10px 22px rgba(192,52,24,0.18);
}
.tp-page--embedded .tp-portrait__name,
.tp-page--embedded .tp-portrait__dim-label,
.tp-page--embedded .tp-portrait__dim-score,
.tp-page--embedded .tp-portrait__project-name,
.tp-page--embedded .tp-portrait__step-guide-title {
  color: var(--tp-embedded-text);
}
.tp-page--embedded .tp-portrait__grade {
  background: color-mix(in srgb, var(--tp-gold) 14%, #ffffff 86%);
  border-color: color-mix(in srgb, var(--tp-gold) 32%, var(--tp-embedded-border) 68%);
  color: var(--tp-gold);
}
.tp-page--embedded .tp-portrait__target {
  color: var(--tp-red);
}
.tp-page--embedded .tp-portrait__school-row span,
.tp-page--embedded .tp-portrait__honor-item,
.tp-page--embedded .tp-portrait__dim-desc,
.tp-page--embedded .tp-portrait__summary-text,
.tp-page--embedded .tp-portrait__suggestion-text,
.tp-page--embedded .tp-portrait__self-summary,
.tp-page--embedded .tp-portrait__step-guide-desc,
.tp-page--embedded .tp-portrait__project-desc,
.tp-page--embedded .tp-portrait__honor-lbl {
  color: var(--tp-embedded-sub);
}
.tp-page--embedded .tp-portrait__meta-icon,
.tp-page--embedded .tp-portrait__sep {
  color: var(--tp-embedded-muted) !important;
}
.tp-page--embedded .tp-portrait__score-banner {
  gap: 10px;
}
.tp-page--embedded .tp-portrait__score-card {
  border-radius: 12px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.4);
}
.tp-page--embedded .tp-portrait__score-card--pending {
  opacity: 0.72;
}
.tp-page--embedded .tp-portrait__score-card--completeness {
  background: color-mix(in srgb, var(--tp-embedded-green) 10%, #ffffff 90%);
  border-color: color-mix(in srgb, var(--tp-embedded-green) 30%, var(--tp-embedded-border) 70%);
}
.tp-page--embedded .tp-portrait__score-card--competitiveness {
  background: color-mix(in srgb, var(--tp-red) 10%, #ffffff 90%);
  border-color: color-mix(in srgb, var(--tp-red) 30%, var(--tp-embedded-border) 70%);
}
.tp-page--embedded .tp-portrait__score-card--honors {
  background: color-mix(in srgb, var(--tp-gold) 10%, #ffffff 90%);
  border-color: color-mix(in srgb, var(--tp-gold) 26%, var(--tp-embedded-border) 74%);
}
.tp-page--embedded .tp-portrait__score-card--completeness .tp-portrait__score-val {
  color: var(--tp-embedded-green);
}
.tp-page--embedded .tp-portrait__score-card--competitiveness .tp-portrait__score-val {
  color: var(--tp-red);
}
.tp-page--embedded .tp-portrait__score-val--pending {
  color: color-mix(in srgb, var(--tp-red) 42%, var(--tp-embedded-muted) 58%) !important;
}
.tp-page--embedded .tp-portrait__score-lbl {
  color: var(--tp-embedded-muted);
}
.tp-page--embedded .tp-portrait__honor-item strong {
  color: var(--tp-gold);
}
.tp-page--embedded .tp-portrait__viz-row {
  align-items: stretch;
  gap: 14px;
}
.tp-page--embedded .tp-portrait__radar-wrap {
  min-height: 220px;
}
.tp-page--embedded .tp-portrait__dims {
  padding: 14px 16px;
  gap: 10px;
}
.tp-page--embedded .tp-portrait__dim-item + .tp-portrait__dim-item {
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--tp-embedded-border) 74%, transparent 26%);
}
.tp-page--embedded .tp-portrait__dim-src {
  border-color: color-mix(in srgb, var(--tp-embedded-border) 72%, var(--tp-gold) 28%);
  color: color-mix(in srgb, var(--tp-gold) 74%, var(--tp-embedded-sub) 26%);
  background: rgba(255,255,255,0.8);
}
.tp-page--embedded .tp-portrait__dim-src--agent {
  border-color: color-mix(in srgb, #8a63d2 42%, var(--tp-embedded-border) 58%);
  color: #7c58c2;
}
.tp-page--embedded .tp-portrait__dim-track {
  background: color-mix(in srgb, var(--tp-embedded-border) 78%, #ffffff 22%);
}
.tp-page--embedded .tp-portrait__tags-inline {
  margin-top: 12px;
  padding-top: 12px;
  border-top-color: color-mix(in srgb, var(--tp-embedded-border) 76%, transparent 24%);
}
.tp-page--embedded .tp-portrait__tag--fe {
  color: var(--tp-red);
  background: color-mix(in srgb, var(--tp-red) 7%, #ffffff 93%);
  border-color: color-mix(in srgb, var(--tp-red) 20%, var(--tp-embedded-border) 80%);
}
.tp-page--embedded .tp-portrait__tag--be {
  color: var(--tp-gold);
  background: color-mix(in srgb, var(--tp-gold) 8%, #ffffff 92%);
  border-color: color-mix(in srgb, var(--tp-gold) 20%, var(--tp-embedded-border) 80%);
}
.tp-page--embedded .tp-portrait__tag--qa {
  color: var(--tp-embedded-blue);
  background: color-mix(in srgb, var(--tp-embedded-blue) 8%, #ffffff 92%);
  border-color: color-mix(in srgb, var(--tp-embedded-blue) 18%, var(--tp-embedded-border) 82%);
}
.tp-page--embedded .tp-portrait__tag--data {
  color: var(--tp-embedded-green);
  background: color-mix(in srgb, var(--tp-embedded-green) 8%, #ffffff 92%);
  border-color: color-mix(in srgb, var(--tp-embedded-green) 18%, var(--tp-embedded-border) 82%);
}
.tp-page--embedded .tp-portrait__tag--gen {
  color: var(--tp-embedded-sub);
  background: color-mix(in srgb, var(--tp-panel) 76%, #ffffff 24%);
  border-color: color-mix(in srgb, var(--tp-embedded-border) 76%, transparent 24%);
}
.tp-page--embedded .tp-portrait__honor-card--cert {
  background: color-mix(in srgb, var(--tp-gold) 8%, #ffffff 92%);
  border-color: color-mix(in srgb, var(--tp-gold) 20%, var(--tp-embedded-border) 80%);
}
.tp-page--embedded .tp-portrait__honor-card--intern {
  background: color-mix(in srgb, var(--tp-embedded-blue) 8%, #ffffff 92%);
  border-color: color-mix(in srgb, var(--tp-embedded-blue) 18%, var(--tp-embedded-border) 82%);
}
.tp-page--embedded .tp-portrait__honor-card--award {
  background: color-mix(in srgb, var(--tp-red) 8%, #ffffff 92%);
  border-color: color-mix(in srgb, var(--tp-red) 18%, var(--tp-embedded-border) 82%);
}
.tp-page--embedded .tp-portrait__project-card {
  background: rgba(255,255,255,0.92);
  border-color: color-mix(in srgb, var(--tp-embedded-border) 76%, transparent 24%);
}
.tp-page--embedded .tp-portrait__project-card:hover {
  border-color: color-mix(in srgb, var(--tp-red) 38%, var(--tp-embedded-border) 62%);
}
.tp-page--embedded .tp-portrait__project-role {
  background: color-mix(in srgb, var(--tp-gold) 12%, #ffffff 88%);
  border-color: color-mix(in srgb, var(--tp-gold) 20%, var(--tp-embedded-border) 80%);
  color: var(--tp-gold);
}
.tp-page--embedded .tp-portrait__summary {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--tp-red) 6%, #ffffff 94%),
    color-mix(in srgb, var(--tp-gold) 4%, #ffffff 96%)
  );
  border-color: color-mix(in srgb, var(--tp-red) 18%, var(--tp-embedded-border) 82%);
}
.tp-page--embedded .tp-typing-cursor {
  background: color-mix(in srgb, var(--tp-red) 72%, var(--tp-gold) 28%);
}
.tp-page--embedded .tp-portrait__summary-divider {
  background: color-mix(in srgb, var(--tp-red) 12%, var(--tp-embedded-border) 88%);
}
.tp-page--embedded .tp-portrait__suggestion--strength {
  background: color-mix(in srgb, var(--tp-embedded-green) 7%, #ffffff 93%);
  border-color: color-mix(in srgb, var(--tp-embedded-green) 18%, var(--tp-embedded-border) 82%);
}
.tp-page--embedded .tp-portrait__suggestion--improve {
  background: color-mix(in srgb, var(--tp-gold) 7%, #ffffff 93%);
  border-color: color-mix(in srgb, var(--tp-gold) 18%, var(--tp-embedded-border) 82%);
}
.tp-page--embedded .tp-portrait__suggestion--strength .tp-portrait__suggestion-lbl {
  background: color-mix(in srgb, var(--tp-embedded-green) 14%, #ffffff 86%);
  color: var(--tp-embedded-green);
}
.tp-page--embedded .tp-portrait__suggestion--improve .tp-portrait__suggestion-lbl {
  background: color-mix(in srgb, var(--tp-gold) 14%, #ffffff 86%);
  color: var(--tp-gold);
}
.tp-page--embedded .tp-portrait__step-guide {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--tp-red) 5%, #ffffff 95%),
    color-mix(in srgb, var(--tp-gold) 7%, #ffffff 93%)
  );
  border-color: color-mix(in srgb, var(--tp-red) 16%, var(--tp-embedded-border) 84%);
}
.tp-page--embedded .tp-portrait__step-guide-btn {
  border-color: color-mix(in srgb, var(--tp-red) 22%, transparent 78%);
  color: var(--tp-bg);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--tp-red) 86%, #ffffff 14%),
    var(--tp-red)
  );
  box-shadow: 0 10px 20px rgba(139,37,0,0.14);
}
.tp-page--embedded .tp-portrait__step-guide-btn:hover:not(:disabled) {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--tp-red) 78%, #ffffff 22%),
    color-mix(in srgb, var(--tp-red) 92%, #5c0e00 8%)
  );
  border-color: color-mix(in srgb, var(--tp-red) 40%, transparent 60%);
}
.tp-page--embedded .tp-portrait__step-guide-btn:disabled {
  background: color-mix(in srgb, var(--tp-panel) 78%, #ffffff 22%);
  border-color: color-mix(in srgb, var(--tp-embedded-border) 80%, transparent 20%);
  color: var(--tp-embedded-muted);
}
.tp-page--embedded .tp-portrait__step-guide-btn--secondary {
  background: color-mix(in srgb, var(--tp-gold) 14%, #ffffff 86%);
  border-color: color-mix(in srgb, var(--tp-gold) 22%, var(--tp-embedded-border) 78%);
  color: var(--tp-gold);
  box-shadow: none;
}
.tp-page--embedded .tp-portrait__step-guide-btn--secondary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tp-gold) 22%, #ffffff 78%);
  border-color: color-mix(in srgb, var(--tp-gold) 30%, var(--tp-embedded-border) 70%);
}
.tp-page--embedded .tp-portrait__step-guide-btn--ghost {
  background: rgba(255,255,255,0.72);
  border-color: color-mix(in srgb, var(--tp-embedded-border) 78%, transparent 22%);
  color: var(--tp-embedded-sub);
  box-shadow: none;
}
.tp-page--embedded .tp-portrait__step-guide-btn--ghost:hover:not(:disabled) {
  background: rgba(255,255,255,0.92);
  border-color: color-mix(in srgb, var(--tp-red) 18%, var(--tp-embedded-border) 82%);
}

/* 服务端画像沿用原有画像舞台、花形图与分项条，不把 partial 伪装成完成。 */
.tp-page--embedded .tp-portrait--real {
  align-items: center;
  gap: 18px;
  padding: clamp(22px, 3vw, 46px);
}
.tp-portrait--real > * { width: min(100%, 1120px); flex-shrink: 0; }
.tp-page--embedded .tp-real__intro {
  background: linear-gradient(130deg, #fffdfa, #f6efe4);
  border-color: color-mix(in srgb, var(--tp-gold) 20%, var(--tp-embedded-border) 80%);
  box-shadow: var(--shadow-sm);
}
.tp-real__title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.tp-page--embedded .tp-real__intro h1 { color: var(--tp-embedded-text); font-size: clamp(24px, 3.1vw, 38px); line-height: 1.2; }
.tp-page--embedded .tp-real__intro p { color: var(--tp-embedded-sub); }
.tp-real__agent-link { display: inline-flex; align-items: center; gap: 7px; margin-top: 14px; border: 1px solid var(--tp-red); border-radius: 7px; padding: 9px 13px; background: var(--tp-red); color: #fff; font-size: 12px; font-weight: 650; cursor: pointer; }
.tp-real__agent-link:hover { filter: brightness(.92); }
.tp-real__agent-link:focus-visible { outline: 2px solid var(--tp-red); outline-offset: 3px; }
.tp-real__handoff-note { margin: 8px 0 0 !important; font-size: 11px; }
.tp-real__result-summary { display: grid; gap: 0; margin: 0; padding: 6px 18px; border: 1px solid var(--tp-embedded-border); border-radius: 8px; background: color-mix(in srgb, var(--tp-panel) 8%, white); }
.tp-real__result-summary > div { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 12px; padding: 11px 0; }
.tp-real__result-summary > div + div { border-top: 1px solid var(--tp-embedded-border); }
.tp-real__result-summary dt { color: var(--tp-red); font-size: 11px; font-weight: 700; white-space: nowrap; }
.tp-real__result-summary dd { margin: 0; color: var(--tp-embedded-sub); font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
.tp-real__state {
  padding: 5px 11px;
  border: 1px solid color-mix(in srgb, var(--tp-red) 28%, var(--tp-embedded-border) 72%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--tp-red) 8%, white);
  color: var(--tp-red);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.tp-real__score-pending .tp-portrait__score-val { font-size: 19px; }
.tp-page--embedded .tp-real__flower { height: clamp(300px, 32vw, 360px); min-height: 300px; }
.tp-page--embedded .tp-portrait--real .tp-portrait__dims { padding: 20px 24px; justify-content: center; }
.tp-portrait--real .tp-portrait__dim-item { gap: 7px; }
.tp-real__dim-status { color: var(--tp-embedded-muted); font-size: 10px; }
.tp-real__track-pending { background: repeating-linear-gradient(90deg, #d1cbc1 0 8px, #efebe4 8px 14px) !important; }
.tp-real__evidence { color: var(--tp-embedded-sub); font-size: 10px; line-height: 1.55; }
.tp-real__evidence summary { cursor: pointer; }
.tp-real__evidence ul { margin: 7px 0 0; padding-left: 16px; max-height: 190px; overflow-y: auto; }
.tp-real__evidence li + li { margin-top: 5px; }
.tp-real__legend { margin: -7px 0 0; color: var(--tp-embedded-muted); font-size: 10px; line-height: 1.5; }
.tp-real__highlights { gap: 22px; padding: clamp(20px, 2.6vw, 30px) !important; }
.tp-real__section-heading { display: flex; justify-content: space-between; align-items: end; gap: 18px; border-bottom: 1px solid var(--tp-embedded-border); padding-bottom: 16px; }
.tp-real__section-heading h2 { margin: 6px 0 0; color: var(--tp-embedded-text); font-size: clamp(20px, 2vw, 27px); line-height: 1.25; font-weight: 650; letter-spacing: -.025em; }
.tp-real__source-label { color: var(--tp-embedded-muted); font-size: 11px; line-height: 1.5; text-align: right; }
.tp-real__story-grid { display: grid; grid-template-columns: minmax(0, 1.17fr) minmax(0, .83fr); gap: clamp(18px, 2.5vw, 30px); align-items: start; }
.tp-real__story-column { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.tp-real__column-heading { display: flex; align-items: center; gap: 8px; color: var(--tp-red); margin-bottom: 4px; }
.tp-real__column-heading h3 { color: var(--tp-embedded-text); font-size: 15px; font-weight: 650; margin: 0; }
.tp-real__column-heading > span { margin-left: auto; font-size: 11px; color: var(--tp-embedded-muted); }
.tp-page--embedded .tp-real__project-card { border-color: color-mix(in srgb, var(--tp-gold) 16%, var(--tp-embedded-border) 84%); background: color-mix(in srgb, var(--tp-panel) 14%, white); box-shadow: 0 4px 18px rgba(74, 54, 28, .035); }
.tp-real__project-card .tp-portrait__project-accent { width: 4px; background: linear-gradient(180deg, var(--tp-red), var(--tp-gold)); }
.tp-real__project-card .tp-portrait__project-body { padding: 17px 20px 18px; gap: 9px; min-width: 0; }
.tp-real__project-title { display: flex; align-items: baseline; gap: 11px; min-width: 0; }
.tp-real__project-title h4 { margin: 0; color: var(--tp-embedded-text); font-size: 15px; font-weight: 650; line-height: 1.4; overflow-wrap: anywhere; }
.tp-real__ordinal { color: var(--tp-red); font-family: Georgia, serif; font-size: 18px; font-weight: 600; flex: none; }
.tp-real__project-meta { display: flex; flex-wrap: wrap; gap: 7px; padding-left: 33px; }
.tp-real__project-meta span { color: var(--tp-embedded-sub); background: color-mix(in srgb, var(--tp-gold) 8%, white); border: 1px solid color-mix(in srgb, var(--tp-gold) 14%, var(--tp-embedded-border) 86%); border-radius: 999px; padding: 3px 9px; font-size: 11px; line-height: 1.3; }
.tp-real__project-card .tp-portrait__project-desc { display: block; margin: 0; padding-left: 33px; color: var(--tp-embedded-sub); font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; -webkit-line-clamp: unset; line-clamp: unset; }
.tp-real__award-row { min-height: 55px; padding: 11px 13px; border: 1px solid color-mix(in srgb, var(--tp-gold) 16%, var(--tp-embedded-border) 84%); border-radius: 8px; background: rgba(255,255,255,.8); }
.tp-real__award-content { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.tp-real__award-name { color: var(--tp-embedded-text); font-size: 12px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.tp-real__award-detail { color: var(--tp-embedded-sub); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.tp-real__skill-area { border-top: 1px solid var(--tp-embedded-border); padding-top: 14px; }
.tp-real__skill-area > summary { display: flex; align-items: center; gap: 8px; min-height: 40px; color: var(--tp-embedded-text); cursor: pointer; list-style: none; font-size: 13px; font-weight: 650; }
.tp-real__skill-area > summary::-webkit-details-marker { display: none; }
.tp-real__skill-area > summary > svg:first-child { color: var(--tp-red); flex: none; }
.tp-real__skill-area > summary small { margin-left: auto; color: var(--tp-embedded-muted); font-size: 11px; font-weight: 400; }
.tp-real__skill-chevron { color: var(--tp-red); flex: none; transition: transform .2s ease; }
.tp-real__skill-area[open] .tp-real__skill-chevron { transform: rotate(180deg); }
.tp-real__skill-area > summary:focus-visible { outline: 2px solid var(--tp-red); outline-offset: 3px; border-radius: 4px; }
.tp-real__hint { margin: 8px 0 5px; color: var(--tp-embedded-sub); font-size: 11px; line-height: 1.6; }
.tp-real__skill-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 0 20px; margin: 0; padding: 0; list-style: none; }
.tp-real__skill-list li { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; min-width: 0; padding: 8px 0; border-bottom: 1px solid var(--tp-embedded-border); color: var(--tp-embedded-text); font-size: 12px; line-height: 1.4; }
.tp-real__skill-list li span { min-width: 0; overflow-wrap: anywhere; }
.tp-real__skill-list li small { flex: none; color: var(--tp-embedded-muted); font-size: 10px; }
.tp-real__followup { padding: 18px 20px; }
.tp-real__followup p { margin: 0 0 12px; color: var(--tp-embedded-sub); font-size: 12px; line-height: 1.6; }
.tp-real__fact-list { display: flex; flex-wrap: wrap; gap: 7px; }
.tp-real__fact-list span {
  padding: 6px 9px;
  border: 1px solid color-mix(in srgb, var(--tp-red) 16%, var(--tp-embedded-border) 84%);
  border-radius: 6px;
  background: rgba(255,255,255,.78);
  color: var(--tp-embedded-sub);
  font-size: 11px;
}

/* ══════════════════════════════════════════
   打印 / 导出报告样式
══════════════════════════════════════════ */
@media print {
  @page {
    size: A4 portrait;
    margin: 10mm;
  }

  :global(html),
  :global(body),
  :global(#app) {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    background: #fff !important;
  }

  .tp-header,
  .tp-portrait__step-guide { display: none !important; }
  .tp-page {
    display: block !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    background: #fff !important;
  }
  .tp-portrait {
    flex: none !important;
    height: auto !important;
    min-height: unset !important;
    max-height: none !important;
    background: #fff !important;
    color: #1a1410 !important;
    overflow: visible !important;
    padding: 24px 32px !important;
    gap: 16px !important;
  }
  .tp-portrait__section-lbl { color: #5a4e42 !important; }
  .tp-portrait__header,
  .tp-portrait__viz-row,
  .tp-portrait__highlights,
  .tp-portrait__summary {
    background: #f9f6f0 !important;
    border-color: #d4c9b5 !important;
    color: #1a1410 !important;
  }
  .tp-portrait__score-card { background: #f0ece4 !important; border-color: #c4b9a6 !important; }
  .tp-portrait__score-val { color: #1a1410 !important; }
  .tp-portrait__score-card--completeness .tp-portrait__score-val { color: #3a7a3a !important; }
  .tp-portrait__score-card--competitiveness .tp-portrait__score-val { color: #8b2500 !important; }
  .tp-portrait__name { color: #1a1410 !important; }
  .tp-portrait__dim-label { color: #2a2018 !important; }
  .tp-portrait__dim-track { background: #d4c9b5 !important; }
  .tp-portrait__summary-text { color: #3a3028 !important; }
  .tp-portrait__self-summary { color: #5a4e42 !important; }
  .tp-portrait__honor-lbl { color: #3a3028 !important; }
  .tp-portrait__project-name { color: #1a1410 !important; }
  .tp-portrait__project-desc { color: #5a4e42 !important; -webkit-line-clamp: unset !important; line-clamp: unset !important; }
  .tp-portrait__dim-desc { color: #6a5e52 !important; }
  .tp-typing-cursor { display: none !important; }
  .tp-portrait__header,
  .tp-portrait__viz-row,
  .tp-portrait__project-card {
    break-inside: auto;
    page-break-inside: auto;
  }
}

/* Responsive */
@media (max-width: 1024px) {
  .tp-portrait__viz-row { grid-template-columns: 1.1fr 1fr; gap: 12px; align-items: stretch; }
}
@media (max-width: 768px) {
  .tp-portrait { padding: 14px 14px; }
  .tp-portrait__viz-row { grid-template-columns: 1fr; }
  .tp-portrait__highlights-grid { grid-template-columns: 1fr; }
  .tp-real__story-grid { grid-template-columns: 1fr; }
  .tp-real__section-heading { align-items: start; flex-direction: column; gap: 5px; }
  .tp-real__source-label { text-align: left; }
}
@media (max-width: 600px) {
  .tp-header { padding: 0 14px; }
  .tp-header__left { min-width: 0; gap: 8px; }
  .tp-back { flex: none; min-height: 34px; white-space: nowrap; }
  .tp-brand-name, .tp-header__right { display: none; }
  .tp-header-tag { white-space: nowrap; padding: 4px 8px; }
}
</style>
