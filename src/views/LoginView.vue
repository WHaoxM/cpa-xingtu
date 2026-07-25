<!-- 页面：登录；路由：/login（login） -->

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ICONS } from '@/constants/icons'
import { useUserStore } from '@/stores'
import { UserRole } from '@/types'
import { isMockMode } from '@/api/config'
import { gsap } from '@/plugins/gsap'

const router = useRouter()
const userStore = useUserStore()
const mockMode = isMockMode()

const username = ref('')
const password = ref('')
const selectedRole = ref<UserRole>(UserRole.STUDENT)
const loading = ref(false)
const showPassword = ref(false)

const roleTabs = [
  { role: UserRole.STUDENT, icon: ICONS.graduationCap, label: '学生', color: '#10B981' },
]

const quickLogins = [
  { role: UserRole.STUDENT, account: 'student001', name: '学生体验' },
]

const features = [
  { name: '能力图谱', desc: '量化 6 维度职业能力，定位真实短板' },
  { name: '岗位匹配', desc: '解析简历，精准推荐目标岗位' },
  { name: '路径规划', desc: '课程→实践→求职的时间线' },
  { name: '简历诊断', desc: '对标岗位，给出差距建议' },
]

async function handleLogin() {
  if (!username.value.trim() || !password.value.trim()) {
    ElMessage.warning('填个账号密码呗')
    return
  }

  loading.value = true
  await new Promise(resolve => setTimeout(resolve, 600))

  const success = await userStore.loginAsync(username.value, password.value, selectedRole.value)

  if (success) {
    ElMessage.success('进来了！')
    router.push('/app/dashboard')
  } else {
    ElMessage.error('账号或密码不对（默认：123456）')
  }

  loading.value = false
}

function quickLogin(role: UserRole, account: string) {
  username.value = account
  password.value = '123456'
  selectedRole.value = role
  handleLogin()
}

/* ===== 入场动画（与 HomeCenter reveal 同类） ===== */
const pageRef = ref<HTMLElement | null>(null)
let ctx: ReturnType<typeof gsap.context> | null = null

onMounted(() => {
  if (!pageRef.value) return

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReduced) return

  ctx = gsap.context(() => {
    const tl = gsap.timeline({ delay: 0.1 })

    tl.from('.stg', {
      opacity: 0, y: 18,
      stagger: 0.06, duration: 0.5, ease: 'power2.out',
    })

    tl.fromTo('.login-card', {
      opacity: 0, y: 18,
    }, {
      opacity: 1, y: 0,
      duration: 0.5, ease: 'power2.out',
    }, '-=0.3')

    tl.from('.f-stg', {
      opacity: 0, y: 10,
      stagger: 0.05, duration: 0.35, ease: 'power2.out',
    }, '-=0.2')

    tl.from('.feat-row', {
      opacity: 0, y: 8,
      duration: 0.4, ease: 'power2.out',
    }, '-=0.15')
  }, pageRef.value)
})

onBeforeUnmount(() => {
  ctx?.revert()
})
</script>





<template>
  <div ref="pageRef" class="login-page">
    <div class="login-center">
      <!-- 品牌标记 -->
      <div class="stg brand-mark">
        <Icon icon="lucide:compass" :width="16" class="brand-mark__icon" />
        <span class="brand-mark__text">识途 · 职业规划平台</span>
      </div>

      <div v-if="mockMode" class="stg mock-pill" title="VITE_API_MODE=mock：只读 fixtures，不请求后端">
        <Icon icon="lucide:database" :width="14" />
        <span>演示数据 · 无需后端</span>
      </div>

      <!-- 标题 -->
      <h1 class="stg login-headline">找到你的职业方向</h1>
      <p class="stg login-sub">从能力评估到路径落地</p>

      <!-- 表单卡片 -->
      <div class="login-card">
        <!-- 角色切换 -->
        <div class="f-stg role-tabs">
          <button
            v-for="tab in roleTabs"
            :key="tab.role"
            class="role-tab"
            :class="{ active: selectedRole === tab.role }"
            @click="selectedRole = tab.role"
          >
            <Icon :icon="tab.icon" class="tab-icon" />
            <span>{{ tab.label }}</span>
          </button>
        </div>

        <!-- 输入框 -->
        <div class="f-stg input-group">
          <div class="input-wrap">
            <Icon :icon="ICONS.user" class="input-icon" />
            <input v-model="username" type="text" placeholder="账号" class="custom-input" @keydown.enter="handleLogin" />
          </div>
          <div class="input-wrap">
            <Icon :icon="ICONS.lock" class="input-icon" />
            <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="密码" class="custom-input" @keydown.enter="handleLogin" />
            <button class="password-toggle" @click="showPassword = !showPassword">
              <Icon :icon="showPassword ? ICONS.eye : ICONS.eyeOff" />
            </button>
          </div>
        </div>

        <!-- 登录按钮 -->
        <button class="f-stg login-btn" :class="{ loading }" :disabled="loading" @click="handleLogin">
          <span v-if="!loading">登录</span>
          <span v-else>登录中...</span>
        </button>

        <!-- 快速体验 -->
        <div class="f-stg quick-section">
          <div class="quick-divider"><span>或快速体验</span></div>
          <div class="quick-buttons">
            <button v-for="item in quickLogins" :key="item.role" class="quick-btn" @click="quickLogin(item.role, item.account)">
              演示账号一键登录
            </button>
          </div>
        </div>

        <!-- 提示 -->
        <div class="f-stg login-hint">
          <span>演示账号 <strong>student001</strong> / <strong>123456</strong></span>
        </div>
      </div>

      <!-- 功能亮点 -->
      <div class="feat-row">
        <span v-for="(feat, i) in features" :key="feat.name" class="feat-pill" :title="feat.desc">
          <template v-if="i > 0"><span class="feat-sep">·</span></template>{{ feat.name }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ═══ 登录页（复用 HomeCenter 设计体系） ═══ */

.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: linear-gradient(168deg,
    color-mix(in srgb, var(--vermilion-100) 12%, var(--parchment-100) 88%) 0%,
    var(--parchment-100) 40%,
    color-mix(in srgb, var(--indigo-100) 8%, var(--parchment-100) 92%) 100%);
}

