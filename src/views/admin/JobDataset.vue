<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/types'
import {
  deleteStagedDataset,
  getJobReview,
  listJobPublications,
  listJobReviews,
  listSourceListings,
  listStagedDatasets,
  previewStagedJobPublication,
  publishSourceOnly,
  publishStagedJob,
  readStagedDataset,
  revokeJobPublication,
  revokeSourceListing,
  uploadStagedDataset,
  type JobPublication,
  type JobReviewDetail,
  type JobReviewSummary,
  type SourceListing,
  type StagedDataset,
  type StagedDatasetContent,
  type StagedJobRecord,
  type PublicationPreview,
} from '@/api/adminJobs'

type Section = 'official' | 'imports' | 'published'
const activeSection = ref<Section>('official')
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const uploadInput = ref<HTMLInputElement | null>(null)
const reviews = ref<JobReviewSummary[]>([])
const sourceListings = ref<SourceListing[]>([])
const publications = ref<JobPublication[]>([])
const datasets = ref<StagedDataset[]>([])
const selectedDataset = ref<StagedDataset | null>(null)
const stagedContent = ref<StagedDatasetContent | null>(null)
const selectedIndex = ref<number | null>(null)
const preview = ref<PublicationPreview | null>(null)
const previewError = ref('')
const missingFields = ref<string[]>([])
const reviewDetail = ref<JobReviewDetail | null>(null)
const reviewLoading = ref(false)
const confirmSourceOnly = ref(false)
const confirmImportedSource = ref(false)
const confirmRequirements = ref(false)
const confirmLicense = ref(false)
const confirmExactVersion = ref(false)
const search = ref('')

const selectedRecord = computed<StagedJobRecord | null>(() => {
  if (selectedIndex.value === null || !stagedContent.value) return null
  return stagedContent.value.content[selectedIndex.value] ?? null
})

const filteredDatasets = computed(() => {
  const term = search.value.trim().toLocaleLowerCase()
  if (!term) return datasets.value
  return datasets.value.filter(row => String(row.title ?? row.id).toLocaleLowerCase().includes(term))
})

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asText(value: unknown, fallback = '未提供'): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function safeExternalUrl(value: unknown): string {
  const raw = asText(value, '')
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}

function listValue(value: unknown): string {
  if (!Array.isArray(value)) return '未提供'
  return value.map(item => typeof item === 'string' ? item : asText(asObject(item).name, ''))
    .filter(Boolean).join('、') || '未提供'
}

function majorRequirementsValue(snapshot: Record<string, unknown>): string {
  const profile = asObject(snapshot.job_profile)
  if (Array.isArray(profile.major_requirements) && profile.major_requirements.length) {
    return listValue(profile.major_requirements)
  }
  const evidence = asObject(asObject(snapshot.field_evidence).major_requirements)
  return evidence.status === 'explicit' && profile.major_strict === false
    ? '不限专业'
    : '来源未列明'
}

function skillsValue(value: unknown): string {
  if (!Array.isArray(value)) return '未提供'
  return value.map(item => asText(asObject(item).name, '')).filter(Boolean).join('、') || '未提供'
}

function friendlyApiError(value: unknown): string {
  if (value instanceof ApiError) return value.message
  return value instanceof Error ? value.message : '请求没有完成，请检查服务状态后重试。'
}

