<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import D3RadarChart, { type RadarDatum } from '@/components/charts/D3RadarChart.vue'
import { getApiMode } from '@/api/config'
import { getStudentDashboard, type DashboardCareerDirection, type StudentDashboard } from '@/api/home'
import { inferConfirmedResumeRoles } from '@/api/career'
import { getCareerSuggestions } from '@/api/aiAnalysis'
import { addTargetRole, listTargetRoles } from '@/api/favorites'
import type { TargetRole } from '@/types'
import { ApiError } from '@/api/types'
import { useUserStore } from '@/stores'
import heroLandscape from '@/assets/images/dashboard/hero-landscape.png'
import dataAnalysisImage from '@/assets/images/dashboard/career-data-analysis.png'
import productManagementImage from '@/assets/images/dashboard/career-product-management.png'
import frontendEngineeringImage from '@/assets/images/dashboard/career-frontend-engineering.png'

const router = useRouter()
const userStore = useUserStore()
const isMock = getApiMode() === 'mock'

const dashboard = ref<StudentDashboard | null>(null)
const pageLoading = ref(true)
const pageError = ref('')
const roleDirections = ref<DashboardCareerDirection[]>([])
const roleState = ref<'loading' | 'ready' | 'empty' | 'unavailable'>('loading')
const roleMessage = ref('')
const targetRoles = ref<TargetRole[]>([])
const savingRole = ref('')
const targetRoleMessage = ref('')
const suggestions = ref<string[]>([])
const suggestionState = ref<'loading' | 'ready' | 'empty' | 'unavailable'>('loading')
const suggestionMessage = ref('')

const userName = computed(() => userStore.currentUser?.name?.trim() || '同学')
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '凌晨好'
  if (hour < 12) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

const portrait = computed(() => dashboard.value?.portrait ?? null)
const dimensions = computed(() => portrait.value?.dimensions)
const hasFullRadar = computed(() => Boolean(dimensions.value && ['D1', 'D2', 'D3', 'D4'].every(key => {
  const score = dimensions.value?.[key as 'D1' | 'D2' | 'D3' | 'D4']
  return typeof score === 'number' && Number.isFinite(score)
})))
const radarData = computed<RadarDatum[]>(() => {
  if (!hasFullRadar.value || !dimensions.value) return []
  return [
    { axis: '基础素养', value: dimensions.value.D1 as number },
    { axis: '专业技能', value: dimensions.value.D2 as number },
    { axis: '职业品质', value: dimensions.value.D3 as number },
    { axis: '发展潜力', value: dimensions.value.D4 as number },
  ]
})
const metrics = computed(() => dashboard.value?.metrics)
const activities = computed(() => dashboard.value?.recent_activities ?? [])
const hasCompletedReport = computed(() => dashboard.value?.evidence.has_verified_completed_report ?? false)

const planningPhases = computed(() => {
  const phases = [
    {
      title: '探索市场',
      detail: roleDirections.value.length ? '已结合确认简历整理方向' : '了解行业趋势与岗位需求',
      done: roleDirections.value.length > 0,
      route: '/app/student/career-analysis',
      cta: '开始探索',
    },
    {
      title: '了解自己',
      detail: portrait.value?.completeness != null ? '当前能力画像已核验' : '根据当前资料了解能力现状',
      done: portrait.value?.scoring_eligible === true,
      route: '/app/student/career-navigation',
      cta: '查看分析',
    },
    {
      title: '提升技能',
      detail: (metrics.value?.weekly_completed_chapters ?? 0) > 0
        ? `本周完成 ${metrics.value?.weekly_completed_chapters} 个章节`
        : '围绕目标制定学习计划',
      done: (metrics.value?.weekly_completed_chapters ?? 0) > 0 || (metrics.value?.completed_courses ?? 0) > 0,
      route: '/app/student/learning',
      cta: '前往学习',
    },
    {
      title: '沉淀成果',
      detail: hasCompletedReport.value ? '已有已核验的报告记录' : '查看已完成的职业报告',
      done: hasCompletedReport.value,
      route: '/app/student/my-reports',
      cta: '查看报告',
    },
  ]
  const currentIndex = roleState.value === 'loading' ? -1 : phases.findIndex(phase => !phase.done)
  return phases.map((phase, index) => ({ ...phase, active: index === currentIndex }))
})

const heroAction = computed(() => {
  if (!dashboard.value || roleState.value === 'loading') return null
  return planningPhases.value.find(phase => !phase.done) ?? {
    title: '规划阶段已完成',
    detail: '继续学习，持续积累职业发展成果。',
    route: '/app/student/learning',
    cta: '继续学习',
  }
})

function go(path: string) {
  void router.push(path)
}

function directionImage(roleName: string): string | null {
  if (/数据分析|数据挖掘|商业分析/.test(roleName)) return dataAnalysisImage
  if (/产品经理|产品运营|产品设计/.test(roleName)) return productManagementImage
  if (/前端|web开发/.test(roleName)) return frontendEngineeringImage
  return null
}

function roleDescription(direction: DashboardCareerDirection): string {
  if (direction.description) return direction.description
  if (direction.matched_skills?.length) return `方向参考 · 已确认简历包含 ${direction.matched_skills.slice(0, 3).join('、')}`
  return '方向参考 · 根据已确认简历中的经历与技能整理'
}

function isTargetRoleSaved(roleName: string): boolean {
  return targetRoles.value.some(item => item.role === roleName)
}

async function saveTargetRole(direction: DashboardCareerDirection) {
  if (isTargetRoleSaved(direction.role_name) || savingRole.value) return
  savingRole.value = direction.role_name
  targetRoleMessage.value = ''
  try {
    const userId = userStore.currentUser?.id ?? ''
    await addTargetRole(userId, direction.role_name)
    if (isMock) {
      // Mock mutations acknowledge the demo action but do not persist fixture
      // state, so mirror the saved badge only for this page session.
      targetRoles.value = [...targetRoles.value, {
        role: direction.role_name,
        savedAt: new Date().toISOString().slice(0, 10),
      }]
    } else {
      targetRoles.value = await listTargetRoles(userId)
    }
    if (!isTargetRoleSaved(direction.role_name)) {
      throw new Error('目标方向已提交，但暂未通过服务器回读确认，请稍后刷新再试。')
    }
    await loadSuggestions()
  } catch (error) {
    targetRoleMessage.value = error instanceof Error ? error.message : '保存目标方向失败，请稍后重试。'
  } finally {
    savingRole.value = ''
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(parsed)
}

function messageForSuggestionError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      const body = error.body && typeof error.body === 'object' ? error.body as Record<string, unknown> : {}
      if (body.next_action === 'confirm_resume_or_retry_evidence') {
        return '目标方向已保存，但当前确认简历还没有可用于生成建议的技能依据；请补充并确认简历后重试。'
      }
      if (body.next_action === 'save_target_role') {
        return '先将下方的推荐职业方向设为目标，再生成个性化建议。'
      }
      return '当前资料暂不满足生成建议的条件；请确认简历和目标方向后重试。'
    }
    if (error.status === 503) return 'AI 建议服务暂不可用；可以先查看课程与能力画像，稍后再试。'
    if (error.status === 401) return '登录状态已失效，请重新登录后查看个性化建议。'
  }
  return error instanceof Error ? error.message : '暂时无法读取 AI 建议，请稍后重试。'
}

