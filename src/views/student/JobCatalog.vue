<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useRoute, useRouter } from 'vue-router'
import JobComparison from '@/components/reports/JobComparison.vue'
import { getApiMode } from '@/api/config'
import { ApiError } from '@/api/types'
import { createPublishedJobFavorite, listSavedJobs } from '@/api/favorites'
import { getJobCatalogDetail, listJobCatalog, type JobCatalogItem, type JobCatalogResponse } from '@/api/jobCatalog'

const limit = 20
const keyword = ref('')
const submittedKeyword = ref('')
const pageOffset = ref(0)
const catalog = ref<JobCatalogResponse | null>(null)
const loading = ref(false)
const error = ref('')
const selected = ref<JobCatalogItem | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const detailOpen = ref(false)
const favoriteBusy = ref(false)
const favoriteChecking = ref(false)
const favoriteRecordId = ref<string | null>(null)
const favoriteError = ref('')
const router = useRouter()
const route = useRoute()

const pageNumber = computed(() => Math.floor(pageOffset.value / limit) + 1)
const hasPrevious = computed(() => pageOffset.value > 0)
const hasNext = computed(() => Boolean(catalog.value && pageOffset.value + catalog.value.count < catalog.value.total))
const isPartial = computed(() => catalog.value?.status === 'partial')

function formatDate(value?: unknown): string {
  if (typeof value !== 'string' || !value) return '日期未提供'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(date)
}

function sourceKind(item: JobCatalogItem): 'official' | 'reviewed' {
  return item.publication_status === 'source_only' ? 'official' : 'reviewed'
}

function statusLabel(item: JobCatalogItem): string {
  return sourceKind(item) === 'official' ? '官方来源 · 仅展示' : '管理员审核发布'
}

function safeExternalUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}

function firstSentence(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '暂未提供岗位说明。'
  const clean = value.trim().replace(/\s+/g, ' ')
  return clean.length > 180 ? `${clean.slice(0, 180)}…` : clean
}

function sourceText(item: JobCatalogItem): string {
  const record = item.source_record ?? {}
  const snapshot = item.portrait_json ?? {}
  const text = record.entreq ?? snapshot.source_text
  if (typeof text === 'string' && text.trim()) return firstSentence(text)
  return sourceKind(item) === 'reviewed'
    ? '管理员审核了导入资料；来源地址由管理员提供，平台未独立核验。'
    : '岗位要求以官方原文为准；打开详情核对。'
}

function failedSourceMessage(): string {
  const sources = catalog.value?.failed_sources ?? []
  if (sources.includes('official_source_verification')) {
    return '官方来源核验暂不可用；上方岗位仅显示当前已确认可读的部分。请稍后刷新，不能将此状态理解为官方来源为空或仍然有效。'
  }
  return '部分岗位来源暂不可用。当前结果不代表完整目录，请稍后重新读取。'
}

async function loadCatalog(offset = 0) {
  loading.value = true
  error.value = ''
  pageOffset.value = offset
  try {
    const result = await listJobCatalog({ keyword: submittedKeyword.value, limit, offset })
    if (result.status === 'unavailable') {
      catalog.value = null
      error.value = '岗位目录暂不可用；现在无法判断是否有可浏览的岗位。请稍后重试。'
      return
    }
    catalog.value = result
  } catch (reason) {
    catalog.value = null
    error.value = reason instanceof ApiError
      ? `暂时无法读取岗位目录：${reason.message}`
      : '暂时无法读取岗位目录；请确认已经连接平台服务端后重试。'
  } finally {
    loading.value = false
  }
}

function searchJobs() {
  submittedKeyword.value = keyword.value.trim()
  void loadCatalog(0)
}

async function openDetail(item: JobCatalogItem) {
  selected.value = null
  detailError.value = ''
  detailLoading.value = true
  detailOpen.value = true
  try {
    const id = item.portrait_id ?? item.job_portrait_id
    selected.value = await getJobCatalogDetail(id)
    await refreshFavoriteState(selected.value)
  } catch (reason) {
    detailError.value = reason instanceof ApiError && reason.status === 404
      ? '这份岗位资料已不再作为当前版本提供，目录正在刷新。'
      : reason instanceof ApiError
        ? `岗位详情暂不可用：${reason.message}`
        : '岗位详情暂不可用，请稍后重试。'
    if (reason instanceof ApiError && reason.status === 404) void loadCatalog(pageOffset.value)
  } finally {
    detailLoading.value = false
  }
}

