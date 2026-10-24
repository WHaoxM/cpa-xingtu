<script setup lang="ts">
import { computed, nextTick, ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps<{ sections: { id: string; title: string }[]; resourceKey: string }>()
const active = ref('overview')
const root = ref<HTMLElement>()
const heading = ref<HTMLElement>()
const positions = new Map<string, number>()
let revision = 0
let disposed = false
const title = computed(() => active.value === 'overview' ? '总览' : props.sections.find(item => item.id === active.value)?.title || '总览')
function scrollHost(): HTMLElement {
  let element = root.value?.parentElement
  let fallback: HTMLElement | undefined
  while (element) {
    if (/(auto|scroll)/.test(getComputedStyle(element).overflowY)) {
      if (element.classList.contains('book-page__body') || element.scrollHeight > element.clientHeight + 1) return element
      fallback ??= element
    }
    element = element.parentElement
  }
  return fallback ?? document.scrollingElement as HTMLElement
}
async function open(id: string, targetId?: string) {
  if (id !== 'overview' && !props.sections.some(item => item.id === id)) return
  if (active.value === id && !targetId) return
  const host = scrollHost()
  positions.set(active.value, host.scrollTop)
  const ticket = ++revision
  active.value = id
  await nextTick()
  if (disposed || ticket !== revision) return
  const destination = scrollHost()
  heading.value?.focus({ preventScroll: true })
  if (targetId) {
    const target = root.value?.querySelector<HTMLElement>(`[id="${CSS.escape(targetId)}"]`)
    if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'start' }); return }
  }
  const top = root.value ? root.value.getBoundingClientRect().top - destination.getBoundingClientRect().top + destination.scrollTop : 0
  destination.scrollTop = positions.get(id) ?? top
}
watch(() => props.resourceKey, () => { ++revision; active.value = 'overview'; positions.clear() })
watch(() => props.sections.map(item => item.id).join('|'), () => {
  if (active.value !== 'overview' && !props.sections.some(item => item.id === active.value)) void open('overview')
})
onBeforeUnmount(() => { disposed = true; ++revision; positions.clear() })
defineExpose({ open })
</script>

<template>
  <div ref="root" class="reading-layout" :data-active-section="active">
    <div class="reading-layout__grid">
      <nav class="reading-layout__directory" aria-label="报告章节目录">
        <strong>阅读目录</strong>
        <button type="button" data-reading-section="overview" :aria-current="active === 'overview' ? 'page' : undefined" @click="open('overview')">总览</button>
        <button v-for="section in sections" :key="section.id" type="button" :data-reading-section="section.id" :aria-current="active === section.id ? 'page' : undefined" @click="open(section.id)">{{ section.title }}</button>
      </nav>
      <div class="reading-layout__main">
        <div class="reading-layout__compact">
          <label>阅读章节
            <select :value="active" @change="open(($event.target as HTMLSelectElement).value)">
              <option value="overview">总览</option>
              <option v-for="section in sections" :key="section.id" :value="section.id">{{ section.title }}</option>
            </select>
          </label>
          <button v-if="active !== 'overview'" type="button" @click="open('overview')">返回总览</button>
        </div>
        <h3 ref="heading" class="reading-layout__title" tabindex="-1">{{ title }}</h3>
        <div class="reading-layout__body">
          <slot :section="active" :open="open" />
        </div>
        <nav v-if="active === 'overview'" class="reading-layout__contents" aria-label="完整章节">
          <h4>继续阅读</h4>
          <button v-for="section in sections" :key="section.id" type="button" @click="open(section.id)"><span>{{ section.title }}</span><span aria-hidden="true">→</span></button>
        </nav>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reading-layout { container-type: inline-size; min-width: 0; margin-top: 24px; }
.reading-layout__grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 28px; align-items: start; }
.reading-layout__directory { display: none; }
.reading-layout__main { min-width: 0; }
.reading-layout__compact { display: flex; flex-wrap: wrap; align-items: end; gap: 8px 14px; margin-bottom: 24px; padding: 10px 0; position: sticky; top: var(--reading-sticky-top, 0px); z-index: 2; background: var(--reading-nav-surface, var(--color-surface, #fffdfa)); }
.reading-layout__compact label { flex: 1 1 180px; display: grid; gap: 6px; font-size: 13px; color: var(--color-text-muted, #696158); }
select { width: 100%; min-height: 44px; padding: 8px 30px 8px 10px; color: var(--color-text, #302b25); background: var(--color-surface, #fffdfa); border: 1px solid var(--color-border, #d5ccc0); border-radius: 4px; font: inherit; font-size: 15px; scroll-margin-top: calc(var(--reading-sticky-top, 0px) + 16px); }
button { min-height: 44px; color: var(--color-primary, #8b351e); font: inherit; font-size: 14px; cursor: pointer; background: none; border: 0; text-align: left; }
button:focus-visible, select:focus-visible { outline: 2px solid var(--color-primary, #8b351e); outline-offset: 3px; }
.reading-layout__title { font: 500 23px/1.4 var(--font-serif, Georgia, serif); color: var(--color-text, #302b25); margin: 0 0 24px; scroll-margin-top: 12px; }
.reading-layout__title:focus-visible { outline: 1px solid var(--color-primary, #8b351e); outline-offset: 4px; }
.reading-layout__body { font-size: 15px; line-height: 1.85; overflow-wrap: anywhere; }
.reading-layout__contents { margin-top: 30px; padding-top: 18px; border-top: 1px solid var(--color-border, #d5ccc0); }
.reading-layout__contents h4 { font-size: 14px; margin: 0 0 8px; color: var(--color-text-muted, #696158); font-weight: 500; }
.reading-layout__contents button { display: flex; justify-content: space-between; gap: 16px; width: 100%; padding: 12px 0; border-bottom: 1px solid var(--color-border, #d5ccc0); }
@container (min-width: 760px) {
  .reading-layout__grid { grid-template-columns: 156px minmax(0, 1fr); gap: 32px; }
  .reading-layout__compact { display: none; }
  .reading-layout__directory { display: grid; align-content: start; position: sticky; top: 16px; border-right: 1px solid var(--color-border, #d5ccc0); padding-right: 16px; }
  .reading-layout__directory strong { margin-bottom: 14px; font-size: 13px; font-weight: 500; color: var(--color-text-muted, #696158); }
  .reading-layout__directory button { width: 100%; padding: 10px 8px; line-height: 1.6; }
  .reading-layout__directory [aria-current] { background: color-mix(in srgb, var(--color-primary, #8b351e) 7%, transparent); font-weight: 650; border-radius: 3px; }
}
</style>
