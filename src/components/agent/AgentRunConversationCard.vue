<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AgentRunControlSnapshot, AgentRunEvent } from '@/api/agentTask'
import type { AgentRunControlRequest } from './agentRunControlModel'
import { isAgentRunActive, needsAgentRunAttention, summarizeAgentRun } from './agentRunEventModel'
import AgentRunControlPanel from './AgentRunControlPanel.vue'
import AgentRunTimeline from './AgentRunTimeline.vue'

const props = withDefaults(defineProps<{
  ownerKey: string
  sessionId: string
  runId: string
  run: AgentRunControlSnapshot | null
  fallbackStatus?: string
  events?: AgentRunEvent[]
  syncState?: 'idle' | 'loading' | 'syncing' | 'synced' | 'stale' | 'error'
  syncError?: string
  busy?: boolean
  controlError?: string
  saveState?: {
    contract_revision: number
    plan_version: number
    status: 'saving' | 'uncertain'
  } | null
  savedPlan?: AgentRunControlSnapshot['current_plan']
  interactive?: boolean
}>(), {
  fallbackStatus: '', events: () => [], syncState: 'idle', syncError: '', busy: false,
  controlError: '', saveState: null, savedPlan: null, interactive: false,
})

const emit = defineEmits<{
  loadHistory: [runId: string]
  control: [request: AgentRunControlRequest]
  resume: [request: { expected_revision: number }]
  save: [request: { contract_revision: number; plan_version: number }]
  refresh: [runId: string]
  readSavedPlan: [request: { plan_version: number }]
}>()

const disclosure = ref<HTMLDetailsElement | null>(null)
const expanded = ref(false)
const hasUserPreference = ref(false)
const summary = computed(() => summarizeAgentRun(props.run, props.fallbackStatus))

function preferenceKey(): string {
  return `agent-run-details:${encodeURIComponent(props.ownerKey)}:${encodeURIComponent(props.sessionId)}:${encodeURIComponent(props.runId)}`
}

function defaultExpanded(): boolean {
  const status = props.run?.status || props.fallbackStatus
  return isAgentRunActive(status) || needsAgentRunAttention(status)
}

function restoreDisclosure(): void {
  hasUserPreference.value = false
  try {
    const preference = typeof window === 'undefined' ? null : window.sessionStorage.getItem(preferenceKey())
    if (preference === 'open' || preference === 'closed') {
      expanded.value = preference === 'open'
      hasUserPreference.value = true
      return
    }
  } catch { /* Storage can be disabled; the disclosure still works in memory. */ }
  expanded.value = defaultExpanded()
}

function onToggle(event: Event): void {
  const next = (event.currentTarget as HTMLDetailsElement).open
  if (next !== expanded.value) {
    expanded.value = next
    hasUserPreference.value = true
    try { window.sessionStorage.setItem(preferenceKey(), next ? 'open' : 'closed') } catch { /* Optional UI preference only. */ }
  }
  if (next && props.syncState !== 'synced' && props.syncState !== 'syncing' && props.syncState !== 'loading') {
    emit('loadHistory', props.runId)
  }
}

watch(() => [props.ownerKey, props.sessionId, props.runId] as const, restoreDisclosure, { immediate: true })
watch(() => props.run?.status || props.fallbackStatus, () => {
  if (!hasUserPreference.value) expanded.value = defaultExpanded()
})
</script>

