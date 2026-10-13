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
  <div ref="shellRef" class="book-shell" :class="{ 'book-shell--immersive': isImmersiveRoute }">
    <div v-if="!isImmersiveRoute || route.meta.keepTopNav" class="top-row">
      <div
        class="top-row__brand"
        role="button"
        tabindex="0"
        title="回到首页"
        @click="router.push('/app/dashboard')"
        @keydown.enter="router.push('/app/dashboard')"
      >
        <span class="top-row__seal">职</span>
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

    <!-- ===== 移动端抽屉 ===== -->
    <el-drawer v-if="!isImmersiveRoute" v-model="drawerOpen" direction="ltr" size="82%" :with-header="false" class="mobile-drawer">
      <div class="drawer">
        <div class="drawer__brand" @click="router.push('/app/dashboard')" role="button" tabindex="0">
          <img class="drawer__logo" src="/AstroLogo.png" alt="AstroGraph">
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

/* 品牌锚点：朱砂印 + 衬线品名 */
.top-row__brand {
  display: flex; align-items: center; gap: 8px;
  padding-right: 14px; flex-shrink: 0; cursor: pointer;
  border-right: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent 30%);
}
.top-row__seal {
  width: 26px; height: 26px; display: grid; place-items: center;
  background: var(--color-primary); color: #fff;
  font-family: var(--font-title); font-size: 14px; font-weight: 600;
  border-radius: 6px;
}
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
  display: grid;
  place-items: center;
  font-weight: 600;
  font-family: var(--font-title);
  color: var(--primary-100);
  border: 2px solid var(--primary-100);
  font-size: 16px;
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
  .top-row {
    min-height: 0;
    padding: 10px 12px;
    gap: 10px;
    flex-wrap: wrap;
  }

  .top-row__nav {
    flex-basis: 100%;
    width: 100%;
    max-width: 100%;
    margin-right: 0;
  }

  .book-header {
    padding: 0 12px;
    height: 36px;
  }
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
