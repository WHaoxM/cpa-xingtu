/**
 * 课程体系分层网络关系图 — 数据提供者 & D3 布局支持
 * 5 大领域 × 15 细分职业的全量技能分层网络
 */
import { CAREER_DOMAINS } from '@/composables/useCareerInsights'

/* ═══ 类型定义 ═══ */

export type SkillTier = 'foundation' | 'junior' | 'mid' | 'senior' | 'job'

export interface CourseNode {
  id: string
  name: string
  tier: SkillTier
  heat: number
  category?: string
  /** 关联的职业节点 ID 列表，如 'job-frontend-0' */
  relatedCareers?: string[]
  /** 所属主领域 id：'frontend'|'backend'|'qa'|'data'|'ml' */
  domainId?: string
}

export interface CourseEdge {
  source: string
  target: string
  relation: 'prerequisite' | 'support' | 'compose'
  /** 是否属于当前职业主成长路径 */
  isCareerPath?: boolean
}

/** 课程体系节点 */
export interface GraphCourseNode {
  id: string
  title: string
  group: CourseGroup
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  relatedSkillIds: string[]
  importance: 'core' | 'recommended' | 'optional'
}

export type CourseGroup = 'foundation-course' | 'framework-course' | 'engineering-course' | 'backend-course' | 'architecture-course'

export const COURSE_GROUP_LABELS: Record<CourseGroup, string> = {
  'foundation-course': '基础课程',
  'framework-course': '框架课程',
  'engineering-course': '工程化课程',
  'backend-course': '后端协同课程',
  'architecture-course': '架构进阶课程',
}

/** 技能-课程关联边 */
export interface SkillCourseEdge {
  skillId: string
  courseId: string
  relation: 'core' | 'recommended' | 'advanced'
}

export interface CourseSystemData {
  nodes: CourseNode[]
  edges: CourseEdge[]
  courseNodes: GraphCourseNode[]
  skillCourseEdges: SkillCourseEdge[]
}

/** 右侧面板条目（保留兼容） */
export interface SkillEntry {
  id: string
  name: string
  type: 'skill' | 'problem'
  icon: string
}

/** @deprecated 3D 布局已废弃，保留空类型防止编译错误 */
export interface Layer3DLayout { tier: SkillTier; yLevel: number; xHalf: number; zHalf: number }
/** @deprecated */
export interface Node3DPos { x: number; y: number; z: number }

/* ═══ 层级配置 ═══ */

export const TIER_ORDER: SkillTier[] = ['foundation', 'junior', 'mid', 'senior', 'job']

export const TIER_LABELS: Record<SkillTier, string> = {
  foundation: '专业技能',
  junior: '初阶岗位技能',
  mid: '中阶岗位技能',
  senior: '高阶岗位技能',
  job: '岗位',
}

/** 现代分层配色 */
export const TIER_COLORS: Record<SkillTier, string> = {
  foundation: '#64748B',
  junior:     '#0EA5E9',
  mid:        '#8B5CF6',
  senior:     '#F59E0B',
  job:        '#EF4444',
}

export const TIER_GLOW: Record<SkillTier, string> = {
  foundation: 'rgba(100,116,139,0.18)',
  junior:     'rgba(14,165,233,0.20)',
  mid:        'rgba(139,92,246,0.20)',
  senior:     'rgba(245,158,11,0.22)',
  job:        'rgba(239,68,68,0.22)',
}

export const COURSE_GROUP_COLORS: Record<CourseGroup, string> = {
  'foundation-course': '#A0937D',
  'framework-course':  '#C4956A',
  'engineering-course': '#7A9B76',
  'backend-course':    '#6B8FAD',
  'architecture-course': '#9B6B5A',
}

/* ═══ Mock 数据（5 大领域 × 15 细分职业全量技能分层网络） ═══ */

/** 所有前端职业 ID */
const FE_ALL = ['job-frontend-0', 'job-frontend-1', 'job-frontend-2']
/** 所有后端职业 ID */
const BE_ALL = ['job-backend-0', 'job-backend-1', 'job-backend-2']
/** 所有测试职业 ID */
const QA_ALL = ['job-qa-0', 'job-qa-1', 'job-qa-2']
/** 所有数据职业 ID */
const DA_ALL = ['job-data-0', 'job-data-1', 'job-data-2']
/** 所有 ML 职业 ID */
const ML_ALL = ['job-ml-0', 'job-ml-1', 'job-ml-2']
/** 所有职业 ID */
const ALL_JOBS = [...FE_ALL, ...BE_ALL, ...QA_ALL, ...DA_ALL, ...ML_ALL]

