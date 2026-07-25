<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import type { ArtifactRef } from '@/types'

const props = defineProps<{
  artifact: ArtifactRef
}>()

const router = useRouter()

const kindLabel = computed(() => {
  const map: Record<string, string> = {
    portrait: '能力画像',
    match: '人岗匹配',
    match_result: '人岗匹配',
    career_report: '职业报告',
    action_plan: '行动计划',
    file: '文件',
    pipeline_task: '管线任务',
  }
  return map[props.artifact.kind] || '成果物'
})

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '待处理',
    running: '处理中',
    completed: '已完成',
    failed: '失败',
  }
  return map[props.artifact.status] || props.artifact.status || '已生成'
})
function previewText(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(v => String(v)).join('、')
  if (typeof value === 'object') return '详情'
  return String(value)
}

function runAction(actionId: string) {
  if (actionId === 'view_portrait') router.push('/app/student/career-portrait')
  else if (actionId === 'open_match') router.push('/app/student/career-analysis')
  else if (actionId === 'open_report') router.push('/app/student/career-report')
  else if (actionId === 'continue_plan') router.push('/app/student/learning')
  else if (actionId === 'open_pipeline_task') router.push('/app/student/ai-assistant')
}
</script>

<template>
  <section class="artifact-card" :class="`artifact-card--${artifact.kind}`">
    <div class="artifact-card__head">
      <Icon icon="lucide:box" :width="14" />
      <span class="artifact-card__kind">{{ kindLabel }}</span>
      <span class="artifact-card__status">{{ statusLabel }}</span>
    </div>
    <h4 class="artifact-card__title">{{ artifact.title || kindLabel }}</h4>
    <p v-if="artifact.summary" class="artifact-card__summary">{{ artifact.summary }}</p>
    <div v-if="artifact.preview && Object.keys(artifact.preview).length" class="artifact-card__preview">
      <span
        v-for="(val, key) in artifact.preview"
        :key="String(key)"
        class="artifact-card__chip"
      >{{ key }}: {{ previewText(val) }}</span>
    </div>
    <div v-if="artifact.actions?.length" class="artifact-card__actions">
      <button
        v-for="action in artifact.actions"
        :key="action.id"
        type="button"
        class="artifact-card__btn"
        @click="runAction(action.id)"
      >
        {{ action.label }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.artifact-card {
  border: 1px solid rgba(20, 184, 166, 0.24);
  border-radius: 14px;
  background: rgba(240, 253, 250, 0.76);
  padding: 12px;
  color: #134e4a;
}

.artifact-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.artifact-card__status {
  margin-left: auto;
  color: #0f766e;
}

.artifact-card__title {
  margin: 8px 0 0;
  font-size: 14px;
}

.artifact-card__summary {
  margin: 6px 0 0;
  font-size: 12px;
  color: #0f766e;
}

.artifact-card__preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.artifact-card__chip {
  border-radius: 999px;
  background: rgba(204, 251, 241, 0.9);
  padding: 2px 8px;
  font-size: 11px;
}

.artifact-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.artifact-card__btn {
  border: 0;
  border-radius: 999px;
  background: #0f766e;
  color: white;
  cursor: pointer;
  padding: 5px 10px;
  font-size: 12px;
}
</style>
