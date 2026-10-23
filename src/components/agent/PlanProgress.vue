<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  title?: string
  summary?: string
  progress?: Record<string, unknown>
  presentation?: 'student'
}>()

function visibleItems<T>(items: T[], legacyLimit: number): T[] {
  return props.presentation === 'student' ? items : items.slice(0, legacyLimit)
}

const planSketch = computed(() => Array.isArray(props.progress?.plan_sketch)
  ? visibleItems(props.progress.plan_sketch.map(String).map(step => step.trim()).filter(Boolean), 4)
  : [])

const executedSteps = computed(() => Array.isArray(props.progress?.executed_steps)
  ? visibleItems(props.progress.executed_steps
    .filter((step): step is Record<string, unknown> => !!step && typeof step === 'object')
    .map(step => ({
      label: String(step.label || '任务步骤'),
      status: props.presentation === 'student' && typeof step.status === 'string'
        ? step.status : step.status === 'completed' ? 'completed' : 'not_completed',
    })), 6)
  : [])

const rawMissingSlots = computed(() => Array.isArray(props.progress?.missing_slots)
  ? visibleItems(props.progress.missing_slots.map(String).map(slot => slot.trim()).filter(Boolean), 4)
  : [])
// These are the existing Lead slot IDs, not model prose or inferred requirements.
const slotLabels: Record<string, string> = {
  resume: '简历或学习、工作背景', target_role: '目标岗位或方向',
  portrait: '已有职业画像', match: '岗位匹配结果',
}
const slotLabel = (slot: string) => slotLabels[slot] || '其他需要补充的信息'
const missingSlots = computed(() => props.presentation === 'student'
  ? rawMissingSlots.value.map(slotLabel) : rawMissingSlots.value)
const displayTitle = computed(() => {
  const title = props.title || '本轮进度'
  if (props.presentation !== 'student') return title
  const stage = /^当前阶段：([a-z][a-z0-9_]*)$/.exec(title)
  if (stage) return ({ explain: '正在说明处理方式', clarify: '需要先了解的信息', run_plan: '本轮处理安排' } as Record<string, string>)[stage[1]!] || '本轮进度'
  // Only project the exact generated metadata form; keep ordinary business titles.
  if (/^执行路径：[A-Za-z][A-Za-z0-9_.:-]*$/.test(title)) return '本轮进度'
  return title
})
const displaySummary = computed(() => {
  const summary = props.summary || ''
  if (props.presentation !== 'student') return summary
  const generated = /^还需要补充：([a-z][a-z0-9_]*(?:、[a-z][a-z0-9_]*)*)$/.exec(summary)
  return generated ? `还需要补充：${generated[1]!.split('、').map(slotLabel).join('、')}` : summary
})

const filenames = computed(() => Array.isArray(props.progress?.filenames)
  ? visibleItems(props.progress.filenames.map(String).map(name => name.trim()).filter(Boolean), 4)
  : [])

const docComplete = computed(() => typeof props.progress?.document_complete === 'boolean'
  ? props.progress.document_complete
  : undefined)

// Routing metadata such as path/allow_tools is not user-visible progress.
const hasDetails = computed(() => planSketch.value.length > 0
  || executedSteps.value.length > 0
  || missingSlots.value.length > 0
  || filenames.value.length > 0
  || docComplete.value !== undefined)
const remainingSketch = computed(() => props.presentation === 'student'
  ? planSketch.value.filter(step => !executedSteps.value.some(executed => executed.label === step))
  : planSketch.value)
function stepStatusLabel(status: string) {
  if (props.presentation !== 'student') return status === 'completed' ? '已完成' : '未完成'
  return ({ completed: '已完成', running: '处理中', failed: '未能完成', partial: '部分完成',
    queued: '等待处理', pending: '等待处理', needs_input: '需要你回应', not_completed: '未完成',
  } as Record<string, string>)[status] || '结果尚未确认'
}
</script>

