<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { ReportRecord } from '@/types'
import ReportReadingLayout from './ReportReadingLayout.vue'
import { chapterParagraphs } from '@/utils/reportChapterContent'

const props = defineProps<{ report: ReportRecord; embedded?: boolean }>()
const emit = defineEmits<{ (event: 'ask', reportId: string): void }>()

type JsonObject = Record<string, unknown>
function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

const snapshot = computed(() => props.report.snapshot)
const reportJson = computed(() => object(snapshot.value.report_json ?? snapshot.value))
const status = computed(() => text(snapshot.value.status ?? reportJson.value.status) || 'unknown')
const statusLabel = computed(() => ({
  completed: '已完成',
  partial: '部分完成',
  queued: '等待处理',
  running: '处理中',
  failed: '处理失败',
}[status.value] || '状态待核对'))
const statusClass = computed(() => ['completed', 'partial', 'queued', 'running', 'failed'].includes(status.value)
  ? `is-${status.value}` : 'is-unknown')
const summary = computed(() => text(reportJson.value.summary))
function formatChineseDate(value: string): string {
  const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value)
  if (Number.isNaN(date.getTime())) return '日期待核对'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}
const createdDate = computed(() => formatChineseDate(props.report.createdAt))
const missingSections = computed(() =>
  Array.isArray(reportJson.value.missing_sections)
    ? reportJson.value.missing_sections.map(value => String(value))
    : [],
)
const matchSnapshot = computed(() => object(reportJson.value.match_snapshot))
const score = computed(() => {
  const value = matchSnapshot.value.total_score
  return typeof value === 'number' && Number.isFinite(value) ? value : null
})
const scoreLabel = computed(() => {
  if (score.value === null) return ''
  const normalized = score.value > 1 ? score.value : score.value * 100
  return `${Math.round(normalized)} / 100`
})
const scoreKindLabel = computed(() => ({
  policy_estimate: '规则估算',
}[text(matchSnapshot.value.score_kind)] || '评分口径待核对'))
const chapters = computed<Array<{ id: string; [key: string]: unknown }>>(() => {
  const saved = object(snapshot.value.chapters)
  const raw = Object.keys(saved).length ? saved : object(reportJson.value.chapters)
  return Object.entries(raw).filter(([, value]) => value && typeof value === 'object').map(([id, value]) => ({ ...object(value), id }))
})
const sections = computed(() => [...chapters.value.map(chapter => ({ id: chapter.id, title: text(chapter.title) || '报告章节' })), { id: 'basis', title: '依据与边界' }])
const sectionLabels: Record<string, string> = {
  validated_scoring_policy: '评分规则尚未完成质量验证',
  evidence_based_action_plan: '缺少有证据支持的行动计划',
  verified_resource_recommendations: '缺少已核实的资源推荐',
}
</script>

<template>
  <article class="server-report" :class="{ 'server-report--embedded': embedded }" :aria-label="`报告详情：${report.title}`">
    <header class="server-report__head">
      <div>
        <h2>{{ report.title }}</h2>
        <p class="server-report__meta">
          <span>{{ String(snapshot.position_name || '岗位名称待核对') }}</span>
          <span>·</span>
          <span>{{ createdDate }}</span>
        </p>
      </div>
      <span class="server-report__status" :class="statusClass">
        {{ statusLabel }}
      </span>
    </header>

    <ReportReadingLayout :resource-key="report.id" :sections="sections" v-slot="{ section }">
    <template v-if="section === 'overview'">
    <section v-if="summary" class="server-report__summary" aria-label="报告摘要">
      <h3>这份报告实际说明了什么</h3>
      <p>{{ summary }}</p>
    </section>

    <p v-if="!summary" class="server-report__notice">这份报告没有提供总览摘要，可从下方目录查看已保存的章节。</p>

    <section v-if="score !== null" class="server-report__boundary">
      <Icon icon="lucide:info" :width="16" />
      <p>
        当前匹配分：<strong>{{ scoreLabel }}</strong>（{{ scoreKindLabel }}），
        不是录用概率，也不单独构成“应该/不应该申请”的结论。
      </p>
    </section>

    <p v-if="status === 'partial'" class="server-report__notice">这是一份部分完成的报告，尚缺的内容列在“依据与边界”，不能据此直接决定是否申请。</p>
    <p v-if="!chapters.length" class="server-report__notice">尚未生成详细章节。当前可阅读上方已有摘要与估算边界。</p>
    <footer class="server-report__footer"><span>对已有结论还有疑问？</span><button type="button" @click="emit('ask', report.id)"><Icon icon="lucide:message-circle" :width="15" />问问这份报告</button></footer>
    </template>

    <section v-if="section === 'basis'" class="server-report__missing">
      <p>这份报告对应 {{ String(snapshot.position_name || '所选岗位') }}。估算分不是录用概率，缺少依据的内容不构成申请建议。</p>
      <template v-if="missingSections.length">
      <h3>还没有依据的部分</h3>
      <ul>
        <li v-for="section in missingSections" :key="section">
          {{ sectionLabels[section] || '其他内容尚缺少依据' }}
        </li>
      </ul>
      </template>
      <p v-else>本次报告没有另列缺失项；各项结论仍以对应章节实际提供的依据为准。</p>
    </section>

    <template v-for="chapter in chapters" :key="chapter.id">
      <article v-if="section === chapter.id" class="server-report__chapter">
        <p v-if="chapter.status && chapter.status !== 'completed'" class="server-report__notice">{{ ({ partial: '本章节尚未完成，以下只呈现已有内容。', queued: '本章节正在等待处理。', running: '本章节正在处理中。', failed: '本章节未能完成，请稍后重新读取。' } as Record<string,string>)[String(chapter.status)] || '本章节的完成情况尚待核对。' }}</p>
        <div v-for="(paragraph,index) in chapterParagraphs(chapter)" :key="index" class="server-report__paragraph">
          <h4 v-if="paragraph.label">{{ paragraph.label }}</h4><p v-if="paragraph.text">{{ paragraph.text }}</p>
        </div>
        <p v-if="!chapterParagraphs(chapter).length">本章节尚未提供可阅读的正文。</p>
        <button type="button" class="server-report__ask" @click="emit('ask', report.id)">问问这份报告</button>
      </article>
    </template>
    </ReportReadingLayout>
  </article>
