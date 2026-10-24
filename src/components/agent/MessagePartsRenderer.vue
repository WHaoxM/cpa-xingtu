<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { Icon } from '@iconify/vue'
import type { AIMessage, MessagePart } from '@/types'
import { renderMarkdown } from '@/utils/markdown'
import ToolCallCard from './ToolCallCard.vue'
import ArtifactCard from './ArtifactCard.vue'
import CitationPart from './CitationPart.vue'
import DataCardPart from './DataCardPart.vue'
import EvidenceSummaryPart from './EvidenceSummaryPart.vue'
import PlanProgress from './PlanProgress.vue'

const props = defineProps<{
  message: AIMessage
  streamingText?: string
  isStreaming?: boolean
  sessionId?: string | null
  compactEvidence?: boolean
  presentation?: 'student'
}>()

const emit = defineEmits<{
  upgrade: [to?: string]
  actionPlanStart: [handoffId: string]
}>()

const thinkingOpen = ref(false)

// ── Part 分发表：新增 part 类型只需加一行 ──
const PART_COMPONENTS: Record<string, Component> = {
  tool_call: ToolCallCard,
  artifact_ref: ArtifactCard,
  citation: CitationPart,
  data_card: DataCardPart,
  progress: PlanProgress,
}

const parts = computed<MessagePart[]>(() => {
  if (props.message.parts?.length) return props.message.parts
  const out: MessagePart[] = []
  for (const tool of props.message.toolCalls || []) {
    out.push({ type: 'tool_call', status: tool.status, tool_call: tool })
  }
  for (const artifact of props.message.artifacts || []) {
    out.push({ type: 'artifact_ref', artifact })
  }
  if (props.message.content) out.push({ type: 'text', text: props.message.content })
  if (props.message.upgradeHint?.to) {
    out.push({
      type: 'upgrade_hint',
      to: props.message.upgradeHint.to,
      reason: props.message.upgradeHint.reason,
    })
  }
  return out
})

type IndexedPart = { part: MessagePart; index: number }
type ReadingBlock = { process: boolean; items: IndexedPart[] }
const studentReading = computed(() => props.presentation === 'student')
// Only adjacent execution parts share a visual sequence. Text, questions,
// sources and artifacts retain their original positions in the message.
const readingBlocks = computed<ReadingBlock[]>(() => {
  const blocks: ReadingBlock[] = []
  parts.value.forEach((part, index) => {
    if (studentReading.value && part.type === 'progress') {
      const progress = part.progress || {}
      const hasVisibleDetails = ['plan_sketch', 'executed_steps', 'missing_slots', 'filenames']
        .some(key => Array.isArray(progress[key]) && (progress[key] as unknown[]).some(item => typeof item === 'object' ? !!item : String(item).trim()))
        || typeof progress.document_complete === 'boolean'
      if (!part.title?.trim() && !part.summary?.trim() && !hasVisibleDetails) return
    }
    const process = studentReading.value && (part.type === 'tool_call' || part.type === 'progress')
    const previous = blocks[blocks.length - 1]
    if (process && previous?.process) previous.items.push({ part, index })
    else blocks.push({ process, items: [{ part, index }] })
  })
  return blocks
})

const modeLabels: Record<string, string> = { ask: '直接回答', agent: '自动处理', experts: '协作处理' }
function upgradeLabel(to: string) { return modeLabels[to] || '' }
// Exact legacy UI wording only. Other reasons may carry unique business facts;
// never replace them based on keywords such as “预算” or “模式”.
const legacyInternalUpgradeReasons = new Set(['该请求更适合更高预算模式。'])
function upgradeDescription(to: string, reason?: string) {
  if (reason?.trim() && !legacyInternalUpgradeReasons.has(reason.trim())) return reason
  return ({ ask: '适合直接讨论的问题，可以使用“直接回答”。',
    agent: '需要结合资料继续处理时，可以选择“自动处理”。',
    experts: '需要从不同视角继续讨论时，可以选择“协作处理”。',
  } as Record<string, string>)[to] || '如需调整处理方式，可以在输入框旁选择模式。'
}

function displayText(part: MessagePart): string {
  if (part.type !== 'text') return ''
  if (props.isStreaming) return props.streamingText || ''
  return part.text || ''
}

function thoughtLabel(seconds?: number): string {
  if (seconds == null || seconds <= 0) return '思考过程'
  const n = Math.max(1, Math.round(Number(seconds)))
  return `思考了 ${n} 秒`
}

