<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/types'
import {
  getResumeEntityReview,
  postResumeEntityReview,
  type EntityReviewAction,
  type ResumeEntityMentionReview,
  type ResumeEntityReviewSnapshot,
} from '@/api/entityReview'
import type { ResumeDiagnosticItem } from '@/api/report'

const props = defineProps<{
  confirmationTaskId: string
  reportItems: ResumeDiagnosticItem[]
}>()

const snapshot = ref<ResumeEntityReviewSnapshot | null>(null)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const conflictNotice = ref('')
let requestSequence = 0
let retryableRequest: { revision: number; index: number; action: EntityReviewAction; requestId: string } | null = null

const hasUsableSource = computed(() => !!snapshot.value
  && snapshot.value.source_confirmation_task_id === props.confirmationTaskId)

function labelDecision(decision?: string | null): string {
  if (decision === 'equivalent') return '模型判断：可能等价'
  if (decision === 'related') return '模型判断：相关但不等价'
  return '模型暂未找到可靠对应项'
}

function labelReview(action?: string | null): string {
  if (action === 'accept') return '已记录：接受当前建议'
  if (action === 'reject') return '已记录：拒绝当前建议'
  if (action === 'defer') return '已记录：暂缓判断'
  return '待你核验'
}

function reviewEvidence(item: ResumeEntityMentionReview) {
  const mentionName = String(item.mention?.name || '').trim().toLocaleLowerCase()
  const quote = String(item.mention?.evidence || '').trim()
  const byLabel = props.reportItems.filter(reportItem => {
    const fields = typeof reportItem.fields === 'object' && reportItem.fields ? reportItem.fields : {}
    const original = String(fields.original_mention || reportItem.label || '').trim().toLocaleLowerCase()
    return !!mentionName && original === mentionName
  })
  const byQuote = byLabel.flatMap(reportItem => reportItem.evidence_refs || [])
    .filter(ref => !!quote && ref.quote === quote)
  // Only attach page/block locators on exact quote equality. If report and
  // linking excerpts differ, retain the original quote but don't guess its page.
  return { quote, refs: byQuote }
}

function publicReviewStatus(record: ResumeEntityMentionReview['review']): string {
  if (!record) return ''
  if (record.action === 'accept' && record.relation === 'related') {
    return '已接受“相关”建议；这不会升级为等价，也没有写入公共图谱。'
  }
  if (record.action === 'accept') return '已接受当前等价建议；这只是审阅记录，没有改写简历或写入公共图谱。'
  if (record.action === 'reject') return '已拒绝当前建议；原始简历和公共图谱均未修改。'
  return '已暂缓判断；原始简历和公共图谱均未修改。'
}

function bodyStatus(errorValue: unknown): string {
  if (!(errorValue instanceof ApiError) || !errorValue.body || typeof errorValue.body !== 'object') return ''
  return String((errorValue.body as { status?: unknown }).status || '')
}

async function refreshReview(keepConflict = false) {
  const seq = ++requestSequence
  loading.value = true
  error.value = ''
  if (!keepConflict) conflictNotice.value = ''
  try {
    const response = await getResumeEntityReview()
    if (seq !== requestSequence) return
    if (!response.success || !response.data) throw new Error(response.error || '实体审阅状态未返回')
    if (response.data.source_confirmation_task_id !== props.confirmationTaskId) {
      snapshot.value = null
      error.value = '当前报告属于另一份简历确认版本。为避免误审，已停用本页操作，请重新读取当前简历报告。'
      return
    }
    snapshot.value = response.data
  } catch (e) {
    if (seq !== requestSequence) return
    const status = bodyStatus(e)
    error.value = e instanceof ApiError && e.status === 404
      ? '当前简历尚无可审阅的实体提议。请重新解析简历并生成报告。'
      : status === 'stale'
        ? '简历版本已变化，当前实体候选已失效。请重新打开当前简历报告。'
        : (e instanceof Error ? e.message : '实体审阅状态读取失败')
    snapshot.value = null
  } finally {
    if (seq === requestSequence) loading.value = false
  }
}

