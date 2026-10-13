import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types'
import { UserRole } from '@/types'
import { mockUsers } from '@/mock/data'
import { loginLocal } from '@/api/auth'

const backendDev = import.meta.env.MODE === 'backend-dev'

export const useUserStore = defineStore(
  'user',
  () => {
    // State
    const currentUser = ref<User | null>(null)
    const token = ref<string>('')
    const isLoggedIn = computed(() => !!currentUser.value && !!token.value)

    // Getters
    const userRole = computed(() => currentUser.value?.role || null)
    const isStudent = computed(() => currentUser.value?.role === UserRole.STUDENT)
    const isAdmin = computed(() => currentUser.value?.role === UserRole.ADMIN)

    function applySession(user: User): void {
      currentUser.value = user
      token.value = `mock_token_${user.id}_${Date.now()}`
    }

    /** Preferred: fixture/auth API. Falls back to inline mockUsers. */
    async function loginAsync(
      username: string,
      password: string,
      role?: UserRole,
    ): Promise<boolean> {
      try {
        const user = await loginLocal(username, password)
        if (user && (!role || user.role === role)) {
          applySession(user)
          return true
        }
      } catch {
        /* fall through */
      }
      if (backendDev) return false
      return login(username, password, role)
    }

    function login(username: string, password: string, role?: UserRole): boolean {
      if (backendDev) return false
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

    function logout(): void {
      currentUser.value = null
      token.value = ''
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
      loginByRole,
      logout,
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
