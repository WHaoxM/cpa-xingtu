<!-- 登录与学生注册；路由：/login -->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ICONS } from '@/constants/icons'
import { useUserStore } from '@/stores'
import { UserRole } from '@/types'
import { isMockMode } from '@/api/config'
import { ApiError } from '@/api/types'
import { gsap } from '@/plugins/gsap'
import showcaseImage from '../../design/login-left-showcase-v1.webp'

const router = useRouter()
const userStore = useUserStore()
const mockMode = isMockMode()
const compactViewport = ref(window.matchMedia('(max-width: 540px)').matches)

const username = ref('')
const password = ref('')
const displayName = ref('')
const registering = ref(!mockMode && compactViewport.value)
const selectedRole = ref<UserRole>(UserRole.STUDENT)
const loading = ref(false)
const showPassword = ref(false)
const submitLabel = computed(() => registering.value ? '创建学生账号' : '登录')

const roleTabs = [
  { role: UserRole.STUDENT, icon: ICONS.graduationCap, label: '学生' },
  { role: UserRole.ADMIN, icon: ICONS.settings, label: '管理员' },
]

const quickLogins = [
  { role: UserRole.STUDENT, account: 'student001' },
  { role: UserRole.ADMIN, account: 'admin001' },
].filter(() => mockMode)

const backendUsernamePattern = /^[A-Za-z0-9_.-]{3,50}$/

function setRegistering(next: boolean): void {
  if (mockMode || loading.value) return
  registering.value = next
  password.value = ''
  displayName.value = ''
  showPassword.value = false
}

function submitErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : '账号服务暂不可用，请稍后重试。'
  }
  if (error.kind === 'network') return error.message
  if (error.status === 401) return '账号或密码不正确，请检查后重试。'
  if (error.status === 409) {
    return registering.value
      ? '这个用户名已被使用，请换一个用户名。'
      : '当前账号会话状态已变化，请刷新页面后重试。'
  }
  if (error.status === 429) return '操作太频繁了，请稍后再试。'
  if (error.status === 503) return '账号服务暂不可用，请稍后重试。'
  if (error.status === 400 && /csrf/i.test(error.message)) {
    return '安全校验已过期，请刷新页面后重试。'
  }
  if (error.status === 400) return '登录信息未通过校验，请检查账号资料后重试。'
  return error.message || '账号服务暂不可用，请稍后重试。'
}

async function handleSubmit(): Promise<void> {
  if (loading.value) return

  const cleanUsername = username.value.trim()
  if (!cleanUsername || password.value.length === 0) {
    ElMessage.warning('请输入账号和密码。')
    return
  }
  if (!mockMode && !backendUsernamePattern.test(cleanUsername)) {
    ElMessage.warning('账号须为 3–50 位英文字母、数字、点、下划线或连字符。')
    return
  }
  if (!mockMode && (password.value.length < 12 || password.value.length > 128)) {
    ElMessage.warning('密码长度须为 12–128 位。')
    return
  }
  if (registering.value && displayName.value.trim().length > 100) {
    ElMessage.warning('姓名最多 100 个字符。')
    return
  }

  loading.value = true
  try {
    const success = registering.value
      ? await userStore.registerAsync(cleanUsername, password.value, displayName.value.trim())
      : await userStore.loginAsync(cleanUsername, password.value, mockMode ? selectedRole.value : undefined)

    if (!success) {
      ElMessage.error(mockMode ? '账号或密码不正确（演示密码：123456）。' : '登录未成功，请检查账号信息后重试。')
      return
    }

    ElMessage.success(registering.value ? '学生账号已创建并登录。' : '登录成功。')
    await router.push('/app/dashboard')
  } catch (error) {
    ElMessage.error(submitErrorMessage(error))
  } finally {
    loading.value = false
  }
}

function quickLogin(role: UserRole, account: string): void {
  if (!mockMode || loading.value) return
  username.value = account
  password.value = '123456'
  selectedRole.value = role
  void handleSubmit()
}

/* 入场动效只作渐进增强；减少动态效果时保持静态呈现。 */
const pageRef = ref<HTMLElement | null>(null)
let ctx: ReturnType<typeof gsap.context> | null = null

