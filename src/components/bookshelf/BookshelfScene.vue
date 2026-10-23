<!-- 组件：3D 书架场景；使用 GSAP 驱动书本动画与交互 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { gsap } from '@/plugins/gsap'
import type { ReportRecord } from '@/types'

const props = defineProps<{
  books: ReportRecord[]
  type: 'portrait' | 'career'
  emptyText?: string
}>()

const emit = defineEmits<{
  (e: 'book-fly-out', payload: { record: ReportRecord; originX: number; originY: number; type: 'portrait' | 'career' }): void
  (e: 'capacity', count: number): void
}>()

const animatingId = ref<string | null>(null)
const bookRefs = new Map<string, HTMLButtonElement>()

type BookViewItem = {
  record: ReportRecord
  dateLabel: string
  titleLabel: string
  width: number
  height: number
}

function hashSeed(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) & 0xffff
  }
  return Math.abs(h)
}

function hashSeed2(text: string): number {
  let h = 0x9e3779b9
  for (let i = 0; i < text.length; i++) {
    h = ((h ^ text.charCodeAt(i)) * 0x6c62272e) & 0xffff
  }
  return Math.abs(h)
}

function formatSpineDate(dateStr: string): string {
  return dateStr.slice(0, 10).replace(/-/g, '.')
}

function createBookView(record: ReportRecord): BookViewItem {
  const seed = hashSeed(record.id)
  const seed2 = hashSeed2(record.id)
  return {
    record,
    dateLabel: formatSpineDate(record.createdAt),
    titleLabel: record.portraitVersion ? '能力画像' : record.title.length > 8 ? `${record.title.slice(0, 8)}…` : record.title,
    width: 28 + (seed % 15),
    height: 90 + (seed2 % 41),
  }
}

const stageRef = ref<HTMLElement | null>(null)
const measuredRowWidth = ref(0)
let resizeObs: ResizeObserver | null = null

const MAX_BOOK_SLOT = 46 // max book width (42) + gap (4)
const SHELF_ROW_COUNT = 3

const booksPerRow = computed(() => {
  if (measuredRowWidth.value <= 0) return 8
  return Math.max(1, Math.floor((measuredRowWidth.value - 16) / MAX_BOOK_SLOT))
})
watch(booksPerRow, value => emit('capacity', value * SHELF_ROW_COUNT), { immediate: true })

const shelfRows = computed(() => {
  const perRow = booksPerRow.value
  const maxBooks = perRow * SHELF_ROW_COUNT
  const list = props.books.slice(0, maxBooks).map(createBookView)
  const rows: BookViewItem[][] = []
  for (let i = 0; i < SHELF_ROW_COUNT; i++) {
    rows.push(list.slice(i * perRow, (i + 1) * perRow))
  }
  return rows
})

onMounted(() => {
  const stage = stageRef.value
  if (!stage) return
  const firstRow = stage.querySelector('.shelf-row') as HTMLElement | null
  if (!firstRow) return
  resizeObs = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (entry) measuredRowWidth.value = entry.contentRect.width
  })
  resizeObs.observe(firstRow)
})

onBeforeUnmount(() => {
  resizeObs?.disconnect()
  resizeObs = null
})

function setBookRef(id: string, el: unknown) {
  if (!el) {
    bookRefs.delete(id)
  } else {
    bookRefs.set(id, el as HTMLButtonElement)
  }
}

function handleHover(id: string, enter: boolean) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (animatingId.value === id) return
  const el = bookRefs.get(id)
  if (!el) return
  gsap.to(el, {
    y: enter ? -8 : 0,
    z: enter ? 4 : 0,
    duration: 0.2,
    ease: 'power2.out',
    overwrite: true,
  })
}

function handleBookClick(item: BookViewItem, evt: MouseEvent) {
  if (animatingId.value) return
  const el = bookRefs.get(item.record.id)
  if (!el) return

  animatingId.value = item.record.id
  const bounds = el.getBoundingClientRect()
  const payload = { record: item.record, type: props.type,
    originX: evt.detail === 0 ? bounds.x + bounds.width / 2 : evt.clientX,
    originY: evt.detail === 0 ? bounds.y + bounds.height / 2 : evt.clientY }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    animatingId.value = null; emit('book-fly-out', payload); return
  }

  gsap.timeline({
    onComplete: () => {
      gsap.set(el, { clearProps: 'all' })
      animatingId.value = null
      emit('book-fly-out', payload)
    },
  })
    .to(el, {
      y: -14,
      rotateZ: -3,
      scale: 1.12,
      duration: 0.24,
      ease: 'power2.out',
    })
    .to(el, {
      y: -60,
      scale: 1.22,
      opacity: 0,
      duration: 0.22,
      ease: 'power2.in',
    })
}
</script>