async function loadSuggestions() {
  if (isMock) {
    suggestions.value = dashboard.value?.demo?.ai_suggestions ?? []
    suggestionState.value = suggestions.value.length ? 'ready' : 'empty'
    suggestionMessage.value = suggestions.value.length ? '' : '演示数据中暂无建议内容。'
    return
  }
  if (!targetRoles.value.length) {
    suggestions.value = []
    suggestionState.value = 'empty'
    suggestionMessage.value = '先将下方的推荐职业方向设为目标，再生成个性化建议。'
    return
  }
  suggestionState.value = 'loading'
  suggestionMessage.value = ''
  try {
    const result = await getCareerSuggestions(userStore.currentUser?.id ?? '', [])
    suggestions.value = result.filter(item => typeof item === 'string' && item.trim()).slice(0, 3)
    suggestionState.value = suggestions.value.length ? 'ready' : 'empty'
    if (!suggestions.value.length) suggestionMessage.value = '当前没有可展示的个性化建议；完善职业兴趣测评或确认简历后可再次获取。'
  } catch (error) {
    suggestions.value = []
    suggestionState.value = 'unavailable'
    suggestionMessage.value = messageForSuggestionError(error)
  }
}

async function loadDirections(taskId: string | null) {
  if (isMock) {
    roleDirections.value = dashboard.value?.demo?.career_directions ?? []
    roleState.value = roleDirections.value.length ? 'ready' : 'empty'
    roleMessage.value = roleDirections.value.length ? '' : '演示资料中暂无职业方向。'
    return
  }
  if (!taskId) {
    roleDirections.value = []
    roleState.value = 'empty'
    roleMessage.value = '完成并确认简历后，可查看基于简历信息整理的方向参考。'
    return
  }
  roleState.value = 'loading'
  roleMessage.value = ''
  try {
    const result = await inferConfirmedResumeRoles(taskId)
    roleDirections.value = (result.roles.candidates ?? []).slice(0, 3).map(candidate => ({
      role_name: candidate.role_name,
      description: candidate.matched_skills?.length
        ? `结合已确认简历中的 ${candidate.matched_skills.slice(0, 3).join('、')} 等信息整理`
        : '根据已确认简历中的经历与技能整理',
      matched_skills: candidate.matched_skills,
      score: candidate.score,
    }))
    roleState.value = roleDirections.value.length ? 'ready' : 'empty'
    if (!roleDirections.value.length) roleMessage.value = '当前已确认简历没有返回可展示的职业方向；可补充简历信息后再试。'
  } catch (error) {
    roleDirections.value = []
    roleState.value = 'unavailable'
    roleMessage.value = error instanceof ApiError && error.status === 409
      ? '当前简历确认记录暂不可用于方向推断；请先检查简历确认状态。'
      : error instanceof Error ? error.message : '暂时无法读取职业方向。'
  }
}

async function loadDashboard() {
  pageLoading.value = true
  pageError.value = ''
  try {
    dashboard.value = await getStudentDashboard()
    targetRoleMessage.value = ''
    try {
      targetRoles.value = await listTargetRoles(userStore.currentUser?.id ?? '')
    } catch (error) {
      // A target-role read failure must not hide otherwise valid dashboard
      // evidence; keep the failure visible next to the save controls.
      targetRoles.value = []
      targetRoleMessage.value = error instanceof Error ? error.message : '暂时无法读取已保存的目标方向。'
    }
    pageLoading.value = false
    // The AI endpoint is intentionally called once for the initial page load;
    // additional calls require the explicit “换一批” action.
    void loadSuggestions()
    void loadDirections(dashboard.value.source_confirmation_task_id)
  } catch (error) {
    pageLoading.value = false
    pageError.value = error instanceof Error ? error.message : '首页数据暂时不可用。'
  }
}

onMounted(() => { void loadDashboard() })
</script>

