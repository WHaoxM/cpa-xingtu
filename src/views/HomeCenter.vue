<!-- 页面：首页；路由：/app/dashboard（dashboard）；角色：STUDENT/ADMIN -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore, useCourseStore } from '@/stores'
import { useLearningStore } from '@/stores/learning'
import { useResumeStore } from '@/stores/resume'
import { useReportStore } from '@/stores/report'
import { useOnboardingState } from '@/composables/useOnboardingState'
import { Icon } from '@iconify/vue'
import { getApiMode } from '@/api/config'
import { getStudent4d, getStudentProfile } from '@/api/profile'
import { getCompletedReportCount } from '@/api/report'
import { ApiError } from '@/api/types'
import StudentDashboardHome from '@/views/student/StudentDashboardHome.vue'

const router = useRouter()
const userStore = useUserStore()
const learningStore = useLearningStore()
const courseStore = useCourseStore()
const resumeStore = useResumeStore()
const reportStore = useReportStore()

const { hasExplored, hasAssessed } = useOnboardingState()
const backendConnected = getApiMode() === 'http'
const backendProfileReady = ref(false)
const backendPortraitReady = ref(false)
const backendReportCount = ref(0)
const backendStatusError = ref(false)

// ── 基础状态 ──
const currentUserId = computed(() => userStore.currentUser?.id ?? '')
const isStudent = computed(() => userStore.isStudent)

const reportCount = computed(() => backendConnected
  ? backendReportCount.value
  : reportStore.portraitRecords.length + reportStore.careerRecords.length)
const isParsedOrReported = computed(() => backendConnected
  ? backendPortraitReady.value
  : resumeStore.isParsed || reportStore.portraitRecords.length > 0)
const explored = computed(() => backendConnected ? false : hasExplored.value)
const assessed = computed(() => backendConnected ? backendPortraitReady.value : hasAssessed.value)

// ── IntersectionObserver（滚动揭示） ──
let _observer: IntersectionObserver | null = null

onMounted(() => {
  if (backendConnected) {
    void loadBackendProgress()
  } else if (!learningStore.learningHistory.length) {
    learningStore.loadFromStorage()
  }
  _observer = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in-view')
        _observer?.unobserve(e.target)
      }
    }),
    { rootMargin: '-40px 0px', threshold: 0.1 },
  )
  document.querySelectorAll('.reveal').forEach(el => _observer!.observe(el))
})

async function loadBackendProgress() {
  const studentId = currentUserId.value
  if (!studentId) return
  const results = await Promise.allSettled([
    getStudentProfile(studentId),
    getStudent4d(studentId),
    getCompletedReportCount(studentId),
  ])
  backendProfileReady.value = results[0]?.status === 'fulfilled' && Boolean(results[0].value.data)
  const portraitFound = results[1]?.status === 'fulfilled' && Boolean(results[1].value.data)
  backendPortraitReady.value = backendProfileReady.value && portraitFound
  backendReportCount.value = results[2]?.status === 'fulfilled' ? results[2].value : 0
  backendStatusError.value = (portraitFound && !backendProfileReady.value) || results.some(result =>
    result.status === 'rejected' && (!(result.reason instanceof ApiError) || result.reason.status !== 404))
}

onUnmounted(() => { _observer?.disconnect() })

// ── 学习历史 ──
const userLearningHistory = computed(() => {
  if (backendConnected) return [] // local demo history is not server evidence
  if (!currentUserId.value) return []
  return learningStore.learningHistory.filter(r => r.userId === currentUserId.value)
})

// ── Hero 精简 KPI ──
const inProgressCourseCount = computed(() => {
  if (backendConnected) return 0
  if (!currentUserId.value) return 0
  const list = courseStore.getUserProgress(currentUserId.value)
  const map = new Map<string, number>()
  for (const row of list) {
    map.set(row.courseId, Math.max(map.get(row.courseId) ?? 0, row.progress ?? 0))
  }
  return [...map.values()].filter(v => v > 0 && v < 100).length
})

// ── 目标岗位 ──
const effectiveRole = computed(() => {
  if (backendConnected) return null // backend role progress needs an owner-scoped read API
  const roles = learningStore.targetRoles
  return roles.length > 0 ? roles[roles.length - 1]!.role : null
})

// ── 当前阶段判断 ──
const currentPhaseIndex = computed(() => {
  if (!explored.value) return 0
  if (!assessed.value) return 1
  if (userLearningHistory.value.length === 0) return 2
  if (!reportCount.value) return 3
  return 4
})

// ── 连续学习天数（从当前用户记录计算，不依赖全量 statistics） ──
const streakDaysLocal = computed(() => {
  const dates = [...new Set(
    userLearningHistory.value.map(r => r.completedAt.split('T')[0])
  )].sort().reverse()
  if (!dates.length) return 0
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  if (dates[0] !== today && dates[0] !== yesterday) return 0
  let streak = 1
  for (let i = 0; i < dates.length - 1; i++) {
    const diff = (new Date(dates[i]!).getTime() - new Date(dates[i + 1]!).getTime()) / 86400000
    if (Math.round(diff) === 1) streak++
    else break
  }
  return streak
})

