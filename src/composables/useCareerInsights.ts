import { computed, ref } from 'vue'

export type CareerRole = '前端开发' | '后端开发' | '测试开发' | '数据分析' | '机器学习工程师'

export type CareerEvidence = {
  type: 'course' | 'note' | 'wrongbook'
  label: string
  weight: number
}

/** Catalog role name from BE Role Inference (e.g. RAG工程师); domain CareerRole only for mock viz. */
export type CareerCandidate = {
  role: string
  score: number
  coverage?: number
  matched_skills?: string[]
  missing_core_skills?: string[]
}

export type SkillNode = {
  id: string
  name: string
  category: '前端' | '后端' | '测试' | '数据' | '机器学习' | '通用'
  heat: number
}

export type SkillEdge = {
  source: string
  target: string
  weight: number
}

export type SalaryPoint = {
  date: string
  p25: number
  p50: number
  p75: number
}

export type CareerInsights = {
  /** BE catalog role (Role Inference); do not collapse to 5 UI domains. */
  predictedRole: string
  /** Domain bucket for local mock graphs / bubble layout only. */
  domainRole?: CareerRole
  confidence: number
  candidates: CareerCandidate[]
  evidence: CareerEvidence[]
  skillGraph: {
    nodes: SkillNode[]
    edges: SkillEdge[]
  }
  sankey: {
    nodes: Array<{ name: string }>
    links: Array<{ source: string; target: string; value: number }>
  }
  salary: {
    predicted: { role: string; points: SalaryPoint[] }
    target: { role: string; points: SalaryPoint[] }
  }
}

export type CareerAgentInput = {
  userId: string
  courseIds: string[]
  noteTags: string[]
  wrongbookTags: string[]
}

export const roleOptions: CareerRole[] = ['前端开发', '后端开发', '测试开发', '数据分析', '机器学习工程师']

/** 默认展示职业 — 后续接入 API 时替换为动态返回值即可 */
export const DEFAULT_CAREER_ROLE: CareerRole = '机器学习工程师'

// ── 五领域 × 三细分岗位 统一数据源 ──
export interface BubbleDomain {
  id: string
  role: CareerRole
  name: string
  color: string
  jobs: string[]
}

export const CAREER_DOMAINS: BubbleDomain[] = [
  {
    id: 'frontend', role: '前端开发', name: '前端开发', color: '#BE2A00',
    jobs: ['Vue 前端工程师', 'React 前端工程师', '可视化工程师'],
  },
  {
    id: 'backend', role: '后端开发', name: '后端开发', color: '#8B1A00',
    jobs: ['Java 后端工程师', 'Go 后端工程师', 'Python 后端工程师'],
  },
  {
    id: 'qa', role: '测试开发', name: '测试质量', color: '#E87055',
    jobs: ['测试开发工程师', '质量平台工程师', '性能测试工程师'],
  },
  {
    id: 'data', role: '数据开发', name: '数据智能', color: '#C9A227',
    jobs: ['数据分析师', '数据开发工程师', '增长分析师'],
  },
  {
    id: 'ml', role: 'AI 工程', name: 'AI 工程', color: '#1B4E79',
    jobs: ['算法工程师', 'AI 应用工程师', '大模型工程师'],
  },
]

export type BackendStack = 'java' | 'golang'

export type CareerInsightsConfig = {
  backendStack?: BackendStack
}

export type PrerequisiteGraph = {
  nodes: SkillNode[]
  edges: SkillEdge[]
}

const DEFAULT_CONFIG: Required<CareerInsightsConfig> = {
  backendStack: 'java',
}

function withConfig(cfg?: CareerInsightsConfig): Required<CareerInsightsConfig> {
  return { ...DEFAULT_CONFIG, ...(cfg || {}) }
}

function pickFromRoleGraph(roleNodes: SkillNode[], ids: string[]): SkillNode[] {
  const map = new Map(roleNodes.map((n) => [n.id, n]))
  return ids
    .map((id) => map.get(id))
    .filter((n): n is SkillNode => !!n)
}

