<!-- 布局：应用主框架（左侧导航栏/顶部栏/面包屑标题/主内容区 router-view） -->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ICONS } from '@/constants/icons'
import { useUserStore, useThemeStore } from '@/stores'
import CloudTabNav from '@/components/book/CloudTabNav.vue'
import BookPage from '@/components/book/BookPage.vue'
import UserInfoBar from '@/components/UserInfoBar.vue'
import AgentMark from '@/components/agent/AgentMark.vue'
import StarMark from '@/components/brand/StarMark.vue'
import { gsap } from '@/plugins/gsap'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()

const drawerOpen = ref(false)

watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false
  },
)

const userRole = computed(() => userStore.userRole)
const isStudent = computed(() => userStore.isStudent)
const isAdmin = computed(() => userStore.isAdmin)

const activeMenu = computed(() => {
  return route.path
})

const activeTabKey = computed({
  get: () => route.path,
  set: (val: string) => {
    if (val && val !== route.path) {
      router.push(val)
    }
  },
})

const isImmersiveRoute = computed(() => Boolean(route.meta.immersive))

const studentMobileTabs = [
  { path: '/app/dashboard', label: '首页', icon: ICONS.home },
  { path: '/app/student/career-analysis', label: '探索', icon: ICONS.compass },
  { path: '/app/student/learning', label: '学习', icon: ICONS.bookOpen },
  { path: '/app/student/my-reports', label: '报告', icon: ICONS.fileText },
  { path: '/app/profile', label: '我的', icon: ICONS.user },
]
const studentMobileTabPaths = new Set(studentMobileTabs.map(tab => tab.path))
const isStudentMobilePrimaryRoute = computed(() => isStudent.value && studentMobileTabPaths.has(route.path))
const studentPrimaryRoutesWithOwnHeader = new Set(['/app/student/career-analysis'])
const hasStudentPrimaryOwnHeader = computed(() =>
  isStudentMobilePrimaryRoute.value && studentPrimaryRoutesWithOwnHeader.has(route.path),
)
const showStudentMobileAppHeader = computed(() =>
  isStudentMobilePrimaryRoute.value && !hasStudentPrimaryOwnHeader.value,
)

const hiddenBookHeaderRoutes = new Set([
  '/app/dashboard',
  '/app/exams',
  '/app/student/favorites',
  '/app/messages',
  '/app/student/learning',
  '/app/student/my-reports',
  '/app/student/ai-assistant',
])

const hideBookHeader = computed(() => hiddenBookHeaderRoutes.has(route.path))

const breadcrumbs = computed(() => {
  const items = route.matched
    .map(r => String(r.meta.title ?? ''))
  .filter(Boolean)
  if (items.length === 0) return ['AI职涯规划']
  if (route.path.startsWith('/app')) {
    return ['应用', ...items]
  }
  return items
})

// 学生菜单（按职业决策主路径分组排序；顶栏以分隔线呈现分组）
const studentMenus = [
  { index: '/app/dashboard', icon: ICONS.home, title: '首页' },
  // ── 职业探索 ──
  { index: '/app/student/career-analysis', icon: ICONS.target, title: '职业分析' },
  { index: '/app/student/career-navigation', icon: ICONS.route, title: '职途导航' },
  // ── 能力成长 ──
  { index: '/app/exams', icon: ICONS.checkSquare, title: '技能自评' },
  { index: '/app/student/skill-graph', icon: ICONS.layers, title: '技能图谱' },
  { index: '/app/student/learning', icon: ICONS.trendingUp, title: '技能提升' },
  // ── 成果追踪 ──
  { index: '/app/student/my-reports', icon: ICONS.fileText, title: '我的报告' },
  { index: '/app/student/favorites', icon: ICONS.bookmark, title: '心仪岗位' },
  // ── 助手（横切能力，置于末位）──
  { index: '/app/student/ai-assistant', icon: ICONS.bot, title: 'AI 工作台' },
]