<template>
  <div class="student-dashboard" :class="{ 'is-demo': isMock }">
    <div v-if="isMock" class="demo-ribbon"><Icon icon="lucide:flask-conical" :width="13" /> 演示数据</div>

    <div v-if="pageLoading" class="dashboard-state" role="status" aria-live="polite">
      <span class="state-spinner" aria-hidden="true" />正在整理你的学习与成长记录…
    </div>
    <div v-else-if="pageError" class="dashboard-state dashboard-state--error" role="alert">
      <Icon icon="lucide:cloud-off" :width="22" />
      <div><strong>暂时无法加载首页</strong><p>{{ pageError }}</p></div>
      <button class="text-action" type="button" @click="loadDashboard">重新加载</button>
    </div>

    <template v-else-if="dashboard">
      <section class="top-grid" aria-label="学习与职业发展概览">
        <div class="hero-column">
          <section class="hero" :style="{ '--hero-image': `url(${heroLandscape})` }">
            <div class="hero-copy">
              <div class="eyebrow">你的成长旅程</div>
              <h1>{{ greeting }}，<strong>{{ userName }}</strong></h1>
              <p>探索适合你的职业方向，从每一次学习与积累，走向更广阔的未来。</p>
              <Transition name="hero-action" mode="out-in">
                <div v-if="heroAction" :key="heroAction.route" class="hero-next" aria-live="polite">
                  <span class="hero-next__label">下一步 · {{ heroAction.title }}</span>
                  <button class="hero-cta" type="button" @click="go(heroAction.route)">
                    {{ heroAction.cta }} <Icon icon="lucide:arrow-right" :width="16" aria-hidden="true" />
                  </button>
                </div>
                <p v-else key="hero-action-loading" class="hero-next__pending" role="status">正在整理你的下一步…</p>
              </Transition>
            </div>
          </section>

          <section class="panel progress-panel" aria-labelledby="progress-title">
            <header class="panel-heading progress-heading">
              <div class="heading-title"><Icon class="progress-heading-icon" icon="lucide:chart-no-axes-column-increasing" :width="21" aria-hidden="true" /><h2 id="progress-title">学习进展</h2></div>
              <button class="text-action" type="button" @click="go('/app/student/learning')">查看详情 <Icon icon="lucide:arrow-right" :width="14" aria-hidden="true" /></button>
            </header>
            <div class="metrics-grid" aria-label="学习指标">
              <article class="metric-card">
                <span class="metric-icon metric-icon--red"><Icon icon="lucide:book-open" :width="19" /></span>
                <div class="metric-copy"><span class="metric-label">已完成课程</span><strong>{{ metrics?.completed_courses ?? 0 }}</strong><small>章节均完成的课程</small></div>
              </article>
              <article class="metric-card">
                <span class="metric-icon metric-icon--coral"><Icon icon="lucide:calendar-check" :width="18" /></span>
                <div class="metric-copy"><span class="metric-label">本周完成章节</span><strong>{{ metrics?.weekly_completed_chapters ?? 0 }}</strong><small>自 {{ metrics?.week_start ?? '本周' }} 起</small></div>
              </article>
              <article class="metric-card">
                <span class="metric-icon metric-icon--gold"><Icon icon="lucide:target" :width="19" /></span>
                <div class="metric-copy">
                  <span class="metric-label">能力画像完整度</span>
                  <strong v-if="portrait?.completeness != null">{{ portrait.completeness }}%</strong>
                  <strong v-else class="metric-empty">—</strong>
                  <small>{{ portrait?.completeness != null ? '来自当前有效画像' : '当前没有可核验画像' }}</small>
                </div>
              </article>
            </div>
            <div v-if="portrait?.completeness != null" class="portrait-completion">
              <div
                class="portrait-completion__track"
                role="progressbar"
                aria-label="能力画像完整度"
                :aria-valuenow="portrait.completeness"
                aria-valuemin="0"
                aria-valuemax="100"
              ><span :style="{ transform: `scaleX(${Math.min(100, Math.max(0, portrait.completeness)) / 100})` }" /></div>
            </div>
            <div v-else class="portrait-completion portrait-completion--empty">
              <p>还没有可核验的能力画像。完成职业测评或补充简历资料后，即可查看进度。</p>
              <button class="text-action" type="button" @click="go('/app/student/career-analysis')">了解职业方向 <Icon icon="lucide:arrow-right" :width="14" aria-hidden="true" /></button>
            </div>
          </section>
        </div>

        <section class="panel suggestions-panel" aria-labelledby="suggestions-title">
          <header class="panel-heading suggestions-heading">
            <div class="heading-title"><span class="heading-icon heading-icon--warm"><Icon icon="lucide:sparkles" :width="18" /></span><h2 id="suggestions-title">AI 为你推荐</h2></div>
            <button class="quiet-action" type="button" :disabled="suggestionState === 'loading'" @click="loadSuggestions">
              {{ suggestionState === 'loading' ? '生成中' : '换一批' }} <Icon icon="lucide:refresh-cw" :width="13" />
            </button>
          </header>
          <p class="panel-subtitle">基于已记录的学习与职业信息，生成个性化建议</p>
          <div v-if="suggestionState === 'loading'" class="inline-state" role="status"><span class="state-spinner state-spinner--small" />正在整理建议…</div>
          <ol v-else-if="suggestionState === 'ready'" class="suggestion-list">
            <li v-for="(suggestion, index) in suggestions" :key="`${index}-${suggestion}`">
              <span class="suggestion-number">{{ String(index + 1).padStart(2, '0') }}</span>
              <p>{{ suggestion }}</p>
            </li>
          </ol>
          <div v-else class="panel-empty" role="status">
            <p>{{ suggestionMessage }}</p>
            <button v-if="suggestionState === 'empty'" class="text-action" type="button" @click="go('/app/student/career-analysis')">去完善职业方向 <Icon icon="lucide:arrow-right" :width="14" /></button>
          </div>
        </section>
      </section>

      <section class="middle-grid" aria-label="职业规划与快捷入口">
        <section class="panel path-panel" aria-labelledby="path-title">
          <header class="panel-heading">
            <div class="heading-title"><span class="section-mark" /><h2 id="path-title">职业规划路径</h2><span class="heading-note">从探索到沉淀，四步构建职业成长路径</span></div>
            <button class="text-action" type="button" @click="go('/app/student/career-navigation')">了解完整路径 <Icon icon="lucide:arrow-right" :width="14" /></button>
          </header>
          <div class="phase-track">
            <article v-for="(phase, index) in planningPhases" :key="phase.title" class="phase" :class="{ 'is-done': phase.done, 'is-current': phase.active }">
              <div class="phase-node"><Icon v-if="phase.done" icon="lucide:check" :width="17" /><span v-else>{{ String(index + 1).padStart(2, '0') }}</span></div>
              <h3>{{ phase.title }}</h3>
              <p>{{ phase.detail }}</p>
              <button v-if="phase.active" class="phase-cta" type="button" @click="go(phase.route)">{{ phase.cta }} <Icon icon="lucide:arrow-right" :width="14" /></button>
              <span v-else-if="phase.done" class="phase-status"><Icon icon="lucide:check" :width="13" /> 已有记录</span>
            </article>
          </div>
        </section>

        <section class="panel shortcut-panel" aria-labelledby="shortcut-title">
          <header class="panel-heading">
            <div class="heading-title"><span class="section-mark" /><h2 id="shortcut-title">快捷入口</h2></div>
            <span class="shortcut-hint">常用功能</span>
          </header>
          <div class="shortcut-grid">
            <button class="shortcut" type="button" @click="go('/app/student/ai-assistant')"><span><Icon icon="lucide:bot" :width="20" /></span><strong>AI 助手</strong><small>获取个性化建议</small><Icon class="shortcut-arrow" icon="lucide:arrow-up-right" :width="15" /></button>
            <button class="shortcut" type="button" @click="go('/app/student/learning')"><span><Icon icon="lucide:book-open" :width="20" /></span><strong>技能提升</strong><small>补足所需技能</small><Icon class="shortcut-arrow" icon="lucide:arrow-up-right" :width="15" /></button>
            <button class="shortcut" type="button" @click="go('/app/exams')"><span><Icon icon="lucide:chart-no-axes-column-increasing" :width="20" /></span><strong>技能自评</strong><small>了解能力现状</small><Icon class="shortcut-arrow" icon="lucide:arrow-up-right" :width="15" /></button>
            <button class="shortcut" type="button" @click="go('/app/student/my-reports')"><span><Icon icon="lucide:file-text" :width="20" /></span><strong>我的报告</strong><small>查看已完成报告</small><Icon class="shortcut-arrow" icon="lucide:arrow-up-right" :width="15" /></button>
          </div>
        </section>
      </section>

      <section class="bottom-grid" aria-label="职业方向、学习进展和能力画像">
        <section class="panel career-panel" aria-labelledby="career-title">
          <header class="panel-heading">
            <div class="heading-title"><span class="section-mark" /><h2 id="career-title">推荐职业方向</h2></div>
            <button class="text-action" type="button" @click="go('/app/student/career-navigation')">查看方向 <Icon icon="lucide:arrow-right" :width="14" /></button>
          </header>
          <p class="panel-subtitle">基于已确认简历整理的方向参考</p>
          <p v-if="targetRoleMessage" class="target-role-message" role="status">{{ targetRoleMessage }}</p>
          <div v-if="roleState === 'loading'" class="inline-state"><span class="state-spinner state-spinner--small" />正在整理方向…</div>
          <div v-else-if="roleState === 'ready'" class="career-list">
            <article v-for="direction in roleDirections" :key="direction.role_name" class="career-item">
              <button class="career-item__open" type="button" @click="go('/app/student/career-navigation')">
                <img v-if="directionImage(direction.role_name)" :src="directionImage(direction.role_name) ?? ''" :alt="`${direction.role_name}工作场景`" loading="lazy" />
                <span v-else class="career-placeholder"><Icon icon="lucide:briefcase-business" :width="22" /></span>
                <span class="career-copy"><strong>{{ direction.role_name }}</strong><small>{{ roleDescription(direction) }}</small></span>
                <Icon class="career-arrow" icon="lucide:chevron-right" :width="17" />
              </button>
              <button
                class="target-role-action"
                type="button"
                :disabled="isTargetRoleSaved(direction.role_name) || savingRole === direction.role_name || Boolean(savingRole)"
                :aria-label="isTargetRoleSaved(direction.role_name) ? `${direction.role_name}已设为目标` : `将${direction.role_name}设为目标职业`"
                @click="saveTargetRole(direction)"
              >
                <Icon :icon="isTargetRoleSaved(direction.role_name) ? 'lucide:check' : savingRole === direction.role_name ? 'lucide:loader-circle' : 'lucide:plus'" :width="14" />
                {{ isTargetRoleSaved(direction.role_name) ? '已设目标' : savingRole === direction.role_name ? '保存中' : '设为目标' }}
              </button>
            </article>
          </div>
          <div v-else class="panel-empty career-empty" role="status">
            <Icon icon="lucide:compass" :width="24" />
            <p>{{ roleMessage }}</p>
            <button class="text-action" type="button" @click="go('/app/student/career-analysis')">了解职业方向 <Icon icon="lucide:arrow-right" :width="14" /></button>
          </div>
        </section>

        <section class="panel activity-panel" aria-labelledby="activity-title">
          <header class="panel-heading">
            <div class="heading-title"><span class="section-mark" /><h2 id="activity-title">最近进展</h2></div>
            <button class="text-action" type="button" @click="go('/app/student/learning')">查看全部 <Icon icon="lucide:arrow-right" :width="14" /></button>
          </header>
          <p class="panel-subtitle">只展示已完成课程与核验通过的报告记录</p>
          <ol v-if="activities.length" class="activity-list">
            <li v-for="item in activities" :key="item.id">
              <time :datetime="item.occurred_at ?? undefined">{{ formatDate(item.occurred_at) }}</time>
              <span class="activity-node" :class="item.type === 'career_report' ? 'activity-node--report' : 'activity-node--course'"><Icon :icon="item.type === 'career_report' ? 'lucide:file-check-2' : 'lucide:book-open-check'" :width="16" /></span>
              <button type="button" class="activity-copy" @click="go(item.route)"><strong>{{ item.type === 'career_report' ? '完成职业报告' : '完成课程' }}《{{ item.title }}》</strong><small>{{ item.type === 'career_report' ? '已核验报告记录' : '课程章节均已完成' }}</small></button>
            </li>
          </ol>
          <div v-else class="panel-empty activity-empty"><Icon icon="lucide:clock-3" :width="23" /><p>完成课程或生成已核验报告后，进展会显示在这里。</p><button class="text-action" type="button" @click="go('/app/student/learning')">开始学习 <Icon icon="lucide:arrow-right" :width="14" /></button></div>
        </section>

        <section class="panel ability-panel" aria-labelledby="ability-title">
          <header class="panel-heading">
            <div class="heading-title"><span class="section-mark" /><h2 id="ability-title">能力雷达图</h2></div>
            <button class="text-action" type="button" @click="go('/app/student/my-reports')">查看画像 <Icon icon="lucide:arrow-right" :width="14" /></button>
          </header>
          <p class="panel-subtitle">仅呈现当前有效画像中的 D1–D4 四维数据</p>
          <div v-if="hasFullRadar" class="radar-wrap">
            <D3RadarChart :data="radarData" :show-legend="false" :width="420" :height="230" :margin="48" :segment-colors="['#c54420', '#c54420', '#c54420', '#c54420']" />
          </div>
          <div v-else class="panel-empty radar-empty" role="status">
            <span class="radar-empty__icon"><Icon icon="lucide:radar" :width="25" /></span>
            <p>{{ portrait?.state === 'ready_with_unknowns' ? '当前画像部分维度缺少可核验分数，补全后会展示完整雷达图。' : portrait?.state === 'source_invalid' ? `${portrait.error || '简历确认来源暂不可核验。'} 请检查简历确认状态后重试。` : '还没有可核验的当前能力画像。' }}</p>
            <button class="text-action" type="button" @click="go('/app/student/career-navigation')">查看画像状态 <Icon icon="lucide:arrow-right" :width="14" /></button>
          </div>
        </section>
      </section>
    </template>
  </div>