onMounted(() => {
  if (!pageRef.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  ctx = gsap.context(() => {
    gsap.timeline({ delay: 0.08 })
      .from('.hero-stagger', { opacity: 0, y: 14, stagger: 0.07, duration: 0.45, ease: 'power2.out' })
      .from('.showcase-frame', { opacity: 0, y: 12, duration: 0.5, ease: 'power2.out' }, '-=0.3')
      .from('.auth-panel', { opacity: 0, y: 12, duration: 0.45, ease: 'power2.out' }, '-=0.34')
  }, pageRef.value)
})

onBeforeUnmount(() => ctx?.revert())
</script>

<template>
  <main ref="pageRef" class="login-page">
    <div class="login-layout">
      <section class="hero-panel" aria-labelledby="hero-title">
        <img class="hero-background" :src="showcaseImage" alt="" aria-hidden="true" decoding="async" fetchpriority="high" />
        <div class="brand-lockup hero-stagger">
          <span class="brand-symbol" aria-hidden="true"><Icon icon="lucide:compass" :width="20" /></span>
          <span class="brand-name">职导星图</span>
          <span class="brand-divider" aria-hidden="true"></span>
          <span class="brand-caption">职业发展平台</span>
        </div>

        <div class="hero-copy">
          <p class="eyebrow hero-stagger"><span class="eyebrow-dot"></span> CAREER DEVELOPMENT PLATFORM</p>
          <h1 id="hero-title" class="hero-title hero-stagger">让<span class="hero-title__accent">职业成长</span>，每一步都有方向</h1>
          <p class="hero-description hero-stagger">从了解自己，到找到适合的职业路径</p>
          <span class="hero-rule hero-stagger" aria-hidden="true"></span>
        </div>

      </section>

      <section class="auth-panel" aria-labelledby="auth-title">
        <div class="auth-card">
          <div class="auth-brand" aria-label="职导星图">
            <span class="brand-symbol" aria-hidden="true"><Icon icon="lucide:compass" :width="19" /></span>
            <span>职导星图</span>
          </div>
          <div class="auth-heading">
            <div v-if="mockMode" class="mode-pill mode-pill--mock">
              <Icon icon="lucide:database" :width="14" />
              <span>演示模式 · 无需后端</span>
            </div>
            <h2 id="auth-title">{{ registering ? '开启你的成长旅程' : '欢迎回来' }}</h2>
            <p>{{ registering ? '创建学生账号，开始规划职业方向。' : '登录后继续探索适合你的职业方向。' }}</p>
          </div>

          <div v-if="!mockMode" class="auth-mode-switch" role="tablist" aria-label="账号操作">
            <button type="button" role="tab" :aria-selected="!registering" :class="{ active: !registering }" @click="setRegistering(false)">登录</button>
            <button type="button" role="tab" :aria-selected="registering" :class="{ active: registering }" @click="setRegistering(true)">注册学生账号</button>
          </div>

          <div v-if="mockMode && !registering" class="role-tabs" aria-label="演示角色">
            <button
              v-for="tab in roleTabs"
              :key="tab.role"
              type="button"
              class="role-tab"
              :class="{ active: selectedRole === tab.role }"
              :aria-pressed="selectedRole === tab.role"
              @click="selectedRole = tab.role"
            >
              <Icon :icon="tab.icon" class="tab-icon" />
              <span>{{ tab.label }}</span>
            </button>
          </div>

          <form class="auth-form" @submit.prevent="handleSubmit">
            <label v-if="registering && !compactViewport" class="field-wrap" for="display-name">
              <Icon icon="lucide:user-round" class="field-icon" aria-hidden="true" />
              <input
                id="display-name"
                v-model="displayName"
                type="text"
                name="name"
                autocomplete="name"
                maxlength="100"
                placeholder="姓名（选填）"
                class="custom-input"
                :disabled="loading"
              />
            </label>
            <label class="field-wrap" for="account-username">
              <Icon :icon="ICONS.user" class="field-icon" aria-hidden="true" />
              <input
                id="account-username"
                v-model="username"
                type="text"
                name="username"
                autocomplete="username"
                maxlength="50"
                autocapitalize="none"
                spellcheck="false"
                placeholder="用户名"
                class="custom-input"
                required
                :disabled="loading"
              />
            </label>
            <label class="field-wrap" for="account-password">
              <Icon :icon="ICONS.lock" class="field-icon" aria-hidden="true" />
              <input
                id="account-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                name="password"
                :autocomplete="registering ? 'new-password' : 'current-password'"
                maxlength="128"
                placeholder="密码"
                class="custom-input custom-input--password"
                required
                :disabled="loading"
              />
              <button
                type="button"
                class="password-toggle"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <Icon :icon="showPassword ? ICONS.eye : ICONS.eyeOff" />
              </button>
            </label>

            <p v-if="registering" class="form-note">用户名 3–50 位，仅限英文字母、数字、点、下划线和连字符；密码 12–128 位。</p>
            <button class="submit-btn" :class="{ loading }" :disabled="loading" type="submit">
              <span>{{ loading ? (registering ? '正在创建…' : '正在登录…') : submitLabel }}</span>
              <Icon v-if="!loading" icon="lucide:arrow-right" :width="17" aria-hidden="true" />
            </button>
          </form>

          <div v-if="quickLogins.length" class="quick-section">
            <div class="quick-divider"><span>或快速体验</span></div>
            <div class="quick-buttons">
              <button v-for="item in quickLogins" :key="item.role" type="button" class="quick-btn" :disabled="loading" @click="quickLogin(item.role, item.account)">
                <Icon :icon="item.role === UserRole.ADMIN ? ICONS.settings : ICONS.graduationCap" :width="15" />
                <span>{{ item.role === UserRole.ADMIN ? '体验管理端' : '体验学生端' }}</span>
              </button>
            </div>
            <p class="demo-hint">演示账号密码：<strong>123456</strong></p>
          </div>

          <p v-if="!mockMode && registering" class="account-note">管理员账号由平台管理员开通，不支持自助注册。</p>
          <p v-else-if="!mockMode" class="account-note">使用已开通的平台账号登录。</p>
          <p v-if="!mockMode" class="mobile-auth-switch">
            {{ registering ? '已有账号？' : '还没有账号？' }}
            <button type="button" @click="setRegistering(!registering)">{{ registering ? '返回登录' : '立即注册' }}</button>
          </p>
        </div>

        <p class="auth-legal">继续即表示你同意平台的服务条款与隐私说明。</p>
        <p class="auth-footer">© {{ new Date().getFullYear() }} 职导星图 · 陪伴每一段成长</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  min-height: 100svh;
  color: var(--ink-900);
  background: #fff;
}

