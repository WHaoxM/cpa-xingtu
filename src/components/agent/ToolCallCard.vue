<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type { AIToolCall } from '@/types'

const props = defineProps<{
  tool: AIToolCall | Record<string, unknown>
}>()

const expanded = ref(false)

const normalized = computed<AIToolCall>(() => {
  const row = props.tool as Record<string, unknown>
  const parameters = row.parameters && typeof row.parameters === 'object'
    ? row.parameters as Record<string, unknown>
    : undefined
  const args = row.args && typeof row.args === 'object'
    ? row.args as Record<string, string>
    : parameters
      ? Object.fromEntries(Object.entries(parameters).map(([k, v]) => [k, String(v)]))
      : undefined
  return {
    name: String(row.name || row.tool_name || row.tool || 'tool'),
    status: row.status === 'running' || row.status === 'error' || row.status === 'done'
      ? row.status
      : 'done',
    summary: row.summary ? String(row.summary) : undefined,
    args,
    resultPreview: row.resultPreview || row.result_preview ? String(row.resultPreview || row.result_preview) : undefined,
    taskId: row.taskId || row.task_id ? String(row.taskId || row.task_id) : undefined,
    taskStatus: row.taskStatus || row.task_status ? String(row.taskStatus || row.task_status) : undefined,
  }
})

const statusLabel = computed(() => {
  if (normalized.value.status === 'running') return '运行中'
  if (normalized.value.status === 'error') return '失败'
  return '已完成'
})
</script>

<template>
  <div class="tool-card" :class="`tool-card--${normalized.status || 'done'}`">
    <div class="tool-card__head">
      <Icon icon="lucide:wrench" :width="12" />
      <code class="tool-card__name">{{ normalized.name }}</code>
      <span class="tool-card__status">{{ statusLabel }}</span>
    </div>
    <p v-if="normalized.summary" class="tool-card__summary">{{ normalized.summary }}</p>
    <div v-if="normalized.taskId" class="tool-card__task">
      task_id={{ normalized.taskId }}
      <span v-if="normalized.taskStatus"> · {{ normalized.taskStatus }}</span>
    </div>
    <button
      v-if="normalized.args && Object.keys(normalized.args).length"
      type="button"
      class="tool-card__args-toggle"
      @click="expanded = !expanded"
    >
      {{ expanded ? '收起参数' : '查看参数' }}
    </button>
    <div v-if="expanded && normalized.args" class="tool-card__args">
      <span
        v-for="(val, key) in normalized.args"
        :key="String(key)"
        class="tool-card__arg"
      >{{ key }}={{ val }}</span>
    </div>
    <pre v-if="expanded && normalized.resultPreview" class="tool-card__preview">{{ normalized.resultPreview }}</pre>
  </div>
</template>

<style scoped>
.tool-card {
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(248, 250, 252, 0.88);
}

.tool-card--error {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(254, 242, 242, 0.88);
}

.tool-card--running {
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(239, 246, 255, 0.9);
}

.tool-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.tool-card__name {
  color: #334155;
}

.tool-card__status {
  margin-left: auto;
  color: #64748b;
}

.tool-card__summary,
.tool-card__task {
  margin: 6px 0 0;
  color: #475569;
  font-size: 12px;
}

.tool-card__args-toggle {
  margin-top: 8px;
  border: 0;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
  font-size: 12px;
}

.tool-card__args {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.tool-card__arg {
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.9);
  padding: 2px 8px;
  font-size: 11px;
  color: #475569;
}

.tool-card__preview {
  margin: 8px 0 0;
  white-space: pre-wrap;
  font-size: 11px;
  color: #475569;
}
</style>
