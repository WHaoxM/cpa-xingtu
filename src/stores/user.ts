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
    let authGeneration = 0
    let cookieChangePending = false
    let cookieCheck: { generation: number; promise: Promise<void> } | null = null
    const isLoggedIn = computed(() => !!currentUser.value && !!token.value)

    // Getters
    const userRole = computed(() => currentUser.value?.role || null)
    const isStudent = computed(() => currentUser.value?.role === UserRole.STUDENT)
    const isAdmin = computed(() => currentUser.value?.role === UserRole.ADMIN)

    function applySession(user: User): void {
      currentUser.value = user
      token.value = httpAuth ? 'cookie-session' : `mock_token_${user.id}_${Date.now()}`
    }

    function beginCookieChange(): number {
      authGeneration += 1
      cookieChangePending = true
      cookieCheck = null
      lastCookieCheckAt = 0
      return authGeneration
    }

    /** Preferred: fixture/auth API. Falls back to inline mockUsers. */
    async function loginAsync(
      username: string,
      password: string,
      role?: UserRole,
    ): Promise<boolean> {
      const generation = httpAuth ? beginCookieChange() : authGeneration
      try {
        const user = await loginLocal(username, password)
        if (httpAuth && generation !== authGeneration) return false
        if (user && (httpAuth || !role || user.role === role)) {
          applySession(user)
          return true
        }
      } catch (error) {
        if (httpAuth) throw error
      } finally {
        if (httpAuth && generation === authGeneration) cookieChangePending = false
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
      const generation = httpAuth ? beginCookieChange() : authGeneration
      try {
        if (httpAuth) await logoutAccount()
        if (generation !== authGeneration) return
        currentUser.value = null
        token.value = ''
        lastCookieCheckAt = 0
      } finally {
        if (generation === authGeneration) cookieChangePending = false
      }
    }

    async function refreshCookieSession(): Promise<void> {
      if (!httpAuth || cookieChangePending) return
      const generation = authGeneration
      if (cookieCheck?.generation === generation) return cookieCheck.promise
      if (Date.now() - lastCookieCheckAt < 5_000) return
      const check = (async () => {
        try {
          const user = await currentAccount()
          if (generation === authGeneration) applySession(user)
        } catch {
          if (generation === authGeneration) {
            currentUser.value = null
            token.value = ''
          }
        } finally {
          if (generation === authGeneration) lastCookieCheckAt = Date.now()
        }
      })()
      cookieCheck = { generation, promise: check }
      try { await check } finally {
        if (cookieCheck?.promise === check) cookieCheck = null
      }
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
