<!-- 公共组件：右上角用户信息栏（消息按钮 + 头像 + 姓名 + 角色 + popover）-->
<!-- 颜色通过 --uib-* CSS 变量适配各页面风格 -->
<!-- 头像支持图片（avatar 字段）与文字回退（姓名首字），为后续接口预留 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox, ElNotification } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useUserStore } from '@/stores'

const router = useRouter()
const userStore = useUserStore()

const userRole = computed(() => userStore.userRole)
const roleLabel = computed(() => userRole.value === 'student' ? '学生' : '管理员')
const avatarChar = computed(() => userStore.currentUser?.name?.substring(0, 1) || '学')
const avatarUrl = computed(() => userStore.currentUser?.avatar || '')
const avatarBroken = ref(false)
const hasAvatar = computed(() => !!avatarUrl.value && !avatarBroken.value)

function onAvatarError() {
  avatarBroken.value = true
}

async function onLogout() {
  await ElMessageBox.confirm('确认退出登录？', '退出登录', {
    type: 'warning',
    confirmButtonText: '退出',
    cancelButtonText: '取消',
  })
  try {
    await userStore.logout()
  } catch {
    ElNotification({ title: '退出失败', message: '后端会话未能结束，请检查连接后重试', type: 'error' })
    return
  }
  ElNotification({
    title: '已退出',
    message: '登录状态已清空',
    type: 'success',
    duration: 1800,
  })
  router.replace('/login')
}

</script>

<template>
  <div class="uib">
    <!-- 消息按钮 -->
    <button class="uib__msg-btn" type="button" @click="router.push('/app/messages')" title="消息">
      <Icon icon="lucide:message-square" />
    </button>

    <el-popover
      placement="bottom-end"
      width="280"
      trigger="hover"
      :show-after="120"
      :hide-after="120"
      popper-class="user-popover"
    >
      <template #reference>
        <div class="uib__card">
          <!-- 头像：优先图片，降级为文字 -->
          <div class="uib__avatar" :class="{ 'uib__avatar--img': hasAvatar }">
            <img
              v-if="hasAvatar"
              :src="avatarUrl"
              :alt="userStore.currentUser?.name"
              class="uib__avatar-img"
              @error="onAvatarError"
            />
            <span v-else class="uib__avatar-char">{{ avatarChar }}</span>
          </div>
          <div class="uib__text">
            <div class="uib__name">{{ userStore.currentUser?.name || '钟同学' }}</div>
            <div class="uib__role">{{ roleLabel }}</div>
          </div>
        </div>
      </template>

      <div class="uib-pop">
        <div class="uib-pop__info">
          <div class="uib-pop__avatar" :class="{ 'uib-pop__avatar--img': hasAvatar }">
            <img
              v-if="hasAvatar"
              :src="avatarUrl"
              :alt="userStore.currentUser?.name"
              class="uib-pop__avatar-img"
            />
            <span v-else>{{ avatarChar }}</span>
          </div>
          <div class="uib-pop__name">{{ userStore.currentUser?.name }}</div>
          <div class="uib-pop__role">{{ roleLabel }}用户</div>
        </div>
        <el-divider />
        <div class="uib-pop__actions">
          <button class="uib-pop__btn" @click="router.push('/app/profile')">
            <Icon icon="lucide:user" /> 个人中心
          </button>
          <button class="uib-pop__btn" @click="onLogout">
            <Icon icon="lucide:log-out" /> 退出登录
          </button>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<style scoped>
.uib {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── 消息按钮 ── */
.uib__msg-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: var(--uib-msg-bg, rgba(0, 0, 0, 0.04));
  cursor: pointer;
  font-size: 16px;
  color: var(--uib-icon-color, var(--color-text-muted, #888));
  transition: color 0.22s ease, background-color 0.22s ease, transform 0.18s ease;
}
.uib__msg-btn:hover {
  color: var(--uib-icon-hover, var(--color-text, #333));
  background: var(--uib-msg-bg-hover, rgba(0, 0, 0, 0.08));
  transform: translateY(-1px);
}

/* ── 头像卡片（popover 触发区） ── */
.uib__card {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 3px 10px 3px 3px;
  border-radius: 22px;
  border: 1px solid transparent;
  transition: background-color 0.22s ease, border-color 0.22s ease;
}
.uib__card:hover {
  background: var(--uib-card-hover, rgba(0, 0, 0, 0.03));
}

/* ── 头像 ── */
.uib__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--uib-avatar-bg, var(--primary-100, #C04A2B));
  color: var(--uib-avatar-color, #fff);
  border: 1.5px solid var(--uib-avatar-border, rgba(0, 0, 0, 0.06));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.uib__avatar--img {
  background: var(--uib-avatar-img-bg, #f0eeeb);
}
.uib__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.uib__avatar-char {
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
}

/* ── 姓名 + 角色 ── */
.uib__text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  gap: 1px;
}
.uib__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--uib-name-color, var(--text-100, #222));
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.uib__role {
  font-size: 11px;
  color: var(--uib-role-color, var(--text-300, #999));
  letter-spacing: 0.02em;
}
</style>

<style>
/* ── popover 容器（渲染在 body 下，非 scoped） ── */
.user-popover {
  --el-popover-padding: 0px;
  border-radius: 16px !important;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06) !important;
  transform-origin: top right;
  animation: uibPopIn 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes uibPopIn {
  from { opacity: 0; transform: translateY(-6px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── popover 内容 ── */
.uib-pop {
  padding: 6px 0;
}
.uib-pop__info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 16px 12px;
}
.uib-pop__avatar {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 600;
  background: var(--primary-100, #C04A2B);
  color: #fff;
  border: 2px solid rgba(0, 0, 0, 0.04);
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.uib-pop__avatar--img {
  background: #f0eeeb;
}
.uib-pop__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.uib-pop__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #222);
  margin-top: 2px;
}
.uib-pop__role {
  font-size: 12px;
  color: var(--color-text-subtle, #999);
}


.uib-pop__actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
}
.uib-pop__btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  background: transparent;
  border: none;
  font-size: 13px;
  color: var(--color-text, #333);
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s;
}
.uib-pop__btn:hover {
  background: rgba(0, 0, 0, 0.04);
}
</style>
