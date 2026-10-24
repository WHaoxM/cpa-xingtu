<!-- 页面：心仪岗位；路由：student/favorites（student-favorites）；角色：STUDENT -->
<script setup lang="ts">
import { computed, ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '@/stores'
import { useResumeStore } from '@/stores/resume'
import { useUserStore } from '@/stores/user'
import { mockTargetRoleMarkets } from '@/mock/data'
import { deleteSavedJobRecord, getTargetRoleMarketCard, listSavedJobs } from '@/api/favorites'
import { getApiMode } from '@/api/config'
import { openAgentWithResource } from '@/composables/useAgentResourceHandoff'
import { hasServerSavedJobCollection } from '@/composables/agentResourceHandoffContract'
import type { SavedJob, TargetRoleMarket } from '@/types'

// ── 角色专属色（当代杂志调：暖而有质地） ──
const roleColors: Record<string, string> = {
  '前端开发':       '#D4622A',
  '后端开发':       '#3D6B52',
  '测试开发':       '#7A5C8A',
  '数据分析':       '#2E618F',
  '机器学习工程师': '#8A5230',
}
const roleDarkColors: Record<string, string> = {
  '前端开发':       '#B04D1E',
  '后端开发':       '#2C5040',
  '测试开发':       '#5E4470',
  '数据分析':       '#1E4A72',
  '机器学习工程师': '#6B3C1E',
}

// ── 排序 ──
type SortMode =
  | 'matchScore_desc' | 'matchScore_asc'
  | 'medianSalary_desc' | 'medianSalary_asc'
  | 'savedAt_desc' | 'savedAt_asc'

// ── 技能展开（reactive Set，避免 ref(new Set()) 响应式失效） ──
const expandedSkills = reactive<Set<string>>(new Set())
function toggleSkills(role: string) {
  if (expandedSkills.has(role)) expandedSkills.delete(role)
  else expandedSkills.add(role)
}

type MatchState = 'unscored' | 'low' | 'scored'
const MATCH_THRESHOLD = 35

type FollowedRoleMarket = TargetRoleMarket & {
  sourceRole: string
  savedAt: string
  matchScore: number
  matchState: MatchState
}

const router = useRouter()
const learningStore = useLearningStore()
const resumeStore = useResumeStore()
const userStore = useUserStore()
const hasServerSavedJobs = ref(false)
const isHttpMode = computed(() => getApiMode() === 'http')
const httpFavoriteJobs = ref<SavedJob[]>([])
const httpFavoriteLoading = ref(false)
const httpFavoriteError = ref('')
const removingSavedJobId = ref<string | null>(null)

async function loadHttpFavoriteJobs() {
  httpFavoriteLoading.value = true
  httpFavoriteError.value = ''
  try {
    httpFavoriteJobs.value = await listSavedJobs('')
  } catch (error) {
    httpFavoriteJobs.value = []
    httpFavoriteError.value = error instanceof Error
      ? `暂时无法读取已收藏岗位：${error.message}`
      : '暂时无法读取已收藏岗位，请确认已登录后重试。'
  } finally {
    httpFavoriteLoading.value = false
  }
}

function publicationStatusLabel(status?: string): string {
  switch (status) {
    case 'current': return '当前发布版本'
    case 'revoked': return '已撤回 · 历史资料'
    case 'superseded': return '已有新版本 · 历史资料'
    case 'unavailable': return '来源暂时无法核对'
    case 'legacy_unverified': return '个人保存 · 来源未核实'
    default: return '来源暂时无法核对'
  }
}

function savedDateLabel(value?: string): string {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
    : '收藏日期未提供'
}

function snapshotSkillNames(job: SavedJob): string[] {
  const raw = job.publicationSnapshot?.required_skills
  if (!Array.isArray(raw)) return []
  return raw.map(item => typeof item === 'string'
    ? item
    : typeof item === 'object' && item !== null && 'name' in item
      ? String((item as { name: unknown }).name)
      : '').filter(Boolean)
}

function safeSavedSourceUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}

async function removeHttpFavorite(job: SavedJob) {
  if (!job.savedJobId || removingSavedJobId.value) return
  removingSavedJobId.value = job.savedJobId
  try {
    await deleteSavedJobRecord(job.savedJobId)
    await loadHttpFavoriteJobs()
    ElMessage.success('已从心仪岗位移除')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '移除失败，请稍后重试')
  } finally {
    removingSavedJobId.value = null
  }
}

function askAgentAboutSavedJobs() {
  if (!hasServerSavedJobs.value) return
  // A saved job is user-submitted context, not a verified recommendation.
  openAgentWithResource(router, { kind: 'career_resource', uri: 'career://me/saved-jobs' })
}

function normalizeRole(role: string): TargetRoleMarket['role'] {
  const text = role.toLowerCase()
  if (role === '机器学习工程师' || /机器学习|深度学习|算法|pytorch|tensorflow|ml/.test(text)) return '机器学习工程师'
  if (role === '数据分析' || /数据|分析|sql|bi|etl|python|增长/.test(text)) return '数据分析'
  if (role === '测试开发' || /测试|qa|playwright|selenium|自动化/.test(text)) return '测试开发'
  if (role === '后端开发' || /java|go|golang|c\+\+|后端|服务端|微服务|redis|mysql/.test(text)) return '后端开发'
  return '前端开发'
}

