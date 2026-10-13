<script setup lang="ts">
import { computed, ref, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { Icon } from '@iconify/vue'
import { expertCategories, workspaceExperts, type WorkspaceExpert } from './expertCatalog'

const emit = defineEmits<{ summon: [expert: WorkspaceExpert, prompt?: string] }>()
const section = ref<'experts' | 'teams'>('experts')
const category = ref('全部')
const query = ref('')
const sort = ref<'recommended' | 'name'>('recommended')
const detail = ref<WorkspaceExpert | null>(null)
const detailDialog = ref<HTMLElement | null>(null)
const listAnchor = ref<HTMLElement | null>(null)

function onEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && detail.value) detail.value = null
}
onMounted(() => document.addEventListener('keydown', onEscape))
onBeforeUnmount(() => document.removeEventListener('keydown', onEscape))
watch(detail, async value => {
  if (value) {
    await nextTick()
    detailDialog.value?.focus()
  }
})

const featured = [
  { label: '探索职业方向', caption: '职业规划顾问', icon: 'lucide:compass', tone: 'violet', category: '职业规划' },
  { label: '准备下一次求职', caption: '简历优化 · 面试练习', icon: 'lucide:briefcase-business', tone: 'coral', category: '求职准备' },
  { label: '研究目标岗位', caption: '岗位要求与能力差距', icon: 'lucide:scan-search', tone: 'blue', category: '研究分析' },
  { label: '积累可见成果', caption: '作品与项目表达', icon: 'lucide:sparkles', tone: 'mint', category: '作品表达' },
]

