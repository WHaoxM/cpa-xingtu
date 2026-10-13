<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  title?: string
  summary?: string
  progress?: Record<string, unknown>
}>()

const planSketch = computed(() => Array.isArray(props.progress?.plan_sketch)
  ? props.progress.plan_sketch.map(String).map(step => step.trim()).filter(Boolean).slice(0, 4)
  : [])

const missingSlots = computed(() => Array.isArray(props.progress?.missing_slots)
  ? props.progress.missing_slots.map(String).map(slot => slot.trim()).filter(Boolean).slice(0, 4)
  : [])

const filenames = computed(() => Array.isArray(props.progress?.filenames)
  ? props.progress.filenames.map(String).map(name => name.trim()).filter(Boolean).slice(0, 4)
  : [])

const docComplete = computed(() => typeof props.progress?.document_complete === 'boolean'
  ? props.progress.document_complete
  : undefined)

// Routing metadata such as path/allow_tools is not user-visible progress.
const hasDetails = computed(() => planSketch.value.length > 0
  || missingSlots.value.length > 0
  || filenames.value.length > 0
  || docComplete.value !== undefined)
</script>

<template>
  <details v-if="hasDetails" class="plan-progress">
    <summary class="plan-progress__head">
      <Icon icon="lucide:list-checks" :width="14" />
      <span>{{ title || '本轮进度' }}</span>
      <Icon class="plan-progress__chevron" icon="lucide:chevron-down" :width="14" />
    </summary>
    <div class="plan-progress__body">
      <ol v-if="planSketch.length" class="plan-progress__steps">
        <li v-for="step in planSketch" :key="step">{{ step }}</li>
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
  </details>
  <div v-else-if="summary" class="plan-progress plan-progress--static" role="status">
    <Icon icon="lucide:info" :width="14" />
    <span>{{ summary }}</span>
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

.plan-progress--static { display: flex; align-items: center; gap: 7px; padding: 10px 12px; font-size: 12px; }
</style>
