<script setup lang="ts">
import { computed } from 'vue'
import D3FlowerChart from '@/components/charts/D3FlowerChart.vue'
import ReportReadingLayout from './ReportReadingLayout.vue'
import type { PortraitSnapshot } from '@/api/pipeline'
import { portraitGuidance, type PortraitFocus } from '@/utils/portraitFollowup'
const props = defineProps<{ snapshot: PortraitSnapshot; chaptered?: boolean; actionLoading?: boolean; actionError?: string; currentReady?: boolean; currentLoading?: boolean; currentUnavailable?: boolean }>()
const emit = defineEmits<{ action: [focus: PortraitFocus]; current: [] }>()
const labels = ['基础背景', '职业技能', '职业素养', '成长潜力']
const keys = ['D1', 'D2', 'D3', 'D4'] as const
const sourceKeys = ['D1_basic', 'D2_skill', 'D3_quality', 'D4_potential']
const guidance = computed(() => portraitGuidance(props.snapshot))
const quickActions = computed<PortraitFocus[]>(() => props.snapshot.is_current
  ? (['self-report', 'resume'] as const).filter(action => guidance.value.some(note => note.action === action)) : [])
const dimensions = computed(() => keys.map((key, index) => ({
  label: labels[index]!, key, value: props.snapshot.dimensions[key],
  guidance: guidance.value.filter(item => item.dimension === key),
  raw: props.snapshot.portrait?.[sourceKeys[index]!] as Record<string, unknown> | undefined,
})))
const flower = computed(() => dimensions.value.map(item => ({ axis: item.label, value: item.value })))
const sections = computed(() => [...dimensions.value.map(item => ({ id: item.key, title: item.label })), { id: 'basis', title: '依据与阅读边界' }])
function evidence(raw: Record<string, unknown> | undefined): string[] {
  const items = raw?.evidence
  const quoted = Array.isArray(items) ? items.flatMap(item => {
    if (typeof item === 'string') return [item]
    if (!item || typeof item !== 'object') return []
    const value = item.quote ?? item.description ?? item.text ?? item.fact
    return typeof value === 'string' ? [value] : []
  }) : []
  const selfReported = Object.values(raw || {}).flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const fact = item as { provenance?: { kind?: string }; evidence?: unknown }
    return fact.provenance?.kind === 'user_self_report' && typeof fact.evidence === 'string'
      ? [`本人自述 · ${fact.evidence}`] : []
  })
  return [...quoted, ...selfReported]
}
function hasSelfReport(raw: Record<string, unknown> | undefined) {
  return Object.values(raw || {}).some(item => !!item && typeof item === 'object'
    && (item as { provenance?: { kind?: string } }).provenance?.kind === 'user_self_report')
}
</script>
<template>
  <article class="portrait-reading" aria-label="能力画像详情">
    <header><div><h2>你的经历与能力证据</h2><p>{{ snapshot.is_current ? '当前版本' : '历史版本 · 仅供回看' }}</p></div><span>{{ snapshot.state === 'ready_scored' ? '已有评分依据' : '部分维度尚缺依据' }}</span></header>
    <p>未显示数值的维度保留未知，不能当作零分。</p>
    <nav v-if="quickActions.length" class="portrait-reading__quick" aria-label="根据当前画像补充资料">
      <button v-for="action in quickActions" :key="action" type="button" class="portrait-next-step" :disabled="actionLoading" @click="emit('action', action)">{{ action === 'self-report' ? '补充沟通与协作经历' : '核对当前简历' }}</button>
    </nav>
    <ReportReadingLayout v-if="chaptered" :sections="sections" :resource-key="snapshot.snapshot_id" v-slot="{ section, open }">
      <template v-if="section === 'overview'">
        <div class="portrait-reading__overview">
          <div class="portrait-reading__flower"><D3FlowerChart :data="flower" :zoom="1.7" /></div>
          <div class="portrait-reading__dimension-links">
            <button v-for="item in dimensions" :key="item.key" type="button" @click="open(item.key)"><span>{{ item.label }}</span><strong>{{ item.value === null ? '尚缺依据' : `${item.value} / 100` }}</strong><span aria-hidden="true">→</span></button>
          </div>
        </div>
        <p v-if="snapshot.state !== 'ready_scored'" class="portrait-reading__boundary">已有数值是这份资料下的候选分，不是完整能力评级。</p>
        <template v-if="dimensions.some(item => evidence(item.raw).length)"><h4>已记录的经历</h4><p v-for="quote in [...new Set(dimensions.flatMap(item => evidence(item.raw)))].slice(0, 2)" :key="quote">{{ quote }}</p></template>
      </template>
      <template v-for="item in dimensions" :key="item.key">
        <section v-if="section === item.key" class="portrait-reading__dimension">
          <h4>目前能说明什么</h4>
          <p>{{ item.value === null ? '现有资料尚不足以判断这一维度。' : `这份资料支持的${item.label}候选分为 ${item.value} / 100。` }}</p>
          <p v-if="hasSelfReport(item.raw)">包含本人自述，未经独立事实核验，不等于已认证的能力。</p>
          <template v-if="evidence(item.raw).length"><h4>对应经历</h4><blockquote v-for="(quote, i) in evidence(item.raw)" :key="i">{{ quote }}</blockquote></template>
          <template v-if="item.guidance.length"><h4>仍需了解什么</h4><p v-for="note in item.guidance" :key="note.key">{{ note.text }}</p></template>
          <template v-if="item.guidance.some(note => note.action)"><h4>适用的下一步</h4><button type="button" class="portrait-next-step" :disabled="actionLoading" @click="emit('action', item.guidance.find(note => note.action)!.action!)">{{ item.key === 'D3' ? '补充沟通与协作经历' : '核对当前简历' }}</button></template>
        </section>
      </template>
      <section v-if="section === 'basis'">
        <h4>怎样理解这份画像</h4><p>已有依据的部分保留实际数值；未知不代表能力为零，也不代表没有相关经历。候选分不能单独作为完整能力评级。</p>
        <div v-for="note in guidance.filter(item => !item.dimension)" :key="note.key"><p>{{ note.text }}</p><button v-if="note.action" class="portrait-next-step" :disabled="actionLoading" @click="emit('action', note.action)">核对当前简历</button></div>
        <p v-if="!guidance.filter(item => !item.dimension).length">各维度的具体经历与尚需了解的信息，保留在对应章节中。</p>
      </section>
    </ReportReadingLayout>
    <div v-else class="portrait-reading__content">
      <div class="portrait-reading__flower"><D3FlowerChart :data="flower" :zoom="1.7" /></div>
      <div class="portrait-reading__dimensions">
        <section v-for="item in dimensions" :key="item.key">
          <h3>{{ item.label }}<strong>{{ item.value === null ? '尚缺依据' : `${item.value} / 100` }}</strong></h3>
          <p v-if="item.value !== null && snapshot.state !== 'ready_scored'">这项是{{ snapshot.is_current ? '当前' : '当时' }}证据下的候选分，不是完整能力评级。</p>
          <p v-if="hasSelfReport(item.raw)">包含本人自述，未经独立事实核验，不等于已认证的能力。</p>
          <p v-else-if="item.value === null && !item.guidance.length">{{ snapshot.is_current ? '当前' : '当时的' }}资料尚不足以判断这一维度，不代表能力为零。</p>
          <p v-for="note in item.guidance" :key="note.key" class="portrait-reading__reason">{{ note.text }}</p>
          <button v-if="item.guidance.some(note => note.action)" type="button" class="portrait-next-step" :disabled="actionLoading"
            @click="emit('action', item.guidance.find(note => note.action)!.action!)">{{ item.key === 'D3' ? '补充沟通与协作经历' : '核对当前简历' }}</button>
          <details v-if="evidence(item.raw).length"><summary>查看依据</summary><ul><li v-for="(text, i) in evidence(item.raw)" :key="i">{{ text }}</li></ul></details>
        </section>
      </div>
    </div>
    <template v-if="!chaptered"><div v-for="note in guidance.filter(item => !item.dimension)" :key="note.key" class="portrait-reading__missing"><p>{{ note.text }}</p><button v-if="note.action" class="portrait-next-step" :disabled="actionLoading" @click="emit('action', note.action)">核对当前简历</button></div></template>
    <footer v-if="!snapshot.is_current" class="portrait-reading__missing"><p>这是当时的记录，不会因为现在补充资料而改写。后续操作请以当前确认资料为准。</p><button class="portrait-next-step" :disabled="actionLoading || currentLoading" @click="emit('current')">{{ currentLoading ? '正在核对当前版本…' : currentUnavailable ? '重新核对当前资料' : currentReady ? '查看当前画像' : '查看当前分析进度' }}</button></footer>
    <p v-if="actionLoading" role="status">正在核对当前资料…</p>
    <p v-if="actionError" role="alert">{{ actionError }}</p>
  </article>