const marketCache = reactive<Record<string, TargetRoleMarket>>({})

function localMarketFallback(role: string): TargetRoleMarket {
  return mockTargetRoleMarkets.find(item => item.role === normalizeRole(role)) ?? mockTargetRoleMarkets[0]!
}

function getRoleMarket(role: string): TargetRoleMarket {
  const key = normalizeRole(role)
  return marketCache[key] ?? localMarketFallback(role)
}

async function hydrateRoleMarkets() {
  const roles = [...new Set(learningStore.targetRoles.map(r => normalizeRole(r.role)))]
  await Promise.all(
    roles.map(async role => {
      try {
        const card = await getTargetRoleMarketCard(role, localMarketFallback(role))
        if (card) marketCache[role] = card
      } catch (e) {
        console.warn('[favorites] market hydrate failed', role, e)
        marketCache[role] = localMarketFallback(role)
      }
    }),
  )
}

/* 匹配度状态：基于职途导航产出的 matchedCareers */
function getMatchState(normalizedRole: string): { state: MatchState; score: number } {
  if (!resumeStore.isParsed || !resumeStore.matchedCareers.length) {
    return { state: 'unscored', score: 0 }
  }
  const candidate = resumeStore.matchedCareers.find(c => c.role === normalizedRole)
  const score = candidate ? Math.round(candidate.score * 100) : 0
  if (score < MATCH_THRESHOLD) {
    return { state: 'low', score }
  }
  return { state: 'scored', score }
}

function goToNavigation(role: string) {
  resumeStore.setEvaluatingRole(role)
  router.push({ name: 'student-career-navigation' })
}

// 心仪岗位列表由 learningStore 持有；进入页时从 fixtures/API 刷新
const savedJobs = computed(() => learningStore.savedJobs)

const sortMode = ref<SortMode>('matchScore_desc')
const sortModeOptions: Array<{ label: string; value: SortMode }> = [
  { label: '匹配度 高→低', value: 'matchScore_desc' },
  { label: '匹配度 低→高', value: 'matchScore_asc' },
  { label: '薪资 高→低',   value: 'medianSalary_desc' },
  { label: '薪资 低→高',   value: 'medianSalary_asc' },
  { label: '最新关注',     value: 'savedAt_desc' },
  { label: '最早关注',     value: 'savedAt_asc' },
]

const filteredDirections = computed<FollowedRoleMarket[]>(() => {
  const merged = new Map<string, FollowedRoleMarket>()

  learningStore.targetRoles.forEach(item => {
    const market = getRoleMarket(item.role)
    const ms = getMatchState(market.role)
    const nextItem: FollowedRoleMarket = {
      ...market,
      sourceRole: item.role,
      savedAt: item.savedAt,
      matchScore: ms.score,
      matchState: ms.state,
    }
    const existing = merged.get(market.role)
    if (!existing || existing.savedAt < nextItem.savedAt) {
      merged.set(market.role, nextItem)
    }
  })

  return [...merged.values()].sort((a, b) => {
    switch (sortMode.value) {
      case 'matchScore_asc':    return a.matchScore - b.matchScore
      case 'matchScore_desc':   return b.matchScore - a.matchScore
      case 'medianSalary_asc':  return a.medianSalary - b.medianSalary
      case 'medianSalary_desc': return b.medianSalary - a.medianSalary
      case 'savedAt_asc':       return a.savedAt.localeCompare(b.savedAt)
      case 'savedAt_desc':      return b.savedAt.localeCompare(a.savedAt)
      default:                  return b.matchScore - a.matchScore
    }
  })
})

const followedCount = computed(() => {
  const uniqueRoles = new Set(learningStore.targetRoles.map(item => normalizeRole(item.role)))
  return uniqueRoles.size
})

function removeJob(role: string) {
  const matched = learningStore.targetRoles.find(item => normalizeRole(item.role) === role)
  if (!matched) return
  learningStore.toggleTargetRole(matched.role)
  ElMessage.success('已取消关注该方向')
}

function goToMatch() {
  router.push('/app/student/career-navigation')
}

function goToCareerAnalysis() {
  router.push('/app/student/career-analysis')
}

function goToJobCatalog() {
  router.push({ name: 'student-job-catalog' })
}

function goBack() {
  router.back()
}

/* 需求标签只取逗号前第一段，防止长句撑破 badge */
function shortDemand(level: string): string {
  const cut = level.match(/^[^，,。]+/)
  return cut ? cut[0] : level
}

/* ── Hero 统计数据 ── */
const heroStats = computed(() => {
  if (isHttpMode.value) return null
  const dirs = filteredDirections.value
  if (!dirs.length) return null
  const scored = dirs.filter(d => d.matchState === 'scored')
  const avgMatch = scored.length
    ? Math.round(scored.reduce((s, d) => s + d.matchScore, 0) / scored.length)
    : 0
  const bestSalary = Math.max(...dirs.map(d => d.medianSalary))
  return { count: dirs.length, scoredCount: scored.length, avgMatch, bestSalary }
})

/* ── 数字滚动动画 ── */
const displayScores = ref<Record<string, number>>({})

