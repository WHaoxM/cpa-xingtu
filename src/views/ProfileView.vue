<!-- 页面：个人中心；路由：profile（profile） -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { EditPen } from '@element-plus/icons-vue'
import { Icon } from '@iconify/vue'
import { useUserStore } from '@/stores'
import {
  changeAccountPassword,
  getAccountProfile,
  getNotificationPreferences,
  saveAccountProfile,
  saveNotificationPreferences,
  type AccountProfile,
  type NotificationDraft,
  type NotificationPreferences,
  type ProfileDraft,
} from '@/api/accountProfile'
import { ApiError } from '@/api/types'
import { getApiMode } from '@/api/config'
import jiImg from '@/assets/images/ji.png'

const userStore = useUserStore()
const router = useRouter()
const isDemoMode = getApiMode() !== 'http'
const profileData = ref<AccountProfile | null>(null)
const profileLoading = ref(true)
const profileError = ref('')
const profileConflict = ref(false)
const profileSaving = ref(false)
const profileRevision = ref(0)
const form = reactive<ProfileDraft>({ name: '', email: '', phone: '', signature: '' })
const baseline = ref<ProfileDraft>({ ...form })

function formSnapshot(): ProfileDraft {
  return { name: form.name, email: form.email, phone: form.phone, signature: form.signature }
}

const profileDirty = computed(() => JSON.stringify(formSnapshot()) !== JSON.stringify(baseline.value))
const profileName = computed(() => profileData.value?.name || profileData.value?.username || '未提供')
const profileAccount = computed(() => profileData.value?.username || '未提供')
const avatarUrl = computed(() => userStore.currentUser?.avatar || jiImg)
const roleName = computed(() => {
  const role = profileData.value?.role
  if (role === 'student') return '学生'
  if (role === 'admin') return '管理员'
  if (role === 'teacher') return '教师'
  return '未提供'
})
const avatarInput = ref<HTMLInputElement | null>(null)

function syncUserStore(account: AccountProfile): void {
  userStore.updateUserInfo({
    name: account.name || account.username,
    email: account.email || '',
    phone: account.phone || undefined,
    signature: account.signature || undefined,
  })
}

function applyProfile(account: AccountProfile): void {
  profileData.value = account
  profileRevision.value = account.revision
  Object.assign(form, {
    name: account.name ?? '',
    email: account.email ?? '',
    phone: account.phone ?? '',
    signature: account.signature ?? '',
  })
  baseline.value = formSnapshot()
  profileConflict.value = false
  syncUserStore(account)
}

async function reloadProfile(): Promise<void> {
  profileLoading.value = true
  profileError.value = ''
  try {
    if (isDemoMode && !userStore.currentUser) {
      throw new ApiError('演示账号身份不可用，请重新登录。', 401)
    }
    const account = await getAccountProfile(userStore.currentUser)
    applyProfile(account)
  } catch (error) {
    profileError.value = error instanceof Error ? error.message : '读取账号资料失败，请重试。'
  } finally {
    profileLoading.value = false
  }
}

async function onSaveProfile(): Promise<void> {
  if (!profileData.value || !profileDirty.value) return
  profileSaving.value = true
  profileError.value = ''
  try {
    const saved = await saveAccountProfile(userStore.currentUser, formSnapshot(), profileRevision.value)
    applyProfile(saved)
    ElMessage.success(isDemoMode
      ? '演示资料已保存在此浏览器。'
      : '个人资料已保存并从账号记录回读。')
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      profileConflict.value = true
      ElMessage.warning('资料已被另一页面更新。你的编辑仍保留；刷新后再决定如何保存。')
    } else {
      profileError.value = error instanceof Error ? error.message : '保存失败，请重试。'
      ElMessage.error(profileError.value)
    }
  } finally {
    profileSaving.value = false
  }
}

