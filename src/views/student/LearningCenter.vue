<!-- 页面：技能提升；路由：student/learning（student-learning）；角色：STUDENT -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore, useCourseStore } from '@/stores'
import { useLearningStore } from '@/stores/learning'
import type { LearningRecord } from '@/stores/learning'
import type { Course } from '@/types'
import { JOB_PORTRAITS } from '@/mock/careerPortraits'
import D3Treemap from '@/components/charts/D3Treemap.vue'
import type { TreemapCategory, TreemapCourse } from '@/components/charts/D3Treemap.vue'
import D3ChordDiagram from '@/components/charts/D3ChordDiagram.vue'
import { useAgentArtifactHandoff, commitMockArtifactHandoff } from '@/composables/useAgentArtifactHandoff'
import { openAgentWithResource } from '@/composables/useAgentResourceHandoff'
import { renderMarkdown } from '@/utils/markdown'
import { setActionPlanStepCompleted, saveActionPlanStepEvidence } from '@/api/agent'
import { uploadAgentFile } from '@/api/agentMedia'
import { getApiMode } from '@/api/config'
import HttpCourseLibrary from '@/components/learning/HttpCourseLibrary.vue'

const httpCourses = getApiMode() === 'http'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const courseStore = useCourseStore()
const learningStore = useLearningStore()

const hasArtifactQuery = computed(() => Object.prototype.hasOwnProperty.call(route.query, 'artifact_id'))
const artifactId = computed(() => typeof route.query.artifact_id === 'string' ? route.query.artifact_id.trim() : '')
const handoff = useAgentArtifactHandoff(() => artifactId.value)
type PlanItem = { id: string; title: string; detail: string; keyword: string; done: boolean }
type PlanPreviewData = { type?: string; steps?: number; completed?: number; duration?: string; items?: PlanItem[] }
const artifactReady = computed(() => handoff.ready.value && handoff.artifact.value?.kind === 'action_plan')
const planPreview = computed<PlanPreviewData | null>(() => artifactReady.value
  ? handoff.artifact.value?.preview as PlanPreviewData ?? null
  : null)
const httpSteps = computed(() => handoff.artifact.value?.content?.steps || [])
const hasStructuredSteps = computed(() => handoff.source.value === 'http' && httpSteps.value.length > 0)
const planBody = computed(() => handoff.source.value === 'http' && !hasStructuredSteps.value
  ? handoff.artifact.value?.content?.body || '' : '')
const planItems = computed<PlanItem[]>(() => {
  if (handoff.source.value === 'http') return httpSteps.value.map(step => ({
    id: step.step_id,
    title: step.title,
    detail: step.detail,
    keyword: step.title,
    done: step.completed,
  }))
  const items = planPreview.value?.items
  if (Array.isArray(items) && items.length) return items
  const artifact = handoff.artifact.value
  return artifactReady.value && artifact
    ? [{ id: 'summary', title: artifact.title, detail: artifact.summary || '请结合课程目录安排下一步学习。', keyword: '', done: false }]
    : []
})
const completedPlanCount = computed(() => planItems.value.filter(item => item.done).length)
const planProgress = computed(() => handoff.artifact.value?.content?.progress)
const planStatusLabel = computed(() => ({
  not_started: '未开始', in_progress: '进行中', completed: '已完成',
}[planProgress.value?.status || ''] || ''))
const planSourceStatus = computed(() => handoff.artifact.value?.content?.source?.status || '')
const explorationPlan = computed(() => handoff.artifact.value?.content?.source?.kind === 'career_exploration')
const updatingStepId = ref('')
const evidenceEditorStepId = ref('')
const evidenceDrafts = ref<Record<string, string>>({})
const evidenceFiles = ref<Record<string, { id: string; name: string; status: string }>>({})
const evidenceBusyStepId = ref('')
const evidenceUploadStepId = ref('')
const savedPlanResourceUri = computed(() => {
  const artifact = handoff.artifact.value
  const planId = artifact?.resource_id
  if (!artifactReady.value || handoff.source.value !== 'http'
    || artifact?.resource_type !== 'agent_action_plan'
    || typeof planId !== 'string' || !/^plan_[a-f0-9]{20}$/.test(planId)) return ''
  return `career://me/action-plans/${planId}`
})

function backToAgent() {
  const source = handoff.artifact.value?.content?.source
  if (source?.kind === 'career_exploration' && source.exploration_id) {
    void router.push({ name: 'student-career-analysis', query: { exploration_id: source.exploration_id } })
    return
  }
  void router.push({ name: 'student-ai-assistant', query: handoff.sessionId.value ? { session_id: handoff.sessionId.value } : {} })
}

function discussSavedPlan() {
  if (!savedPlanResourceUri.value) return
  // This is a read-and-reflect action, so return to the same conversation in
  // direct-answer mode rather than the task-planning mode used to create it.
  openAgentWithResource(router, { kind: 'career_resource', uri: savedPlanResourceUri.value }, handoff.sessionId.value, 'ask')
}

function browseOrdinaryLearning() {
  const query = { ...route.query }
  delete query.artifact_id
  delete query.session_id
  void router.replace({ path: route.path, query })
}

function togglePlanItem(id: string) {
  const artifact = handoff.artifact.value
  if (!artifactReady.value || !artifact) return
  if (handoff.source.value === 'http' && hasStructuredSteps.value) {
    const planId = artifact.resource_id
    const current = planItems.value.find(item => item.id === id)
    if (typeof planId !== 'string' || !current || updatingStepId.value) return
    updatingStepId.value = id
    void setActionPlanStepCompleted(planId, id, !current.done)
      .then(content => { artifact.content = content })
      .catch(error => ElMessage({
        message: error instanceof Error ? error.message : '进度暂时没有保存，请重试。',
        type: 'error', duration: 2600,
      }))
      .finally(() => { updatingStepId.value = '' })
    return
  }
  const preview = (artifact.preview && typeof artifact.preview === 'object' ? artifact.preview : {}) as PlanPreviewData
  if (!Array.isArray(preview.items) || !preview.items.length) preview.items = planItems.value.map(item => ({ ...item }))
  const item = preview.items.find(candidate => candidate.id === id)
  if (!item) return
  item.done = !item.done
  preview.steps = preview.items.length
  preview.completed = preview.items.filter(candidate => candidate.done).length
  artifact.preview = preview
  commitMockArtifactHandoff(handoff.sessionId.value, artifact)
}