function formatDate(value?: string | null): string {
  if (!value) return '时间未记录'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function formatBytes(value?: number): string {
  if (!value) return '大小未知'
  return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(2)} MiB`
}

async function refreshAll() {
  loading.value = true
  error.value = ''
  const failures: string[] = []
  const outcomes = await Promise.allSettled([
    listJobReviews(),
    listSourceListings(),
    listJobPublications(),
    listStagedDatasets(),
  ])
  if (outcomes[0].status === 'fulfilled') reviews.value = outcomes[0].value.items ?? []
  else failures.push(`官方来源审查记录：${friendlyApiError(outcomes[0].reason)}`)
  if (outcomes[1].status === 'fulfilled') sourceListings.value = outcomes[1].value.items ?? []
  else failures.push(`官方来源发布记录：${friendlyApiError(outcomes[1].reason)}`)
  if (outcomes[2].status === 'fulfilled') publications.value = outcomes[2].value.items ?? []
  else failures.push(`管理员发布记录：${friendlyApiError(outcomes[2].reason)}`)
  if (outcomes[3].status === 'fulfilled') datasets.value = outcomes[3].value
  else failures.push(`导入资料列表：${friendlyApiError(outcomes[3].reason)}`)
  error.value = failures.join('；')
  loading.value = false
}

function selectUpload() {
  uploadInput.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.name.toLocaleLowerCase().endsWith('.json')) {
    ElMessage.warning('岗位导入目前只接受 JSON 文件。')
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.warning('文件不能超过 2 MiB。')
    return
  }
  busy.value = true
  try {
    const staged = await uploadStagedDataset(file)
    await refreshAll()
    await openDataset(staged.id)
    activeSection.value = 'imports'
    ElMessage.success('资料已私有暂存，尚未进入学生岗位目录。')
  } catch (reason) {
    ElMessage.error(friendlyApiError(reason))
  } finally {
    busy.value = false
  }
}

function resetImportedConfirmation() {
  confirmImportedSource.value = false
  confirmRequirements.value = false
  confirmLicense.value = false
  confirmExactVersion.value = false
}

async function openDataset(id: string) {
  resetImportedConfirmation()
  const row = datasets.value.find(item => item.id === id) ?? null
  selectedDataset.value = row
  stagedContent.value = null
  selectedIndex.value = null
  preview.value = null
  previewError.value = ''
  missingFields.value = []
  error.value = ''
  if (!row) return
  loading.value = true
  try {
    const content = await readStagedDataset(id)
    stagedContent.value = content
    if (content.content.length === 1) selectedIndex.value = 0
  } catch (reason) {
    error.value = `无法重新读取暂存原文：${friendlyApiError(reason)}`
  } finally {
    loading.value = false
  }
}

function chooseRecord(index: number) {
  selectedIndex.value = index
  preview.value = null
  previewError.value = ''
  missingFields.value = []
  resetImportedConfirmation()
}

async function startPreview() {
  if (!selectedDataset.value || !stagedContent.value || selectedIndex.value === null || !selectedRecord.value) return
  busy.value = true
  resetImportedConfirmation()
  previewError.value = ''
  missingFields.value = []
  preview.value = null
  try {
    const datasetId = selectedDataset.value.id
    const payload = {
      job_portrait_id: `imp_${datasetId.replace(/^ds_/, '')}_${selectedIndex.value}`,
      publication_version: 'v1',
      source_dataset_id: datasetId,
      source_record_index: selectedIndex.value,
      expected_dataset_sha256: stagedContent.value.content_sha256,
    }
    preview.value = await previewStagedJobPublication(payload)
  } catch (reason) {
    previewError.value = friendlyApiError(reason)
    if (reason instanceof ApiError) {
      const body = asObject(reason.body)
      const fields = body.missing_job_fields
      if (Array.isArray(fields)) missingFields.value = fields.map(String)
    }
  } finally {
    busy.value = false
  }
}

async function confirmImportedPublication() {
  if (!preview.value || !selectedDataset.value || selectedIndex.value === null) return
  if (!confirmImportedSource.value || !confirmRequirements.value || !confirmLicense.value || !confirmExactVersion.value) {
    ElMessage.warning('请逐项确认来源、要求、许可与当前精确版本。')
    return
  }
  busy.value = true
  try {
    const p = preview.value
    await publishStagedJob({
      job_portrait_id: p.job_portrait_id,
      publication_version: p.publication_version,
      source_dataset_id: selectedDataset.value.id,
      source_record_index: selectedIndex.value,
      expected_dataset_sha256: p.dataset_reference.expected_dataset_sha256,
      expected_record_sha256: p.dataset_reference.expected_record_sha256,
      preview_token: p.preview_token,
      expected_candidate_sha256: p.candidate_sha256,
      expected_source_text_sha256: p.source_text_sha256,
      confirm_review: {
        source_checked: true,
        requirements_checked: true,
        license_checked: true,
        publish_exact_digest: true,
      },
    })
    ElMessage.success('管理员审核发布已创建，岗位仍不代表招聘状态已核实。')
    preview.value = null
    resetImportedConfirmation()
    await refreshAll()
  } catch (reason) {
    previewError.value = `发布未完成：${friendlyApiError(reason)}`
  } finally {
    busy.value = false
  }
}

async function showReview(item: JobReviewSummary) {
  reviewLoading.value = true
  reviewDetail.value = null
  confirmSourceOnly.value = false
  try {
    reviewDetail.value = await getJobReview(item.review_id)
  } catch (reason) {
    ElMessage.error(`读取审查原文失败：${friendlyApiError(reason)}`)
  } finally {
    reviewLoading.value = false
  }
}

async function approveOfficial(item: JobReviewSummary) {
  if (reviewDetail.value?.review_id !== item.review_id) {
    await showReview(item)
    return
  }
  const detail = reviewDetail.value
  if (!detail || !confirmSourceOnly.value) {
    ElMessage.warning('请先核对上方官方原文，并确认仅供浏览。')
    return
  }
  const sourceRecord = asObject(asObject(detail.review).source_record)
  const position = asText(sourceRecord.jobname, '该官方岗位')
  try {
    await ElMessageBox.confirm(
      `服务端将重新核对「${position}」的官方原文。发布后只供浏览，不参与评分或匹配；模型审查结论不等于人工批准。确认继续？`,
      '确认官方原文展示',
      { type: 'warning', confirmButtonText: '确认仅展示原文', cancelButtonText: '再检查一下' },
    )
  } catch { return }
  busy.value = true
  try {
    await publishSourceOnly({
      review_id: detail.review_id,
      listing_version: `view-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
      expected_review_sha256: detail.content_sha256,
      expected_source_record_sha256: asText(detail.review.source_record_sha256, ''),
      confirm_source_only: true,
    })
    confirmSourceOnly.value = false
    ElMessage.success('服务端已核验并发布官方原文展示项。')
    await refreshAll()
  } catch (reason) {
    ElMessage.error(`没有发布：${friendlyApiError(reason)}`)
  } finally {
    busy.value = false
  }
}