</template>

<style scoped>
.student-dashboard {
  --dash-ink: #20201d;
  --dash-muted: #77736d;
  --dash-soft: #9a968f;
  --dash-accent: #c33b17;
  --dash-line: rgba(74, 58, 43, 0.09);
  --dash-surface: rgba(255, 255, 255, 0.9);
  min-height: 100%;
  position: relative;
  padding: 18px clamp(18px, 3vw, 48px) 34px;
  color: var(--dash-ink);
  background:
    radial-gradient(ellipse at 25% 4%, rgba(255, 255, 255, 0.78), transparent 40%),
    linear-gradient(180deg, #f6f1eb 0%, #f4f0eb 100%);
  font-family: var(--font-ui, "Noto Sans SC", sans-serif);
}

.demo-ribbon {
  position: absolute;
  z-index: 2;
  top: 8px;
  right: 20px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border: 1px solid rgba(167, 105, 72, .12);
  border-radius: 99px;
  color: #9b5b37;
  background: rgba(255, 253, 249, .78);
  font-size: 10px;
  letter-spacing: 0.06em;
  pointer-events: none;
}

.top-grid { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(340px, .96fr); gap: 16px; align-items: stretch; }
.hero-column { display: grid; grid-template-rows: minmax(230px, 1fr) auto; min-width: 0; gap: 0; }
.hero {
  min-width: 0;
  position: relative;
  overflow: hidden;
  border-radius: 20px 20px 0 0;
  background-image: linear-gradient(90deg, rgba(248, 244, 239, 0.98) 0%, rgba(248, 244, 239, 0.84) 39%, rgba(248, 244, 239, 0.12) 100%), var(--hero-image);
  background-size: cover;
  background-position: center 53%;
}
.hero::after { content: ""; position: absolute; inset: auto 0 0; height: 38px; background: linear-gradient(0deg, rgba(246, 241, 235, 0.46), transparent); pointer-events: none; }
.hero-copy { position: relative; z-index: 1; padding: 31px 28px 22px; max-width: 610px; }
.eyebrow { color: #a55a3e; font-size: 10px; font-weight: 650; letter-spacing: .12em; margin: 1px 0 12px; }
.hero h1 { margin: 0; font-family: "Noto Serif SC", "Songti SC", "SimSun", serif; font-size: clamp(30px, 3.2vw, 42px); line-height: 1.18; letter-spacing: 0.04em; font-weight: 500; }
.hero h1 strong { font-weight: 650; }
.hero p { margin: 10px 0 0; color: #6e6861; font-family: var(--font-title, "Noto Serif SC", serif); font-size: 15px; letter-spacing: 0.02em; }
.hero-next { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 19px; }
.hero-next__label { color: #8b4d38; font-size: 12px; font-weight: 650; letter-spacing: .02em; }
.hero-next__pending { margin: 12px 0 0; color: #77736d; font-family: var(--font-title, "Noto Serif SC", serif); font-size: 12px; }
.hero-cta { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 18px; border: 0; border-radius: 22px; color: #fff; background: linear-gradient(135deg, #cf4b2a, #a93216); box-shadow: 0 5px 16px rgba(153, 53, 28, .2); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; transition: transform .16s ease, box-shadow .16s ease, background-color .16s ease; }
.hero-cta:hover { transform: translateY(-1px); box-shadow: 0 6px 15px rgba(182, 54, 20, .2); }
.hero-cta:active { transform: translateY(1px); }
.hero-cta:focus-visible { outline: 2px solid #8f2c12; outline-offset: 3px; }
.hero-action-enter-active, .hero-action-leave-active { transition: opacity .16s ease, transform .16s ease; }
.hero-action-enter-from, .hero-action-leave-to { opacity: 0; transform: translateY(4px); }

.progress-panel { padding: 13px 20px 15px; border: 1px solid rgba(255, 255, 255, .86); border-top: 1px solid rgba(255, 255, 255, .56); border-radius: 0 0 20px 20px; background: rgba(255, 253, 250, .94); box-shadow: 0 9px 26px rgba(82, 64, 45, .045); }
.progress-heading { min-height: 26px; margin: 0 0 7px; }
.progress-heading .heading-title { gap: 8px; }
.progress-heading .heading-title h2 { font-size: 16px; }
.portrait-completion { display: flex; align-items: center; gap: 12px; margin-top: 9px; }
.portrait-completion__track { flex: 1; min-width: 70px; height: 4px; overflow: hidden; border-radius: 99px; background: #eee4dc; }
.portrait-completion__track span { display: block; width: 100%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #dc8a6c, #ba3d20); transform: scaleX(0); transform-origin: left center; transition: transform .24s ease; }
.portrait-completion p { margin: 0; color: #89847d; font-size: 10px; line-height: 1.5; }
.portrait-completion--empty { justify-content: space-between; gap: 10px; }
.portrait-completion--empty p { max-width: 74%; }
.portrait-completion--empty .text-action { flex: none; }
.metrics-grid { position: relative; z-index: 2; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin-top: 0; padding-top: 9px; border-top: 1px solid rgba(74, 58, 43, .09); }
.metric-card { min-width: 0; min-height: 61px; padding: 5px 12px; display: flex; align-items: center; gap: 11px; position: relative; overflow: hidden; border-right: 1px solid rgba(74, 58, 43, .09); background: transparent; }
.metric-card:first-child { padding-left: 0; }
.metric-card:last-child { border-right: 0; padding-right: 0; }
.metric-icon { flex: 0 0 35px; width: 35px; height: 35px; border-radius: 50%; display: grid; place-items: center; background: #fff0e9; color: var(--dash-accent); }
.metric-icon--coral { color: #d66b4d; background: #fff4ef; }
.metric-icon--gold { color: #c68645; background: #fbf2e7; }
.metric-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.metric-label { color: #716b64; font-size: 12px; white-space: nowrap; }
.metric-copy strong { margin-top: 2px; font-family: var(--font-title, Georgia, serif); font-size: 25px; line-height: 1.1; font-weight: 650; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.metric-copy strong.metric-empty { color: #b6b1aa; }
.metric-copy small { margin-top: 4px; color: #77736d; font-size: 10px; line-height: 1.35; white-space: nowrap; }
.panel { min-width: 0; padding: 20px 22px; border: 1px solid rgba(255, 255, 255, .86); border-radius: 15px; background: var(--dash-surface); box-shadow: 0 8px 26px rgba(82, 64, 45, .035); }
.panel.progress-panel { padding: 13px 20px 15px; border: 1px solid rgba(255, 255, 255, .86); border-top-color: rgba(255, 255, 255, .56); border-radius: 0 0 20px 20px; background: rgba(255, 253, 250, .94); box-shadow: 0 9px 26px rgba(82, 64, 45, .045); }
.suggestions-panel { display: flex; flex-direction: column; min-height: 340px; padding: 22px 24px 20px; color: #f7eee7; border: 1px solid rgba(255, 241, 227, .12); border-radius: 20px; background: radial-gradient(ellipse at 88% 0%, rgba(185, 117, 75, .2), transparent 44%), linear-gradient(145deg, #342a25, #49382e); box-shadow: 0 12px 30px rgba(67, 48, 37, .12); }
.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
.heading-title { display: flex; align-items: center; min-width: 0; gap: 10px; }
.heading-title h2 { margin: 0; color: var(--dash-ink); font-family: var(--font-title, "Noto Serif SC", serif); font-size: 17px; font-weight: 700; white-space: nowrap; }
.suggestions-panel .heading-title h2 { color: #fff8f0; }
.heading-icon { flex: 0 0 30px; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; }
.heading-icon--warm { color: #c7502d; background: #fff0e9; }
.suggestions-panel .heading-icon--warm { color: #ffe3d1; background: rgba(232, 139, 99, .16); }
.quiet-action { display: inline-flex; align-items: center; gap: 6px; border: 0; padding: 6px 0 6px 8px; color: #d4bdae; background: transparent; font: inherit; font-size: 11px; cursor: pointer; white-space: nowrap; }
.suggestions-panel .quiet-action:hover { color: #fff; }
.quiet-action:disabled { cursor: wait; opacity: .55; }
.panel-subtitle { margin: 9px 0 13px; color: #99948d; font-size: 11px; line-height: 1.6; }
.suggestions-panel .panel-subtitle { color: #c7b5a8; }
.suggestion-list { display: grid; gap: 0; padding: 0; margin: 0; list-style: none; }
.suggestion-list li { min-height: 58px; display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(255, 244, 236, .12); color: #9b9892; }
.suggestion-list li:last-child { border-bottom: 0; }
.suggestion-number { width: 25px; height: 25px; display: grid; place-items: center; border-radius: 50%; color: #f1ae8e; background: rgba(221, 120, 83, .15); font-family: Georgia, serif; font-size: 12px; }
.suggestion-list p { margin: 0; color: #f4e8de; font-size: 12px; line-height: 1.7; }
.suggestions-panel .inline-state { color: #e3d0c2; }
.suggestions-panel .state-spinner { border-color: rgba(255, 230, 210, .22); border-top-color: #e79978; }
.suggestions-panel .panel-empty { color: #d7c4b6; }
.suggestions-panel .panel-empty > p { color: #e1d1c5; }
.suggestions-panel .text-action { color: #efaa8a; }
.panel-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; min-height: 110px; padding: 12px; text-align: center; color: #aaa49c; }
.panel-empty > p { max-width: 340px; margin: 8px 0; color: #8b867f; font-size: 11px; line-height: 1.7; }
.text-action { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; padding: 5px 0; color: var(--dash-accent); background: transparent; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.text-action:hover { color: #92290d; text-decoration: underline; text-underline-offset: 3px; }
.text-action:focus-visible, .quiet-action:focus-visible, .phase-cta:focus-visible, .shortcut:focus-visible, .career-item:focus-visible, .activity-copy:focus-visible { outline: 2px solid #be3d1a; outline-offset: 3px; }

.middle-grid { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(330px, 1fr); gap: 16px; margin-top: 17px; }
.path-panel { padding: 20px 24px 19px; border: 1px solid rgba(255, 255, 255, .5); border-radius: 18px; background: linear-gradient(135deg, #f8f1e9, #f0e8dd); box-shadow: none; }
.section-mark { display: none; }
.heading-note { margin-left: 8px; color: #8e8378; font-size: 11px; white-space: nowrap; }
.phase-track { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 23px; }
.phase-track::before { content: ""; position: absolute; top: 18px; left: 12.5%; right: 12.5%; height: 1px; background: rgba(115, 94, 77, .2); }
.phase { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; text-align: center; min-width: 0; }
.phase-node { width: 37px; height: 37px; border: 1px solid rgba(110, 91, 75, .22); border-radius: 50%; display: grid; place-items: center; color: #81776d; background: #f8f3ed; font-family: Georgia, serif; font-size: 12px; }
.phase.is-current .phase-node { border: 1px solid #bd3714; color: #fff; background: #bd3714; box-shadow: 0 0 0 6px rgba(189, 55, 20, .1); }
.phase.is-done .phase-node { border-color: #cf8a72; color: #fff; background: #cf8a72; }
.phase h3 { margin: 12px 0 4px; font-size: 13px; font-weight: 650; }
.phase p { min-height: 17px; max-width: 200px; margin: 0; color: #99948d; font-size: 10px; line-height: 1.55; }
.phase.is-current h3 { color: #9d351b; }
.phase-cta { min-height: 34px; margin-top: 10px; padding: 7px 12px; border: 0; border-radius: 18px; display: inline-flex; align-items: center; gap: 6px; color: #fff; background: #b93d20; font: inherit; font-size: 10px; font-weight: 650; cursor: pointer; }
.phase-cta:hover { background: #a93112; }
.phase-status { margin-top: 10px; padding: 6px 11px; border-radius: 16px; display: inline-flex; align-items: center; gap: 4px; color: #6e826f; background: rgba(232, 239, 229, .8); font-size: 10px; white-space: nowrap; }

.shortcut-panel { padding: 20px 19px 17px; border: 0; border-radius: 18px; background: rgba(255, 253, 249, .72); box-shadow: none; }
.shortcut-hint { color: #9a8d81; font-size: 10px; }
.shortcut-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; margin-top: 10px; }
.shortcut { min-width: 0; min-height: 68px; position: relative; display: grid; grid-template-columns: 35px minmax(0, 1fr) 14px; grid-template-rows: auto auto; align-items: center; column-gap: 9px; padding: 8px 2px; border: 0; border-bottom: 1px solid rgba(97, 78, 61, .11); border-radius: 0; color: #b04b2a; background: transparent; text-align: left; cursor: pointer; transition: color .18s ease, background-color .18s ease; }
.shortcut:active { transform: none; }
.shortcut > span { grid-row: 1 / 3; width: 33px; height: 33px; display: grid; place-items: center; border-radius: 50%; color: #b44b2a; background: #f8e9df; }
.shortcut strong { overflow: hidden; color: var(--dash-ink); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.shortcut small { overflow: hidden; color: #99948d; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.shortcut-arrow { grid-column: 3; grid-row: 1 / 3; justify-self: end; }
.shortcut:hover { color: #8f3016; background: rgba(189, 55, 20, .045); }
.shortcut:focus-visible { outline: 2px solid #be3d1a; outline-offset: 2px; }

.bottom-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr); gap: 16px; margin-top: 16px; align-items: stretch; }
.bottom-grid > .panel { display: flex; min-height: 282px; flex-direction: column; padding: 19px 20px 16px; }
.career-panel { border: 1px solid rgba(255, 255, 255, .8); background: rgba(255, 254, 251, .91); box-shadow: 0 7px 22px rgba(82, 64, 45, .035); }
.activity-panel { border: 1px solid rgba(227, 236, 225, .92); background: linear-gradient(145deg, #f4f6f1, #edf2eb); box-shadow: none; }
.ability-panel { border: 1px solid rgba(238, 222, 205, .92); background: linear-gradient(145deg, #f0e5d8, #eadccf); box-shadow: none; }
.career-panel .panel-subtitle, .activity-panel .panel-subtitle, .ability-panel .panel-subtitle { margin-bottom: 10px; }
.career-list { display: grid; flex: 1; align-content: space-between; gap: 0; }
.career-item { min-width: 0; min-height: 62px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; padding: 7px 0; border: 0; border-bottom: 1px solid rgba(86, 69, 53, .1); border-radius: 0; background: transparent; }
.career-item:last-child { border-bottom: 0; }
.career-item__open { min-width: 0; min-height: 48px; display: grid; grid-template-columns: 85px minmax(0, 1fr) 16px; align-items: center; gap: 11px; padding: 0; border: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; }
.career-item__open:focus-visible, .target-role-action:focus-visible { outline: 2px solid #be3d1a; outline-offset: 2px; border-radius: 7px; }
.career-item img { display: block; width: 85px; height: 47px; border-radius: 7px; object-fit: cover; }
.career-placeholder { width: 85px; height: 47px; display: grid; place-items: center; border-radius: 7px; color: #ba684f; background: #f4e9e3; }
.career-copy { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.career-copy strong { overflow: hidden; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.career-copy small { overflow: hidden; color: #96918a; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.career-arrow { color: #9b9892; }
.target-role-action { min-width: 76px; min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 4px 7px; border: 1px solid #eadbd4; border-radius: 8px; color: #a33f23; background: #fffaf7; font: inherit; font-size: 10px; font-weight: 650; white-space: nowrap; cursor: pointer; }
.target-role-action:disabled { color: #66856e; border-color: #e4ece3; background: #f5f8f4; cursor: default; }
.target-role-message { margin: 2px 4px 0; color: #9a563e; font-size: 10px; line-height: 1.5; }
.career-empty { min-height: 165px; }

.activity-list { position: relative; display: grid; flex: 1; align-content: space-between; gap: 0; padding: 0; margin: 7px 0 0; list-style: none; }
.activity-list::before { content: ""; position: absolute; top: 18px; bottom: 18px; left: 79px; width: 1px; background: rgba(102, 129, 105, .22); }
.activity-list li { position: relative; display: grid; grid-template-columns: 62px 34px minmax(0, 1fr); align-items: center; gap: 8px; min-height: 51px; }
.activity-list time { color: #a19c95; font-size: 10px; white-space: nowrap; }
.activity-node { position: relative; z-index: 1; width: 32px; height: 32px; display: grid; place-items: center; border: 4px solid #f1f4ee; border-radius: 50%; color: #c24a27; background: #fff0e9; box-sizing: content-box; }
.activity-node--report { color: #63896b; background: #edf4ee; }
.activity-copy { min-width: 0; display: flex; flex-direction: column; gap: 4px; padding: 4px 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
.activity-copy strong { overflow: hidden; color: #373632; font-size: 10px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.activity-copy small { color: #a09b94; font-size: 9px; }
.activity-empty { min-height: 170px; }

.radar-wrap { height: 230px; max-width: 420px; margin: 0 auto; border-radius: 12px; background: rgba(255, 251, 246, .38); }
.radar-wrap :deep(svg) { overflow: visible; }
.radar-empty { min-height: 175px; }
.radar-empty__icon { width: 43px; height: 43px; display: grid; place-items: center; border-radius: 50%; color: #bd6041; background: #fbf0e9; }
.inline-state { min-height: 100px; display: flex; align-items: center; justify-content: center; gap: 9px; color: #96918a; font-size: 11px; }
.dashboard-state { min-height: 320px; display: flex; align-items: center; justify-content: center; gap: 12px; color: #807a72; font-size: 13px; }
.dashboard-state--error { color: #7d5b4c; }
.dashboard-state--error p { max-width: 540px; margin: 5px 0 0; color: #8e857e; font-size: 12px; line-height: 1.6; }
.state-spinner { width: 16px; height: 16px; border: 2px solid #ead8cf; border-top-color: #bd4421; border-radius: 50%; animation: spin .8s linear infinite; }
.state-spinner--small { width: 13px; height: 13px; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (hover: hover) and (pointer: fine) {
  .career-item__open:hover .career-copy strong { color: #a33b1d; }
}

@media (max-width: 1180px) {
  .top-grid { grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr); }
  .middle-grid { grid-template-columns: minmax(0, 1.45fr) minmax(300px, 1fr); }
  .heading-note { display: none; }
  .metric-card { gap: 8px; padding-left: 10px; padding-right: 8px; }
  .metric-icon { flex-basis: 34px; width: 34px; height: 34px; }
}
@media (max-width: 900px) {
  .top-grid, .middle-grid { grid-template-columns: 1fr; }
  .hero-column { grid-template-rows: minmax(200px, auto) auto; }
  .suggestions-panel { min-height: 250px; }
  .bottom-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ability-panel { grid-column: 1 / -1; }
}
@media (max-width: 767px) {
  .student-dashboard {
    height: auto;
    min-height: 100%;
    overflow: visible;
    padding: 12px 12px 22px;
  }
  .demo-ribbon { top: 3px; right: 14px; }
  .top-grid, .middle-grid, .bottom-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; margin-top: 10px; }
  .top-grid { display: grid; align-items: start; margin-top: 0; }
  .hero-column { display: grid; grid-template-rows: auto auto; min-width: 0; }
  .hero { min-height: 250px; border-radius: 16px 16px 0 0; background-position: 59% center; }
  .hero-copy { max-width: 90%; padding: 24px 15px 18px; }
  .eyebrow { margin-bottom: 11px; font-size: 9px; letter-spacing: .1em; }
  .hero h1 { font-size: 29px; line-height: 1.25; }
  .hero p { max-width: 300px; margin-top: 9px; font-size: 13px; line-height: 1.65; }
  .hero-next { align-items: flex-start; flex-direction: column; gap: 8px; margin-top: 14px; }
  .hero-next__label { font-size: 11px; }
  .hero-cta { min-height: 44px; padding: 0 18px; font-size: 13px; }
  .hero-cta:active { transform: translateY(1px); }
  .hero-cta:focus-visible { outline: 2px solid #8f2c12; outline-offset: 3px; }

  .suggestions-panel { min-height: 0; padding: 16px 15px 14px; }
  .panel, .path-panel, .shortcut-panel, .bottom-grid > .panel { padding: 15px 13px; }
  .panel-heading { gap: 7px; }
  .heading-title { gap: 8px; }
  .heading-title h2 { font-size: 15px; }
  .text-action { min-height: 44px; }
  .panel-subtitle { margin: 7px 0 10px; font-size: 10px; }
  .quiet-action { min-height: 44px; padding-left: 4px; }
  .suggestion-list { gap: 0; }
  .suggestion-list li { grid-template-columns: 27px minmax(0, 1fr); gap: 8px; min-height: 54px; padding: 8px 0; }
  .suggestion-number { width: 23px; height: 23px; font-size: 11px; }
  .suggestion-list p { font-size: 11px; line-height: 1.6; }
  .panel-empty { min-height: 88px; }
  .panel-empty > p { font-size: 11px; }

  .panel.progress-panel { padding: 12px 12px 13px; border-radius: 0 0 16px 16px; }
  .panel-heading.progress-heading { display: flex; min-height: 32px; }
  .progress-heading .heading-title h2 { font-size: 15px; }
  .progress-heading-icon { color: #c43b17; flex: none; }
  .progress-heading .text-action { min-height: 44px; }
  .metrics-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin-top: 8px; padding-top: 8px; }
  .metric-card {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    align-items: center;
    gap: 5px;
    min-height: 67px;
    padding: 5px 5px 6px 1px;
    border-right: 1px solid rgba(74, 58, 43, .08);
  }
  .metric-card:first-child { padding-left: 1px; }
  .metric-card:last-child { border-right: 0; }
  .metric-icon { width: 30px; height: 30px; flex-basis: 30px; }
  .metric-copy { overflow: hidden; }
  .metric-label { min-height: 22px; color: #8c8882; font-size: 9px; line-height: 1.2; white-space: normal; }
  .metric-copy strong { margin-top: 2px; font-size: 22px; line-height: 1; }
  .metric-copy small { display: none; }
  .portrait-completion { gap: 8px; margin-top: 8px; }
  .portrait-completion__track { height: 5px; }
  .portrait-completion p { font-size: 9px; }
  .portrait-completion--empty { flex-wrap: wrap; align-items: center; justify-content: flex-start; gap: 4px 8px; }
  .portrait-completion--empty p { flex: 1 1 180px; }
  .portrait-completion--empty .text-action { min-height: 38px; flex: 0 0 auto; }

  .middle-grid, .bottom-grid { margin-top: 0; }
  .path-panel { padding-bottom: 14px; }
  .path-panel .panel-heading { align-items: flex-start; }
  .path-panel .panel-heading > .text-action { min-height: 40px; }
  .heading-note { display: none; }
  .phase-track { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px; margin-top: 15px; }
  .phase-track::before { top: 16px; left: 12.5%; right: 12.5%; }
  .phase-node { width: 32px; height: 32px; font-size: 10px; }
  .phase h3 { margin: 8px 0 3px; font-size: 10px; white-space: nowrap; }
  .phase p { min-height: 30px; padding: 0 2px; font-size: 9px; line-height: 1.4; }
  .phase-cta { min-height: 44px; margin-top: 7px; padding: 5px 7px; gap: 3px; font-size: 9px; white-space: nowrap; }
  .phase-status { min-height: 28px; margin-top: 7px; padding: 4px 5px; font-size: 8px; white-space: nowrap; }

  .shortcut-panel { padding-bottom: 13px; }
  .shortcut-grid { gap: 7px; margin-top: 8px; }
  .shortcut { grid-template-columns: 36px minmax(0, 1fr) 12px; column-gap: 7px; min-height: 68px; padding: 8px; }
  .shortcut > span { width: 34px; height: 34px; }
  .shortcut strong { font-size: 11px; }
  .shortcut small { font-size: 9px; }

  .bottom-grid { grid-template-columns: minmax(0, 1fr); }
  .career-panel, .activity-panel { min-height: 0; }
  .ability-panel { display: none; }
  .career-item { grid-template-columns: minmax(0, 1fr) auto; gap: 3px; min-height: 66px; padding: 7px 0; }
  .career-item__open { grid-template-columns: 64px minmax(0, 1fr) 14px; gap: 8px; }
  .career-item img, .career-placeholder { width: 64px; height: 52px; }
  .career-copy strong { font-size: 12px; }
  .career-copy small { display: -webkit-box; overflow: hidden; white-space: normal; font-size: 10px; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .target-role-action { min-width: 64px; min-height: 44px; padding: 4px 3px; font-size: 10px; white-space: normal; }
  .activity-list { margin-top: 5px; }
  .activity-list::before { left: 73px; }
  .activity-list li { grid-template-columns: 48px 32px minmax(0, 1fr); gap: 7px; min-height: 56px; }
  .activity-list time { font-size: 9px; }
  .activity-node { width: 28px; height: 28px; }
  .activity-copy { min-height: 44px; justify-content: center; }
  .activity-copy strong { display: -webkit-box; overflow: hidden; font-size: 10px; line-height: 1.35; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .activity-copy small { font-size: 9px; }
}

@media (max-width: 359px) {
  .student-dashboard { padding-right: 10px; padding-left: 10px; }
  .hero { min-height: 260px; }
  .hero-copy { max-width: 91%; padding-right: 12px; padding-left: 13px; }
  .hero h1 { font-size: 26px; }
  .metric-card { grid-template-columns: 27px minmax(0, 1fr); gap: 3px; padding-right: 3px; }
  .metric-icon { width: 26px; height: 26px; flex-basis: 26px; }
  .metric-label { font-size: 8px; }
  .metric-copy strong { font-size: 20px; }
  .phase-track { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 6px; }
  .phase-track::before { display: none; }
  .phase p { min-height: 0; max-width: 132px; }
  .phase-cta { min-height: 44px; font-size: 9px; }
  .phase-status { min-height: 36px; font-size: 9px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
}
</style>