function cancelProfileEdit(): void {
  Object.assign(form, baseline.value)
  profileConflict.value = false
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '未提供'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function accountStatus(value: string | null | undefined): string {
  if (value === 'active') return '正常'
  if (value === 'disabled') return '已停用'
  return '未提供'
}

function authMethod(value: AccountProfile['authMethod']): string {
  if (value === 'account_password') return '平台账号（用户名和密码）'
  if (value === 'demo_account') return '演示账号'
  return '未提供'
}

// Avatar storage is browser-local in demo mode only; HTTP accounts have no upload API.
const MAX_AVATAR_KB = 512
function triggerAvatarUpload(): void {
  if (isDemoMode) avatarInput.value?.click()
}

function onAvatarChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !isDemoMode) return
  if (file.size > MAX_AVATAR_KB * 1024) {
    ElMessage.warning(`头像文件不能超过 ${MAX_AVATAR_KB}KB，请压缩后重试`)
    input.value = ''
    return
  }
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('请选择图片文件')
    input.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    try {
      userStore.updateUserInfo({ avatar: reader.result as string })
      ElMessage.success('头像只保存在此浏览器的演示账号中。')
    } catch {
      ElMessage.error('头像未能保存在此浏览器。')
    }
  }
  reader.onerror = () => ElMessage.error('读取头像文件失败。')
  reader.readAsDataURL(file)
  input.value = ''
}

const notificationLoading = ref(true)
const notificationSaving = ref(false)
const notificationError = ref('')
const notificationConflict = ref(false)
const notificationState = ref<NotificationPreferences | null>(null)
const notificationRevision = ref(0)
const notificationDraft = reactive<NotificationDraft>({ email: null, system: null, sms: null })
const notificationBaseline = ref<NotificationDraft>({ ...notificationDraft })

function notificationSnapshot(): NotificationDraft {
  return { email: notificationDraft.email, system: notificationDraft.system, sms: notificationDraft.sms }
}

const notificationDirty = computed(() => JSON.stringify(notificationSnapshot())
  !== JSON.stringify(notificationBaseline.value))

function notificationLabel(value: boolean | null): string {
  if (value === null) return '未设置'
  return value ? '希望接收' : '不接收'
}

function channelLabel(channel: keyof NotificationDraft): string {
  const state = notificationState.value?.channels[channel]
  if (!state) return '状态未读取'
  return state.available ? '可用' : `未接入（${state.reason}）`
}

function applyNotificationState(state: NotificationPreferences): void {
  notificationState.value = state
  notificationRevision.value = state.revision
  Object.assign(notificationDraft, state.preferences)
  notificationBaseline.value = notificationSnapshot()
  notificationConflict.value = false
}

async function reloadNotificationPreferences(): Promise<void> {
  notificationLoading.value = true
  notificationError.value = ''
  try {
    const state = await getNotificationPreferences(userStore.currentUser)
    applyNotificationState(state)
  } catch (error) {
    notificationError.value = error instanceof Error ? error.message : '读取通知偏好失败，请重试。'
  } finally {
    notificationLoading.value = false
  }
}

async function saveNotificationDraft(): Promise<void> {
  if (!notificationDirty.value) return
  notificationSaving.value = true
  notificationError.value = ''
  try {
    const saved = await saveNotificationPreferences(
      userStore.currentUser, notificationSnapshot(), notificationRevision.value,
    )
    applyNotificationState(saved)
    ElMessage.success('接收偏好已保存。当前通道未接入，不会发送真实通知。')
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      notificationConflict.value = true
      ElMessage.warning('通知偏好已被另一页面更新。你的编辑仍保留，请先刷新核对。')
    } else {
      notificationError.value = error instanceof Error ? error.message : '保存偏好失败，请重试。'
      ElMessage.error(notificationError.value)
    }
  } finally {
    notificationSaving.value = false
  }
}

function cancelNotificationEdit(): void {
  Object.assign(notificationDraft, notificationBaseline.value)
  notificationConflict.value = false
}

const passwordDialog = ref(false)
const passwordSaving = ref(false)
const passwordForm = reactive({ current: '', next: '', confirmation: '' })

function openPasswordDialog(): void {
  if (!isDemoMode) passwordDialog.value = true
}

function resetPasswordForm(): void {
  passwordForm.current = ''
  passwordForm.next = ''
  passwordForm.confirmation = ''
}