async function askRevoke(item: SourceListing | JobPublication) {
  const isSource = 'listing_version' in item
  const title = item.position_name || '该岗位'
  try {
    const result = await ElMessageBox.prompt(
      `填写撤回原因。撤回会隐藏当前岗位，但保留该版本的历史记录。`,
      `撤回「${title}」`,
      {
        inputPlaceholder: '例如：来源不再有效 / 岗位要求需要重新核实',
        inputValidator: value => Boolean(value?.trim()) || '请填写撤回原因',
        confirmButtonText: '确认撤回',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    const reason = String((result as { value?: string }).value ?? '').trim()
    if (!reason) return
    busy.value = true
    if (isSource) {
      await revokeSourceListing(item.id, { expected_content_sha256: item.content_sha256, reason })
    } else {
      await revokeJobPublication(item.id, { expected_content_sha256: item.content_sha256, reason })
    }
    ElMessage.success('已撤回；历史版本保留供管理员审计。')
    await refreshAll()
  } catch (errorValue) {
    if (errorValue !== 'cancel' && errorValue !== 'close') ElMessage.error(friendlyApiError(errorValue))
  } finally {
    busy.value = false
  }
}

async function removeStaged(row: StagedDataset) {
  if (row.status !== 'pending' || row.id === selectedDataset.value?.id && stagedContent.value?.publication_count) {
    ElMessage.warning('该暂存来源正在被引用，不能删除。')
    return
  }
  try {
    await ElMessageBox.confirm(`删除「${row.title}」的私有暂存原文？未发布的候选将无法继续审核。`, '删除暂存资料', {
      type: 'warning', confirmButtonText: '删除暂存资料', cancelButtonText: '保留',
    })
  } catch { return }
  busy.value = true
  try {
    await deleteStagedDataset(row.id)
    if (selectedDataset.value?.id === row.id) {
      selectedDataset.value = null
      stagedContent.value = null
      selectedIndex.value = null
    }
    ElMessage.success('暂存资料已删除。')
    await refreshAll()
  } catch (reason) {
    ElMessage.error(friendlyApiError(reason))
  } finally {
    busy.value = false
  }
}

function fieldLabel(field: string): string {
  return ({
    degree_requirement: '学历要求',
    degree_requirement_value: '学历具体要求',
    major_requirements: '专业要求',
    major_strict: '专业限制',
    required_certs: '证书要求',
    required_skills: '技能要求',
    required_skills_value: '技能项目',
    source_expired: '来源记录已过期',
    source_closing_time_unknown: '来源截止时间未知',
    semantic_uncertainties: '岗位要求仍有语义不确定项',
    unsupported_requirements: '存在当前规则不支持的要求',
  } as Record<string, string>)[field]
    ?? (field.startsWith('invalid_model_assessment:') ? '审查结果格式或证据校验失败' : '存在需要进一步核查的字段')
}

function blockersFor(item: JobReviewSummary): string[] {
  return (item.blockers ?? []).map(value => value.startsWith('missing:')
    ? `缺少${fieldLabel(value.slice(8))}`
    : fieldLabel(value))
}

function approvalName(item: SourceListing | JobPublication) {
  return 'listing_version' in item ? `官方来源 · ${item.listing_version}` : `管理员审核 · ${item.publication_version}`
}

onMounted(refreshAll)
</script>

<template>
  <div class="job-admin">
    <header class="page-intro">
      <div class="intro-copy">
        <div class="eyebrow"><span>岗位资料进入平台</span><i /> <span>管理员工作台</span></div>
        <h1>岗位管理中心</h1>
        <p>分别处理官方原文与管理员导入。审核记录、来源核验和正式发布是不同步骤；任何一条都不会自动证明岗位仍在招聘。</p>
      </div>
      <div class="intro-stamp" aria-label="工作流程">
        <span class="stamp-kicker">SOURCE DESK</span>
        <strong>看清来源<br>再让学生看见</strong>
      </div>
    </header>

    <section class="trust-legend" aria-label="岗位资料信任层级">
      <div class="legend-mark legend-mark--official"><Icon icon="lucide:landmark" /></div>
      <div><strong>官方来源 · 仅展示原文</strong><p>服务端发布时重新核验。模型审查只作参考，不是人工批准；不参与评分或匹配。</p></div>
      <div class="legend-divider" />
      <div class="legend-mark legend-mark--reviewed"><Icon icon="lucide:clipboard-check" /></div>
      <div><strong>管理员审核发布</strong><p>管理员核对导入原文、要求与许可；来源地址由管理员提供，平台不独立核验。</p></div>
    </section>

    <nav class="section-tabs" aria-label="岗位管理分类">
      <button :class="{ active: activeSection === 'official' }" @click="activeSection = 'official'">
        <span class="tab-index">01</span><span>官方来源</span><b>{{ reviews.length }}</b>
      </button>
      <button :class="{ active: activeSection === 'imports' }" @click="activeSection = 'imports'">
        <span class="tab-index">02</span><span>导入资料</span><b>{{ datasets.length }}</b>
      </button>
      <button :class="{ active: activeSection === 'published' }" @click="activeSection = 'published'">
        <span class="tab-index">03</span><span>已发布记录</span><b>{{ sourceListings.length + publications.length }}</b>
      </button>
      <button class="refresh-button" :disabled="loading" @click="refreshAll">
        <Icon icon="lucide:refresh-cw" :class="{ spinning: loading }" /> 刷新服务端记录
      </button>
    </nav>

    <el-alert v-if="error" class="page-alert" type="error" :title="error" show-icon :closable="false" />

    <section v-if="activeSection === 'official'" class="section-body">
      <div class="section-heading">
        <div><div class="kicker">官方来源</div><h2>核对审查记录，发布可浏览原文</h2></div>
        <p>管理员确认的是“按官方来源重新核验后，仅展示原文”。岗位要求是否适合评分，不由模型结论替代人工判断。</p>
      </div>
      <div class="source-note"><Icon icon="lucide:shield-check" /><span>发布会重新读取官方来源并核对同一条记录。若上游不可用、摘要变化或当前状态不可信，服务端会拒绝，不会降级为已核验。</span></div>

      <div v-if="loading && reviews.length === 0" class="state-panel"><el-skeleton :rows="4" animated /></div>
      <div v-else-if="!reviews.length && !error" class="empty-panel">
        <Icon icon="lucide:inbox" /><h3>目前没有可查看的模型审查记录</h3><p>这里不会放入演示岗位；服务端有新记录后刷新即可。</p>
      </div>
      <div v-else class="review-list">
        <article v-for="item in reviews" :key="item.review_id" class="review-card">
          <div class="review-card__body">
            <div class="card-meta"><span class="source-chip">官方来源审查</span><span>{{ formatDate(item.created_at) }}</span></div>
            <h3>{{ item.review_id === reviewDetail?.review_id
              ? asText(asObject(reviewDetail.review.source_record).jobname, '岗位原文待查看')
              : '官方岗位原文待查看' }}</h3>
            <p class="review-line">模型审查：{{ item.status === 'candidate_ready' ? '候选字段齐备' : '存在阻断项' }} · 尚未授权发布</p>
            <div v-if="item.blockers.length" class="blocker-list">
              <span v-for="reason in blockersFor(item)" :key="reason"><Icon icon="lucide:minus" />{{ reason }}</span>
            </div>
          </div>
          <div class="review-card__actions">
            <el-button type="primary" plain @click="showReview(item)">先查看原文</el-button>
          </div>
        </article>
      </div>

      <div v-if="reviewLoading" class="review-detail"><el-skeleton :rows="4" animated /></div>

      <div v-if="reviewDetail" class="review-detail">
        <div class="review-detail__head"><div><span class="kicker">只读审查材料</span><h3>{{ asText(asObject(reviewDetail.review.source_record).jobname, '官方岗位原文') }}</h3></div><el-button text @click="reviewDetail = null">收起</el-button></div>
        <div class="review-detail__grid">
          <div class="review-original"><span class="detail-label">岗位原文</span><pre>{{ asText(reviewDetail.review.source_text, asText(asObject(reviewDetail.review.source_record).entreq, '官方来源未提供要求说明。')) }}</pre></div>
          <div><span class="detail-label">审查边界</span><p>审查执行方：模型；结论仅作参考，不授权发布。官方来源在提交时会被服务端重新读取并校验摘要。</p></div>
          <div v-if="reviewDetail.blockers.length"><span class="detail-label">审查记录的阻断项</span><ul><li v-for="reason in blockersFor(reviewDetail)" :key="reason">{{ reason }}</li></ul></div>
          <div><span class="detail-label">来源截止时间</span><p>{{ formatDate(asText(asObject(reviewDetail.review.source_record).enddate, '未从来源读到截止时间')) }}</p></div>
          <div><span class="detail-label">官方来源</span><p><a v-if="safeExternalUrl(reviewDetail.review.source_uri)" :href="safeExternalUrl(reviewDetail.review.source_uri)" target="_blank" rel="noopener noreferrer">查看 CSB 官方来源 <Icon icon="lucide:external-link" /></a><span v-else>官方来源地址不可用</span></p><small>发布时服务端会重新读取该来源，并核对同一条记录。</small></div>
        </div>
        <details class="digest-details">
          <summary>版本与校验详情</summary>
          <dl>
            <div><dt>审查记录</dt><dd>{{ reviewDetail.review_id }}</dd></div>
            <div><dt>官方岗位记录</dt><dd>{{ reviewDetail.source_record_id }}</dd></div>
            <div><dt>审查版本</dt><dd>{{ reviewDetail.review_version }}</dd></div>
            <div><dt>官方原文 SHA-256</dt><dd>{{ asText(reviewDetail.review.source_record_sha256, '摘要不可用') }}</dd></div>
            <div><dt>审查记录 SHA-256</dt><dd>{{ reviewDetail.content_sha256 }}</dd></div>
            <div><dt>来源 feed SHA-256</dt><dd>{{ asText(reviewDetail.review.source_feed_sha256, '摘要不可用') }}</dd></div>
          </dl>
        </details>
        <div class="review-source-confirm">
          <el-checkbox v-model="confirmSourceOnly">我已核对上方官方原文，并确认发布后只供浏览，不参与评分或匹配。</el-checkbox>
          <el-button type="primary" :loading="busy" :disabled="!confirmSourceOnly" @click="approveOfficial(reviewDetail)">确认并重新核验官方来源</el-button>
        </div>
      </div>

      <div class="published-strip">
        <div><span class="kicker">当前与历史版本</span><strong>官方原文展示</strong></div>
        <div v-if="!sourceListings.length && !error" class="strip-empty">还没有官方来源展示记录</div>
        <article v-for="item in sourceListings" :key="item.id" class="published-row">
          <div class="row-title"><strong>{{ item.position_name }}</strong><small>{{ approvalName(item) }} · {{ formatDate(item.status === 'listed' ? item.source_checked_at : undefined) }}</small></div>
          <el-tag :type="item.status === 'listed' ? 'success' : 'info'" effect="plain">{{ item.status === 'listed' ? '当前展示' : '已撤回' }}</el-tag>
          <el-button v-if="item.status === 'listed'" type="danger" link @click="askRevoke(item)">撤回</el-button>
        </article>
      </div>
    </section>

    <section v-else-if="activeSection === 'imports'" class="section-body">
      <div class="section-heading">
        <div><div class="kicker">管理员导入</div><h2>从原文到一条经审核的岗位记录</h2></div>
        <p>导入内容只会私有暂存，不会自动进入学生目录。每次发布前都要重新读回原文、预检字段，并确认所见的精确版本。</p>
      </div>
      <div class="import-layout">
        <aside class="import-rail">
          <input ref="uploadInput" class="visually-hidden" type="file" accept=".json,application/json" @change="onFileChange">
          <button class="upload-card" :disabled="busy" @click="selectUpload">
            <span class="upload-card__icon"><Icon icon="lucide:upload" /></span>
            <strong>{{ busy ? '正在提交资料…' : '选择岗位 JSON 文件' }}</strong>
            <span>仅支持 UTF-8 JSON 数组 · 单文件不超过 2 MiB</span>
            <span class="upload-card__foot">上传后先进入私有暂存区 <Icon icon="lucide:arrow-up-right" /></span>
          </button>
          <div class="dataset-list-head"><div><span class="kicker">暂存来源</span><strong>服务端文件记录</strong></div><span>{{ datasets.length }} 份</span></div>
          <el-input v-model="search" clearable placeholder="按文件名称搜索" class="dataset-search"><template #prefix><Icon icon="lucide:search" /></template></el-input>
          <div v-if="!filteredDatasets.length && !loading && !error" class="dataset-empty">还没有导入资料。选择 JSON 文件后，它会作为未发布原文保存在这里。</div>
          <button v-for="row in filteredDatasets" :key="row.id" class="dataset-row" :class="{ selected: selectedDataset?.id === row.id }" @click="openDataset(row.id)">
            <span class="dataset-row__icon"><Icon icon="lucide:file-json-2" /></span>
            <span class="dataset-row__text"><strong>{{ row.title }}</strong><small>{{ Number(row.staged_record_count ?? 0) }} 条 · {{ formatBytes(row.file_size) }}</small></span>
            <Icon icon="lucide:chevron-right" class="dataset-row__chevron" />
          </button>
        </aside>

        <div class="import-workspace">
          <div v-if="!selectedDataset" class="empty-panel workspace-empty"><Icon icon="lucide:files" /><h3>选择一份服务端暂存资料</h3><p>先读回原文，检查其中的岗位，再决定是否提交预检。</p></div>
          <template v-else>
            <div class="workspace-head"><div><span class="kicker">私有暂存 · 尚未发布</span><h3>{{ selectedDataset.title }}</h3><p>{{ stagedContent ? `${stagedContent.content.length} 条岗位记录 · ${formatBytes(stagedContent.file_size)}` : '正在从服务端读取原文' }}</p></div><el-button text type="danger" @click="removeStaged(selectedDataset)">删除暂存资料</el-button></div>
            <details v-if="stagedContent" class="digest-details dataset-digest-details">
              <summary>暂存版本校验信息</summary>
              <dl><div><dt>暂存资料</dt><dd>{{ stagedContent.id }}</dd></div><div><dt>文件 SHA-256</dt><dd>{{ stagedContent.content_sha256 }}</dd></div><div><dt>文件大小</dt><dd>{{ formatBytes(stagedContent.file_size) }}</dd></div></dl>
            </details>
            <div v-if="error" class="inline-error"><Icon icon="lucide:circle-alert" />{{ error }}</div>
            <div v-if="stagedContent?.published" class="source-note"><Icon icon="lucide:archive-restore" /><span>这份原文被 {{ stagedContent.publication_count }} 个不可变发布版本引用；已发布内容不会因暂存区显示变化而被覆盖。</span></div>
            <div v-if="stagedContent?.content.length" class="record-tabs" role="tablist" aria-label="选择导入记录">
              <button v-for="(item, index) in stagedContent.content" :key="index" :class="{ selected: selectedIndex === index }" @click="chooseRecord(index)"><span>{{ String(index + 1).padStart(2, '0') }}</span>{{ item.title }}</button>
            </div>
            <div v-if="selectedRecord" class="candidate-card">
              <div class="candidate-card__head"><div><span class="kicker">当前选中原文记录</span><h4>{{ selectedRecord.title }}</h4></div><el-tag type="warning" effect="plain">未发布</el-tag></div>
              <div class="candidate-fields">
                <div><span>管理员登记的来源地址</span><a v-if="safeExternalUrl(selectedRecord.snapshot.source_uri)" :href="safeExternalUrl(selectedRecord.snapshot.source_uri)" target="_blank" rel="noopener noreferrer">{{ selectedRecord.snapshot.source_uri }} <Icon icon="lucide:external-link" /></a><small v-else>{{ asText(selectedRecord.snapshot.source_uri, '未提供') }}</small><small>该地址由导入资料提供；平台不会在此流程独立读取或核验。</small></div>
                <div><span>学历要求</span><strong>{{ asText(asObject(selectedRecord.snapshot.job_profile).degree_requirement) }}</strong></div>
                <div><span>专业范围</span><strong>{{ majorRequirementsValue(selectedRecord.snapshot) }}</strong></div>
                <div><span>技能要求</span><strong>{{ skillsValue(selectedRecord.snapshot.required_skills) }}</strong></div>
              </div>
              <details class="source-original"><summary>查看导入的岗位原文</summary><pre>{{ asText(selectedRecord.snapshot.source_text, '暂存记录没有岗位原文。') }}</pre></details>
              <div class="candidate-actions"><p>先预检这条确切记录。后端会重新读取文件并检查来源证据与现有评分字段门禁；缺项时不会创建发布版本。</p><el-button type="primary" :loading="busy" @click="startPreview">重新读取并预检</el-button></div>
              <div v-if="previewError" class="inline-error"><Icon icon="lucide:circle-alert" />{{ previewError }}</div>
              <div v-if="missingFields.length" class="missing-fields"><strong>这条资料还不能发布为可评分岗位</strong><span>缺少或未核实：{{ missingFields.map(fieldLabel).join('、') }}</span><small>可保留为私有暂存资料；当前没有创建岗位或发布记录。</small></div>
            </div>

            <div v-if="preview" class="review-checklist">
              <div class="checklist-head"><div><span class="kicker">预检通过 · 尚未发布</span><h3>请核对将要展示的精确资料</h3></div><el-tag type="warning" effect="plain">招聘状态未确认</el-tag></div>
              <p class="preview-boundary">预检仅说明当前记录满足现有字段门禁，不代表内容真实、招聘有效或匹配建议质量通过。发布服务端会再次读原文并验证摘要。</p>
              <div class="preview-facts"><div><span>岗位</span><strong>{{ asText(preview.snapshot_for_review.position_name) }}</strong></div><div><span>来源声明</span><strong>由管理员提交，平台未独立核验</strong></div><div><span>本次预检版本</span><strong>{{ preview.publication_version }}</strong></div></div>
              <details class="digest-details preview-digest-details">
                <summary>查看完整版本与校验信息</summary>
                <dl>
                  <div><dt>暂存资料</dt><dd>{{ preview.dataset_reference.dataset_id }}</dd></div>
                  <div><dt>岗位记录序号</dt><dd>{{ preview.dataset_reference.record_index + 1 }}</dd></div>
                  <div><dt>暂存文件 SHA-256</dt><dd>{{ preview.dataset_reference.expected_dataset_sha256 }}</dd></div>
                  <div><dt>岗位记录 SHA-256</dt><dd>{{ preview.dataset_reference.expected_record_sha256 }}</dd></div>
                  <div><dt>候选内容 SHA-256</dt><dd>{{ preview.candidate_sha256 }}</dd></div>
                  <div><dt>来源正文 SHA-256</dt><dd>{{ preview.source_text_sha256 }}</dd></div>
                </dl>
              </details>
              <p class="unverified-source-note">管理员导入的来源地址是提交方提供的信息；平台不会访问该地址来证明来源真实性或招聘状态。</p>
              <el-checkbox v-model="confirmImportedSource">我已核对导入资料登记的来源地址与所见原文。</el-checkbox>
              <el-checkbox v-model="confirmRequirements">我已核对岗位要求及其来源证据。</el-checkbox>
              <el-checkbox v-model="confirmLicense">我已检查来源许可与使用边界。</el-checkbox>
              <el-checkbox v-model="confirmExactVersion">我确认只发布上方所示的这一版本。</el-checkbox>
              <div class="checklist-actions"><span>没有四项确认就不会提交发布。</span><el-button type="primary" :loading="busy" @click="confirmImportedPublication">确认管理员审核发布</el-button></div>
            </div>
          </template>
        </div>
      </div>
    </section>

    <section v-else class="section-body">
      <div class="section-heading">
        <div><div class="kicker">已发布记录</div><h2>当前可见与已撤回版本</h2></div>
        <p>版本不可覆盖。撤回时填写原因；学生目录随后不再把已撤回版本作为当前岗位显示。</p>
      </div>
      <div class="published-table">
        <div class="published-table__head"><span>岗位与发布来源</span><span>版本状态</span><span>发布日期</span><span>操作</span></div>
        <div v-if="!publications.length && !sourceListings.length && !loading && !error" class="empty-panel"><Icon icon="lucide:archive" /><h3>还没有岗位发布记录</h3><p>已完成核验并发布的版本会显示在这里。</p></div>
        <article v-for="item in publications" :key="`publication-${item.id}`" class="published-table__row">
          <div class="row-title"><strong>{{ item.position_name }}</strong><small>{{ approvalName(item) }} · 来源：管理员导入资料</small></div>
          <el-tag :type="item.status === 'published' ? 'success' : 'info'" effect="plain">{{ item.status === 'published' ? '当前发布' : '已撤回' }}</el-tag>
          <span class="published-date">{{ formatDate(item.published_at ?? item.reviewed_at) }}</span>
          <el-button v-if="item.status === 'published'" type="danger" link @click="askRevoke(item)">填写原因并撤回</el-button><span v-else class="history-note">历史留档</span>
        </article>
        <article v-for="item in sourceListings" :key="`source-${item.id}`" class="published-table__row">
          <div class="row-title"><strong>{{ item.position_name }}</strong><small>{{ approvalName(item) }} · 官方原文，仅展示</small></div>
          <el-tag :type="item.status === 'listed' ? 'success' : 'info'" effect="plain">{{ item.status === 'listed' ? '当前展示' : '已撤回' }}</el-tag>
          <span class="published-date">{{ formatDate(item.source_checked_at) }}</span>
          <el-button v-if="item.status === 'listed'" type="danger" link @click="askRevoke(item)">填写原因并撤回</el-button><span v-else class="history-note">历史留档</span>
        </article>
      </div>
      <div class="source-note"><Icon icon="lucide:info" /><span>“当前发布/展示”指当前版本在平台目录可见，不等于招聘仍然有效。详情读取和官方来源核验失败时，学生端会分别显示不可用或部分可用状态。</span></div>
    </section>
  </div>
</template>

<style scoped>
.job-admin { --ink: var(--color-text); --muted: var(--color-text-muted); --line: var(--color-border); --paper: var(--color-surface); color: var(--ink); display: flex; flex-direction: column; gap: 22px; max-width: 1320px; margin: 0 auto; padding: clamp(12px, 2vw, 26px); }
.page-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; padding: 4px 2px 18px; border-bottom: 1px solid var(--line); }
.eyebrow,.kicker { color: var(--color-primary-dark); font-size: 11px; font-weight: 750; letter-spacing: .1em; text-transform: uppercase; }
.eyebrow { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.eyebrow i { display: block; width: 22px; height: 1px; background: var(--color-primary); }
.intro-copy { max-width: 850px; }
h1,h2,h3,h4,p { margin-top: 0; }
h1 { margin-bottom: 8px; font-family: var(--font-title); font-size: clamp(28px, 4vw, 38px); line-height: 1.12; letter-spacing: -.035em; }
.intro-copy p,.section-heading p { margin-bottom: 0; max-width: 720px; color: var(--muted); font-size: 14px; line-height: 1.7; }
.intro-stamp { min-width: 190px; padding: 14px 18px; border: 1px solid color-mix(in srgb, var(--color-primary) 28%, var(--line)); border-radius: var(--radius-card); background: linear-gradient(145deg, #fff 8%, color-mix(in srgb, var(--color-primary-light) 36%, #fff)); color: var(--color-primary-dark); }
.stamp-kicker { display: block; margin-bottom: 8px; font-size: 9px; font-weight: 800; letter-spacing: .2em; }
.intro-stamp strong { font-family: var(--font-title); font-size: 17px; line-height: 1.4; }
.trust-legend { display: grid; grid-template-columns: 42px minmax(0,1fr) 1px 42px minmax(0,1fr); align-items: center; gap: 13px; padding: 16px 18px; background: color-mix(in srgb, var(--color-surface) 80%, var(--color-background)); border: 1px solid var(--line); border-radius: var(--radius-card); }
.legend-mark { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 50%; font-size: 18px; }
.legend-mark--official { color: var(--color-secondary); background: color-mix(in srgb, var(--color-secondary) 10%, white); }
.legend-mark--reviewed { color: var(--color-gold-dark); background: var(--gold-100); }
.trust-legend strong { display: block; margin-bottom: 3px; font-size: 13px; }
.trust-legend p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.legend-divider { width: 1px; height: 38px; background: var(--line); }
.section-tabs { display: flex; align-items: center; gap: 6px; border-bottom: 1px solid var(--line); }
.section-tabs button { display: inline-flex; align-items: center; gap: 9px; min-height: 46px; padding: 0 13px; color: var(--muted); background: transparent; border: 0; border-bottom: 2px solid transparent; cursor: pointer; font: inherit; font-size: 13px; transition: color .18s ease, border-color .18s ease; }
.section-tabs button.active { color: var(--color-primary-dark); border-bottom-color: var(--color-primary); font-weight: 700; }
.tab-index { color: var(--color-text-subtle); font-size: 10px; font-variant-numeric: tabular-nums; }
.section-tabs b { min-width: 21px; padding: 2px 6px; border-radius: var(--radius-pill); color: var(--muted); background: var(--color-background); font-size: 10px; font-weight: 600; }
.section-tabs .refresh-button { margin-left: auto; border: 1px solid var(--line); border-radius: var(--radius-pill); min-height: 34px; }
.refresh-button :deep(svg) { margin-right: -4px; }
.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.page-alert { margin-top: -10px; }
.section-body { display: flex; flex-direction: column; gap: 17px; }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 26px; }
.section-heading h2 { margin: 6px 0 0; font-family: var(--font-title); font-size: clamp(20px, 2.4vw, 25px); line-height: 1.25; }
.section-heading p { max-width: 490px; font-size: 12px; }
.source-note { display: flex; align-items: flex-start; gap: 10px; padding: 11px 14px; border: 1px solid color-mix(in srgb, var(--color-secondary) 22%, var(--line)); border-left: 3px solid var(--color-secondary); border-radius: var(--radius-sm); color: var(--color-secondary); background: color-mix(in srgb, var(--color-secondary) 4%, var(--paper)); font-size: 12px; line-height: 1.6; }
.source-note :deep(svg) { flex: none; margin-top: 1px; font-size: 16px; }
.review-list { display: grid; gap: 10px; }
.review-card { display: flex; justify-content: space-between; gap: 20px; padding: 16px 18px; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--paper); }
.review-card__body { min-width: 0; }
.card-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; color: var(--color-text-subtle); font-size: 11px; }
.source-chip { padding: 3px 8px; border-radius: var(--radius-pill); color: var(--color-secondary); background: color-mix(in srgb, var(--color-secondary) 9%, white); font-weight: 700; }
.review-card h3 { margin: 0 0 5px; font-size: 16px; }
.review-line { margin: 0; color: var(--muted); font-size: 12px; }
.blocker-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
.blocker-list span { display: inline-flex; align-items: center; gap: 4px; padding: 4px 7px; border-radius: 4px; color: #805e17; background: #faf4df; font-size: 11px; }
.review-card__actions { display: flex; align-items: center; flex: none; gap: 8px; }
.review-detail { padding: 18px; border: 1px solid var(--line); border-radius: var(--radius-card); background: color-mix(in srgb, var(--color-secondary) 4%, white); }
.review-detail__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.review-detail__head h3 { margin: 5px 0 0; font-size: 17px; }
.review-detail__grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px 24px; padding-top: 14px; }
.review-detail__grid p,.review-detail__grid ul { margin: 5px 0 0; color: var(--muted); font-size: 13px; line-height: 1.65; }
.review-detail__grid small { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; line-height: 1.5; }
.review-original { grid-column: 1 / -1; }
.review-original pre { max-height: 320px; overflow: auto; margin: 5px 0 0; padding: 13px; border-radius: var(--radius-sm); background: white; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.7 var(--font-ui); }
.digest-details { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 10px; }
.digest-details summary { width: fit-content; color: var(--color-secondary); cursor: pointer; font-size: 12px; font-weight: 700; }
.digest-details dl { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px 18px; margin: 10px 0 0; }
.digest-details dl > div { min-width: 0; }
.digest-details dt { color: var(--muted); font-size: 10px; }
.digest-details dd { margin: 3px 0 0; overflow-wrap: anywhere; color: var(--ink); font: 10px/1.5 ui-monospace,Consolas,monospace; }
.dataset-digest-details { margin: -3px 0 8px; }
.unverified-source-note { margin: 0; color: #735b1a; font-size: 11px; line-height: 1.55; }
.review-detail__grid ul { padding-left: 17px; }
.review-source-confirm { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-top: 15px; padding-top: 13px; border-top: 1px solid var(--line); }
.review-source-confirm :deep(.el-checkbox__label) { white-space: normal; color: var(--muted); font-size: 12px; line-height: 1.5; }
.detail-label { color: var(--color-text-subtle); font-size: 11px; font-weight: 700; }
.published-strip { margin-top: 4px; padding-top: 16px; border-top: 1px solid var(--line); }
.published-strip > div:first-child { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.published-strip > div:first-child strong { margin-left: 10px; font-size: 13px; }
.strip-empty { padding: 14px 0; color: var(--muted); font-size: 12px; }
.published-row { display: grid; grid-template-columns: minmax(0,1fr) auto auto; align-items: center; gap: 13px; padding: 12px 0; border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent); }
.row-title { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.row-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.row-title small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
.empty-panel,.state-panel { padding: 30px 20px; border: 1px dashed var(--line); border-radius: var(--radius-card); text-align: center; background: var(--paper); }
.empty-panel :deep(svg) { color: var(--color-text-subtle); font-size: 28px; }
.empty-panel h3 { margin: 11px 0 5px; font-size: 15px; }
.empty-panel p { margin: 0; color: var(--muted); font-size: 12px; }
.import-layout { display: grid; grid-template-columns: minmax(255px, 31%) minmax(0,1fr); gap: 18px; align-items: start; }
.import-rail,.import-workspace { min-width: 0; }
.import-rail { display: flex; flex-direction: column; gap: 11px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.upload-card { width: 100%; min-height: 155px; display: flex; flex-direction: column; align-items: flex-start; gap: 7px; padding: 17px; text-align: left; border: 1px dashed color-mix(in srgb, var(--color-primary) 42%, var(--line)); border-radius: var(--radius-card); background: linear-gradient(140deg, #fff, color-mix(in srgb, var(--color-primary-light) 30%, white)); cursor: pointer; color: var(--ink); transition: border-color .18s, transform .18s; }
.upload-card:hover { border-color: var(--color-primary); transform: translateY(-1px); }
.upload-card:disabled { opacity: .65; cursor: wait; transform: none; }
.upload-card__icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; color: var(--color-primary); background: white; font-size: 17px; }
.upload-card strong { font-size: 14px; }
.upload-card > span:not(.upload-card__icon) { color: var(--muted); font-size: 11px; }
.upload-card .upload-card__foot { display: flex; align-items: center; gap: 5px; margin-top: 4px; color: var(--color-primary-dark) !important; font-weight: 700; }
.dataset-list-head { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 5px; }
.dataset-list-head > div { display: flex; flex-direction: column; gap: 3px; }
.dataset-list-head strong { font-size: 13px; }
.dataset-list-head > span { color: var(--muted); font-size: 11px; }
.dataset-search { margin-bottom: 2px; }
.dataset-row { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 10px; border: 1px solid transparent; border-radius: var(--radius-sm); text-align: left; background: transparent; cursor: pointer; color: var(--ink); }
.dataset-row:hover,.dataset-row.selected { border-color: var(--line); background: var(--paper); }
.dataset-row.selected { box-shadow: inset 3px 0 var(--color-primary); }
.dataset-row__icon { color: var(--color-secondary); font-size: 18px; }
.dataset-row__text { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 3px; }
.dataset-row__text strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.dataset-row__text small { color: var(--muted); font-size: 10px; }
.dataset-row__chevron { color: var(--color-text-subtle); font-size: 14px; }
.dataset-empty { padding: 13px; border: 1px dashed var(--line); color: var(--muted); font-size: 12px; line-height: 1.55; }
.import-workspace { padding: 18px; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--paper); }
.workspace-empty { border: 0; }
.workspace-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 15px; padding-bottom: 13px; border-bottom: 1px solid var(--line); }
.workspace-head h3 { margin: 5px 0 4px; font-size: 17px; }
.workspace-head p { margin: 0; color: var(--muted); font-size: 11px; }
.record-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 12px 0; }
.record-tabs button { max-width: 240px; flex: 0 0 auto; display: flex; align-items: center; gap: 7px; padding: 7px 9px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-pill); background: white; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; cursor: pointer; font: inherit; font-size: 11px; }
.record-tabs button.selected { color: var(--color-primary-dark); border-color: color-mix(in srgb, var(--color-primary) 40%, var(--line)); background: color-mix(in srgb, var(--color-primary-light) 40%, white); font-weight: 700; }
.record-tabs button span { font-size: 9px; opacity: .7; }
.candidate-card { padding-top: 8px; }
.candidate-card__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.candidate-card__head h4 { margin: 5px 0 12px; font-size: 16px; }
.candidate-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; padding: 13px; border-radius: var(--radius-sm); background: var(--color-background); }
.candidate-fields > div { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.candidate-fields span,.candidate-fields small { color: var(--muted); font-size: 10px; }
.candidate-fields strong,.candidate-fields a { overflow-wrap: anywhere; color: var(--ink); font-size: 12px; line-height: 1.45; }
.candidate-fields a :deep(svg) { vertical-align: -2px; color: var(--color-secondary); }
.source-original { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
.source-original summary { color: var(--color-secondary); cursor: pointer; font-size: 12px; font-weight: 700; }
.source-original pre { max-height: 220px; overflow: auto; padding: 12px; border-radius: var(--radius-sm); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--color-background); color: var(--muted); font: 12px/1.6 var(--font-ui); }
.candidate-actions { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.candidate-actions p { margin: 0; max-width: 540px; color: var(--muted); font-size: 11px; line-height: 1.6; }
.inline-error { display: flex; gap: 8px; align-items: flex-start; margin-top: 10px; padding: 10px 12px; border-radius: var(--radius-sm); color: #8b1a00; background: #fff0ec; font-size: 12px; line-height: 1.5; }
.inline-error :deep(svg) { flex: none; margin-top: 1px; }
.missing-fields { display: flex; flex-direction: column; gap: 5px; margin-top: 12px; padding: 12px 14px; border-left: 3px solid var(--color-gold); background: var(--gold-100); color: #5c480c; font-size: 12px; }
.missing-fields small { font-size: 11px; }
.review-checklist { display: flex; flex-direction: column; gap: 8px; margin-top: 18px; padding: 16px; border: 1px solid color-mix(in srgb, var(--color-primary) 28%, var(--line)); border-radius: var(--radius-card); background: linear-gradient(135deg, #fff, color-mix(in srgb, var(--color-primary-light) 24%, white)); }
.checklist-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.checklist-head h3 { margin: 5px 0 0; font-size: 16px; }
.preview-boundary { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
.preview-facts { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px; padding: 11px; background: white; border-radius: var(--radius-sm); }
.preview-facts > div { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.preview-facts span { color: var(--muted); font-size: 10px; }
.preview-facts strong,.preview-facts code { overflow-wrap: anywhere; color: var(--ink); font-size: 11px; line-height: 1.45; }
.review-checklist :deep(.el-checkbox) { height: auto; margin-right: 0; }
.review-checklist :deep(.el-checkbox__label) { white-space: normal; color: var(--ink); font-size: 12px; }
.checklist-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 6px; padding-top: 11px; border-top: 1px solid var(--line); }
.checklist-actions span { color: var(--muted); font-size: 10px; }
.published-table { border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden; background: var(--paper); }
.published-table__head,.published-table__row { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(120px,.65fr) minmax(150px,.8fr) minmax(120px,.6fr); align-items: center; gap: 12px; padding: 12px 16px; }
.published-table__head { color: var(--muted); background: var(--color-background); font-size: 10px; font-weight: 750; letter-spacing: .04em; }
.published-table__row { min-height: 56px; border-top: 1px solid var(--line); }
.published-table > .empty-panel { border: 0; border-radius: 0; }
.published-date,.history-note { color: var(--muted); font-size: 11px; }
.history-note { color: var(--color-text-subtle); }
@media (max-width: 900px) {
  .section-heading { align-items: flex-start; flex-direction: column; gap: 8px; }
  .section-heading p { max-width: none; }
  .import-layout { grid-template-columns: minmax(220px, 35%) minmax(0,1fr); }
  .published-table__head,.published-table__row { grid-template-columns: minmax(0,1fr) auto; }
  .published-table__head span:nth-child(n+3) { display: none; }
  .published-date,.history-note,.published-table__row > :nth-child(4) { grid-column: 1 / -1; }
}
@media (max-width: 640px) {
  .job-admin { gap: 16px; padding: 12px; }
  .page-intro { align-items: flex-start; }
  .intro-stamp { display: none; }
  .trust-legend { grid-template-columns: 36px minmax(0,1fr); gap: 9px 11px; padding: 13px; }
  .legend-mark { width: 34px; height: 34px; }
  .legend-divider { display: none; }
  .legend-mark--reviewed { grid-column: 1; }
  .section-tabs { overflow-x: auto; }
  .section-tabs button { flex: 0 0 auto; padding: 0 8px; gap: 6px; }
  .section-tabs .refresh-button { font-size: 0; width: 36px; justify-content: center; }
  .section-tabs .refresh-button :deep(svg) { margin: 0; font-size: 16px; }
  .review-card { flex-direction: column; }
  .review-card__actions { justify-content: flex-end; flex-wrap: wrap; }
  .review-detail__grid { grid-template-columns: 1fr; }
  .review-source-confirm { align-items: flex-start; flex-direction: column; }
  .import-layout { grid-template-columns: 1fr; }
  .import-rail { display: grid; grid-template-columns: 1fr; }
  .import-workspace { padding: 13px; }
  .candidate-fields,.preview-facts,.digest-details dl { grid-template-columns: 1fr; }
  .candidate-actions,.checklist-actions { align-items: flex-start; flex-direction: column; }
  .checklist-actions :deep(.el-button) { width: 100%; }
  .published-table__head { display: none; }
  .published-table__row { grid-template-columns: minmax(0,1fr) auto; gap: 8px; padding: 13px; }
}
@media (prefers-reduced-motion: reduce) { *,*::before,*::after { transition-duration: .01ms !important; animation-duration: .01ms !important; } }
</style>