async function refreshFavoriteState(item: JobCatalogItem) {
  favoriteRecordId.value = null
  favoriteError.value = ''
  favoriteChecking.value = true
  try {
    const rows = await listSavedJobs('')
    const saved = rows.find(row => row.jobPortraitId === item.job_portrait_id
      && row.publicationVersion === item.publication_version)
    favoriteRecordId.value = saved?.savedJobId ?? null
  } catch {
    // A failed read is not an empty list and never implies "not saved".
    favoriteError.value = '暂时无法读取你的收藏状态；可稍后重试或先去心仪岗位查看。'
  } finally {
    favoriteChecking.value = false
  }
}

async function saveSelectedJob() {
  const job = selected.value
  if (!job || sourceKind(job) !== 'reviewed' || favoriteBusy.value || favoriteRecordId.value) return
  const jobPortraitId = job.job_portrait_id
  const version = job.publication_version
  const digest = job.content_sha256
  if (!jobPortraitId || !version || !digest) {
    favoriteError.value = '当前资料缺少可核对的发布版本，暂时不能收藏。请返回目录重新读取。'
    return
  }
  favoriteBusy.value = true
  favoriteError.value = ''
  try {
    const result = await createPublishedJobFavorite({
      job_portrait_id: jobPortraitId,
      publication_version: version,
      content_sha256: digest,
    })
    // The button changes only after the server confirms and returns the saved record.
    favoriteRecordId.value = String(result.saved_job_id)
  } catch (reason) {
    favoriteError.value = reason instanceof ApiError && reason.status === 409
      ? '这份岗位资料刚刚发生变化或已撤回，没有收藏成功。请刷新目录后重新查看。'
      : reason instanceof ApiError
        ? `收藏没有完成：${reason.message}`
        : '收藏没有完成；当前页面未标记为已收藏，请稍后重试。'
    if (reason instanceof ApiError && reason.status === 409) void loadCatalog(pageOffset.value)
  } finally {
    favoriteBusy.value = false
  }
}

function listText(value: unknown): string {
  return Array.isArray(value)
    ? value.map(item => typeof item === 'string' ? item : String(objectValue(item, 'name') ?? '')).filter(Boolean).join('、') || '来源未列明'
    : '来源未列明'
}

function objectValue(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined
}

const selectedRecord = computed(() => selected.value?.source_record ?? {})
const selectedSnapshot = computed(() => selected.value?.portrait_json ?? {})
const selectedProfile = computed(() => {
  const value = selectedSnapshot.value.job_profile
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
})
const majorRequirements = computed(() => {
  const values = selectedProfile.value.major_requirements
  if (Array.isArray(values) && values.length) return listText(values)
  const evidence = objectValue(selectedSnapshot.value.field_evidence, 'major_requirements')
  if (objectValue(evidence, 'status') === 'explicit' && selectedProfile.value.major_strict === false) {
    return '不限专业'
  }
  return '来源未列明'
})
const requiredSkills = computed(() => listText(selectedSnapshot.value.required_skills))

onMounted(async () => {
  await loadCatalog()
  const id = route.query.job_id
  const version = route.query.version
  if (typeof id !== 'string' || typeof version !== 'string') return
  detailOpen.value = true
  try {
    const item = await getJobCatalogDetail(id)
    if (String(item.publication_version) !== version) {
      detailError.value = '收藏中的版本已不再是当前版本。请回心仪岗位查看历史资料，不会自动对照新版本。'
      return
    }
    await openDetail(item)
  } catch {
    detailError.value = '收藏中的岗位版本目前不可用。请回心仪岗位查看历史资料。'
  }
})
</script>