</template>
<style scoped>
.portrait-reading { padding: 24px; color: var(--color-text); }
header { display: flex; justify-content: space-between; gap: 16px; align-items: start; border-bottom: 1px solid var(--color-border); padding-bottom: 16px; }
h2 { font-family: var(--font-serif); font-size: 25px; margin: 0 0 8px; }
header p, .portrait-reading > p { color: var(--color-text-muted); font-size: 13px; line-height: 1.7; }
header span { font-size: 12px; color: var(--color-primary); }
.portrait-reading__content { display: grid; grid-template-columns: 1fr 1.2fr; gap: 24px; }
.portrait-reading__flower { min-width: 0; height: 350px; }
section { padding: 16px 0; border-bottom: 1px solid var(--color-border); }
h3 { display: flex; justify-content: space-between; gap: 16px; font-size: 15px; margin: 0 0 10px; }
strong { font-size: 13px; color: var(--color-primary); font-weight: 500; }
section p, details { font-size: 13px; line-height: 1.7; color: var(--color-text-muted); }
summary { cursor: pointer; color: var(--color-primary); }
li { overflow-wrap: anywhere; }
.portrait-next-step { border: 1px solid var(--color-primary); background: transparent; color: var(--color-primary); border-radius: var(--radius-sm, 4px); padding: 7px 12px; font: inherit; font-size: 13px; cursor: pointer; text-align: left; }
.portrait-next-step:disabled { opacity: .6; cursor: wait; }
.portrait-next-step:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.portrait-reading__missing { margin-top: 18px; font-size: 13px; line-height: 1.7; color: var(--color-text-muted); }
.portrait-reading__quick { display: none; }
.portrait-reading__overview { display: grid; gap: 16px; }
.portrait-reading__dimension-links { display: grid; grid-template-columns: 1fr 1fr; gap: 0 22px; }
.portrait-reading__dimension-links button { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; padding: 14px 0; min-height: 56px; border: 0; border-bottom: 1px solid var(--color-border); background: none; color: var(--color-text); font: inherit; cursor: pointer; text-align: left; }
.portrait-reading__dimension-links button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
@media (max-width: 680px) { .portrait-reading__dimension-links button { display: grid; grid-template-columns: minmax(0, 1fr) auto; } .portrait-reading__dimension-links button strong { grid-column: 1; } .portrait-reading__dimension-links button span:last-child { grid-column: 2; grid-row: 1 / span 2; } }
.portrait-reading__dimension h4 { font-size: 16px; margin: 28px 0 8px; }
.portrait-reading__dimension h4:first-child { margin-top: 0; }
.portrait-reading__dimension p, .portrait-reading__dimension blockquote { font-size: 15px; line-height: 1.85; }
.portrait-reading__dimension blockquote { margin: 12px 0; padding-left: 16px; border-left: 2px solid var(--color-border); }
.portrait-reading__boundary { font-size: 13px; color: var(--color-text-muted); line-height: 1.7; }
.portrait-next-step { min-height: 44px; }
@container (min-width: 760px) { .portrait-reading__overview { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 24px; } .portrait-reading__dimension-links { grid-template-columns: 1fr; } }
@media (max-width: 680px) { .portrait-reading__dimension-links { order: -1; } }
@media(max-width: 680px) { .portrait-reading { padding: 18px; } header { flex-direction: column; } .portrait-reading__content { grid-template-columns: 1fr; gap: 0; } .portrait-reading__flower { height: 260px; } .portrait-reading__quick { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0; } .portrait-reading__quick button { min-height: 44px; flex: 1 1 auto; } }
</style>