/* ── 进度条宽度（改动 3） ── */
const progressWidths = ref<Record<string, number>>({})

function animateCountUp(role: string, target: number) {
  const start = performance.now()
  const duration = 900
  const update = (now: number) => {
    const t = Math.min((now - start) / duration, 1)
    const eased = 1 - Math.pow(1 - t, 3)
    const val = Math.round(eased * target)
    displayScores.value[role] = val
    progressWidths.value[role] = val
    if (t < 1) requestAnimationFrame(update)
  }
  displayScores.value[role] = 0
  progressWidths.value[role] = 0
  requestAnimationFrame(update)
}

function triggerDataAnimations() {
  filteredDirections.value.forEach((job, i) => {
    if (job.matchState === 'scored') {
      setTimeout(() => animateCountUp(job.role, job.matchScore), i * 120)
    }
  })
}

function topSkills(skills: string[]) { return skills.slice(0, 3) }
function extraCount(skills: string[]) { return Math.max(0, skills.length - 3) }

function demandClass(level: string) {
  if (/极高|旺盛/.test(level)) return 'demand--high'
  if (/较高|稳定/.test(level)) return 'demand--mid'
  return 'demand--low'
}

let cardObserver: IntersectionObserver | null = null

onMounted(async () => {
  await learningStore.loadFavoritesFromApi()
  if (isHttpMode.value) {
    await loadHttpFavoriteJobs()
    hasServerSavedJobs.value = !httpFavoriteError.value && httpFavoriteJobs.value.length > 0
    return
  }
  const uid = userStore.currentUser?.id
  if (getApiMode() === 'http' && uid) {
    try {
      const rows = await listSavedJobs(uid)
      hasServerSavedJobs.value = hasServerSavedJobCollection(getApiMode(), rows)
    } catch {
      hasServerSavedJobs.value = false
    }
  }
  await hydrateRoleMarkets()

  /* 初始化显示值为 0 */
  filteredDirections.value.forEach(job => {
    displayScores.value[job.role] = 0
    progressWidths.value[job.role] = 0
  })

  await nextTick()

  /* 卡片进场 IntersectionObserver */
  cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        cardObserver?.unobserve(entry.target)
      }
    })
  }, { threshold: 0.08 })

  const cards = document.querySelectorAll('.job-card')
  setCardStagger(cards)
  cards.forEach(el => cardObserver?.observe(el))

  /* 100ms 后启动数据动画，确保卡片已开始进场 */
  setTimeout(triggerDataAnimations, 100)
})

onUnmounted(() => {
  cardObserver?.disconnect()
})

/* 设置卡片进场交错延迟，通过 CSS 自定义属性传递给子面板 */
function setCardStagger(cards: NodeListOf<Element>) {
  cards.forEach((el, i) => {
    ;(el as HTMLElement).style.setProperty('--stagger', `${i * 80}ms`)
    const leftPanel = el.querySelector('.card-panel-left')
    if (leftPanel) {
      leftPanel.addEventListener('transitionend', () => {
        ;(el as HTMLElement).style.removeProperty('--stagger')
      }, { once: true })
    }
  })
}
</script>