export function getPrerequisiteGraphMock(skillId: string, roleNodes: SkillNode[]): PrerequisiteGraph {
  const prereqMap: Record<string, string[]> = {
    vue3: ['js', 'html', 'css', 'ts', 'router', 'state'],
    react: ['js', 'ts', 'state', 'http'],
    vite: ['js', 'node', 'http'],
    webpack: ['js', 'node'],
    perf: ['http', 'js', 'monitor'],
    ssr: ['http', 'node', 'perf'],
    router: ['js', 'http'],
    state: ['js', 'ts'],
    echarts: ['js', 'vue3'],
    api: ['http', 'auth'],
    auth: ['http', 'sec'],
    db: ['sql', 'index'],
    index: ['sql'],
    redis: ['db', 'http'],
    mq: ['http', 'api'],
    spring: ['java', 'api'],
    java: ['linux', 'http'],
    mybatis: ['db', 'java'],
    go: ['linux', 'http'],
    gin: ['go', 'api'],
    grpc: ['go', 'http'],
    test: ['git', 'ci'],
    playwright: ['test', 'http'],
    jest: ['js', 'test'],
    'api-test': ['http', 'test'],
    py: ['linux'],
    etl: ['sql', 'py'],
    bi: ['sql', 'metric'],
    ml: ['py', 'stat', 'data'],
    dl: ['ml', 'py'],
    feat: ['data', 'ml'],
    deploy: ['docker', 'http'],
  }

  const prereqIds = prereqMap[skillId] || ['http', 'git', 'linux']
  const prereqNodes = pickFromRoleGraph(roleNodes, prereqIds)

  const core: SkillNode =
    roleNodes.find((n) => n.id === skillId) ||
    ({ id: skillId, name: skillId, category: '通用', heat: 88 } as SkillNode)

  const nodes: SkillNode[] = [
    { ...core, heat: Math.max(core.heat, 92) },
    ...prereqNodes.map((n, idx) => ({ ...n, heat: Math.min(90, Math.max(55, n.heat - 10 + idx)) })),
  ]

  const edges: SkillEdge[] = prereqNodes.map((n, idx) => ({
    source: n.id,
    target: core.id,
    weight: 0.62 + (idx % 3) * 0.06,
  }))

  return { nodes, edges }
}

