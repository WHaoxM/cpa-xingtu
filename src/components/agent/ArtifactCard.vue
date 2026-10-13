<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import type { ArtifactRef, PortraitPreview, MatchPreview, ReportPreview, PlanPreview } from '@/types'
import { getAgentArtifact, type AgentArtifactDetail } from '@/api/agent'
import { getApiMode } from '@/api/config'
import { saveArtifactHandoff } from '@/composables/useAgentArtifactHandoff'

const props = defineProps<{
  artifact: ArtifactRef
  sessionId?: string | null
}>()

const router = useRouter()
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const resolvedArtifact = ref<AgentArtifactDetail | null>(null)
const shownArtifact = computed(() => resolvedArtifact.value ?? props.artifact)

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
  return map[shownArtifact.value.kind] || '成果物'
})

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '待处理',
    running: '处理中',
    needs_input: '待用户确认',
    partial: '部分完成',
    completed: '已完成',
    failed: '失败',
    unverified: '待核验',
  }
  return map[shownArtifact.value.status] || shownArtifact.value.status || '待核验'
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

const resumePreview = computed(() => {
  if (previewType.value !== 'resume_improvement_preview') return null
  return props.artifact.preview as { recommendations?: Array<{ applied?: boolean }> }
})

function dimLabel(dim: string): string {
  return { d1: '基础素质', d2: '专业技能', d3: '项目经验', d4: '综合潜力' }[dim] || dim
}

function typedDetailPreview(type: string): Record<string, unknown> | null {
  const preview = shownArtifact.value.preview
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return null
  return (preview as Record<string, unknown>).type === type ? preview as Record<string, unknown> : null
}
const detailPortraitPreview = computed(() => typedDetailPreview('portrait_preview') as PortraitPreview | null)
const detailMatchPreview = computed(() => typedDetailPreview('match_preview') as MatchPreview | null)
const detailReportPreview = computed(() => typedDetailPreview('report_preview') as ReportPreview | null)
const detailPlanPreview = computed(() => typedDetailPreview('plan_preview') as PlanPreview | null)

async function openArtifact() {
  detailOpen.value = true
  detailError.value = ''
  resolvedArtifact.value = null
  detailLoading.value = true
  try {
    const fetched = await getAgentArtifact(props.artifact.artifact_id)
    if (fetched) {
      if (fetched.artifact_id !== props.artifact.artifact_id) throw new Error('成果物身份不一致')
      resolvedArtifact.value = fetched
    }
  } catch {
    detailError.value = '暂时无法核验最新产物，以下仅显示对话中保存的摘要。'
  } finally {
    detailLoading.value = false
  }
}

