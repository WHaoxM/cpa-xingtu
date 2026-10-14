import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types'
import { UserRole } from '@/types'
import { mockUsers } from '@/mock/data'
import { currentAccount, loginLocal, logoutAccount, registerAccount } from '@/api/auth'
import { getApiMode } from '@/api/config'

const backendDev = import.meta.env.MODE === 'backend-dev'
const httpAuth = getApiMode() === 'http'

export const useUserStore = defineStore(
  'user',
  () => {
    // State
    const currentUser = ref<User | null>(null)
    const token = ref<string>('')
    let lastCookieCheckAt = 0
    let cookieCheck: Promise<void> | null = null
    const isLoggedIn = computed(() => !!currentUser.value && !!token.value)

    // Getters
    const userRole = computed(() => currentUser.value?.role || null)
    const isStudent = computed(() => currentUser.value?.role === UserRole.STUDENT)
    const isAdmin = computed(() => currentUser.value?.role === UserRole.ADMIN)

    function applySession(user: User): void {
      currentUser.value = user
      token.value = httpAuth ? 'cookie-session' : `mock_token_${user.id}_${Date.now()}`
    }

    /** Preferred: fixture/auth API. Falls back to inline mockUsers. */
    async function loginAsync(
      username: string,
      password: string,
      role?: UserRole,
    ): Promise<boolean> {
      try {
        const user = await loginLocal(username, password)
        if (user && (httpAuth || !role || user.role === role)) {
          applySession(user)
          return true
        }
      } catch (error) {
        if (httpAuth) throw error
      }
      if (httpAuth || backendDev) return false
      return login(username, password, role)
    }

    async function registerAsync(username: string, password: string, name: string): Promise<boolean> {
      if (!httpAuth) return false
      await registerAccount(username, password, name)
      try {
        if (await loginAsync(username, password, UserRole.STUDENT)) return true
      } catch (error) {
        const reason = error instanceof Error ? error.message : '账号服务暂不可用'
        throw new Error(`账号已创建，但自动登录失败：${reason}。请切换到登录重试`)
      }
      throw new Error('账号已创建，但自动登录失败。请切换到登录重试')
    }

    function login(username: string, password: string, role?: UserRole): boolean {
      if (httpAuth || backendDev) return false
      const user = mockUsers.find(u => {
        if (role && u.role !== role) return false
        return u.username === username
      })

      if (user && password === '123456') {
        applySession(user)
        return true
      }
      return false
    }

    function loginByRole(role: UserRole): boolean {
      if (backendDev) return false
      const user = mockUsers.find(u => u.role === role)
      if (user) {
        applySession(user)
        return true
      }
      return false
    }

    async function logout(): Promise<void> {
      if (httpAuth) await logoutAccount()
      currentUser.value = null
      token.value = ''
      lastCookieCheckAt = 0
    }

    async function refreshCookieSession(): Promise<void> {
      if (!httpAuth) return
      if (cookieCheck) return cookieCheck
      if (Date.now() - lastCookieCheckAt < 5_000) return
      cookieCheck = (async () => {
        try {
          applySession(await currentAccount())
        } catch {
          currentUser.value = null
          token.value = ''
        } finally {
          lastCookieCheckAt = Date.now()
        }
      })()
      try { await cookieCheck } finally { cookieCheck = null }
    }

    function updateUserInfo(info: Partial<User>): void {
      if (currentUser.value) {
        currentUser.value = { ...currentUser.value, ...info }
      }
    }

    function setUserStatus(status: 'active' | 'disabled'): void {
      if (currentUser.value) {
        currentUser.value.status = status
      }
    }

    return {
      currentUser,
      token,
      isLoggedIn,
      userRole,
      isStudent,
      isAdmin,
      login,
      loginAsync,
      registerAsync,
      loginByRole,
      logout,
      refreshCookieSession,
      updateUserInfo,
      setUserStatus,
    }
  },
  {
    persist: {
      key: 'user-store',
      storage: localStorage,
      pick: ['currentUser', 'token'],
    },
  },
)