<template>
  <div class="favorites-page">
    <!-- ── Hero 页头区 ── -->
    <div class="page-hero">
      <div class="hero-inner">
        <div class="hero-left">
          <button class="hero-back-btn" @click="goBack">
            <Icon icon="mdi:arrow-left" />返回
          </button>
          <div class="hero-title">
            <span class="hero-icon">♥</span>
            <h1>心仪岗位</h1>
          </div>
          <div v-if="heroStats" class="hero-stats">
            <span class="stat-item">
              <strong>{{ heroStats.count }}</strong> 个方向
            </span>
            <template v-if="heroStats.scoredCount > 0">
              <span class="stat-sep">·</span>
              <span class="stat-item">
                <strong>{{ heroStats.scoredCount }}</strong> 个已评估
              </span>
              <span class="stat-sep">·</span>
              <span class="stat-item">
                均匹配 <strong>{{ heroStats.avgMatch }}%</strong>
              </span>
            </template>
            <template v-else>
              <span class="stat-sep">·</span>
              <span class="stat-item">完成职途导航后查看匹配度</span>
            </template>
            <span class="stat-sep">·</span>
            <span class="stat-item">
              最高薪资 <strong>{{ heroStats.bestSalary }}K</strong>
            </span>
          </div>
          <div v-else class="hero-subtitle">{{ isHttpMode ? '这里会保留你收藏的具体岗位版本；招聘状态仍需另行确认。' : '在职业分析中关注方向，同步展示薪资与匹配度' }}</div>
        </div>
        <div class="hero-actions">
          <el-button v-if="!isHttpMode && hasServerSavedJobs" class="hero-btn-outline" title="仅分享服务端收藏记录，不代表岗位已经核实或获得推荐" @click="askAgentAboutSavedJobs">与 Agent 讨论已收藏岗位</el-button>
          <el-button v-if="!isHttpMode" class="hero-btn-outline" @click="goToCareerAnalysis">去关注方向</el-button>
          <el-button v-if="!isHttpMode" class="hero-btn-solid" @click="goToMatch">进入职途导航</el-button>
          <el-button v-else class="hero-btn-solid" @click="goToJobCatalog">浏览岗位目录</el-button>
        </div>
      </div>
    </div>

    <!-- ── 内容区 ── -->
    <div v-if="isHttpMode" class="favorites-content">
      <section class="specific-favorites" aria-labelledby="specific-favorites-title">
        <header class="specific-favorites__head">
          <div>
            <span class="specific-favorites__eyebrow">具体岗位</span>
            <h2 id="specific-favorites-title">你保存过的岗位资料</h2>
            <p>每条收藏都对应当时看到的平台发布版本。收藏不代表岗位仍在招聘；招聘状态未确认。</p>
          </div>
          <el-button type="primary" plain @click="goToJobCatalog">继续浏览岗位</el-button>
        </header>

        <div v-if="httpFavoriteError" class="specific-favorites__state" role="alert">
          <Icon icon="lucide:cloud-off" /><p>{{ httpFavoriteError }}</p>
          <el-button @click="loadHttpFavoriteJobs">重新读取</el-button>
        </div>
        <div v-else-if="httpFavoriteLoading" class="specific-favorites__state" aria-live="polite">正在读取你的收藏…</div>
        <div v-else-if="!httpFavoriteJobs.length" class="specific-favorites__state">
          <Icon icon="lucide:bookmark" /><strong>还没有收藏具体岗位</strong>
          <p>在岗位目录打开一份管理员审核发布的资料后，可以把它保存到这里。</p>
          <el-button type="primary" @click="goToJobCatalog">去岗位目录看看</el-button>
        </div>
        <div v-else class="specific-favorites__list">
          <article v-for="job in httpFavoriteJobs" :key="job.savedJobId ?? job.id" class="specific-favorite-card">
            <div class="specific-favorite-card__top">
              <span class="specific-favorite-card__status" :class="`status--${job.publicationStatus ?? 'unavailable'}`">
                {{ publicationStatusLabel(job.publicationStatus) }}
              </span>
              <time>{{ savedDateLabel(job.savedAt) }}</time>
            </div>
            <h3>{{ job.publicationStatus === 'unavailable' ? '岗位资料暂时无法核对' : job.jobTitle || '岗位名称未提供' }}</h3>
            <p v-if="job.publicationStatus === 'legacy_unverified'" class="specific-favorite-card__boundary">
              这是此前个人保存的信息，平台没有确认它关联到哪份发布版本；不展示薪资或匹配结论。
            </p>
            <template v-else-if="job.publicationStatus !== 'unavailable' && job.publicationSnapshot">
              <div v-if="snapshotSkillNames(job).length" class="specific-favorite-card__skills">
                <span v-for="skill in snapshotSkillNames(job)" :key="skill">{{ skill }}</span>
              </div>
              <details v-if="typeof job.publicationSnapshot.source_text === 'string' || safeSavedSourceUrl(job.publicationSnapshot.source_uri)" class="specific-favorite-card__source">
                <summary>查看当时保存的资料</summary>
                <p v-if="typeof job.publicationSnapshot.source_text === 'string'">{{ job.publicationSnapshot.source_text }}</p>
                <a v-if="safeSavedSourceUrl(job.publicationSnapshot.source_uri)" :href="safeSavedSourceUrl(job.publicationSnapshot.source_uri)" target="_blank" rel="noopener noreferrer">打开登记的来源地址</a>
              </details>
              <p class="specific-favorite-card__boundary">管理员审核发布 · 招聘状态未确认<span v-if="job.publicationVersion"> · 资料版本 {{ job.publicationVersion }}</span></p>
            </template>
            <div class="specific-favorite-card__actions">
              <el-button v-if="job.publicationStatus === 'current'" size="small"
                @click="router.push({ name: 'student-job-catalog', query: { job_id: job.jobPortraitId, version: String(job.publicationVersion) } })">查看这份岗位资料</el-button>
              <span v-else-if="job.publicationStatus !== 'legacy_unverified'">历史内容可回看，当前目录是否仍有该岗位需重新确认。</span>
              <el-popconfirm title="确定从心仪岗位移除这条记录？" confirm-button-text="移除" cancel-button-text="保留" @confirm="removeHttpFavorite(job)">
                <template #reference><el-button text type="danger" size="small" :loading="removingSavedJobId === job.savedJobId">移除收藏</el-button></template>
              </el-popconfirm>
            </div>
          </article>
        </div>
      </section>

      <section v-if="learningStore.targetRoles.length" class="followed-roles" aria-labelledby="followed-roles-title">
        <div><span class="specific-favorites__eyebrow">职业方向</span><h2 id="followed-roles-title">你关注的职业方向</h2>
          <p>这是关注方向，不是具体岗位收藏。当前没有已核实的市场薪资、需求量或匹配结论。</p></div>
        <ul><li v-for="item in learningStore.targetRoles" :key="item.role"><strong>{{ item.role }}</strong><time>{{ item.savedAt }}</time></li></ul>
        <el-button text @click="goToCareerAnalysis">管理关注方向</el-button>
      </section>
    </div>

    <div v-else class="favorites-content">

      <!-- ── 工具栏 ── -->
      <div v-if="followedCount > 0" class="toolbar">
        <span class="toolbar__count">共 {{ filteredDirections.length }} 个方向</span>
        <el-select v-model="sortMode" size="small" style="width: 180px">
          <el-option v-for="item in sortModeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </div>

      <!-- ── 卡片列表 ── -->
      <div v-if="filteredDirections.length > 0" class="jobs-list">
        <div
          v-for="job in filteredDirections"
          :key="job.role"
          class="job-card"
          :style="{ '--panel-color': roleColors[job.role] ?? '#555' }"
        >
          <!-- 左侧色块 -->
          <div
            class="card-panel-left"
            :class="{ 'card-panel-left--muted': job.matchState !== 'scored' }"
            :style="{ background: job.matchState === 'scored'
              ? `linear-gradient(175deg, ${roleColors[job.role] ?? '#555'} 0%, ${roleDarkColors[job.role] ?? '#333'} 100%)`
              : `linear-gradient(175deg, ${roleColors[job.role] ?? '#555'}99 0%, ${roleDarkColors[job.role] ?? '#333'}99 100%)` }"
          >
            <div class="panel-role-name">{{ job.role }}</div>

            <!-- 态 C：正常 —— 环形匹配度 -->
            <div
              v-if="job.matchState === 'scored'"
              class="score-ring"
              title="职途导航评估"
              :style="{ '--score-pct': progressWidths[job.role] ?? 0, '--ring-fill': 'rgba(255,255,255,0.9)' }"
            >
              <div class="score-ring-inner">
                <span class="score-num">{{ displayScores[job.role] ?? 0 }}</span>
                <span class="score-pct-sign">%</span>
              </div>
            </div>

            <!-- 态 A：未评估 -->
            <div v-else-if="job.matchState === 'unscored'" class="score-unscored">
              <span class="score-unscored-num">--</span>
              <span class="score-unscored-label">尚未评估</span>
            </div>

            <!-- 态 B：偏低 -->
            <div v-else class="score-low">
              <Icon icon="mdi:trending-down" class="score-low-icon" />
              <span class="score-low-label">匹配度偏低</span>
            </div>

            <div class="panel-saved-at">{{ job.savedAt }}</div>
          </div>

          <!-- 右侧内容 -->
          <div class="card-panel-right">
            <!-- 第一区：薪资 + 需求标签 + 热门城市 -->
            <div class="right-header">
              <div class="salary-block">
                <span class="salary-main" :style="{ color: roleColors[job.role] ?? 'var(--color-primary)' }">{{ job.salaryRange }}</span>
                <small class="salary-median">中位 {{ job.medianSalary }}K</small>
              </div>
              <span class="demand-badge" :class="demandClass(job.demandLevel)">
                <span class="demand-dot"></span>{{ shortDemand(job.demandLevel) }}
              </span>
              <div class="city-chips">
                <span v-for="city in job.hotCities.slice(0, 3)" :key="city" class="city-chip">{{ city }}</span>
                <span v-if="job.hotCities.length > 3" class="city-chip city-chip--extra">+{{ job.hotCities.length - 3 }}</span>
              </div>
            </div>

            <!-- 第二区：技能标签（可展开） -->
            <div class="right-skills">
              <template v-if="expandedSkills.has(job.role)">
                <el-tag
                  v-for="skill in job.skillTags"
                  :key="skill"
                  size="small"
                  effect="plain"
                  class="skill-tag"
                  :style="{ '--tag-color': roleColors[job.role] ?? '#888' }"
                >{{ skill }}</el-tag>
                <el-button text size="small" class="skill-toggle-btn" @click="toggleSkills(job.role)">收起</el-button>
              </template>
              <template v-else>
                <el-tag
                  v-for="skill in job.skillTags.slice(0, 4)"
                  :key="skill"
                  size="small"
                  effect="plain"
                  class="skill-tag"
                  :style="{ '--tag-color': roleColors[job.role] ?? '#888' }"
                >{{ skill }}</el-tag>
                <el-button
                  v-if="job.skillTags.length > 4"
                  text size="small"
                  class="skill-toggle-btn"
                  @click="toggleSkills(job.role)"
                >展开 +{{ job.skillTags.length - 4 }}</el-button>
              </template>
            </div>

            <!-- 第三区：趋势说明（完整显示，不截断） -->
            <div class="right-note" :style="{ borderLeftColor: roleColors[job.role] ?? 'var(--color-gold)' }">
              <Icon icon="mdi:text-box-outline" class="note-icon" />
              <span>{{ job.trendNote }}</span>
            </div>

            <!-- 第四区：引导 + 操作按钮 -->
            <div class="right-footer">
              <div v-if="job.matchState === 'unscored'" class="guide-hint">
                <Icon icon="mdi:information-outline" class="guide-hint-icon" />
                <span>完成职途导航后，这里会显示你和该方向的匹配程度</span>
              </div>
              <div v-else-if="job.matchState === 'low'" class="guide-hint guide-hint--low">
                <Icon icon="mdi:lightbulb-outline" class="guide-hint-icon" />
                <span>该方向与你目前的能力画像匹配度较低，可以先关注技能提升</span>
              </div>
              <div class="right-footer-actions">
                <el-button
                  v-if="job.matchState === 'unscored'"
                  type="primary"
                  size="small"
                  @click="goToNavigation(job.role)"
                >去评估</el-button>
                <el-button v-else text size="small" @click="goToNavigation(job.role)">重新评估</el-button>
                <el-popconfirm
                  title="确定取消关注该方向？"
                  confirm-button-text="确定"
                  cancel-button-text="取消"
                  @confirm="removeJob(job.role)"
                >
                  <template #reference>
                    <el-button text type="danger" size="small">取消关注</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态（筛选后无结果，理论上排序不会触发此分支） -->
      <div v-else-if="followedCount > 0" class="empty-box">
        <Icon icon="mdi:filter-off-outline" class="empty-icon" />
        <div class="empty-title">当前排序条件下暂无结果</div>
        <div class="empty-desc">尝试切换排序方式</div>
        <el-button size="default" @click="sortMode = 'matchScore_desc'">重置排序</el-button>
      </div>

      <div v-else class="empty-box">
        <Icon icon="mdi:bookmark-outline" class="empty-icon" />
        <div class="empty-title">还没有关注任何方向</div>
        <div class="empty-desc">
          在职业分析页面关注感兴趣的方向，这里会自动同步展示岗位实情、薪资和匹配度
          <span v-if="savedJobs.length">（已保留 {{ savedJobs.length }} 条历史收藏）</span>
        </div>
        <el-button type="primary" size="default" @click="goToCareerAnalysis">去职业分析关注方向</el-button>
      </div>

    </div><!-- /.favorites-content -->
  </div>