<template>
  <component :is="presentation === 'student' ? 'section' : 'details'" v-if="hasDetails" class="plan-progress" :class="{ 'plan-progress--student': presentation === 'student' }">
    <component :is="presentation === 'student' ? 'h4' : 'summary'" class="plan-progress__head">
      <Icon icon="lucide:list-checks" :width="14" />
      <span>{{ displayTitle }}</span>
      <Icon v-if="presentation !== 'student'" class="plan-progress__chevron" icon="lucide:chevron-down" :width="14" />
    </component>
    <div class="plan-progress__body">
      <p v-if="presentation === 'student' && displaySummary" class="plan-progress__notice">{{ displaySummary }}</p>
      <ol v-if="executedSteps.length" class="plan-progress__steps plan-progress__steps--executed">
        <li v-for="(step, index) in executedSteps" :key="`${step.label}-${index}`">
          <span>{{ step.label }}</span>
          <strong :class="step.status === 'completed' ? 'is-complete' : 'is-incomplete'">
            {{ stepStatusLabel(step.status) }}
          </strong>
        </li>
      </ol>
      <p v-if="presentation === 'student' && remainingSketch.length" class="plan-progress__notice">拟处理步骤 · 尚未完成</p>
      <ol v-if="remainingSketch.length && (presentation === 'student' || !executedSteps.length)" class="plan-progress__steps">
        <li v-for="(step,index) in remainingSketch" :key="index">{{ step }}</li>
      </ol>
      <p v-if="missingSlots.length" class="plan-progress__notice">
        还需要补充：{{ missingSlots.join('、') }}
      </p>
      <p v-if="filenames.length" class="plan-progress__notice">
        已关联材料：{{ filenames.join('、') }}
      </p>
      <p v-if="docComplete !== undefined" class="plan-progress__notice">
        {{ docComplete ? '附件已完整读取' : '附件仅部分可用' }}
      </p>
    </div>
  </component>
  <section v-else-if="presentation === 'student' && title?.trim()" class="plan-progress plan-progress--student" role="status">
    <h4 class="plan-progress__head">{{ displayTitle }}</h4>
    <p v-if="displaySummary" class="plan-progress__notice">{{ displaySummary }}</p>
  </section>
  <div v-else-if="displaySummary" class="plan-progress plan-progress--static" :class="{ 'plan-progress--student': presentation === 'student' }" role="status">
    <Icon icon="lucide:info" :width="14" />
    <span>{{ displaySummary }}</span>
  </div>
</template>

<style scoped>
.plan-progress {
  border: 1px solid color-mix(in srgb, var(--color-secondary) 24%, var(--color-border));
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-secondary) 6%, var(--color-surface));
  color: var(--color-secondary);
}

.plan-progress__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 13px;
  padding: 10px 12px;
  cursor: pointer;
  list-style: none;
}

.plan-progress__head::-webkit-details-marker { display: none; }
.plan-progress__head:focus-visible { outline: 2px solid var(--color-secondary); outline-offset: 2px; }
.plan-progress__chevron { margin-left: auto; transition: transform 160ms ease; }
.plan-progress[open] .plan-progress__chevron { transform: rotate(180deg); }
.plan-progress__body { padding: 0 12px 11px; }
.plan-progress__notice {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.55;
}

.plan-progress__steps {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.6;
}

.plan-progress__steps--executed { list-style: none; padding: 0; }
.plan-progress__steps--executed li { display: flex; justify-content: space-between; gap: 12px; }
.plan-progress__steps--executed strong { font-weight: 600; white-space: nowrap; }
.plan-progress__steps--executed .is-complete { color: var(--color-success, #16845b); }
.plan-progress__steps--executed .is-incomplete { color: var(--color-warning, #a56400); }

.plan-progress--static { display: flex; align-items: center; gap: 7px; padding: 10px 12px; font-size: 12px; }
.plan-progress--student { border: 0; border-radius: 0; background: transparent; color: var(--color-text-muted, #475569); }
.plan-progress--student .plan-progress__head { padding: 8px 0; margin: 0; cursor: default; font-size: 14px; font-weight: 500; }
.plan-progress--student .plan-progress__body { padding: 0 0 8px; }
.plan-progress--student .plan-progress__steps { font-size: 14px; line-height: 1.8; }
.plan-progress--student .plan-progress__steps--executed li { align-items: flex-start; gap: 16px; }
.plan-progress--student .plan-progress__steps--executed li > span { overflow-wrap: anywhere; }
.plan-progress--student .plan-progress__notice { font-size: 13px; line-height: 1.75; }
</style>
