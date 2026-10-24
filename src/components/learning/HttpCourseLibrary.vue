<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores'
import D3Treemap from '@/components/charts/D3Treemap.vue'
import { Icon } from '@iconify/vue'
import { readCourseCatalog, readLearningCourse, readChapterRecords, saveProgress } from '@/api/learning'
import type { LearningCourse, LearningChapter, ChapterRecord, CourseCategoryOption } from '@/api/learning'

const route = useRoute(), router = useRouter(), user = useUserStore()
const owner = computed(() => user.currentUser?.id || '')
const selected = computed(() => typeof route.query.course_id === 'string' ? route.query.course_id : '')
const courses = ref<LearningCourse[]>([]), categories = ref<string[]>([]), total = ref(0)
const categoryOptions = ref<CourseCategoryOption[]>([]), catalogTotal = ref(0)
const failedCovers = ref<Set<string>>(new Set())
function catalogText(raw?: string | null, fallback = '资料文字待核对') {
  if (!raw?.trim()) return ''
  // Observed stored C1 characters / legacy AI-category mojibake. This is a
  // presentation boundary, never a heuristic re-encoding or invented content.
  return /[\u0080-\u009f\ufffd]/.test(raw) || raw.includes('äººå·¥') ? fallback : raw
}
const aggregates = computed(() => categoryOptions.value.map(c => ({id: c.value, name: c.label, count: c.course_count})))
function selectCategory(value: string) { category.value = value; search() }
function cover(item: LearningCourse) {
  const url = material(item.thumbnail_url)
  // Seeded random stock imagery is decoration, not an actual course cover.
  if (!url || failedCovers.value.has(item.course_id) || new URL(url).hostname === 'picsum.photos') return ''
  return url
}
const keyword = ref(''), category = ref(''), page = ref(1), limit = 6
const listLoading = ref(false), listError = ref('')
const course = ref<LearningCourse | null>(null), detailLoading = ref(false), detailError = ref('')
const records = ref<ChapterRecord[]>([]), recordsReady = ref(false), progressError = ref('')
const saving = ref(''), saveMessage = ref('')
let listEpoch = 0, detailEpoch = 0, recordEpoch = 0, saveEpoch = 0, alive = true
function message(error: unknown) {
  // Shared dev diagnostics include a backend URL; students need a next action,
  // not instructions to start the server or its local address.
  if (error && typeof error === 'object' && 'kind' in error && error.kind === 'network') {
    return '暂时无法连接学习服务，请稍后重新读取。'
  }
  return error instanceof Error ? error.message : '服务暂不可用，请重试'
}
const current = (id: string) => alive && owner.value === id
function record(chapter: LearningChapter) {
  return records.value.find(r => r.course_id === chapter.course_id && String(r.chapter_id) === String(chapter.id))
}
function marked(chapter: LearningChapter) {
  const r = record(chapter)
  return !!r && (r.completed === true || r.completed === 1) && Number(r.progress) === 100
}
const markedCount = computed(() => (course.value?.chapters || []).filter(marked).length)
const hasRecord = (id: string) => recordsReady.value && records.value.some(r => r.course_id === id)
function material(raw?: string | null) {
  try {
    const url = new URL(raw || '')
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
async function loadList() {
  const epoch = ++listEpoch, id = owner.value
  listLoading.value = true; listError.value = ''; courses.value = []; total.value = 0
  categoryOptions.value = []; catalogTotal.value = 0
  try {
    const res = await readCourseCatalog({keyword: keyword.value.trim(), category: category.value, limit, offset: (page.value - 1) * limit})
    if (!res.success || !res.data || !Array.isArray(res.data.courses)) throw new Error('课程目录未能读取，请重试')
    if (!Array.isArray(res.data.category_options) || res.data.catalog_summary?.scope !== 'all_courses'
      || !Number.isInteger(res.data.catalog_summary.total) || res.data.catalog_summary.total < 0
      || res.data.category_options.some(c => typeof c.value !== 'string' || typeof c.label !== 'string' || !Number.isInteger(c.course_count) || c.course_count < 0)
      || res.data.category_options.reduce((sum,c) => sum + c.course_count,0) !== res.data.catalog_summary.total) {
      throw new Error('课程目录结构暂不可用，请稍后重新读取；不会用当前页估算全部课程。')
    }
    if (!current(id) || epoch !== listEpoch) return
    courses.value = res.data.courses; total.value = res.data.total; categories.value = res.data.categories
    categoryOptions.value = res.data.category_options || []
    catalogTotal.value = res.data.catalog_summary?.total ?? 0
  } catch (error) { if (current(id) && epoch === listEpoch) listError.value = message(error) }
  finally { if (current(id) && epoch === listEpoch) listLoading.value = false }
}
async function loadRecords() {
  const epoch = ++recordEpoch, id = owner.value
  recordsReady.value = false; progressError.value = ''; saveMessage.value = ''
  if (!id) { records.value = []; progressError.value = '请登录后读取本人学习记录'; return false }
  try {
    const res = await readChapterRecords(id)
    if (!res.success || !Array.isArray(res.data) || res.data.some(r => String(r.user_id) !== id)) throw new Error('本人学习记录未能核验，请重试')
    if (!current(id) || epoch !== recordEpoch) return false
    records.value = res.data; recordsReady.value = true
    return true
  } catch (error) {
    if (current(id) && epoch === recordEpoch) { records.value = []; progressError.value = message(error) }
    return false
  }
}
async function loadDetail() {
  const epoch = ++detailEpoch, id = owner.value, cid = selected.value
  course.value = null; detailError.value = ''; saveMessage.value = ''; detailLoading.value = !!cid
  ++saveEpoch; saving.value = ''
  if (!cid) return
  try {
    const res = await readLearningCourse(cid)
    if (!res.success || !res.data || res.data.course_id !== cid || !Array.isArray(res.data.chapters)) throw new Error('课程详情不可用，请重新选择')
    if (!current(id) || epoch !== detailEpoch || selected.value !== cid) return
    course.value = res.data
    await loadRecords()
    if (!current(id) || epoch !== detailEpoch) return
    // Chapters are gated by detailLoading; render before finding the return point.
    detailLoading.value = false
    await nextTick()
    if (!current(id) || epoch !== detailEpoch) return
    const first = course.value?.chapters?.find(ch => !marked(ch))
    if (first && recordsReady.value) {
      const chapter = document.getElementById(`learning-chapter-${first.id}`)
      chapter?.focus({preventScroll: true})
      chapter?.scrollIntoView({block: 'nearest'})
    }
  } catch (error) {
    if (current(id) && epoch === detailEpoch) { course.value = null; detailError.value = message(error) }
  } finally { if (current(id) && epoch === detailEpoch) detailLoading.value = false }
}
async function toggle(chapter: LearningChapter) {
  if (saving.value || !recordsReady.value || !course.value || course.value.course_id !== selected.value) return
  const id = owner.value, cid = selected.value, epoch = ++saveEpoch, completed = !marked(chapter)
  saving.value = String(chapter.id); saveMessage.value = ''
  let errorText = '', sourceMissing = false
  try {
    const res = await saveProgress({course_id: cid, chapter_id: String(chapter.id), progress: completed ? 100 : 0, completed})
    if (!res.success) throw new Error('服务端未确认保存')
  } catch (error) {
    errorText = message(error)
    sourceMissing = !!error && typeof error === 'object' && 'status' in error && error.status === 404
  }
  if (!current(id) || epoch !== saveEpoch || cid !== selected.value) return
  if (sourceMissing) {
    course.value = null
    detailError.value = '课程或章节已不可用，请重新读取课程或返回目录选择。'
    saving.value = ''
    return
  }
  // A lost write response may have committed. Reconcile once; never replay POST.
  const readable = await loadRecords()
  if (!current(id) || epoch !== saveEpoch || cid !== selected.value) return
  saveMessage.value = errorText
    ? `保存响应未确认：${errorText}。${readable ? '已重新读取，请以当前记录为准。' : '当前记录也未能读取，请重试读取后再操作。'}`
    : readable && marked(chapter) === completed ? '已从服务端核对本人记录。' : '保存结果尚未核对，请重新读取。'
  saving.value = ''
}
function search() { page.value = 1; void loadList() }
function selectCourse(id: string) { void router.replace({query: {...route.query, course_id: id}}) }
function back() { const query = {...route.query}; delete query.course_id; void router.replace({query}) }
watch(selected, () => { void loadDetail() })
watch(owner, () => {
  ++listEpoch; ++detailEpoch; ++recordEpoch; ++saveEpoch
  records.value = []; recordsReady.value = false; course.value = null; saving.value = ''; saveMessage.value = ''
  void loadList(); if (selected.value) void loadDetail(); else void loadRecords()
}, {immediate: true})
onBeforeUnmount(() => { alive = false; ++listEpoch; ++detailEpoch; ++recordEpoch; ++saveEpoch })
</script>

<template>
  <section class="course-library" aria-label="课程与本人学习记录">
    <template v-if="!selected">
      <form class="course-tools" @submit.prevent="search">
        <label>课程标题<input v-model="keyword" maxlength="200" type="search" placeholder="搜索你想学习的课程" /></label>
        <button type="submit" :disabled="listLoading">搜索课程</button>
      </form>
      <nav v-if="!listLoading && !listError" class="lc-filters" aria-label="课程分类">
        <button class="lc-filter-btn" :class="{'lc-filter-btn--active': !category}" :aria-pressed="!category" @click="selectCategory('')">全部</button>
        <button v-for="item in categoryOptions" :key="item.value" class="lc-filter-btn" :class="{'lc-filter-btn--active': category === item.value}" :aria-pressed="category === item.value" @click="selectCategory(item.value)">{{ item.label }} <span>{{ item.course_count }}</span></button>
      </nav>
      <p class="course-boundary">章节已学由你主动记录；打开材料不会自动记录进度，也不代表能力已验证。</p>
      <p v-if="!recordsReady && !progressError" class="course-record-loading" role="status">正在读取本人学习记录…</p>
      <p v-if="progressError" class="course-warning" role="alert">本人学习记录读取失败，暂不能判断哪些课程已有记录。<button @click="loadRecords">重试读取记录</button></p>
      <p v-if="listLoading" role="status">正在读取课程目录…</p>
      <div v-else-if="listError" class="course-error" role="alert"><p>课程目录读取失败：{{ listError }}</p><button @click="loadList">重试读取目录</button></div>
      <template v-else>
        <section class="lc-viz card-base" aria-label="课程目录结构">
          <div class="lc-viz__treemap">
            <div class="lc-viz__panel-head"><h2>课程结构分布</h2><p>全部 {{ catalogTotal }} 门课程 · 面积代表课程数量，点击分类筛选</p></div>
            <div class="lc-viz__chart-wrap"><D3Treemap :categories="[]" :courses="[]" :aggregates="aggregates" @select-category="selectCategory" /></div>
          </div>
          <div class="lc-viz__chord">
            <div class="lc-viz__panel-head"><h2>技能亲和力弦图</h2><p>岗位所需技能的共现关系</p></div>
            <div class="lc-relation-pending" role="status"><Icon icon="lucide:network" :width="48" aria-hidden="true" /><strong>技能关系资料暂未提供</strong><p>有可核对的关系资料后再展示；不影响你浏览课程。</p></div>
          </div>
        </section>
        <p class="course-total">找到 {{ total }} 门课程</p>
        <div v-if="!courses.length" class="course-empty">{{ keyword.trim() || category ? '暂无符合条件的课程。可以调整标题或分类后再试。' : '课程目录暂未提供课程，请稍后再来。' }}</div>
        <div class="course-grid lc-grid">
          <article v-for="item in courses" :key="item.course_id" class="course-card lc-card card-base">
            <div class="lc-card__img-wrap"><img v-if="cover(item)" class="lc-card__img" :src="cover(item)" alt="" loading="lazy" @error="failedCovers.add(item.course_id)" /><div v-else class="lc-card__placeholder"><Icon icon="lucide:book-open" :width="34" aria-hidden="true" /><span>课程资料</span></div></div>
            <div class="lc-card__body">
            <span class="course-category lc-card__cat">{{ item.category_label || '分类待整理' }}</span>
            <h2>{{ catalogText(item.title, '课程名称待整理') }}</h2><p>{{ catalogText(item.description) || '课程说明未提供' }}</p>
            <small>讲师：{{ catalogText(item.instructor) || '未提供' }}</small>
            <small>{{ item.chapter_count ? `${item.chapter_count} 章` : '章节尚未提供' }}</small>
            <span v-if="hasRecord(item.course_id)" class="course-record-badge">已有本人学习记录</span>
            <button class="course-open" @click="selectCourse(item.course_id)">查看课程详情 →</button>
            </div>
          </article>
        </div>
        <nav v-if="total > limit" class="course-pages" aria-label="课程分页"><button :disabled="page === 1" @click="page--; loadList()">上一页</button><span>第 {{ page }} / {{ Math.ceil(total / limit) }} 页</span><button :disabled="page * limit >= total" @click="page++; loadList()">下一页</button></nav>
      </template>
    </template>
    <template v-else>
      <button class="course-back" @click="back">← 返回全部课程</button>
      <p v-if="detailLoading" role="status">正在重新读取课程和本人记录…</p>
      <div v-else-if="detailError" class="course-error" role="alert"><p>课程不存在或暂不可读取：{{ detailError }}</p><button @click="loadDetail">重新读取课程</button></div>
      <template v-else-if="course">
        <header class="course-detail"><span class="course-category">{{ course.category_label || '分类待整理' }}</span><h2>{{ catalogText(course.title, '课程名称待整理') }}</h2><p>{{ catalogText(course.description) || '课程说明未提供' }}</p><p>讲师：{{ catalogText(course.instructor) || '未提供' }}</p></header>
        <div v-if="course.chapters?.length" class="course-progress" aria-live="polite"><strong v-if="recordsReady">已标记 {{ markedCount }}/{{ course.chapters.length }} 章</strong><strong v-else>本人学习状态暂不可用</strong><p>这是你的学习记录，不是平台对学习时长或能力的认证。没有链接也可记录你在其他地方的学习。</p><p v-if="progressError" role="alert">记录读取失败：{{ progressError }}</p><button :disabled="!!saving" @click="loadRecords">重新读取本人记录</button></div>
        <p v-if="saveMessage" class="course-save-message" role="status">{{ saveMessage }}</p>
        <p v-if="!course.chapters?.length">章节尚未提供。</p>
        <article v-for="(chapter, index) in course.chapters" :id="`learning-chapter-${chapter.id}`" :key="chapter.id" tabindex="-1" class="course-chapter" :class="{'course-chapter--marked': recordsReady && marked(chapter)}">
          <div class="chapter-heading"><h3>{{ index + 1 }}. {{ chapter.title }}</h3><span v-if="recordsReady && marked(chapter)" class="chapter-state">本人已标记已学</span><span v-else-if="recordsReady && record(chapter) && Number(record(chapter)?.progress) > 0">已有 {{ record(chapter)?.progress }}% 记录，尚未标记已学</span><span v-else-if="recordsReady">尚未标记</span><span v-else>记录未知</span></div>
          <p>{{ chapter.content_summary || '章节简介未提供' }}</p>
          <a v-if="material(chapter.video_url)" :href="material(chapter.video_url)" target="_blank" rel="noopener noreferrer" class="course-material">打开外部学习材料 ↗（新标签页）</a>
          <p v-else class="course-missing">{{ chapter.video_url ? '材料链接不可安全打开。' : '仅有章节简介，暂无学习链接。' }}</p>
          <button class="chapter-toggle" :disabled="!recordsReady || !!saving || detailLoading" @click="toggle(chapter)">{{ saving === String(chapter.id) ? '正在保存并核对…' : marked(chapter) && recordsReady ? '取消已学' : '标记本章已学' }}</button>
        </article>
      </template>
    </template>
  </section>
</template>

<style scoped>
.course-library {
  width: 100%; max-width: 1120px; min-width: 0; box-sizing: border-box;
  margin: 0 auto; padding-bottom: 32px;
  color: var(--color-text); font: 14px/1.7 var(--font-ui, sans-serif);
}
.course-tools { display: flex; gap: 16px; align-items: end; flex-wrap: wrap; }
.course-tools label { display: grid; gap: 8px; font-size: 13px; }
.course-tools label:first-child { flex: 1; min-width: 200px; }
.course-library input, .course-library select {
  min-height: 42px; border: 1px solid var(--color-border); border-radius: 10px;
  padding: 8px 12px; background: var(--color-surface); color: inherit; font: inherit;
}
.course-library button {
  min-height: 40px; border: 1px solid var(--color-border); border-radius: 10px;
  background: var(--color-surface); color: inherit; padding: 9px 15px;
  cursor: pointer; font: inherit; font-size: 13px;
}
.course-library button:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.course-library button:disabled { opacity: .5; cursor: not-allowed; }
.course-library :is(a,button,input,select):focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.course-boundary, .course-total, .course-missing, small { color: var(--color-text-muted); font-size: 13px; }
.course-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(240px,1fr)); gap: 14px; }
.course-card, .course-detail, .course-chapter {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-card,10px); padding: 24px; overflow-wrap: anywhere;
}
.course-card { display: flex; flex-direction: column; padding: 0; overflow: hidden; transition: transform .2s, box-shadow .2s; }
.course-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgb(0 0 0 / .10); }
.course-card h2 { font-size: 15px; line-height: 1.5; margin: 4px 0; }
.course-detail h2 { font-size: 20px; margin: 4px 0; }
.lc-card__img-wrap { height: 140px; flex-shrink: 0; overflow: hidden; }
.lc-card__img { width: 100%; height: 100%; object-fit: cover; }
.lc-card__placeholder { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--color-primary); background: linear-gradient(135deg,#ede8df,#f9f6f0); font-size: 12px; }
.lc-card__body { padding: 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.lc-card__cat { align-self: start; padding: 2px 7px; border-radius: 99px; background: var(--color-primary-light); }
.lc-card__body p { font-size: 12px; line-height: 1.6; }
.lc-filters { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 14px; margin-top: 18px; background: var(--card-bg,#fff); border: 1px solid var(--card-border,var(--color-border)); border-radius: var(--radius-md,10px); }
.course-library .lc-filter-btn { padding: 5px 12px; min-height: 36px; font-size: 12px; border-radius: var(--radius-sm,6px); }
.lc-filter-btn span { margin-left: 4px; color: var(--color-text-muted); }
.course-library .lc-filter-btn--active { border-color: var(--color-primary); background: var(--color-primary-light); color: var(--color-primary); font-weight: 600; }
.lc-viz { display: grid; grid-template-columns: 3fr 2fr; border: 1px solid var(--color-border); border-radius: var(--radius-md,10px); background: var(--color-surface); margin: 18px 0; }
.lc-viz__treemap,.lc-viz__chord { padding: 14px 16px; min-width: 0; }
.lc-viz__treemap { border-right: 1px solid var(--color-border); }
.lc-viz__panel-head h2 { font-size: 13px; margin: 0; }
.lc-viz__panel-head p { font-size: 11px; color: var(--color-text-muted); margin: 4px 0 10px; }
.lc-viz__chart-wrap { height: 300px; }
.lc-relation-pending { height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--color-text-muted); text-align: center; padding: 16px; box-sizing: border-box; }
.lc-relation-pending strong { font-size: 13px; color: var(--color-text); }
.lc-relation-pending p { max-width: 240px; font-size: 12px; }
.course-card p, .course-chapter p, .course-detail p { white-space: pre-wrap; margin: 6px 0 14px; }
.course-open { align-self: start; margin-top: auto; }
.course-category, .course-record-badge, .chapter-state { color: var(--color-primary); font-size: 12px; }
.course-record-badge { padding: 6px 0; }
.course-pages { display: flex; justify-content: center; align-items: center; gap: 18px; margin-top: 24px; }
.course-back { margin-bottom: 20px; }
.course-progress { padding: 20px 0; }
.course-progress p { font-size: 13px; color: var(--color-text-muted); }
.course-chapter { margin-top: 16px; scroll-margin-top: 110px; }
.course-chapter--marked { border-left: 4px solid var(--color-primary); }
.course-chapter:focus { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.chapter-heading { display: flex; justify-content: space-between; gap: 15px; align-items: baseline; flex-wrap: wrap; }
.chapter-heading h3 { font-size: 17px; margin: 0 0 8px; }
.chapter-heading span { font-size: 12px; }
.course-material { display: block; overflow-wrap: anywhere; color: var(--color-primary); font-size: 14px; margin: 12px 0 20px; }
.chapter-toggle { display: block; }
.course-error, .course-warning { padding: 16px; background: #fff6ef; color: #87421c; border: 1px solid #e8c9b6; border-radius: 10px; }
.course-warning button { margin-left: 12px; }
.course-save-message { padding: 14px; background: var(--color-background); border: 1px solid var(--color-border); border-radius: 10px; }
.course-empty { padding: 40px 20px; text-align: center; border: 1px dashed var(--color-border); border-radius: 10px; }
@media(max-width:640px) {
  .course-grid { grid-template-columns: 1fr; }
  .course-chapter, .course-detail { padding: 18px; }
  .lc-viz { grid-template-columns: 1fr; }
  .lc-viz__treemap { border-right: 0; border-bottom: 1px solid var(--color-border); }
  .lc-viz__chart-wrap,.lc-relation-pending { height: 220px; }
  .course-tools > button { width: 100%; }
}
@media(prefers-reduced-motion:reduce) { .course-card { transition: none; } .course-card:hover { transform: none; } }
</style>
