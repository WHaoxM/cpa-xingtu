<!-- 我的报告：同一套双书架，真实数据与显式演示分开读取。 -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useRoute, useRouter } from 'vue-router'
import { useReportStore } from '@/stores/report'
import { useUserStore } from '@/stores/user'
import { useLearningStore } from '@/stores'
import type { ReportRecord, AIAnalysisResult } from '@/types'
import type { PortraitSnapshot } from '@/api/pipeline'
import { getStudentWorkbenchState } from '@/api/pipeline'
import { followupLocation, currentPortraitLocation, type PortraitFocus } from '@/utils/portraitFollowup'
import { mockReportRecords } from '@/mock/data'
import { getApiMode } from '@/api/config'
import { openAgentWithResource } from '@/composables/useAgentResourceHandoff'
import { useReportBookshelves, type ShelfKind } from '@/composables/useReportBookshelves'
import BookshelfScene from '@/components/bookshelf/BookshelfScene.vue'
import BookOpenOverlay from '@/components/bookshelf/BookOpenOverlay.vue'
import AIMascot from '@/components/ai-mascot/AIMascot.vue'
import AIMascotResultCard from '@/components/ai-mascot/AIMascotResultCard.vue'
import ServerReportDetail from '@/components/reports/ServerReportDetail.vue'
import ServerPortraitDetail from '@/components/reports/ServerPortraitDetail.vue'

const router = useRouter(), route = useRoute()
const reportStore = useReportStore(), userStore = useUserStore(), learningStore = useLearningStore()
const isHttpMode = getApiMode() === 'http'
const library = useReportBookshelves(() => userStore.currentUser?.id || '', route, router, isHttpMode)
const { shelves, detail } = library
const kinds: ShelfKind[] = ['portrait', 'career']
const portraitList = computed(() => isHttpMode ? shelves.portrait.books : reportStore.portraitRecords)
const careerList = computed(() => isHttpMode ? shelves.career.books : reportStore.careerRecords)
const books = (kind: ShelfKind) => kind === 'portrait' ? portraitList.value : careerList.value
const overlayVisible = ref(false), overlayRecord = ref<ReportRecord | null>(null)
const overlayType = ref<ShelfKind | null>(null), overlayOrigin = ref({ x: 0, y: 0 })
const analysisResult = ref<AIAnalysisResult | null>(null), showResultCard = ref(false)
const guideVisible = ref(false)
const shownBook = computed(() => isHttpMode ? library.overlayBook.value : overlayRecord.value)
const shown = computed(() => isHttpMode ? !!library.selection.value && !!userStore.currentUser : overlayVisible.value)
const portraitDetail = computed(() => detail.book?.source === 'portrait_snapshot'
  ? detail.book.snapshot as unknown as PortraitSnapshot : null)
const readingActionLoading = ref(false), readingActionError = ref(''), currentPortraitReady = ref(false)
const currentPortraitLoading = ref(false), currentPortraitUnavailable = ref(false)
let readingActionEpoch = 0
watch([portraitDetail, () => userStore.currentUser?.id], () => {
  const epoch = ++readingActionEpoch, owner = userStore.currentUser?.id
  readingActionLoading.value = false; readingActionError.value = ''; currentPortraitReady.value = false
  currentPortraitLoading.value = false; currentPortraitUnavailable.value = false
  if (portraitDetail.value && !portraitDetail.value.is_current && owner) {
    currentPortraitLoading.value = true
    void getStudentWorkbenchState().then(response => {
      if (!response.success || !response.data) throw Error('unavailable')
      if (epoch === readingActionEpoch && owner === userStore.currentUser?.id && response.success && response.data) {
        currentPortraitReady.value = !!currentPortraitLocation(response.data).query
      }
    }).catch(() => {
      if (epoch === readingActionEpoch && owner === userStore.currentUser?.id) currentPortraitUnavailable.value = true
    }).finally(() => { if (epoch === readingActionEpoch) currentPortraitLoading.value = false })
  }
}, { flush: 'sync' })
onBeforeUnmount(() => { ++readingActionEpoch })
async function followPortrait(focus?: PortraitFocus) {
  if (!portraitDetail.value || readingActionLoading.value) return
  const snapshot = portraitDetail.value, owner = userStore.currentUser?.id, epoch = ++readingActionEpoch
  readingActionLoading.value = true; readingActionError.value = ''
  try {
    const response = await getStudentWorkbenchState()
    if (epoch !== readingActionEpoch || owner !== userStore.currentUser?.id) return
    if (!response.success || !response.data) throw Error('当前资料暂时无法读取，请再次点击重试。')
    const state = response.data
    if (!focus && currentPortraitLocation(state).query) {
      await library.load('portrait')
      if (epoch !== readingActionEpoch || owner !== userStore.currentUser?.id) return
      await router.push(currentPortraitLocation(state)); return
    }
    const target = followupLocation(state, focus || 'resume')
    if (!target) {
      readingActionError.value = '目前没有可核对的已确认简历。请先从职途导航确认本人资料；这里不会自动上传或修改简历。'
      return
    }
    await router.push({ ...target, query: { ...target.query,
      ...(state.source_confirmation_task_id !== snapshot.source_confirmation_task_id ? { updated: '1' } : {}) } })
  } catch {
    if (epoch === readingActionEpoch && owner === userStore.currentUser?.id) readingActionError.value = '当前资料暂时无法读取，请再次点击重试。已有内容不会因此改变。'
  } finally {
    if (epoch === readingActionEpoch) readingActionLoading.value = false
  }
}

