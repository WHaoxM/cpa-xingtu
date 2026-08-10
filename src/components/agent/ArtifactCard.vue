<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import type { ArtifactRef, PortraitPreview, MatchPreview, ReportPreview, PlanPreview } from '@/types'

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

const previewType = computed(() => {
  const p = props.artifact.preview
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null
  return (p as Record<string, unknown>).type as string || null
})

const portraitPreview = computed(() => {
  if (previewType.value !== 'portrait_preview') return null
  return props.artifact.preview as unknown as PortraitPreview
})

const matchPreview = computed(() => {
  if (previewType.value !== 'match_preview') return null
  return props.artifact.preview as unknown as MatchPreview
})

const reportPreview = computed(() => {
  if (previewType.value !== 'report_preview') return null
  return props.artifact.preview as unknown as ReportPreview
})

const planPreview = computed(() => {
  if (previewType.value !== 'plan_preview') return null
  return props.artifact.preview as unknown as PlanPreview
})

const legacyPreview = computed(() => {
  if (previewType.value) return null
  const p = props.artifact.preview
  if (!p || typeof p !== 'object' || Array.isArray(p)) return []
  return Object.entries(p as Record<string, unknown>).filter(([, v]) => v != null)
})

function previewText(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(v => String(v)).join('、')
  if (typeof value === 'object') return '详情'
  return String(value)
}

function dimLabel(dim: string): string {
  return { d1: '基础素质', d2: '专业技能', d3: '项目经验', d4: '综合潜力' }[dim] || dim
}

function runAction(actionId: string) {
  if (actionId === 'view_portrait') router.push('/app/student/career-portrait')
  else if (actionId === 'open_match') router.push('/app/student/career-analysis')
  else if (actionId === 'open_report') router.push('/app/student/career-report')
  else if (actionId === 'continue_plan') router.push('/app/student/learning')
  else if (actionId === 'open_resume') router.push('/app/student/resume-builder')
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

    <!-- 画像预览：四维分数 -->
    <div v-if="portraitPreview" class="artifact-card__typed-preview">
      <div v-if="portraitPreview.scores" class="artifact-card__portrait-scores">
        <div
          v-for="(score, dim) in portraitPreview.scores"
          :key="dim"
          class="artifact-card__dim"
        >
          <span class="artifact-card__dim-label">{{ dimLabel(String(dim)) }}</span>
          <span class="artifact-card__dim-score">{{ score }}</span>
        </div>
      </div>
      <div v-if="portraitPreview.strengths?.length" class="artifact-card__chips">
        <span class="artifact-card__chip artifact-card__chip--green" v-for="s in portraitPreview.strengths" :key="s">{{ s }}</span>
      </div>
      <div v-if="portraitPreview.weaknesses?.length" class="artifact-card__chips">
        <span class="artifact-card__chip artifact-card__chip--amber" v-for="w in portraitPreview.weaknesses" :key="w">{{ w }}</span>
      </div>
    </div>

    <!-- 匹配预览：总分 + 覆盖率 -->
    <div v-else-if="matchPreview" class="artifact-card__typed-preview">
      <div class="artifact-card__match-stats">
        <div v-if="matchPreview.total_score != null" class="artifact-card__stat">
          <span class="artifact-card__stat-val">{{ matchPreview.total_score }}</span>
          <span class="artifact-card__stat-label">总分</span>
        </div>
        <div v-if="matchPreview.coverage != null" class="artifact-card__stat">
          <span class="artifact-card__stat-val">{{ matchPreview.coverage }}%</span>
          <span class="artifact-card__stat-label">覆盖率</span>
        </div>
        <div v-if="matchPreview.hard_pass === false" class="artifact-card__stat artifact-card__stat--warn">
          <span class="artifact-card__stat-val">未通过</span>
          <span class="artifact-card__stat-label">硬约束</span>
        </div>
      </div>
      <div v-if="matchPreview.gaps?.length" class="artifact-card__chips">
        <span class="artifact-card__chip artifact-card__chip--red" v-for="g in matchPreview.gaps" :key="g">{{ g }}</span>
      </div>
    </div>

    <!-- 报告预览：章节数 + 字数 -->
    <div v-else-if="reportPreview" class="artifact-card__typed-preview">
      <div class="artifact-card__report-stats">
        <span v-if="reportPreview.chapters?.length" class="artifact-card__chip">{{ reportPreview.chapters.length }} 章</span>
        <span v-if="reportPreview.word_count" class="artifact-card__chip">{{ Math.round(reportPreview.word_count / 100) }}k 字</span>
      </div>
    </div>

    <!-- 计划预览：步骤 + 已完成 -->
    <div v-else-if="planPreview" class="artifact-card__typed-preview">
      <div class="artifact-card__plan-bar">
        <div
          class="artifact-card__plan-fill"
          :style="{ width: planPreview.steps ? `${((planPreview.completed || 0) / planPreview.steps) * 100}%` : '0%' }"
        />
      </div>
      <span class="artifact-card__plan-text">
        {{ planPreview.completed || 0 }} / {{ planPreview.steps || 0 }} 步
        <template v-if="planPreview.duration"> · {{ planPreview.duration }}</template>
      </span>
    </div>

    <!-- 兼容旧 preview -->
    <div v-else-if="legacyPreview.length" class="artifact-card__preview">
      <span
        v-for="[key, val] in legacyPreview"
        :key="key"
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

.artifact-card__typed-preview {
  margin-top: 8px;
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

.artifact-card__chip--green {
  background: rgba(187, 247, 208, 0.7);
  color: #166534;
}

.artifact-card__chip--amber {
  background: rgba(254, 243, 199, 0.8);
  color: #92400e;
}

.artifact-card__chip--red {
  background: rgba(254, 202, 202, 0.7);
  color: #991b1b;
}

.artifact-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.artifact-card__portrait-scores {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.artifact-card__dim {
  text-align: center;
}

.artifact-card__dim-label {
  display: block;
  font-size: 10px;
  color: #0f766e;
}

.artifact-card__dim-score {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #134e4a;
}

.artifact-card__match-stats {
  display: flex;
  gap: 12px;
}

.artifact-card__stat {
  text-align: center;
}

.artifact-card__stat-val {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #134e4a;
}

.artifact-card__stat--warn .artifact-card__stat-val {
  color: #dc2626;
}

.artifact-card__stat-label {
  display: block;
  font-size: 10px;
  color: #0f766e;
}

.artifact-card__report-stats {
  display: flex;
  gap: 6px;
}

.artifact-card__plan-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(20, 184, 166, 0.2);
  overflow: hidden;
}

.artifact-card__plan-fill {
  height: 100%;
  border-radius: 3px;
  background: #14b8a6;
  transition: width 0.4s ease;
}

.artifact-card__plan-text {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #0f766e;
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