function buildSkillGraphForRole(
  role: CareerRole,
  cfg?: CareerInsightsConfig,
): { nodes: SkillNode[]; edges: SkillEdge[] } {
  const c = withConfig(cfg)
  const baseNodes: SkillNode[] = [
    { id: 'ts', name: 'TypeScript', category: '通用', heat: 78 },
    { id: 'git', name: 'Git / 协作', category: '通用', heat: 66 },
    { id: 'ci', name: 'CI/CD', category: '通用', heat: 62 },
    { id: 'linux', name: 'Linux 基础', category: '通用', heat: 58 },
    { id: 'http', name: 'HTTP / 网络', category: '通用', heat: 64 },
    { id: 'sec', name: 'Web 安全', category: '通用', heat: 56 },
  ]

  const backendNodesJava: SkillNode[] = [
    { id: 'java', name: 'Java / JVM', category: '后端', heat: 90 },
    { id: 'spring', name: 'Spring Boot', category: '后端', heat: 88 },
    { id: 'mybatis', name: 'MyBatis / ORM', category: '后端', heat: 74 },
    { id: 'api', name: 'REST API 设计', category: '后端', heat: 86 },
    { id: 'auth', name: '鉴权 / JWT / RBAC', category: '后端', heat: 78 },
    { id: 'db', name: 'MySQL / SQL', category: '后端', heat: 92 },
    { id: 'index', name: '索引 / 事务 / 锁', category: '后端', heat: 82 },
    { id: 'redis', name: 'Redis 缓存', category: '后端', heat: 84 },
    { id: 'mq', name: 'MQ / 异步消息', category: '后端', heat: 76 },
    { id: 'rpc', name: 'RPC / 服务调用', category: '后端', heat: 70 },
    { id: 'rate', name: '限流 / 熔断', category: '后端', heat: 66 },
    { id: 'obs', name: '日志 / 链路追踪', category: '通用', heat: 66 },
    { id: 'docker', name: 'Docker', category: '通用', heat: 62 },
  ]

  const backendNodesGolang: SkillNode[] = [
    { id: 'go', name: 'Golang', category: '后端', heat: 88 },
    { id: 'gin', name: 'Gin / Web 框架', category: '后端', heat: 80 },
    { id: 'grpc', name: 'gRPC', category: '后端', heat: 76 },
    { id: 'api', name: 'REST API 设计', category: '后端', heat: 84 },
    { id: 'auth', name: '鉴权 / JWT / RBAC', category: '后端', heat: 76 },
    { id: 'db', name: 'MySQL / SQL', category: '后端', heat: 92 },
    { id: 'index', name: '索引 / 事务 / 锁', category: '后端', heat: 82 },
    { id: 'redis', name: 'Redis 缓存', category: '后端', heat: 82 },
    { id: 'mq', name: 'MQ / 异步消息', category: '后端', heat: 74 },
    { id: 'conc', name: '并发 / 协程', category: '后端', heat: 78 },
    { id: 'obs', name: '日志 / 链路追踪', category: '通用', heat: 66 },
    { id: 'docker', name: 'Docker', category: '通用', heat: 62 },
  ]

  const roleNodes: Record<CareerRole, SkillNode[]> = {
    前端开发: [
      { id: 'vue3', name: 'Vue 3', category: '前端', heat: 92 },
      { id: 'react', name: 'React', category: '前端', heat: 84 },
      { id: 'js', name: 'JavaScript 基础', category: '前端', heat: 88 },
      { id: 'html', name: 'HTML / 语义化', category: '前端', heat: 70 },
      { id: 'css', name: 'CSS / 动效', category: '前端', heat: 78 },
      { id: 'vite', name: 'Vite / 构建', category: '通用', heat: 84 },
      { id: 'webpack', name: 'Webpack', category: '通用', heat: 66 },
      { id: 'router', name: '路由 / 权限', category: '前端', heat: 74 },
      { id: 'state', name: '状态管理', category: '前端', heat: 78 },
      { id: 'ui', name: '组件库', category: '前端', heat: 72 },
      { id: 'echarts', name: '数据可视化', category: '前端', heat: 64 },
      { id: 'perf', name: '性能优化', category: '前端', heat: 72 },
      { id: 'ssr', name: 'SSR / 首屏', category: '前端', heat: 60 },
      { id: 'test-fe', name: '前端测试', category: '测试', heat: 62 },
      { id: 'monitor', name: '监控 / 埋点', category: '通用', heat: 58 },
      { id: 'node', name: 'Node.js', category: '后端', heat: 62 },
    ],
    后端开发: c.backendStack === 'golang' ? backendNodesGolang : backendNodesJava,
    测试开发: [
      { id: 'test', name: '测试开发', category: '测试', heat: 90 },
      { id: 'playwright', name: 'Playwright / E2E', category: '测试', heat: 78 },
      { id: 'jest', name: '单元测试', category: '测试', heat: 76 },
      { id: 'api-test', name: '接口测试', category: '测试', heat: 74 },
      { id: 'quality', name: '质量体系', category: '测试', heat: 70 },
      { id: 'mock', name: 'Mock / 测试数据', category: '测试', heat: 66 },
      { id: 'perf-test', name: '性能测试', category: '测试', heat: 60 },
      { id: 'sec-test', name: '安全测试', category: '测试', heat: 56 },
      { id: 'bug', name: '缺陷分析', category: '测试', heat: 64 },
      { id: 'node', name: 'Node.js', category: '后端', heat: 58 },
    ],
    数据分析: [
      { id: 'py', name: 'Python', category: '数据', heat: 90 },
      { id: 'sql', name: 'SQL', category: '数据', heat: 88 },
      { id: 'bi', name: 'BI / 可视化', category: '数据', heat: 76 },
      { id: 'etl', name: 'ETL / 清洗', category: '数据', heat: 74 },
      { id: 'stat', name: '统计学', category: '数据', heat: 70 },
      { id: 'ab', name: 'A/B 测试', category: '数据', heat: 66 },
      { id: 'metric', name: '指标体系', category: '数据', heat: 72 },
      { id: 'report', name: '分析报告', category: '数据', heat: 64 },
      { id: 'track', name: '埋点口径', category: '数据', heat: 62 },
    ],
    机器学习工程师: [
      { id: 'py', name: 'Python', category: '数据', heat: 86 },
      { id: 'ml', name: '机器学习', category: '机器学习', heat: 92 },
      { id: 'dl', name: '深度学习', category: '机器学习', heat: 88 },
      { id: 'feat', name: '特征工程', category: '机器学习', heat: 74 },
      { id: 'deploy', name: '模型部署', category: '机器学习', heat: 72 },
      { id: 'data', name: '数据处理', category: '数据', heat: 78 },
      { id: 'eval', name: '评估指标', category: '机器学习', heat: 66 },
      { id: 'tune', name: '调参与实验', category: '机器学习', heat: 64 },
      { id: 'mlops', name: 'MLOps', category: '机器学习', heat: 58 },
      { id: 'langchain', name: 'LangChain/LangGraph', category: '机器学习', heat: 90 },
      { id: 'rag', name: 'RAG 系统', category: '机器学习', heat: 88 },
      { id: 'prompt', name: 'Prompt Engineering', category: '机器学习', heat: 86 },
      { id: 'neo4j', name: 'Neo4j/图数据库', category: '数据', heat: 76 },
      { id: 'milvus', name: 'Milvus/向量检索', category: '数据', heat: 78 },
      { id: 'lora', name: 'LoRA 微调', category: '机器学习', heat: 72 },
      { id: 'fastapi', name: 'FastAPI', category: '后端', heat: 74 },
    ],
  }

  const roleEdges: Record<CareerRole, SkillEdge[]> = {
    前端开发: [
      { source: 'vue3', target: 'ts', weight: 0.86 },
      { source: 'react', target: 'ts', weight: 0.74 },
      { source: 'js', target: 'vue3', weight: 0.72 },
      { source: 'js', target: 'react', weight: 0.72 },
      { source: 'vite', target: 'vue3', weight: 0.7 },
      { source: 'vite', target: 'react', weight: 0.62 },
      { source: 'webpack', target: 'vite', weight: 0.42 },
      { source: 'css', target: 'vue3', weight: 0.58 },
      { source: 'router', target: 'state', weight: 0.62 },
      { source: 'ui', target: 'vue3', weight: 0.48 },
      { source: 'echarts', target: 'vue3', weight: 0.44 },
      { source: 'perf', target: 'react', weight: 0.52 },
      { source: 'ssr', target: 'perf', weight: 0.46 },
      { source: 'monitor', target: 'perf', weight: 0.4 },
      { source: 'test-fe', target: 'vue3', weight: 0.42 },
      { source: 'node', target: 'vite', weight: 0.46 },
      { source: 'ci', target: 'git', weight: 0.55 },
      { source: 'ts', target: 'git', weight: 0.38 },
      { source: 'http', target: 'api', weight: 0.26 },
    ],
    后端开发: c.backendStack === 'golang'
      ? [
          { source: 'go', target: 'gin', weight: 0.82 },
          { source: 'gin', target: 'api', weight: 0.74 },
          { source: 'api', target: 'auth', weight: 0.62 },
          { source: 'api', target: 'db', weight: 0.7 },
          { source: 'db', target: 'index', weight: 0.72 },
          { source: 'db', target: 'redis', weight: 0.62 },
          { source: 'mq', target: 'api', weight: 0.58 },
          { source: 'grpc', target: 'rpc', weight: 0.4 },
          { source: 'conc', target: 'go', weight: 0.66 },
          { source: 'obs', target: 'api', weight: 0.5 },
          { source: 'docker', target: 'ci', weight: 0.46 },
          { source: 'ci', target: 'git', weight: 0.52 },
        ]
      : [
          { source: 'java', target: 'spring', weight: 0.86 },
          { source: 'spring', target: 'mybatis', weight: 0.62 },
          { source: 'spring', target: 'api', weight: 0.76 },
          { source: 'api', target: 'auth', weight: 0.64 },
          { source: 'api', target: 'db', weight: 0.7 },
          { source: 'db', target: 'index', weight: 0.72 },
          { source: 'db', target: 'redis', weight: 0.62 },
          { source: 'mq', target: 'api', weight: 0.58 },
          { source: 'rpc', target: 'api', weight: 0.46 },
          { source: 'rate', target: 'api', weight: 0.42 },
          { source: 'obs', target: 'api', weight: 0.5 },
          { source: 'docker', target: 'ci', weight: 0.46 },
          { source: 'ci', target: 'git', weight: 0.52 },
        ],
    测试开发: [
      { source: 'test', target: 'playwright', weight: 0.76 },
      { source: 'test', target: 'jest', weight: 0.72 },
      { source: 'api-test', target: 'test', weight: 0.68 },
      { source: 'quality', target: 'test', weight: 0.58 },
      { source: 'ci', target: 'test', weight: 0.6 },
      { source: 'git', target: 'ci', weight: 0.54 },
      { source: 'node', target: 'playwright', weight: 0.42 },
      { source: 'mock', target: 'api-test', weight: 0.52 },
      { source: 'bug', target: 'quality', weight: 0.44 },
    ],
    数据分析: [
      { source: 'py', target: 'etl', weight: 0.76 },
      { source: 'etl', target: 'sql', weight: 0.72 },
      { source: 'sql', target: 'bi', weight: 0.62 },
      { source: 'stat', target: 'ab', weight: 0.58 },
      { source: 'py', target: 'stat', weight: 0.5 },
      { source: 'git', target: 'py', weight: 0.32 },
      { source: 'metric', target: 'bi', weight: 0.56 },
      { source: 'track', target: 'metric', weight: 0.5 },
      { source: 'report', target: 'bi', weight: 0.46 },
    ],
    机器学习工程师: [
      { source: 'py', target: 'data', weight: 0.78 },
      { source: 'data', target: 'ml', weight: 0.72 },
      { source: 'ml', target: 'dl', weight: 0.7 },
      { source: 'feat', target: 'ml', weight: 0.62 },
      { source: 'deploy', target: 'dl', weight: 0.54 },
      { source: 'ci', target: 'deploy', weight: 0.46 },
      { source: 'git', target: 'ci', weight: 0.5 },
      { source: 'eval', target: 'ml', weight: 0.5 },
      { source: 'tune', target: 'ml', weight: 0.46 },
      { source: 'mlops', target: 'deploy', weight: 0.44 },
      { source: 'langchain', target: 'py', weight: 0.82 },
      { source: 'rag', target: 'langchain', weight: 0.74 },
      { source: 'prompt', target: 'langchain', weight: 0.68 },
      { source: 'neo4j', target: 'rag', weight: 0.62 },
      { source: 'milvus', target: 'rag', weight: 0.66 },
      { source: 'lora', target: 'dl', weight: 0.56 },
      { source: 'fastapi', target: 'py', weight: 0.72 },
    ],
  }

  const nodes = [...roleNodes[role], ...baseNodes]
  const edges = [...roleEdges[role]]
  return { nodes, edges }
}