async function runAction(actionId: string) {
  if (actionId === 'open_pipeline_task') {
    const taskId = String((props.artifact.preview as Record<string, unknown> | undefined)?.task_id || '')
    if (/^task_[A-Za-z0-9]+$/.test(taskId)) {
      void router.push({ name: 'student-career-navigation', query: { task_id: taskId } })
    } else void openArtifact()
    return
  }
  if (actionId === 'confirm_resume') {
    const taskId = String((props.artifact.preview as Record<string, unknown> | undefined)?.task_id || '')
    if (/^task_[A-Za-z0-9]+$/.test(taskId)) {
      void router.push({ name: 'student-career-navigation', query: { task_id: taskId } })
      return
    }
  }
  const targetByAction: Record<string, string> = {
    view_portrait: 'student-career-portrait',
    open_match: 'student-career-analysis',
    open_report: 'student-career-report',
    continue_plan: 'student-learning',
    open_resume: 'student-resume-builder',
  }
  const target = targetByAction[actionId]
  if (target && props.artifact.status === 'completed') {
    if (getApiMode() !== 'mock') {
      if (actionId === 'continue_plan' && props.artifact.kind === 'action_plan' && props.sessionId) {
        void router.push({ name: target, query: { artifact_id: props.artifact.artifact_id, session_id: props.sessionId } })
        return
      }
      ElMessage.warning('这个功能页尚未接入正式业务记录，请先在对话中查看任务状态')
      return
    }
    try {
      const query = saveArtifactHandoff(props.artifact, props.sessionId || undefined)
      void router.push({ name: target, query })
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '无法打开成果物')
    }
    return
  }
  // Unfinished or unsupported artifacts remain inspectable without opening unrelated data.
  void openArtifact()
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
        <span v-if="reportPreview.word_count" class="artifact-card__chip">{{ reportPreview.word_count.toLocaleString('zh-CN') }} 字</span>
      </div>
    </div>

    <!-- 计划预览：步骤 + 已完成 -->
    <div v-else-if="planPreview && typeof planPreview.steps === 'number' && planPreview.steps > 0" class="artifact-card__typed-preview">
      <div class="artifact-card__plan-bar">
        <div
          class="artifact-card__plan-fill"
          :style="{ transform: `scaleX(${planPreview.steps ? (planPreview.completed || 0) / planPreview.steps : 0})` }"
        />
      </div>
      <span class="artifact-card__plan-text">
        {{ planPreview.completed || 0 }} / {{ planPreview.steps || 0 }} 步
        <template v-if="planPreview.duration"> · {{ planPreview.duration }}</template>
      </span>
    </div>

    <div v-else-if="resumePreview?.recommendations?.length" class="artifact-card__typed-preview">
      <span class="artifact-card__chip">{{ resumePreview.recommendations.filter(item => item.applied).length }} / {{ resumePreview.recommendations.length }} 条改进已处理</span>
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
    <div v-else class="artifact-card__actions"><button type="button" class="artifact-card__btn" @click="artifact.kind === 'pipeline_task' ? runAction('open_pipeline_task') : openArtifact()">{{ artifact.kind === 'pipeline_task' ? '查看任务' : '查看产物' }}</button></div>
  </section>

  <el-dialog v-model="detailOpen" :title="shownArtifact.title || kindLabel" width="min(560px, calc(100vw - 24px))" append-to-body class="agent-artifact-dialog">
    <div class="artifact-detail">
      <div class="artifact-detail__meta"><span>{{ kindLabel }}</span><span>{{ statusLabel }}</span></div>
      <p v-if="shownArtifact.summary" class="artifact-detail__summary">{{ shownArtifact.summary }}</p>
      <p v-if="detailLoading" class="artifact-detail__notice" role="status">正在核验产物…</p>
      <p v-else-if="detailError" class="artifact-detail__notice" role="status">{{ detailError }}</p>

      <div v-if="detailPortraitPreview?.scores" class="artifact-detail__scores">
        <div v-for="(score, dim) in detailPortraitPreview.scores" :key="dim"><span>{{ dimLabel(String(dim)) }}</span><strong>{{ score }}</strong></div>
      </div>
      <div v-if="detailMatchPreview" class="artifact-detail__scores">
        <div v-if="detailMatchPreview.total_score != null"><span>匹配分</span><strong>{{ detailMatchPreview.total_score }}</strong></div>
        <div v-if="detailMatchPreview.coverage != null"><span>覆盖率</span><strong>{{ detailMatchPreview.coverage }}%</strong></div>
        <div v-if="detailMatchPreview.hard_pass === false"><span>硬约束</span><strong>未通过</strong></div>
      </div>
      <div v-if="detailPortraitPreview?.strengths?.length" class="artifact-detail__list"><strong>已有优势</strong><span>{{ detailPortraitPreview.strengths.join('、') }}</span></div>
      <div v-if="detailPortraitPreview?.weaknesses?.length" class="artifact-detail__list"><strong>优先改进</strong><span>{{ detailPortraitPreview.weaknesses.join('、') }}</span></div>
      <div v-if="detailMatchPreview?.gaps?.length" class="artifact-detail__list"><strong>能力差距</strong><span>{{ detailMatchPreview.gaps.join('、') }}</span></div>
      <div v-if="detailReportPreview?.chapters?.length" class="artifact-detail__list"><strong>报告章节</strong><span>{{ detailReportPreview.chapters.join('、') }}</span></div>
      <div v-if="detailReportPreview?.word_count" class="artifact-detail__list"><strong>内容长度</strong><span>{{ detailReportPreview.word_count.toLocaleString('zh-CN') }} 字</span></div>
      <div v-if="detailPlanPreview && typeof detailPlanPreview.steps === 'number' && detailPlanPreview.steps > 0" class="artifact-detail__list"><strong>计划进度</strong><span>{{ detailPlanPreview.completed || 0 }} / {{ detailPlanPreview.steps }} 步<template v-if="detailPlanPreview.duration"> · {{ detailPlanPreview.duration }}</template></span></div>

      <p class="artifact-detail__boundary">这是本次对话保存的索引与摘要。只有后端可核验的业务记录才能在对应功能页打开；尚未提交的结果不会冒充正式产物。</p>
      <div class="artifact-detail__footer"><button type="button" @click="detailOpen = false">返回对话</button></div>
    </div>
  </el-dialog>