.login-center {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* --- 品牌标记（同 hc-section-label 规格） --- */
.brand-mark {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 12px;
}

.brand-mark__icon {
  color: var(--vermilion-500);
}

.brand-mark__text {
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-ui);
  color: var(--ink-500);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.mock-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--indigo-700, #3730a3);
  background: color-mix(in srgb, var(--indigo-100, #e0e7ff) 75%, #fff);
  border: 1px solid color-mix(in srgb, var(--indigo-300, #a5b4fc) 50%, transparent);
}

/* --- 标题（同 hc-hero__greeting 规格） --- */
.login-headline {
  font-size: 20px;
  font-weight: 500;
  font-family: var(--font-title);
  color: var(--ink-900);
  text-align: center;
  line-height: 1.3;
  margin: 0 0 6px;
}

.login-sub {
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--ink-500);
  text-align: center;
  margin: 0 0 24px;
  line-height: 1.6;
}

/* --- 表单卡片（同 hc-overview 规格） --- */
.login-card {
  width: 100%;
  padding: 28px;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1px solid var(--parchment-300);
  box-shadow: var(--shadow-sm);
}

/* --- 角色标签 --- */
.role-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.role-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  background: var(--parchment-200);
  border: 1px solid var(--parchment-300);
  border-radius: var(--radius-sm);
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--ink-500);
}

.role-tab:hover {
  background: var(--parchment-300);
}

.role-tab.active {
  background: color-mix(in srgb, var(--vermilion-500) 6%, var(--color-surface) 94%);
  border-color: color-mix(in srgb, var(--vermilion-300) 25%, var(--parchment-300) 75%);
  border-bottom-color: var(--vermilion-500);
  color: var(--vermilion-500);
  font-weight: 600;
}

.tab-icon { font-size: 20px; }

/* --- 输入框 --- */
.input-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  font-size: 17px;
  color: var(--ink-300);
  pointer-events: none;
}

.custom-input {
  width: 100%;
  padding: 12px 14px 12px 44px;
  background: var(--parchment-100);
  border: 1px solid var(--parchment-300);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-family: var(--font-ui);
  color: var(--ink-900);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.custom-input:focus {
  outline: none;
  border-color: var(--ink-300);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ink-300) 10%, transparent 90%);
}

.custom-input::placeholder { color: var(--parchment-500); }

.password-toggle {
  position: absolute;
  right: 14px;
  background: none;
  border: none;
  font-size: 16px;
  color: var(--ink-300);
  cursor: pointer;
  transition: color 0.2s;
}
.password-toggle:hover { color: var(--ink-700); }

/* --- 登录按钮（同 hc-guide__cta 规格） --- */
.login-btn {
  width: 100%;
  height: 42px;
  background: linear-gradient(135deg, var(--vermilion-500), var(--vermilion-700));
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-title);
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s, transform 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(190, 42, 0, 0.22);
}

.login-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--vermilion-700), var(--vermilion-900));
  box-shadow: 0 6px 20px rgba(190, 42, 0, 0.30);
  transform: translateY(-1px);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}

.login-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* --- 快速体验 --- */
.quick-section { margin-top: 20px; }

.quick-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--ink-300);
}

.quick-divider::before,
.quick-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--parchment-300);
}

.quick-buttons { display: flex; gap: 8px; }

.quick-btn {
  flex: 1;
  padding: 10px 8px;
  background: var(--parchment-200);
  border: 1px solid var(--parchment-300);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--ink-500);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}

.quick-btn:hover {
  background: color-mix(in srgb, var(--vermilion-500) 6%, var(--parchment-200) 94%);
  color: var(--vermilion-500);
  border-color: color-mix(in srgb, var(--vermilion-300) 30%, var(--parchment-300) 70%);
}

/* --- 提示 --- */
.login-hint {
  margin-top: 14px;
  text-align: center;
  font-size: 12px;
  color: var(--ink-300);
  font-family: var(--font-ui);
}

.login-hint strong {
  color: var(--ink-500);
  font-weight: 500;
}

/* --- 功能亮点 --- */
.feat-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 24px;
  flex-wrap: wrap;
}

.feat-pill {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-family: var(--font-ui);
  color: var(--ink-300);
  cursor: default;
}

.feat-sep {
  margin: 0 6px;
  color: var(--parchment-400);
}

/* ═══ 响应式 ═══ */
@media (max-width: 768px) {
  .login-page { padding: 20px; }
  .login-center { max-width: 100%; }
  .login-card { padding: 24px 20px; }
}

@media (max-width: 480px) {
  .login-page { padding: 16px; }
  .login-headline { font-size: 18px; }
  .login-card { padding: 20px 16px; border-radius: var(--radius-md); }
  .feat-pill { font-size: 10px; }
}
</style>