function thinkingParas(text?: string): string[] {
  return String(text || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
}

function outcomeLabel(): string {
  const outcome = props.message.outcome
  if (!outcome) return ''
  if (studentReading.value) {
    if (outcome.status === 'running') return '正在处理中。'
    if (outcome.status === 'needs_input') return '还需要你补充一点信息，可以在这里继续回答。'
    if (outcome.status === 'partial') {
      if (outcome.next_action === 'answer_in_session') return '这轮只完成了一部分，还需要你回答下面的问题。'
      if (outcome.next_action === 'poll_run') return '这轮只完成了一部分，可继续查看处理进展。'
      if (outcome.next_action === 'retry_new_turn') return '这轮只完成了一部分。可先阅读已有内容，再重新发起未完成的部分。'
      return '这轮只完成了一部分，不能视为全部完成。'
    }
    if (outcome.status === 'failed') return outcome.next_action === 'retry_new_turn'
      ? '这轮未能完成，可以重新发起。' : '这轮未能完成。'
    return ''
  }
  switch (outcome.status) {
    case 'needs_input': return '还需要一点信息，可以直接在这里继续回答。'
    case 'running': return outcome.run_id ? `任务进行中（${outcome.run_id}）。` : '任务进行中。'
    case 'partial': return '这轮尚未完整完成，以下内容可能不完整。可以补充信息后重试。'
    case 'failed': return '这轮没有完成，请重试。'
    default: return ''
  }
}
</script>

<template>
  <div class="parts" :class="{ 'parts--student': studentReading }">
    <div
      v-if="outcomeLabel()"
      class="outcome-notice"
      :class="`outcome-notice--${message.outcome?.status}`"
      role="status"
    >{{ outcomeLabel() }}</div>
    <div
      v-if="message.thinking"
      class="thought"
      :class="{ 'thought--open': thinkingOpen }"
    >
      <button type="button" class="thought__toggle" @click="thinkingOpen = !thinkingOpen">
        <Icon class="thought__chevron" icon="lucide:chevron-right" :width="13" />
        <span class="thought__label">{{ thoughtLabel(message.thinkingDuration) }}</span>
      </button>
      <div v-if="thinkingOpen" class="thought__body">
        <p
          v-for="(para, pi) in thinkingParas(message.thinking)"
          :key="`${message.id}-t-${pi}`"
          class="thought__p"
        >{{ para }}</p>
      </div>
    </div>

    <template v-for="block in readingBlocks" :key="`${message.id}-block-${block.items[0]?.index}`">
      <section v-if="block.process" class="message-process" aria-label="处理步骤">
        <h3 class="message-process__title">处理步骤</h3>
        <ol class="message-process__steps">
          <li v-for="{ part, index } in block.items" :key="`${message.id}-process-${index}`">
            <ToolCallCard v-if="part.type === 'tool_call'" :tool="part.tool_call" presentation="student" />
            <PlanProgress v-else-if="part.type === 'progress'" :title="part.title" :summary="part.summary" :progress="part.progress" presentation="student" />
          </li>
        </ol>
      </section>
    <template v-else v-for="{ part, index: i } in block.items" :key="`${message.id}-part-${i}`">
      <!-- text -->
      <div
        v-if="part.type === 'text'"
        class="msg__body"
        v-html="renderMarkdown(displayText(part), studentReading ? { studentTables: true } : undefined)"
      />

      <!-- 工具调用（零字段渲染） -->
      <div v-else-if="part.type === 'tool_call'" class="tool-row">
        <ToolCallCard :tool="part.tool_call" />
      </div>

      <!-- 成果物引用 -->
      <ArtifactCard
        v-else-if="part.type === 'artifact_ref'"
        :artifact="part.artifact"
        :session-id="sessionId"
      />

      <!-- 引用来源 -->
      <CitationPart
        v-else-if="part.type === 'citation'"
        :citation="part"
      />

      <!-- 结构化数据卡片 -->
      <DataCardPart
        v-else-if="part.type === 'data_card'"
        :title="part.title"
        :card-type="part.card_type"
        :items="part.items"
      />

      <details v-else-if="part.type === 'evidence_summary' && compactEvidence && !studentReading" class="message-evidence-disclosure">
        <summary>{{part.title || '参考资料'}} · {{part.status==='complete'?'已读取':'读取范围有限'}}</summary>
        <EvidenceSummaryPart :summary="part"/>
      </details>
      <EvidenceSummaryPart
        v-else-if="part.type === 'evidence_summary'"
        :summary="part"
        :presentation="presentation"
      />

      <div v-else-if="part.type === 'action_plan_handoff' && part.stage === 'offer'" class="action-plan-offer">
        <p>想好先从哪项差距开始了吗？可以把这次报告和简历里的依据整理成一周行动计划。</p>
        <button type="button" @click="emit('actionPlanStart', part.handoff_id)">
          <Icon icon="lucide:list-checks" :width="15" />
          把这个差距变成行动计划
        </button>
      </div>
      <div v-else-if="part.type === 'action_plan_handoff' && part.stage === 'awaiting_time'" class="action-plan-prompt">
        <Icon icon="lucide:calendar-clock" :width="15" />
        <span>回复每周大约能投入的时间，我会按这个节奏安排。</span>
      </div>

      <!-- 进度 -->
      <PlanProgress
        v-else-if="part.type === 'progress'"
        :title="part.title"
        :summary="part.summary"
        :progress="part.progress"
      />

      <!-- 模式升级提示 -->
      <div
        v-else-if="part.type === 'upgrade_hint'"
        class="upgrade-hint"
      >
        <span class="upgrade-hint__text">
          {{ studentReading ? upgradeDescription(String(part.to), part.reason) : part.reason || '该请求更适合更高预算模式。' }}
        </span>
        <button
          type="button"
          v-if="!studentReading || upgradeLabel(String(part.to))"
          class="upgrade-hint__btn"
          @click="emit('upgrade', String(part.to))"
        >
          切换到 {{ studentReading ? upgradeLabel(String(part.to)) : String(part.to).toUpperCase() }}
        </button>
      </div>

      <!-- 系统通知 -->
      <div
        v-else-if="part.type === 'notice'"
        class="notice"
        :class="`notice--${part.level || 'info'}`"
      >
        {{ part.text }}
      </div>
    </template>
    </template>
  </div>
</template>

<style scoped>
.parts {
  display: grid;
  gap: 10px;
}
.parts--student { gap: 20px; }
.parts--student .msg__body { font-size: 15px; line-height: 1.85; overflow-wrap: anywhere; }
.parts--student, .parts--student .msg__body { min-width: 0; }
.parts--student .msg__body :deep(.md-table-scroll) { max-width: 100%; overflow-x: auto; margin: 18px 0; overscroll-behavior-x: contain; }
.parts--student .msg__body :deep(.md-table-scroll:focus-visible) { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.parts--student .msg__body :deep(.md-table) { border-collapse: collapse; width: max-content; min-width: 100%; font-size: 14px; line-height: 1.75; }
.parts--student .msg__body :deep(.md-table th), .parts--student .msg__body :deep(.md-table td) { min-width: 9rem; max-width: 24rem; padding: 12px 14px; border: 1px solid var(--color-border, #dce1e5); text-align: left; vertical-align: top; white-space: normal; }
.parts--student .msg__body :deep(.md-table th) { font-weight: 600; background: var(--color-surface, #fafaf9); }
.message-process { padding: 12px 0; border-top: 1px solid var(--color-border, #dce1e5); border-bottom: 1px solid var(--color-border, #dce1e5); }
.message-process__title { margin: 0 0 6px; font-size: 13px; font-weight: 500; color: var(--color-text-muted, #64748b); }
.message-process__steps { list-style: none; margin: 0; padding: 0; }
.message-process__steps > li + li { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--color-border, #e3e7eb); }
.parts--student .outcome-notice { padding: 8px 0; border-radius: 0; background: transparent; font-size: 14px; line-height: 1.7; }
.parts--student .upgrade-hint { flex-wrap: wrap; border-radius: 0; padding: 12px 0; background: transparent; border-top: 1px solid var(--color-border, #dce1e5); }
.parts--student .upgrade-hint__btn, .parts--student .action-plan-offer button { min-height: 44px; }
.parts--student .upgrade-hint__btn { background: var(--color-primary, #8b351e); }
.parts--student .upgrade-hint__btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.action-plan-offer {
  display: grid;
  gap: 9px;
  justify-items: start;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 22%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--el-color-primary) 5%, white);
}
.action-plan-offer p { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.55; }
.action-plan-offer button {
  display: inline-flex; align-items: center; gap: 7px; padding: 8px 12px;
  border: 0; border-radius: 10px; background: var(--el-color-primary); color: white;
  font: inherit; font-size: 13px; font-weight: 650; cursor: pointer;
}
.action-plan-prompt { display: flex; align-items: center; gap: 7px; color: var(--el-text-color-secondary); font-size: 12px; }

.outcome-notice {
  border-radius: 10px;
  padding: 9px 11px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 12px;
}

.outcome-notice--partial,
.outcome-notice--needs_input {
  background: #fffbeb;
  color: #92400e;
}

.outcome-notice--failed {
  background: #fef2f2;
  color: #991b1b;
}

.tool-row {
  display: grid;
  gap: 8px;
}

.msg__body {
  color: #111827;
  line-height: 1.7;
  font-size: 14px;
}

.thought {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.78);
  overflow: hidden;
}

.thought__toggle {
  width: 100%;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
}

.thought--open .thought__chevron {
  transform: rotate(90deg);
}

.thought__body {
  padding: 0 10px 10px;
}

.thought__p {
  margin: 6px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
}

.upgrade-hint,
.notice {
  border-radius: 12px;
  padding: 9px 11px;
  font-size: 12px;
}

.upgrade-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 247, 237, 0.9);
  color: #9a3412;
}

.upgrade-hint__btn {
  margin-left: auto;
  border: 0;
  border-radius: 999px;
  background: #ea580c;
  color: white;
  cursor: pointer;
  padding: 5px 10px;
  font-size: 12px;
}

.notice {
  background: rgba(241, 245, 249, 0.9);
  color: #475569;
}

.notice--warning {
  background: rgba(254, 243, 199, 0.9);
  color: #92400e;
}

.notice--error {
  background: rgba(254, 226, 226, 0.9);
  color: #991b1b;
}
</style>
