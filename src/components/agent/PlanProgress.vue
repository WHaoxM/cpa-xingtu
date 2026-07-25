<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  title?: string
  summary?: string
  progress?: Record<string, unknown>
}>()

const planSketch = computed(() => Array.isArray(props.progress?.plan_sketch)
  ? props.progress?.plan_sketch.map(String).slice(0, 4)
  : [])

const missingSlots = computed(() => Array.isArray(props.progress?.missing_slots)
  ? props.progress?.missing_slots.map(String).slice(0, 4)
  : [])

const docComplete = computed(() => props.progress?.document_complete)
</script>

<template>
  <div class="plan-progress">
    <div class="plan-progress__head">
      <Icon icon="lucide:list-checks" :width="14" />
      <span>{{ title || '本轮进度' }}</span>
    </div>
    <p v-if="summary" class="plan-progress__summary">{{ summary }}</p>
    <ol v-if="planSketch.length" class="plan-progress__steps">
      <li v-for="step in planSketch" :key="step">{{ step }}</li>
    </ol>
    <div v-if="missingSlots.length" class="plan-progress__notice">
      还需要补充：{{ missingSlots.join('、') }}
    </div>
    <div v-if="docComplete !== undefined" class="plan-progress__notice">
      {{ docComplete ? '附件已完整读取' : '附件仅部分可用' }}
    </div>
  </div>
</template>

<style scoped>
.plan-progress {
  border: 1px solid rgba(59, 130, 246, 0.22);
  border-radius: 14px;
  background: rgba(239, 246, 255, 0.78);
  padding: 10px 12px;
  color: #1e3a8a;
}

.plan-progress__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 13px;
}

.plan-progress__summary,
.plan-progress__notice {
  margin: 6px 0 0;
  font-size: 12px;
  color: #1d4ed8;
}

.plan-progress__steps {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
}
</style>