function openEvidenceEditor(item: PlanItem) {
  const step = httpSteps.value.find(candidate => candidate.step_id === item.id)
  if (!step) return
  evidenceEditorStepId.value = item.id
  evidenceDrafts.value[item.id] = step.evidence?.summary || ''
  delete evidenceFiles.value[item.id]
}

function cancelEvidenceEditor(stepId: string) {
  evidenceEditorStepId.value = ''
  delete evidenceDrafts.value[stepId]
  delete evidenceFiles.value[stepId]
}

async function chooseEvidenceFile(stepId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const plan = handoff.artifact.value
  if (handoff.source.value !== 'http' || !plan?.resource_id || !handoff.sessionId.value) return
  evidenceUploadStepId.value = stepId
  try {
    const meta = await uploadAgentFile(file, {
      studentId: userStore.currentUser?.id,
      sessionId: handoff.sessionId.value,
      purpose: 'chat_attachment',
    })
    evidenceFiles.value[stepId] = {
      id: meta.file_id,
      name: meta.filename || file.name,
      status: meta.status || 'queued',
    }
    ElMessage({
      message: meta.status === 'ready'
        ? '附件已保存，可在助手复盘时读取。'
        : '附件已保存，解析完成前助手会标记为未读。',
      type: meta.status === 'ready' ? 'success' : 'info',
      duration: 2800,
    })
  } catch (error) {
    ElMessage({
      message: error instanceof Error ? error.message : '附件上传失败，请重试。',
      type: 'error', duration: 3000,
    })
  } finally {
    evidenceUploadStepId.value = ''
  }
}

async function submitPracticeEvidence(stepId: string) {
  const artifact = handoff.artifact.value
  const summary = evidenceDrafts.value[stepId]?.trim() || ''
  if (handoff.source.value !== 'http' || !artifact?.resource_id || !summary) return
  evidenceBusyStepId.value = stepId
  try {
    const file = evidenceFiles.value[stepId]
    artifact.content = await saveActionPlanStepEvidence(
      artifact.resource_id, stepId, summary, file?.id,
    )
    evidenceEditorStepId.value = ''
    delete evidenceDrafts.value[stepId]
    delete evidenceFiles.value[stepId]
    ElMessage({ message: '练习记录已保存。它会作为自述材料供复盘，不会自动改写简历或评分。', type: 'success', duration: 3000 })
  } catch (error) {
    ElMessage({
      message: error instanceof Error ? error.message : '成果暂时没有保存，请重试。',
      type: 'error', duration: 3000,
    })
  } finally {
    evidenceBusyStepId.value = ''
  }
}

function attachmentStatusLabel(status?: string) {
  return ({
    available: '已准备好读取',
    processing: '正在解析，助手暂未读取',
    unavailable: '暂不可读取',
  } as Record<string, string>)[status || ''] || '尚未读取'
}

function stepEvidence(stepId: string) {
  return httpSteps.value.find(step => step.step_id === stepId)?.evidence || null
}

function evidenceFileForStep(stepId: string) {
  return evidenceFiles.value[stepId] || null
}

function findPlanCourse(item: PlanItem) {
  keyword.value = item.keyword || item.title
  selectedCategory.value = 'all'
  page.value = 1
}

watch(hasArtifactQuery, (hasArtifact) => {
  if (hasArtifact || httpCourses) return
  const uid = userStore.currentUser?.id
  courseStore.loadFromApi(uid).catch(() => {})
}, { immediate: true })

/* ═══ 来源岗位（从 CourseSystemGraph 跳转时携带 ?role=xxx） ═══ */
const fromRole = computed<string>(() => (route.query.role as string) || '')

/* ═══ 弦图数据将在下方 computed 中直接构建 ═══ */

/* ═══ 搜索 & 筛选 ═══ */
const keyword = ref('')
const selectedCategory = ref<string>('all')
const page = ref(1)
const PAGE_SIZE = 12

function clearRole() {
  router.replace({ query: {} })
}

function goBackToGraph() {
  router.push({ name: 'course-system', query: { role: fromRole.value } })
}

function selectCategory(catId: string) {
  selectedCategory.value = catId
  page.value = 1
}

/* ═══ CAREER_DOMAINS 职业名 → JOB_PORTRAITS lineId + 可选 stack 过滤 ═══ */
const ROLE_LINE_MAP: Record<string, { lineIds: string[]; stacks?: string[] }> = {
  // 五大方向（大类）
  '前端开发':       { lineIds: ['frontend'] },
  '后端开发':       { lineIds: ['backend', 'general'] },
  '测试开发':       { lineIds: ['qa'] },
  '数据分析':       { lineIds: ['data-analyst', 'data', 'bigdata'] },
  '机器学习工程师': { lineIds: ['algorithm', 'ai', 'data'] },
  // 前端三细分
  'Vue 前端工程师':    { lineIds: ['frontend'], stacks: ['Vue'] },
  'React 前端工程师':  { lineIds: ['frontend'], stacks: ['React'] },
  '可视化工程师':      { lineIds: ['frontend'], stacks: ['可视化'] },
  // 后端三细分
  'Java 后端工程师':   { lineIds: ['backend', 'general'], stacks: ['Java'] },
  'Go 后端工程师':     { lineIds: ['backend', 'general'], stacks: ['Go'] },
  'Python 后端工程师': { lineIds: ['backend', 'general'], stacks: ['Python'] },
  // 测试三细分
  '测试开发工程师': { lineIds: ['qa'], stacks: ['Selenium'] },
  '质量平台工程师':   { lineIds: ['qa'], stacks: ['质量平台'] },
  '性能测试工程师':   { lineIds: ['qa'], stacks: ['性能测试'] },
  // 数据三细分
  '商业数据分析师': { lineIds: ['data-analyst'], stacks: ['商业分析'] },
  '数据开发工程师': { lineIds: ['data-analyst', 'bigdata'], stacks: ['数据开发'] },
  '增长分析师':     { lineIds: ['data-analyst'], stacks: ['增长分析'] },
  // ML 三细分
  '算法工程师':         { lineIds: ['algorithm'] },
  'AI 应用工程师':      { lineIds: ['ai'], stacks: ['LLM应用'] },
  '大模型工程师':   { lineIds: ['ai'], stacks: ['LLM应用', 'Agent'] },
}