</template>

<style scoped>
/* ══════════════════════════════════
   页面容器
   ══════════════════════════════════ */
.favorites-page {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--parchment-100);
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,0.15) transparent;
}

/* ══════════════════════════════════
   Hero 页头区
   ══════════════════════════════════ */
.page-hero {
  background: #1A1815;
  padding: 0 28px;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.28);
}

/* 锦纹斜线纹理 */
.page-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Cpath d='M0 48L48 0M-6 6L6-6M42 54L54 42' stroke='rgba(255,255,255,0.035)' stroke-width='1'/%3E%3C/svg%3E");
  pointer-events: none;
}

.hero-inner {
  max-width: 1160px;
  margin: 0 auto;
  padding: 24px 0 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  position: relative;
  z-index: 1;
}

.hero-left { display: flex; flex-direction: column; gap: 8px; }

.hero-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  padding: 0;
  font-family: inherit;
  transition: color 160ms ease;
  width: fit-content;
}

.hero-back-btn:hover {
  color: rgba(255, 255, 255, 0.82);
}

.hero-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hero-icon {
  font-size: 22px;
  color: var(--color-primary);
  line-height: 1;
  filter: drop-shadow(0 0 8px rgba(180, 60, 40, 0.5));
}

.hero-title h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: #ffffff;
  font-family: var(--font-title);
  letter-spacing: 0.06em;
  line-height: 1;
}

