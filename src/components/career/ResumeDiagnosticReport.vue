<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import type { ResumeDiagnosticReport } from '@/api/report'
import ResumeEntityReview from './ResumeEntityReview.vue'
import ResumeImprovementPanel from './ResumeImprovementPanel.vue'
import ReportReadingLayout from '@/components/reports/ReportReadingLayout.vue'

const props = defineProps<{
  report: ResumeDiagnosticReport | null
  loading?: boolean
  error?: string
}>()
const emit = defineEmits<{ refreshJobs: []; upgradeReport: [] }>()
const router=useRouter()
const reader = ref<InstanceType<typeof ReportReadingLayout>>()
const readingSections = [
  { id: 'analysis', title: '经历解读' }, { id: 'content', title: '简历内容' },
  { id: 'improvements', title: '改进建议' }, { id: 'directions', title: '方向线索' },
  { id: 'basis', title: '资料与依据' },
]
function showEvidence(id: string) {
  const chapter = props.report?.chapters.find(item => item.items.some(entry => entry.id === id))
  void reader.value?.open(chapter?.id === 'entity_review' ? 'basis' : 'content', `rd-item-${id}`)
}

const roleDirections = computed(() => props.report?.chapters.find(chapter => chapter.id === 'role_directions') || null)
const reportChapters = computed(() => props.report?.chapters.filter(chapter => chapter.id !== 'role_directions') || [])
const publishedJobs = computed(() => props.report?.job_catalog?.items || [])
const firstReadingQuestion = computed(() => props.report?.analysis?.questions?.[0]?.text || props.report?.improvements?.[0]?.questions?.[0])
const missingLabels: Record<string,string> = {
  unparsed_source_pages:'部分原文件尚未读取，请补齐资料后再核对',
  evidence_grounded_semantic_analysis:'经历解读暂未就绪，不能把它视为已完成的分析',
  resume_based_role_directions:'岗位方向资料尚未就绪',
  resume_expression_advice:'改进建议尚未形成，已确认的原文与可用解读仍可阅读',
}

function roleField(item: { fields: Record<string, unknown> | string | null }, key: string): string {
  if (!item.fields || typeof item.fields === 'string') return ''
  return displayValue(item.fields[key]).trim()
}

function roleQuestions(item: { fields: Record<string, unknown> | string | null }): string[] {
  if (!item.fields || typeof item.fields === 'string') return []
  const value = item.fields.questions_to_verify
  return Array.isArray(value) ? value.map(question => String(question).trim()).filter(Boolean) : []
}