.login-layout {
  width: 100%;
  min-height: 100vh;
  min-height: 100svh;
  display: grid;
  grid-template-columns: minmax(0, 2.05fr) minmax(400px, .95fr);
  align-items: stretch;
  gap: 0;
}

.hero-panel { position: relative; isolation: isolate; min-width: 0; min-height: 100vh; min-height: 100svh; display: flex; flex-direction: column; overflow: hidden; padding: clamp(31px, 4vw, 62px) clamp(32px, 5.1vw, 86px); background: var(--parchment-100); }
.hero-panel::after { position: absolute; z-index: -1; inset: 0; content: ''; background: linear-gradient(180deg, rgba(250, 248, 244, .94) 0%, rgba(250, 248, 244, .78) 22%, rgba(250, 248, 244, .16) 52%, rgba(250, 248, 244, .1) 100%), linear-gradient(90deg, rgba(250, 248, 244, .15), transparent 62%); }
.hero-background { position: absolute; z-index: -2; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 54%; }
.brand-lockup { position: relative; display: flex; align-items: center; gap: 10px; margin-bottom: clamp(27px, 4.5vh, 52px); }
.hero-copy, .brand-lockup { z-index: 0; }
.brand-symbol { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 11px; color: var(--vermilion-600, var(--vermilion-500)); background: color-mix(in srgb, var(--vermilion-100) 72%, white); }
.brand-name { font-family: var(--font-title); font-size: 16px; font-weight: 700; letter-spacing: .08em; }
.brand-divider { width: 1px; height: 16px; margin: 0 2px; background: var(--parchment-400); }
.brand-caption { color: var(--ink-500); font-size: 12px; letter-spacing: .08em; }

.hero-copy { max-width: 900px; }
.eyebrow { display: flex; align-items: center; gap: 9px; margin: 0 0 17px; color: var(--vermilion-600, var(--vermilion-500)); font: 700 10px/1.4 var(--font-ui); letter-spacing: .2em; }
.eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 12%, transparent); }
.hero-title { margin: 0; font: 600 clamp(36px, 3.8vw, 61px)/1.22 var(--font-title); letter-spacing: .015em; color: var(--ink-900); white-space: nowrap; }
.hero-title__accent { color: var(--vermilion-600, var(--vermilion-500)); }
.hero-description { margin: 12px 0 0; color: var(--ink-500); font: 15px/1.8 var(--font-ui); letter-spacing: .035em; }
.hero-rule { display: block; width: 54px; height: 2px; margin-top: 17px; background: var(--vermilion-500); }