.hero-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.hero-stats strong {
  color: var(--color-gold);
  font-size: 15px;
  font-family: var(--font-latin);
}

.stat-sep { opacity: 0.4; }

.hero-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
}

.hero-actions { display: flex; gap: 10px; align-items: center; flex-shrink: 0; }

.hero-btn-outline {
  background: transparent !important;
  border: 1px solid rgba(255, 255, 255, 0.35) !important;
  color: rgba(255, 255, 255, 0.85) !important;
}

.hero-btn-outline:hover {
  border-color: rgba(255, 255, 255, 0.7) !important;
  color: #ffffff !important;
  background: rgba(255, 255, 255, 0.08) !important;
}

.hero-btn-solid {
  background: #ffffff !important;
  border-color: #ffffff !important;
  color: #1c1410 !important;
  font-weight: 600 !important;
}

.hero-btn-solid:hover {
  background: rgba(255, 255, 255, 0.9) !important;
}

/* ══════════════════════════════════
   内容区（max-width 版心）
   ══════════════════════════════════ */
.favorites-content {
  flex: 1;
  max-width: 1160px;
  width: 100%;
  margin: 0 auto;
  padding: 16px 28px 48px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.specific-favorites,.followed-roles { display: flex; flex-direction: column; gap: 16px; padding: clamp(18px, 3vw, 28px); border: 1px solid rgba(0,0,0,.07); border-radius: 14px; background: #fff; box-shadow: 0 3px 14px rgba(45,35,25,.045); }
.specific-favorites__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding-bottom: 17px; border-bottom: 1px solid rgba(0,0,0,.07); }
.specific-favorites__eyebrow { color: var(--color-primary-dark); font-size: 10px; font-weight: 800; letter-spacing: .12em; }
.specific-favorites__head h2,.followed-roles h2 { margin: 6px 0; color: #27231f; font-family: var(--font-title); font-size: clamp(21px,3vw,27px); letter-spacing: -.025em; }
.specific-favorites__head p,.followed-roles > div p { max-width: 720px; margin: 0; color: #77716a; font-size: 13px; line-height: 1.7; }
.specific-favorites__state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 36px 18px; color: #77716a; text-align: center; }
.specific-favorites__state :deep(svg) { color: #a59b90; font-size: 27px; }
.specific-favorites__state strong { color: #332e28; font-size: 15px; }
.specific-favorites__state p { max-width: 520px; margin: 0; font-size: 13px; line-height: 1.65; }
.specific-favorites__list { display: grid; grid-template-columns: repeat(auto-fill,minmax(min(100%,370px),1fr)); gap: 13px; }
.specific-favorite-card { min-width: 0; padding: 17px; border: 1px solid #e9e3dc; border-radius: 12px; background: linear-gradient(145deg,#fff 30%,#fcfaf7); }
.specific-favorite-card__top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.specific-favorite-card__top time,.followed-roles li time { color: #968d83; font-size: 11px; }
.specific-favorite-card__status { display: inline-flex; padding: 5px 9px; border-radius: 999px; background: #f0eee9; color: #696157; font-size: 10px; font-weight: 750; }
.specific-favorite-card__status.status--current { background: #e8f2ea; color: #386246; }
.specific-favorite-card__status.status--revoked,.specific-favorite-card__status.status--unavailable { background: #f8eae6; color: #994a39; }
.specific-favorite-card h3 { margin: 14px 0 9px; color: #27231f; font-size: 18px; line-height: 1.35; }
.specific-favorite-card__skills { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.specific-favorite-card__skills span { padding: 5px 8px; border: 1px solid #e9e0d6; border-radius: 999px; color: #655c52; font-size: 11px; }
.specific-favorite-card__source { margin-top: 13px; padding: 10px 0; border-top: 1px solid #eee8e1; border-bottom: 1px solid #eee8e1; }
.specific-favorite-card__source summary { color: var(--color-secondary); cursor: pointer; font-size: 12px; font-weight: 700; }
.specific-favorite-card__source p { max-height: 220px; overflow: auto; color: #655f58; font-size: 12px; line-height: 1.7; white-space: pre-wrap; }
.specific-favorite-card__source a { color: var(--color-secondary); font-size: 12px; overflow-wrap: anywhere; }
.specific-favorite-card__boundary { margin: 10px 0 0; color: #81786e; font-size: 11px; line-height: 1.6; }
.specific-favorite-card__actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #eee8e1; }
.specific-favorite-card__actions > span { color: #81786e; font-size: 11px; line-height: 1.5; }
.followed-roles ul { display: flex; flex-wrap: wrap; gap: 9px; margin: 0; padding: 0; list-style: none; }
.followed-roles li { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border: 1px solid #e9e3dc; border-radius: 9px; }
.followed-roles li strong { color: #3f3932; font-size: 12px; }

/* ══════════════════════════════════
   工具栏
   ══════════════════════════════════ */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 16px;
  background: #ffffff;
  border: 1px solid rgba(0,0,0,0.07);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.toolbar__count {
  font-size: 12px;
  color: #888;
  font-weight: 500;
}

/* ══════════════════════════════════
   卡片列表
   ══════════════════════════════════ */
.jobs-list { display: flex; flex-direction: column; gap: 14px; }

/* ── 卡片基础（面板级分段动画替代旧的卡片级 opacity/transform）── */
.job-card {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.07);
  overflow: hidden;
  pointer-events: none;
}

.job-card.is-visible {
  pointer-events: auto;
}

.job-card.is-visible:hover {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.13), 0 2px 8px rgba(0, 0, 0, 0.06);
  transform: translateY(-2px);
  transition: box-shadow 200ms ease, transform 220ms ease;
}

/* ── 分段进场动画（--stagger 由 JS 设置在卡片上，CSS 自定义属性继承至子面板）── */
.job-card .card-panel-left {
  opacity: 0;
  transform: translateX(-24px);
  transition:
    opacity 0.4s cubic-bezier(0.2, 0, 0, 1) var(--stagger, 0ms),
    transform 0.4s cubic-bezier(0.2, 0, 0, 1) var(--stagger, 0ms),
    filter 200ms ease;
}

.job-card .card-panel-right {
  opacity: 0;
  transform: translateX(8px);
  transition:
    opacity 0.36s ease calc(var(--stagger, 0ms) + 130ms),
    transform 0.36s ease calc(var(--stagger, 0ms) + 130ms);
}

.job-card.is-visible .card-panel-left {
  opacity: 1;
  transform: translateX(0);
}

.job-card.is-visible .card-panel-right {
  opacity: 1;
  transform: translateX(0);
}

.job-card.is-visible:hover .card-panel-left {
  filter: brightness(1.08);
}

/* ── 左侧色块 ── */
.card-panel-left {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 12px;
}

.panel-role-name {
  font-size: 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.93);
  text-align: center;
  word-break: keep-all;
  line-height: 1.35;
  font-family: var(--font-title, inherit);
  letter-spacing: 0.04em;
}

/* ── Score Ring（面板内：白色弧 + 深色内圆）── */
.score-ring {
  --score-pct: 0;
  --ring-fill: rgba(255, 255, 255, 0.9);
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: conic-gradient(
    var(--ring-fill) 0% calc(var(--score-pct) * 1%),
    rgba(255, 255, 255, 0.2) calc(var(--score-pct) * 1%) 100%
  );
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.score-ring-inner {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--panel-color, #555) 65%, #000);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.score-num {
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  font-family: var(--font-latin, monospace);
  line-height: 1;
}

.score-pct-sign {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 1px;
}

.panel-saved-at {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.42);
  letter-spacing: 0.02em;
}

/* ── 左侧色块：降级态（未评估 / 偏低） ── */
.card-panel-left--muted {
  filter: saturate(0.55);
}

/* 态 A：未评估 */
.score-unscored {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  border: 2px dashed rgba(255, 255, 255, 0.28);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex-shrink: 0;
}

.score-unscored-num {
  font-size: 22px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.4);
  font-family: var(--font-latin, monospace);
  line-height: 1;
}

.score-unscored-label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.04em;
}

/* 态 B：偏低 */
.score-low {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0;
}

.score-low-icon {
  font-size: 22px;
  color: rgba(255, 255, 255, 0.35);
}

.score-low-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.03em;
  white-space: nowrap;
}

/* ── 右侧内容区 ── */
.card-panel-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 20px;
}

/* 第一区：薪资 + 需求 + 城市 */
.right-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.salary-block {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-shrink: 0;
}

.salary-main {
  font-size: 22px;
  font-weight: 700;
  font-family: var(--font-ui, inherit);
  line-height: 1.1;
}

.salary-median {
  font-size: 11px;
  color: #aaa;
  font-weight: 400;
}

.demand-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}

.demand-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.demand--high {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.demand--mid {
  color: var(--color-gold);
  background: color-mix(in srgb, var(--color-gold) 12%, transparent);
}

.demand--low {
  color: #aaa;
  background: #f0f0f0;
}

.city-chips {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.city-chip {
  font-size: 11px;
  color: #666;
  background: #f3f3f1;
  border-radius: 4px;
  padding: 2px 7px;
  line-height: 1.6;
}

.city-chip--extra { color: #999; background: transparent; }

/* 第二区：技能标签（可展开） */
.right-skills {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.skill-tag {
  font-size: 11px;
  background: color-mix(in srgb, var(--tag-color, #888) 11%, white) !important;
  border-color: color-mix(in srgb, var(--tag-color, #888) 28%, white) !important;
  color: color-mix(in srgb, var(--tag-color, #888) 85%, #222) !important;
}

.skill-toggle-btn {
  font-size: 11px !important;
  color: #999 !important;
  padding: 0 4px !important;
}

/* 第三区：趋势说明（完整显示，不截断）*/
.right-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background: var(--parchment-100);
  border-left: 3px solid var(--color-gold);
  border-radius: 0 6px 6px 0;
  font-size: 12px;
  color: #666;
  line-height: 1.68;
}

.note-icon {
  font-size: 14px;
  color: #bbb;
  flex-shrink: 0;
  margin-top: 1px;
}

/* 第四区：引导 + 操作按钮 */
.right-footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.right-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

/* 引导提示条 */
.guide-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(46, 97, 143, 0.06);
  border: 1px solid rgba(46, 97, 143, 0.12);
  border-radius: 6px;
  font-size: 11px;
  color: #666;
  line-height: 1.55;
}

.guide-hint--low {
  background: rgba(180, 130, 60, 0.06);
  border-color: rgba(180, 130, 60, 0.14);
}

.guide-hint-icon {
  font-size: 14px;
  color: #999;
  flex-shrink: 0;
  margin-top: 1px;
}

/* ══════════════════════════════════
   空状态
   ══════════════════════════════════ */
.empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 64px 24px;
  text-align: center;
}

.empty-icon {
  font-size: 56px;
  color: var(--color-primary);
  opacity: 0.38;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: #444;
  font-family: var(--font-title);
}

.empty-desc {
  font-size: 13px;
  color: #999;
  line-height: 1.7;
  max-width: 380px;
}

/* ══════════════════════════════════
   响应式
   ══════════════════════════════════ */
@media (max-width: 900px) {
  .hero-inner { padding: 22px 0 40px; }
  .hero-title h1 { font-size: 22px; }
  .favorites-content { padding: 14px 16px 32px; }
  .card-panel-left { width: 120px; }
  .panel-role-name { font-size: 16px; }
  .score-ring { width: 64px; height: 64px; }
  .score-ring-inner { width: 50px; height: 50px; }
  .score-num { font-size: 17px; }
  .score-unscored { width: 64px; height: 64px; }
  .score-unscored-num { font-size: 19px; }
}

@media (max-width: 680px) {
  .page-hero { padding: 0 16px; }
  .hero-actions { width: 100%; }
  .job-card { flex-direction: column; }
  .card-panel-left {
    width: 100%;
    height: 72px;
    flex-direction: row;
    padding: 0 16px;
    justify-content: space-between;
    align-items: center;
    gap: 0;
    border-radius: 0;
  }
  .panel-saved-at { display: none; }
  .score-ring { width: 52px; height: 52px; }
  .score-ring-inner { width: 40px; height: 40px; }
  .score-num { font-size: 14px; }
  .panel-role-name { font-size: 17px; }
  .score-unscored { width: 52px; height: 52px; }
  .score-unscored-num { font-size: 16px; }
  .score-low { flex-direction: row; gap: 6px; padding: 0; }
  .score-low-icon { font-size: 16px; }
}

@media (max-width: 480px) {
  .hero-actions { flex-direction: column; gap: 8px; }
  .toolbar { height: auto; padding: 10px 12px; flex-wrap: wrap; gap: 8px; }
  .salary-main { font-size: 18px; }
  .right-header { flex-direction: column; align-items: flex-start; }
  .guide-hint { font-size: 10px; }
}
</style>
