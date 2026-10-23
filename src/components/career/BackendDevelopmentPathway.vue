<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  readBackendDevelopmentPathway, readBackendDevelopmentGraph, searchBackendDevelopmentPathway,
  type BackendDevelopmentPathway, type PathwayJobFact, type PathwayGraph, type PathwaySearch,
  type PathwaySearchHit,
} from '@/api/careerPathway'

const props = withDefaults(defineProps<{ confirmedSkills?: string[] }>(), { confirmedSkills: () => [] })
const pathway = ref<BackendDevelopmentPathway | null>(null)
const loading = ref(false)
const error = ref('')
const graph = ref<PathwayGraph | null>(null), graphLoading = ref(false), graphError = ref('')
const query = ref(''), searchedQuery = ref(''), searching = ref(false), searchError = ref('')
const searchResult = ref<PathwaySearch | null>(null)
let live = true, generation = 0, searchGeneration = 0, graphGeneration = 0
const tiers = [
  { id: 'foundation', title: '先打基础', note: '语言、数据与接口的基本概念' },
  { id: 'application', title: '完成一个应用', note: '把知识用在可运行的小任务里' },
  { id: 'engineering', title: '再补工程实践', note: '测试、协作与可维护性' },
] as const
const mentioned = computed(() => new Set(props.confirmedSkills.map(value => value.trim().toLocaleLowerCase())))
const skillNames = computed(() => new Map((pathway.value?.skills || []).map(skill => [skill.skill_id, skill.name])))
const graphSkillNames = computed(() => new Map((graph.value?.skills || []).map(skill => [skill.skill_id, skill.name])))
const kindLabel = { course: '学习资料', skill: '技能', prerequisite: '学习顺序', job_reference: '岗位原文' }
function hasMention(name: string) { return mentioned.value.has(name.trim().toLocaleLowerCase()) }
function safeUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
function dateLabel(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN')
}
function currency(value: number) { return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value) }
function quoteLabel(job: PathwayJobFact): string {
  if (!job.salary_quote) return '原公告未提供可展示的薪资报价'
  const quote = job.salary_quote
  for (const key of ['raw_text', 'text', 'description']) if (typeof quote[key] === 'string' && quote[key]) return String(quote[key])
  return '公告薪资口径请查看原始来源'
}
function validity(value: PathwayJobFact['vacancy_validity']) {
  return { unknown: '是否仍在招聘需另行核对', open: '来源标记招聘开放，投递前请再次核对', closed: '已截止，仅作要求参考' }[value]
}
function currentVersion(value: { role_id?: string; revision?: string; content_sha256?: string }) {
  return pathway.value && value.role_id === pathway.value.role_id
    && value.revision === pathway.value.revision && value.content_sha256 === pathway.value.content_sha256
}
function courseForHit(hit: PathwaySearchHit) {
  return hit.kind === 'course' ? pathway.value?.courses.find(course => course.course_id === hit.entity_key) : undefined
}
function readableHit(hit: PathwaySearchHit): string {
  const course = courseForHit(hit)
  if (course) return `${course.name} · ${course.skill_ids.map(id => skillNames.value.get(id)).filter(Boolean).join('、')} · ${course.chapter_ids.length} 个章节`
  if (hit.kind === 'skill') {
    const skill = pathway.value?.skills.find(item => String(item.skill_id) === hit.entity_key)
    return skill ? `${skill.name}：${skill.evidence.note}` : '本版技能资料'
  }
  if (hit.kind === 'prerequisite') {
    const edge = pathway.value?.prerequisites.find(item => `${item.from_skill_id}:${item.to_skill_id}` === hit.entity_key)
    return edge ? `${skillNames.value.get(edge.from_skill_id)} → ${skillNames.value.get(edge.to_skill_id)}：${edge.evidence.note}` : '本版学习顺序建议'
  }
  const job = pathway.value?.jobs.find(item => item.fact_id === hit.entity_key)
  return job ? `${job.title} · ${job.employer}：${job.summary}` : '本版岗位参考资料'
}
function sourceForHit(hit: PathwaySearchHit) {
  if (hit.kind === 'skill') return safeUrl(pathway.value?.skills.find(skill => String(skill.skill_id) === hit.entity_key)?.evidence.url)
  if (hit.kind === 'course') return safeUrl(courseForHit(hit)?.source_url)
  if (hit.kind === 'job_reference') return safeUrl(pathway.value?.jobs.find(job => job.fact_id === hit.entity_key)?.source_uri)
  const edge = pathway.value?.prerequisites.find(item => `${item.from_skill_id}:${item.to_skill_id}` === hit.entity_key)
  return safeUrl(edge?.evidence.url)
}
async function loadGraph() {
  const current = ++graphGeneration, revision = pathway.value?.content_sha256
  if (!revision) return
  graphLoading.value = true; graphError.value = ''; graph.value = null
  try {
    const result = await readBackendDevelopmentGraph()
    if (!live || current !== graphGeneration || pathway.value?.content_sha256 !== revision) return
    if (result.status !== 'ready') throw new Error('技能关系暂未就绪，岗位与课程原文仍可阅读。')
    if (!currentVersion(result)) throw new Error('技能关系与本版资料不一致，请重新核对本版资料。')
    graph.value = result
  } catch (cause) {
    if (live && current === graphGeneration) graphError.value = cause instanceof Error ? cause.message : '暂时无法读取技能关系。'
  } finally { if (live && current === graphGeneration) graphLoading.value = false }
}
async function findMaterials() {
  if (searching.value || !pathway.value) return
  const current = ++searchGeneration, revision = pathway.value.content_sha256, q = query.value.trim()
  searchError.value = ''; searchResult.value = null; searchedQuery.value = q
  if (!q || [...q].length > 160) { searchError.value = '请填写 1–160 个字符的资料关键词。'; return }
  searching.value = true
  try {
    const result = await searchBackendDevelopmentPathway(q)
    if (!live || current !== searchGeneration || pathway.value?.content_sha256 !== revision) return
    if (result.results.length && !currentVersion(result)) throw new Error('检索资料版本已变化，请重新核对本版资料后查询。')
    if (result.results.some(hit => !currentVersion(hit) || hit.visibility !== 'public'
      || hit.match_eligible !== false || hit.score_kind !== 'retrieval_similarity_only')) {
      throw new Error('部分检索资料的范围无法核对，已停止展示，请重试。')
    }
    searchResult.value = result
  } catch (cause) {
    if (live && current === searchGeneration) searchError.value = cause instanceof Error ? cause.message : '资料检索暂时不可用，请重试。'
  } finally { if (live && current === searchGeneration) searching.value = false }
}
async function load() {
  const current = ++generation
  ++searchGeneration; ++graphGeneration
  graph.value = null; graphError.value = ''; graphLoading.value = false
  searchResult.value = null; searchError.value = ''; searching.value = false
  loading.value = true; error.value = ''; pathway.value = null
  try {
    const result = await readBackendDevelopmentPathway()
    if (live && current === generation) { pathway.value = result; void loadGraph() }
  } catch (cause) {
    if (live && current === generation) error.value = cause instanceof Error ? cause.message : '暂时无法读取路径资料，请重试。'
  } finally { if (live && current === generation) loading.value = false }
}
onMounted(() => void load())
onBeforeUnmount(() => { live = false; ++generation; ++searchGeneration; ++graphGeneration })
</script>

