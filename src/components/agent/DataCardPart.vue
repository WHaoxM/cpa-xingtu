<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { DataCardItem, DataCardType } from '@/types'

const props = defineProps<{
  title: string
  cardType: DataCardType
  items: DataCardItem[]
}>()

const iconMap: Record<string, string> = {
  kv: 'lucide:list',
  score: 'lucide:bar-chart-3',
  bar: 'lucide:align-left',
  list: 'lucide:layout-list',
  comparison: 'lucide:git-compare',
}

function displayValue(value: DataCardItem['value']): string {
  if (value == null) return '—'
  if (Array.isArray(value)) return value.join('、')
  return String(value)
}

function isNumeric(value: DataCardItem['value']): value is number {
  return typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)) && value !== '')
}

function numericPercent(value: DataCardItem['value']): number {
  if (typeof value === 'number') return Math.min(100, Math.max(0, value))
  if (typeof value === 'string') {
    const n = Number(value)
    if (!isNaN(n)) return Math.min(100, Math.max(0, n))
  }
  return 0
}
</script>

<template>
  <div class="data-card" :class="`data-card--${cardType}`">
    <div class="data-card__head">
      <Icon :icon="iconMap[cardType] || 'lucide:layout-grid'" :width="14" />
      <span class="data-card__title">{{ title }}</span>
    </div>

    <div class="data-card__body">
      <template v-if="cardType === 'kv'">
        <div v-for="item in items" :key="item.label" class="data-card__row">
          <span class="data-card__label">{{ item.label }}</span>
          <span class="data-card__value">{{ displayValue(item.value) }}</span>
        </div>
      </template>

      <template v-else-if="cardType === 'score'">
        <div v-for="item in items" :key="item.label" class="data-card__score-row">
          <span class="data-card__label">{{ item.label }}</span>
          <div class="data-card__bar-wrap">
            <div
              class="data-card__bar"
              :style="{ width: `${numericPercent(item.value)}%` }"
            />
          </div>
          <span class="data-card__score-val">{{ displayValue(item.value) }}</span>
        </div>
      </template>

      <template v-else-if="cardType === 'bar'">
        <div v-for="item in items" :key="item.label" class="data-card__bar-row">
          <span class="data-card__label">{{ item.label }}</span>
          <div class="data-card__bar-wrap data-card__bar-wrap--thin">
            <div
              class="data-card__bar data-card__bar--accent"
              :style="{ width: `${numericPercent(item.value)}%` }"
            />
          </div>
          <span class="data-card__val">{{ displayValue(item.value) }}</span>
        </div>
      </template>

      <template v-else-if="cardType === 'list'">
        <div v-for="(item, idx) in items" :key="item.label" class="data-card__list-item">
          <span class="data-card__idx">{{ idx + 1 }}</span>
          <span class="data-card__label">{{ item.label }}</span>
          <span class="data-card__value data-card__value--muted">{{ displayValue(item.value) }}</span>
        </div>
      </template>

      <template v-else-if="cardType === 'comparison'">
        <div class="data-card__compare-head">
          <span />
          <span class="data-card__compare-col">当前</span>
          <span class="data-card__compare-col">目标</span>
        </div>
        <div v-for="item in items" :key="item.label" class="data-card__compare-row">
          <span class="data-card__label">{{ item.label }}</span>
          <template v-if="Array.isArray(item.value)">
            <span class="data-card__compare-val">{{ item.value[0] ?? '—' }}</span>
            <span class="data-card__compare-val">{{ item.value[1] ?? '—' }}</span>
          </template>
          <template v-else>
            <span class="data-card__compare-val">{{ displayValue(item.value) }}</span>
            <span class="data-card__compare-val data-card__compare-val--muted">—</span>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.data-card {
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 12px;
  background: rgba(239, 246, 255, 0.8);
  padding: 10px 12px;
  color: #1e3a8a;
}

.data-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.data-card__title {
  flex: 1;
}

.data-card__body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
}

.data-card__row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.data-card__label {
  color: #334155;
}

.data-card__value {
  color: #1e3a8a;
  font-weight: 500;
}

.data-card__value--muted {
  color: #64748b;
  font-weight: 400;
}

.data-card__score-row,
.data-card__bar-row {
  display: grid;
  grid-template-columns: 80px 1fr 48px;
  align-items: center;
  gap: 8px;
}

.data-card__bar-wrap {
  height: 8px;
  border-radius: 4px;
  background: rgba(147, 197, 253, 0.3);
  overflow: hidden;
}

.data-card__bar-wrap--thin {
  height: 6px;
}

.data-card__bar {
  height: 100%;
  border-radius: 4px;
  background: #3b82f6;
  transition: width 0.4s ease;
}

.data-card__bar--accent {
  background: #6366f1;
}

.data-card__score-val {
  text-align: right;
  font-weight: 600;
  font-size: 12px;
}

.data-card__val {
  text-align: right;
  font-size: 11px;
  color: #64748b;
}

.data-card__list-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.data-card__idx {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.15);
  color: #4f46e5;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.data-card__compare-head,
.data-card__compare-row {
  display: grid;
  grid-template-columns: 80px 1fr 1fr;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}

.data-card__compare-head {
  color: #64748b;
  font-weight: 500;
  font-size: 11px;
}

.data-card__compare-col {
  text-align: center;
}

.data-card__compare-val {
  text-align: center;
  font-weight: 500;
}

.data-card__compare-val--muted {
  color: #94a3b8;
}
</style>