<template>
  <main class="catalog-page">
    <header class="catalog-hero">
      <div class="hero-copy">
        <div class="eyebrow"><span>求职资料</span><i /> <span>岗位目录</span></div>
        <h1>先看岗位原文，<br class="mobile-break">再决定要不要继续了解。</h1>
        <p>这里展示进入平台的岗位资料及其来源状态。目录不判断你是否适合，也不保证岗位仍在招聘；先看清资料来自哪里、哪些信息已经核对。</p>
      </div>
      <div class="hero-note"><Icon icon="lucide:bookmark-check" /><span>每份岗位都标注<br>它为什么出现在这里</span></div>
    </header>

    <form class="search-bar" role="search" @submit.prevent="searchJobs">
      <Icon icon="lucide:search" aria-hidden="true" />
      <input v-model="keyword" aria-label="搜索岗位名称" placeholder="搜索岗位名称，例如：数据分析、软件开发">
      <button type="submit" :disabled="loading">{{ loading ? '读取中…' : '搜索' }}</button>
      <button v-if="submittedKeyword" class="reset-search" type="button" :disabled="loading" @click="keyword = ''; submittedKeyword = ''; loadCatalog(0)">清除</button>
    </form>

    <section class="catalog-status" aria-live="polite">
      <div class="result-count"><span class="count-dot" />
        <template v-if="catalog">{{ submittedKeyword ? `“${submittedKeyword}”` : '当前目录' }} · {{ catalog.total }} 份资料</template>
        <template v-else>目录状态</template>
      </div>
      <span class="status-note">招聘状态未确认</span>
    </section>

    <div v-if="isPartial" class="partial-notice"><Icon icon="lucide:triangle-alert" /><p>{{ failedSourceMessage() }}</p></div>
    <div v-if="error" class="error-state" role="alert">
      <Icon icon="lucide:cloud-off" /><h2>暂时读不到岗位目录</h2><p>{{ error }}</p><button type="button" @click="loadCatalog(pageOffset)">重试读取</button>
    </div>
    <div v-else-if="loading && !catalog" class="loading-state"><el-skeleton :rows="5" animated /></div>
    <div v-else-if="catalog?.status === 'empty'" class="empty-state">
      <div class="empty-mark"><Icon icon="lucide:inbox" /></div><span class="kicker">没有匹配的岗位资料</span>
      <h2>{{ submittedKeyword ? '试试更短的岗位名称' : '目录现在是空的' }}</h2>
      <p>{{ submittedKeyword ? '搜索只按已发布岗位名称进行。修改关键词后再试一次。' : '平台暂时没有可供浏览的已发布岗位。这里不会用演示岗位填充空结果。' }}</p>
      <button v-if="submittedKeyword" type="button" @click="keyword = ''; submittedKeyword = ''; loadCatalog(0)">查看全部目录</button>
    </div>
    <div v-else-if="catalog?.status === 'partial' && catalog.total === 0" class="error-state">
      <Icon icon="lucide:triangle-alert" /><h2>目前没有可确认展示的岗位</h2><p>{{ failedSourceMessage() }}这不是完整目录的空结果。</p><button type="button" @click="loadCatalog(pageOffset)">重新核验目录</button>
    </div>

    <section v-else-if="catalog" class="job-grid" aria-label="岗位资料列表">
      <article v-for="(item, index) in catalog.data" :key="item.portrait_id ?? item.job_portrait_id" class="job-card" :class="{ 'job-card--official': sourceKind(item) === 'official' }">
        <div class="job-card__top"><span class="card-number">{{ String(pageOffset + index + 1).padStart(2, '0') }}</span><span class="trust-label" :class="sourceKind(item)"><Icon :icon="sourceKind(item) === 'official' ? 'lucide:landmark' : 'lucide:clipboard-check'" />{{ statusLabel(item) }}</span></div>
        <h2>{{ item.position_name }}</h2>
        <p class="job-summary">{{ sourceText(item) }}</p>
        <div class="card-details"><span><Icon icon="lucide:calendar-days" />招聘状态未确认</span><span><Icon icon="lucide:clock-3" />资料更新 {{ formatDate(sourceKind(item) === 'official' ? item.source_verified_at : item.reviewed_at) }}</span></div>
        <div v-if="sourceKind(item) === 'official'" class="official-boundary">仅供查看原文，不参与评分或匹配</div>
        <button class="open-job" type="button" @click="openDetail(item)">查看岗位资料 <Icon icon="lucide:arrow-up-right" /></button>
      </article>
    </section>

    <nav v-if="catalog && catalog.total > limit" class="pagination" aria-label="岗位目录分页">
      <button :disabled="!hasPrevious || loading" @click="loadCatalog(Math.max(0, pageOffset - limit))"><Icon icon="lucide:arrow-left" />上一页</button>
      <span>第 {{ pageNumber }} 页</span>
      <button :disabled="!hasNext || loading" @click="loadCatalog(pageOffset + limit)">下一页<Icon icon="lucide:arrow-right" /></button>
    </nav>

    <el-drawer v-model="detailOpen" append-to-body direction="rtl" size="min(640px, 94vw)" :with-header="false" class="job-detail-drawer">
      <div v-if="detailLoading" class="drawer-loading"><el-skeleton :rows="7" animated /></div>
      <div v-else-if="detailError" class="drawer-error"><Icon icon="lucide:circle-alert" /><p>{{ detailError }}</p><button @click="detailOpen = false">返回目录</button></div>
      <article v-else-if="selected" class="job-detail">
        <button class="drawer-close" aria-label="关闭岗位详情" @click="detailOpen = false"><Icon icon="lucide:x" /></button>
        <div class="detail-eyebrow"><span class="trust-label" :class="sourceKind(selected)"><Icon :icon="sourceKind(selected) === 'official' ? 'lucide:landmark' : 'lucide:clipboard-check'" />{{ statusLabel(selected) }}</span></div>
        <h2>{{ selected.position_name }}</h2>
        <p class="detail-status">资料状态：{{ sourceKind(selected) === 'official' ? '官方原文已核验，可供浏览' : '管理员已审核发布；来源地址未由平台独立核验' }} <span>·</span> 招聘状态未确认</p>

        <section v-if="sourceKind(selected) === 'official'" class="source-callout"><Icon icon="lucide:eye" /><div><strong>这份资料只用于查看原文</strong><p>官方来源只证明本次读取的原文与来源记录相符；不提供评分或匹配，也不表示岗位仍在招聘。</p></div></section>
        <section v-else class="source-callout source-callout--reviewed"><Icon icon="lucide:clipboard-check" /><div><strong>这是管理员审核发布的导入资料</strong><p>平台未独立核验来源网址、原文真实性或招聘状态；请以原始来源和招聘方信息为准。</p></div></section>
        <section class="detail-section"><span class="kicker">岗位要求 / 来源原文</span>
          <p v-if="sourceKind(selected) === 'official'" class="detail-original">{{ typeof selectedRecord.entreq === 'string' && selectedRecord.entreq.trim() ? selectedRecord.entreq : '官方来源没有提供岗位要求说明。' }}</p>
          <template v-else>
            <div class="requirement-row"><span>学历</span><strong>{{ String(selectedProfile.degree_requirement ?? '原文未列明') }}</strong></div>
            <div class="requirement-row"><span>专业范围</span><strong>{{ majorRequirements }}</strong></div>
            <div class="requirement-row"><span>技能项目</span><strong>{{ requiredSkills }}</strong></div>
            <details class="original-detail"><summary>阅读管理员审核的来源原文</summary><p>{{ typeof selectedSnapshot.source_text === 'string' ? selectedSnapshot.source_text : '原文暂不可用。' }}</p></details>
          </template>
        </section>

        <section class="detail-section detail-meta"><div><span>{{ sourceKind(selected) === 'official' ? '官方来源页面' : '管理员登记的来源地址（未独立核验）' }}</span><a v-if="safeExternalUrl(selected.source_uri)" :href="safeExternalUrl(selected.source_uri)" target="_blank" rel="noopener noreferrer">{{ sourceKind(selected) === 'official' ? '查看 CSB 官方原文' : '打开管理员登记的网址' }} <Icon icon="lucide:external-link" /></a><strong v-else>来源地址未提供或不可打开</strong></div>
          <div><span>来源读取时间</span><strong>{{ formatDate(selected.source_verified_at ?? selected.source_fetched_at) }}</strong></div>
          <div v-if="sourceKind(selected) === 'official'"><span>来源岗位截止时间</span><strong>{{ typeof selectedRecord.enddate === 'string' ? formatDate(selectedRecord.enddate) : '原文没有明确截止时间' }}</strong></div>
          <div v-else><span>管理员审核时间</span><strong>{{ formatDate(selected.reviewed_at) }}</strong></div>
        </section>
        <JobComparison v-if="getApiMode() === 'http' && sourceKind(selected) === 'reviewed'"
          :key="`${selected.job_portrait_id}:${selected.publication_version}`" :job="selected" />
        <section v-if="sourceKind(selected) === 'reviewed'" class="favorite-action" aria-live="polite">
          <button type="button" :disabled="favoriteBusy || favoriteChecking || Boolean(favoriteRecordId)" @click="saveSelectedJob">
            <Icon :icon="favoriteRecordId ? 'lucide:bookmark-check' : 'lucide:bookmark-plus'" />
            {{ favoriteChecking ? '正在核对收藏…' : favoriteBusy ? '正在保存…' : favoriteRecordId ? '已收藏这份版本' : '收藏这份岗位资料' }}
          </button>
          <button v-if="favoriteRecordId" type="button" class="favorite-link" @click="router.push({ name: 'student-favorites' })">去心仪岗位查看</button>
          <p v-if="favoriteError" role="alert">{{ favoriteError }}</p>
          <small>收藏的是这份平台发布资料，不代表岗位仍在招聘；招聘状态未确认。</small>
        </section>
        <footer class="detail-footer">平台保留岗位资料的来源与审核边界；如需要判断是否匹配，请先确认简历资料及岗位要求是否完整、有效。</footer>
      </article>
    </el-drawer>
  </main>