<template>
  <section class="backend-pathway" aria-labelledby="backend-pathway-title" :aria-busy="loading">
    <header class="pathway-intro">
      <span class="pathway-eyebrow">职业方向参考 · 不改动你的简历</span>
      <h2 id="backend-pathway-title">后端开发，从岗位要求走到学习材料</h2>
      <p>先读岗位原文，再看参考薪资和技能路径。这里的资料不代表资格审核通过，也不会自动发起岗位匹配。</p>
    </header>
    <div v-if="loading" class="pathway-feedback" role="status">正在读取已发布的路径资料…</div>
    <div v-else-if="error" class="pathway-feedback pathway-feedback--error" role="alert">
      <p>{{ error }}</p><button type="button" @click="load">重新读取资料</button>
    </div>
    <template v-else-if="pathway">
      <p class="pathway-version">版本 {{ pathway.revision }} · 发布于 {{ dateLabel(pathway.published_at) }}</p>

      <section class="pathway-section" aria-labelledby="pathway-jobs">
        <div class="pathway-section-heading"><span class="pathway-number">01</span><h3 id="pathway-jobs">真实岗位，先看要求</h3></div>
        <p class="pathway-boundary">技能探索参考，未执行人岗评分。以下是有原始来源的岗位事实，不显示匹配分或录用概率。</p>
        <p v-if="!pathway.jobs.length" class="pathway-empty">本版尚未登记岗位原文；不会补入演示岗位。</p>
        <article v-for="job in pathway.jobs" :key="job.fact_id" class="pathway-job">
          <div class="pathway-job-title"><h4>{{ job.title }}</h4><span class="pathway-tag">仅供参考 · 不可评分</span></div>
          <p class="pathway-meta">{{ job.employer }}<span v-if="job.locations.length"> · {{ job.locations.join(' / ') }}</span><span v-if="job.recruitment_type"> · {{ job.recruitment_type }}</span></p>
          <p v-if="job.summary" class="pathway-summary">{{ job.summary }}</p>
          <dl class="pathway-requirements">
            <div v-for="(requirement, index) in job.requirements" :key="index"><dt>{{ requirement.label }}</dt><dd><span v-if="requirement.kind === 'any_of'" class="pathway-choice">以下条件满足其一：</span><span v-if="requirement.kind === 'preferred'" class="pathway-choice">优先条件：</span>{{ requirement.values.join('；') || '原文未明确说明' }}</dd></div>
            <div><dt>公告薪资</dt><dd>{{ quoteLabel(job) }}</dd></div>
          </dl>
          <div class="pathway-source"><a v-if="safeUrl(job.source_uri)" :href="safeUrl(job.source_uri)" target="_blank" rel="noopener noreferrer">查看岗位原始来源 ↗</a><span>资料获取 {{ dateLabel(job.source_fetched_at) }} · {{ validity(job.vacancy_validity) }}</span></div>
        </article>
      </section>

      <section class="pathway-section" aria-labelledby="pathway-salary">
        <div class="pathway-section-heading"><span class="pathway-number">02</span><h3 id="pathway-salary">参考薪资 <span class="pathway-estimate">估算</span></h3></div>
        <p class="pathway-boundary">与公告报价分开呈现。这是有依据的参考区间，不是已测得的市场中位数、薪资分布或你的预期 Offer。</p>
        <p v-if="!pathway.salary_references.length" class="pathway-empty">本版尚无可读取的薪资估算；岗位与学习资料仍可查看。</p>
        <article v-for="salary in pathway.salary_references" :key="salary.reference_id" class="pathway-salary">
          <div class="pathway-salary-heading"><h4>{{ salary.city }} · {{ salary.experience_level }}</h4><span>参考日期 {{ dateLabel(salary.as_of) }}</span></div>
          <p class="pathway-salary-range">¥{{ currency(salary.lower) }}<span>—</span>¥{{ currency(salary.upper) }}<small> / 月 · 人民币 · 估算区间</small></p>
          <p>{{ salary.method }}</p><p class="pathway-uncertainty">{{ salary.uncertainty }}</p><p>{{ salary.disclaimer }}</p>
          <details><summary>查看估算依据</summary><ul><li v-for="(basis, index) in salary.basis" :key="index"><a v-if="safeUrl(basis.url)" :href="safeUrl(basis.url)" target="_blank" rel="noopener noreferrer">{{ basis.title }} ↗</a><span v-else>{{ basis.title }}</span><p>{{ basis.note }}</p></li></ul></details>
        </article>
      </section>

      <section class="pathway-section" aria-labelledby="pathway-skills">
        <div class="pathway-section-heading"><span class="pathway-number">03</span><h3 id="pathway-skills">按层次补充技能，再去学习</h3></div>
        <p class="pathway-boundary">技能是方向学习建议，不是所有岗位共同的硬门槛。<template v-if="confirmedSkills.length">“简历提及”只按已确认技能名称对照，不评定掌握程度；没有提及也不等于不会。</template><template v-else>尚无可用于对照的已确认技能，先展示公共学习资料。</template></p>
        <div class="pathway-tiers">
          <section v-for="tier in tiers" :key="tier.id" class="pathway-tier">
            <template v-if="pathway.skills.some(skill => skill.tier === tier.id)">
              <h4>{{ tier.title }}</h4><p class="pathway-tier-note">{{ tier.note }}</p>
              <ul><li v-for="skill in pathway.skills.filter(item => item.tier === tier.id)" :key="skill.skill_id">
                <div class="pathway-skill-name"><strong>{{ skill.name }}</strong><span v-if="hasMention(skill.name)" class="pathway-mentioned">简历提及</span></div>
                <a v-if="safeUrl(skill.evidence.url)" :href="safeUrl(skill.evidence.url)" target="_blank" rel="noopener noreferrer">查看学习依据 ↗</a><p v-if="skill.evidence.note">{{ skill.evidence.note }}</p>
              </li></ul>
            </template>
          </section>
        </div>
        <div class="pathway-graph-state" aria-live="polite">
          <p v-if="graphLoading">正在读回技能与课程关系…</p>
          <p v-else-if="graphError">{{ graphError }} <button type="button" @click="loadGraph">重读关系</button></p>
          <details v-else-if="graph?.status === 'ready'" class="pathway-prerequisites"><summary>已读回 {{ graph.skills?.length }} 项技能、{{ graph.courses?.length }} 份课程资料的关系 · 查看学习顺序</summary><p>从本版关系图独立读取；箭头从先学内容指向后续内容。</p><ul><li v-for="(edge, index) in graph.prerequisites" :key="index"><span>{{ graphSkillNames.get(edge.from_skill_id) || '待核对技能' }} → {{ graphSkillNames.get(edge.to_skill_id) || '待核对技能' }}</span><a v-if="safeUrl(edge.evidence.url)" :href="safeUrl(edge.evidence.url)" target="_blank" rel="noopener noreferrer">顺序依据 ↗</a><p v-if="edge.evidence.note">{{ edge.evidence.note }}</p></li></ul></details>
        </div>
        <section class="pathway-search" aria-labelledby="pathway-search-title">
          <h4 id="pathway-search-title">查找相关资料</h4><p class="pathway-boundary">用自己的话描述想了解的内容。结果只来自本版公共资料，不读取或上传你的简历。</p>
          <form @submit.prevent="findMaterials"><label for="pathway-search-input">资料关键词</label><div class="pathway-search-controls"><input id="pathway-search-input" v-model="query" maxlength="160" type="search" placeholder="例如：接口测试和数据库查询" :disabled="searching" /><button type="submit" :disabled="searching">{{ searching ? '正在查找…' : '查找相关资料' }}</button></div></form>
          <p v-if="searchError" class="pathway-search-error" role="alert">{{ searchError }}</p>
          <div v-else-if="searchResult" aria-live="polite"><p class="pathway-boundary">“{{ searchedQuery }}”的资料结果 · 仅表示内容相关性，不是人岗匹配分。</p><p v-if="searchResult.status === 'partial'" class="pathway-search-error">部分资料暂未核对完整，可稍后重试；不会用演示结果补齐。</p><p v-else-if="!searchResult.results.length" class="pathway-empty">本版资料没有找到相关内容，可以换一个具体关键词。</p><ol v-if="searchResult.results.length" class="pathway-search-results"><li v-for="hit in searchResult.results" :key="hit.id"><span class="pathway-tag">{{ kindLabel[hit.kind] }}</span><p>{{ readableHit(hit) }}</p><div class="pathway-course-actions"><RouterLink v-if="courseForHit(hit)" :to="{name:'student-learning',query:{course_id:courseForHit(hit)!.course_id}}">查看这份课程 →</RouterLink><a v-if="sourceForHit(hit)" :href="sourceForHit(hit)" target="_blank" rel="noopener noreferrer">核对原始资料 ↗</a></div></li></ol></div>
        </section>
        <div class="pathway-courses">
          <article v-for="course in pathway.courses" :key="course.course_id" class="pathway-course"><h4>{{ course.name }}</h4><p>{{ course.skill_ids.map(id => skillNames.get(id)).filter(Boolean).join(' · ') }}</p><p class="pathway-meta">{{ course.chapter_ids.length }} 个已登记章节</p><div class="pathway-course-actions"><RouterLink :to="{ name: 'student-learning', query: { course_id: course.course_id } }">进入课程详情 →</RouterLink><a v-if="safeUrl(course.source_url)" :href="safeUrl(course.source_url)" target="_blank" rel="noopener noreferrer">查看官方资料 ↗</a></div></article>
        </div>
        <p class="pathway-boundary">打开课程不会标记已学，也不修改你的自评或画像。是否记录学习进度，由你在课程页主动决定。</p>
      </section>
      <footer class="pathway-footer"><button type="button" @click="load">重新核对本版资料</button></footer>
    </template>
  </section>