/* ═══ 岗位相关课程 ID 集合（基于 skillTags ∩ keySkills 匹配） ═══ */
const roleCourseIds = computed<Set<string>>(() => {
  if (!fromRole.value) return new Set()
  const roleSkills = new Set<string>()

  // 1. 优先：命中 ROLE_LINE_MAP（覆盖 CAREER_DOMAINS 所有职业名）
  const lineFilter = ROLE_LINE_MAP[fromRole.value]
  if (lineFilter) {
    JOB_PORTRAITS.filter(j => {
      if (!lineFilter.lineIds.includes(j.lineId)) return false
      if (lineFilter.stacks && lineFilter.stacks.length > 0) {
        return lineFilter.stacks.some(s => j.stack?.includes(s))
      }
      return true
    }).forEach(j => j.keySkills.forEach(s => roleSkills.add(s)))
  } else {
    // 2. 兜底：按 title 精确匹配，再按 lineId 聚合；否则按名称模糊匹配
    const exactMatch = JOB_PORTRAITS.find(j => j.title === fromRole.value)
    const lineId = exactMatch?.lineId
    if (lineId) {
      JOB_PORTRAITS.filter(j => j.lineId === lineId).forEach(j =>
        j.keySkills.forEach(s => roleSkills.add(s)),
      )
    } else {
      JOB_PORTRAITS.filter(j =>
        j.title.includes(fromRole.value) || fromRole.value.includes(j.title),
      ).forEach(j => j.keySkills.forEach(s => roleSkills.add(s)))
    }
  }

  if (roleSkills.size === 0) return new Set()
  // 3. 遍历所有课程，skillTags 与 roleSkills 有交集则命中
  const courseIds = new Set<string>()
  for (const c of courseStore.courses) {
    if (c.skillTags?.some(tag => roleSkills.has(tag))) {
      courseIds.add(c.id)
    }
  }
  return courseIds
})

/* ═══ 课程过滤 ═══ */
const filteredCourses = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  const catId = selectedCategory.value
  return courseStore.courses.filter(c => {
    const catOk = catId === 'all' || c.categoryId === catId
    const kOk = !k || c.title.toLowerCase().includes(k) || c.description.toLowerCase().includes(k)
    return catOk && kOk
  }).sort((a, b) => {
    // 有 role 时：岗位相关课程前置
    const aH = roleCourseIds.value.has(a.id) ? 1 : 0
    const bH = roleCourseIds.value.has(b.id) ? 1 : 0
    return bH - aH
  })
})

const pagedCourses = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredCourses.value.slice(start, start + PAGE_SIZE)
})

/* ═══ 分类列表 ═══ */
const categories = computed<TreemapCategory[]>(() =>
  courseStore.categories.map(c => ({ id: c.id, name: c.name }))
)

/* ═══ 学习进度 ═══ */
function getCourseProgress(courseId: string): number {
  const userId = userStore.currentUser?.id ?? ''
  if (!userId) return 0
  const records = courseStore.getUserProgress(userId, courseId)
  if (!records.length) return 0
  return Math.max(...records.map(r => r.progress ?? 0))
}

function toggleFavorite(courseId: string, e: Event) {
  e.stopPropagation()
  const isFav = courseStore.isCourseFavorite(courseId)
  courseStore.toggleFavorite(courseId)
  ElMessage({ message: isFav ? '已取消收藏' : '已添加收藏', type: 'success', duration: 1500 })
}

function viewCourse(course: Course) {
  if (course.externalUrl) {
    ElMessageBox.confirm(
      `即将前往外部平台学习「${course.title}」`,
      '前往学习',
      {
        confirmButtonText: '前往',
        cancelButtonText: '取消',
        type: 'info',
      },
    ).then(() => {
      const userId = userStore.currentUser?.id ?? ''
      if (userId) {
        learningStore.addLearningRecord({
          userId,
          courseId: course.id,
          courseName: course.title,
          courseType: 'programming',
          difficulty: 'intermediate',
          studyTime: 1,
          completedAt: new Date().toISOString(),
          progress: 0,
        } as Omit<LearningRecord, 'id'>)
      }
      window.open(course.externalUrl, '_blank', 'noopener,noreferrer')
    }).catch(() => { /* 用户取消 */ })
  } else {
    ElMessage({ message: '该课程暂无外部学习链接', type: 'warning', duration: 2000 })
  }
}