.auth-panel { width: 100%; min-height: 100vh; min-height: 100svh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: clamp(25px, 4.3vw, 70px); background: #fff; }
.auth-card { width: min(100%, 492px); padding: clamp(28px, 3vw, 40px); border: 1px solid color-mix(in srgb, var(--parchment-400) 60%, white); border-radius: 17px; background: #fff; box-shadow: 0 15px 44px rgba(73, 50, 31, .065); }
.auth-brand { display: flex; align-items: center; justify-content: center; gap: 9px; margin-bottom: 22px; font: 700 15px/1.3 var(--font-title); letter-spacing: .07em; }
.auth-brand .brand-symbol { width: 30px; height: 30px; border-radius: 50%; }
.auth-heading { text-align: center; margin-bottom: 23px; }
.mode-pill { width: fit-content; display: flex; align-items: center; gap: 6px; margin: 0 auto 15px; padding: 6px 10px; border: 1px solid color-mix(in srgb, var(--vermilion-300) 38%, white); border-radius: 999px; color: var(--vermilion-700, var(--vermilion-500)); background: color-mix(in srgb, var(--vermilion-100) 44%, white); font: 600 11px/1 var(--font-ui); }
.mode-pill--mock { color: var(--indigo-700, #3730a3); border-color: color-mix(in srgb, var(--indigo-300, #a5b4fc) 40%, white); background: color-mix(in srgb, var(--indigo-100, #e0e7ff) 55%, white); }
.auth-heading h2 { margin: 0; font: 600 24px/1.4 var(--font-title); letter-spacing: .025em; }
.auth-heading p { margin: 6px 0 0; color: var(--ink-500); font: 13px/1.65 var(--font-ui); }

.auth-mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 20px; padding: 4px; border-radius: 10px; background: var(--parchment-200); }
.auth-mode-switch button { min-height: 38px; border: 0; border-radius: 7px; color: var(--ink-500); background: transparent; font: 600 13px/1.2 var(--font-ui); cursor: pointer; transition: color .18s, background .18s, box-shadow .18s; }
.auth-mode-switch button.active { color: var(--vermilion-700, var(--vermilion-500)); background: white; box-shadow: 0 2px 8px rgba(55, 44, 34, .09); }
.role-tabs { display: flex; gap: 9px; margin-bottom: 19px; }
.role-tab { flex: 1; min-height: 57px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 1px solid var(--parchment-300); border-radius: 10px; color: var(--ink-500); background: var(--parchment-100); font: 600 12px/1.2 var(--font-ui); cursor: pointer; transition: border-color .18s, color .18s, background .18s; }
.role-tab:hover { border-color: var(--vermilion-300); }
.role-tab.active { border-color: color-mix(in srgb, var(--vermilion-500) 43%, white); color: var(--vermilion-700, var(--vermilion-500)); background: color-mix(in srgb, var(--vermilion-100) 37%, white); }
.tab-icon { font-size: 19px; }

.auth-form { display: flex; flex-direction: column; gap: 13px; }
.field-wrap { position: relative; display: flex; align-items: center; min-width: 0; }
.field-icon { position: absolute; left: 14px; z-index: 1; color: var(--ink-300); font-size: 17px; pointer-events: none; }
.custom-input { width: 100%; min-height: 49px; padding: 12px 14px 12px 43px; border: 1px solid var(--parchment-300); border-radius: 9px; outline: none; color: var(--ink-900); background: color-mix(in srgb, var(--parchment-100) 68%, white); font: 14px/1.4 var(--font-ui); transition: border-color .18s, box-shadow .18s, background .18s; }
.custom-input--password { padding-right: 48px; }
.custom-input::placeholder { color: var(--ink-300); }
.custom-input:hover:not(:disabled) { border-color: var(--parchment-400); }
.custom-input:focus { border-color: var(--vermilion-500); background: white; box-shadow: 0 0 0 3px color-mix(in srgb, var(--vermilion-500) 15%, transparent); }
.custom-input:disabled { opacity: .65; }
.password-toggle { position: absolute; right: 6px; display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 7px; color: var(--ink-500); background: transparent; font-size: 17px; cursor: pointer; }
.password-toggle:hover { color: var(--vermilion-600, var(--vermilion-500)); background: var(--parchment-200); }
.form-note { margin: -3px 0 1px; color: var(--ink-500); font: 11px/1.6 var(--font-ui); }
.submit-btn { width: 100%; min-height: 50px; display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 5px; border: 0; border-radius: 9px; color: #fff; background: linear-gradient(110deg, var(--vermilion-500), var(--vermilion-700)); box-shadow: 0 8px 18px rgba(190, 42, 0, .2); font: 600 14px/1.2 var(--font-title); letter-spacing: .06em; cursor: pointer; transition: transform .18s, box-shadow .18s, filter .18s; }
.submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(190, 42, 0, .27); filter: saturate(1.06); }
.submit-btn:active:not(:disabled) { transform: translateY(0); }
.submit-btn:disabled { opacity: .67; cursor: wait; }

.quick-section { margin-top: 21px; }
.quick-divider { display: flex; align-items: center; gap: 11px; margin-bottom: 12px; color: var(--ink-300); font: 11px/1.2 var(--font-ui); }
.quick-divider::before, .quick-divider::after { content: ''; height: 1px; flex: 1; background: var(--parchment-300); }
.quick-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.quick-btn { min-height: 42px; display: flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--parchment-300); border-radius: 8px; color: var(--ink-500); background: white; font: 600 11px/1.2 var(--font-ui); cursor: pointer; transition: border-color .18s, color .18s, background .18s; }
.quick-btn:hover:not(:disabled) { border-color: var(--vermilion-300); color: var(--vermilion-600, var(--vermilion-500)); background: color-mix(in srgb, var(--vermilion-100) 25%, white); }
.quick-btn:disabled { opacity: .55; cursor: wait; }
.demo-hint { margin: 11px 0 0; text-align: center; color: var(--ink-300); font: 11px/1.4 var(--font-ui); }
.demo-hint strong { color: var(--ink-500); font-weight: 600; }
.account-note { margin: 17px 0 0; text-align: center; color: var(--ink-500); font: 11px/1.6 var(--font-ui); }
.auth-legal { margin: 17px 0 0; text-align: center; color: var(--ink-300); font: 10px/1.6 var(--font-ui); }
.auth-footer { margin: 23px 0 0; text-align: center; color: var(--ink-300); font: 10px/1.5 var(--font-ui); letter-spacing: .035em; }
.mobile-auth-switch { display: none; }

button:focus-visible { outline: 3px solid color-mix(in srgb, var(--vermilion-500) 48%, white); outline-offset: 2px; }

@media (max-width: 980px) {
  .login-layout { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .hero-panel { min-height: 590px; padding: 30px clamp(22px, 7vw, 70px) 25px; }
  .hero-panel::after { background: linear-gradient(180deg, rgba(250, 248, 244, .96) 0%, rgba(250, 248, 244, .78) 32%, rgba(250, 248, 244, .12) 72%, rgba(250, 248, 244, .25) 100%); }
  .hero-background { object-position: center 58%; }
  .brand-lockup { margin-bottom: 24px; }
  .hero-copy { text-align: center; margin: 0 auto; }
  .eyebrow { justify-content: center; }
  .hero-description { margin-left: auto; margin-right: auto; }
  .hero-title { white-space: normal; }
  .hero-rule { margin-left: auto; margin-right: auto; }
  .auth-panel { min-height: auto; padding: 36px clamp(22px, 7vw, 70px) 28px; }
  .auth-footer { margin-top: 16px; }
}

@media (max-width: 540px) {
  .login-layout { min-height: 100svh; display: block; }
  .hero-panel { display: none; }
  .auth-panel { min-height: 100svh; justify-content: flex-start; padding: 0 22px 28px; background: var(--parchment-100); }
  .auth-card { width: 100%; max-width: 460px; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .auth-brand { width: calc(100% + 44px); min-height: 68px; margin: 0 -22px; padding: 14px 18px; border-bottom: 1px solid var(--parchment-300); background: #fff; font-size: 16px; }
  .auth-heading { margin: clamp(90px, 20vh, 164px) 0 25px; }
  .auth-heading h2 { font-size: 23px; }
  .auth-heading p { font-size: 12px; }
  .mode-pill { display: none; }
  .auth-mode-switch, .role-tabs, .quick-section, .account-note, .auth-legal, .auth-footer { display: none; }
  .form-note { display: none; }
  .auth-form { gap: 14px; }
  .custom-input { min-height: 52px; border-radius: 7px; }
  .submit-btn { min-height: 54px; margin-top: 7px; border-radius: 7px; font-size: 15px; }
  .mobile-auth-switch { display: block; margin: 43px 0 0; text-align: center; color: var(--ink-500); font: 14px/1.5 var(--font-ui); }
  .mobile-auth-switch button { padding: 4px 1px; border: 0; color: var(--vermilion-500); background: transparent; font: 600 14px/1.5 var(--font-ui); cursor: pointer; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
</style>