</template>

<style scoped>
.backend-pathway { width: 100%; min-width: 0; padding: 80px clamp(18px, 3vw, 42px) 36px; color: var(--color-text); font-size: var(--fs-body); line-height: 1.7; overflow-wrap: anywhere; }
.pathway-intro { max-width: 74ch; margin-bottom: 16px; }
.pathway-eyebrow,.pathway-number { color: var(--color-primary); font-size: var(--fs-caption); font-weight: 600; }
.pathway-intro h2 { font-size: var(--fs-h1); line-height: 1.4; font-family: var(--font-display, serif); margin: 8px 0 12px; }
.pathway-intro p,.pathway-boundary,.pathway-meta,.pathway-source,.pathway-version,.pathway-tier-note,.pathway-footer { color: var(--color-text-muted); }
.pathway-version,.pathway-meta,.pathway-source,.pathway-boundary,.pathway-tier-note { font-size: var(--fs-caption); }
.pathway-section { border-top: 1px solid var(--color-border); margin-top: 28px; padding-top: 24px; }
.pathway-section-heading { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
h3 { font-size: var(--fs-h2); font-weight: 600; margin: 0; } h4 { font-size: var(--fs-body); font-weight: 600; margin: 0; }
p { margin: 6px 0; } a { color: var(--color-primary-dark); text-decoration: underline; text-underline-offset: 3px; }
a:focus-visible,button:focus-visible,summary:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 4px; }
button,.pathway-course-actions > :first-child { min-height: 44px; display: inline-flex; align-items: center; padding: 8px 14px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-primary-dark); font: inherit; cursor: pointer; }
.pathway-feedback { padding: 28px 0; }.pathway-feedback--error { color: var(--color-primary-dark); }
.pathway-search { margin-top: 24px; padding: 20px 0; border-top: 1px solid var(--color-border); }.pathway-search form > label { display: block; margin: 10px 0 6px; font-size: var(--fs-caption); }.pathway-search-controls { display: flex; gap: 8px; flex-wrap: wrap; }.pathway-search-controls input { flex: 1 1 220px; min-width: 0; min-height: 44px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); padding: 8px 12px; font: inherit; font-size: 16px; }.pathway-search-controls input:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }.pathway-search-controls button:disabled { opacity: .6; cursor: wait; }.pathway-search-error { color: var(--color-primary-dark); }.pathway-search-results { padding-left: 22px; }.pathway-search-results li { padding: 18px 0; border-bottom: 1px solid var(--color-border); }.pathway-search-results .pathway-course-actions { font-size: var(--fs-caption); }.pathway-graph-state { color: var(--color-text-muted); font-size: var(--fs-caption); }.pathway-graph-state button { min-height: 36px; padding: 3px 10px; }
.pathway-job { padding: 22px 0; border-bottom: 1px solid var(--color-border); }.pathway-job:last-child { border-bottom: 0; }
.pathway-job-title,.pathway-salary-heading,.pathway-skill-name { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; }
.pathway-tag,.pathway-mentioned,.pathway-estimate { font-size: var(--fs-caption); white-space: nowrap; color: var(--color-primary-dark); background: var(--color-primary-light); padding: 3px 8px; border-radius: var(--radius-sm); }
.pathway-summary { max-width: 80ch; }.pathway-requirements { margin: 14px 0; }.pathway-requirements > div { display: grid; grid-template-columns: minmax(80px, 130px) minmax(0, 1fr); gap: 8px 16px; margin-top: 8px; }
dt { font-weight: 600; } dd { margin: 0; }.pathway-choice { color: var(--color-primary-dark); }.pathway-source { display: flex; gap: 8px 20px; flex-wrap: wrap; margin-top: 12px; }
.pathway-salary { padding: 20px; margin: 16px 0; border-radius: var(--radius-card); background: var(--color-surface); border: 1px solid var(--color-border); }.pathway-salary-heading > span { font-size: var(--fs-caption); color: var(--color-text-muted); }
.pathway-salary-range { font-size: var(--fs-h1); font-variant-numeric: tabular-nums; font-weight: 600; line-height: 1.5; margin: 12px 0; }.pathway-salary-range > span { margin: 0 10px; font-weight: 400; }.pathway-salary-range small { display: block; font-size: var(--fs-caption); color: var(--color-text-muted); font-weight: 400; }.pathway-uncertainty { color: var(--color-primary-dark); }
details { margin-top: 14px; } summary { cursor: pointer; color: var(--color-primary-dark); min-height: 36px; } details ul { margin: 8px 0; padding-left: 20px; } details li { padding: 6px 0; } details p { color: var(--color-text-muted); font-size: var(--fs-caption); }
.pathway-tiers { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 24px; margin: 20px 0; }.pathway-tier:empty { display: none; }.pathway-tier h4 { color: var(--color-primary-dark); }.pathway-tier > ul { list-style: none; padding: 0; margin: 0; }.pathway-tier li { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--color-border); }.pathway-tier li > p,.pathway-tier li > a { font-size: var(--fs-caption); }.pathway-tier li > p { color: var(--color-text-muted); }.pathway-mentioned { color: var(--color-secondary); background: var(--accent-200); }
.pathway-prerequisites li > a { margin-left: 16px; }.pathway-courses { margin: 24px 0; }.pathway-course { padding: 18px 0; border-top: 1px solid var(--color-border); }.pathway-course > p { font-size: var(--fs-caption); }.pathway-course-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 20px; margin-top: 12px; }.pathway-course-actions > :first-child { text-decoration: none; background: var(--color-primary); color: var(--color-surface); border-color: var(--color-primary); }
.pathway-footer { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding-top: 20px; margin-top: 16px; border-top: 1px solid var(--color-border); font-size: var(--fs-caption); }
@media (max-width: 900px) { .pathway-tiers { grid-template-columns: 1fr; gap: 18px; }.pathway-tier { border-left: 2px solid var(--color-border); padding-left: 14px; } }
@media (max-width: 560px) { .backend-pathway { padding: 82px 16px 28px; }.pathway-intro h2 { font-size: var(--fs-h2); }.pathway-requirements > div { grid-template-columns: 1fr; gap: 2px; }.pathway-salary { padding: 16px; }.pathway-salary-range { font-size: var(--fs-h2); }.pathway-course-actions { align-items: stretch; flex-direction: column; }.pathway-course-actions > :first-child { justify-content: center; } }
</style>