async function submitPasswordChange(): Promise<void> {
  if (passwordForm.next.length < 12 || passwordForm.next.length > 128) {
    ElMessage.warning('新密码须为 12 至 128 个字符。')
    return
  }
  if (passwordForm.next !== passwordForm.confirmation) {
    ElMessage.warning('两次输入的新密码不一致。')
    return
  }
  passwordSaving.value = true
  try {
    await changeAccountPassword(passwordForm.current, passwordForm.next)
    passwordDialog.value = false
    ElMessage.info('密码已变更，所有登录设备都需要重新登录。')
    userStore.currentUser = null
    userStore.token = ''
    await router.replace('/login')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '密码未能变更，请重试。')
  } finally {
    passwordSaving.value = false
    resetPasswordForm()
  }
}

onBeforeRouteLeave(async () => {
  if (!profileDirty.value && !notificationDirty.value) return true
  try {
    await ElMessageBox.confirm('你有未保存的更改，离开页面会丢弃这些编辑。', '未保存的更改', {
      confirmButtonText: '放弃更改',
      cancelButtonText: '继续编辑',
      type: 'warning',
    })
    return true
  } catch {
    return false
  }
})

onMounted(async () => {
  await userStore.refreshCookieSession()
  await Promise.all([reloadProfile(), reloadNotificationPreferences()])
})
</script>