<template>
  <details
    ref="disclosure"
    class="agent-run-card"
    :open="expanded"
    @toggle="onToggle"
  >
    <summary class="agent-run-card__summary">
      <span class="agent-run-card__indicator" :data-status="run?.status || fallbackStatus" aria-hidden="true" />
      <span class="agent-run-card__summary-text" role="status" aria-live="polite">{{ summary }}</span>
      <span class="agent-run-card__chevron" aria-hidden="true" />
    </summary>

    <div class="agent-run-card__body">
      <AgentRunTimeline
        :events="events"
        :run-id="runId"
        :run-status="run?.status || fallbackStatus"
        :sync-state="syncState"
        :sync-error="syncError"
      />
      <p v-if="syncState === 'idle' || syncState === 'loading' || syncState === 'syncing'"
        class="agent-run-card__sync" role="status">
        {{ syncState === 'idle' ? '展开后读取这次任务的执行记录' : '正在读取任务记录' }}
      </p>
      <p v-if="controlError" class="agent-run-card__control-error" role="alert">{{ controlError }}</p>
      <p v-if="run?.final_result_checkpoint" class="agent-run-card__checkpoint" role="status">
        任务在安全检查点暂停；恢复前会重新核对当前计划。
      </p>
      <AgentRunControlPanel
        v-if="run"
        :run="run"
        :saved-plan="savedPlan"
        :busy="busy"
        :error="''"
        :save-state="saveState"
        :read-only="!interactive"
        :show-final-reply="false"
        @control="emit('control', $event)"
        @resume="emit('resume', $event)"
        @save="emit('save', $event)"
        @refresh="emit('refresh', runId)"
        @read-saved-plan="emit('readSavedPlan', $event)"
      />
      <button v-else type="button" class="agent-run-card__refresh" :disabled="syncState === 'loading' || syncState === 'syncing'"
        @click="emit('loadHistory', runId)">
        {{ syncState === 'error' || syncState === 'stale' ? '重新读取记录' : '读取执行记录' }}
      </button>
    </div>
  </details>
</template>

<style scoped>
.agent-run-card {
  min-width: 0;
  margin: 10px 0 0 38px;
  border: 1px solid var(--color-border, #ded8ce);
  border-radius: 11px;
  background: var(--color-surface, #fffdf8);
  color: var(--color-text-primary, #3b352c);
  box-shadow: 0 1px 2px rgb(46 38 26 / 4%);
}
.agent-run-card__summary {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) 12px;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 8px 12px;
  cursor: pointer;
  list-style: none;
}
.agent-run-card__summary::-webkit-details-marker { display: none; }
.agent-run-card__summary:focus-visible { outline: 2px solid var(--color-primary, #bb664b); outline-offset: 2px; border-radius: 10px; }
.agent-run-card__indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary, #bb664b);
}
.agent-run-card__indicator[data-status='completed'] { background: var(--color-success, #62806b); }
.agent-run-card__indicator[data-status='failed'] { background: var(--color-danger, #9a4336); }
.agent-run-card__indicator[data-status='partial'],
.agent-run-card__indicator[data-status='cancelled'],
.agent-run-card__indicator[data-status='paused'],
.agent-run-card__indicator[data-status='waiting_input'],
.agent-run-card__indicator[data-status='waiting_authorization'],
.agent-run-card__indicator[data-status='needs_reconciliation'] { background: var(--color-warning, #ad7741); }
.agent-run-card__summary-text { min-width: 0; overflow-wrap: anywhere; font-size: 12px; font-weight: 600; line-height: 1.45; }
.agent-run-card__chevron {
  width: 8px;
  height: 8px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg) translateY(-2px);
  transition: transform 140ms ease;
}
.agent-run-card[open] .agent-run-card__chevron { transform: rotate(225deg) translate(-1px, -1px); }
.agent-run-card__body { display: grid; gap: 12px; padding: 0 12px 12px; }
.agent-run-card__sync { margin: 0; color: var(--color-text-secondary, #776e62); font-size: 12px; }
.agent-run-card__control-error { margin: 0; color: var(--color-danger, #9a4336); font-size: 12px; overflow-wrap: anywhere; }
.agent-run-card__checkpoint { margin: 0; padding: 9px 11px; border-radius: 8px; background: color-mix(in srgb, var(--color-warning, #ad7741) 10%, var(--color-surface, #fffdf8)); font-size: 12px; line-height: 1.5; }
.agent-run-card__refresh {
  justify-self: start;
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #ded8ce);
  border-radius: 8px;
  background: var(--color-surface, #fffdf8);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.agent-run-card__refresh:focus-visible { outline: 2px solid var(--color-primary, #bb664b); outline-offset: 2px; }
@media (max-width: 560px) {
  .agent-run-card { margin-left: 0; }
  .agent-run-card__summary { grid-template-columns: 9px minmax(0, 1fr) 11px; gap: 8px; padding-inline: 10px; }
  .agent-run-card__body { padding: 0 9px 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .agent-run-card__chevron { transition: none; }
}
</style>
