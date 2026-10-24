<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { MessagePart } from '@/types'

type EvidenceSummary = Extract<MessagePart, { type: 'evidence_summary' }>
const props = defineProps<{ summary: EvidenceSummary; presentation?: 'student' }>()

const statusLabel = computed(() => ({
  complete: '资料已读取',
  partial: '本轮依据不完整',
  unavailable: '资料暂不可用',
}[props.summary.status] || '本轮依据不完整'))

const scopeNote = computed(() => {
  if (!props.summary.scope_note) return ''
  return ({
    resume_not_cross_checked: '当前无法读取已确认简历，因此这次回答无法与个人经历交叉核对。',
    resume_partially_cross_checked: '已确认简历只读取到一部分，因此个人经历的交叉核对并不完整。',
    student_submitted_unverified: '这些材料由你提交，仅作为本次讨论的依据，不代表经历或能力已经核验。',
  } as Record<string, string>)[props.summary.scope_note] || ''
})

function sourceStatus(status: string): string {
  if (status === 'read') return '已读取'
  if (status === 'partial') return '部分读取'
  return '暂不可用'
}
</script>

<template>
  <section class="evidence-summary" :class="{ 'evidence-summary--student': presentation === 'student' }" aria-label="本轮参考资料">
    <header class="evidence-summary__head">
      <span class="evidence-summary__title"><Icon icon="lucide:library" :width="15" />{{ summary.title }}</span>
      <span class="evidence-summary__status" :class="`is-${summary.status}`">{{ statusLabel }}</span>
    </header>
    <ul v-if="summary.sources.length" class="evidence-summary__sources">
      <li v-for="source in summary.sources" :key="source.label">
        <span>{{ source.label }}</span>
        <span class="evidence-summary__source-status" :class="`is-${source.status}`">{{ sourceStatus(source.status) }}</span>
      </li>
    </ul>
    <p v-if="scopeNote" class="evidence-summary__note">{{ scopeNote }}</p>
  </section>
</template>

<style scoped>
.evidence-summary { display: grid; gap: .55rem; max-width: 680px; padding: .72rem .82rem; border: 1px solid #dce4ec; border-radius: 12px; background: #f8fafc; color: #334155; font-size: 12px; }
.evidence-summary__head, .evidence-summary__title, .evidence-summary__sources li { display: flex; align-items: center; gap: .45rem; }
.evidence-summary__head { justify-content: space-between; }
.evidence-summary__title { color: #475569; font-weight: 650; }
.evidence-summary__status { color: #64748b; }
.evidence-summary__status.is-complete, .evidence-summary__source-status.is-read { color: #28734c; }
.evidence-summary__status.is-partial, .evidence-summary__source-status.is-partial { color: #986717; }
.evidence-summary__status.is-unavailable, .evidence-summary__source-status.is-unavailable { color: #9a4d33; }
.evidence-summary__sources { display: flex; flex-wrap: wrap; gap: .4rem .75rem; margin: 0; padding: 0; list-style: none; }
.evidence-summary__sources li { justify-content: space-between; min-width: 140px; gap: .75rem; }
.evidence-summary__source-status { color: #64748b; }
.evidence-summary__note { margin: 0; color: #64748b; line-height: 1.55; }
.evidence-summary--student { max-width: none; padding: 14px 0; border: 0; border-top: 1px solid var(--color-border, #dce1e5); border-radius: 0; background: none; font-size: 13px; line-height: 1.75; }
.evidence-summary--student .evidence-summary__head { flex-wrap: wrap; gap: 8px 16px; }
.evidence-summary--student .evidence-summary__sources { display: grid; gap: 8px; }
.evidence-summary--student .evidence-summary__sources li { min-width: 0; justify-content: flex-start; flex-wrap: wrap; gap: 4px 14px; }
.evidence-summary--student .evidence-summary__sources li > span:first-child { overflow-wrap: anywhere; }
.evidence-summary--student .evidence-summary__note { color: var(--color-text, #334155); line-height: 1.75; }
</style>