<template>
  <div class="page page--compact profile-page">
    <div class="profile-shell">
      <aside class="rail">
        <div class="panel rail__panel">
          <div class="user">
            <button class="user__avatar-wrap" type="button" :disabled="!isDemoMode"
              :title="isDemoMode ? '点击更换演示头像（仅保存在此浏览器）' : '当前账号接口不支持上传头像'"
              @click="triggerAvatarUpload">
              <el-avatar :size="56" :src="avatarUrl" />
              <div class="user__avatar-overlay">
                <Icon icon="lucide:camera" :width="18" />
                <span>更换</span>
              </div>
            </button>
            <input ref="avatarInput" type="file" accept="image/*" class="sr-only" @change="onAvatarChange" />
            <div class="user__meta">
              <div class="user__name">{{ profileName }}</div>
              <div class="user__account">{{ profileAccount }}</div>
              <div class="user__role">
                <el-tag size="small" effect="plain" round>{{ roleName }}</el-tag>
              </div>
            </div>
          </div>

          <div class="rail__actions">
            <el-button type="primary" :icon="EditPen" :loading="profileSaving"
              :disabled="!profileDirty || profileLoading || !profileData" @click="onSaveProfile">保存资料</el-button>
            <el-button :disabled="!profileDirty || profileSaving" @click="cancelProfileEdit">取消</el-button>
          </div>
        </div>

        <div class="panel rail__panel rail__panel--muted">
          <div class="rail__section-label">账号信息</div>
          <div v-if="profileLoading" class="kv__v" aria-live="polite">正在读取账号记录…</div>
          <el-alert v-else-if="profileError" :title="profileError" type="error" :closable="false" show-icon>
            <template #default>
              <el-button link type="primary" @click="reloadProfile">重试读取</el-button>
            </template>
          </el-alert>
          <template v-else-if="profileData">
          <div class="kv">
            <div class="kv__k">账号状态</div>
            <div class="kv__v">
              <span v-if="profileData.status === 'active'" class="kv__dot kv__dot--ok"></span>
              <span v-else-if="profileData.status === 'disabled'" class="kv__dot kv__dot--warn"></span>
              {{ accountStatus(profileData.status) }}
            </div>
          </div>
          <div class="kv">
            <div class="kv__k">当前角色</div>
            <div class="kv__v">{{ roleName }}</div>
          </div>
          <div class="kv">
            <div class="kv__k">登录方式</div>
            <div class="kv__v">{{ authMethod(profileData.authMethod) }}</div>
          </div>
          <div class="kv">
            <div class="kv__k">注册时间</div>
            <div class="kv__v">{{ formatTimestamp(profileData.createdAt) }}</div>
          </div>
          <div class="kv">
            <div class="kv__k">最近登录</div>
            <div class="kv__v">{{ formatTimestamp(profileData.lastLoginAt) }}</div>
          </div>
          </template>
        </div>

      </aside>

      <main class="main">
        <div class="panel">
          <div class="section-head">
            <div class="section-head__title">个人资料</div>
          </div>

          <div class="form-section">
            <div class="form-section__head">
              <div class="form-section__title">基本信息</div>
              <div class="form-section__desc">从账号记录读取；更改需保存后才会写入。联系邮箱与手机号不会在此完成验证。</div>
            </div>
            <el-alert v-if="profileConflict" title="资料版本已变化。你的编辑仍保留；刷新会读取服务器最新值。"
              type="warning" :closable="false" show-icon class="form-alert">
              <template #default><el-button link type="primary" @click="reloadProfile">刷新服务器资料</el-button></template>
            </el-alert>
            <el-form label-position="top" size="default" class="form">
              <div class="form-grid">
                <el-form-item label="姓名 / 显示名">
                  <el-input v-model="form.name" placeholder="未提供" maxlength="100"
                    :disabled="profileLoading || profileSaving || !profileData" />
                </el-form-item>
                <el-form-item label="联系邮箱（未验证）">
                  <el-input v-model="form.email" placeholder="未提供" maxlength="100"
                    :disabled="profileLoading || profileSaving || !profileData" />
                </el-form-item>
              </div>
              <div class="form-grid">
                <el-form-item label="手机号（未验证）">
                  <el-input v-model="form.phone" placeholder="未提供" maxlength="20"
                    :disabled="profileLoading || profileSaving || !profileData" />
                </el-form-item>
              </div>
              <el-form-item label="个性签名">
                <el-input v-model="form.signature" type="textarea" :rows="2" maxlength="255"
                  placeholder="未提供" :disabled="profileLoading || profileSaving || !profileData" />
              </el-form-item>
            </el-form>
            <div v-if="isDemoMode" class="form-section__desc">演示模式：资料只保存在当前浏览器，并按演示账号隔离；不代表真实账号记录。</div>
            <div v-if="profileDirty" class="dirty-note" role="status">有未保存更改</div>
            <div class="section-actions">
              <el-button type="primary" :loading="profileSaving" :disabled="!profileDirty || !profileData" @click="onSaveProfile">保存资料</el-button>
              <el-button :disabled="!profileDirty || profileSaving" @click="cancelProfileEdit">取消更改</el-button>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section__head">
              <div class="form-section__title">安全设置</div>
              <div class="form-section__desc">只显示当前账号服务实际提供的能力。</div>
            </div>
            <div class="pref-list">
              <button class="pref-row" type="button" :disabled="isDemoMode" @click="openPasswordDialog">
                <div class="pref-row__left">
                  <div class="pref-row__title">修改密码</div>
                  <div class="pref-row__meta">修改时间：{{ isDemoMode ? '演示账号不支持' : '系统未记录' }}</div>
                </div>
                <span v-if="isDemoMode" class="pref-row__meta">不可用</span>
                <span v-else class="pref-row__arrow">›</span>
              </button>
              <div class="pref-row pref-row--unavailable" aria-disabled="true">
                <div class="pref-row__left">
                  <div class="pref-row__title">两步验证</div>
                  <div class="pref-row__meta">当前账号体系尚未提供两步验证</div>
                </div>
                <el-tag size="small" type="info" effect="plain">不可用</el-tag>
              </div>
              <div class="pref-row pref-row--unavailable" aria-disabled="true">
                <div class="pref-row__left">
                  <div class="pref-row__title">登录设备管理</div>
                  <div class="pref-row__meta">当前账号体系不提供会话设备清单</div>
                </div>
                <el-tag size="small" type="info" effect="plain">不可用</el-tag>
              </div>
            </div>
            <div v-if="isDemoMode" class="form-section__desc">演示登录不连接真实凭据；密码变更仅在后端账号模式可用。</div>
          </div>

          <div class="form-section">
            <div class="form-section__head">
              <div class="form-section__title">通知偏好</div>
              <div class="form-section__desc">记录你的接收意愿。保存偏好不会订阅服务或发送通知。</div>
            </div>
            <el-alert v-if="notificationError" :title="notificationError" type="error" :closable="false" show-icon class="form-alert">
              <template #default><el-button link type="primary" @click="reloadNotificationPreferences">重试读取</el-button></template>
            </el-alert>
            <el-alert v-if="notificationConflict" title="通知偏好版本已变化。你的编辑仍保留；刷新会读取服务器最新值。"
              type="warning" :closable="false" show-icon class="form-alert">
              <template #default><el-button link type="primary" @click="reloadNotificationPreferences">刷新偏好</el-button></template>
            </el-alert>
            <div v-if="notificationLoading" class="pref-row__meta" aria-live="polite">正在读取通知偏好…</div>
            <div class="pref-list">
              <div class="pref-row notification-row" :aria-busy="notificationSaving">
                <div class="pref-row__left">
                  <div class="pref-row__title">邮件通知</div>
                  <div class="pref-row__meta">偏好：{{ notificationLabel(notificationDraft.email) }} · 通道：{{ channelLabel('email') }}</div>
                </div>
                <el-radio-group v-model="notificationDraft.email" size="small" :disabled="notificationLoading || notificationSaving || !notificationState">
                  <el-radio-button :value="null">未设置</el-radio-button>
                  <el-radio-button :value="true">希望接收</el-radio-button>
                  <el-radio-button :value="false">不接收</el-radio-button>
                </el-radio-group>
              </div>
              <div class="pref-row notification-row" :aria-busy="notificationSaving">
                <div class="pref-row__left">
                  <div class="pref-row__title">系统消息</div>
                  <div class="pref-row__meta">偏好：{{ notificationLabel(notificationDraft.system) }} · 通道：{{ channelLabel('system') }}</div>
                </div>
                <el-radio-group v-model="notificationDraft.system" size="small" :disabled="notificationLoading || notificationSaving || !notificationState">
                  <el-radio-button :value="null">未设置</el-radio-button>
                  <el-radio-button :value="true">希望接收</el-radio-button>
                  <el-radio-button :value="false">不接收</el-radio-button>
                </el-radio-group>
              </div>
              <div class="pref-row notification-row" :aria-busy="notificationSaving">
                <div class="pref-row__left">
                  <div class="pref-row__title">短信通知</div>
                  <div class="pref-row__meta">偏好：{{ notificationLabel(notificationDraft.sms) }} · 通道：{{ channelLabel('sms') }}</div>
                </div>
                <el-radio-group v-model="notificationDraft.sms" size="small" :disabled="notificationLoading || notificationSaving || !notificationState">
                  <el-radio-button :value="null">未设置</el-radio-button>
                  <el-radio-button :value="true">希望接收</el-radio-button>
                  <el-radio-button :value="false">不接收</el-radio-button>
                </el-radio-group>
              </div>
            </div>
            <div v-if="notificationState" class="form-section__desc notification-note">
              站内消息仍可在“消息”页查看；这些偏好目前不会控制消息页，也不会触发邮件或短信投递。
              <span v-if="notificationState.configured">偏好版本 {{ notificationState.revision }} 已保存。</span>
              <span v-else>尚未保存偏好。</span>
            </div>
            <div v-if="notificationDirty" class="dirty-note" role="status">有未保存的通知偏好</div>
            <div class="section-actions">
              <el-button type="primary" :loading="notificationSaving" :disabled="!notificationDirty || notificationLoading || !notificationState" @click="saveNotificationDraft">保存通知偏好</el-button>
              <el-button :disabled="!notificationDirty || notificationSaving" @click="cancelNotificationEdit">取消更改</el-button>
            </div>
          </div>
        </div>
      </main>
    </div>

    <el-dialog v-model="passwordDialog" title="修改平台账号密码" width="min(480px, calc(100vw - 32px))" destroy-on-close @closed="resetPasswordForm">
      <div class="form-section__desc password-note">
        密码须为 12 至 128 个字符。保存后所有现有登录会话都会失效，需要重新登录。
      </div>
      <el-form label-position="top">
        <el-form-item label="当前密码">
          <el-input v-model="passwordForm.current" type="password" autocomplete="current-password" show-password />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="passwordForm.next" type="password" autocomplete="new-password" show-password maxlength="128" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="passwordForm.confirmation" type="password" autocomplete="new-password" show-password maxlength="128" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="passwordSaving" @click="passwordDialog = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="submitPasswordChange">修改密码</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.profile-shell {
  display: grid;
  gap: 12px;
}