// 管理员菜单
const adminMenus = [
  { index: '/app/dashboard', icon: ICONS.home, title: '首页' },
  { index: '/app/admin/job-dataset', icon: ICONS.database, title: '岗位数据集' },
  { index: '/app/admin/knowledge-base', icon: ICONS.bookOpen, title: '知识库维护' },
]

// 通用菜单（兼容未登录或其他角色）
const commonMenus = [
  { index: '/app/messages', icon: ICONS.inbox, title: '消息' },
  { index: '/app/profile', icon: ICONS.user, title: '个人中心' },
]

// 当前角色菜单
const currentMenus = computed(() => {
  if (isStudent.value) return studentMenus
  if (isAdmin.value) return adminMenus
  return commonMenus
})


// 顶栏分组分隔线：职业探索 / 能力成长 / 成果追踪 / 助手
const NAV_SEP_BEFORE = new Set([
  '/app/student/career-analysis',
  '/app/exams',
  '/app/student/my-reports',
  '/app/student/ai-assistant',
])

const cloudTabs = computed(() => {
  const tabs: { key: string; label: string }[] = []
  for (const m of currentMenus.value) {
    if (isStudent.value && NAV_SEP_BEFORE.has(m.index)) {
      tabs.push({ key: `__sep-${m.index}`, label: '' })
    }
    tabs.push({ key: m.index, label: m.title })
  }
  return tabs
})

/* ===== 页面入场动效 ===== */
const prefersReduced = ref(false)

function onImmersiveLeave(el: Element, done: () => void) {
  if (prefersReduced.value) { done(); return }
  const h = el as HTMLElement
  h.style.position = 'absolute'
  h.style.inset = '0'
  gsap.to(h, { opacity: 0, x: -60, duration: 0.3, ease: 'power2.in', onComplete: done })
}