// ── 学习概览统计 ──
const overviewStats = computed(() => ({
  learnedCourses: new Set(userLearningHistory.value.map(r => r.courseId)).size,
  streakDays: streakDaysLocal.value,
}))
const hasAnyLearningData = computed(() => userLearningHistory.value.length > 0)

// ── 阶段成果摘要 ──
const phaseStats = computed<(string | null)[]>(() => [
  !backendConnected && learningStore.targetRoles.length > 0
    ? `已关注 ${learningStore.targetRoles.length} 个职业方向`
    : null,
  isParsedOrReported.value
    ? backendConnected ? '服务端能力画像已生成'
      : resumeStore.isParsed ? '简历已解析，能力已评估' : '完成技能自评'
    : null,
  userLearningHistory.value.length > 0
    ? `已涉及 ${new Set(userLearningHistory.value.map(r => r.courseId)).size} 门课程`
    : null,
  reportCount.value > 0
    ? `书架已有 ${reportCount.value} 份报告`
    : null,
])

// ── 智能引导卡 ──
const guideCard = computed(() => {
  if (!explored.value) return {
    step: 1, title: '探索你的职业方向',
    desc: '了解行业趋势和岗位需求，选择一个目标职业方向。这是职涯规划的第一步。',
    cta: '开始探索', route: '/app/student/career-analysis', icon: 'lucide:compass',
  }
  if (!assessed.value) return {
    step: 2, title: '评估你的能力现状',
    desc: '上传简历或完成技能自评，AI 将分析你的能力与目标岗位的差距。',
    cta: '开始评估', route: '/app/student/career-navigation', icon: 'lucide:crosshair',
  }
  if (userLearningHistory.value.length === 0) return {
    step: 3, title: '开始你的技能提升',
    desc: '根据能力差距分析，制定学习计划，针对性地提升核心技能。',
    cta: '前往学习', route: '/app/student/learning', icon: 'lucide:trending-up',
  }
  if (!reportCount.value) return {
    step: 4, title: '沉淀你的成长成果',
    desc: '生成职业生涯发展报告，梳理学习成果和能力变化。',
    cta: '生成报告', route: '/app/student/career-report', icon: 'lucide:file-text',
  }
  return {
    step: 0, title: '继续你的学习之旅',
    desc: `你有 ${inProgressCourseCount.value} 门课程正在进行中，持续提升竞争力。`,
    cta: '继续学习', route: '/app/student/learning', icon: 'lucide:rocket',
  }
})

// ── 职业规划链路（纯进度，无子链接） ──
const phasesList = [
  { num: 1, title: '探索市场', subtitle: '了解行业趋势与岗位需求', icon: 'lucide:compass', route: '/app/student/career-analysis' },
  { num: 2, title: '了解自己', subtitle: 'AI 分析你的能力现状', icon: 'lucide:crosshair', route: '/app/student/career-navigation' },
  { num: 3, title: '提升技能', subtitle: '针对差距制定学习计划', icon: 'lucide:trending-up', route: '/app/student/learning' },
  { num: 4, title: '沉淀成果', subtitle: '生成报告，完善职业规划', icon: 'lucide:award', route: '/app/student/career-report' },
] as const

const phasesDone = computed(() => [
  !backendConnected && learningStore.targetRoles.length > 0,
  isParsedOrReported.value,
  userLearningHistory.value.length > 0,
  reportCount.value > 0,
])

// ── 功能介绍卡片 ──
const featureCards = [
  {
    title: '职业分析', icon: 'lucide:target', route: '/app/student/career-analysis',
    desc: '不确定未来方向？查看可用的职业与岗位来源；来源不足时不会把推荐标成已完成。',
  },
  {
    title: '技能自评', icon: 'lucide:check-square', route: '/app/exams',
    desc: '量化你的技能水平。通过结构化评测了解自己与目标岗位的差距，定位优先提升方向。',
  },
  {
    title: '职途导航', icon: 'lucide:route', route: '/app/student/career-navigation',
    desc: '有目标却不知如何规划？职途导航为你制定个性化成长路径，从当前位置走向目标岗位。',
  },
  {
    title: '技能提升', icon: 'lucide:trending-up', route: '/app/student/learning',
    desc: '系统补齐能力短板。根据评估结果精准推荐课程，针对性地提升核心竞争技能。',
  },
  {
    title: '我的报告', icon: 'lucide:file-text', route: '/app/student/my-reports',
    desc: '把成长过程留存下来。生成职业分析报告和能力画像，记录进步轨迹和阶段成果。',
  },
  {
    title: 'AI 助手', icon: 'lucide:bot', route: '/app/student/ai-assistant',
    desc: '遇到困惑随时问。无论职业方向还是技能学习，AI 助手都能给出专业、个性化的建议。',
  },
] as const