function buildMockSalary(base: number): SalaryPoint[] {
  const dates = ['2025-07', '2025-10', '2026-01', '2026-04', '2026-07', '2026-10']
  return dates.map((d, idx) => {
    const t = idx / Math.max(1, dates.length - 1)
    const p50 = base + 1.6 * t + (idx % 2 === 0 ? 0.25 : -0.15)
    const p25 = p50 - (1.2 + 0.1 * idx)
    const p75 = p50 + (1.8 + 0.12 * idx)
    return {
      date: d,
      p25: Number(p25.toFixed(2)),
      p50: Number(p50.toFixed(2)),
      p75: Number(p75.toFixed(2)),
    }
  })
}

/** Map BE catalog role → UI domain for decorative mock graphs only. */
export function mapCatalogRoleToDomain(catalogRole: string): CareerRole {
  const n = catalogRole.toLowerCase()
  if (/前端|vue|react|web|可视化/.test(n)) return '前端开发'
  if (/测试|qa|质量/.test(n)) return '测试开发'
  if (/数据.?分析|数据分析师|数仓|bi/.test(n)) return '数据分析'
  if (/机器|算法|ai|大模型|智能|rag|agent|nlp|视觉|mlops/.test(n)) return '机器学习工程师'
  if (/后端|java|go|python|服务端|全栈|devops|infra/.test(n)) return '后端开发'
  return DEFAULT_CAREER_ROLE
}