.panel {
  border-radius: var(--radius-md);
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  box-shadow: var(--card-shadow);
  padding: 16px;
}

.rail {
  display: grid;
  gap: 12px;
  align-content: start;
}

.rail__panel {
  padding: 14px;
}

.rail__panel--muted {
  background: var(--card-data-bg);
}

.rail__section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-200);
  letter-spacing: 0.06em;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--card-divider);
}

.rail__actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
}

.rail__actions .el-button { flex: 1; width: auto; }

.main {
  display: grid;
  gap: 12px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--card-divider);
  margin-bottom: 4px;
}

.section-head__title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
}

.form-section__head {
  margin-bottom: 14px;
}

.form-section__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-100);
}

.form-section__desc {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-200);
}

.form-section {
  padding: 16px 0;
}

.form-section + .form-section {
  border-top: 1px solid var(--card-divider);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.user {
  display: flex;
  gap: 14px;
  align-items: center;
}

.user__avatar-wrap {
  position: relative;
  cursor: pointer;
  border-radius: 50%;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.user__avatar-wrap:disabled { cursor: not-allowed; }
.user__avatar-wrap:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 3px; }

.user__avatar-overlay {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 10px;
  font-weight: 500;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.user__avatar-wrap:hover .user__avatar-overlay {
  opacity: 1;
}

.user__name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
}

.user__account {
  margin-top: 3px;
  color: var(--text-200);
  font-size: 12px;
}

.user__role {
  margin-top: 6px;
}

.form {
  margin-top: 4px;
}

.form-grid {
  display: grid;
  gap: 12px;
}

@media (min-width: 1024px) {
  .profile-shell {
    grid-template-columns: 280px 1fr;
    align-items: start;
  }

  .rail {
    position: sticky;
    top: 90px;
  }

  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
}

.kv + .kv {
  border-top: 1px dashed var(--card-divider);
}

.kv__k {
  font-size: 12px;
  color: var(--text-200);
}

.kv__v {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-100);
  display: flex;
  align-items: center;
  gap: 6px;
}