function formatDate(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function jobValidityLabel(job: { vacancy_validity: string }): string {
  if (job.vacancy_validity === 'current') return '仍在招 · 已核验'
  if (job.vacancy_validity === 'expired') return '招聘已结束'
  return '是否仍在招：未核验'
}

function safeExternalUrl(value?: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

function sourceHost(value?: string | null): string {
  const url = safeExternalUrl(value)
  if (!url) return '来源链接暂不可用'
  try { return new URL(url).hostname } catch { return '已发布来源' }
}

const pageCoverage = computed(() => {
  const coverage = props.report?.coverage
  if (!coverage || coverage.page_count == null) return ''
  // The contract does not distinguish physical pages from logical text blocks.
  // Do not present a text parser's synthetic page=1 as an original PDF locator.
  return '原文已读取，提取准确性仍需本人核对'
})

const fieldLabel: Record<string, string> = {
  name: '名称', school: '学校', major: '专业', degree: '学历', grade: '年级',
  role: '角色', title: '标题', description: '内容', desc: '内容', skills: '技能',
  start_date: '开始时间', end_date: '结束时间', organization: '组织', award: '获奖',
  level: '级别', score: '成绩', certificate: '证书', target_role: '求职方向',
  value: '内容', content: '内容', original_mention: '简历原词', decision: '模型建议',
  candidate: '公共实体候选', rationale: '判断依据', review_status: '审阅状态',
}
const chapterTitle: Record<string, string> = {
  overview: '简历概览', education: '教育经历', experience: '实习与工作经历',
  projects: '项目经历', capabilities: '技能与能力', achievements: '竞赛与荣誉',
  semantic_evidence: '语义能力证据', entity_review: '实体候选 · 待归一化核验', other_facts: '其他资料',
}

function labelFor(key: string): string {
  return fieldLabel[key] || key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join('、')
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(displayValue).filter(Boolean).join(' · ')
  return String(value)
}

function fieldsFor(fields: Record<string, unknown> | string | null | undefined) {
  const entries: [string, unknown][] = typeof fields === 'string'
    ? [['content', fields]]
    : Object.entries(fields || {})
  return entries.filter(([key]) => !/(^_|(?:^|_)(?:id|sha256|hash)$|^(?:source|schema_version|evidence_refs)$)/i.test(key)).map(([key, value]) => ({
    key, label: labelFor(key),
    value: key === 'decision'
      ? ({ equivalent: '可能等价', related: '相关但不等价', unresolved: '尚未判定' }[String(value)] || displayValue(value))
      : key === 'review_status' ? '待用户核验' : displayValue(value),
  }))
    .filter(item => item.value)
}

type PresentedItem = {
  title: string
  subtitle: string
  body: string
  badge: string
  fields: ReturnType<typeof fieldsFor>
}

function presentItem(chapterId: string, item: { label: string; fields: Record<string, unknown> | string | null }) : PresentedItem {
  const raw = typeof item.fields === 'string' ? { content: item.fields } : (item.fields || {})
  const value = (...keys: string[]) => {
    for (const key of keys) {
      const found = raw[key]
      const text = displayValue(found)
      if (text) return text
    }
    return ''
  }
  const fields = fieldsFor(item.fields)
  const without = (...keys: string[]) => fields.filter(field => !keys.includes(field.key.toLowerCase()))

  if (chapterId === 'projects' || chapterId === 'experience') {
    const title = value('name', 'project_name', 'company', 'organization', 'school') || item.label
    const role = value('role', 'position', 'job_title', 'title')
    const teamValue = value('is_team', 'team', 'team_role')
    const teamLabel = teamValue === '是' || teamValue.toLowerCase() === 'true'
      ? '团队项目'
      : teamValue === '否' || teamValue.toLowerCase() === 'false' ? '个人项目' : teamValue
    const subtitle = [role, teamLabel].filter(Boolean).join(' · ')
    const body = value('desc', 'description', 'content', 'summary', 'value')
    return { title, subtitle, body, badge: '', fields: without('name', 'project_name', 'company', 'organization', 'school', 'role', 'position', 'job_title', 'title', 'is_team', 'team', 'team_role', 'desc', 'description', 'content', 'summary', 'value') }
  }

  if (chapterId === 'achievements') {
    const award = value('award', 'type')
    const level = value('level')
    return {
      title: value('name', 'award_name', 'competition') || item.label,
      subtitle: award && award !== level ? award : '',
      body: value('description', 'desc', 'content'),
      badge: level || award,
      fields: without('name', 'award_name', 'competition', 'award', 'type', 'description', 'desc', 'content', 'level'),
    }
  }

  if (chapterId === 'education') {
    const title = [value('school', 'institution'), value('major', 'field_of_study')].filter(Boolean).join(' · ') || item.label
    const subtitle = [value('degree'), value('grade', 'class_year'), value('start_date'), value('end_date')].filter(Boolean).join(' · ')
    return { title, subtitle, body: value('description', 'desc', 'content'), badge: '', fields: without('school', 'institution', 'major', 'field_of_study', 'degree', 'grade', 'class_year', 'start_date', 'end_date', 'description', 'desc', 'content') }
  }

  if (chapterId === 'overview') {
    const title = value('name') || item.label
    const subtitle = [value('school'), value('major'), value('degree'), value('target_role')].filter(Boolean).join(' · ')
    return { title, subtitle, body: value('summary', 'description', 'desc', 'content'), badge: '', fields: without('name', 'school', 'major', 'degree', 'target_role', 'summary', 'description', 'desc', 'content') }
  }

  if (chapterId === 'capabilities' || chapterId === 'semantic_evidence') {
    const title = value('name', 'skill', 'label') || (item.label === '技能' ? '' : item.label)
    const subtitle = [value('category'), value('level', 'proficiency')].filter(Boolean).join(' · ')
    const rawBody = value('description', 'desc', 'evidence', 'content', 'value')
    const resolvedTitle = title || rawBody || value('category') || item.label
    const body = rawBody.trim() === resolvedTitle.trim() ? '' : rawBody
    return { title: resolvedTitle, subtitle, body, badge: '', fields: without('name', 'skill', 'label', 'category', 'level', 'proficiency', 'description', 'desc', 'evidence', 'content', 'value') }
  }

  return { title: item.label, subtitle: '', body: '', badge: '', fields }
}
</script>

<template>
  <section class="resume-diagnostic" aria-label="简历诊断报告">
    <header class="rd-header">
      <div>
        <span class="rd-eyebrow">简历诊断 · 仅基于已确认资料</span>
        <h2>你的经历与能力证据</h2>
        <p>回看你的项目、技能和经历，了解值得继续探索的方向。</p>
      </div>
      <span v-if="report" class="rd-status" :class="`rd-status--${report.status}`">
        <Icon :icon="report.status === 'completed' ? 'lucide:badge-check' : 'lucide:circle-alert'" :width="14" />
        {{ report.status === 'completed' ? '简历章节已生成' : '部分内容待补充' }}
      </span>
    </header>

    <div v-if="loading" class="rd-state" role="status">
      <Icon icon="lucide:loader-circle" :width="20" class="rd-spin" />
      <div><strong>正在整理简历诊断</strong><p>依据已确认的简历版本生成章节与证据引用，不会填入虚构分数。</p></div>
    </div>
    <div v-else-if="error" class="rd-state rd-state--error" role="alert">
      <Icon icon="lucide:triangle-alert" :width="19" />
      <div><strong>报告暂时无法读取</strong><p>{{ error }}</p></div>
    </div>
    <div v-else-if="!report" class="rd-state">
      <Icon icon="lucide:file-search-2" :width="20" />
      <div><strong>报告尚未生成</strong><p>确认简历后，系统会整理简历范围内的诊断；不需要先有岗位匹配结果。</p></div>
    </div>
    <ReportReadingLayout v-else ref="reader" :resource-key="report.report_id" :sections="readingSections" v-slot="{ section, open }">
      <p v-if="report.analysis && report.analysis_content_status === 'legacy'" class="rd-warning" role="status">这是此前生成的解读，个人分工仍需对照原文核对；历史内容不会自动改写。</p>
      <section v-if="section === 'overview'" class="rd-overview">
        <p v-if="report.analysis?.summary?.text" class="rd-overview__lead">{{ report.analysis.summary.text }}</p>
          <p v-else class="rd-overview__lead">经历解读尚未就绪；你仍可完整阅读原始资料，也可以先核对需要补清的问题。</p>
          <div v-if="firstReadingQuestion" class="rd-overview__question"><h3>值得先讲清的问题</h3><p>{{ firstReadingQuestion }}</p><button type="button" @click="open(report.analysis?.summary?.text ? 'analysis' : 'improvements')">{{ report.analysis?.summary?.text ? '阅读完整经历解读 →' : '查看这处补充建议 →' }}</button></div>
        <div v-if="roleDirections?.items.length" class="rd-overview__directions"><h3>可以继续了解的方向</h3><button v-for="item in roleDirections.items" :key="item.id" type="button" @click="open('directions')">{{ roleField(item, 'title') || item.label }} →</button></div>
        <p v-if="report.coverage.missing_pages.length" class="rd-warning">部分原文件尚未读取。当前解读不代表全部经历，详见“资料与依据”。</p>
      </section>
      <section v-if="section === 'analysis' && report.analysis?.summary?.text" class="rd-analysis" aria-label="从已有经历看起点">
        <span class="rd-analysis-label"><Icon icon="lucide:sparkles" :width="13" />从已有经历看起点</span>
        <p>{{ report.analysis.summary.text }}</p>
        <div v-if="report.analysis.strengths?.length" class="rd-analysis-list"><strong>这些经历可以怎样用起来</strong><span v-for="(item,index) in report.analysis.strengths" :key="index">{{ item.text }} <a v-for="id in item.evidence_ids || []" :key="id" :href="`#rd-item-${id}`" @click.prevent="showEvidence(id)">对照经历</a></span></div>
        <div v-if="report.analysis.questions?.length" class="rd-analysis-list rd-analysis-list--questions"><strong>值得先讲清的事</strong><span v-for="(item,index) in report.analysis.questions" :key="index">{{ item.text }} <a v-for="id in item.evidence_ids || []" :key="id" :href="`#rd-item-${id}`" @click.prevent="showEvidence(id)">对照经历</a></span></div>
        <details class="rd-analysis-refs"><summary>解读依据与边界</summary><p>以上是基于本人确认简历的初步解读，不是能力认证；可对照经历核对。</p><a v-for="(id,index) in report.analysis.summary.evidence_ids || []" :key="id" :href="`#rd-item-${id}`" @click.prevent="showEvidence(id)">查看依据 {{ index+1 }}</a></details>
        <button type="button" class="rd-role-generate" @click="router.push({name:'student-career-report'})">带着这些经历，看看职业攀岩路径</button>
      </section>
      <p v-if="section === 'analysis' && !report.analysis?.summary?.text">经历解读尚未就绪；已确认的原有资料仍可在“简历内容”阅读。</p>
      <ResumeImprovementPanel v-if="section === 'improvements'" expanded :report="report" @generate="emit('upgradeReport')" />
      <div class="rd-coverage" v-if="section === 'basis' && (pageCoverage || report.coverage.missing_pages.length)">
        <span v-if="pageCoverage"><Icon icon="lucide:files" :width="14" />{{ pageCoverage }}</span>
        <span v-if="report.coverage.missing_pages.length" class="rd-warning">
          <Icon icon="lucide:scan-eye" :width="14" />第 {{ report.coverage.missing_pages.join('、') }} 页缺少可核对内容
        </span>
      </div>

      <section v-if="section === 'directions'" class="rd-role-panel" aria-labelledby="rd-role-title">
        <div class="rd-role-head">
          <div><span class="rd-role-kicker">下一步方向</span><h3 id="rd-role-title">适合继续探索的岗位</h3></div>
          <span v-if="roleDirections?.items.length" class="rd-role-count">{{ roleDirections.items.length }} 个候选方向</span>
        </div>
        <p class="rd-role-note">这些方向来自已确认的简历，是探索线索，不是岗位匹配结论。</p>
        <div v-if="roleDirections?.items.length" class="rd-role-grid">
          <article v-for="(item, index) in roleDirections.items" :key="item.id" class="rd-role-card">
            <div class="rd-role-card__top"><span class="rd-role-index">方向 {{ String(index + 1).padStart(2, '0') }}</span><span class="rd-role-source">简历推断 · 待核验</span></div>
            <h4>{{ roleField(item, 'title') || item.label }}</h4>
            <button type="button" class="rd-role-generate" @click="router.push({name:'student-career-report',query:{role:roleField(item,'title') || item.label}})">看看这个方向的起点与下一步</button>
            <details v-if="item.evidence_refs?.length || roleField(item, 'rationale')" class="rd-role-evidence">
              <summary>查看方向依据</summary>
              <p v-if="roleField(item, 'rationale')" class="rd-role-rationale">{{ roleField(item, 'rationale') }}</p>
              <blockquote v-for="(evidence, evidenceIndex) in item.evidence_refs" :key="`${item.id}-${evidenceIndex}`">
                {{ evidence.quote || '原文定位已记录' }}
              </blockquote>
            </details>
            <div v-if="roleQuestions(item).length" class="rd-role-question">
              <strong>进一步确认</strong>
              <ul><li v-for="(question, questionIndex) in roleQuestions(item)" :key="`${item.id}-question-${questionIndex}`">{{ question }}</li></ul>
            </div>
          </article>
        </div>
        <div v-else class="rd-role-empty">
          <Icon icon="lucide:compass" :width="19" />
          <div><strong>{{ roleDirections?.status === 'pending_model_interpretation' ? '正在分析岗位方向' : '岗位方向尚未生成' }}</strong><p>{{ roleDirections?.notice || '简历事实和报告仍可查看；岗位方向可从当前已确认资料生成，不要求岗位目录先就绪。' }}</p>
            <button v-if="roleDirections?.status !== 'pending_model_interpretation'" type="button" class="rd-role-generate" @click="emit('upgradeReport')">生成／更新岗位方向</button>
          </div>
        </div>

        <div class="rd-job-catalog">
          <div class="rd-job-catalog__head">
            <div><strong>已发布岗位目录</strong><span v-if="report.job_catalog?.catalog_latest_published_at">目录更新至 {{ formatDate(report.job_catalog.catalog_latest_published_at) }}</span></div>
            <button type="button" class="rd-job-refresh" :disabled="loading" @click="emit('refreshJobs')"><Icon icon="lucide:refresh-cw" :width="12" />刷新岗位</button>
          </div>
          <div v-if="publishedJobs.length" class="rd-job-list">
            <article v-for="job in publishedJobs" :key="`${job.job_portrait_id}-${job.publication_version || ''}`" class="rd-job-card">
              <div class="rd-job-card__main"><strong>{{ job.position_name }}</strong><span>{{ sourceHost(job.source_uri) }}<template v-if="job.source_license"> · {{ job.source_license }}</template></span></div>
              <div class="rd-job-card__meta"><span v-if="job.published_at">发布于 {{ formatDate(job.published_at) }}</span><span v-if="job.source_fetched_at">来源抓取于 {{ formatDate(job.source_fetched_at) }}</span><span v-if="job.reviewed_at">审核于 {{ formatDate(job.reviewed_at) }}</span><span :class="job.vacancy_validity === 'current' ? 'rd-job-validity--current' : job.vacancy_validity === 'expired' ? 'rd-job-validity--expired' : ''">{{ jobValidityLabel(job) }}</span>
                <a v-if="safeExternalUrl(job.source_uri)" :href="safeExternalUrl(job.source_uri)!" target="_blank" rel="noopener noreferrer">查看来源<Icon icon="lucide:arrow-up-right" :width="11" /></a>
              </div>
            </article>
          </div>
          <p v-else class="rd-job-empty"><Icon icon="lucide:briefcase-business" :width="15" />{{ report.job_catalog?.status === 'unavailable' ? '岗位目录暂时不可用，请稍后刷新；上方候选方向不受影响。' : !report.job_catalog ? '当前报告尚未附带岗位目录；刷新即可读取最新职位，无需重新上传简历。' : '暂无已核验发布岗位记录。上方仍可查看基于简历的岗位方向；岗位更新无需重新上传简历。' }}</p>
        </div>
      </section>

      <div v-if="(section === 'content' || section === 'basis') && reportChapters.length" class="rd-chapters">
        <section v-for="chapter in reportChapters.filter(item => section === 'basis' ? item.id === 'entity_review' : item.id !== 'entity_review')" :key="chapter.id" class="rd-chapter">
          <div class="rd-chapter-heading"><span class="rd-chapter-mark"></span><h3>{{ chapter.id === 'entity_review' ? '名称与来源核对' : chapterTitle[chapter.id] || chapter.title }}</h3><span class="rd-chapter-count">{{ chapter.items.length }}</span></div>
          <p v-if="chapter.id === 'entity_review'" class="rd-entity-note">这些名称来自简历，系统提供的相近名称仍需本人核对，不等于已确认是同一项。</p>
          <p v-if="chapter.id === 'entity_review' && chapter.status === 'not_available'" class="rd-entity-note">
            当前已确认资料没有实体对齐记录；历史简历不会被自动改写。重新解析并确认后可产生可审阅候选。
          </p>
          <p v-else-if="chapter.id === 'entity_review' && !chapter.items.length" class="rd-entity-note">
            暂无逐字证据通过校验的实体候选；技能原词仍保留在已确认简历中。
          </p>
          <ResumeEntityReview
            v-if="chapter.id === 'entity_review'"
            :confirmation-task-id="report.source_confirmation_task_id"
            :report-items="chapter.items"
          />
          <template v-else>
          <article v-for="item in chapter.items" :id="`rd-item-${item.id}`" :key="item.id" class="rd-item" :class="`rd-item--${chapter.id}`">
            <div class="rd-item-head">
              <h4>{{ presentItem(chapter.id, item).title }}</h4>
              <span v-if="presentItem(chapter.id, item).badge" class="rd-item-badge">{{ presentItem(chapter.id, item).badge }}</span>
            </div>
            <p v-if="presentItem(chapter.id, item).subtitle" class="rd-item-subtitle">{{ presentItem(chapter.id, item).subtitle }}</p>
            <p v-if="presentItem(chapter.id, item).body" class="rd-item-body">{{ presentItem(chapter.id, item).body }}</p>
            <dl v-if="presentItem(chapter.id, item).fields.length" class="rd-fields">
              <template v-for="field in presentItem(chapter.id, item).fields" :key="field.key">
                <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
              </template>
            </dl>
            <details v-if="item.evidence_refs?.length" class="rd-evidence">
              <summary>查看原文依据</summary>
              <blockquote v-for="(evidence, index) in item.evidence_refs" :key="`${evidence.block_id || 'e'}-${index}`">
                <span v-if="evidence.quote">{{ evidence.quote }}</span>
                <span v-else class="rd-no-quote">原文定位已记录</span>
              </blockquote>
            </details>
            <p v-else class="rd-no-evidence">
              {{ item.evidence_status === 'confirmed_profile_only' ? '来自已确认档案；当前报告未提供逐页原文定位。' : '暂无可定位原文，请对照简历原件核验。' }}
            </p>
          </article>
          <p v-if="!chapter.items.length" class="rd-empty-chapter">此章节暂无已确认内容。</p>
          </template>
        </section>
      </div>
      <div v-else-if="section === 'content'" class="rd-state"><Icon icon="lucide:file-question" :width="20" /><div><strong>暂无可展示章节</strong><p>这份报告尚未提供简历内容，请稍后重试或重新核验简历。</p></div></div>

      <section v-if="section === 'basis' && report.missing_sections.length" class="rd-missing">
        <h3><Icon icon="lucide:list-plus" :width="14" />待补充的信息</h3>
        <ul><li v-for="(item, index) in report.missing_sections" :key="index">{{ missingLabels[item] || '部分解读尚不可用，请核对资料或稍后重试' }}</li></ul>
      </section>
      <section v-if="section === 'basis' && report.limitations.length" class="rd-limitations">
        <Icon icon="lucide:info" :width="15" />
        <div><strong>阅读说明</strong><p v-for="(item, index) in report.limitations" :key="index">{{ item }}</p></div>
      </section>
      <footer v-if="section === 'basis'" class="rd-footer">来自本人已确认的简历 · {{ report.coverage.accuracy_verified ? '证据已校验' : '内容准确性仍需本人核对' }}</footer>
    </ReportReadingLayout>
  </section>
</template>

<style scoped>
.resume-diagnostic { height: 100%; overflow: auto; padding: clamp(24px, 4vw, 56px); color: #292723; background: #f7f5f1; }
.rd-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; max-width: 1080px; margin: 0 auto 28px; padding-bottom: 22px; border-bottom: 1px solid #d8d2c8; }
.rd-eyebrow { color: #9f351f; font-size: 11px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
.rd-header h2 { margin: 10px 0 6px; font: 500 clamp(24px, 3vw, 38px)/1.15 Georgia, 'Noto Serif SC', serif; letter-spacing: -.035em; }
.rd-header p { margin: 0; max-width: 650px; color: #78746e; font-size: 13px; line-height: 1.7; }
.rd-status { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; border: 1px solid #c9c0b4; border-radius: 999px; padding: 7px 11px; color: #5a6955; background: #fff; font-size: 11px; }
.rd-status--partial { color: #9f351f; }
.rd-state { display: flex; align-items: flex-start; gap: 13px; max-width: 760px; margin: 0 auto; padding: 20px; border: 1px solid #ded8cf; background: #fff; color: #8b806f; }
.rd-state strong { display: block; margin-bottom: 5px; color: #35312b; font-size: 14px; }
.rd-state p { margin: 0; color: #77716a; font-size: 12px; line-height: 1.7; }
.rd-state--error { border-color: #dbb7a9; color: #a13c22; }
.rd-spin { animation: rd-spin .9s linear infinite; }
.rd-coverage { display: flex; flex-wrap: wrap; gap: 8px 18px; max-width: 1080px; margin: 0 auto 20px; color: #77716a; font-size: 12px; }
.rd-coverage span { display: inline-flex; align-items: center; gap: 6px; }
.rd-coverage .rd-warning { color: #a13c22; }
.rd-chapters { display: grid; gap: 22px; max-width: 1080px; margin: 0 auto; }
.rd-analysis { padding: 19px 22px; border: 1px solid #d9c9b9; background: linear-gradient(135deg, #fff 0%, #f1ebe3 100%); }
.rd-analysis-label { display: inline-flex; align-items: center; gap: 6px; color: #9f472d; font-size: 10px; font-weight: 750; letter-spacing: .08em; }
.rd-analysis-disclaimer { display: block; margin-top: 9px; max-width: 760px; color: #8a6455; font-size: 11px; line-height: 1.6; }
.rd-analysis > p { margin: 11px 0 0; color: #37332d; font: 400 15px/1.8 Georgia, 'Noto Serif SC', serif; white-space: pre-wrap; }
.rd-analysis-refs { margin-top: 10px; color: #938a7d; font-size: 10px; }
.rd-analysis-refs a { margin-left: 6px; color: #9f472d; text-decoration: underline; text-underline-offset: 2px; }
.rd-analysis-list { display: grid; gap: 7px; margin-top: 13px; color: #686258; font-size: 11px; }
.rd-analysis-list strong { color: #464139; }
.rd-analysis-list span { padding: 9px 11px; border: 1px solid #ded6cb; border-radius: 4px; background: #ffffffa6; line-height: 1.6; }
.rd-analysis-list a { margin-left: 6px; color: #9f472d; text-decoration: underline; text-underline-offset: 2px; white-space: nowrap; }
.rd-analysis-list--questions span { border-color: #e4d1c7; color: #8a4b37; }
.rd-chapter { padding: 0 0 4px; }
.rd-chapter-heading { display: flex; align-items: center; gap: 9px; margin-bottom: 11px; }
.rd-chapter-mark { width: 7px; height: 7px; border-radius: 50%; background: #ad472a; box-shadow: 0 0 0 4px #eee1d9; }
.rd-chapter-heading h3 { margin: 0; font-size: 16px; font-weight: 650; }
.rd-chapter-count { display: grid; place-items: center; min-width: 21px; height: 21px; margin-left: auto; border-radius: 50%; background: #ebe6df; color: #77716a; font-size: 10px; }
.rd-role-panel { max-width: 1080px; margin: 24px auto 30px; padding: clamp(16px, 2.5vw, 26px); border: 1px solid #ded6cb; background: linear-gradient(145deg, #fffdfa, #f3eee7); box-shadow: 0 8px 26px #4437280b; }
.rd-role-head { display: flex; align-items: end; justify-content: space-between; gap: 12px; }
.rd-role-kicker { color: #a0442b; font-size: 10px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
.rd-role-head h3 { margin: 5px 0 0; color: #292723; font: 500 clamp(19px, 2.2vw, 25px)/1.3 Georgia, 'Noto Serif SC', serif; }
.rd-role-count { padding: 5px 10px; border: 1px solid #dfd2c4; border-radius: 999px; color: #875b45; background: #fffaf4; font-size: 10px; white-space: nowrap; }
.rd-role-note { margin: 9px 0 16px; color: #817a72; font-size: 11px; line-height: 1.7; }
.rd-role-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.rd-role-card { min-width: 0; padding: 15px 16px; border: 1px solid #e2d9cf; border-left: 2px solid #b35439; background: #fff; }
.rd-role-card__top { display: flex; justify-content: space-between; gap: 8px; color: #9b9288; font-size: 9px; }
.rd-role-index { color: #a0442b; font-weight: 700; letter-spacing: .07em; }
.rd-role-source { color: #898076; }
.rd-role-card h4 { margin: 9px 0 0; color: #34302b; font-size: 15px; font-weight: 650; }
.rd-role-rationale,.rd-role-question { margin: 7px 0 0; color: #696158; font-size: 11px; line-height: 1.7; }
.rd-role-evidence { margin-top: 11px; padding-top: 9px; border-top: 1px solid #f0ebe5; }
.rd-role-evidence strong { display: inline-flex; align-items: center; gap: 4px; color: #a0442b; font-size: 9px; }
.rd-role-evidence blockquote { margin: 6px 0 0; padding-left: 8px; border-left: 1px solid #d8b9a9; color: #827970; font-size: 10px; line-height: 1.6; }
.rd-role-question { color: #8a684f; }
.rd-role-question ul { margin: 5px 0 0; padding-left: 17px; }
.rd-role-question li + li { margin-top: 3px; }
.rd-role-empty { display: flex; align-items: start; gap: 10px; padding: 15px; color: #987553; background: #f8f3eb; }
.rd-role-empty strong { color: #51483e; font-size: 12px; }
.rd-role-empty p { margin: 4px 0 0; color: #81786c; font-size: 11px; line-height: 1.6; }
.rd-role-generate { margin-top: 8px; padding: 6px 9px; border: 1px solid #d7c5b5; color: #8f442c; background: #fff; font: inherit; font-size: 10px; cursor: pointer; }
.rd-job-catalog { margin-top: 17px; padding-top: 13px; border-top: 1px solid #e8dfd5; }
.rd-job-catalog__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rd-job-catalog__head > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.rd-job-catalog__head strong { color: #4b453e; font-size: 11px; }
.rd-job-catalog__head span { color: #999187; font-size: 9px; }
.rd-job-refresh { display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; border: 1px solid #d7c9bc; color: #895139; background: #fff; font: inherit; font-size: 10px; cursor: pointer; }
.rd-job-refresh:hover { border-color: #aa7159; background: #fbf5ef; }
.rd-job-refresh:disabled { opacity: .55; cursor: wait; }
.rd-job-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.rd-job-card { min-width: 0; padding: 11px 12px; border: 1px solid #e4ddd5; background: #fff; }
.rd-job-card__main { display: flex; flex-direction: column; gap: 4px; }
.rd-job-card__main strong { color: #38342e; font-size: 12px; }
.rd-job-card__main span,.rd-job-card__meta { color: #91897f; font-size: 9px; }
.rd-job-card__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 11px; margin-top: 9px; }
.rd-job-card__meta > span:last-of-type { color: #50705a; }
.rd-job-card__meta > .rd-job-validity--expired { color: #a0442b; }
.rd-job-card__meta > .rd-job-validity--current { color: #50705a; }
.rd-job-card__meta a { display: inline-flex; align-items: center; gap: 3px; margin-left: auto; color: #a0442b; text-decoration: none; }
.rd-job-empty { display: flex; align-items: center; gap: 8px; margin: 9px 0 0; padding: 10px 12px; color: #777065; background: #f4f0ea; font-size: 10px; line-height: 1.6; }
.rd-entity-note { margin: 0 0 10px; color: #8a4b37; font-size: 11px; }
.rd-item { margin: 8px 0; padding: 16px 18px; border: 1px solid #ded8cf; border-radius: 2px; background: #fff; box-shadow: 0 3px 12px #3b30250a; }
.rd-item-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.rd-item h4 { margin: 0; font-size: 14px; font-weight: 650; }
.rd-item-badge { flex: 0 0 auto; padding: 3px 8px; border: 1px solid #d7c7b8; border-radius: 999px; color: #8c452e; background: #f7f1eb; font-size: 10px; }
.rd-item-subtitle { margin: 5px 0 0; color: #8b7566; font-size: 11px; line-height: 1.6; }
.rd-item-body { margin: 10px 0 0; color: #4f4a43; font-size: 12px; line-height: 1.75; white-space: pre-wrap; overflow-wrap: anywhere; }
.rd-fields { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 7px 14px; margin: 0; font-size: 12px; line-height: 1.65; }
.rd-fields dt { color: #89837b; }
.rd-fields dd { margin: 0; color: #393630; white-space: pre-wrap; overflow-wrap: anywhere; }
.rd-evidence { margin-top: 13px; padding-top: 11px; border-top: 1px solid #eee9e2; }
.rd-evidence-label { display: inline-flex; align-items: center; gap: 5px; color: #9f472d; font-size: 10px; font-weight: 700; }
.rd-evidence blockquote { position: relative; margin: 7px 0 0; padding: 0 0 0 10px; border-left: 2px solid #dfc0b2; color: #716b64; font-size: 12px; line-height: 1.65; }
.rd-page { margin-right: 7px; color: #9f472d; font-size: 10px; font-weight: 650; white-space: nowrap; }
.rd-no-quote,.rd-no-evidence,.rd-empty-chapter { color: #89837b; font-size: 11px; }
.rd-no-evidence,.rd-empty-chapter { margin: 10px 0 0; }
.rd-missing,.rd-limitations { max-width: 1080px; margin: 20px auto 0; padding: 15px 17px; border-left: 3px solid #b65032; background: #f0e8e2; }
.rd-missing h3 { display: flex; align-items: center; gap: 7px; margin: 0 0 8px; font-size: 12px; }
.rd-missing ul { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 0; padding-left: 18px; color: #615b54; font-size: 12px; }
.rd-limitations { display: flex; gap: 9px; border-color: #c4b79f; background: #eeeae1; color: #81724f; }
.rd-limitations strong { font-size: 11px; }
.rd-limitations p { margin: 4px 0 0; color: #6f695f; font-size: 11px; line-height: 1.6; }
.rd-footer { max-width: 1080px; margin: 18px auto 0; color: #9b958d; font-size: 10px; overflow-wrap: anywhere; }
.resume-diagnostic > .reading-layout { max-width: 1080px; margin: 0 auto; --reading-nav-surface: #f7f5f1; }
.rd-overview__lead { font: 400 17px/1.9 Georgia, 'Noto Serif SC', serif; margin: 0 0 30px; }
.rd-overview h3 { font-size: 16px; margin: 0 0 8px; }
.rd-overview__question { margin: 26px 0; padding-left: 16px; border-left: 2px solid #b35439; }
.rd-overview__question p { margin: 8px 0; }
.rd-overview button { min-height: 44px; border: 0; padding: 8px 0; background: none; color: #913e25; font: inherit; text-align: left; cursor: pointer; }
.rd-overview__directions { display: grid; margin: 28px 0; }
.rd-overview__directions button { border-bottom: 1px solid #ded6cb; }
.rd-overview button:focus-visible { outline: 2px solid #913e25; outline-offset: 3px; }
.rd-analysis { border: 0; padding: 0; background: none; }
.rd-analysis-label { font-size: 13px; letter-spacing: 0; }
.rd-analysis-list { font-size: 15px; gap: 18px; margin-top: 28px; line-height: 1.85; }
.rd-analysis-list span { padding: 0; border: 0; background: none; line-height: inherit; }
.rd-analysis-refs { font-size: 13px; margin-top: 24px; }
.rd-role-panel { margin: 0; padding: 0; border: 0; background: none; box-shadow: none; }
.rd-role-grid, .rd-job-list { grid-template-columns: 1fr; gap: 24px; }
.rd-role-card, .rd-job-card { padding: 0 0 20px; border: 0; border-bottom: 1px solid #ded6cb; background: none; }
.rd-role-note, .rd-role-rationale, .rd-role-question, .rd-role-evidence blockquote, .rd-role-empty p { font-size: 14px; line-height: 1.8; }
.rd-role-card__top, .rd-job-card__meta, .rd-job-card__main span { font-size: 12px; }
.rd-role-generate, .rd-job-refresh { min-height: 44px; font-size: 14px; }
.rd-item { padding: 18px 0 24px; margin: 0; border: 0; border-bottom: 1px solid #ded8cf; background: none; box-shadow: none; scroll-margin-top: 160px; }
.rd-item h4 { font-size: 17px; line-height: 1.6; }
.rd-item-subtitle { font-size: 13px; }
.rd-item-body, .rd-fields, .rd-evidence blockquote { font-size: 15px; line-height: 1.85; }
.rd-fields { margin-top: 14px; }
.rd-no-evidence, .rd-empty-chapter, .rd-entity-note, .rd-limitations p, .rd-coverage, .rd-footer { font-size: 13px; line-height: 1.8; }
.rd-chapters { gap: 32px; }
.rd-evidence summary { min-height: 44px; align-content: center; font-size: 13px; cursor: pointer; }
@keyframes rd-spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) { .resume-diagnostic { padding: 22px 16px; } .rd-header { display: block; } .rd-status { margin-top: 14px; } .rd-fields { grid-template-columns: 1fr; gap: 2px; } .rd-fields dd { margin-bottom: 7px; } .rd-role-grid,.rd-job-list { grid-template-columns: 1fr; } .rd-role-head { align-items: start; flex-direction: column; } }
@media (prefers-reduced-motion: reduce) { .rd-spin { animation-duration: 2s; } }
</style>
