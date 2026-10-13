<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { Icon } from '@iconify/vue'
import type { AIMessage, MessagePart } from '@/types'
import { renderMarkdown } from '@/utils/markdown'
import ToolCallCard from './ToolCallCard.vue'
import ArtifactCard from './ArtifactCard.vue'
import CitationPart from './CitationPart.vue'
import DataCardPart from './DataCardPart.vue'
import PlanProgress from './PlanProgress.vue'

const props = defineProps<{
  message: AIMessage
  streamingText?: string
  isStreaming?: boolean
  sessionId?: string | null
}>()

const emit = defineEmits<{
  upgrade: [to?: string]
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
  <div class="parts">
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

    <template v-for="(part, i) in parts" :key="`${message.id}-part-${i}`">
      <!-- text -->
      <div
        v-if="part.type === 'text'"
        class="msg__body"
        v-html="renderMarkdown(displayText(part))"
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
          {{ part.reason || '该请求更适合更高预算模式。' }}
        </span>
        <button
          type="button"
          class="upgrade-hint__btn"
          @click="emit('upgrade', String(part.to))"
        >
          切换到 {{ String(part.to).toUpperCase() }}
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
  </div>
</template>

<style scoped>
.parts {
  display: grid;
  gap: 10px;
}

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