<template>
  <div class="bookshelf-stage" ref="stageRef">
    <div class="shelf-cabinet">
      <div class="cabinet-frame">
        <div class="cabinet-top-deco"></div>

        <div class="shelf-row" v-for="(row, rowIndex) in shelfRows" :key="rowIndex">
          <button
            v-for="item in row"
            :key="item.record.id"
            :ref="(el) => setBookRef(item.record.id, el)"
            class="book-item"
            :data-book-id="item.record.id"
            :class="[`book-item--${type}`, { 'book-item--animating': animatingId === item.record.id }]"
            :style="{ '--book-w': `${item.width}px`, '--book-h': `${item.height}px` }"
            :title="item.record.title"
            :aria-label="`打开${item.record.title}，${item.dateLabel}`"
            @focus="handleHover(item.record.id, true)"
            @blur="handleHover(item.record.id, false)"
            @mouseenter="handleHover(item.record.id, true)"
            @mouseleave="handleHover(item.record.id, false)"
            @click="handleBookClick(item, $event)"
          >
            <span class="book-depth book-depth--top"></span>
            <span class="book-depth book-depth--side"></span>

            <span class="book-face">
              <svg class="book-face-svg" viewBox="0 0 100 320" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient :id="`book-grad-${item.record.id}`" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" :stop-color="type === 'portrait' ? '#8B6E5A' : '#4A7A6F'" />
                    <stop offset="0.6" :stop-color="type === 'portrait' ? '#6B5248' : '#3A6359'" />
                    <stop offset="1" :stop-color="type === 'portrait' ? '#4E3B32' : '#2A4D44'" />
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width="100" height="320" :fill="`url(#book-grad-${item.record.id})`" />
                <rect x="0" y="0" width="12" height="320" fill="rgba(0,0,0,0.10)" />
                <rect x="8" y="24" width="84" height="2" fill="rgba(255,255,255,0.35)" />
                <rect x="8" y="44" width="84" height="1" fill="rgba(255,255,255,0.25)" />
                <rect x="8" y="62" width="84" height="1" fill="rgba(255,255,255,0.25)" />
              </svg>

              <span class="book-binding"></span>
              <span class="book-date">{{ item.dateLabel }}</span>
              <span class="book-title" :class="{ 'book-title--versioned': item.record.portraitVersion }">{{ item.titleLabel }}</span>
              <span v-if="item.record.portraitVersion" class="book-version">{{ item.record.portraitVersion === 'current' ? '当前' : '历史' }}</span>
            </span>
          </button>

          <div v-if="!row.length" class="shelf-empty">{{ rowIndex === 0 ? (emptyText || '暂无报告') : '' }}</div>
        </div>

        <div class="shelf-shadow"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bookshelf-stage {
  width: 100%;
  flex: 1;
  min-height: 360px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  overflow: hidden;
  box-shadow: var(--shadow-md);
  position: relative;
}

.bookshelf-stage::before {
  display: none;
}

.shelf-cabinet {
  height: 100%;
  padding: 10px 12px;
  transform-style: preserve-3d;
  position: relative;
  z-index: 1;
}

.cabinet-frame {
  height: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 6px 10px;
  transform-style: preserve-3d;
  position: relative;
}

.cabinet-frame::before {
  display: none;
}

.cabinet-top-deco {
  height: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 0 4px;
  position: relative;
  z-index: 1;
}

.cabinet-top-deco::before,
.cabinet-top-deco::after {
  content: '';
  display: block;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--color-border), transparent);
}

.shelf-row {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  flex: 1;
  min-height: 0;
  padding: 6px 8px 0;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: inset 0 4px 8px rgba(0, 0, 0, 0.04);
  transform: translateZ(4px);
  z-index: 1;
  overflow: hidden;
}

.shelf-row::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 10px;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.04));
  border-top: 1px solid var(--color-border);
}

.book-item {
  flex: none;
  position: relative;
  width: var(--book-w);
  height: var(--book-h);
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  transform-style: preserve-3d;
  transform-origin: center bottom;
}

.book-item--animating {
  pointer-events: none;
}
.book-item:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 4px; }

.book-face {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 2px;
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.12),
    inset -3px 0 6px rgba(0, 0, 0, 0.08);
}

.book-face-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.book-depth {
  position: absolute;
  display: block;
  pointer-events: none;
}

.book-depth--top {
  left: 0;
  top: -4px;
  width: 100%;
  height: 4px;
  transform-origin: bottom;
  transform: rotateX(90deg);
  background: rgba(245, 245, 243, 0.95);
}

.book-depth--side {
  top: 0;
  right: -5px;
  width: 5px;
  height: 100%;
  transform-origin: left;
  transform: rotateY(90deg);
  background: rgba(0, 0, 0, 0.08);
}

.book-binding {
  position: absolute;
  top: 6px;
  left: 5px;
  right: 5px;
  height: 3px;
  border-top: 1px solid rgba(255, 255, 255, 0.5);
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
}

.book-date {
  position: absolute;
  top: 14px;
  right: 3px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 10px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.92);
  font-family: var(--font-latin, monospace);
  letter-spacing: 0.05em;
}

.book-title {
  position: absolute;
  left: 4px;
  width: 10px;
  right: auto;
  top: 12px;
  bottom: 8px;
  text-align: center;
  font-size: 10px;
  line-height: 11px;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: .08em;
  overflow: hidden;
  text-overflow: ellipsis;
}
.book-title--versioned { bottom: 30px; }
.book-version { position: absolute; left: 2px; bottom: 4px; width: 17px; padding: 2px 0; background: #f7f3ee; color: #51372a; font-size: 10px; font-weight: 700; line-height: 11px; writing-mode: vertical-rl; text-orientation: upright; letter-spacing: .06em; border-radius: 1px; text-align: center; }

.book-item--career .book-depth--side {
  background: rgba(27, 78, 121, 0.15);
}

.book-item--career .book-depth--top {
  background: rgba(240, 245, 252, 0.95);
}

.shelf-empty {
  margin: auto;
  font-size: 12px;
  color: var(--color-text-subtle);
}

.shelf-shadow {
  flex-shrink: 0;
  height: 8px;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.06), transparent);
  transform: translateZ(1px);
}

@media (max-width: 768px) {
  .bookshelf-stage {
    min-height: 300px;
  }

  .shelf-row {
    min-height: 100px;
    gap: 4px;
  }
}
</style>