function onImmersiveEnter(el: Element, done: () => void) {
  if (prefersReduced.value) { done(); return }
  gsap.fromTo(el,
    { opacity: 0, x: 60 },
    { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out', clearProps: 'opacity,transform', onComplete: done },
  )
}

/* ===== 生命周期 ===== */
const shellRef = ref<HTMLElement | null>(null)
let gsapCtx: ReturnType<typeof gsap.context> | null = null

onMounted(() => {
  themeStore.initTheme()
  prefersReduced.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (shellRef.value && !prefersReduced.value) {
    gsapCtx = gsap.context(() => {
      gsap.from('.book-main-area', {
        opacity: 0, y: 10,
        duration: 0.28, ease: 'power2.out', delay: 0.04,
        clearProps: 'opacity,transform',
      })
    }, shellRef.value)
  }
})

onBeforeUnmount(() => {
  gsapCtx?.revert()
})
</script>

<template>
  <div ref="shellRef" class="book-shell" :class="{ 'book-shell--immersive': isImmersiveRoute, 'book-shell--dashboard': isStudent && route.path === '/app/dashboard', 'book-shell--student-main': isStudentMobilePrimaryRoute, 'book-shell--student-own-header': hasStudentPrimaryOwnHeader }">
    <div
      v-if="!isImmersiveRoute || route.meta.keepTopNav || showStudentMobileAppHeader"
      class="top-row"
      :class="{ 'top-row--mobile-only': isImmersiveRoute && showStudentMobileAppHeader && !route.meta.keepTopNav }"
    >
      <div
        class="top-row__brand"
        role="button"
        tabindex="0"
        title="回到首页"
        @click="router.push('/app/dashboard')"
        @keydown.enter="router.push('/app/dashboard')"
      >
        <StarMark :size="30" class="top-row__mark" />
        <span class="top-row__name">职导星图</span>
      </div>

      <CloudTabNav
        class="top-row__nav"
        v-model="activeTabKey"
        :tabs="cloudTabs"
      />

      <UserInfoBar />
    </div>
    <div class="book-main-area" :class="{ 'book-main-area--immersive': isImmersiveRoute }">
      <header v-if="!isImmersiveRoute && !hideBookHeader" class="book-header">
        <div class="book-header__left">
          <div class="book-header__chapter">
            <span class="book-header__breadcrumb">
              <template v-for="(item, index) in breadcrumbs" :key="`${item}-${index}`">
                <span :class="{ 'is-current': index === breadcrumbs.length - 1 }">{{ item }}</span>
                <span v-if="index < breadcrumbs.length - 1" class="book-header__sep">·</span>
              </template>
            </span>
          </div>
        </div>
      </header>
      <main v-if="!isImmersiveRoute" class="book-content">
        <BookPage>
          <div class="page-turn-perspective">
            <router-view v-slot="{ Component }">
              <Transition name="page-fade" mode="out-in">
                <component :is="Component" :key="route.fullPath" />
              </Transition>
            </router-view>
          </div>
        </BookPage>
      </main>

      <main v-else class="immersive-stage">
        <router-view :key="route.fullPath" v-slot="{ Component }">
          <Transition :css="false" @enter="onImmersiveEnter" @leave="onImmersiveLeave">
            <component :is="Component" />
          </Transition>
        </router-view>
      </main>
    </div>

    <nav v-if="isStudentMobilePrimaryRoute" class="student-mobile-tabbar" aria-label="学生主导航">
      <RouterLink
        v-for="tab in studentMobileTabs"
        :key="tab.path"
        :to="tab.path"
        class="student-mobile-tab"
        :class="{ 'is-active': route.path === tab.path }"
        :aria-current="route.path === tab.path ? 'page' : undefined"
      >
        <Icon :icon="tab.icon" :width="20" aria-hidden="true" />
        <span>{{ tab.label }}</span>
      </RouterLink>
    </nav>

    <!-- ===== 移动端抽屉 ===== -->
    <el-drawer v-if="!isImmersiveRoute" v-model="drawerOpen" direction="ltr" size="82%" :with-header="false" class="mobile-drawer">
      <div class="drawer">
        <div class="drawer__brand" @click="router.push('/app/dashboard')" role="button" tabindex="0">
          <StarMark :size="40" class="drawer__logo" />
          <div>
            <div class="drawer__name">职导星图</div>
            <div class="drawer__desc">让每个「如果」看见结果</div>
          </div>
        </div>
        <div class="drawer__user">
          <el-avatar :size="46" :src="userStore.currentUser?.avatar" />
          <div class="drawer__user-text">
            <div class="drawer__user-name">{{ userStore.currentUser?.name }}</div>
            <div class="drawer__user-role">{{ userRole === 'student' ? '学生' : '管理员' }}</div>
          </div>
          <button class="drawer__close" @click="drawerOpen = false" aria-label="关闭菜单">
            <Icon :icon="ICONS.close" />
          </button>
        </div>
        <el-menu class="drawer__menu" :default-active="activeMenu" router>
          <el-menu-item v-for="menu in currentMenus" :key="menu.index" :index="menu.index">
            <AgentMark v-if="menu.index === '/app/student/ai-assistant'" :size="20" class="menu-icon" />
            <Icon v-else :icon="menu.icon" class="menu-icon" />
            <span>{{ menu.title }}</span>
          </el-menu-item>
        </el-menu>
        <div class="drawer__footer" />
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
/* ═══ 现代布局 ═══ */
.book-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-100);
  overflow: hidden;
  position: relative;
}

.top-row {
  min-height: 58px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  position: relative;
  z-index: 4;
  flex-shrink: 0;
  overflow: visible;
  background: color-mix(in srgb, var(--color-background) 88%, var(--color-surface) 12%);
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent 30%);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.85), 0 8px 24px rgba(17, 24, 39, 0.04);
  backdrop-filter: blur(12px);
}

/* 品牌锚点：星形字标 + 衬线品名 */
.top-row__brand {
  display: flex; align-items: center; gap: 8px;
  padding-right: 14px; flex-shrink: 0; cursor: pointer;
  border-right: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent 30%);
}
.top-row__mark { color: var(--color-primary, #be2a00); }
.top-row__name {
  font-family: var(--font-title); font-size: 15px; font-weight: 600;
  color: var(--color-text); letter-spacing: 0.02em;
}

.top-row__nav {
  flex: 0 1 auto;
  width: fit-content;
  min-width: 0;
  max-width: 100%;
  margin-right: auto;
}

.book-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  z-index: 1;
}

.book-main-area--immersive {
  background: var(--bg-200);
}

/* ═══ 页眉栏 ═══ */
.book-header {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 65%, transparent 35%);
  background: color-mix(in srgb, var(--color-surface) 96%, var(--bg-200) 4%);
  flex-shrink: 0;
  position: relative;
  z-index: 3;
}

