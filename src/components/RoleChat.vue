<template>
  <div class="role-chat">
    <div class="role-chat__sidebar">
      <div class="role-info">
        <div class="role-info__avatar">{{ role?.name?.charAt(0) || '?' }}</div>
        <h3 class="role-info__name">{{ role?.name || '加载中...' }}</h3>
        <p class="role-info__title">{{ role?.title }}</p>
        <p class="role-info__company">{{ role?.company }}</p>
      </div>
      <div class="role-info__expertise" v-if="role?.expertise">
        <h4>专业领域</h4>
        <div class="tags">
          <el-tag v-for="tag in role.expertise" :key="tag" size="small" type="info">
            {{ tag }}
          </el-tag>
        </div>
      </div>
    </div>

    <div class="role-chat__main">
      <div class="chat-messages" ref="messagesContainer">
        <div v-if="greeting" class="message message--assistant">
          <div class="message__avatar">{{ role?.name?.charAt(0) || '?' }}</div>
          <div class="message__content">
            <div class="message__name">{{ role?.name }}</div>
            <div class="message__text">{{ greeting }}</div>
          </div>
        </div>

        <div
          v-for="(msg, index) in messages"
          :key="index"
          :class="['message', `message--${msg.role}`]"
        >
          <div class="message__avatar">
            {{ msg.role === 'user' ? '我' : role?.name?.charAt(0) || '?' }}
          </div>
          <div class="message__content">
            <div class="message__name">
              {{ msg.role === 'user' ? '我' : role?.name }}
            </div>
            <div class="message__text">{{ msg.content }}</div>
          </div>
        </div>

        <div v-if="loading" class="message message--assistant">
          <div class="message__avatar">{{ role?.name?.charAt(0) || '?' }}</div>
          <div class="message__content">
            <div class="message__text">思考中...</div>
          </div>
        </div>
      </div>

      <div class="chat-input">
        <el-input
          v-model="inputMessage"
          type="textarea"
          :rows="2"
          placeholder="输入您的问题..."
          @keydown.enter.exact.prevent="sendMessage"
          :disabled="loading"
        />
        <el-button type="primary" @click="sendMessage" :loading="loading" :disabled="!inputMessage.trim()">
          发送
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getRole, getRoleGreeting, chatWithRole, type RoleDetail } from '@/api/roles'

const route = useRoute()
const roleId = route.params.roleId as string

const role = ref<RoleDetail | null>(null)
const greeting = ref('')
const messages = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([])
const inputMessage = ref('')
const loading = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)

async function loadRole() {
  try {
    role.value = await getRole(roleId)
  } catch (error) {
    console.error('Failed to load role:', error)
  }
}

async function loadGreeting() {
  try {
    const data = await getRoleGreeting(roleId)
    greeting.value = data.greeting || ''
  } catch (error) {
    console.error('Failed to load greeting:', error)
  }
}

async function sendMessage() {
  if (!inputMessage.value.trim() || loading.value) return

  const userMessage = inputMessage.value.trim()
  messages.value.push({ role: 'user', content: userMessage })
  inputMessage.value = ''
  loading.value = true

  await nextTick()
  scrollToBottom()

  try {
    const response = await chatWithRole({
      role_id: roleId,
      message: userMessage,
      session_id: `role_${roleId}_${Date.now()}`,
      student_id: 'student_001',
    })
    const assistantMessage = response?.reply || response?.message || '抱歉，我无法回答这个问题。'
    messages.value.push({ role: 'assistant', content: assistantMessage })
  } catch (error) {
    console.error('Failed to send message:', error)
    messages.value.push({ role: 'assistant', content: '抱歉，发生了一些错误，请稍后重试。' })
  } finally {
    loading.value = false
    await nextTick()
    scrollToBottom()
  }
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

onMounted(() => {
  loadRole()
  loadGreeting()
})
</script>

<style scoped>
.role-chat {
  display: flex;
  height: 100%;
  background: var(--color-bg-page, #f5f7fa);
}

.role-chat__sidebar {
  width: 280px;
  background: var(--color-bg-card, #fff);
  border-right: 1px solid var(--color-border, #e4e7ed);
  padding: 24px;
  overflow-y: auto;
}

.role-info {
  text-align: center;
  margin-bottom: 24px;
}

.role-info__avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary, #409eff), #67c23a);
  color: white;
  font-size: 32px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.role-info__name {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.role-info__title {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 2px;
}

.role-info__company {
  font-size: 13px;
  color: var(--color-text-tertiary, #999);
}

.role-info__expertise h4 {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 12px;
}

.role-info__expertise .tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.role-chat__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.message--user {
  flex-direction: row-reverse;
}

.message__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-primary, #409eff);
  color: white;
  font-size: 16px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.message--user .message__avatar {
  background: var(--color-success, #67c23a);
}

.message__content {
  max-width: 70%;
}

.message__name {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.message--user .message__name {
  text-align: right;
}

.message__text {
  background: var(--color-bg-card, #fff);
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.08));
}

.message--user .message__text {
  background: var(--color-primary, #409eff);
  color: white;
}

.chat-input {
  padding: 16px 24px;
  background: var(--color-bg-card, #fff);
  border-top: 1px solid var(--color-border, #e4e7ed);
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.chat-input .el-input {
  flex: 1;
}
</style>