.kv__v--mono {
  font-family: var(--font-latin, monospace);
  font-size: 11px;
  letter-spacing: 0.02em;
}

.kv__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.kv__dot--ok { background: #67C23A; }
.kv__dot--warn { background: #E6A23C; }

.pref-list {
  display: flex;
  flex-direction: column;
}

.pref-row {
  width: 100%;
  text-align: left;
  border: none;
  border-bottom: 1px solid var(--card-divider);
  background: transparent;
  padding: 14px 4px;
  border-radius: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  transition: background 0.15s ease;
}

.pref-row:last-child { border-bottom: none; }

.pref-row:hover {
  background: var(--card-data-bg);
}

.pref-row:disabled { cursor: not-allowed; }
.pref-row--unavailable { cursor: default; }
.pref-row--unavailable:hover { background: transparent; }
.notification-row { align-items: flex-start; }
.notification-row .pref-row__left { flex: 1; }
.form-alert { margin-bottom: 12px; }
.section-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.dirty-note { margin-top: 8px; color: var(--el-color-warning-dark-2); font-size: 12px; }
.notification-note { margin-top: 12px; line-height: 1.6; }
.password-note { margin-bottom: 14px; }

@media (max-width: 767px) {
  .notification-row { flex-direction: column; }
  .notification-row .el-radio-group { width: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .notification-row :deep(.el-radio-button),
  .notification-row :deep(.el-radio-button__inner) { width: 100%; }
}

.pref-row__left {
  min-width: 0;
}

.pref-row__title {
  font-weight: 600;
  font-size: 13px;
}

.pref-row__meta {
  font-size: 12px;
  color: var(--text-200);
  margin-top: 2px;
}

.pref-row__arrow {
  font-size: 16px;
  color: var(--text-200);
  flex-shrink: 0;
}
</style>


