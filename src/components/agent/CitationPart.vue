<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { Citation } from '@/types'

const props = defineProps<{
  citation: Citation
}>()

const relevanceLabel = computed(() => {
  if (props.citation.relevance == null) return null
  const pct = Math.round(props.citation.relevance * 100)
  return `${pct}% 相关`
})

const locationLabel = computed(() => {
  const parts: string[] = []
  if (props.citation.section) parts.push(props.citation.section)
  if (props.citation.page != null) parts.push(`第 ${props.citation.page} 页`)
  return parts.length ? parts.join(' · ') : null
})
</script>

<template>
  <div class="citation">
    <div class="citation__head">
      <Icon icon="lucide:quote" :width="13" />
      <span class="citation__source">{{ citation.source }}</span>
      <span v-if="relevanceLabel" class="citation__relevance">{{ relevanceLabel }}</span>
    </div>
    <blockquote class="citation__quote">{{ citation.quote }}</blockquote>
    <div class="citation__meta">
      <span v-if="locationLabel" class="citation__location">{{ locationLabel }}</span>
      <a
        v-if="citation.url"
        :href="citation.url"
        target="_blank"
        rel="noopener"
        class="citation__link"
      >查看原文</a>
    </div>
  </div>
</template>

<style scoped>
.citation {
  border-left: 3px solid #a78bfa;
  border-radius: 0 10px 10px 0;
  background: rgba(245, 243, 255, 0.88);
  padding: 10px 12px;
  color: #3b0764;
}

.citation__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.citation__source {
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.citation__relevance {
  flex-shrink: 0;
  border-radius: 999px;
  background: rgba(196, 181, 253, 0.4);
  padding: 1px 6px;
  font-size: 11px;
  color: #6d28d9;
}

.citation__quote {
  margin: 8px 0 0;
  padding: 0 0 0 10px;
  border: 0;
  border-left: 2px solid rgba(167, 139, 250, 0.4);
  font-size: 13px;
  line-height: 1.6;
  color: #4c1d95;
  font-style: italic;
}

.citation__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  font-size: 11px;
  color: #7c3aed;
}

.citation__location {
  opacity: 0.75;
}

.citation__link {
  color: #7c3aed;
  text-decoration: none;
}

.citation__link:hover {
  text-decoration: underline;
}
</style>