// ── 工具函数 ──
function nav(path: string) {
  router.push(path)
}

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const todayDisplay = computed(() => {
  const d = new Date()
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${weekDays[d.getDay()]}`
})
</script>

<template>
  <StudentDashboardHome v-if="isStudent" />
  <div v-else class="hc">
    <!-- 装饰性 SVG 标注圆（spec annotation style） -->
    <svg class="hc-deco-circle" width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <circle cx="28" cy="28" r="26" stroke="currentColor" stroke-width="0.5"/>
      <circle cx="28" cy="28" r="16" stroke="currentColor" stroke-width="0.5" stroke-dasharray="2,4"/>
      <line x1="28" y1="0" x2="28" y2="56" stroke="currentColor" stroke-width="0.3"/>
      <line x1="0" y1="28" x2="56" y2="28" stroke="currentColor" stroke-width="0.3"/>
    </svg>

    <!-- 主内容区（非对称 Takram Grid: left-margin | main | right-panel | right-margin） -->
    <div class="hc-layout">

      <!-- 左侧边距：竖排装饰文字 -->
      <aside class="hc-margin-left" aria-hidden="true">
        <span class="hc-margin-left__seal" />
        <span class="hc-margin-left__text">职导星图 · 职业档案</span>
      </aside>

      <!-- 中央内容 -->
      <main class="hc-main">
    <!-- ═══ 学生视图 ═══ -->
    <template v-if="isStudent">

      <!-- A · Hero — Takram serif style -->
      <section class="hc-hero reveal">
        <div class="hc-hero__label">Career Development Platform</div>
        <div class="hc-hero__row">
          <div class="hc-hero__left">
            <h1 class="hc-hero__greeting">{{ greeting }}，<strong>{{ userStore.currentUser?.name ?? '钟同学' }}</strong></h1>
            <div class="hc-hero__hairline" />
            <p class="hc-hero__tagline">个性化职业发展路径，从探索到成长的完整闭环。</p>
            <div class="hc-hero__date">{{ todayDisplay }}</div>
            <div class="hc-hero__tags">
              <span v-if="effectiveRole" class="hc-tag hc-tag--role">目标：{{ effectiveRole }}</span>
              <button v-else class="hc-tag hc-tag--empty" type="button" @click="nav('/app/student/career-analysis')">
                <Icon icon="lucide:plus" :width="12" /> 设置目标岗位
              </button>
            </div>
          </div>
          <aside class="hc-hero-dash hc-card">
            <div class="hc-hero-dash__label">决策速览</div>
            <div class="hc-hero-dash__stat">
              <span class="hc-hero-dash__num">{{ reportCount }}</span>
              <span class="hc-hero-dash__key">已沉淀报告</span>
            </div>
            <div class="hc-hero-dash__row">
              <span class="hc-hero-dash__row-key">进行中课程</span>
              <span class="hc-hero-dash__row-val">{{ inProgressCourseCount }} 门</span>
            </div>
            <button class="hc-hero-dash__cta" type="button" @click="nav('/app/student/career-navigation')">查看能力差距 →</button>
          </aside>
        </div>
      </section>

      <!-- B · 智能引导（editorial typographic block — 无装饰性icon） -->
      <section class="hc-guide reveal" @click="nav(guideCard.route)">
        <div class="hc-guide__num" v-if="guideCard.step > 0">0{{ guideCard.step }}</div>
        <div class="hc-guide__body">
          <div class="hc-guide__step" v-if="guideCard.step > 0">{{ guideCard.step === 1 ? '探索' : guideCard.step === 2 ? '评估' : guideCard.step === 3 ? '提升' : '沉淀' }}</div>
          <div class="hc-guide__step hc-guide__step--done" v-else>持续</div>
          <h2 class="hc-guide__title">{{ guideCard.title }}</h2>
          <p class="hc-guide__desc">{{ guideCard.desc }}</p>
          <span class="hc-guide__cta">{{ guideCard.cta }} →</span>
        </div>
      </section>

      <!-- C · 学习概览 -->
      <section class="hc-overview hc-card reveal">
        <div class="hc-overview__header">
          <span class="hc-overview__label">学习概览</span>
        </div>
        <template v-if="hasAnyLearningData">
          <div class="hc-overview__grid">
            <div class="hc-overview__stat">
              <span class="hc-overview__num" :class="{ 'is-zero': !overviewStats.learnedCourses }">{{ overviewStats.learnedCourses }}</span>
              <span class="hc-overview__key">学习课程数</span>
            </div>
            <div class="hc-overview__stat">
              <span class="hc-overview__num" :class="{ 'is-zero': !overviewStats.streakDays }">{{ overviewStats.streakDays }}</span>
              <span class="hc-overview__key">连续学习天数</span>
            </div>
          </div>
        </template>
        <div v-else class="hc-overview__empty">
          <span>开始学习后，这里会显示你的成长数据</span>
          <button class="hc-overview__start-btn" type="button" @click.stop="nav('/app/student/learning')">去学习</button>
        </div>
      </section>

      <!-- D · 职业规划路径（纯进度可视化） -->
      <div class="hc-section-label reveal"><span>职业规划路径</span><span class="hc-section-label__line" /></div>
      <section class="hc-pipeline hc-card reveal">
        <p v-if="backendConnected && backendStatusError" role="status">后端进度不一致或暂无法同步，相关步骤未标记为完成；请稍后刷新。</p>
        <p v-else-if="backendConnected && backendProfileReady && !backendPortraitReady" role="status">简历已确认，能力画像仍待生成。</p>
        <div class="hc-pipeline__track">
          <div
            v-for="(phase, i) in phasesList"
            :key="phase.num"
            class="hc-step"
            :class="{
              'is-done': phasesDone[i],
              'is-current': i === currentPhaseIndex && currentPhaseIndex < 4,
              'is-future': i > currentPhaseIndex,
            }"
          >
            <div class="hc-step__circle">
              <Icon v-if="phasesDone[i]" icon="lucide:check" :width="18" />
              <Icon v-else :icon="phase.icon" :width="18" />
            </div>
            <div class="hc-step__info">
              <div class="hc-step__title">{{ phase.title }}</div>
              <div class="hc-step__sub">{{ phase.subtitle }}</div>
              <div v-if="phaseStats[i]" class="hc-step__badge hc-step__badge--done">{{ phaseStats[i] }}</div>
              <button
                v-else-if="i === currentPhaseIndex && currentPhaseIndex < 4"
                class="hc-step__badge hc-step__badge--cta"
                type="button"
                @click="nav(phase.route)"
              >开始这一步 →</button>
            </div>
          </div>
        </div>
      </section>

      <!-- E · 平台功能（clean editorial list — 无装饰性icon） -->
      <div class="hc-section-label reveal"><span>平台功能</span><span class="hc-section-label__line" /></div>
      <div class="hc-features stagger">
        <div
          v-for="card in featureCards" :key="card.route"
          class="hc-feat reveal"
          role="button"
          tabindex="0"
          @click="nav(card.route)"
          @keydown.enter="nav(card.route)"
        >
          <div class="hc-feat__body">
            <div class="hc-feat__title">{{ card.title }}</div>
            <p class="hc-feat__desc">{{ card.desc }}</p>
          </div>
        </div>
      </div>

    </template>

    <!-- Bottom Zen（参考 Takram 底部禅意区域） -->
    <div class="hc-bottom-zen" aria-hidden="true">
      <div class="hc-bottom-zen__line" />
      <span class="hc-bottom-zen__text">Design as inquiry</span>
      <div class="hc-bottom-zen__line" />
    </div>
      </main>

      <!-- 右侧面板（学生信息卡） -->
      <aside class="hc-right-panel" v-if="isStudent">
        <div class="hc-bio-card hc-card">
          <div class="hc-bio-card__avatar">
            <div class="hc-bio-card__avatar-inner">
              <span class="hc-bio-card__initial">{{ (userStore.currentUser?.name ?? '同学').charAt(0) }}</span>
            </div>
            <div class="hc-bio-card__avatar-ring" />
          </div>
          <div class="hc-bio-card__info">
            <div class="hc-bio-card__name">{{ userStore.currentUser?.name ?? '钟同学' }}</div>
            <div class="hc-bio-card__role">{{ effectiveRole ?? '未设定目标' }}</div>
            <div class="hc-bio-card__hairline" />
            <div class="hc-bio-card__desc">
              当前处于职涯规划第 <strong>{{ Math.min(currentPhaseIndex + 1, 4) }}</strong> 阶段，
              {{ currentPhaseIndex >= 4 ? '已完成全部核心步骤' : '继续推进下一阶段任务' }}。
            </div>
          </div>
        </div>
        <div class="hc-quick-card">
          <div class="hc-quick-card__label">快捷入口</div>
          <div class="hc-quick-card__grid">
            <button type="button" @click="nav('/app/student/ai-assistant')">AI 助手</button>
            <button type="button" @click="nav('/app/student/learning')">课程学习</button>
            <button type="button" @click="nav('/app/exams')">技能自评</button>
            <button type="button" @click="nav('/app/student/my-reports')">我的报告</button>
          </div>
        </div>
        <div class="hc-right-year" aria-hidden="true">{{ new Date().getFullYear() }}</div>
      </aside>

      <!-- 右侧边距占位 -->
      <div class="hc-margin-right" aria-hidden="true" />

    </div><!-- /.hc-layout -->
  </div>
</template>

<style scoped>
/* ══ 页面根 — Takram Academy Style（参考 homepage-takram.html showcase） ══ */
.hc {
  --hc-bg: #F5F0EB;
  --hc-ink: #1F1F1B;
  --hc-muted: #6B6B6B;
  --hc-weak: #B8B2A6;
  --hc-line: #E0DCD6;
  --hc-accent: #BE2A00;
  --hc-accent-gold: #C9A227;
  --hc-green: #6B8F71;
  --hc-serif: 'Noto Serif SC', 'LXGW WenKai', 'STSong', serif;
  --hc-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  display: flex; flex-direction: column; gap: 28px;
  padding: 48px 80px 64px; max-width: 1440px; margin: 0 auto;
  background-color: var(--hc-bg);
  color: var(--hc-ink); font-family: var(--hc-sans); font-size: 14px;
  height: 100%; overflow-y: auto; overflow-x: hidden;
  min-height: 100vh; position: relative;
  scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.08) transparent;
}

/* ══ 分区标签 ══ */
.hc-section-label {
  display: flex; align-items: center; gap: 20px;
  font-size: 10px; font-weight: 500; letter-spacing: 0.16em;
  color: var(--hc-accent); text-transform: uppercase; margin-top: 8px; opacity: 0.7;
}
.hc-section-label__line { flex: 1; height: 1px; background: linear-gradient(90deg, var(--hc-accent), rgba(201,162,39,0.3) 40%, rgba(0,0,0,0.04) 80%, transparent); }

/* ══ A · Hero — Takram Academy serif style ══ */
.hc-hero {
  padding: 40px 0 36px; border-bottom: 1px solid rgba(0,0,0,0.04);
}
.hc-hero__label {
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--hc-accent); font-weight: 500; opacity: 0.85; margin-bottom: 28px;
}
.hc-hero__left { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 8px; max-width: 560px; min-width: 0; }

/* Hero 双栏：问候 + 决策速览 */
.hc-hero__row {
  display: flex; justify-content: space-between; align-items: flex-end; gap: 48px;
}
.hc-hero-dash {
  flex: 0 0 260px; padding: 20px 22px;
  border-radius: var(--radius-card);
}
.hc-hero-dash__label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--hc-muted); margin-bottom: 14px; }
.hc-hero-dash__stat { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
.hc-hero-dash__num {
  font-family: var(--hc-serif); font-size: 44px; font-weight: 600; line-height: 1;
  color: var(--hc-ink); font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
}
.hc-hero-dash__key { font-size: 11px; color: var(--hc-weak); }
.hc-hero-dash__row {
  display: flex; align-items: baseline; justify-content: space-between;
  padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.05); margin-bottom: 14px;
}
.hc-hero-dash__row-key { font-size: 11px; color: var(--hc-weak); }
.hc-hero-dash__row-val { font-size: 13px; font-weight: 600; color: var(--hc-ink); font-variant-numeric: tabular-nums; }
.hc-hero-dash__cta {
  width: 100%; height: 34px; border-radius: 999px;
  border: 1px solid rgba(190,42,0,0.22); background: transparent;
  color: var(--hc-accent); font-family: inherit; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: background 0.2s, color 0.2s;
}
.hc-hero-dash__cta:hover { background: var(--hc-accent); color: #fff; }
.hc-hero__greeting {
  font-family: var(--hc-serif); font-weight: 300; font-size: 40px;
  line-height: 1.25; letter-spacing: -0.01em; color: var(--hc-ink); margin: 0;
}
.hc-hero__greeting strong { font-weight: 600; }
.hc-hero__hairline {
  width: 48px; height: 1px; background: var(--hc-line); margin: 24px 0;
}
.hc-hero__date { font-size: 11px; color: var(--hc-weak); letter-spacing: 0.04em; font-weight: 400; }
.hc-hero__tagline {
  font-weight: 300; font-size: 15px; line-height: 1.7;
  color: var(--hc-muted); max-width: 420px; margin: 0;
}
.hc-hero__tags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; align-items: center; }

.hc-stat { display: flex; flex-direction: column; align-items: center; padding: 0 22px; gap: 5px; }
.hc-stat__num {
  font-size: 2.2rem; font-weight: 300; line-height: 1;
  color: var(--hc-accent); font-variant-numeric: tabular-nums; letter-spacing: -0.03em;
}
.hc-stat__lbl { font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--hc-weak); }
.hc-stat-sep { width: 1px; height: 36px; background: linear-gradient(180deg, transparent, var(--hc-line), transparent); flex-shrink: 0; }

/* ══ 标签（Takram minimal） ═══ */
.hc-tag {
  display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 10px;
  border-radius: 4px; font-size: 11px; font-weight: 500;
  background: rgba(0,0,0,0.025); color: var(--hc-muted);
  border: 1px solid rgba(0,0,0,0.06); cursor: default;
}
.hc-tag--role {
  background: rgba(190,42,0,0.05); color: #8B1A00;
  border-color: rgba(190,42,0,0.12);
}
.hc-tag--empty {
  border-style: dashed; cursor: pointer; color: var(--hc-weak); background: transparent;
  transition: border-color 0.2s, color 0.2s;
}
.hc-tag--empty:hover {
  border-color: var(--hc-line); color: var(--hc-ink);
}

/* ══ B · 智能引导（editorial block — 无装饰性icon，typography驱动层次） ══ */
.hc-guide {
  display: flex; align-items: flex-start; gap: 28px; padding: 32px 0;
  cursor: pointer; position: relative;
  border-bottom: 1px solid rgba(0,0,0,0.04);
  transition: opacity 0.2s ease;
}
.hc-guide:hover { opacity: 0.8; }

.hc-guide__num {
  flex-shrink: 0;
  font-family: var(--hc-serif); font-weight: 300; font-size: 56px;
  line-height: 1; color: var(--hc-accent); opacity: 0.15;
  letter-spacing: -0.03em;
}
.hc-guide__body { flex: 1; min-width: 0; }
.hc-guide__step {
  font-size: 10px; font-weight: 500; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--hc-accent);
}
.hc-guide__step--done { color: var(--hc-green); }
.hc-guide__title {
  font-family: var(--hc-serif); font-weight: 600; font-size: 20px;
  color: var(--hc-ink); margin: 6px 0 8px; line-height: 1.3;
  letter-spacing: -0.01em;
}
.hc-guide__desc {
  font-size: 13px; color: var(--hc-muted); margin: 0;
  line-height: 1.7; font-weight: 300; max-width: 480px;
}
.hc-guide__cta {
  display: inline-block; margin-top: 14px;
  font-size: 12px; font-weight: 500; color: var(--hc-accent);
  letter-spacing: 0.02em; cursor: pointer;
}

/* ══ C · 学习概览（Takram minimal） ══ */
.hc-card {
  background: #FFFFFF;
  border: none;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 6px 16px rgba(0,0,0,0.03), 0 16px 40px rgba(0,0,0,0.02);
}
.hc-overview__header { margin-bottom: 14px; }
.hc-overview__label {
  font-size: 10px; font-weight: 500; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--hc-muted);
}
.hc-overview__grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 0;
}
.hc-overview__stat {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 16px 12px; border-right: 1px solid rgba(0,0,0,0.04);
}
.hc-overview__stat:last-child { border-right: none; }
.hc-overview__num {
  font-family: var(--hc-serif); font-weight: 600;
  font-size: clamp(40px, 7vw, 64px);
  line-height: 1; color: var(--hc-ink); font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
}
.hc-overview__num.is-zero { color: var(--hc-weak); }  /* 0 = 尚未发生，不占舞台 */
.hc-overview__key { font-size: 11px; color: var(--hc-weak); letter-spacing: 0.04em; text-align: center; }
.hc-overview__empty {
  display: flex; align-items: center; gap: 12px;
  color: var(--hc-weak); font-size: 13px; font-weight: 300; padding: 8px 0;
}
.hc-overview__start-btn {
  margin-left: auto; height: 30px; padding: 0 16px; border-radius: 999px;
  border: 1px solid rgba(190,42,0,0.2); background: transparent;
  color: var(--hc-accent); font-family: inherit; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: background 0.2s, color 0.2s;
}
.hc-overview__start-btn:hover { background: var(--hc-accent); color: #fff; }

/* ══ D · 职业规划链路（Takram minimal） ══ */
.hc-pipeline {
  border-radius: var(--radius-card); padding: 32px 24px;
}
.hc-pipeline__track {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 0; position: relative;
}
.hc-pipeline__track::before {
  content: ''; position: absolute;
  top: 20px; left: 12.5%; right: 12.5%; height: 1px;
  background: rgba(0,0,0,0.08);
  opacity: 0.5; z-index: 0;
}
.hc-step {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; position: relative; z-index: 1; padding: 0 10px;
}
.hc-step__circle {
  width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  border: 1px solid rgba(0,0,0,0.08); background: rgba(255,255,255,0.85);
  display: flex; align-items: center; justify-content: center;
  color: var(--hc-muted); margin-bottom: 14px;
  transition: border-color 0.2s, color 0.2s, box-shadow 0.2s, background 0.2s;
}
.hc-step.is-done .hc-step__circle {
  border-color: var(--hc-accent);
  background: var(--hc-accent);
  color: #fff; box-shadow: 0 4px 12px rgba(190,42,0,0.15);
}
.hc-step.is-current .hc-step__circle {
  border-color: #E87055; color: var(--hc-accent);
  box-shadow: 0 0 0 4px rgba(190,42,0,0.07);
  animation: pulse-ring 2.4s ease infinite, pulse-glow 2.4s ease infinite;
}
.hc-step.is-future .hc-step__circle { opacity: 0.4; }
@keyframes pulse-ring {
  0%, 100% { box-shadow: 0 0 0 4px rgba(190,42,0,0.07), 0 0 0 8px rgba(190,42,0,0.025); }
  50% { box-shadow: 0 0 0 6px rgba(190,42,0,0.11), 0 0 0 12px rgba(190,42,0,0.04); }
}
@keyframes pulse-glow {
  0%, 100% { border-color: #E87055; }
  50% { border-color: var(--hc-accent); }
}
.hc-step__info { width: 100%; }
.hc-step__title { font-size: 13px; font-weight: 500; color: var(--hc-ink); }
.hc-step.is-done .hc-step__title { color: var(--hc-accent); }
.hc-step.is-future .hc-step__title { color: var(--hc-weak); }
.hc-step__sub { font-size: 11px; color: var(--hc-muted); margin-top: 4px; line-height: 1.4; font-weight: 300; }
.hc-step__badge {
  display: inline-block; margin-top: 10px; font-size: 11px; padding: 3px 10px;
  border-radius: 12px; line-height: 1.5;
}
.hc-step__badge--done {
  color: var(--hc-green);
  background: rgba(107,143,113,0.1);
}
.hc-step__badge--cta {
  color: var(--hc-accent); cursor: pointer; border: none; font-family: inherit;
  background: rgba(190,42,0,0.05);
  transition: background 0.15s, color 0.15s;
}
.hc-step__badge--cta:hover {
  background: var(--hc-accent); color: #fff;
}

/* ══ E · 平台功能（clean editorial list — typography驱动，无装饰性icon） ══ */
.hc-features {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 0;
}
.hc-feat {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(0,0,0,0.04);
  cursor: pointer; position: relative;
  transition: background 0.2s ease;
}
.hc-feat:hover {
  background: rgba(0,0,0,0.02);
}
.hc-feat:focus-visible { outline: 2px solid var(--hc-accent); outline-offset: -2px; }
.hc-feat__body { flex: 1; min-width: 0; }
.hc-feat__title {
  font-size: 14px; font-weight: 500; color: var(--hc-ink);
  margin-bottom: 6px; letter-spacing: -0.01em;
}
.hc-feat__desc {
  font-size: 12px; color: var(--hc-muted);
  line-height: 1.7; margin: 0; font-weight: 300;
}

/* ══ 按钮（Takram minimal — 无 gradient） ══ */
.hc-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 38px; padding: 0 20px; border-radius: 999px;
  border: 1px solid rgba(0,0,0,0.08); background: rgba(255,255,255,0.8);
  color: var(--hc-ink); font-family: inherit; font-size: 13px; font-weight: 500;
  cursor: pointer; white-space: nowrap;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}
.hc-btn:hover { border-color: rgba(190,42,0,0.3); color: var(--hc-accent); }
.hc-btn:active { transform: scale(0.98); }
.hc-btn--primary {
  background: var(--hc-accent);
  border-color: #8B1A00; color: #fff; font-weight: 500;
}
.hc-btn--primary:hover {
  background: #8B1A00; color: #fff;
}

/* ══ 管理员（Takram minimal） ══ */
.hc-admin {
  border-radius: var(--radius-card); padding: 24px 28px;
}
.hc-admin__title { font-family: var(--hc-serif); font-size: 18px; font-weight: 600; color: var(--hc-ink); margin: 0 0 16px; letter-spacing: -0.01em; }
.hc-admin__actions { display: flex; gap: 12px; flex-wrap: wrap; }

/* ══ 滚动揭示动效 ══ */
@media (prefers-reduced-motion: no-preference) {
  .reveal {
    opacity: 0; transform: translate3d(0, 18px, 0) scale(0.995); filter: blur(4px);
    will-change: transform, opacity, filter;
    transition: opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1), filter 0.6s cubic-bezier(0.16,1,0.3,1);
  }
  .hc-hero.reveal { transition-duration: 0.5s; }
  .hc-guide.reveal { transition-duration: 0.55s; transition-delay: 0.05s; }
  .hc-overview.reveal { transition-duration: 0.5s; transition-delay: 0.08s; }
  .hc-section-label.reveal { transition-duration: 0.4s; }
  .hc-pipeline.reveal { transition-duration: 0.55s; }
  .reveal.in-view { opacity: 1; transform: none; filter: none; }
  .stagger > .reveal:nth-child(1) { transition-delay: 0.00s; }
  .stagger > .reveal:nth-child(2) { transition-delay: 0.06s; }
  .stagger > .reveal:nth-child(3) { transition-delay: 0.12s; }
  .stagger > .reveal:nth-child(4) { transition-delay: 0.18s; }
  .stagger > .reveal:nth-child(5) { transition-delay: 0.24s; }
  .stagger > .reveal:nth-child(6) { transition-delay: 0.30s; }
}
@media (prefers-reduced-motion: reduce) {
  .reveal { transition: none; opacity: 1; transform: none; filter: none; }
}

/* ══ 响应式 ══ */
@media (max-width: 768px) {
  .hc { padding: 16px; gap: 14px; }
  .hc-hero { flex-direction: column; align-items: stretch; padding: 20px; }
  .hc-hero__row { flex-direction: column; align-items: stretch; }
  .hc-hero-dash { flex: none; width: 100%; }
  .hc-hero__stats { justify-content: center; }
  .hc-guide { flex-direction: column; align-items: stretch; gap: 16px; }
  .hc-guide__cta { width: 100%; justify-content: center; }
  .hc-overview__grid { grid-template-columns: 1fr; }
  .hc-overview__stat { border-right: none; border-top: 1px solid rgba(0,0,0,0.04); }
  .hc-overview__stat:first-child { border-top: none; }
  .hc-pipeline__track { grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .hc-pipeline__track::before { display: none; }
  .hc-features { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .hc-hero__stats { flex-direction: row; justify-content: space-around; }
  .hc-stat { padding: 8px 12px; }
  .hc-stat__num { font-size: 1.8rem; }
  .hc-stat-sep { display: none; }
  .hc-pipeline__track { grid-template-columns: 1fr; }
}
</style>

<!-- ═══════════════ Takram Academy 新增样式（追加） ═══════════════ -->
<style scoped>
/* 装饰性 SVG 圆 */
.hc-deco-circle {
  position: fixed; top: 120px; right: 280px;
  color: var(--hc-green); opacity: 0.12; z-index: 1; pointer-events: none;
}

/* ASYMMETRIC LAYOUT GRID（参考 Takram: 120px | 1fr | 400px | 120px） */
.hc-layout {
  position: relative; z-index: 2;
  display: grid;
  grid-template-columns: 64px 1fr 300px 32px;
  gap: 0; min-height: 100vh;
  padding: 48px 0 64px;
}

/* LEFT MARGIN — 竖排档案脊 */
.hc-margin-left {
  display: flex; flex-direction: column; align-items: center;
  justify-content: flex-end; padding-bottom: 80px; gap: 14px;
}
.hc-margin-left__seal { width: 8px; height: 8px; background: var(--hc-accent); }
.hc-margin-left__text {
  writing-mode: vertical-rl; font-size: 10px; letter-spacing: 0.18em;
  color: var(--hc-muted); font-weight: 500; font-family: var(--hc-serif);
}

/* MAIN CONTENT */
.hc-main {
  display: flex; flex-direction: column; gap: 32px;
  padding: 0 40px 0 24px;
}

/* RIGHT PANEL + BIO CARD */
.hc-right-panel {
  display: flex; flex-direction: column; align-items: center;
  justify-content: flex-start; padding: 8px 16px 0; gap: 24px;
}
.hc-bio-card {
  border-radius: var(--radius-card); padding: 28px 24px; width: 100%;
}
.hc-bio-card__avatar { position: relative; width: 100px; height: 100px; margin: 0 auto 20px; }
.hc-bio-card__avatar-inner {
  width: 100%; height: 100%; border-radius: 50%;
  background: linear-gradient(135deg, #EAE5DD, #DDD8CF);
  border: 1px solid rgba(200,194,182,0.4);
  display: flex; align-items: center; justify-content: center;
  color: var(--hc-weak);
}
.hc-bio-card__initial {
  font-family: var(--hc-serif); font-size: 38px; font-weight: 600;
  color: var(--hc-ink); letter-spacing: -0.02em;
}
.hc-bio-card__avatar-ring {
  position: absolute; top: -12px; left: -12px;
  width: 124px; height: 124px; border-radius: 50%;
  border: 1px solid rgba(107,143,113,0.18);
}
.hc-bio-card__name {
  font-family: var(--hc-serif); font-weight: 600; font-size: 16px;
  color: var(--hc-ink); text-align: center;
}
.hc-bio-card__role { font-size: 12px; color: var(--hc-weak); text-align: center; margin-top: 4px; font-weight: 300; }
.hc-bio-card__hairline { width: 32px; height: 1px; background: var(--hc-line); margin: 16px auto; }
.hc-bio-card__desc { font-size: 12px; line-height: 1.7; color: var(--hc-muted); font-weight: 300; text-align: center; }
.hc-bio-card__desc strong { font-family: var(--hc-serif); font-weight: 600; color: var(--hc-accent); }

/* 右栏 · 快捷入口 */
.hc-quick-card { width: 100%; }
.hc-quick-card__label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--hc-muted); margin-bottom: 10px; }
.hc-quick-card__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.hc-quick-card__grid button {
  height: 34px; border-radius: 999px;
  border: 1px solid rgba(0,0,0,0.06); background: #FFFFFF;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  color: var(--hc-ink); font-family: inherit; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: border-color 0.2s, color 0.2s, box-shadow 0.2s;
}
.hc-quick-card__grid button:hover { border-color: rgba(190,42,0,0.3); color: var(--hc-accent); box-shadow: 0 2px 6px rgba(0,0,0,0.06); }

.hc-right-year {
  writing-mode: vertical-rl; font-size: 10px; letter-spacing: 0.18em;
  color: var(--hc-line); font-weight: 300;
}

/* BOTTOM ZEN */
.hc-bottom-zen {
  display: flex; align-items: center; gap: 20px;
  justify-content: center; padding-top: 40px; margin-top: 16px;
}
.hc-bottom-zen__line { width: 48px; height: 1px; background: var(--hc-line); }
.hc-bottom-zen__text { font-size: 10px; letter-spacing: 0.14em; color: var(--hc-line); font-weight: 300; text-transform: lowercase; }

/* RESPONSIVE: 非对称布局断点 */
@media (max-width: 1100px) {
  .hc-layout { grid-template-columns: 48px 1fr 260px 24px; }
  .hc-deco-circle { display: none; }
  .hc-right-panel { display: none; }
  .hc-margin-right { display: none; }
}
@media (max-width: 900px) {
  .hc-layout { grid-template-columns: 1fr; padding: 32px 40px 48px; }
  .hc-main { padding: 0; }
  .hc-margin-left { display: none; }
}
</style>
