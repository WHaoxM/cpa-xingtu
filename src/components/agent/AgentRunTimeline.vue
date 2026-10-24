<script setup lang="ts">
import { computed } from 'vue'
import type { AgentRunEvent } from '@/api/agentTask'
import { toAgentRunTimelineItem } from './agentRunEventModel'

const props = defineProps<{
  events: AgentRunEvent[]
  syncState: 'idle' | 'loading' | 'syncing' | 'synced' | 'stale' | 'error'
  syncError?: string
}>()

const items = computed(() => props.events
  .map(toAgentRunTimelineItem)
  .filter(item => item !== null))

function eventTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <section class="agent-run-timeline" aria-label="任务执行记录">
    <header class="agent-run-timeline__header">
      <h4>执行记录</h4>
      <span v-if="syncState === 'loading' || syncState === 'syncing'" role="status">正在同步记录</span>
      <span v-else-if="syncState === 'stale'">连接暂时中断，保留上次记录</span>
      <span v-else-if="syncState === 'synced'">已同步</span>
    </header>

    <p v-if="syncError" class="agent-run-timeline__error" role="alert">{{ syncError }}</p>
    <ol v-if="items.length" class="agent-run-timeline__list">
      <li v-for="item in items" :key="item.id" class="agent-run-timeline__item" :data-tone="item.tone">
        <span class="agent-run-timeline__mark" aria-hidden="true" />
        <div class="agent-run-timeline__body">
          <div class="agent-run-timeline__line">
            <strong>{{ item.title }}</strong>
            <time v-if="eventTime(item.occurredAt)" :datetime="item.occurredAt">{{ eventTime(item.occurredAt) }}</time>
          </div>
          <p v-if="item.detail">{{ item.detail }}</p>
        </div>
      </li>
    </ol>
    <p v-else-if="syncState !== 'loading' && syncState !== 'syncing'" class="agent-run-timeline__empty">
      暂无可展示的执行记录。
    </p>
  </section>
</template>

<style scoped>
.agent-run-timeline {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--color-border, #ded8ce);
  border-radius: 10px;
  background: var(--color-background, #f8f6f0);
}
.agent-run-timeline__header,
.agent-run-timeline__line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.agent-run-timeline__header h4 { margin: 0; font-size: 13px; }
.agent-run-timeline__header > span,
.agent-run-timeline__line time,
.agent-run-timeline__body p,
.agent-run-timeline__empty {
  color: var(--color-text-secondary, #776e62);
  font-size: 12px;
}
.agent-run-timeline__list {
  display: grid;
  gap: 0;
  max-height: 320px;
  margin: 10px 0 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}
.agent-run-timeline__item {
  position: relative;
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 9px;
  padding: 0 0 12px;
}
.agent-run-timeline__item::before {
  position: absolute;
  top: 9px;
  bottom: 0;
  left: 5px;
  width: 1px;
  background: var(--color-border, #ded8ce);
  content: '';
}
.agent-run-timeline__item:last-child { padding-bottom: 0; }
.agent-run-timeline__item:last-child::before { display: none; }
.agent-run-timeline__mark {
  z-index: 1;
  width: 9px;
  height: 9px;
  margin-top: 4px;
  border: 2px solid var(--color-primary, #bb664b);
  border-radius: 50%;
  background: var(--color-background, #f8f6f0);
}
.agent-run-timeline__item[data-tone='success'] .agent-run-timeline__mark {
  border-color: var(--color-success, #62806b);
  background: var(--color-success, #62806b);
}
.agent-run-timeline__item[data-tone='warning'] .agent-run-timeline__mark {
  border-color: var(--color-warning, #ad7741);
}
.agent-run-timeline__item[data-tone='error'] .agent-run-timeline__mark {
  border-color: var(--color-danger, #9a4336);
  background: var(--color-danger, #9a4336);
}
.agent-run-timeline__body { min-width: 0; }
.agent-run-timeline__line { align-items: flex-start; }
.agent-run-timeline__line strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 12px;
  font-weight: 600;
}
.agent-run-timeline__line time { flex: none; font-variant-numeric: tabular-nums; }
.agent-run-timeline__body p { margin: 3px 0 0; overflow-wrap: anywhere; line-height: 1.5; }
.agent-run-timeline__empty { margin: 10px 0 0; }
.agent-run-timeline__error { margin: 8px 0 0; color: var(--color-danger, #9a4336); font-size: 12px; overflow-wrap: anywhere; }
@media (max-width: 560px) {
  .agent-run-timeline { padding: 10px; }
  .agent-run-timeline__list { max-height: 260px; }
}
</style>