function buildMockData(_role: string): CourseSystemData {

  // ── 顶层：15 个岗位（自动从 CAREER_DOMAINS 生成）──
  const jobNodes: CourseNode[] = CAREER_DOMAINS.flatMap((domain, _di) =>
    domain.jobs.map((jobName, ji) => ({
      id: `job-${domain.id}-${ji}`,
      name: jobName,
      tier: 'job' as SkillTier,
      heat: 100,
      category: domain.name,
      domainId: domain.id,
      relatedCareers: [`job-${domain.id}-${ji}`],
    })),
  )

  const nodes: CourseNode[] = [
    ...jobNodes,

    // ── 高阶岗位技能（跨领域架构与决策能力）──
    { id: 'sr-1',  name: '前端系统架构',     tier: 'senior', heat: 95, category: '前端架构',  domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'sr-2',  name: '分布式系统设计',   tier: 'senior', heat: 93, category: '后端架构',  domainId: 'backend',  relatedCareers: BE_ALL },
    { id: 'sr-3',  name: '高可用架构设计',   tier: 'senior', heat: 91, category: '架构',      domainId: 'backend',  relatedCareers: [...BE_ALL, ...FE_ALL] },
    { id: 'sr-4',  name: '性能优化体系',     tier: 'senior', heat: 90, category: '工程',      domainId: 'frontend', relatedCareers: [...FE_ALL, ...BE_ALL, ...QA_ALL] },
    { id: 'sr-5',  name: 'DevOps 体系设计',  tier: 'senior', heat: 88, category: '运维',      domainId: 'backend',  relatedCareers: [...BE_ALL, ...QA_ALL] },
    { id: 'sr-6',  name: '数据平台架构',     tier: 'senior', heat: 87, category: '数据',      domainId: 'data',     relatedCareers: [...DA_ALL, 'job-ml-0'] },
    { id: 'sr-7',  name: '安全架构设计',     tier: 'senior', heat: 86, category: '安全',      domainId: 'backend',  relatedCareers: [...BE_ALL, ...FE_ALL] },
    { id: 'sr-8',  name: '技术方案评审',     tier: 'senior', heat: 85, category: '管理',      domainId: 'backend',  relatedCareers: ALL_JOBS },
    { id: 'sr-9',  name: '微前端架构',       tier: 'senior', heat: 84, category: '前端架构',  domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'sr-10', name: '团队技术管理',     tier: 'senior', heat: 83, category: '管理',      domainId: 'backend',  relatedCareers: ALL_JOBS },
    { id: 'sr-11', name: '跨端技术方案',     tier: 'senior', heat: 82, category: '前端架构',  domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'sr-12', name: '云原生架构',       tier: 'senior', heat: 81, category: '运维',      domainId: 'backend',  relatedCareers: BE_ALL },
    { id: 'sr-13', name: '推荐系统架构',     tier: 'senior', heat: 89, category: 'ML架构',    domainId: 'ml',       relatedCareers: ['job-ml-0', 'job-ml-1'] },
    { id: 'sr-14', name: '大模型工程',       tier: 'senior', heat: 92, category: 'ML架构',    domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'sr-15', name: 'NLP 系统设计',     tier: 'senior', heat: 86, category: 'ML架构',    domainId: 'ml',       relatedCareers: ['job-ml-0'] },
    { id: 'sr-16', name: '数据治理体系',     tier: 'senior', heat: 85, category: '数据架构',  domainId: 'data',     relatedCareers: DA_ALL },
    { id: 'sr-17', name: '指标体系设计',     tier: 'senior', heat: 84, category: '数据架构',  domainId: 'data',     relatedCareers: ['job-data-0', 'job-data-2'] },
    { id: 'sr-18', name: '数据产品架构',     tier: 'senior', heat: 83, category: '数据架构',  domainId: 'data',     relatedCareers: DA_ALL },
    { id: 'sr-19', name: '质量架构设计',     tier: 'senior', heat: 84, category: '测试架构',  domainId: 'qa',       relatedCareers: QA_ALL },
    { id: 'sr-20', name: '全链路压测体系',   tier: 'senior', heat: 82, category: '测试架构',  domainId: 'qa',       relatedCareers: ['job-qa-0', 'job-qa-2'] },
    { id: 'sr-21', name: '测试基础设施',     tier: 'senior', heat: 81, category: '测试架构',  domainId: 'qa',       relatedCareers: ['job-qa-1', 'job-qa-0'] },
    { id: 'sr-22', name: '后端架构演进',     tier: 'senior', heat: 88, category: '后端架构',  domainId: 'backend',  relatedCareers: BE_ALL },
    { id: 'sr-23', name: '存储架构设计',     tier: 'senior', heat: 85, category: '后端架构',  domainId: 'backend',  relatedCareers: [...BE_ALL, 'job-data-1'] },
    { id: 'sr-24', name: '计算机视觉架构',   tier: 'senior', heat: 87, category: 'ML架构',    domainId: 'ml',       relatedCareers: ['job-ml-1'] },
    { id: 'sr-25', name: '实时数据架构',     tier: 'senior', heat: 84, category: '数据架构',  domainId: 'data',     relatedCareers: ['job-data-1', 'job-data-2'] },
    { id: 'sr-26', name: 'Agent 架构设计',   tier: 'senior', heat: 90, category: 'ML架构',    domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'sr-27', name: '大模型评估体系',   tier: 'senior', heat: 86, category: 'ML架构',    domainId: 'ml',       relatedCareers: ML_ALL },

    // ── 中阶岗位技能（模块级能力，多岗位通用）──
    { id: 'md-1',  name: '前端工程化',         tier: 'mid', heat: 82, category: '前端',   domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'md-2',  name: '组件库设计开发',     tier: 'mid', heat: 81, category: '前端',   domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'md-3',  name: 'SSR / SSG 方案',     tier: 'mid', heat: 80, category: '前端',   domainId: 'frontend', relatedCareers: ['job-frontend-0', 'job-frontend-1'] },
    { id: 'md-4',  name: '状态管理方案设计',   tier: 'mid', heat: 79, category: '前端',   domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'md-5',  name: '后端 API 设计',      tier: 'mid', heat: 82, category: '后端',   domainId: 'backend',  relatedCareers: BE_ALL },
    { id: 'md-6',  name: '数据库设计优化',     tier: 'mid', heat: 80, category: '后端',   domainId: 'backend',  relatedCareers: [...BE_ALL, 'job-data-1'] },
    { id: 'md-7',  name: '微服务拆分治理',     tier: 'mid', heat: 79, category: '后端',   domainId: 'backend',  relatedCareers: BE_ALL },
    { id: 'md-8',  name: '消息队列应用',       tier: 'mid', heat: 77, category: '后端',   domainId: 'backend',  relatedCareers: [...BE_ALL, 'job-data-1'] },
    { id: 'md-9',  name: 'CI/CD 流程搭建',     tier: 'mid', heat: 80, category: '运维',   domainId: 'backend',  relatedCareers: [...BE_ALL, ...QA_ALL] },
    { id: 'md-10', name: '容器化部署管理',     tier: 'mid', heat: 78, category: '运维',   domainId: 'backend',  relatedCareers: [...BE_ALL, ...QA_ALL] },
    { id: 'md-11', name: '监控告警体系',       tier: 'mid', heat: 77, category: '运维',   domainId: 'backend',  relatedCareers: [...BE_ALL, ...QA_ALL] },
    { id: 'md-12', name: '数据管道开发',       tier: 'mid', heat: 76, category: '数据',   domainId: 'data',     relatedCareers: [...DA_ALL, 'job-ml-0'] },
    { id: 'md-13', name: '前端安全防护',       tier: 'mid', heat: 78, category: '安全',   domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'md-14', name: '测试开发体系',     tier: 'mid', heat: 76, category: '测试',   domainId: 'qa',       relatedCareers: QA_ALL },
    { id: 'md-15', name: '可视化方案设计',     tier: 'mid', heat: 75, category: '前端',   domainId: 'frontend', relatedCareers: ['job-frontend-2', 'job-data-0'] },
    { id: 'md-16', name: '国际化 & 无障碍',    tier: 'mid', heat: 72, category: '前端',   domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'md-17', name: 'Spring Cloud 微服务', tier: 'mid', heat: 80, category: '后端',   domainId: 'backend',  relatedCareers: ['job-backend-0'] },
    { id: 'md-18', name: 'Go 并发编程',        tier: 'mid', heat: 78, category: '后端',   domainId: 'backend',  relatedCareers: ['job-backend-1'] },
    { id: 'md-19', name: '模型训练与调优',     tier: 'mid', heat: 82, category: 'ML',     domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'md-20', name: '特征平台建设',       tier: 'mid', heat: 78, category: 'ML',     domainId: 'ml',       relatedCareers: ['job-ml-0', 'job-ml-1'] },
    { id: 'md-21', name: '模型部署上线',       tier: 'mid', heat: 80, category: 'ML',     domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'md-22', name: '深度学习框架应用',   tier: 'mid', heat: 81, category: 'ML',     domainId: 'ml',       relatedCareers: ['job-ml-0'] },
    { id: 'md-23', name: '数仓设计建模',       tier: 'mid', heat: 79, category: '数据',   domainId: 'data',     relatedCareers: ['job-data-1', 'job-data-0'] },
    { id: 'md-24', name: '实时计算方案',       tier: 'mid', heat: 77, category: '数据',   domainId: 'data',     relatedCareers: ['job-data-1', 'job-data-2'] },
    { id: 'md-25', name: 'BI 可视化平台',      tier: 'mid', heat: 76, category: '数据',   domainId: 'data',     relatedCareers: ['job-data-0', 'job-data-2'] },
    { id: 'md-26', name: '数据质量管理',       tier: 'mid', heat: 74, category: '数据',   domainId: 'data',     relatedCareers: DA_ALL },
    { id: 'md-27', name: '测试平台搭建',       tier: 'mid', heat: 77, category: '测试',   domainId: 'qa',       relatedCareers: ['job-qa-1', 'job-qa-0'] },
    { id: 'md-28', name: '性能压测方案',       tier: 'mid', heat: 76, category: '测试',   domainId: 'qa',       relatedCareers: ['job-qa-2', 'job-qa-0'] },
    { id: 'md-29', name: '混沌工程实践',       tier: 'mid', heat: 73, category: '测试',   domainId: 'qa',       relatedCareers: QA_ALL },
    { id: 'md-30', name: '接口自动化框架',     tier: 'mid', heat: 78, category: '测试',   domainId: 'qa',       relatedCareers: ['job-qa-0', 'job-qa-1'] },
    { id: 'md-31', name: '缓存方案设计',       tier: 'mid', heat: 78, category: '后端',   domainId: 'backend',  relatedCareers: BE_ALL },
    { id: 'md-32', name: '搜索引擎应用',       tier: 'mid', heat: 74, category: '后端',   domainId: 'backend',  relatedCareers: ['job-backend-0', 'job-backend-2'] },
    { id: 'md-33', name: 'NLP 应用开发',       tier: 'mid', heat: 79, category: 'ML',     domainId: 'ml',       relatedCareers: ['job-ml-0', 'job-ml-1'] },
    { id: 'md-34', name: '增长实验平台',       tier: 'mid', heat: 75, category: '数据',   domainId: 'data',     relatedCareers: ['job-data-2', 'job-data-0'] },
    { id: 'md-35', name: '全栈测试覆盖',       tier: 'mid', heat: 74, category: '测试',   domainId: 'qa',       relatedCareers: QA_ALL },
    { id: 'md-36', name: 'LangGraph 多Agent协作', tier: 'mid', heat: 82, category: 'ML',     domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'md-37', name: 'GraphRAG 实现',        tier: 'mid', heat: 80, category: 'ML',     domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'md-38', name: 'LoRA 微调实践',        tier: 'mid', heat: 78, category: 'ML',     domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'md-39', name: 'MCP 协议应用',         tier: 'mid', heat: 76, category: 'ML',     domainId: 'ml',       relatedCareers: ML_ALL },

    // ── 初阶岗位技能（执行开发能力，写代码）──
    { id: 'jr-1',  name: 'Vue / React 开发',    tier: 'junior', heat: 80, category: '前端',  domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'jr-2',  name: 'TypeScript 应用',     tier: 'junior', heat: 79, category: '前端',  domainId: 'frontend', relatedCareers: [...FE_ALL, ...BE_ALL] },
    { id: 'jr-3',  name: 'CSS 布局与动画',      tier: 'junior', heat: 76, category: '前端',  domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'jr-4',  name: '响应式 & 移动端',     tier: 'junior', heat: 74, category: '前端',  domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'jr-5',  name: 'Webpack / Vite',      tier: 'junior', heat: 75, category: '前端',  domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'jr-6',  name: 'Node.js 开发',        tier: 'junior', heat: 77, category: '后端',  domainId: 'backend',  relatedCareers: [...FE_ALL, ...BE_ALL] },
    { id: 'jr-7',  name: 'REST & GraphQL',      tier: 'junior', heat: 76, category: '后端',  domainId: 'backend',  relatedCareers: [...BE_ALL, ...FE_ALL] },
    { id: 'jr-8',  name: 'SQL 查询优化',        tier: 'junior', heat: 74, category: '后端',  domainId: 'backend',  relatedCareers: [...BE_ALL, ...DA_ALL] },
    { id: 'jr-9',  name: 'Python 脚本开发',     tier: 'junior', heat: 72, category: '后端',  domainId: 'backend',  relatedCareers: ['job-backend-2', ...DA_ALL, ...ML_ALL] },
    { id: 'jr-10', name: 'Git 版本管理',        tier: 'junior', heat: 80, category: '工具',  domainId: 'backend',  relatedCareers: ALL_JOBS },
    { id: 'jr-11', name: 'Linux 基础操作',      tier: 'junior', heat: 74, category: '运维',  domainId: 'backend',  relatedCareers: [...BE_ALL, ...QA_ALL, ...ML_ALL] },
    { id: 'jr-12', name: 'Docker 基础',         tier: 'junior', heat: 73, category: '运维',  domainId: 'backend',  relatedCareers: [...BE_ALL, ...QA_ALL] },
    { id: 'jr-13', name: '单元测试编写',        tier: 'junior', heat: 72, category: '测试',  domainId: 'qa',       relatedCareers: [...QA_ALL, ...FE_ALL, ...BE_ALL] },
    { id: 'jr-14', name: 'HTTP 调试 & 抓包',    tier: 'junior', heat: 71, category: '调试',  domainId: 'backend',  relatedCareers: [...BE_ALL, ...FE_ALL, ...QA_ALL] },
    { id: 'jr-15', name: '浏览器开发者工具',    tier: 'junior', heat: 75, category: '调试',  domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'jr-16', name: '接口联调协作',        tier: 'junior', heat: 70, category: '协作',  domainId: 'backend',  relatedCareers: [...BE_ALL, ...FE_ALL] },
    { id: 'jr-17', name: '代码规范遵循',        tier: 'junior', heat: 72, category: '规范',  domainId: 'backend',  relatedCareers: ALL_JOBS },
    { id: 'jr-18', name: '日志分析排查',        tier: 'junior', heat: 68, category: '调试',  domainId: 'backend',  relatedCareers: [...BE_ALL, ...QA_ALL] },
    { id: 'jr-19', name: 'Shell 脚本基础',      tier: 'junior', heat: 66, category: '运维',  domainId: 'backend',  relatedCareers: [...BE_ALL, ...QA_ALL] },
    { id: 'jr-20', name: '基础性能优化',        tier: 'junior', heat: 70, category: '性能',  domainId: 'frontend', relatedCareers: [...FE_ALL, ...BE_ALL] },
    { id: 'jr-21', name: 'Spring Boot 开发',    tier: 'junior', heat: 78, category: '后端',  domainId: 'backend',  relatedCareers: ['job-backend-0'] },
    { id: 'jr-22', name: 'Go Web 开发',         tier: 'junior', heat: 76, category: '后端',  domainId: 'backend',  relatedCareers: ['job-backend-1'] },
    { id: 'jr-23', name: 'PyTorch 基础应用',    tier: 'junior', heat: 75, category: 'ML',    domainId: 'ml',       relatedCareers: ['job-ml-0'] },
    { id: 'jr-24', name: '数据采集清洗',        tier: 'junior', heat: 73, category: '数据',  domainId: 'data',     relatedCareers: DA_ALL },
    { id: 'jr-25', name: 'SQL 分析查询',        tier: 'junior', heat: 76, category: '数据',  domainId: 'data',     relatedCareers: [...DA_ALL, ...BE_ALL] },
    { id: 'jr-26', name: 'BI 工具使用',         tier: 'junior', heat: 72, category: '数据',  domainId: 'data',     relatedCareers: ['job-data-0', 'job-data-2'] },
    { id: 'jr-27', name: 'Selenium 自动化',     tier: 'junior', heat: 74, category: '测试',  domainId: 'qa',       relatedCareers: ['job-qa-0'] },
    { id: 'jr-28', name: '测试用例设计',        tier: 'junior', heat: 75, category: '测试',  domainId: 'qa',       relatedCareers: QA_ALL },
    { id: 'jr-29', name: '缺陷管理协作',        tier: 'junior', heat: 70, category: '测试',  domainId: 'qa',       relatedCareers: QA_ALL },
    { id: 'jr-30', name: 'TensorFlow 入门',     tier: 'junior', heat: 73, category: 'ML',    domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'jr-31', name: '数据标注与预处理',    tier: 'junior', heat: 71, category: 'ML',    domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'jr-32', name: 'Redis 基础',          tier: 'junior', heat: 74, category: '后端',  domainId: 'backend',  relatedCareers: BE_ALL },
    { id: 'jr-33', name: 'Kafka 基础',          tier: 'junior', heat: 72, category: '后端',  domainId: 'backend',  relatedCareers: [...BE_ALL, 'job-data-1'] },
    { id: 'jr-34', name: '统计分析实践',        tier: 'junior', heat: 72, category: '数据',  domainId: 'data',     relatedCareers: [...DA_ALL, ...ML_ALL] },
    { id: 'jr-35', name: 'A/B 实验基础',        tier: 'junior', heat: 70, category: '数据',  domainId: 'data',     relatedCareers: ['job-data-2', 'job-data-0'] },
    { id: 'jr-36', name: 'JMeter 压测',         tier: 'junior', heat: 71, category: '测试',  domainId: 'qa',       relatedCareers: ['job-qa-2', 'job-qa-0'] },
    { id: 'jr-37', name: 'Postman 接口测试',    tier: 'junior', heat: 73, category: '测试',  domainId: 'qa',       relatedCareers: QA_ALL },
    { id: 'jr-38', name: '模型评估方法',        tier: 'junior', heat: 74, category: 'ML',    domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'jr-39', name: 'Pandas 数据处理',     tier: 'junior', heat: 75, category: '数据',  domainId: 'data',     relatedCareers: [...DA_ALL, ...ML_ALL] },
    { id: 'jr-40', name: 'Vue 组件开发',        tier: 'junior', heat: 77, category: '前端',  domainId: 'frontend', relatedCareers: ['job-frontend-0'] },
    { id: 'jr-41', name: 'React Hooks 开发',    tier: 'junior', heat: 76, category: '前端',  domainId: 'frontend', relatedCareers: ['job-frontend-1'] },
    { id: 'jr-42', name: 'D3 可视化开发',       tier: 'junior', heat: 74, category: '前端',  domainId: 'frontend', relatedCareers: ['job-frontend-2'] },
    { id: 'jr-43', name: 'LangChain 应用开发',  tier: 'junior', heat: 80, category: 'ML',    domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'jr-44', name: 'FastAPI 接口开发',    tier: 'junior', heat: 76, category: '后端',  domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'jr-45', name: 'RAG 基础实践',        tier: 'junior', heat: 78, category: 'ML',    domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'jr-46', name: 'Ollama 本地部署',     tier: 'junior', heat: 70, category: 'ML',    domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'jr-47', name: 'Docker 容器化部署',   tier: 'junior', heat: 74, category: '运维',  domainId: 'ml',       relatedCareers: ML_ALL },

    // ── 专业技能底层（基础知识与原理）──
    { id: 'fn-1',  name: 'HTML 语义化',         tier: 'foundation', heat: 72, category: 'Web基础',  domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'fn-2',  name: 'CSS 基础',            tier: 'foundation', heat: 71, category: 'Web基础',  domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'fn-3',  name: 'JavaScript 核心',     tier: 'foundation', heat: 85, category: '编程语言', domainId: 'frontend', relatedCareers: [...FE_ALL, ...BE_ALL] },
    { id: 'fn-4',  name: 'ES6+ 语法特性',       tier: 'foundation', heat: 80, category: '编程语言', domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'fn-5',  name: 'Python 基础',         tier: 'foundation', heat: 74, category: '编程语言', domainId: 'backend',  relatedCareers: ['job-backend-2', ...DA_ALL, ...ML_ALL] },
    { id: 'fn-6',  name: 'Java / Go 基础',      tier: 'foundation', heat: 68, category: '编程语言', domainId: 'backend',  relatedCareers: ['job-backend-0', 'job-backend-1'] },
    { id: 'fn-7',  name: '数据结构',            tier: 'foundation', heat: 88, category: 'CS核心',   domainId: 'backend',  relatedCareers: ALL_JOBS },
    { id: 'fn-8',  name: '算法与复杂度',        tier: 'foundation', heat: 87, category: 'CS核心',   domainId: 'backend',  relatedCareers: ALL_JOBS },
    { id: 'fn-9',  name: '计算机网络',          tier: 'foundation', heat: 82, category: 'CS核心',   domainId: 'backend',  relatedCareers: [...BE_ALL, ...FE_ALL, ...QA_ALL] },
    { id: 'fn-10', name: '操作系统原理',        tier: 'foundation', heat: 80, category: 'CS核心',   domainId: 'backend',  relatedCareers: [...BE_ALL, ...QA_ALL, ...ML_ALL] },
    { id: 'fn-11', name: '数据库原理',          tier: 'foundation', heat: 78, category: 'CS核心',   domainId: 'backend',  relatedCareers: [...BE_ALL, ...DA_ALL] },
    { id: 'fn-12', name: '计算机组成原理',      tier: 'foundation', heat: 70, category: 'CS核心',   domainId: 'backend',  relatedCareers: [...BE_ALL, ...ML_ALL] },
    { id: 'fn-13', name: '编译原理基础',        tier: 'foundation', heat: 65, category: 'CS核心',   domainId: 'backend',  relatedCareers: BE_ALL },
    { id: 'fn-14', name: '离散数学',            tier: 'foundation', heat: 63, category: '数学',     domainId: 'backend',  relatedCareers: [...BE_ALL, ...ML_ALL] },
    { id: 'fn-15', name: '线性代数',            tier: 'foundation', heat: 62, category: '数学',     domainId: 'ml',       relatedCareers: [...ML_ALL, ...DA_ALL] },
    { id: 'fn-16', name: '概率与统计',          tier: 'foundation', heat: 61, category: '数学',     domainId: 'ml',       relatedCareers: [...ML_ALL, ...DA_ALL] },
    { id: 'fn-17', name: 'TCP/IP 协议栈',       tier: 'foundation', heat: 76, category: '网络',     domainId: 'backend',  relatedCareers: [...BE_ALL, ...QA_ALL] },
    { id: 'fn-18', name: 'HTTP / HTTPS',        tier: 'foundation', heat: 78, category: '网络',     domainId: 'backend',  relatedCareers: [...BE_ALL, ...FE_ALL, ...QA_ALL] },
    { id: 'fn-19', name: '浏览器工作原理',      tier: 'foundation', heat: 77, category: '浏览器',   domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'fn-20', name: '设计模式',            tier: 'foundation', heat: 75, category: '软件工程', domainId: 'backend',  relatedCareers: [...BE_ALL, ...FE_ALL] },
    { id: 'fn-21', name: '面向对象编程',        tier: 'foundation', heat: 76, category: '编程范式', domainId: 'backend',  relatedCareers: [...BE_ALL, ...FE_ALL] },
    { id: 'fn-22', name: '函数式编程',          tier: 'foundation', heat: 68, category: '编程范式', domainId: 'frontend', relatedCareers: FE_ALL },
    { id: 'fn-23', name: '软件工程导论',        tier: 'foundation', heat: 66, category: '软件工程', domainId: 'backend',  relatedCareers: ALL_JOBS },
    { id: 'fn-24', name: 'Web 安全基础',        tier: 'foundation', heat: 72, category: '安全',     domainId: 'backend',  relatedCareers: [...BE_ALL, ...FE_ALL] },
    { id: 'fn-25', name: '版本控制概念',        tier: 'foundation', heat: 70, category: '工具',     domainId: 'backend',  relatedCareers: ALL_JOBS },
    { id: 'fn-26', name: '深度学习原理',        tier: 'foundation', heat: 78, category: 'ML基础',   domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'fn-27', name: '机器学习基础',        tier: 'foundation', heat: 80, category: 'ML基础',   domainId: 'ml',       relatedCareers: [...ML_ALL, 'job-data-0'] },
    { id: 'fn-28', name: 'PyTorch / TF 基础',   tier: 'foundation', heat: 76, category: 'ML基础',   domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'fn-29', name: '统计建模基础',        tier: 'foundation', heat: 72, category: '数据基础', domainId: 'data',     relatedCareers: [...DA_ALL, ...ML_ALL] },
    { id: 'fn-30', name: 'SQL 基础',            tier: 'foundation', heat: 75, category: '数据基础', domainId: 'data',     relatedCareers: [...DA_ALL, ...BE_ALL] },
    { id: 'fn-31', name: '测试理论基础',        tier: 'foundation', heat: 70, category: '测试基础', domainId: 'qa',       relatedCareers: QA_ALL },
    { id: 'fn-32', name: '质量体系概论',        tier: 'foundation', heat: 66, category: '测试基础', domainId: 'qa',       relatedCareers: QA_ALL },
    { id: 'fn-33', name: '信息检索原理',        tier: 'foundation', heat: 64, category: 'CS核心',   domainId: 'ml',       relatedCareers: ['job-ml-0', 'job-ml-1'] },
    { id: 'fn-34', name: '分布式计算原理',      tier: 'foundation', heat: 72, category: 'CS核心',   domainId: 'backend',  relatedCareers: [...BE_ALL, 'job-data-1'] },
    { id: 'fn-35', name: '自然语言处理基础',    tier: 'foundation', heat: 74, category: 'ML基础',   domainId: 'ml',       relatedCareers: ['job-ml-0', 'job-ml-1'] },
    { id: 'fn-36', name: 'Prompt Engineering 基础', tier: 'foundation', heat: 78, category: 'ML基础',   domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'fn-37', name: '向量检索原理',        tier: 'foundation', heat: 72, category: 'ML基础',   domainId: 'ml',       relatedCareers: ML_ALL },
    { id: 'fn-38', name: '图数据库基础',        tier: 'foundation', heat: 68, category: '数据基础', domainId: 'ml',       relatedCareers: ML_ALL },
  ]

  // ── 边数据 ──
  const rawEdges: Omit<CourseEdge, 'isCareerPath'>[] = [
    // ── job ← senior（按领域分组）──
    // 前端
    { source: 'sr-1',  target: 'job-frontend-0', relation: 'compose' },
    { source: 'sr-1',  target: 'job-frontend-1', relation: 'compose' },
    { source: 'sr-1',  target: 'job-frontend-2', relation: 'compose' },
    { source: 'sr-9',  target: 'job-frontend-0', relation: 'compose' },
    { source: 'sr-9',  target: 'job-frontend-1', relation: 'compose' },
    { source: 'sr-11', target: 'job-frontend-0', relation: 'compose' },
    { source: 'sr-11', target: 'job-frontend-1', relation: 'compose' },
    { source: 'sr-4',  target: 'job-frontend-0', relation: 'compose' },
    { source: 'sr-4',  target: 'job-frontend-1', relation: 'compose' },
    { source: 'sr-4',  target: 'job-frontend-2', relation: 'compose' },
    { source: 'sr-7',  target: 'job-frontend-0', relation: 'compose' },
    // 后端
    { source: 'sr-2',  target: 'job-backend-0',  relation: 'compose' },
    { source: 'sr-2',  target: 'job-backend-1',  relation: 'compose' },
    { source: 'sr-2',  target: 'job-backend-2',  relation: 'compose' },
    { source: 'sr-3',  target: 'job-backend-0',  relation: 'compose' },
    { source: 'sr-3',  target: 'job-backend-1',  relation: 'compose' },
    { source: 'sr-22', target: 'job-backend-0',  relation: 'compose' },
    { source: 'sr-22', target: 'job-backend-1',  relation: 'compose' },
    { source: 'sr-22', target: 'job-backend-2',  relation: 'compose' },
    { source: 'sr-23', target: 'job-backend-0',  relation: 'compose' },
    { source: 'sr-23', target: 'job-backend-1',  relation: 'compose' },
    { source: 'sr-12', target: 'job-backend-0',  relation: 'compose' },
    { source: 'sr-12', target: 'job-backend-1',  relation: 'compose' },
    { source: 'sr-5',  target: 'job-backend-0',  relation: 'compose' },
    // 测试
    { source: 'sr-19', target: 'job-qa-0',       relation: 'compose' },
    { source: 'sr-19', target: 'job-qa-1',       relation: 'compose' },
    { source: 'sr-19', target: 'job-qa-2',       relation: 'compose' },
    { source: 'sr-20', target: 'job-qa-2',       relation: 'compose' },
    { source: 'sr-20', target: 'job-qa-0',       relation: 'compose' },
    { source: 'sr-21', target: 'job-qa-1',       relation: 'compose' },
    { source: 'sr-21', target: 'job-qa-0',       relation: 'compose' },
    // 数据
    { source: 'sr-6',  target: 'job-data-0',     relation: 'compose' },
    { source: 'sr-6',  target: 'job-data-1',     relation: 'compose' },
    { source: 'sr-16', target: 'job-data-0',     relation: 'compose' },
    { source: 'sr-16', target: 'job-data-1',     relation: 'compose' },
    { source: 'sr-16', target: 'job-data-2',     relation: 'compose' },
    { source: 'sr-17', target: 'job-data-0',     relation: 'compose' },
    { source: 'sr-17', target: 'job-data-2',     relation: 'compose' },
    { source: 'sr-18', target: 'job-data-0',     relation: 'compose' },
    { source: 'sr-18', target: 'job-data-1',     relation: 'compose' },
    { source: 'sr-25', target: 'job-data-1',     relation: 'compose' },
    { source: 'sr-25', target: 'job-data-2',     relation: 'compose' },
    // ML
    { source: 'sr-13', target: 'job-ml-0',       relation: 'compose' },
    { source: 'sr-13', target: 'job-ml-1',       relation: 'compose' },
    { source: 'sr-14', target: 'job-ml-0',       relation: 'compose' },
    { source: 'sr-14', target: 'job-ml-1',       relation: 'compose' },
    { source: 'sr-15', target: 'job-ml-0',       relation: 'compose' },
    { source: 'sr-24', target: 'job-ml-1',       relation: 'compose' },
    { source: 'sr-14', target: 'job-ml-2',       relation: 'compose' },
    { source: 'sr-26', target: 'job-ml-2',       relation: 'compose' },
    { source: 'sr-27', target: 'job-ml-2',       relation: 'compose' },
    // 通用 senior → 多域 job
    { source: 'sr-8',  target: 'job-frontend-0', relation: 'compose' },
    { source: 'sr-8',  target: 'job-backend-0',  relation: 'compose' },
    { source: 'sr-10', target: 'job-backend-0',  relation: 'compose' },
    { source: 'sr-10', target: 'job-frontend-0', relation: 'compose' },

    // ── senior ← mid ──
    { source: 'md-1',  target: 'sr-1',  relation: 'support' },
    { source: 'md-2',  target: 'sr-1',  relation: 'support' },
    { source: 'md-3',  target: 'sr-1',  relation: 'support' },
    { source: 'md-4',  target: 'sr-1',  relation: 'support' },
    { source: 'md-5',  target: 'sr-2',  relation: 'support' },
    { source: 'md-6',  target: 'sr-2',  relation: 'support' },
    { source: 'md-7',  target: 'sr-2',  relation: 'support' },
    { source: 'md-8',  target: 'sr-2',  relation: 'support' },
    { source: 'md-3',  target: 'sr-3',  relation: 'support' },
    { source: 'md-5',  target: 'sr-3',  relation: 'support' },
    { source: 'md-7',  target: 'sr-3',  relation: 'support' },
    { source: 'md-1',  target: 'sr-4',  relation: 'support' },
    { source: 'md-6',  target: 'sr-4',  relation: 'support' },
    { source: 'md-9',  target: 'sr-5',  relation: 'support' },
    { source: 'md-10', target: 'sr-5',  relation: 'support' },
    { source: 'md-11', target: 'sr-5',  relation: 'support' },
    { source: 'md-12', target: 'sr-6',  relation: 'support' },
    { source: 'md-23', target: 'sr-6',  relation: 'support' },
    { source: 'md-13', target: 'sr-7',  relation: 'support' },
    { source: 'md-14', target: 'sr-8',  relation: 'support' },
    { source: 'md-2',  target: 'sr-9',  relation: 'support' },
    { source: 'md-4',  target: 'sr-9',  relation: 'support' },
    { source: 'md-15', target: 'sr-9',  relation: 'support' },
    { source: 'md-9',  target: 'sr-10', relation: 'support' },
    { source: 'md-14', target: 'sr-10', relation: 'support' },
    { source: 'md-1',  target: 'sr-11', relation: 'support' },
    { source: 'md-3',  target: 'sr-11', relation: 'support' },
    { source: 'md-10', target: 'sr-12', relation: 'support' },
    { source: 'md-19', target: 'sr-13', relation: 'support' },
    { source: 'md-20', target: 'sr-13', relation: 'support' },
    { source: 'md-22', target: 'sr-14', relation: 'support' },
    { source: 'md-21', target: 'sr-14', relation: 'support' },
    { source: 'md-33', target: 'sr-15', relation: 'support' },
    { source: 'md-22', target: 'sr-15', relation: 'support' },
    { source: 'md-26', target: 'sr-16', relation: 'support' },
    { source: 'md-23', target: 'sr-16', relation: 'support' },
    { source: 'md-25', target: 'sr-17', relation: 'support' },
    { source: 'md-34', target: 'sr-17', relation: 'support' },
    { source: 'md-25', target: 'sr-18', relation: 'support' },
    { source: 'md-12', target: 'sr-18', relation: 'support' },
    { source: 'md-27', target: 'sr-19', relation: 'support' },
    { source: 'md-30', target: 'sr-19', relation: 'support' },
    { source: 'md-35', target: 'sr-19', relation: 'support' },
    { source: 'md-28', target: 'sr-20', relation: 'support' },
    { source: 'md-29', target: 'sr-20', relation: 'support' },
    { source: 'md-27', target: 'sr-21', relation: 'support' },
    { source: 'md-14', target: 'sr-21', relation: 'support' },
    { source: 'md-17', target: 'sr-22', relation: 'support' },
    { source: 'md-18', target: 'sr-22', relation: 'support' },
    { source: 'md-7',  target: 'sr-22', relation: 'support' },
    { source: 'md-31', target: 'sr-23', relation: 'support' },
    { source: 'md-6',  target: 'sr-23', relation: 'support' },
    { source: 'md-22', target: 'sr-24', relation: 'support' },
    { source: 'md-19', target: 'sr-24', relation: 'support' },
    { source: 'md-24', target: 'sr-25', relation: 'support' },
    { source: 'md-12', target: 'sr-25', relation: 'support' },
    { source: 'md-36', target: 'sr-26', relation: 'support' },
    { source: 'md-37', target: 'sr-26', relation: 'support' },
    { source: 'md-38', target: 'sr-14', relation: 'support' },
    { source: 'md-39', target: 'sr-26', relation: 'support' },

    // ── mid ← junior ──
    { source: 'jr-1',  target: 'md-1',  relation: 'prerequisite' },
    { source: 'jr-2',  target: 'md-1',  relation: 'prerequisite' },
    { source: 'jr-5',  target: 'md-1',  relation: 'prerequisite' },
    { source: 'jr-1',  target: 'md-2',  relation: 'prerequisite' },
    { source: 'jr-2',  target: 'md-2',  relation: 'prerequisite' },
    { source: 'jr-40', target: 'md-2',  relation: 'prerequisite' },
    { source: 'jr-41', target: 'md-2',  relation: 'prerequisite' },
    { source: 'jr-1',  target: 'md-3',  relation: 'prerequisite' },
    { source: 'jr-6',  target: 'md-3',  relation: 'prerequisite' },
    { source: 'jr-1',  target: 'md-4',  relation: 'prerequisite' },
    { source: 'jr-2',  target: 'md-4',  relation: 'prerequisite' },
    { source: 'jr-6',  target: 'md-5',  relation: 'prerequisite' },
    { source: 'jr-7',  target: 'md-5',  relation: 'prerequisite' },
    { source: 'jr-8',  target: 'md-6',  relation: 'prerequisite' },
    { source: 'jr-25', target: 'md-6',  relation: 'prerequisite' },
    { source: 'jr-6',  target: 'md-7',  relation: 'prerequisite' },
    { source: 'jr-7',  target: 'md-7',  relation: 'prerequisite' },
    { source: 'jr-6',  target: 'md-8',  relation: 'prerequisite' },
    { source: 'jr-33', target: 'md-8',  relation: 'prerequisite' },
    { source: 'jr-10', target: 'md-9',  relation: 'prerequisite' },
    { source: 'jr-11', target: 'md-9',  relation: 'prerequisite' },
    { source: 'jr-12', target: 'md-10', relation: 'prerequisite' },
    { source: 'jr-11', target: 'md-10', relation: 'prerequisite' },
    { source: 'jr-14', target: 'md-11', relation: 'prerequisite' },
    { source: 'jr-18', target: 'md-11', relation: 'prerequisite' },
    { source: 'jr-9',  target: 'md-12', relation: 'prerequisite' },
    { source: 'jr-8',  target: 'md-12', relation: 'prerequisite' },
    { source: 'jr-39', target: 'md-12', relation: 'prerequisite' },
    { source: 'jr-14', target: 'md-13', relation: 'prerequisite' },
    { source: 'jr-13', target: 'md-14', relation: 'prerequisite' },
    { source: 'jr-28', target: 'md-14', relation: 'prerequisite' },
    { source: 'jr-1',  target: 'md-15', relation: 'prerequisite' },
    { source: 'jr-3',  target: 'md-15', relation: 'prerequisite' },
    { source: 'jr-42', target: 'md-15', relation: 'prerequisite' },
    { source: 'jr-3',  target: 'md-16', relation: 'prerequisite' },
    { source: 'jr-4',  target: 'md-16', relation: 'prerequisite' },
    { source: 'jr-21', target: 'md-17', relation: 'prerequisite' },
    { source: 'jr-7',  target: 'md-17', relation: 'prerequisite' },
    { source: 'jr-22', target: 'md-18', relation: 'prerequisite' },
    { source: 'jr-23', target: 'md-19', relation: 'prerequisite' },
    { source: 'jr-30', target: 'md-19', relation: 'prerequisite' },
    { source: 'jr-38', target: 'md-19', relation: 'prerequisite' },
    { source: 'jr-39', target: 'md-20', relation: 'prerequisite' },
    { source: 'jr-24', target: 'md-20', relation: 'prerequisite' },
    { source: 'jr-23', target: 'md-21', relation: 'prerequisite' },
    { source: 'jr-12', target: 'md-21', relation: 'prerequisite' },
    { source: 'jr-23', target: 'md-22', relation: 'prerequisite' },
    { source: 'jr-30', target: 'md-22', relation: 'prerequisite' },
    { source: 'jr-25', target: 'md-23', relation: 'prerequisite' },
    { source: 'jr-24', target: 'md-23', relation: 'prerequisite' },
    { source: 'jr-33', target: 'md-24', relation: 'prerequisite' },
    { source: 'jr-9',  target: 'md-24', relation: 'prerequisite' },
    { source: 'jr-26', target: 'md-25', relation: 'prerequisite' },
    { source: 'jr-39', target: 'md-25', relation: 'prerequisite' },
    { source: 'jr-24', target: 'md-26', relation: 'prerequisite' },
    { source: 'jr-25', target: 'md-26', relation: 'prerequisite' },
    { source: 'jr-27', target: 'md-27', relation: 'prerequisite' },
    { source: 'jr-28', target: 'md-27', relation: 'prerequisite' },
    { source: 'jr-36', target: 'md-28', relation: 'prerequisite' },
    { source: 'jr-37', target: 'md-28', relation: 'prerequisite' },
    { source: 'jr-12', target: 'md-29', relation: 'prerequisite' },
    { source: 'jr-11', target: 'md-29', relation: 'prerequisite' },
    { source: 'jr-37', target: 'md-30', relation: 'prerequisite' },
    { source: 'jr-27', target: 'md-30', relation: 'prerequisite' },
    { source: 'jr-32', target: 'md-31', relation: 'prerequisite' },
    { source: 'jr-8',  target: 'md-31', relation: 'prerequisite' },
    { source: 'jr-8',  target: 'md-32', relation: 'prerequisite' },
    { source: 'jr-9',  target: 'md-33', relation: 'prerequisite' },
    { source: 'jr-31', target: 'md-33', relation: 'prerequisite' },
    { source: 'jr-35', target: 'md-34', relation: 'prerequisite' },
    { source: 'jr-34', target: 'md-34', relation: 'prerequisite' },
    { source: 'jr-13', target: 'md-35', relation: 'prerequisite' },
    { source: 'jr-29', target: 'md-35', relation: 'prerequisite' },
    { source: 'jr-43', target: 'md-36', relation: 'prerequisite' },
    { source: 'jr-45', target: 'md-37', relation: 'prerequisite' },
    { source: 'jr-43', target: 'md-37', relation: 'prerequisite' },
    { source: 'jr-44', target: 'md-39', relation: 'prerequisite' },
    { source: 'jr-46', target: 'md-38', relation: 'prerequisite' },
    { source: 'jr-47', target: 'md-39', relation: 'prerequisite' },

    // ── junior ← foundation ──
    { source: 'fn-1',  target: 'jr-1',  relation: 'prerequisite' },
    { source: 'fn-2',  target: 'jr-1',  relation: 'prerequisite' },
    { source: 'fn-3',  target: 'jr-1',  relation: 'prerequisite' },
    { source: 'fn-4',  target: 'jr-2',  relation: 'prerequisite' },
    { source: 'fn-3',  target: 'jr-2',  relation: 'prerequisite' },
    { source: 'fn-2',  target: 'jr-3',  relation: 'prerequisite' },
    { source: 'fn-1',  target: 'jr-4',  relation: 'prerequisite' },
    { source: 'fn-2',  target: 'jr-4',  relation: 'prerequisite' },
    { source: 'fn-7',  target: 'jr-5',  relation: 'prerequisite' },
    { source: 'fn-3',  target: 'jr-6',  relation: 'prerequisite' },
    { source: 'fn-5',  target: 'jr-6',  relation: 'prerequisite' },
    { source: 'fn-18', target: 'jr-7',  relation: 'prerequisite' },
    { source: 'fn-9',  target: 'jr-7',  relation: 'prerequisite' },
    { source: 'fn-11', target: 'jr-8',  relation: 'prerequisite' },
    { source: 'fn-30', target: 'jr-8',  relation: 'prerequisite' },
    { source: 'fn-5',  target: 'jr-9',  relation: 'prerequisite' },
    { source: 'fn-25', target: 'jr-10', relation: 'prerequisite' },
    { source: 'fn-10', target: 'jr-11', relation: 'prerequisite' },
    { source: 'fn-10', target: 'jr-12', relation: 'prerequisite' },
    { source: 'fn-23', target: 'jr-13', relation: 'prerequisite' },
    { source: 'fn-17', target: 'jr-14', relation: 'prerequisite' },
    { source: 'fn-18', target: 'jr-14', relation: 'prerequisite' },
    { source: 'fn-19', target: 'jr-15', relation: 'prerequisite' },
    { source: 'fn-20', target: 'jr-17', relation: 'prerequisite' },
    { source: 'fn-18', target: 'jr-16', relation: 'prerequisite' },
    { source: 'fn-9',  target: 'jr-16', relation: 'prerequisite' },
    { source: 'fn-10', target: 'jr-18', relation: 'prerequisite' },
    { source: 'fn-17', target: 'jr-18', relation: 'prerequisite' },
    { source: 'fn-10', target: 'jr-19', relation: 'prerequisite' },
    { source: 'fn-7',  target: 'jr-20', relation: 'prerequisite' },
    { source: 'fn-8',  target: 'jr-20', relation: 'prerequisite' },
    { source: 'fn-24', target: 'jr-14', relation: 'prerequisite' },
    { source: 'fn-21', target: 'jr-1',  relation: 'prerequisite' },
    { source: 'fn-22', target: 'jr-2',  relation: 'prerequisite' },
    { source: 'fn-6',  target: 'jr-21', relation: 'prerequisite' },
    { source: 'fn-7',  target: 'jr-21', relation: 'prerequisite' },
    { source: 'fn-6',  target: 'jr-22', relation: 'prerequisite' },
    { source: 'fn-7',  target: 'jr-22', relation: 'prerequisite' },
    { source: 'fn-28', target: 'jr-23', relation: 'prerequisite' },
    { source: 'fn-27', target: 'jr-23', relation: 'prerequisite' },
    { source: 'fn-5',  target: 'jr-24', relation: 'prerequisite' },
    { source: 'fn-30', target: 'jr-24', relation: 'prerequisite' },
    { source: 'fn-30', target: 'jr-25', relation: 'prerequisite' },
    { source: 'fn-11', target: 'jr-25', relation: 'prerequisite' },
    { source: 'fn-29', target: 'jr-26', relation: 'prerequisite' },
    { source: 'fn-31', target: 'jr-27', relation: 'prerequisite' },
    { source: 'fn-18', target: 'jr-27', relation: 'prerequisite' },
    { source: 'fn-31', target: 'jr-28', relation: 'prerequisite' },
    { source: 'fn-32', target: 'jr-28', relation: 'prerequisite' },
    { source: 'fn-32', target: 'jr-29', relation: 'prerequisite' },
    { source: 'fn-28', target: 'jr-30', relation: 'prerequisite' },
    { source: 'fn-26', target: 'jr-30', relation: 'prerequisite' },
    { source: 'fn-5',  target: 'jr-31', relation: 'prerequisite' },
    { source: 'fn-27', target: 'jr-31', relation: 'prerequisite' },
    { source: 'fn-11', target: 'jr-32', relation: 'prerequisite' },
    { source: 'fn-34', target: 'jr-33', relation: 'prerequisite' },
    { source: 'fn-16', target: 'jr-34', relation: 'prerequisite' },
    { source: 'fn-29', target: 'jr-34', relation: 'prerequisite' },
    { source: 'fn-16', target: 'jr-35', relation: 'prerequisite' },
    { source: 'fn-29', target: 'jr-35', relation: 'prerequisite' },
    { source: 'fn-9',  target: 'jr-36', relation: 'prerequisite' },
    { source: 'fn-18', target: 'jr-37', relation: 'prerequisite' },
    { source: 'fn-16', target: 'jr-38', relation: 'prerequisite' },
    { source: 'fn-27', target: 'jr-38', relation: 'prerequisite' },
    { source: 'fn-5',  target: 'jr-39', relation: 'prerequisite' },
    { source: 'fn-16', target: 'jr-39', relation: 'prerequisite' },
    { source: 'fn-3',  target: 'jr-40', relation: 'prerequisite' },
    { source: 'fn-1',  target: 'jr-40', relation: 'prerequisite' },
    { source: 'fn-3',  target: 'jr-41', relation: 'prerequisite' },
    { source: 'fn-4',  target: 'jr-41', relation: 'prerequisite' },
    { source: 'fn-3',  target: 'jr-42', relation: 'prerequisite' },
    { source: 'fn-15', target: 'jr-42', relation: 'prerequisite' },
    { source: 'fn-36', target: 'jr-43', relation: 'prerequisite' },
    { source: 'fn-37', target: 'jr-45', relation: 'prerequisite' },
    { source: 'fn-38', target: 'jr-43', relation: 'prerequisite' },
    { source: 'fn-5',  target: 'jr-44', relation: 'prerequisite' },
    { source: 'fn-5',  target: 'jr-43', relation: 'prerequisite' },
    { source: 'fn-10', target: 'jr-47', relation: 'prerequisite' },

    // ── 跨层连线（基础 → 中阶）──
    { source: 'fn-7',  target: 'md-6',  relation: 'support' },
    { source: 'fn-8',  target: 'md-6',  relation: 'support' },
    { source: 'fn-9',  target: 'md-7',  relation: 'support' },
    { source: 'fn-17', target: 'md-13', relation: 'support' },
    { source: 'fn-24', target: 'md-13', relation: 'support' },
    { source: 'fn-15', target: 'md-19', relation: 'support' },
    { source: 'fn-26', target: 'md-22', relation: 'support' },
    { source: 'fn-34', target: 'md-24', relation: 'support' },
    { source: 'fn-35', target: 'md-33', relation: 'support' },
    { source: 'fn-35', target: 'md-36', relation: 'support' },
    { source: 'fn-33', target: 'md-37', relation: 'support' },
    { source: 'fn-26', target: 'md-38', relation: 'support' },
  ]

  // 动态标记 isCareerPath — 源/目标节点都关联同一个职业时标记
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const edges: CourseEdge[] = rawEdges.map(e => {
    const sn = nodeMap.get(e.source)
    const tn = nodeMap.get(e.target)
    const sc = sn?.relatedCareers ?? []
    const tc = tn?.relatedCareers ?? []
    const shared = sc.some(c => tc.includes(c))
    return { ...e, isCareerPath: shared }
  })

  // ── 课程体系节点（双体系并置 — 右侧课程区） ──
  const courseNodes: GraphCourseNode[] = [
    { id: 'gc-1',  title: '计算机导论',          group: 'foundation-course', difficulty: 'beginner',     relatedSkillIds: ['fn-7','fn-8','fn-10','fn-12'],     importance: 'core' },
    { id: 'gc-2',  title: 'Web 开发基础',        group: 'foundation-course', difficulty: 'beginner',     relatedSkillIds: ['fn-1','fn-2','fn-3','fn-18'],       importance: 'core' },
    { id: 'gc-3',  title: '数据结构与算法',      group: 'foundation-course', difficulty: 'intermediate', relatedSkillIds: ['fn-7','fn-8','fn-14'],              importance: 'core' },
    { id: 'gc-4',  title: '计算机网络',          group: 'foundation-course', difficulty: 'intermediate', relatedSkillIds: ['fn-9','fn-17','fn-18'],             importance: 'core' },
    { id: 'gc-5',  title: '编程语言原理',        group: 'foundation-course', difficulty: 'intermediate', relatedSkillIds: ['fn-3','fn-5','fn-6','fn-21','fn-22'], importance: 'recommended' },
    { id: 'gc-6',  title: 'Vue 3 实战开发',      group: 'framework-course',  difficulty: 'intermediate', relatedSkillIds: ['jr-1','jr-2','jr-3','jr-40'],       importance: 'core' },
    { id: 'gc-7',  title: 'React 生态开发',      group: 'framework-course',  difficulty: 'intermediate', relatedSkillIds: ['jr-1','jr-2','jr-41'],              importance: 'recommended' },
    { id: 'gc-8',  title: 'TypeScript 高级编程',  group: 'framework-course',  difficulty: 'advanced',     relatedSkillIds: ['jr-2','fn-4'],                      importance: 'core' },
    { id: 'gc-9',  title: 'Node.js 全栈开发',    group: 'framework-course',  difficulty: 'intermediate', relatedSkillIds: ['jr-6','jr-7'],                      importance: 'recommended' },
    { id: 'gc-10', title: '前端工程化实践',      group: 'engineering-course', difficulty: 'intermediate', relatedSkillIds: ['md-1','jr-5','jr-10'],              importance: 'core' },
    { id: 'gc-11', title: '前端测试开发',      group: 'engineering-course', difficulty: 'intermediate', relatedSkillIds: ['md-14','jr-13'],                    importance: 'recommended' },
    { id: 'gc-12', title: '性能优化实战',        group: 'engineering-course', difficulty: 'advanced',     relatedSkillIds: ['sr-4','md-1','jr-20'],              importance: 'core' },
    { id: 'gc-13', title: 'CI/CD 与 DevOps',     group: 'engineering-course', difficulty: 'intermediate', relatedSkillIds: ['md-9','md-10','jr-12'],             importance: 'recommended' },
    { id: 'gc-14', title: '数据库设计与优化',    group: 'backend-course',     difficulty: 'intermediate', relatedSkillIds: ['md-6','jr-8','fn-11'],              importance: 'recommended' },
    { id: 'gc-15', title: '微服务架构入门',      group: 'backend-course',     difficulty: 'advanced',     relatedSkillIds: ['md-7','md-8','jr-6'],               importance: 'optional' },
    { id: 'gc-16', title: 'Web 安全攻防',        group: 'backend-course',     difficulty: 'intermediate', relatedSkillIds: ['md-13','fn-24','jr-14'],            importance: 'recommended' },
    { id: 'gc-17', title: '前端架构设计',        group: 'architecture-course', difficulty: 'advanced',    relatedSkillIds: ['sr-1','sr-9','md-2','md-4'],        importance: 'core' },
    { id: 'gc-18', title: '大规模前端应用',      group: 'architecture-course', difficulty: 'advanced',    relatedSkillIds: ['sr-1','sr-4','sr-11','md-3'],       importance: 'core' },
    { id: 'gc-19', title: '可视化与图形学',      group: 'architecture-course', difficulty: 'advanced',    relatedSkillIds: ['md-15','jr-3','fn-15','jr-42'],     importance: 'optional' },
    { id: 'gc-20', title: '大模型开发基础',  group: 'foundation-course',   difficulty: 'beginner',     relatedSkillIds: ['fn-36','fn-37','fn-5'],              importance: 'core' },
    { id: 'gc-21', title: 'LangChain 与 RAG 实战', group: 'framework-course',  difficulty: 'intermediate', relatedSkillIds: ['jr-43','jr-45','fn-36'],              importance: 'core' },
    { id: 'gc-22', title: 'FastAPI 后端开发',     group: 'framework-course',   difficulty: 'intermediate', relatedSkillIds: ['jr-44','fn-5'],                      importance: 'recommended' },
    { id: 'gc-23', title: 'AI Agent 多智能体协作', group: 'engineering-course', difficulty: 'advanced',    relatedSkillIds: ['md-36','md-37','md-39'],              importance: 'core' },
    { id: 'gc-24', title: '大模型微调与部署',     group: 'engineering-course', difficulty: 'advanced',    relatedSkillIds: ['md-38','jr-46','jr-47'],             importance: 'recommended' },
    { id: 'gc-25', title: 'Agent 架构与评估',     group: 'architecture-course', difficulty: 'advanced',   relatedSkillIds: ['sr-26','sr-27','sr-14'],             importance: 'core' },
  ]

  // ── 技能-课程关联边 ──
  const skillCourseEdges: SkillCourseEdge[] = courseNodes.flatMap(cn =>
    cn.relatedSkillIds.map(sid => ({
      skillId: sid,
      courseId: cn.id,
      relation: cn.importance === 'core' ? 'core' as const
              : cn.importance === 'recommended' ? 'recommended' as const
              : 'advanced' as const,
    }))
  )

  return { nodes, edges, courseNodes, skillCourseEdges }
}