async function onBookFlyOut(payload: { record: ReportRecord; originX: number; originY: number; type: ShelfKind }) {
  if (isHttpMode && !books(payload.type).some(item => item.id === payload.record.id)) return
  overlayOrigin.value = { x: payload.originX, y: payload.originY }
  guideVisible.value = false
  if (isHttpMode) { await library.open(payload.record); return }
  const data = await reportStore.fetchReportDetailById(payload.record.id)
  overlayRecord.value = data ?? payload.record
  overlayType.value = payload.type; overlayVisible.value = true
}
function closeOverlay() {
  if (isHttpMode) {
    const selected = library.selection.value
    void library.close().then(async () => {
      await nextTick()
      const book = selected?.id ? document.querySelector<HTMLElement>(
        `.book-item[data-book-id="${CSS.escape(selected.id)}"]`) : null
      const heading = document.querySelector<HTMLElement>(`[data-shelf="${selected?.kind || 'portrait'}"] .bookcase-label`)
      ;(book || heading)?.focus()
    })
    return
  }
  overlayVisible.value = false; overlayRecord.value = null; overlayType.value = null
}
function removeAndCloseOverlay(id: string) { if (!isHttpMode) { reportStore.removeRecord(id); closeOverlay() } }
function askAboutServerReport(id: string) {
  if (detail.loading || detail.error || detail.book?.source !== 'career_report' || detail.book.id !== id) return
  openAgentWithResource(router, { kind: 'career_resource', uri: `career://me/reports/${encodeURIComponent(id)}` })
}
async function chooseReport() {
  if (detail.book?.source === 'career_report') { askAboutServerReport(detail.book.id); return }
  guideVisible.value = true
  await nextTick()
  document.querySelector<HTMLElement>('[data-shelf="career"] .book-item')?.focus()
}
function onAnalysisReady(result: AIAnalysisResult) { analysisResult.value = result; showResultCard.value = true }
onMounted(async () => {
  if (isHttpMode) return
  await reportStore.fetchReportList(userStore.currentUser?.id)
  if (!reportStore.mockInitialized) {
    if (!reportStore.records.length) reportStore.records.push(...mockReportRecords.map(item => ({ ...item })))
    reportStore.mockInitialized = true
  }
})
</script>