</template>

<style scoped>
.artifact-card {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  padding: 12px;
  color: var(--color-text);
}

.artifact-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.artifact-card__status {
  margin-left: auto;
  color: var(--color-text-muted);
}

.artifact-card__title {
  margin: 8px 0 0;
  font-size: 14px;
}

.artifact-card__summary {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
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
  background: var(--chat-rail-bg);
  color: var(--color-text-muted);
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
  color: var(--color-text-muted);
}

.artifact-card__dim-score {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
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
  color: var(--color-text);
}

.artifact-card__stat--warn .artifact-card__stat-val {
  color: #dc2626;
}

.artifact-card__stat-label {
  display: block;
  font-size: 10px;
  color: var(--color-text-muted);
}

.artifact-card__report-stats {
  display: flex;
  gap: 6px;
}

.artifact-card__plan-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--chat-rail-bg);
  overflow: hidden;
}

.artifact-card__plan-fill {
  height: 100%;
  width: 100%;
  border-radius: 3px;
  background: var(--color-primary);
  transform-origin: left center;
  transition: transform 0.4s ease;
}

.artifact-card__plan-text {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.artifact-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.artifact-card__btn {
  border: 0;
  border-radius: 7px;
  background: var(--color-text);
  color: white;
  cursor: pointer;
  padding: 5px 10px;
  font-size: 12px;
}
.artifact-card__btn:hover { opacity: .88; }
.artifact-card__btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.artifact-detail { display: grid; gap: 14px; color: var(--color-text); }
.artifact-detail__meta { display: flex; gap: 7px; color: var(--color-text-muted); font-size: 11px; }
.artifact-detail__meta span { padding: 4px 7px; border-radius: 5px; background: var(--chat-rail-bg); }
.artifact-detail__summary { margin: 0; color: var(--color-text); font-size: 14px; line-height: 1.65; }
.artifact-detail__notice { margin: 0; color: var(--color-text-muted); font-size: 12px; }
.artifact-detail__scores { display: grid; grid-template-columns: repeat(auto-fit,minmax(90px,1fr)); gap: 8px; }
.artifact-detail__scores > div { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 9px; background: var(--chat-rail-bg); }
.artifact-detail__scores span { color: var(--color-text-muted); font-size: 11px; }
.artifact-detail__scores strong { color: var(--color-text); font-size: 20px; }
.artifact-detail__list { display: flex; flex-direction: column; gap: 3px; padding-top: 8px; border-top: 1px solid var(--color-border); font-size: 12px; line-height: 1.5; }
.artifact-detail__list strong { font-weight: 600; }.artifact-detail__list span { color: var(--color-text-muted); }
.artifact-detail__boundary { margin: 4px 0 0; color: var(--color-text-muted); font-size: 11px; line-height: 1.55; }
.artifact-detail__footer { display: flex; justify-content: flex-end; }.artifact-detail__footer button { border: 1px solid var(--color-border); border-radius: 7px; padding: 7px 12px; background: var(--color-surface); color: var(--color-text); font: inherit; font-size: 12px; cursor: pointer; }
</style>
