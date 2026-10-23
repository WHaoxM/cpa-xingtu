import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'
import pinia from '@/stores/pinia'
import { useUserStore } from '@/stores'
import { ElMessage } from 'element-plus'
import { UserRole } from '@/types'
import { resolvePlatformRedirectUrl } from '@/utils/platformNavigation'

const APP_NAME = '职导星图'
const LANDING_PAGE_TITLE = '职导星图｜职业发展平台'

function getDocumentTitle(routeTitle: unknown): string | undefined {
  if (typeof routeTitle !== 'string' || !routeTitle.trim()) return undefined
  const title = routeTitle.trim()
  if (title === APP_NAME) return LANDING_PAGE_TITLE
  return `${title}｜${APP_NAME}`
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to, from, next) => {
  // Keep the marketing root on www, but send platform routes to the configured
  // app origin. The destination is supplied by deployment config, not embedded
  // in the frontend source.
  if (to.path !== '/') {
    const platformUrl = resolvePlatformRedirectUrl(
      import.meta.env.VITE_PLATFORM_ORIGIN,
      window.location.origin,
      to.fullPath,
    )
    if (platformUrl) {
      window.location.replace(platformUrl)
      return next(false)
    }
  }

  // 延迟获取 store，确保 pinia 已初始化
  const userStore = useUserStore(pinia)
  await userStore.refreshCookieSession()

  // 更新页面标题；
  const pageTitle = getDocumentTitle(to.meta.title)
  if (pageTitle) document.title = pageTitle

  // 检查是否是公开路由
  if (to.meta.public) {
    if (userStore.isLoggedIn && !to.meta.allowAuthenticated) {
      next('/app/dashboard')
    } else {
      next()
    }
    return
  }

  // 检查是否已登录
  if (!userStore.isLoggedIn) {
    next('/login')
    return
  }

  // 检查角色权限
  const required = (to.meta.roles ?? to.meta.role) as UserRole | UserRole[] | undefined
  const requiredRoles = Array.isArray(required) ? required : required ? [required] : []
  const currentRole = userStore.userRole
  if (requiredRoles.length > 0 && (!currentRole || !requiredRoles.includes(currentRole))) {
    ElMessage.error('您没有权限访问该页面')
    next('/app/dashboard')
    return
  }

  next()
})

export default router