export function getCareerInsightsMock(targetRole: CareerRole, cfg?: CareerInsightsConfig): CareerInsights {
  const graph = buildSkillGraphForRole(targetRole, cfg)

  const sankeyNodes = [
    { name: 'Vue3 组件化' },
    { name: 'TypeScript 类型系统' },
    { name: '工程化/构建' },
    { name: '接口设计' },
    { name: '数据库' },
    { name: '测试开发' },
    { name: '数据处理' },
    { name: '机器学习基础' },
    { name: '前端开发' },
    { name: '后端开发' },
    { name: '测试开发' },
    { name: '数据分析' },
    { name: '机器学习工程师' },
  ]

  const sankeyLinks = [
    { source: 'Vue3 组件化', target: '前端开发', value: 18 },
    { source: 'TypeScript 类型系统', target: '前端开发', value: 14 },
    { source: '工程化/构建', target: '前端开发', value: 12 },
    { source: 'TypeScript 类型系统', target: '后端开发', value: 9 },
    { source: '接口设计', target: '后端开发', value: 14 },
    { source: '数据库', target: '后端开发', value: 12 },
    { source: '测试开发', target: '质量平台', value: 16 },
    { source: '工程化/构建', target: '测试开发', value: 8 },
    { source: '数据处理', target: '数据分析', value: 15 },
    { source: '数据库', target: '数据分析', value: 10 },
    { source: '机器学习基础', target: '机器学习工程师', value: 18 },
    { source: '数据处理', target: '机器学习工程师', value: 10 },
  ]

  const predictedRole: CareerRole = targetRole

  const allRoles: CareerRole[] = ['前端开发', '后端开发', '测试开发', '数据分析', '机器学习工程师']
  const scoreSteps = [0.78, 0.62, 0.54, 0.47, 0.33]
  const candidates: CareerCandidate[] = allRoles
    .slice()
    .sort((a, b) => (a === targetRole ? -1 : b === targetRole ? 1 : 0))
    .map((role, i) => ({ role, score: scoreSteps[i]! }))

  return {
    predictedRole,
    domainRole: predictedRole,
    confidence: 0.78,
    candidates,
    evidence: [
      { type: 'course', label: 'Vue3 + TypeScript 工程化实战', weight: 0.34 },
      { type: 'course', label: '前端工程化与构建', weight: 0.18 },
      { type: 'note', label: '组件通信 / 状态管理 笔记', weight: 0.16 },
      { type: 'wrongbook', label: '路由守卫 / Pinia 相关错题', weight: 0.1 },
    ],
    skillGraph: graph,
    sankey: { nodes: sankeyNodes, links: sankeyLinks },
    salary: {
      predicted: { role: predictedRole, points: buildMockSalary(16.8) },
      target: { role: targetRole, points: targetRole === '机器学习工程师' ? buildMockSalary(22.2) : buildMockSalary(18.4) },
    },
  }
}

export async function getCareerInsightsFromAgent(_input: CareerAgentInput, targetRole: CareerRole): Promise<CareerInsights> {
  return getCareerInsightsMock(targetRole)
}

export function useCareerInsights(cfg?: CareerInsightsConfig) {
  const targetRole = ref<CareerRole>(DEFAULT_CAREER_ROLE)

  const insights = computed<CareerInsights>(() => {
    return getCareerInsightsMock(targetRole.value, cfg)
  })

  return { targetRole, insights, roleOptions }
}