</template>

<style scoped>
.catalog-page { --ink: var(--color-text); --muted: var(--color-text-muted); --line: var(--color-border); --paper: var(--color-surface); display: flex; flex-direction: column; gap: 20px; max-width: 1280px; min-height: 100%; margin: 0 auto; padding: clamp(14px, 2.8vw, 34px); color: var(--ink); }
.catalog-hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 28px; padding: 2px 0 22px; border-bottom: 1px solid var(--line); }
.hero-copy { max-width: 760px; }
.eyebrow,.kicker { color: var(--color-primary-dark); font-size: 11px; font-weight: 750; letter-spacing: .11em; }
.eyebrow { display: flex; align-items: center; gap: 9px; margin-bottom: 13px; }
.eyebrow i { display: block; width: 22px; height: 1px; background: var(--color-primary); }
.catalog-hero h1 { margin: 0 0 11px; font-family: var(--font-title); font-size: clamp(29px, 4.2vw, 44px); line-height: 1.2; letter-spacing: -.045em; }
.catalog-hero p { max-width: 700px; margin: 0; color: var(--muted); font-size: 14px; line-height: 1.75; }
.hero-note { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 15px; border: 1px solid color-mix(in srgb, var(--color-secondary) 20%, var(--line)); border-radius: var(--radius-card); color: var(--color-secondary); background: color-mix(in srgb, var(--color-secondary) 5%, white); font-size: 12px; font-weight: 650; line-height: 1.5; }
.hero-note :deep(svg) { font-size: 21px; }
.mobile-break { display: none; }
.search-bar { display: flex; align-items: center; gap: 11px; min-height: 52px; padding: 5px 6px 5px 16px; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--paper); box-shadow: 0 5px 16px rgba(45,35,25,.035); }
.search-bar > :deep(svg) { color: var(--color-text-subtle); font-size: 19px; }
.search-bar input { flex: 1; min-width: 0; height: 38px; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit; font-size: 14px; }
.search-bar input::placeholder { color: var(--color-text-subtle); }
.search-bar button { min-width: 76px; height: 38px; border: 0; border-radius: var(--radius-pill); background: var(--color-primary); color: white; cursor: pointer; font: inherit; font-size: 13px; font-weight: 700; }
.search-bar button:disabled { opacity: .65; cursor: wait; }
.search-bar .reset-search { min-width: auto; padding: 0 12px; color: var(--muted); background: transparent; font-weight: 600; }
.catalog-status { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 12px; }
.result-count { display: flex; align-items: center; gap: 8px; }
.count-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-gold); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-gold) 16%, white); }
.status-note { padding: 5px 9px; border-radius: var(--radius-pill); background: var(--gold-100); color: #785e11; font-size: 11px; }
.partial-notice { display: flex; align-items: flex-start; gap: 9px; padding: 11px 14px; border-left: 3px solid var(--color-gold); border-radius: var(--radius-sm); background: var(--gold-100); color: #6c5411; }
.partial-notice :deep(svg) { flex: none; margin-top: 1px; font-size: 16px; }
.partial-notice p { margin: 0; font-size: 12px; line-height: 1.6; }
.job-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 13px; }
.job-card { display: flex; flex-direction: column; min-height: 254px; padding: 17px 18px 15px; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--paper); transition: border-color .18s ease, transform .18s ease, box-shadow .18s ease; }
.job-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--color-secondary) 30%, var(--line)); box-shadow: 0 8px 24px rgba(39,48,54,.06); }
.job-card--official { border-top: 2px solid var(--color-secondary); }
.job-card__top { display: flex; align-items: center; justify-content: space-between; gap: 9px; }
.card-number { color: var(--color-text-subtle); font-family: var(--font-accent); font-size: 11px; font-variant-numeric: tabular-nums; }
.trust-label { display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; border-radius: var(--radius-pill); font-size: 10px; font-weight: 700; white-space: nowrap; }
.trust-label :deep(svg) { font-size: 13px; }
.trust-label.official { color: var(--color-secondary); background: color-mix(in srgb, var(--color-secondary) 8%, white); }
.trust-label.reviewed { color: #775b0e; background: var(--gold-100); }
.job-card h2 { margin: 15px 0 6px; font-family: var(--font-title); font-size: 19px; line-height: 1.3; }
.job-summary { display: -webkit-box; overflow: hidden; margin: 0 0 13px; color: var(--muted); font-size: 12px; line-height: 1.65; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.card-details { display: flex; flex-wrap: wrap; gap: 8px 13px; margin-top: auto; color: var(--color-text-subtle); font-size: 10px; }
.card-details span { display: inline-flex; align-items: center; gap: 4px; }
.official-boundary { margin-top: 9px; color: var(--color-secondary); font-size: 10px; font-weight: 700; }
.open-job { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 12px; padding: 10px 0 0; border: 0; border-top: 1px solid var(--line); background: transparent; color: var(--color-primary-dark); cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; text-align: left; }
.error-state,.empty-state,.loading-state { padding: 34px 22px; border: 1px dashed var(--line); border-radius: var(--radius-card); text-align: center; background: var(--paper); }
.error-state > :deep(svg),.empty-mark { color: var(--color-text-subtle); font-size: 28px; }
.empty-mark { width: 50px; height: 50px; display: grid; place-items: center; margin: 0 auto 15px; border-radius: 50%; background: var(--color-background); }
.error-state h2,.empty-state h2 { margin: 9px 0 5px; font-family: var(--font-title); font-size: 20px; }
.error-state p,.empty-state p { max-width: 470px; margin: 0 auto; color: var(--muted); font-size: 13px; line-height: 1.65; }
.error-state button,.empty-state button,.drawer-error button { margin-top: 17px; padding: 9px 16px; border: 1px solid var(--line); border-radius: var(--radius-pill); background: white; color: var(--color-primary-dark); cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; }
.empty-state .kicker { display: block; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 20px; padding: 6px; color: var(--muted); font-size: 12px; }
.pagination button { display: inline-flex; align-items: center; gap: 7px; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius-pill); background: white; color: var(--ink); cursor: pointer; font: inherit; font-size: 12px; }
.pagination button:disabled { opacity: .45; cursor: default; }
.drawer-loading,.drawer-error { padding: 30px; }
.drawer-error { text-align: center; color: var(--muted); }
.drawer-error :deep(svg) { color: var(--color-primary); font-size: 25px; }
.job-detail { position: relative; min-height: 100%; padding: clamp(22px,4vw,38px); background: var(--color-surface); }
.drawer-close { position: absolute; top: 18px; right: 18px; width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 50%; background: white; color: var(--muted); cursor: pointer; }
.detail-eyebrow { padding-right: 45px; }
.job-detail h2 { margin: 18px 0 7px; font-family: var(--font-title); font-size: clamp(25px,4vw,33px); line-height: 1.2; }
.detail-status { margin: 0; color: var(--muted); font-size: 12px; }
.detail-status span { padding: 0 4px; color: var(--color-text-subtle); }
.source-callout { display: flex; gap: 11px; margin: 22px 0; padding: 13px; border: 1px solid color-mix(in srgb, var(--color-secondary) 25%, var(--line)); border-radius: var(--radius-card); color: var(--color-secondary); background: color-mix(in srgb, var(--color-secondary) 4%, white); }
.source-callout--reviewed { border-color: color-mix(in srgb, var(--color-gold) 38%, var(--line)); color: var(--ink); background: color-mix(in srgb, var(--color-gold) 9%, white); }
.source-callout--reviewed :deep(svg) { color: #8a6818; }
.source-callout > :deep(svg) { flex: none; margin-top: 1px; font-size: 19px; }
.source-callout strong { display: block; margin-bottom: 4px; font-size: 13px; }
.source-callout p { margin: 0; font-size: 11px; line-height: 1.6; }
.detail-section { margin-top: 24px; padding-top: 17px; border-top: 1px solid var(--line); }
.detail-section > .kicker { display: block; margin-bottom: 11px; }
.detail-original { margin: 0; white-space: pre-wrap; color: var(--ink); font-size: 14px; line-height: 1.8; }
.requirement-row { display: grid; grid-template-columns: 95px minmax(0,1fr); gap: 10px; padding: 10px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent); font-size: 12px; line-height: 1.55; }
.requirement-row span { color: var(--muted); }
.requirement-row strong { font-weight: 600; }
.original-detail { margin-top: 15px; }
.original-detail summary { color: var(--color-secondary); cursor: pointer; font-size: 12px; font-weight: 700; }
.original-detail p { max-height: 300px; overflow: auto; margin: 9px 0 0; padding: 12px; border-radius: var(--radius-sm); background: var(--color-background); white-space: pre-wrap; color: var(--muted); font-size: 12px; line-height: 1.65; }
.detail-meta { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 13px; }
.detail-meta > div { display: flex; flex-direction: column; gap: 5px; }
.detail-meta span { color: var(--muted); font-size: 10px; }
.detail-meta strong,.detail-meta a { color: var(--ink); font-size: 12px; font-weight: 600; }
.detail-meta a { color: var(--color-secondary); }
.detail-meta a :deep(svg) { vertical-align: -2px; }
.favorite-action { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 18px; padding: 15px; border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--line)); border-radius: var(--radius-card); background: color-mix(in srgb, var(--color-primary) 4%, white); }
.favorite-action > button:first-child { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 16px; border: 0; border-radius: var(--radius-pill); background: var(--color-primary); color: #fff; cursor: pointer; font: inherit; font-size: 13px; font-weight: 700; }
.favorite-action > button:disabled { opacity: .65; cursor: default; }
.favorite-action .favorite-link { border: 0; background: transparent; color: var(--color-primary-dark); cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; }
.favorite-action p,.favorite-action small { flex-basis: 100%; margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.favorite-action p { color: #a14031; }
.detail-footer { margin-top: 27px; padding: 13px 0 0; border-top: 1px solid var(--line); color: var(--color-text-subtle); font-size: 11px; line-height: 1.6; }
@media (max-width: 740px) { .catalog-page { gap: 15px; padding: 14px; } .catalog-hero { align-items: flex-start; } .catalog-hero h1 { font-size: 31px; } .mobile-break { display: initial; } .hero-note { display: none; } .job-grid { grid-template-columns: 1fr; } .job-card { min-height: 235px; } }
@media (prefers-reduced-motion: reduce) { *,*::before,*::after { transition-duration: .01ms !important; } }
</style>