/* ═══ 右侧面板 mock（保留兼容） ═══ */
export function getSkillEntries(_role: string): SkillEntry[] { return [] }

/* ═══ 3D 布局（已废弃，保留空导出防止编译错误） ═══ */

/* ═══ 兼容旧 2D 布局（保留类型，避免编译报错） ═══ */
export interface LayerLayout {
  tier: SkillTier
  centerY: number
  xRange: [number, number]
  trapezoid: { x: number; y: number }[]
}
export function computeLayerLayouts(_w: number, _h: number): LayerLayout[] { return [] }
export function computeNodePositions(_n: CourseNode[], _l: LayerLayout[]): Map<string, {x:number;y:number}> { return new Map() }
export function compute3DLayouts(): LayerLayout[] { return [] }
export function computeNode3DPositions(_n: CourseNode[], _l: LayerLayout[]): Map<string, {x:number;y:number}> { return new Map() }

/* ═══ 数据获取（预留接口替换） ═══ */
export async function getCourseSystemData(role: string): Promise<CourseSystemData> {
  const { getApiMode } = await import('@/api/config')
  const mode = getApiMode()
  try {
    const { fetchCourseSystemGraph } = await import('@/api/courseSystem')
    const remote = await fetchCourseSystemGraph(role)
    if (remote?.nodes?.length) {
      if (mode === 'http' || remote.nodes.length >= 12) return remote
    }
  } catch (e) {
    console.warn('[course-system] remote fetch failed', e)
  }
  if (mode === 'http') {
    return { nodes: [], edges: [], courseNodes: [], skillCourseEdges: [] }
  }
  return buildMockData(role)
}