</template>

<style scoped>
.server-report { display: flex; flex-direction: column; gap: 1rem; padding: 1.1rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.server-report--embedded { border: 0; border-radius: 0; box-shadow: none; padding: 24px; }
.server-report__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding-bottom: .8rem; border-bottom: 1px solid var(--color-border); }
.server-report__eyebrow { margin: 0 0 .25rem; color: var(--color-text-muted); font-size: .72rem; }
.server-report h2 { margin: 0; color: var(--color-text); font-size: 1.18rem; }
.server-report__meta { display: flex; flex-wrap: wrap; gap: .4rem; margin: .45rem 0 0; color: var(--color-text-muted); font-size: .74rem; }
.server-report__status { flex: 0 0 auto; padding: .25rem .55rem; border: 1px solid var(--color-border); border-radius: 999px; color: var(--color-text-muted); font-size: .72rem; }
.server-report__status.is-partial { border-color: #d5ae62; color: #8b641a; background: #d5ae6218; }
.server-report__status.is-completed { border-color: #78a98a; color: #356c4c; background: #78a98a18; }
.server-report h3 { margin: 0 0 .45rem; color: var(--color-text); font-size: .9rem; }
.server-report__summary p, .server-report__chapter p, .server-report__boundary p { margin: 0; color: var(--color-text-muted); line-height: 1.65; font-size: .84rem; }
.server-report__boundary { display: flex; gap: .55rem; align-items: flex-start; padding: .7rem; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-primary) 7%, var(--color-surface)); color: var(--color-primary); }
.server-report__boundary p { color: var(--color-text); }
.server-report__missing ul { display: grid; gap: .35rem; margin: 0; padding-left: 1.15rem; color: var(--color-text-muted); font-size: .82rem; }
.server-report__chapters { display: grid; gap: .6rem; }
.server-report__chapter { padding: .65rem .75rem; border-radius: var(--radius-sm); background: var(--color-background); }
.server-report__chapter h4 { margin: 0 0 .3rem; font-size: .82rem; color: var(--color-text); }
.server-report__footer { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding-top: .8rem; border-top: 1px solid var(--color-border); }
.server-report__footer > span { color: var(--color-text-muted); font-size: .72rem; line-height: 1.5; }
.server-report__footer button { flex: 0 0 auto; display: inline-flex; align-items: center; gap: .35rem; padding: .52rem .75rem; border: 0; border-radius: var(--radius-sm); background: var(--color-primary); color: #fff; font-weight: 600; cursor: pointer; }
.server-report h2 { font-family: var(--font-serif); font-size: 25px; line-height: 1.4; }
.server-report__summary { margin-bottom: 24px; }
.server-report__summary p, .server-report__chapter p { font-size: 15px; line-height: 1.85; color: var(--color-text); white-space: pre-wrap; }
.server-report__chapter { padding: 0; background: none; }
.server-report__paragraph + .server-report__paragraph { margin-top: 24px; }
.server-report__paragraph h4 { font-size: 16px; margin-bottom: 8px; }
.server-report__notice { font-size: 13px; color: var(--color-text-muted); line-height: 1.8; margin: 18px 0; }
.server-report__footer { margin-top: 28px; }
.server-report__footer button, .server-report__ask { min-height: 44px; }
.server-report__ask { margin-top: 28px; border: 1px solid var(--color-primary); padding: 8px 14px; color: var(--color-primary); background: transparent; border-radius: 4px; font: inherit; cursor: pointer; }
.server-report button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
@media (max-width: 640px) { .server-report__head, .server-report__footer { align-items: stretch; flex-direction: column; } .server-report__footer button { justify-content: center; } }
</style>
