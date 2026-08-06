<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { AIToolCall } from '@/types'

const props = defineProps<{
  tool: AIToolCall | Record<string, unknown>
}>()

// ui_view 契约（docs/frontend/cpa-xingtu/contracts/ai-assistant-materials.md §4）：
// 零字段渲染 —— 不暴露工具函数名 / 参数 / task_id / result_preview，只渲染产品化摘要与状态。
const normalized = computed<AIToolCall>(() => {
  const row = props.tool as Record<string, unknown>
  return {
    name: String(row.name || row.tool_name || row.tool || 'tool'),
    status: row.status === 'running' || row.status === 'error' || row.status === 'done'
      ? row.status
      : 'done',
    summary: row.summary ? String(row.summary) : undefined,
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
      <Icon icon="lucide:wrench" :width="13" />
      <span class="tool-card__summary">{{ normalized.summary || '已处理' }}</span>
      <span class="tool-card__status">{{ statusLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
.tool-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 12px;
  padding: 9px 12px;
  background: rgba(248, 250, 252, 0.88);
  color: #475569;
  font-size: 12.5px;
  line-height: 1.5;
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
  gap: 8px;
  min-width: 0;
}

.tool-card__summary {
  color: #334155;
  flex: 1;
  min-width: 0;
}

.tool-card__status {
  flex-shrink: 0;
  color: #64748b;
  font-size: 12px;
}
</style>