const visibleExperts = computed(() => {
  const q = query.value.trim().toLocaleLowerCase()
  const filtered = workspaceExperts.filter(expert => {
    if (Boolean(expert.team) !== (section.value === 'teams')) return false
    if (category.value !== '全部' && expert.category !== category.value) return false
    return !q || [expert.name, expert.byline, expert.description, expert.category, ...expert.tags]
      .some(value => value.toLocaleLowerCase().includes(q))
  })
  return sort.value === 'name' ? [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')) : filtered
})

function openFeatured(value: string) {
  section.value = 'experts'
  category.value = value
  query.value = ''
  void nextTick(() => listAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

function summon(expert: WorkspaceExpert, prompt?: string) {
  detail.value = null
  emit('summon', expert, prompt)
}
</script>

<template>
  <section class="directory" aria-label="专家目录">
    <div class="directory__section-title"><h1>精选场景</h1><span>从你要完成的事开始</span></div>
    <div class="scenes">
      <button v-for="scene in featured" :key="scene.label" type="button" class="scene" :class="`tone-${scene.tone}`" @click="openFeatured(scene.category)">
        <Icon :icon="scene.icon" :width="24" aria-hidden="true" />
        <strong>{{ scene.label }}</strong>
        <span>{{ scene.caption }}</span>
        <Icon class="scene__arrow" icon="lucide:arrow-up-right" :width="17" aria-hidden="true" />
      </button>
    </div>

    <div ref="listAnchor" class="directory__controls">
      <div class="directory__tabs" role="tablist" aria-label="专家类型">
        <button type="button" role="tab" :aria-selected="section === 'experts'" :class="{ active: section === 'experts' }" @click="section = 'experts'; category = '全部'">专家</button>
        <button type="button" role="tab" :aria-selected="section === 'teams'" :class="{ active: section === 'teams' }" @click="section = 'teams'; category = '全部'">专家协作组</button>
      </div>
      <label class="directory__search">
        <Icon icon="lucide:search" :width="16" aria-hidden="true" />
        <input v-model="query" type="search" aria-label="搜索专家" placeholder="搜索专家或能力" />
      </label>
    </div>

    <div class="directory__filters">
      <div class="categories" aria-label="专家分类">
        <button v-for="item in expertCategories" :key="item" type="button" :class="{ active: category === item }" :aria-pressed="category === item" @click="category = item">{{ item }}</button>
      </div>
      <label class="directory__sort">排序
        <select v-model="sort" aria-label="专家排序"><option value="recommended">推荐</option><option value="name">名称</option></select>
      </label>
    </div>

    <div v-if="visibleExperts.length" class="expert-grid">
      <button v-for="expert in visibleExperts" :key="expert.id" type="button" class="expert-card" @click="detail = expert">
        <span class="expert-card__top"><span class="expert-avatar" :class="`tone-${expert.tone}`"><Icon :icon="expert.icon" :width="22" /></span><span><strong>{{ expert.name }}</strong><small>{{ expert.byline }}</small></span><Icon class="expert-card__arrow" icon="lucide:arrow-up-right" :width="16" /></span>
        <span class="expert-card__description">{{ expert.description }}</span>
        <span class="expert-card__tags"><span v-for="tag in expert.tags" :key="tag">{{ tag }}</span></span>
      </button>
    </div>
    <div v-else class="directory__empty"><Icon icon="lucide:search-x" :width="23" /><strong>没有找到匹配的专家</strong><span>试试其他关键词或切换分类。</span></div>

    <div v-if="detail" class="expert-overlay" @click.self="detail = null" @keydown.esc="detail = null">
      <section ref="detailDialog" class="expert-detail" role="dialog" aria-modal="true" :aria-label="`${detail.name}详情`" tabindex="-1">
        <button class="expert-detail__close" type="button" aria-label="关闭专家详情" @click="detail = null"><Icon icon="lucide:x" :width="18" /></button>
        <div class="expert-detail__identity"><span class="expert-avatar expert-avatar--large" :class="`tone-${detail.tone}`"><Icon :icon="detail.icon" :width="27" /></span><div><span class="expert-detail__eyebrow">{{ detail.team ? 'EXPERT TEAM' : 'EXPERT' }} · {{ detail.category }}</span><h2>{{ detail.name }}</h2><span>{{ detail.byline }}</span></div></div>
        <p class="expert-detail__description">{{ detail.description }}</p>
        <div class="expert-detail__tags"><span v-for="tag in detail.tags" :key="tag">{{ tag }}</span></div>
        <button type="button" class="expert-detail__summon" @click="summon(detail)"><Icon icon="lucide:arrow-up-right" :width="17" />用这个视角起草任务</button>
        <div class="expert-detail__examples"><h3><Icon icon="lucide:lightbulb" :width="18" />可以从这里开始</h3><button v-for="prompt in detail.prompts" :key="prompt" type="button" @click="summon(detail, prompt)"><span>{{ prompt }}</span><Icon icon="lucide:corner-down-left" :width="16" /></button></div>
        <p class="expert-detail__note">示例会填入可编辑输入框。当前由工作台协作模式处理，不会开启独立专家会话。</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.directory { flex: 1; min-height: 0; overflow-y: auto; padding: 28px clamp(20px,4vw,64px) 70px; background: var(--color-surface); }
.directory__controls, .directory__filters, .directory__section-title { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.expert-detail__eyebrow { color: var(--color-primary); font-size: 10px; letter-spacing: .12em; font-weight: 700; }
.directory__section-title { justify-content: flex-start; margin-bottom: 15px; }
.directory__section-title h1 { margin: 0; font: 650 20px/1.3 var(--font-ui); color: var(--color-text); letter-spacing: -.02em; }
.directory__section-title span { font-size: 12px; color: var(--color-text-muted); }
.scenes { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; margin-bottom: 34px; }
.scene { position: relative; min-width: 0; min-height: 150px; display: flex; flex-direction: column; align-items: flex-start; gap: 7px; padding: 20px; text-align: left; border: 1px solid var(--color-border); border-radius: 16px; color: var(--color-text); cursor: pointer; background: linear-gradient(135deg, var(--scene-tint), var(--color-surface) 78%); transition: transform .18s, border-color .18s; }
.scene:hover, .expert-card:hover { transform: translateY(-2px); border-color: var(--color-border-strong); }
.scene > svg:first-child { color: var(--scene-ink); margin-bottom: auto; }
.scene strong { font-size: 14px; }
.scene span { font-size: 12px; color: var(--color-text-muted); }
.scene__arrow { position: absolute; right: 17px; top: 18px; color: var(--color-text-muted); }
.tone-violet { --scene-tint: #f0eafc; --scene-ink: #795b9f; }.tone-coral { --scene-tint: #fff0e7; --scene-ink: #b96a49; }.tone-blue { --scene-tint: #e8f2fa; --scene-ink: #527ca8; }.tone-mint { --scene-tint: #e9f6ef; --scene-ink: #4d9276; }.tone-amber { --scene-tint: #fff3dc; --scene-ink: #ad7b30; }.tone-rose { --scene-tint: #faebf0; --scene-ink: #b7637d; }.tone-teal { --scene-tint: #e7f5f4; --scene-ink: #3e918c; }.tone-indigo { --scene-tint: #eaeefa; --scene-ink: #6274af; }
.directory__controls { margin-bottom: 16px; }
.directory__tabs { display: flex; gap: 18px; }
.directory__tabs button { border: 0; border-bottom: 2px solid transparent; background: transparent; padding: 8px 0; color: var(--color-text-muted); font: 600 16px var(--font-ui); cursor: pointer; }
.directory__tabs button.active { color: var(--color-text); border-color: var(--color-primary); }
.directory__search { display: flex; align-items: center; gap: 7px; min-width: 230px; border: 1px solid var(--color-border); border-radius: 9px; padding: 8px 10px; color: var(--color-text-muted); }
.directory__search input { width: 100%; border: 0; outline: none; background: transparent; color: var(--color-text); font: inherit; font-size: 12px; }
.directory__filters { border-bottom: 1px solid var(--color-border); padding-bottom: 15px; margin-bottom: 18px; }
.categories { display: flex; gap: 5px; overflow-x: auto; min-width: 0; }.categories button { flex: 0 0 auto; border: 0; border-radius: 7px; background: transparent; padding: 6px 9px; color: var(--color-text-muted); font: inherit; font-size: 11px; cursor: pointer; }.categories button.active { background: var(--chat-rail-bg); color: var(--color-text); font-weight: 700; }
.directory__sort { flex: none; color: var(--color-text-muted); font-size: 11px; }.directory__sort select { margin-left: 5px; border: 1px solid var(--color-border); border-radius: 7px; padding: 5px 7px; background: var(--color-surface); color: var(--color-text); }
.expert-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; }
.expert-card { min-width: 0; min-height: 180px; display: flex; flex-direction: column; align-items: stretch; gap: 14px; padding: 18px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface); color: var(--color-text); text-align: left; cursor: pointer; transition: transform .18s,border-color .18s; }
.expert-card__top { display: flex; align-items: center; gap: 10px; min-width: 0; }.expert-card__top > span:nth-child(2) { display: flex; flex-direction: column; gap: 3px; min-width: 0; }.expert-card__top strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.expert-card__top small { color: var(--color-text-muted); font-size: 11px; }.expert-card__arrow { margin-left: auto; color: var(--color-text-muted); }
.expert-avatar { flex: none; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 13px; background: var(--scene-tint); color: var(--scene-ink); }.expert-avatar--large { width: 62px; height: 62px; border-radius: 18px; }
.expert-card__description { color: var(--color-text-muted); font-size: 12px; line-height: 1.55; min-height: 38px; }.expert-card__tags,.expert-detail__tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: auto; }.expert-card__tags span,.expert-detail__tags span { padding: 4px 7px; border-radius: 5px; background: var(--chat-rail-bg); color: var(--color-text-muted); font-size: 10px; }
.directory__empty { display: grid; justify-items: center; gap: 8px; padding: 56px; color: var(--color-text-muted); font-size: 12px; }.directory__empty strong { color: var(--color-text); font-size: 14px; }
.expert-overlay { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; padding: 20px; background: rgba(23,25,31,.46); }
.expert-detail { position: relative; width: min(650px,100%); max-height: min(88vh,800px); overflow: auto; padding: 30px; border-radius: 20px; background: var(--color-surface); box-shadow: var(--shadow-lg); }.expert-detail__close { position: absolute; right: 20px; top: 20px; display: grid; place-items: center; width: 30px; height: 30px; border: 0; background: transparent; color: var(--color-text-muted); cursor: pointer; }.expert-detail__identity { display: flex; align-items: center; gap: 15px; padding-right: 25px; }.expert-detail__identity h2 { margin: 4px 0; color: var(--color-text); font-size: 24px; }.expert-detail__identity span:last-child { color: var(--color-text-muted); font-size: 12px; }.expert-detail__description { color: var(--color-text); font-size: 14px; line-height: 1.65; margin: 22px 0 14px; }.expert-detail__tags { margin-bottom: 20px; }.expert-detail__summon { display: inline-flex; align-items: center; gap: 7px; padding: 10px 16px; border: 0; border-radius: 9px; background: var(--color-text); color: var(--color-surface); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }.expert-detail__examples { margin-top: 30px; }.expert-detail__examples h3 { display: flex; align-items: center; gap: 8px; font-size: 15px; }.expert-detail__examples button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 15px; padding: 14px 16px; margin-top: 8px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--chat-rail-bg); color: var(--color-text); text-align: left; font: inherit; font-size: 12px; line-height: 1.5; cursor: pointer; }.expert-detail__examples button:hover { border-color: var(--color-primary); }.expert-detail__examples button svg { flex: none; }.expert-detail__note { color: var(--color-text-muted); font-size: 11px; line-height: 1.5; margin: 20px 0 0; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
@media (max-width: 1100px) { .scenes { grid-template-columns: repeat(2,minmax(0,1fr)); }.expert-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 650px) { .directory { padding: 22px 15px 55px; }.scenes { gap: 8px; }.scene { padding: 14px; min-height: 135px; }.directory__controls { align-items: stretch; flex-direction: column; }.directory__search { min-width: 0; }.expert-grid { grid-template-columns: 1fr; }.expert-card { min-height: 155px; }.expert-overlay { align-items: end; padding: 0; }.expert-detail { max-height: 92vh; border-radius: 20px 20px 0 0; padding: 22px; } }
</style>