<template>
  <div class="bookcase-page page page--compact">
    <div v-if="isHttpMode" class="report-library-heading">
      <div><h1>我的报告</h1><p>把每一次了解自己的发现，收在这里。</p></div>
      <button class="library-refresh" @click="library.load('portrait'); library.load('career'); library.readSelection()" :disabled="shelves.portrait.loading || shelves.career.loading"><Icon icon="lucide:refresh-cw" :width="14" />刷新书架</button>
    </div>
    <p v-if="isHttpMode && guideVisible" class="report-guide" role="status">
      {{ shelves.career.loading ? '正在整理你的岗位报告，请稍候。' : shelves.career.error ? '岗位报告暂时无法读取，请在书架下方重试。' : shelves.career.total ? '请从职业报告书架选一本，打开后点击“问问这份报告”。' : '还没有可解读的岗位报告。先从岗位目录选择岗位，再结合已确认的简历生成报告。' }}
      <button v-if="!shelves.career.loading && !shelves.career.error && !shelves.career.total" @click="router.push({ name: 'student-job-catalog' })">去岗位目录</button>
    </p>
    <div class="bookcases-layout">
      <section v-for="kind in kinds" :key="kind" class="bookcase-unit" :data-shelf="kind" :aria-label="kind === 'portrait' ? '个人能力画像书架' : '职业报告书架'">
        <div class="bookcase-label" tabindex="-1">
          <span class="section-badge" :class="`section-badge--${kind}`"><Icon :icon="kind === 'portrait' ? 'lucide:user-circle' : 'lucide:briefcase'" :width="14" /></span>
          {{ kind === 'portrait' ? '个人能力画像' : '职业生涯发展' }}
          <span class="section-count">{{ isHttpMode ? (shelves[kind].loading || shelves[kind].error ? '—' : shelves[kind].total) : books(kind).length }}</span>
          <button class="label-entry" :class="`label-entry--${kind}`" @click="router.push({ name: kind === 'portrait' ? 'student-career-navigation' : isHttpMode ? 'student-job-catalog' : 'student-career-report' })">
            <Icon :icon="kind === 'portrait' ? 'lucide:scan-face' : 'lucide:compass'" :width="12" />
            {{ isHttpMode ? (kind === 'portrait' ? '完善简历' : '浏览岗位') : '开始测评' }}
            <Icon icon="lucide:chevron-right" :width="11" />
          </button>
        </div>
        <BookshelfScene :books="books(kind)" :type="kind" :empty-text="isHttpMode ? shelves[kind].loading ? '正在整理书架…' : shelves[kind].error ? '暂时无法读取' : kind === 'portrait' ? '核对简历后，你的画像会放在这里' : '生成的岗位报告会收在这里' : undefined"
          @book-fly-out="onBookFlyOut" @capacity="count => isHttpMode && library.capacity(kind, count)" />
        <div v-if="isHttpMode && shelves[kind].error" class="shelf-feedback" role="alert">{{ shelves[kind].error }}<button @click="library.load(kind)">重试读取</button></div>
        <nav v-else-if="isHttpMode && shelves[kind].total > shelves[kind].limit" class="shelf-pager" :aria-label="`${kind === 'portrait' ? '画像' : '职业报告'}翻页`">
          <button :disabled="shelves[kind].loading || shelves[kind].page <= 1" @click="library.paginate(kind, shelves[kind].page - 1)">上一页</button>
          <span>第 {{ shelves[kind].page }} / {{ Math.ceil(shelves[kind].total / shelves[kind].limit) }} 页</span>
          <button :disabled="shelves[kind].loading || shelves[kind].page * shelves[kind].limit >= shelves[kind].total" @click="library.paginate(kind, shelves[kind].page + 1)">下一页</button>
        </nav>
      </section>
    </div>

    <BookOpenOverlay :visible="shown" :record="shownBook" :type="isHttpMode ? library.selection.value?.kind || null : overlayType" :server-mode="isHttpMode"
      :origin-x="overlayOrigin.x" :origin-y="overlayOrigin.y" @close="closeOverlay" @remove="removeAndCloseOverlay">
      <div v-if="detail.loading" class="reading-state" role="status"><Icon icon="lucide:book-open" :width="26" /><h2>正在打开这份报告</h2><p>稍等片刻，正在取回你保存的内容。</p></div>
      <div v-else-if="detail.error" class="reading-state" role="alert"><h2>暂时无法阅读</h2><p>{{ detail.error }}</p><button @click="library.readSelection()">重新读取</button><button @click="closeOverlay">返回书架</button></div>
      <ServerPortraitDetail v-else-if="portraitDetail" chaptered :snapshot="portraitDetail" :action-loading="readingActionLoading" :action-error="readingActionError" :current-ready="currentPortraitReady" :current-loading="currentPortraitLoading" :current-unavailable="currentPortraitUnavailable" @action="followPortrait" @current="followPortrait()" />
      <ServerReportDetail v-else-if="detail.book?.source === 'career_report'" :report="detail.book" embedded @ask="askAboutServerReport" />
    </BookOpenOverlay>
    <AIMascot :report-records="isHttpMode ? careerList : reportStore.records" :user-id="userStore.currentUser?.id" :target-roles="learningStore.targetRoles" :report-guide="isHttpMode" @choose-report="chooseReport" @analysis-ready="onAnalysisReady" />
    <AIMascotResultCard v-if="!isHttpMode" :visible="showResultCard" :result="analysisResult" @close="showResultCard = false" />
  </div>