async function submitReview(mention: ResumeEntityMentionReview, action: EntityReviewAction) {
  const current = snapshot.value
  if (!current || !hasUsableSource.value || submitting.value) return
  if (action === 'accept' && !['equivalent', 'related'].includes(mention.proposal?.decision || '')) return
  submitting.value = true
  error.value = ''
  conflictNotice.value = ''
  try {
    if (!retryableRequest || retryableRequest.revision !== current.revision
      || retryableRequest.index !== mention.mention_index || retryableRequest.action !== action) {
      retryableRequest = {
        revision: current.revision,
        index: mention.mention_index,
        action,
        requestId: crypto.randomUUID(),
      }
    }
    const response = await postResumeEntityReview({
      source_confirmation_task_id: current.source_confirmation_task_id,
      source_sha256: current.source_sha256,
      request_id: retryableRequest.requestId,
      expected_revision: current.revision,
      reviews: [{ mention_index: mention.mention_index, action }],
    })
    if (!response.success || !response.data) throw new Error(response.error || '实体审阅未返回已提交状态')
    if (response.data.source_confirmation_task_id !== props.confirmationTaskId) {
      throw new Error('服务端返回的简历版本已变化；已拒绝展示为本次审阅结果。')
    }
    snapshot.value = response.data
    retryableRequest = null
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      retryableRequest = null
      conflictNotice.value = '简历或审阅版本在提交期间已变化，正在重新读取服务器状态；未采用本地乐观结果。'
      await refreshReview(true)
    } else if (bodyStatus(e) === 'stale') {
      retryableRequest = null
      conflictNotice.value = '这份简历版本已过期，正在重新读取权威状态。'
      await refreshReview(true)
    } else {
      error.value = e instanceof Error ? e.message : '实体审阅提交失败'
    }
  } finally {
    submitting.value = false
  }
}

watch(() => props.confirmationTaskId, () => {
  snapshot.value = null
  retryableRequest = null
  void refreshReview()
}, { immediate: true })
</script>

<template>
  <section class="entity-review" aria-label="实体候选审阅">
    <header class="er-header">
      <div><h4><Icon icon="lucide:git-compare-arrows" :width="15" />实体候选审阅</h4><p>逐条核对简历原词与模型建议。你的选择只保存为本简历版本的审阅记录，不会改写简历或公共图谱。</p></div>
      <button type="button" class="er-refresh" :disabled="loading || submitting" @click="refreshReview()"><Icon icon="lucide:refresh-cw" :width="13" />刷新</button>
    </header>

    <div v-if="loading" class="er-state" role="status"><Icon icon="lucide:loader-circle" :width="17" class="er-spin" />正在读取当前简历版本的审阅状态…</div>
    <div v-else-if="error" class="er-state er-state--error" role="alert"><Icon icon="lucide:triangle-alert" :width="16" />{{ error }}</div>
    <div v-else-if="!snapshot || !snapshot.mentions.length" class="er-state"><Icon icon="lucide:scan-search" :width="16" />当前版本没有可逐项审阅的实体候选。</div>
    <template v-else>
      <p v-if="conflictNotice" class="er-conflict" role="status"><Icon icon="lucide:refresh-cw" :width="14" />{{ conflictNotice }}</p>
      <div class="er-version">审阅版本 {{ snapshot.revision }} · 提议状态：{{ snapshot.entity_linking_status === 'proposed' ? '已生成候选' : snapshot.entity_linking_status }} · 图谱发布：未请求</div>
      <article v-for="mention in snapshot.mentions" :key="mention.mention_index" class="er-mention">
        <div class="er-mention__top">
          <span class="er-index">{{ String(mention.mention_index + 1).padStart(2, '0') }}</span>
          <div class="er-mention__title"><h5>{{ mention.mention.name || '未命名实体' }}</h5><span>{{ labelDecision(mention.proposal?.decision) }}</span></div>
          <span class="er-review-state" :class="{ 'er-review-state--saved': !!mention.review }">{{ labelReview(mention.review?.action) }}</span>
        </div>
        <div class="er-evidence">
          <span class="er-eyebrow">简历原文</span>
          <blockquote>{{ reviewEvidence(mention).quote || '服务端未提供可直接展示的实体原文片段。' }}</blockquote>
          <div v-if="reviewEvidence(mention).refs.length" class="er-pages">
            <span v-if="reviewEvidence(mention).refs.length">已定位原文片段</span>
          </div>
        </div>
        <div class="er-proposal">
          <div><span class="er-eyebrow">模型提出的库内候选</span><strong v-if="mention.candidate">{{ mention.candidate.name }}</strong><span v-else class="er-no-candidate">没有可靠候选</span></div>
          <span v-if="mention.candidate?.category" class="er-category">{{ mention.candidate.category }}</span>
          <p v-if="mention.proposal?.rationale">{{ mention.proposal.rationale }}</p>
        </div>
        <p v-if="mention.review" class="er-saved-note"><Icon icon="lucide:shield-check" :width="13" />{{ publicReviewStatus(mention.review) }}<span v-if="mention.review.note">补充：{{ mention.review.note }}</span></p>
        <div class="er-actions">
          <button type="button" :disabled="submitting || !mention.candidate || !['equivalent', 'related'].includes(mention.proposal?.decision || '')" @click="submitReview(mention, 'accept')">
            <Icon icon="lucide:check" :width="13" />{{ mention.proposal?.decision === 'related' ? '接受相关建议' : '接受等价建议' }}
          </button>
          <button type="button" :disabled="submitting" @click="submitReview(mention, 'reject')"><Icon icon="lucide:x" :width="13" />拒绝</button>
          <button type="button" :disabled="submitting" @click="submitReview(mention, 'defer')"><Icon icon="lucide:clock-3" :width="13" />暂缓</button>
        </div>
      </article>
      <p class="er-footnote">接受“相关”建议不会把它升级为等价实体；所有审阅仅限当前用户与当前确认简历版本。</p>
    </template>
  </section>