function viewCourseById(id: string) {
  const course = courseStore.courses.find(c => c.id === id)
  if (course) {
    viewCourse(course)
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
}

/* ═══ D3 Treemap 数据 ═══ */
const treemapCategories = computed<TreemapCategory[]>(() => categories.value)

const treemapCourses = computed<TreemapCourse[]>(() =>
  courseStore.courses.map(c => ({
    id: c.id,
    title: c.title,
    categoryId: c.categoryId,
    totalDuration: c.totalDuration || 1,
    isHighlighted: roleCourseIds.value.has(c.id),
  }))
)

/* ═══ D3 弦图数据（技能亲和力 — 基于岗位 keySkills 共现） ═══ */

const SKILL_NORM: Record<string, string> = {
  'Vue 3': 'Vue', 'Vue 基础': 'Vue', 'Vue3/React': 'Vue', 'Vue 3 / React': 'Vue',
  'React 18 Hooks': 'React', 'React Router 6': 'React',
  'TypeScript 强类型': 'TypeScript',
  'Python 3': 'Python', 'Python/PyTorch': 'Python', 'Python/Java': 'Python',
  'Go 语言基础': 'Go', 'Go 语言特性（goroutine/channel）': 'Go',
  'Gin/Echo 框架': 'Go', 'Gin/Fiber 框架': 'Go',
  'Docker 基础': 'Docker', 'Docker 容器化': 'Docker', 'Docker/K8s 部署': 'Docker',
  'Docker 容器化（Dockerfile/Compose）': 'Docker',
  'Spring Boot 2/3': 'Spring Boot', 'Spring Cloud Alibaba': 'Spring Cloud',
  'Spring Cloud 微服务': 'Spring Cloud',
  'MySQL/Redis': 'MySQL', 'MySQL 事务与索引': 'MySQL', 'MySQL/PostgreSQL': 'MySQL',
  'Redis 基础': 'Redis', 'Redis 缓存': 'Redis',
  'Linux 基础': 'Linux', 'Linux 系统编程': 'Linux', 'Linux/Shell': 'Linux',
  'Linux 运维': 'Linux', 'Linux 系统管理（CentOS/Ubuntu）': 'Linux', 'Git/Linux': 'Linux',
  'SQL 数据校验': 'SQL', 'SQL 数据查询': 'SQL', 'SQL 进阶（窗口函数/子查询）': 'SQL',
  'CI/CD': 'CI/CD', 'CI 集成触发': 'CI/CD', 'CI 安全卡点': 'CI/CD', 'CI/CD 基础': 'CI/CD',
  'Kafka/RocketMQ': 'Kafka', 'Kafka 消息队列（aiokafka）': 'Kafka',
  'Kafka 消费与生产': 'Kafka', 'Kafka/RabbitMQ': 'Kafka',
  '深度学习': '深度学习/PyTorch', 'TensorFlow/PyTorch': '深度学习/PyTorch', 'PyTorch': '深度学习/PyTorch',
  '机器学习': '机器学习', 'Sklearn 机器学习': '机器学习',
  'Transformers/BERT': 'NLP/LLM', 'Hugging Face': 'NLP/LLM',
  'Hugging Face Transformers': 'NLP/LLM', 'BERT/RoBERTa 微调': 'NLP/LLM',
  'LangChain/LlamaIndex': 'NLP/LLM', 'OpenAI/通义/智谱 API 调用': 'NLP/LLM',
  'RAG 系统架构': 'NLP/LLM', '向量检索（Chroma/Pinecone）': 'NLP/LLM',
  '向量数据库（Milvus/Weaviate）': 'NLP/LLM', '向量数据库（Milvus）': 'NLP/LLM',
  '知识库系统架构': 'NLP/LLM',
  'Spark Core/SQL/DataFrame': 'Spark', 'Spark MLlib 基础': 'Spark',
  'Flink DataStream API': 'Flink', 'Flink SQL/Table API': 'Flink', '实时特征（Flink）': 'Flink',
  'Hive SQL': 'Hive', 'Hive/Presto/Spark SQL': 'Hive',
  'Prometheus/Grafana 基础': 'Prometheus/Grafana', 'Prometheus + Grafana 监控体系': 'Prometheus/Grafana',
  'FastAPI/异步框架': 'FastAPI', 'FastAPI 异步高并发': 'FastAPI', 'FastAPI 接口封装': 'FastAPI',
  'Django/Flask': 'Django/Flask', 'Django/Flask/FastAPI': 'Django/Flask',
  'Playwright E2E': 'Playwright', 'Selenium 自动化': 'Selenium',
  'Postman 接口测试': 'Postman', 'Postman': 'Postman',
  'JMeter 压测脚本': 'JMeter',
  'MyBatis-Plus': 'MyBatis', 'MyBatis/JPA': 'MyBatis',
  'Kubernetes 基础（Pod/Service/Ingress）': 'Kubernetes', 'Kubernetes 部署': 'Kubernetes',
  'Kubernetes/Docker Compose': 'Kubernetes', 'Kubernetes 部署与调优': 'Kubernetes',
  'Node.js 核心模块': 'Node.js',
  'Java SE 核心': 'Java',
  'Shell/Python 脚本': 'Linux', 'Shell 脚本': 'Linux',
  'Jenkins/GitLab CI 流水线': 'CI/CD',
  'REST API': 'REST API', 'RESTful API': 'REST API',
  'Ansible/SaltStack 配置管理': 'Ansible',
  'Ansible 自动化': 'Ansible',
  'BI 可视化': 'BI/可视化', 'D3.js': 'BI/可视化', '数据可视化': 'BI/可视化', 'ECharts': 'BI/可视化',
  'Tableau/PowerBI 基础': 'BI/可视化', 'Tableau/PowerBI': 'BI/可视化',
}

function normSkill(s: string): string {
  return SKILL_NORM[s] ?? s
}

const chordResult = computed(() => {
  const tagFreq = new Map<string, number>()
  const portraitData: { skills: string[]; title: string }[] = []

  for (const jp of JOB_PORTRAITS) {
    const normalized = [...new Set(jp.keySkills.map(normSkill))]
    portraitData.push({ skills: normalized, title: jp.title })
    for (const s of normalized) {
      tagFreq.set(s, (tagFreq.get(s) ?? 0) + 1)
    }
  }

  const hotTags = [...tagFreq.entries()]
    .filter(([, freq]) => freq >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag]) => tag)

  const tagSet = new Set(hotTags)
  const n = hotTags.length
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0) as number[])
  const pairPortraits = new Map<string, string[]>()

  for (const { skills, title } of portraitData) {
    const filtered = skills.filter(s => tagSet.has(s))
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const si = hotTags.indexOf(filtered[i]!)
        const sj = hotTags.indexOf(filtered[j]!)
        if (si >= 0 && sj >= 0) {
          matrix[si]![sj]! += 1
          matrix[sj]![si]! += 1
          const key = si < sj ? `${si}-${sj}` : `${sj}-${si}`
          const arr = pairPortraits.get(key) ?? []
          if (!arr.includes(title)) arr.push(title)
          pairPortraits.set(key, arr)
        }
      }
    }
  }

  return { nodes: hotTags, matrix, pairCourses: pairPortraits }
})
</script>
<template>
  <div class="lc-page">
    <!-- ═══ 页头 ═══ -->
    <header class="lc-header">
      <div class="lc-header__left">
        <span class="lc-badge">学</span>
        <div class="lc-header__titles">
          <h1 class="lc-title">学习中心</h1>
          <p class="lc-subtitle">课程发现 · 技能成长</p>
        </div>
        <div v-if="fromRole && !httpCourses" class="lc-role-chip">
          <Icon icon="lucide:briefcase" :width="12" />
          <span>{{ fromRole }}</span>
          <button class="lc-role-chip__close" @click="clearRole" title="清除方向">
            <Icon icon="lucide:x" :width="10" />
          </button>
        </div>
      </div>
      <div v-if="!httpCourses" class="lc-header__right">
        <span class="lc-count">共 {{ filteredCourses.length }} 门课程</span>
        <div class="lc-search-wrap">
          <Icon icon="lucide:search" :width="13" class="lc-search-icon" />
          <input
            v-model="keyword"
            class="lc-search"
            placeholder="搜索课程名称..."
            @input="page = 1"
          />
        </div>
        <button v-if="fromRole" class="lc-back-btn" @click="goBackToGraph">
          <Icon icon="lucide:map" :width="13" />
          <span>返回图谱</span>
        </button>
        <button v-if="hasArtifactQuery" class="lc-back-btn" @click="backToAgent">
          <Icon icon="lucide:arrow-left" :width="13" />
          <span>{{ explorationPlan ? '返回方向探索' : '返回对话' }}</span>
        </button>
      </div>
    </header>

    <section v-if="hasArtifactQuery && !artifactReady" class="lc-agent-state" role="status">
      <Icon :icon="handoff.loading.value ? 'lucide:loader-circle' : 'lucide:circle-alert'" :width="22" />
      <strong>{{ handoff.loading.value ? '正在读取对话计划' : '暂时无法打开这份计划' }}</strong>
      <p v-if="!handoff.loading.value">{{ handoff.error.value || '成果物类型与学习计划不匹配。' }}</p>
      <button type="button" @click="browseOrdinaryLearning">浏览普通学习中心</button>
    </section>

    <section v-if="artifactReady" class="lc-agent-plan" :aria-label="explorationPlan ? '方向尝试计划' : '对话学习计划'">
      <div class="lc-agent-plan__head">
        <div><span>{{ explorationPlan ? '来自本轮方向探索' : '来自 Agent 对话' }} · {{ handoff.source.value === 'http' ? '已保存计划' : '演示计划' }}</span><h2>{{ handoff.artifact.value?.title }}</h2><p>{{ handoff.artifact.value?.summary }}</p></div>
        <strong v-if="planItems.length">{{ completedPlanCount }} / {{ planItems.length }} 已完成<span v-if="planStatusLabel"> · {{ planStatusLabel }}</span></strong>
      </div>
      <p v-if="planSourceStatus === 'expired'" class="lc-agent-plan__source-warning" role="status">来源版本已变化；这份计划保留为历史记录，已勾选进度仍会保留。</p>
      <p v-else-if="planSourceStatus === 'unavailable'" class="lc-agent-plan__source-warning" role="status">暂时无法核对计划来源；计划和已有进度仍保存在这里。</p>
      <div v-if="planBody" class="lc-agent-plan__body" v-html="renderMarkdown(planBody)" />
      <p v-if="savedPlanResourceUri" class="lc-agent-plan__evidence-note">
        每一步的勾选只记录行动进度；练习成果是你的自述材料，不会自动进入简历、能力画像或匹配评分。
      </p>
      <div v-if="!planBody" class="lc-agent-plan__items">
        <div v-for="item in planItems" :key="item.id" class="lc-agent-plan__item" :class="{ 'lc-agent-plan__item--done': item.done }">
          <button type="button" class="lc-agent-plan__check" :disabled="updatingStepId === item.id" :aria-label="item.done ? `取消完成 ${item.title}` : `完成 ${item.title}`" @click="togglePlanItem(item.id)"><Icon :icon="item.done ? 'lucide:check-circle-2' : 'lucide:circle'" :width="19" /></button>
          <div class="lc-agent-plan__item-main">
            <h3>{{ item.title }}</h3><p>{{ item.detail }}</p>
            <div v-if="stepEvidence(item.id)" class="lc-agent-plan__practice-record">
              <span>练习记录 · 学生自述（未核验）</span>
              <p>{{ stepEvidence(item.id)?.summary }}</p>
              <small v-if="stepEvidence(item.id)?.attachment">
                {{ stepEvidence(item.id)?.attachment?.filename || '附件' }} · {{ attachmentStatusLabel(stepEvidence(item.id)?.attachment?.read_status) }}
              </small>
            </div>
            <div v-if="savedPlanResourceUri && evidenceEditorStepId === item.id" class="lc-agent-plan__evidence-editor">
              <label :for="`practice-summary-${item.id}`">这一步你做了什么？遇到什么结果或卡点？</label>
              <textarea :id="`practice-summary-${item.id}`" v-model="evidenceDrafts[item.id]" maxlength="2000" rows="3" placeholder="写下你实际完成的练习、观察到的结果，以及还不确定的地方。" />
              <input :id="`practice-file-${item.id}`" type="file" accept=".txt,.md,.csv,.pdf,.doc,.docx" :disabled="evidenceUploadStepId === item.id" @change="chooseEvidenceFile(item.id, $event)" />
              <span v-if="evidenceFileForStep(item.id)" class="lc-agent-plan__file-state">
                {{ evidenceFileForStep(item.id)?.name }} · {{ evidenceFileForStep(item.id)?.status === 'ready' ? '已上传' : '已上传，等待解析' }}
              </span>
              <div class="lc-agent-plan__evidence-actions">
                <button type="button" :disabled="!evidenceDrafts[item.id]?.trim() || evidenceBusyStepId === item.id || evidenceUploadStepId === item.id" @click="submitPracticeEvidence(item.id)">
                  {{ evidenceBusyStepId === item.id ? '正在保存…' : '保存练习记录' }}
                </button>
                <button type="button" :disabled="evidenceBusyStepId === item.id || evidenceUploadStepId === item.id" @click="cancelEvidenceEditor(item.id)">取消</button>
              </div>
            </div>
          </div>
          <button v-if="handoff.source.value === 'mock'" type="button" class="lc-agent-plan__course" @click="findPlanCourse(item)">找相关课程 <Icon icon="lucide:arrow-right" :width="12" /></button>
          <button v-if="savedPlanResourceUri && evidenceEditorStepId !== item.id" type="button" class="lc-agent-plan__evidence-button" @click="openEvidenceEditor(item)">
            {{ stepEvidence(item.id) ? '修改记录' : '记录成果' }}
          </button>
        </div>
      </div>
      <button v-if="explorationPlan" type="button" class="lc-agent-plan__ordinary" @click="backToAgent">回到这次方向探索，复盘练习与感受 <Icon icon="lucide:arrow-up-right" :width="13" /></button>
      <button v-else-if="savedPlanResourceUri" type="button" class="lc-agent-plan__ordinary" @click="discussSavedPlan">回到原对话，复盘练习记录与报告差距 <Icon icon="lucide:arrow-up-right" :width="13" /></button>
      <button type="button" class="lc-agent-plan__ordinary" @click="browseOrdinaryLearning">退出计划，浏览全部课程</button>
    </section>

    <!-- ═══ 分类筛选栏 ═══ -->
    <HttpCourseLibrary v-if="httpCourses && !hasArtifactQuery" />
    <nav v-if="!httpCourses && (!hasArtifactQuery || artifactReady)" class="lc-filters">
      <button
        class="lc-filter-btn"
        :class="{ 'lc-filter-btn--active': selectedCategory === 'all' }"
        @click="selectCategory('all')"
      >全部</button>
      <button
        v-for="cat in categories"
        :key="cat.id"
        class="lc-filter-btn"
        :class="{ 'lc-filter-btn--active': selectedCategory === cat.id }"
        @click="selectCategory(cat.id)"
      >{{ cat.name }}</button>
    </nav>

    <!-- ═══ D3 可视化区 ═══ -->
    <section v-if="!httpCourses && (!hasArtifactQuery || artifactReady)" class="lc-viz card-base">
      <div class="lc-viz__treemap">
        <div class="lc-viz__panel-head">
          <span class="lc-viz__panel-title">课程结构分布</span>
          <span class="lc-viz__panel-desc">面积 = 课程总时长，点击分类可筛选</span>
        </div>
        <div class="lc-viz__chart-wrap lc-viz__chart-wrap--treemap">
          <D3Treemap
            :categories="treemapCategories"
            :courses="treemapCourses"
            @select-category="selectCategory"
            @select-course="viewCourseById($event)"
          />
        </div>
      </div>
      <div class="lc-viz__chord">
        <div class="lc-viz__panel-head">
          <span class="lc-viz__panel-title">技能亲和力弦图</span>
          <span class="lc-viz__panel-desc">岗位所需技能共现关系，ribbon 越宽说明技能越常被同一岗位需要</span>
        </div>
        <div class="lc-viz__chart-wrap lc-viz__chart-wrap--chord">
          <D3ChordDiagram
            :nodes="chordResult.nodes"
            :matrix="chordResult.matrix"
            :pair-courses="chordResult.pairCourses"
          />
        </div>
      </div>
    </section>

    <!-- ═══ 课程 Grid ═══ -->
    <section v-if="!httpCourses && (!hasArtifactQuery || artifactReady)" class="lc-courses">
      <div v-if="fromRole" class="lc-role-banner">
        <Icon icon="lucide:zap" :width="14" />
        <span>已为岗位「{{ fromRole }}」推荐相关课程，金色边框为推荐课程</span>
      </div>

      <div v-if="filteredCourses.length === 0" class="lc-empty">
        <Icon icon="lucide:inbox" :width="32" />
        <p>暂无课程</p>
        <button class="lc-link-btn" @click="keyword = ''; selectCategory('all')">清除筛选</button>
      </div>

      <div v-else class="lc-grid">
        <div
          v-for="course in pagedCourses"
          :key="course.id"
          class="lc-card card-base is-interactive"
          :class="{ 'lc-card--highlighted': roleCourseIds.has(course.id) }"
          @click="viewCourse(course)"
        >
          <div class="lc-card__img-wrap">
            <img :src="course.cover" :alt="course.title" class="lc-card__img" loading="lazy" />
            <div class="lc-card__overlay">
              <span class="lc-card__start-btn">
                <template v-if="course.externalUrl">
                  <Icon icon="lucide:external-link" :width="12" style="margin-right:3px"/>前往 B 站学习
                </template>
                <template v-else>
                  开始学习
                </template>
              </span>
            </div>
            <button
              class="lc-card__fav"
              :class="{ 'lc-card__fav--active': courseStore.isCourseFavorite(course.id) }"
              @click="toggleFavorite(course.id, $event)"
            >
              <Icon icon="lucide:star" :width="13" />
            </button>
            <span v-if="roleCourseIds.has(course.id)" class="lc-card__rec-badge">推荐</span>
          </div>

          <div class="lc-card__body">
            <div class="lc-card__cat-row">
              <span class="lc-card__cat">{{ courseStore.categories.find(c => c.id === course.categoryId)?.name ?? course.categoryId }}</span>
            </div>
            <h3 class="lc-card__title">{{ course.title }}</h3>
            <p class="lc-card__desc">{{ course.description }}</p>
            <div class="lc-card__meta">
              <span class="lc-card__meta-item">
                <Icon icon="lucide:clock" :width="11" />
                {{ formatDuration(course.totalDuration) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <el-pagination
        v-if="filteredCourses.length > PAGE_SIZE"
        v-model:current-page="page"
        :page-size="PAGE_SIZE"
        :total="filteredCourses.length"
        layout="prev, pager, next"
        background
        class="lc-pagination"
      />
    </section>
  </div>
</template>

<style scoped>
.lc-agent-state, .lc-agent-plan { border: 1px solid var(--color-border, #e5ddd3); border-radius: 16px; background: var(--color-surface, #fff); }
.lc-agent-state { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 28px; }
.lc-agent-state p { margin: 0; color: var(--color-text-muted, #766f68); }
.lc-agent-state button, .lc-agent-plan__ordinary { border: 0; background: transparent; color: var(--primary-100, #8b2500); cursor: pointer; padding: 4px 0; }
.lc-agent-plan { padding: 22px; }
.lc-agent-plan__head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.lc-agent-plan__head span { color: var(--primary-100, #8b2500); font-size: 12px; }
.lc-agent-plan__head h2 { margin: 6px 0; font-size: 21px; }
.lc-agent-plan__head p { margin: 0; color: var(--color-text-muted, #766f68); line-height: 1.6; }
.lc-agent-plan__head strong { flex: none; font-size: 13px; font-weight: 600; color: var(--primary-100, #8b2500); }
.lc-agent-plan__source-warning { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: #fff6e8; color: #805316; font-size: 12px; line-height: 1.55; }
.lc-agent-plan__evidence-note { margin: 14px 0 -8px; color: var(--color-text-muted, #766f68); font-size: 12px; line-height: 1.6; }
.lc-agent-plan__body { margin: 20px 0 12px; line-height: 1.8; overflow-wrap: anywhere; color: var(--color-text, #312b26); }
.lc-agent-plan__body :deep(.md-p) { margin: 0 0 12px; }
.lc-agent-plan__body :deep(.md-ol), .lc-agent-plan__body :deep(.md-ul) { margin: 0 0 12px; padding-left: 22px; }
.lc-agent-plan__body :deep(.md-li) { margin-bottom: 8px; }
.lc-agent-plan__items { display: grid; gap: 8px; margin: 20px 0 12px; }
.lc-agent-plan__item { display: flex; align-items: flex-start; gap: 12px; padding: 12px; border: 1px solid var(--color-border, #e5ddd3); border-radius: 11px; }
.lc-agent-plan__item-main { flex: 1; min-width: 0; }
.lc-agent-plan__item--done { opacity: .62; }
.lc-agent-plan__item h3 { margin: 0 0 4px; font-size: 14px; }
.lc-agent-plan__item p { margin: 0; color: var(--color-text-muted, #766f68); font-size: 12px; line-height: 1.55; }
.lc-agent-plan__check, .lc-agent-plan__course { display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; color: var(--primary-100, #8b2500); cursor: pointer; }
.lc-agent-plan__check { flex: none; padding: 4px; }
.lc-agent-plan__course { gap: 4px; margin-left: auto; white-space: nowrap; font-size: 12px; }
.lc-agent-plan__evidence-button, .lc-agent-plan__evidence-actions button { border: 1px solid var(--color-border, #e5ddd3); border-radius: 8px; background: #fff; color: var(--primary-100, #8b2500); cursor: pointer; font: inherit; font-size: 12px; padding: 7px 10px; }
.lc-agent-plan__practice-record { margin-top: 10px; padding: 10px 12px; border-radius: 9px; background: #f7f2ed; }
.lc-agent-plan__practice-record span { color: #80604e; font-size: 11px; font-weight: 600; }
.lc-agent-plan__practice-record p { margin-top: 5px; color: var(--color-text, #312b26); white-space: pre-wrap; }
.lc-agent-plan__practice-record small, .lc-agent-plan__file-state { display: block; margin-top: 6px; color: var(--color-text-muted, #766f68); font-size: 11px; }
.lc-agent-plan__evidence-editor { display: grid; gap: 8px; margin-top: 12px; }
.lc-agent-plan__evidence-editor label { color: var(--color-text, #312b26); font-size: 12px; font-weight: 600; }
.lc-agent-plan__evidence-editor textarea { width: 100%; box-sizing: border-box; resize: vertical; border: 1px solid var(--color-border, #e5ddd3); border-radius: 8px; padding: 9px; font: inherit; font-size: 13px; line-height: 1.55; }
.lc-agent-plan__evidence-editor input[type=file] { max-width: 100%; color: var(--color-text-muted, #766f68); font-size: 11px; }
.lc-agent-plan__evidence-actions { display: flex; gap: 8px; }
.lc-agent-plan__evidence-actions button:disabled { opacity: .45; cursor: not-allowed; }
.lc-agent-plan__ordinary { font-size: 12px; }
@media (max-width: 720px) { .lc-agent-plan__head, .lc-agent-plan__item { align-items: flex-start; } .lc-agent-plan__head { flex-direction: column; } .lc-agent-plan__course { align-self: center; } }
/* ═══ 根容器 ═══ */
.lc-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  min-height: 100%;
  background: var(--color-background);
}

/* ═══ 页头 ═══ */
.lc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 18px;
  background: var(--card-bg, #fff);
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: var(--radius-md, 10px);
}

.lc-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.lc-header__right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.lc-badge {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--color-primary-dark), var(--color-gold));
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  border-radius: var(--radius-sm, 6px);
  flex-shrink: 0;
}

.lc-header__titles { display: flex; flex-direction: column; gap: 1px; }
.lc-title { font-size: 16px; font-weight: 600; color: var(--color-text, #1a1a1a); margin: 0; }
.lc-subtitle { font-size: 11px; color: var(--color-text-muted, #718096); margin: 0; }

.lc-role-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px 4px 10px;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent 92%);
  border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent 75%);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary-dark);
}

.lc-role-chip__close {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-primary) 15%, transparent 85%);
  border: none;
  cursor: pointer;
  color: var(--color-primary-dark);
  padding: 0;
}

.lc-count {
  font-size: 12px;
  color: var(--color-text-muted, #718096);
  white-space: nowrap;
}

.lc-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.lc-search-icon {
  position: absolute;
  left: 8px;
  color: var(--color-text-subtle, #a0aec0);
  pointer-events: none;
}

.lc-search {
  padding: 6px 10px 6px 28px;
  font-size: 12px;
  width: 180px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background: var(--color-surface, #f8fafc);
  color: var(--color-text, #1a1a1a);
  outline: none;
  transition: border-color 0.3s;
}

.lc-search:focus {
  border-color: var(--color-primary, #4f46e5);
}

.lc-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  font-size: 12px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: all 0.3s;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent 92%);
  border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent 75%);
  color: var(--color-primary-dark);
  font-weight: 500;
}

.lc-back-btn:hover {
  background: color-mix(in srgb, var(--color-primary) 15%, transparent 85%);
}

.lc-back-btn--secondary {
  background: var(--color-surface, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  color: var(--color-text-muted, #718096);
}

.lc-back-btn--secondary:hover {
  border-color: var(--color-primary, #4f46e5);
  color: var(--color-primary, #4f46e5);
  background: var(--color-primary-light, #ede9fe);
}

/* ═══ 分类筛选栏 ═══ */
.lc-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: var(--card-bg, #fff);
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: var(--radius-md, 10px);
}

.lc-filter-btn {
  padding: 5px 12px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--color-border, #e2e8f0);
  background: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-muted, #718096);
  transition: all 0.3s;
}

.lc-filter-btn:hover {
  border-color: var(--color-primary-dark);
  color: var(--color-primary-dark);
}

.lc-filter-btn--active {
  border-color: var(--color-primary-dark);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent 92%);
  color: var(--color-primary-dark);
  font-weight: 600;
}

/* ═══ D3 可视化区 ═══ */
.lc-viz {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 0;
  padding: 0;
  border-radius: var(--radius-md, 10px);
  overflow: visible;
}

.lc-viz__treemap {
  padding: 14px 16px;
  border-right: 1px solid var(--card-border, #e2e8f0);
}

.lc-viz__chord {
  padding: 14px 16px;
}

.lc-viz__panel-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}

.lc-viz__panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1a1a1a);
}

.lc-viz__panel-desc {
  font-size: 11px;
  color: var(--color-text-subtle, #a0aec0);
}

.lc-viz__chart-wrap {
  width: 100%;
}

.lc-viz__chart-wrap--treemap {
  height: 400px;
}

.lc-viz__chart-wrap--chord {
  height: 400px;
}

/* ═══ 课程网格 ═══ */
.lc-courses {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lc-role-banner {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  background: rgba(184,134,11,0.08);
  border: 1px solid rgba(184,134,11,0.25);
  border-radius: var(--radius-sm, 6px);
  font-size: 12px;
  color: #7A5C0A;
}

.lc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 20px;
  color: var(--color-text-subtle, #a0aec0);
  font-size: 13px;
}

.lc-link-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-primary, #4f46e5);
  font-size: 12px;
  text-decoration: underline;
}

.lc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

/* ═══ 课程卡片 ═══ */
.lc-card {
  display: flex;
  flex-direction: column;
  cursor: pointer;
  overflow: hidden;
  border-radius: var(--radius-md, 10px);
  transition: transform 0.3s, box-shadow 0.3s;
}

.lc-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.10);
}

.lc-card--highlighted {
  border: 2px solid var(--color-gold) !important;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-gold) 30%, transparent 70%);
}

.lc-card__img-wrap {
  position: relative;
  overflow: hidden;
  height: 140px;
  flex-shrink: 0;
}

.lc-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s;
}

.lc-card:hover .lc-card__img {
  transform: scale(1.04);
}

.lc-card__overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s;
}

.lc-card:hover .lc-card__overlay {
  opacity: 1;
}

.lc-card__start-btn {
  padding: 7px 18px;
  background: rgba(255,255,255,0.95);
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
}

.lc-card__fav {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255,255,255,0.9);
  border: none;
  cursor: pointer;
  display: grid;
  place-items: center;
  color: var(--color-text-subtle, #a0aec0);
  transition: color 0.3s, background 0.3s;
}

.lc-card__fav--active {
  color: var(--color-gold);
  background: color-mix(in srgb, var(--color-gold) 15%, transparent 85%);
}

.lc-card__rec-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 7px;
  background: var(--color-gold);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  border-radius: 999px;
}

.lc-card__body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.lc-card__cat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.lc-card__cat {
  font-size: 10px;
  color: var(--color-primary, #4f46e5);
  font-weight: 600;
  background: var(--color-primary-light, #ede9fe);
  padding: 2px 7px;
  border-radius: 999px;
}

.lc-card__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1a1a1a);
  margin: 0;
  line-height: 1.3;
}

.lc-card__desc {
  font-size: 11px;
  color: var(--color-text-muted, #718096);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.lc-card__meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.lc-card__meta-item {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--color-text-subtle, #a0aec0);
}

/* ═══ 分页 ═══ */
.lc-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

/* ═══ 响应式 ═══ */
@media (max-width: 768px) {
  .lc-viz {
    grid-template-columns: 1fr;
  }
  .lc-viz__treemap {
    border-right: none;
    border-bottom: 1px solid var(--card-border, #e2e8f0);
  }
  .lc-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
  .lc-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .lc-header__right {
    width: 100%;
  }
  .lc-search {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .lc-grid {
    grid-template-columns: 1fr;
  }
}
</style>