</template>

<style scoped>
.agent-handoff {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.4rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.agent-handoff button {
  flex-shrink: 0;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #fff;
  padding: 0.25rem 0.55rem;
  cursor: pointer;
}

.bookcase-page {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  height: 100%;
  overflow: hidden;
  padding-left: 0 !important;
  padding-right: 0 !important;
  position: relative;
}

.bookcases-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  gap: 0.5rem;
  align-items: stretch;
  overflow: hidden;
}

.bookcase-unit {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.55rem 0.58rem 0.62rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  position: relative;
}

.bookcase-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: 0;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.4rem;
}

.section-count {
  font-size: 0.68rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.08rem 0.4rem;
  color: var(--color-text-muted);
  font-family: var(--font-latin, monospace);
  letter-spacing: 0.04em;
}

.label-entry {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  border: 1px solid currentColor;
  border-radius: var(--radius-md);
  padding: 0.15rem 0.5rem;
  cursor: pointer;
  background: transparent;
  transition: opacity 0.15s, background 0.15s;
  white-space: nowrap;
}

.label-entry:hover {
  opacity: 0.82;
}

.label-entry--portrait {
  color: #fff;
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.label-entry--portrait:hover {
  opacity: 0.88;
}

.label-entry--career {
  color: #fff;
  background: var(--color-secondary);
  border-color: var(--color-secondary);
}

.label-entry--career:hover {
  opacity: 0.88;
}

.empty-hint {
  margin-top: -0.1rem;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding: 0.38rem 0.5rem;
  border: 1px dashed var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
}

.hint-actions {
  display: inline-flex;
  gap: 0.45rem;
}

.hint-btn {
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 0.72rem;
  padding: 0.22rem 0.62rem;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
  transition: opacity 0.15s;
}

.hint-btn:hover { opacity: 0.84; }

.hint-btn--ghost {
  background: transparent;
  color: var(--color-text-muted);
  border-color: var(--color-border);
}

.section-badge {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.section-badge--portrait {
  background: var(--color-primary);
}

.section-badge--career {
  background: var(--color-secondary);
}

@media (max-width: 1024px) {
  .bookcases-layout {
    gap: 0.8rem;
  }
}

@media (max-width: 768px) {
  .bookcases-layout {
    flex-direction: column;
    gap: 0.7rem;
  }

  .bookcase-unit {
    flex: 1 1 auto;
    padding: 0.48rem;
  }
}

.report-library-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:6px 14px 0; }
.report-library-heading h1 { margin:0; font:600 23px var(--font-serif); color:var(--color-text); }
.report-library-heading p { margin:6px 0 0; color:var(--color-text-muted); font-size:12px; }
.library-refresh, .shelf-pager button, .shelf-feedback button, .reading-state button, .report-guide button { border:1px solid var(--color-border); background:var(--color-surface); border-radius:var(--radius-sm); padding:8px 12px; font:inherit; font-size:12px; color:var(--color-primary); cursor:pointer; }
.library-refresh { display:inline-flex; align-items:center; gap:6px; }
button:disabled { opacity:.5; cursor:default; }
.shelf-pager { display:flex; align-items:center; justify-content:center; gap:14px; font-size:12px; color:var(--color-text-muted); }
.shelf-feedback, .report-guide { font-size:13px; line-height:1.7; color:var(--color-text-muted); padding:8px 12px; margin:0; }
.shelf-feedback button, .report-guide button { margin-left:12px; }
.reading-state { padding:64px 24px; text-align:center; color:var(--color-text-muted); }
.reading-state h2 { font-family:var(--font-serif); color:var(--color-text); }
.reading-state button { margin:12px 6px; }
@media(max-width:768px) { .bookcase-page { overflow:auto; height:auto; min-height:100%; padding-bottom:90px; } .bookcases-layout { flex-direction:column; overflow:visible; flex:none; } .bookcase-unit { flex:none; min-height:440px; } .report-library-heading { align-items:start; } }
</style>