</template>

<style scoped>
.entity-review { margin-top: 16px; }
.er-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.er-header h4 { display: flex; align-items: center; gap: 7px; margin: 0; color: #37332d; font-size: 13px; }
.er-header p { max-width: 640px; margin: 6px 0 0; color: #7c756c; font-size: 11px; line-height: 1.6; }
.er-refresh { display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; min-height: 29px; padding: 0 9px; border: 1px solid #ddd5ca; background: #fff; color: #756d62; font: inherit; font-size: 10px; cursor: pointer; }
.er-refresh:disabled,.er-actions button:disabled { opacity: .48; cursor: wait; }
.er-state { display: flex; align-items: center; gap: 9px; padding: 14px; border: 1px solid #ded8cf; background: #fff; color: #77716a; font-size: 11px; line-height: 1.6; }
.er-state--error { border-color: #dbb7a9; color: #9b3e27; }
.er-spin { animation: er-spin .9s linear infinite; }
.er-conflict { display: flex; align-items: flex-start; gap: 7px; margin: 0 0 10px; padding: 10px 12px; border-left: 3px solid #ae7336; background: #f7f0e5; color: #75552f; font-size: 11px; line-height: 1.55; }
.er-version { margin: 0 0 9px; color: #979086; font-size: 10px; }
.er-mention { margin: 9px 0; padding: 14px; border: 1px solid #e1dbd2; background: #fff; }
.er-mention__top { display: flex; align-items: center; gap: 9px; }
.er-index { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #f1e8df; color: #93422b; font: 600 10px Georgia, serif; }
.er-mention__title { display: grid; gap: 3px; min-width: 0; }
.er-mention__title h5 { margin: 0; color: #34302a; font-size: 13px; }
.er-mention__title span { color: #8a7c69; font-size: 10px; }
.er-review-state { margin-left: auto; color: #80796f; font-size: 10px; text-align: right; }
.er-review-state--saved { color: #466448; }
.er-eyebrow { display: block; margin-bottom: 5px; color: #948a7d; font-size: 9px; font-weight: 700; letter-spacing: .06em; }
.er-evidence { margin: 12px 0; padding: 9px 11px; border-left: 2px solid #d8b7a7; background: #faf8f5; }
.er-evidence blockquote { margin: 0; color: #625c54; font-size: 11px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.er-pages { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; color: #9b492f; font-size: 9px; }
.er-pages span { padding: 3px 6px; border: 1px solid #eadbd1; background: #fff; }
.er-proposal { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 11px; }
.er-proposal > div { display: grid; gap: 3px; }
.er-proposal strong { color: #4b463d; font-size: 12px; }
.er-no-candidate { color: #8b857c; font-size: 11px; }
.er-category { padding: 3px 7px; border: 1px solid #e3ddd5; border-radius: 99px; color: #7a746a; font-size: 9px; }
.er-proposal p { flex-basis: 100%; margin: 0; color: #797268; font-size: 10px; line-height: 1.55; }
.er-saved-note { display: flex; align-items: flex-start; gap: 6px; margin: 10px 0 0; color: #557254; font-size: 10px; line-height: 1.55; }
.er-saved-note span { color: #77716a; }
.er-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
.er-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 30px; padding: 0 9px; border: 1px solid #ddd6cc; background: #fff; color: #655f55; font: inherit; font-size: 10px; cursor: pointer; }
.er-actions button:first-child { border-color: #cfae9e; color: #97442a; }
.er-actions button:hover:not(:disabled) { background: #f8f3ee; }
.er-footnote { margin: 10px 0 0; color: #978f85; font-size: 10px; line-height: 1.55; }
@keyframes er-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .er-spin { animation-duration: 2s; } }
</style>
