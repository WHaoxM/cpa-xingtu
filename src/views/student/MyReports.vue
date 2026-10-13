<!-- 页面：我的报告；路由：student/my-reports；角色：STUDENT -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { useReportStore } from '@/stores/report'
import { useUserStore } from '@/stores/user'
import { useLearningStore } from '@/stores'
import type { ReportRecord, AIAnalysisResult } from '@/types'
import { mockReportRecords } from '@/mock/data'
import { getApiMode } from '@/api/config'
import { getReportList } from '@/api/report'
import { openAgentWithResource } from '@/composables/useAgentResourceHandoff'
import { hasServerReportCollection } from '@/composables/agentResourceHandoffContract'
import BookshelfScene from '@/components/bookshelf/BookshelfScene.vue'
import BookOpenOverlay from '@/components/bookshelf/BookOpenOverlay.vue'
import AIMascot from '@/components/ai-mascot/AIMascot.vue'
import AIMascotResultCard from '@/components/ai-mascot/AIMascotResultCard.vue'

const router = useRouter()

const reportStore = useReportStore()
const userStore = useUserStore()
const learningStore = useLearningStore()

const portraitList = computed(() => reportStore.portraitRecords)
const careerList = computed(() => reportStore.careerRecords)

const overlayVisible = ref(false)
const overlayRecord = ref<ReportRecord | null>(null)
const overlayType = ref<'portrait' | 'career' | null>(null)
const overlayOrigin = ref({ x: 0, y: 0 })

const analysisResult = ref<AIAnalysisResult | null>(null)
const showResultCard = ref(false)
// The store may contain persisted fixtures or locally fabricated saves. Only a
// fresh owner-scoped HTTP response can make the collection handoff visible.
const hasServerReports = ref(false)

function askAgentToCheckReports() {
  if (!hasServerReports.value) return
  openAgentWithResource(router, { kind: 'career_resource', uri: 'career://me/reports' })
}

function onAnalysisReady(result: AIAnalysisResult) {
  analysisResult.value = result
  showResultCard.value = true
}

async function onBookFlyOut(payload: { record: ReportRecord; originX: number; originY: number; type: 'portrait' | 'career' }) {
  const detail = await reportStore.fetchReportDetailById(payload.record.id)
  overlayRecord.value = detail ?? payload.record
  overlayType.value = payload.type
  overlayOrigin.value = { x: payload.originX, y: payload.originY }
  overlayVisible.value = true
}

function closeOverlay() {
  overlayVisible.value = false
  overlayRecord.value = null
  overlayType.value = null
}

function removeAndCloseOverlay(id: string) {
  reportStore.removeRecord(id)
  closeOverlay()
}

onMounted(async () => {
  const uid = userStore.currentUser?.id
  await reportStore.fetchReportList(uid)
  if (getApiMode() === 'http' && uid) {
    try {
      const serverRows = await getReportList(uid)
      hasServerReports.value = hasServerReportCollection(getApiMode(), serverRows)
    } catch {
      hasServerReports.value = false
    }
  }
  // fixtures/API 已返回列表时不再灌入旧 mockReportRecords
  if (!reportStore.mockInitialized) {
    if (reportStore.records.length === 0) {
      reportStore.records.push(...mockReportRecords.map(item => ({ ...item })))
    }
    reportStore.mockInitialized = true
  }
})
</script>

<template>
  <div class="bookcase-page page page--compact">
    <div v-if="hasServerReports" class="agent-handoff">
      <span>可让 Agent 核验服务端报告；本地演示报告不会作为可信依据。</span>
      <button type="button" @click="askAgentToCheckReports">让 Agent 查看我的报告</button>
    </div>
    <div class="bookcases-layout">
      <section class="bookcase-unit">
        <div class="bookcase-label">
          <span class="section-badge section-badge--portrait">
            <Icon icon="lucide:user-circle" :width="14" />
          </span>
          个人能力画像
          <span class="section-count">{{ portraitList.length }}</span>
          <button class="label-entry label-entry--portrait" @click="router.push({ name: 'student-career-navigation' })">
            <Icon icon="lucide:scan-face" :width="12" />
            开始测评
            <Icon icon="lucide:chevron-right" :width="11" />
          </button>
        </div>
        <BookshelfScene :books="portraitList" type="portrait" @book-fly-out="onBookFlyOut" />
      </section>

      <section class="bookcase-unit">
        <div class="bookcase-label">
          <span class="section-badge section-badge--career">
            <Icon icon="lucide:briefcase" :width="14" />
          </span>
          职业生涯发展
          <span class="section-count">{{ careerList.length }}</span>
          <button class="label-entry label-entry--career" @click="router.push({ name: 'student-career-report' })">
            <Icon icon="lucide:compass" :width="12" />
            开始测评
            <Icon icon="lucide:chevron-right" :width="11" />
          </button>
        </div>
        <BookshelfScene :books="careerList" type="career" @book-fly-out="onBookFlyOut" />
      </section>
    </div>

    <BookOpenOverlay
      :visible="overlayVisible"
      :record="overlayRecord"
      :type="overlayType"
      :origin-x="overlayOrigin.x"
      :origin-y="overlayOrigin.y"
      @close="closeOverlay"
      @remove="removeAndCloseOverlay"
    />

    <AIMascot
      :report-records="reportStore.records"
      :user-id="userStore.currentUser?.id"
      :target-roles="learningStore.targetRoles"
      @analysis-ready="onAnalysisReady"
    />

    <AIMascotResultCard
      :visible="showResultCard"
      :result="analysisResult"
      @close="showResultCard = false"
    />
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
</style>