.book-header__left {
  display: flex;
  align-items: center;
  min-width: 0;
}

.book-header__chapter {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--color-text-muted);
  letter-spacing: 0.01em;
}

.book-header__breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
}

.book-header__breadcrumb .is-current {
  color: var(--color-text);
  font-weight: 600;
}

.book-header__sep {
  opacity: 0.4;
  margin: 0 2px;
}

.book-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.book-content :deep(.book-page) {
  height: 100%;
}


.page-turn-perspective {
  width: 100%;
  height: 100%;
}

/* Student home only: warm editorial header, isolated from all other routes. */
.book-shell--dashboard .top-row {
  min-height: 60px;
  padding: 8px 4.1%;
  gap: 14px;
  background: rgba(255, 253, 250, .96);
  border-bottom-color: rgba(76, 60, 44, .08);
  box-shadow: none;
  backdrop-filter: blur(10px);
}
.book-shell--dashboard .top-row__brand { gap: 10px; padding-right: 20px; }
.book-shell--dashboard .top-row__brand:focus-visible {
  outline: 2px solid #bd3714;
  outline-offset: 4px;
  border-radius: 8px;
}
.book-shell--dashboard :deep(.uib__msg-btn:focus-visible),
.book-shell--dashboard :deep(.uib__card:focus-visible) {
  outline: 2px solid #bd3714;
  outline-offset: 2px;
}
.book-shell--dashboard .top-row__name { font-size: 17px; letter-spacing: .03em; }
.book-shell--dashboard .book-content { overflow: hidden; background: #f5f1ec; }
.book-shell--dashboard .book-content :deep(.book-page),
.book-shell--dashboard .book-content :deep(.book-page__body) { background: transparent; }
.book-shell--dashboard .book-content :deep(.book-page__body) { scrollbar-color: #d9cfc4 transparent; }
.book-shell--dashboard :deep(.cloud-nav) {
  gap: 2px;
  min-height: 42px;
  padding: 3px;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}
.book-shell--dashboard :deep(.cloud-tab) { height: 38px; padding: 0 15px; border-radius: 22px; }
.book-shell--dashboard :deep(.cloud-tab.is-active) {
  color: #bd3714;
  border-color: transparent;
  background: #fbede7;
  box-shadow: none;
}
.book-shell--dashboard :deep(.cloud-tab.is-active .cloud-label) { color: #bd3714; }
.book-shell--dashboard :deep(.cloud-tab:focus-visible) { outline-color: #bd3714; }
.book-shell--dashboard :deep(.cloud-sep) { height: 18px; margin: 0 7px; background: rgba(95, 77, 60, .1); }
.book-shell--dashboard :deep(.uib__msg-btn) { background: transparent; }
.book-shell--dashboard :deep(.uib__msg-btn):hover { color: #bd3714; background: #fbede7; }

.student-mobile-tabbar { display: none; }
.top-row--mobile-only { display: none; }

/* 路由切换过渡 */
.page-fade-enter-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.page-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.page-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .page-fade-enter-active,
  .page-fade-leave-active {
    transition: none;
  }
}


.immersive-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}


/* ═══ 移动端抽屉 ═══ */
.drawer {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.drawer__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 12px;
  border-bottom: 1px solid var(--bg-300);
}

.drawer__logo {
  width: 40px;
  height: 40px;
  flex: none;
  color: var(--color-primary, #be2a00);
}

.drawer__name {
  font-family: var(--font-title);
  font-weight: 600;
  font-size: 14px;
}

.drawer__desc {
  font-size: 11px;
  color: var(--text-300);
  font-family: var(--font-accent);
  letter-spacing: 0.02em;
  margin-top: 2px;
}

.drawer__user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--bg-300);
}

.drawer__user-text {
  flex: 1;
  min-width: 0;
}

.drawer__user-name {
  font-weight: 600;
  font-size: 14px;
}

.drawer__user-role {
  font-size: 12px;
  color: var(--text-200);
  margin-top: 2px;
}

.drawer__close {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 1px solid var(--bg-300);
  background: transparent;
  cursor: pointer;
}

.drawer__menu {
  border-right: 0;
  padding: 6px;
  flex: 1;
}

.drawer__menu :deep(.el-menu-item) {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drawer__menu :deep(.el-menu-item .menu-icon) {
  font-size: 20px;
}

.drawer__footer {
  padding: 12px;
}

/* ═══ 响应式 ═══ */

@media (max-width: 767px) {
  .book-shell--student-main {
    height: 100vh;
    height: 100dvh;
  }

  .top-row {
    min-height: 0;
    padding: 10px 12px;
    gap: 10px;
    flex-wrap: wrap;
  }

  .top-row--mobile-only {
    display: flex;
    flex-wrap: nowrap;
  }

  .top-row__nav {
    flex-basis: 100%;
    width: 100%;
    max-width: 100%;
    margin-right: 0;
  }

  .book-shell--student-main .top-row {
    padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 10px;
    flex-wrap: nowrap;
  }

  .book-shell--student-main .top-row__brand {
    gap: 7px;
    padding-right: 0;
    border-right: 0;
  }

  .book-shell--student-main .top-row__name { font-size: 14px; }

  .book-shell--student-main .top-row__nav {
    display: none;
  }

  .book-shell--student-main :deep(.uib__msg-btn) {
    width: 44px;
    height: 44px;
  }

  .book-shell--student-main :deep(.uib__card) {
    min-height: 44px;
  }

  .book-shell--student-main .book-main-area {
    padding-bottom: calc(62px + env(safe-area-inset-bottom, 0px));
  }

  .book-shell--student-own-header .book-main-area {
    padding-top: env(safe-area-inset-top, 0px);
  }

  .student-mobile-tabbar {
    position: fixed;
    z-index: 30;
    right: 0;
    bottom: 0;
    left: 0;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    min-height: 62px;
    padding: 5px 6px calc(5px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid rgba(76, 60, 44, .1);
    background: rgba(255, 253, 250, .97);
    box-shadow: 0 -5px 20px rgba(66, 48, 31, .06);
    backdrop-filter: blur(14px);
  }

  .student-mobile-tab {
    display: flex;
    min-width: 0;
    min-height: 44px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    border-radius: 10px;
    color: #8b8984;
    font-size: 10px;
    line-height: 1.1;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
  }

  .student-mobile-tab.is-active { color: #bd3714; font-weight: 650; }
  .student-mobile-tab:active { background: #fbede7; }
  .student-mobile-tab:focus-visible { outline: 2px solid #bd3714; outline-offset: -2px; }

  .book-header {
    padding: 0 12px;
    height: 36px;
  }
  .book-shell--dashboard .top-row { padding-bottom: 8px; }
}

@media (min-width: 768px) {
  .top-row--mobile-only { display: none; }
}

/* ═══ 打印覆盖：解除父容器高度/溢出裁剪，让子页面完整输出 ═══ */
@media print {
  .book-shell {
    display: block !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }
  .book-shell::before { display: none !important; }
  .top-row,
  .book-header { display: none !important; }
  .book-main-area {
    display: block !important;
    height: auto !important;
    max-height: none !important;
    min-height: 0 !important;
    overflow: visible !important;
  }
  .book-content {
    display: block !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }
  .book-content :deep(.book-page),
  .book-content :deep(.book-page__body),
  .book-content :deep(.book-page__spine),
  .book-content :deep(.book-page__footer) {
    display: block !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }
  .page-turn-perspective {
    display: block !important;
    height: auto !important;
  }
  .immersive-stage {
    display: block !important;
    height: auto !important;
    max-height: none !important;
    min-height: 0 !important;
    overflow: visible !important;
  }
}
</style>
