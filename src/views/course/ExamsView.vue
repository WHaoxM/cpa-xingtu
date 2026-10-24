<!-- 页面：技能自评；路由：exams（exams）；角色：STUDENT -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { roleOptions, DEFAULT_CAREER_ROLE, type CareerRole } from '@/composables/useCareerInsights'
import { submitAssessment } from '@/api/career'
import { DEMO_STUDENT_ID } from '@/api/config'
import { useUserStore } from '@/stores'
import { getApiMode } from '@/api/config'
import HttpSelfReflection from '@/components/learning/HttpSelfReflection.vue'

const httpReflection = getApiMode() === 'http'

const router = useRouter()
const userStore = useUserStore()

type Phase = 'select' | 'quiz' | 'result'
type RoleTrack = {
  label: string
  focus: string
}
type TrackOption = RoleTrack & {
  role: CareerRole
  icon: string
}

const phase = ref<Phase>('select')
const selectedRole = ref<CareerRole>(DEFAULT_CAREER_ROLE)
const selectedTrack = ref('')
const currentQuestionIndex = ref(0)

/* 5 级能力选项（映射为 0-100 分） */
const levelOptions = [
  { label: '没听说过',            desc: '对此技术完全陌生',           score: 0 },
  { label: '了解概念',            desc: '知道是什么，没有动手实践过',  score: 25 },
  { label: '能做简单任务',        desc: '需要查文档，能完成基础功能',  score: 50 },
  { label: '独立完成项目',        desc: '可以独立使用并解决问题',      score: 75 },
  { label: '精通 / 能指导他人',   desc: '深入理解原理，能教授他人',   score: 100 },
]

const levelLabel = (score: number): string => {
  if (score <= 0) return '未掌握'
  if (score <= 25) return '初识'
  if (score <= 50) return '入门'
  if (score <= 75) return '进阶'
  return '精通'
}

const roleTrackMap: Record<CareerRole, RoleTrack[]> = {
  前端开发: [
    { label: 'Vue 前端工程师', focus: '组件化、状态管理、权限与工程化' },
    { label: 'React 前端工程师', focus: 'Hooks、状态组织、性能优化' },
    { label: '可视化工程师', focus: '图表、数据表达、交互体验' },
  ],
  后端开发: [
    { label: 'Java 后端工程师', focus: 'Spring Boot、MySQL、Redis、接口设计' },
    { label: 'Go 后端工程师', focus: '并发、服务治理、gRPC、性能' },
    { label: 'Python 后端工程师', focus: 'Django/Flask、数据处理、接口开发' },
  ],
  测试开发: [
    { label: '测试开发工程师', focus: 'Playwright、接口测试、脚本编排' },
    { label: '质量平台工程师', focus: 'CI/CD、质量门禁、缺陷分析' },
    { label: '性能测试工程师', focus: '压测方案、指标定位、瓶颈分析' },
  ],
  数据分析: [
    { label: '商业数据分析师', focus: '指标体系、报表表达、业务洞察' },
    { label: '数据开发工程师', focus: 'ETL、数仓、SQL 与数据链路' },
    { label: '增长分析师', focus: 'A/B 测试、转化分析、用户分层' },
  ],
  机器学习工程师: [
    { label: '算法工程师', focus: '机器学习、特征工程、实验调优' },
    { label: '深度学习工程师', focus: 'PyTorch、模型训练、CV/NLP' },
    { label: 'AI 应用工程师', focus: '部署、评估、数据闭环与 MLOps' },
  ],
}

const roleMetaMap: Record<CareerRole, { icon: string; summary: string }> = {
  前端开发: { icon: 'lucide:monitor', summary: '面向 Web 界面、交互体验和工程交付。' },
  后端开发: { icon: 'lucide:server', summary: '面向接口设计、数据存储与服务稳定性。' },
  测试开发: { icon: 'lucide:bug', summary: '面向质量保障、自动化测试与测试平台。' },
  数据分析: { icon: 'lucide:bar-chart-2', summary: '面向数据洞察、指标分析与业务决策支持。' },
  机器学习工程师: { icon: 'lucide:cpu', summary: '面向算法建模、模型落地与 AI 工程化。' },
}

/* 各方向技能标准（来自 useCareerInsights skillGraph，热度即要求权重） */
const roleSkillDefs: Record<CareerRole, { id: string; name: string; required: number }[]> = {
  '前端开发': [
    { id: 'vue3', name: 'Vue 3', required: 92 },
    { id: 'react', name: 'React', required: 84 },
    { id: 'ts', name: 'TypeScript', required: 88 },
    { id: 'webpack', name: 'Vite / Webpack', required: 74 },
    { id: 'css', name: 'CSS / 动效 / 设计还原', required: 78 },
    { id: 'http', name: 'HTTP/浏览器原理', required: 70 },
    { id: 'git', name: 'Git / 协作开发', required: 72 },
    { id: 'node', name: 'Node.js / 前端工程脚本', required: 60 },
  ],
  '后端开发': [
    { id: 'java', name: 'Java / Go / C++ 基础', required: 90 },
    { id: 'mysql', name: 'MySQL / SQL', required: 85 },
    { id: 'redis', name: 'Redis / 缓存设计', required: 78 },
    { id: 'docker', name: 'Docker', required: 62 },
    { id: 'microservice', name: '服务治理 / 微服务', required: 72 },
    { id: 'mq', name: '消息队列 / 异步通信', required: 68 },
    { id: 'ts', name: '并发 / RPC / 网络基础', required: 64 },
    { id: 'git', name: 'Git / CI-CD', required: 72 },
  ],
  '测试开发': [
    { id: 'python', name: 'Python 自动化', required: 88 },
    { id: 'selenium', name: 'Selenium / Playwright', required: 82 },
    { id: 'testcase', name: '测试用例设计', required: 90 },
    { id: 'api-test', name: 'API 接口测试', required: 84 },
    { id: 'perf', name: '性能测试 / 压测分析', required: 70 },
    { id: 'cicd', name: 'CI/CD 流水线', required: 68 },
    { id: 'git', name: 'Git', required: 72 },
    { id: 'sql', name: 'SQL / 测试数据构造', required: 64 },
  ],
  '数据分析': [
    { id: 'python', name: 'Python / Pandas', required: 90 },
    { id: 'sql', name: 'SQL', required: 88 },
    { id: 'visual', name: '数据可视化 / 报表表达', required: 80 },
    { id: 'stats', name: '统计学基础', required: 78 },
    { id: 'tableau', name: 'Tableau / BI 工具', required: 70 },
    { id: 'etl', name: 'ETL / 数据清洗', required: 74 },
    { id: 'excel', name: 'Excel 高级应用', required: 62 },
    { id: 'spark', name: 'Spark / 数仓基础', required: 60 },
  ],
  '机器学习工程师': [
    { id: 'python', name: 'Python', required: 92 },
    { id: 'pytorch', name: 'PyTorch / TensorFlow', required: 88 },
    { id: 'ml-algo', name: '机器学习算法', required: 90 },
    { id: 'math', name: '数学基础（线代/概率）', required: 85 },
    { id: 'nlp', name: 'NLP / CV 基础', required: 72 },
    { id: 'spark', name: '数据处理 / 大数据基础', required: 68 },
    { id: 'docker', name: 'Docker / 部署', required: 62 },
    { id: 'git', name: 'Git', required: 70 },
  ],
}

/* ─── 15 赛道专属题库 ─── */
const trackSkillDefs: Record<string, { id: string; name: string; required: number }[]> = {
  /* ── 前端开发 ── */
  'Vue 前端工程师': [
    { id: 'vue-composition', name: 'Composition API (ref / reactive / computed)', required: 94 },
    { id: 'vue-router', name: 'Vue Router 路由守卫与动态路由', required: 90 },
    { id: 'vue-pinia', name: 'Pinia 状态管理与持久化', required: 88 },
    { id: 'vue-ts', name: 'TypeScript 在 Vue 中的类型标注', required: 86 },
    { id: 'vue-component', name: '组件设计 (props / emit / provide-inject / slots)', required: 92 },
    { id: 'vue-elementplus', name: 'Element Plus / Ant Design Vue 组件库使用', required: 80 },
    { id: 'vue-vite', name: 'Vite 构建配置与插件开发', required: 76 },
    { id: 'vue-css', name: 'CSS 预处理器与响应式布局 (Sass / Tailwind)', required: 82 },
    { id: 'vue-test', name: '前端单元测试 (Vitest / Vue Test Utils)', required: 70 },
    { id: 'vue-axios', name: 'HTTP 请求封装 (Axios 拦截器 / 错误处理)', required: 84 },
    { id: 'vue-perf', name: '前端性能优化 (懒加载 / 虚拟列表 / Tree-shaking)', required: 78 },
    { id: 'vue-git', name: 'Git 工作流与代码审查', required: 74 },
  ],
  'React 前端工程师': [
    { id: 'react-hooks', name: 'React Hooks (useState / useEffect / useRef / useMemo)', required: 94 },
    { id: 'react-router', name: 'React Router v6 路由与嵌套布局', required: 88 },
    { id: 'react-state', name: 'Redux Toolkit / Zustand 状态管理', required: 86 },
    { id: 'react-ts', name: 'TypeScript 与 React 组件类型', required: 88 },
    { id: 'react-ui', name: 'Ant Design / MUI 组件库使用', required: 80 },
    { id: 'react-nextjs', name: 'Next.js SSR / SSG / App Router', required: 82 },
    { id: 'react-css', name: 'CSS-in-JS / Tailwind CSS / CSS Modules', required: 78 },
    { id: 'react-test', name: 'Jest / React Testing Library 单元测试', required: 72 },
    { id: 'react-perf', name: '性能优化 (React.memo / useMemo / 代码分割)', required: 80 },
    { id: 'react-build', name: 'Webpack / Vite 打包配置与优化', required: 74 },
    { id: 'react-error', name: '错误边界与 Suspense 异步渲染', required: 70 },
    { id: 'react-git', name: 'Git 分支管理与 CI/CD', required: 74 },
  ],
  '可视化工程师': [
    { id: 'viz-echarts', name: 'ECharts 配置项与自定义主题', required: 92 },
    { id: 'viz-d3bindbindl', name: 'D3.js 数据绑定与 SVG 布局', required: 88 },
    { id: 'viz-bindcanvas', name: 'Canvas 2D 渲染与高性能绑图', required: 82 },
    { id: 'viz-bindgeo', name: '地图可视化 (GeoJSON / Mapbox / Leaflet)', required: 80 },
    { id: 'viz-bindscreen', name: '大屏适配方案 (rem / scale / vw)', required: 78 },
    { id: 'viz-bindanim', name: '数据动画与过渡 (GSAP / requestAnimationFrame)', required: 76 },
    { id: 'viz-bindthree', name: 'Three.js 基础 3D 场景搭建', required: 72 },
    { id: 'viz-bindinteract', name: '交互设计 (Tooltip / 联动 / 下钻)', required: 86 },
    { id: 'viz-bindclean', name: '数据清洗与格式转换 (JSON / CSV / 聚合)', required: 80 },
    { id: 'viz-bindperf', name: '渲染性能优化 (虚拟滚动 / WebWorker / LOD)', required: 74 },
    { id: 'viz-bindcolor', name: '色彩理论与无障碍配色', required: 70 },
    { id: 'viz-bindts', name: 'TypeScript 类型安全与图表组件封装', required: 76 },
  ],
  /* ── 后端开发 ── */
  'Java 后端工程师': [
    { id: 'java-spring', name: 'Spring Boot 核心注解与自动配置', required: 94 },
    { id: 'java-mvc', name: 'Spring MVC RESTful API 设计', required: 90 },
    { id: 'java-orm', name: 'MyBatis / JPA ORM 映射与事务管理', required: 88 },
    { id: 'java-mysql', name: 'MySQL 索引设计与 SQL 调优', required: 90 },
    { id: 'java-redis', name: 'Redis 缓存策略 (穿透 / 雪崩 / 击穿)', required: 82 },
    { id: 'java-mq', name: 'RabbitMQ / Kafka 消息队列', required: 78 },
    { id: 'java-docker', name: 'Docker 容器化与镜像构建', required: 72 },
    { id: 'java-security', name: 'Spring Security / JWT 认证授权', required: 80 },
    { id: 'java-test', name: '单元测试 (JUnit 5 / Mockito)', required: 74 },
    { id: 'java-git', name: 'Git 分支管理与 CI/CD 流水线', required: 76 },
    { id: 'java-jvm', name: 'JVM 调优与 GC 机制 (G1 / ZGC)', required: 78 },
    { id: 'java-micro', name: '微服务拆分与 Nacos / Spring Cloud 注册发现', required: 76 },
  ],
  'Go 后端工程师': [
    { id: 'go-goroutine', name: 'Goroutine 与 Channel 并发编程', required: 94 },
    { id: 'go-gin', name: 'Gin / Echo HTTP 框架与中间件', required: 90 },
    { id: 'go-gorm', name: 'GORM ORM 与数据库交互', required: 86 },
    { id: 'go-grpc', name: 'gRPC 与 Protobuf 序列化', required: 84 },
    { id: 'go-mysql', name: 'MySQL / PostgreSQL 查询优化与连接池', required: 88 },
    { id: 'go-redis', name: 'Redis 分布式锁与缓存设计', required: 80 },
    { id: 'go-docker', name: 'Docker / K8s 容器化部署', required: 76 },
    { id: 'go-test', name: '单元测试与 Benchmark 性能基准', required: 78 },
    { id: 'go-trace', name: '日志收集与链路追踪 (Jaeger / OpenTelemetry)', required: 72 },
    { id: 'go-micro', name: '微服务治理 (Consul / etcd / 服务网格)', required: 78 },
    { id: 'go-pprof', name: '性能分析 (pprof / trace / 内存逃逸)', required: 74 },
    { id: 'go-git', name: 'Git 与 Makefile 工程化', required: 72 },
  ],
  'Python 后端工程师': [
    { id: 'py-django', name: 'Django ORM / Admin 与 MTV 架构', required: 90 },
    { id: 'py-fastapi', name: 'Flask / FastAPI 路由与中间件', required: 88 },
    { id: 'py-sqlalchemy', name: 'SQLAlchemy 数据建模与迁移 (Alembic)', required: 84 },
    { id: 'py-celery', name: 'Celery 异步任务队列与定时调度', required: 80 },
    { id: 'py-redis', name: 'Redis 缓存与会话管理', required: 78 },
    { id: 'py-docker', name: 'Docker 部署与 Gunicorn / Uvicorn', required: 76 },
    { id: 'py-api', name: 'RESTful API 设计 (DRF / Pydantic 校验)', required: 88 },
    { id: 'py-test', name: '单元测试 (pytest / mock / fixture)', required: 76 },
    { id: 'py-log', name: '日志与异常处理 (logging / Sentry)', required: 72 },
    { id: 'py-git', name: 'Git 与 CI/CD (GitHub Actions / GitLab CI)', required: 74 },
    { id: 'py-async', name: 'Python 异步编程 (asyncio / aiohttp)', required: 78 },
    { id: 'py-mysql', name: 'MySQL / PostgreSQL 数据库设计', required: 86 },
  ],
  /* ── 测试开发 ── */
  '测试开发工程师': [
    { id: 'at-selenium', name: 'Selenium WebDriver 元素定位与操作', required: 88 },
    { id: 'at-playwright', name: 'Playwright 浏览器自动化与录制', required: 86 },
    { id: 'at-pytest', name: 'Python unittest / pytest 框架', required: 90 },
    { id: 'at-api', name: '接口测试 (Requests / HTTPx / Postman)', required: 88 },
    { id: 'at-design', name: '测试用例设计 (等价类 / 边界值 / 正交)', required: 92 },
    { id: 'at-ddt', name: '数据驱动与参数化测试 (DDT / fixture)', required: 82 },
    { id: 'at-pom', name: 'POM 页面对象模式与框架分层', required: 84 },
    { id: 'at-mock', name: 'Mock 与桩服务 (WireMock / mitmproxy)', required: 76 },
    { id: 'at-ci', name: 'Jenkins 持续集成与触发策略', required: 78 },
    { id: 'at-report', name: 'Allure 测试报告与缺陷追踪', required: 80 },
    { id: 'at-sql', name: 'SQL 测试数据构造与校验', required: 74 },
    { id: 'at-git', name: 'Git 版本管理与分支策略', required: 72 },
  ],
  '质量平台工程师': [
    { id: 'qp-cicd', name: 'CI/CD 流水线搭建 (Jenkins / GitLab CI)', required: 92 },
    { id: 'qp-gate', name: '质量门禁规则设计与自动化执行', required: 90 },
    { id: 'qp-sonar', name: '代码静态分析 (SonarQube / ESLint)', required: 86 },
    { id: 'qp-jira', name: '缺陷管理与分析 (Jira / Tapd 流程)', required: 84 },
    { id: 'qp-coverage', name: '自动化覆盖率度量与趋势分析', required: 82 },
    { id: 'qp-env', name: '测试环境管理与隔离策略', required: 80 },
    { id: 'qp-docker', name: 'Docker / K8s 测试环境编排', required: 78 },
    { id: 'qp-monitor', name: '监控告警接入 (Prometheus / Grafana)', required: 76 },
    { id: 'qp-factory', name: '测试数据工厂与造数平台', required: 74 },
    { id: 'qp-contract', name: 'API 契约测试 (Pact / Swagger)', required: 72 },
    { id: 'qp-report', name: '质量报表与看板可视化', required: 78 },
  ],
  '性能测试工程师': [
    { id: 'pt-jmeter', name: 'JMeter 脚本编写与场景设计', required: 92 },
    { id: 'pt-locust', name: 'Locust / Gatling 负载测试', required: 84 },
    { id: 'pt-metric', name: '性能指标定义 (TPS / RT / P99 / 错误率)', required: 90 },
    { id: 'pt-server', name: '服务端性能瓶颈定位 (CPU / 内存 / IO)', required: 88 },
    { id: 'pt-sql', name: '数据库慢查询分析与索引优化', required: 86 },
    { id: 'pt-jvm', name: 'JVM / GC 调优与线程分析', required: 80 },
    { id: 'pt-network', name: '网络抓包与分析 (Wireshark / tcpdump)', required: 76 },
    { id: 'pt-frontend', name: '前端性能诊断 (Lighthouse / WebVitals)', required: 74 },
    { id: 'pt-report', name: '压测报告撰写与数据分析', required: 82 },
    { id: 'pt-capacity', name: '容量规划与基线管理', required: 78 },
    { id: 'pt-apm', name: 'APM 工具 (SkyWalking / Pinpoint / Arthas)', required: 80 },
  ],
  /* ── 数据分析 ── */
  '商业数据分析师': [
    { id: 'ba-metric', name: '指标体系搭建 (北极星 / AARRR 模型)', required: 92 },
    { id: 'ba-sql', name: 'SQL 多表查询与窗口函数', required: 90 },
    { id: 'ba-excel', name: 'Excel 数据透视表与高级函数 (VLOOKUP / INDEX)', required: 82 },
    { id: 'ba-tableau', name: 'Tableau / Power BI 仪表盘搭建', required: 84 },
    { id: 'ba-pandas', name: 'Python Pandas 数据清洗与处理', required: 80 },
    { id: 'ba-stats', name: '统计学假设检验 (t 检验 / 卡方检验)', required: 78 },
    { id: 'ba-ab', name: 'A/B 测试设计与效果评估', required: 80 },
    { id: 'ba-rfm', name: '用户分群与 RFM 模型', required: 76 },
    { id: 'ba-funnel', name: '漏斗分析与转化归因', required: 84 },
    { id: 'ba-story', name: '数据故事化汇报与 PPT 呈现', required: 74 },
    { id: 'ba-biz', name: '业务需求拆解与分析框架', required: 86 },
    { id: 'ba-cohort', name: '留存分析与 Cohort 分群', required: 78 },
  ],
  '数据开发工程师': [
    { id: 'de-hive', name: 'Hive / Spark SQL 离线计算', required: 92 },
    { id: 'de-etl', name: 'ETL 流程设计与调度 (Airflow / DolphinScheduler)', required: 90 },
    { id: 'de-model', name: '数仓分层建模 (ODS / DWD / DWS / ADS)', required: 90 },
    { id: 'de-kafka', name: 'Kafka 实时数据接入与 Flink 消费', required: 82 },
    { id: 'de-quality', name: '数据质量监控与校验规则', required: 80 },
    { id: 'de-mysql', name: 'MySQL 索引优化与分库分表', required: 84 },
    { id: 'de-python', name: 'Python 数据处理脚本', required: 78 },
    { id: 'de-shell', name: 'Shell 脚本与 Crontab 定时任务', required: 74 },
    { id: 'de-lineage', name: '数据血缘与元数据管理 (Atlas / DataHub)', required: 76 },
    { id: 'de-olap', name: 'OLAP 引擎 (ClickHouse / Doris / StarRocks)', required: 80 },
    { id: 'de-git', name: 'Git 与 DataOps 工程规范', required: 72 },
    { id: 'de-dim', name: '维度建模与缓慢变化维', required: 82 },
  ],
  '增长分析师': [
    { id: 'ga-ab', name: 'A/B 测试平台与统计显著性判断', required: 92 },
    { id: 'ga-funnel', name: '转化漏斗深度分析与瓶颈诊断', required: 90 },
    { id: 'ga-cohort', name: '用户分层与 Cohort 留存分析', required: 88 },
    { id: 'ga-attr', name: '归因模型 (首次 / 末次 / 线性 / 时间衰减)', required: 82 },
    { id: 'ga-channel', name: 'Push / 邮件 / 短信渠道效果分析', required: 78 },
    { id: 'ga-sql', name: 'SQL 行为日志查询与特征提取', required: 86 },
    { id: 'ga-python', name: 'Python 自动化分析脚本 (Pandas / Jupyter)', required: 80 },
    { id: 'ga-experiment', name: '增长实验设计与优先级排序 (ICE / RICE)', required: 84 },
    { id: 'ga-compete', name: '竞品数据监控与行业对标', required: 74 },
    { id: 'ga-track', name: '数据埋点方案设计与校验', required: 86 },
    { id: 'ga-viz', name: '汇报可视化 (Tableau / Superset / Metabase)', required: 76 },
    { id: 'ga-lifecycle', name: '用户生命周期管理与召回策略', required: 80 },
  ],
  /* ── 机器学习工程师 ── */
  '算法工程师': [
    { id: 'ml-supervised', name: '监督学习 (回归 / 分类 / 集成方法)', required: 92 },
    { id: 'ml-feature', name: '特征工程 (编码 / 选择 / 降维 / 交叉)', required: 90 },
    { id: 'ml-eval', name: '模型评估 (AUC / F1 / 交叉验证 / 过拟合)', required: 90 },
    { id: 'ml-xgb', name: 'XGBoost / LightGBM 调参与实战', required: 88 },
    { id: 'ml-sklearn', name: 'Python Scikit-learn 建模流程', required: 86 },
    { id: 'ml-math', name: '数学基础 (线性代数 / 概率论 / 最优化)', required: 88 },
    { id: 'ml-preprocess', name: '数据预处理与不平衡样本处理 (SMOTE)', required: 82 },
    { id: 'ml-online', name: 'A/B 测试与线上模型评估', required: 78 },
    { id: 'ml-explain', name: '模型可解释性 (SHAP / LIME / 特征重要度)', required: 76 },
    { id: 'ml-sql', name: 'SQL 特征提取与数据采样', required: 80 },
    { id: 'ml-spark', name: 'Spark MLlib 分布式训练', required: 74 },
    { id: 'ml-unsupervised', name: '无监督学习 (聚类 / 降维 / 异常检测)', required: 80 },
  ],
  '深度学习工程师': [
    { id: 'dl-pytorch', name: 'PyTorch 张量操作与自动求导', required: 94 },
    { id: 'dl-arch', name: 'CNN / RNN / Transformer 架构原理', required: 92 },
    { id: 'dl-train', name: '模型训练 (损失函数 / 优化器 / 学习率调度)', required: 90 },
    { id: 'dl-augment', name: '数据增强与预处理 Pipeline', required: 82 },
    { id: 'dl-transfer', name: '迁移学习与预训练模型微调', required: 86 },
    { id: 'dl-nlp', name: 'NLP (Tokenizer / BERT / GPT / Embedding)', required: 84 },
    { id: 'dl-cv', name: 'CV (目标检测 / 语义分割 / YOLO / ResNet)', required: 84 },
    { id: 'dl-compress', name: '模型量化与剪枝 (INT8 / 蒸馏)', required: 76 },
    { id: 'dl-dist', name: '分布式训练 (DDP / DeepSpeed / FSDP)', required: 78 },
    { id: 'dl-board', name: 'TensorBoard / Weights & Biases 实验可视化', required: 80 },
    { id: 'dl-paper', name: '论文复现与开源模型适配', required: 74 },
    { id: 'dl-gpu', name: 'GPU 资源管理与 CUDA 基础', required: 72 },
  ],
  'AI 应用工程师': [
    { id: 'ai-deploy', name: '模型部署 (TorchServe / Triton / ONNX Runtime)', required: 92 },
    { id: 'ai-docker', name: 'Docker / K8s 模型服务化', required: 88 },
    { id: 'ai-api', name: 'API 设计与流量控制 (FastAPI / 限流 / 熔断)', required: 86 },
    { id: 'ai-monitor', name: '模型监控与数据漂移检测', required: 82 },
    { id: 'ai-mlops', name: 'MLOps 流水线 (MLflow / Kubeflow / Airflow)', required: 84 },
    { id: 'ai-label', name: '数据标注平台搭建与质量管控', required: 76 },
    { id: 'ai-ab', name: 'A/B 测试与灰度发布策略', required: 80 },
    { id: 'ai-feature', name: '特征存储 (Feature Store / Feast)', required: 74 },
    { id: 'ai-version', name: '模型版本管理与回滚', required: 80 },
    { id: 'ai-web', name: 'Python Web 框架 (FastAPI / Flask)', required: 82 },
    { id: 'ai-cost', name: '推理加速与成本优化 (TensorRT / 量化)', required: 78 },
    { id: 'ai-git', name: 'Git 与 ML 工程化规范', required: 72 },
  ],
}

const currentSkills = computed(() =>
  (selectedTrack.value && trackSkillDefs[selectedTrack.value])
    ? trackSkillDefs[selectedTrack.value]!
    : roleSkillDefs[selectedRole.value] ?? []
)
const totalQuestions = computed(() => currentSkills.value.length)
const currentSkill = computed(() => currentSkills.value[currentQuestionIndex.value])
const currentTracks = computed(() => roleTrackMap[selectedRole.value] ?? [])
const selectedDirectionLabel = computed(() => selectedTrack.value || selectedRole.value)
const allTrackOptions = computed<TrackOption[]>(() => {
  return roleOptions.flatMap((role) => {
    return (roleTrackMap[role] ?? []).map((track) => ({
      ...track,
      role,
      icon: roleMetaMap[role].icon,
    }))
  })
})

/* 用户作答（技能id → 得分 0/25/50/75/100） */
const userAnswers = ref<Record<string, number>>({})

const selectedScore = computed({
  get: () => userAnswers.value[currentSkill.value?.id ?? ''] ?? -1,
  set: (val: number) => {
    if (currentSkill.value) userAnswers.value[currentSkill.value.id] = val
  },
})

const progressPct = computed(() =>
  totalQuestions.value ? Math.round((currentQuestionIndex.value / totalQuestions.value) * 100) : 0
)

function selectRole(role: CareerRole, trackLabel = '') {
  selectedRole.value = role
  selectedTrack.value = trackLabel
  currentQuestionIndex.value = 0
  userAnswers.value = {}
  phase.value = 'quiz'
}

async function submitAssessmentResult() {
  const weak = gapResults.value.filter(g => g.gap > 0).slice(0, 8).map(g => g.name)
  const assessed_abilities = Object.fromEntries(
    Object.entries(userAnswers.value).map(([k, v]) => [k, v]),
  )
  try {
    await submitAssessment({
      student_id: userStore.currentUser?.id || DEMO_STUDENT_ID,
      assessed_skills: weak,
      assessed_abilities,
      target_role: selectedDirectionLabel.value,
    })
  } catch (e) {
    console.warn('[exams] assessment submit failed', e)
  }
}

async function goNext() {
  if (selectedScore.value < 0) return
  if (currentQuestionIndex.value < totalQuestions.value - 1) {
    currentQuestionIndex.value++
  } else {
    phase.value = 'result'
    await submitAssessmentResult()
  }
}

function goPrev() {
  if (currentQuestionIndex.value > 0) currentQuestionIndex.value--
  else phase.value = 'select'
}

function resetAll() {
  phase.value = 'select'
  selectedTrack.value = ''
  userAnswers.value = {}
  currentQuestionIndex.value = 0
}

/* 差距计算 */
const gapResults = computed(() => {
  return currentSkills.value.map(skill => {
    const userScore = userAnswers.value[skill.id] ?? 0
    const gap = skill.required - userScore
    const mastery = Math.round((userScore / skill.required) * 100)
    return { ...skill, userScore, gap, mastery }
  }).sort((a, b) => b.gap - a.gap)
})

const overallMastery = computed(() => {
  if (!gapResults.value.length) return 0
  const total = gapResults.value.reduce((sum, s) => sum + s.mastery, 0)
  return Math.round(total / gapResults.value.length)
})

const overallLevel = computed(() => {
  const m = overallMastery.value
  if (m >= 80) return { label: '竞争力强', desc: '技能覆盖优于同方向多数应届生，可积极投递', color: 'var(--bamboo-green, #4A6741)' }
  if (m >= 60) return { label: '进阶阶段', desc: '技能栈基本完善，建议深耕重点领域', color: 'var(--color-secondary)' }
  if (m >= 40) return { label: '成长阶段', desc: '已具备入门能力，关键差距在实战项目经验', color: 'var(--color-gold)' }
  return { label: '起步阶段', desc: '核心技能尚在积累，建议先完成基础课程', color: 'var(--color-primary)' }
})

const weakSkills = computed(() => gapResults.value.filter(s => s.gap > 30))

function gapColor(gap: number): string {
  if (gap <= 10) return 'var(--bamboo-green, #4A6741)'
  if (gap <= 30) return 'var(--color-gold)'
  return 'var(--color-primary)'
}

function masteryBg(mastery: number): string {
  if (mastery >= 80) return 'rgba(74,103,65,0.08)'
  if (mastery >= 50) return 'rgba(201,162,39,0.08)'
  return 'rgba(190,42,0,0.06)'
}

function goToAnalysis() {
  router.push({ path: '/app/student/career-analysis', query: { role: selectedDirectionLabel.value } })
}

function goToNavigation() {
  router.push('/app/student/career-navigation')
}

</script>

<template>
  <HttpSelfReflection v-if="httpReflection" />
  <div v-else class="exams-page">

    <!-- ══ 阶段一：选择方向 ══ -->
    <div v-if="phase === 'select'" class="phase phase--select">
      <div class="page-hd">
        <div>
          <h1 class="page-hd__title">技能自评</h1>
          <p class="page-hd__sub">选择目标岗位方向，逐项回答能力问题，生成差距诊断报告</p>
        </div>
      </div>

      <div class="card-view">
        <p class="select-hint">你目前最感兴趣或正在准备的方向：</p>

        <div class="role-grid">
          <button
            v-for="(role, i) in roleOptions"
            :key="role"
            class="role-card"
            @click="selectRole(role as CareerRole)"
          >
            <Icon
              :icon="roleMetaMap[role as CareerRole]?.icon || (['lucide:monitor','lucide:server','lucide:bug','lucide:bar-chart-2','lucide:cpu'])[i] || 'lucide:briefcase'"
              :width="28" class="role-card__icon"
            />
            <span class="role-card__name">{{ role }}</span>
            <span class="role-card__summary">{{ roleMetaMap[role as CareerRole]?.summary }}</span>
            <span class="role-card__count">{{ roleSkillDefs[role as CareerRole]?.length ?? 0 }} 项核心技能</span>
            <span class="role-card__tracks">{{ roleTrackMap[role as CareerRole]?.map(item => item.label).join(' / ') }}</span>
          </button>
        </div>

        <div class="subrole-panel">
          <div class="subrole-panel__head">
            <strong>细分准备方向</strong>
            <span>如果你已经更明确，可以直接从细分赛道开始自评。</span>
          </div>
          <div class="subrole-grid">
            <button
              v-for="track in allTrackOptions"
              :key="`${track.role}-${track.label}`"
              class="subrole-card"
              @click="selectRole(track.role, track.label)"
            >
              <div class="subrole-card__top">
                <span class="subrole-card__role">{{ track.role }}</span>
                <Icon :icon="track.icon" :width="14" class="subrole-card__icon" />
              </div>
              <strong class="subrole-card__title">{{ track.label }}</strong>
              <span class="subrole-card__desc">{{ track.focus }}</span>
            </button>
          </div>
        </div>

        <p class="tip-row">
          <Icon icon="lucide:info" :width="13" />
          没有简历？先自评了解差距，再
          <button class="link-btn" @click="goToNavigation">上传简历获取精准评估</button>
        </p>
      </div>

    </div>

    <!-- ══ 阶段二：逐题问卷 ══ -->
    <div v-else-if="phase === 'quiz'" class="phase phase--quiz">
      <!-- 顶部进度 -->
      <div class="quiz-progress">
        <div class="quiz-progress__meta">
          <span class="quiz-progress__role">{{ selectedDirectionLabel }}</span>
          <span class="quiz-progress__count">{{ currentQuestionIndex + 1 }} / {{ totalQuestions }}</span>
        </div>
        <div class="quiz-progress__bar">
          <div class="quiz-progress__fill" :style="{ width: progressPct + '%' }" />
        </div>
      </div>

      <div v-if="selectedTrack" class="quiz-direction-chip">
        <span>归属主方向：{{ selectedRole }}</span>
      </div>

      <div class="track-panel">
        <span class="track-panel__title">该方向常见细分赛道</span>
        <div class="track-list">
          <div v-for="item in currentTracks" :key="item.label" class="track-item">
            <strong>{{ item.label }}</strong>
            <span>{{ item.focus }}</span>
          </div>
        </div>
      </div>

      <!-- 题目卡片 -->
      <div class="quiz-card" v-if="currentSkill">
        <div class="quiz-card__meta">
          <span class="quiz-card__heat">岗位热度 {{ currentSkill.required }}</span>
          <span class="quiz-card__required">高频核心技能</span>
        </div>
        <h2 class="quiz-card__skill">{{ currentSkill.name }}</h2>
        <p class="quiz-card__ask">你目前对 <strong>{{ currentSkill.name }}</strong> 的掌握程度是？</p>

        <div class="quiz-options">
          <label
            v-for="opt in levelOptions"
            :key="opt.score"
            class="quiz-option"
            :class="{ 'quiz-option--selected': selectedScore === opt.score }"
          >
            <input
              type="radio"
              :name="'q-' + currentSkill.id"
              :value="opt.score"
              v-model="selectedScore"
              class="quiz-option__radio"
            />
            <div class="quiz-option__content">
              <span class="quiz-option__label">{{ opt.label }}</span>
              <span class="quiz-option__desc">{{ opt.desc }}</span>
            </div>
            <Icon v-if="selectedScore === opt.score" icon="lucide:check-circle" :width="16" class="quiz-option__check" />
          </label>
        </div>
      </div>

      <!-- 底部导航 -->
      <div class="quiz-nav">
        <button class="btn-ghost" @click="goPrev">
          <Icon icon="lucide:arrow-left" :width="14" />
          {{ currentQuestionIndex === 0 ? '重选方向' : '上一题' }}
        </button>
        <button
          class="btn-primary"
          :disabled="selectedScore < 0"
          @click="goNext"
        >
          {{ currentQuestionIndex === totalQuestions - 1 ? '生成差距报告' : '下一题' }}
          <Icon icon="lucide:arrow-right" :width="14" />
        </button>
      </div>
    </div>

    <!-- ══ 阶段三：差距报告 ══ -->
    <div v-else-if="phase === 'result'" class="phase phase--result">
      <!-- 总览卡 -->
      <div class="result-overview">
        <div class="result-overview__left">
          <div class="result-level" :style="{ color: overallLevel.color }">
            {{ overallLevel.label }}
          </div>
          <div class="result-pct">综合掌握度 {{ overallMastery }}%</div>
          <p class="result-desc">{{ overallLevel.desc }}</p>
          <div class="result-overview__bar">
            <div class="result-overview__fill" :style="{ width: overallMastery + '%', background: overallLevel.color }" />
          </div>
        </div>
        <div class="result-overview__right">
          <div class="result-weak-title" v-if="weakSkills.length">
            还有 {{ weakSkills.length }} 项差距较大
          </div>
          <div class="result-weak-tags">
            <span v-for="s in weakSkills.slice(0,4)" :key="s.id" class="weak-tag">{{ s.name }}</span>
          </div>
        </div>
      </div>

      <!-- 逐项列表 -->
      <div class="gap-list">
        <div
          v-for="skill in gapResults" :key="skill.id"
          class="gap-item"
          :style="{ background: masteryBg(skill.mastery) }"
        >
          <div class="gap-item__name">
            {{ skill.name }}
            <span class="gap-item__level">{{ levelLabel(skill.userScore) }}</span>
          </div>
          <div class="gap-item__bars">
            <div class="gap-item__bar-row">
              <span class="gap-bar-lbl">自评</span>
              <div class="gap-bar-track">
                <div class="gap-bar-fill gap-bar-fill--user" :style="{ width: skill.userScore + '%' }" />
              </div>
              <span class="gap-bar-val">{{ skill.userScore }}</span>
            </div>
            <div class="gap-item__bar-row">
              <span class="gap-bar-lbl">要求</span>
              <div class="gap-bar-track">
                <div class="gap-bar-fill gap-bar-fill--req" :style="{ width: skill.required + '%' }" />
              </div>
              <span class="gap-bar-val">{{ skill.required }}</span>
            </div>
          </div>
          <span
            class="gap-badge"
            :style="{ color: gapColor(skill.gap), borderColor: gapColor(skill.gap) }"
          >
            {{ skill.gap > 0 ? `差 ${skill.gap}` : '✓ 达标' }}
          </span>
        </div>
      </div>

      <!-- 底部 CTA -->
      <div class="result-footer">
        <button class="btn-ghost" @click="resetAll">
          <Icon icon="lucide:rotate-ccw" :width="13" /> 重新评估
        </button>
        <button class="btn-primary" @click="goToAnalysis">
          <Icon icon="lucide:target" :width="13" />
          了解 {{ selectedDirectionLabel }} 岗位实情
        </button>
        <button class="btn-secondary" @click="goToNavigation">
          <Icon icon="lucide:route" :width="13" />
          上传简历精准评估
        </button>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ─── 容器 ─── */
.exams-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px 20px;
}
.phase { display: flex; flex-direction: column; gap: 20px; width: 100%; }

.phase--select { max-width: none; }

.phase--quiz,
.phase--result {
  max-width: 680px;
  margin: 0 auto;
}

/* ─── 页头 ─── */
.page-hd {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.page-hd__title {
  font-size: 1.375rem; font-weight: 600;
  color: var(--color-text); margin: 0 0 4px;
  border-left: 3px solid var(--color-primary);
  padding-left: 10px;
}
.page-hd__sub { font-size: 13px; color: var(--color-text-muted); margin: 0; }

/* ─── 视图容器 ─── */
.card-view { display: flex; flex-direction: column; gap: 20px; }

/* ─── 方向选择 ─── */
.select-hint { font-size: 13px; color: var(--color-text-muted); margin: 0; }

.role-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}
.role-card {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  min-height: 220px;
  padding: 18px 14px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer; transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  text-align: center;
}
.role-card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
}
.role-card__icon { color: var(--color-primary); }
.role-card__name { font-size: 14px; font-weight: 600; color: var(--color-text); }
.role-card__summary {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
}
.role-card__count { font-size: 11px; color: var(--color-text-subtle); }
.role-card__tracks {
  font-size: 10px;
  color: var(--color-primary);
  line-height: 1.5;
}

.subrole-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 78%, var(--color-secondary-light, rgba(0,0,0,0.03)));
}

.subrole-panel__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.subrole-panel__head strong {
  font-size: 14px;
  color: var(--color-text);
}

.subrole-panel__head span {
  font-size: 12px;
  color: var(--color-text-muted);
}

.subrole-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.subrole-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 132px;
  padding: 16px 16px 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, var(--color-primary));
  border-radius: var(--radius-md);
  background: var(--color-background);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
}

.subrole-card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.subrole-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.subrole-card__role {
  font-size: 10px;
  color: var(--color-text-subtle);
}

.subrole-card__icon {
  color: var(--color-primary);
}

.subrole-card__title {
  font-size: 14px;
  color: var(--color-text);
}

.subrole-card__desc {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.tip-row {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--color-text-subtle);
}
.link-btn {
  background: none; border: none; cursor: pointer;
  color: var(--color-secondary); font-size: inherit; text-decoration: underline; padding: 0;
}

/* ─── 问卷进度 ─── */
.quiz-progress { display: flex; flex-direction: column; gap: 6px; }
.quiz-progress__meta {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px;
}
.quiz-progress__role { color: var(--color-primary); font-weight: 600; }
.quiz-progress__count { color: var(--color-text-muted); }
.quiz-progress__bar {
  height: 4px;
  background: var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.quiz-progress__fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  transition: width 0.3s ease;
}

.track-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-surface) 76%, var(--color-primary-light));
}

.track-panel__title {
  font-size: 12px;
  color: var(--color-text-muted);
}

.quiz-direction-chip {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 600;
}

.track-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.track-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, var(--color-primary));
  background: var(--color-background);
}

.track-item strong {
  font-size: 13px;
  color: var(--color-text);
}

.track-item span {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

/* ─── 题目卡片 ─── */
.quiz-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-top: 3px solid var(--color-primary);
  border-radius: var(--radius-md);
  padding: 24px;
}
.quiz-card__meta {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 12px;
}
.quiz-card__heat {
  font-size: 11px; font-weight: 600;
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}
.quiz-card__required {
  font-size: 11px; color: var(--color-text-subtle);
}
.quiz-card__skill {
  font-size: 1.25rem; font-weight: 600;
  color: var(--color-text); margin: 0 0 6px;
}
.quiz-card__ask {
  font-size: 13px; color: var(--color-text-muted); margin: 0 0 20px;
}

/* ─── 选项 ─── */
.quiz-options { display: flex; flex-direction: column; gap: 8px; }
.quiz-option {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  background: var(--color-background);
}
.quiz-option:hover { border-color: var(--color-primary); background: var(--color-primary-light); }
.quiz-option--selected {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.quiz-option__radio { display: none; }
.quiz-option__content { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.quiz-option__label { font-size: 13px; font-weight: 600; color: var(--color-text); }
.quiz-option__desc { font-size: 11px; color: var(--color-text-muted); }
.quiz-option__check { color: var(--color-primary); flex-shrink: 0; }

/* ─── 问卷底部导航 ─── */
.quiz-nav {
  display: flex; justify-content: space-between; align-items: center;
  padding-top: 4px;
}

/* ─── 结果总览 ─── */
.result-overview {
  display: flex; gap: 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-md);
  padding: 20px;
  flex-wrap: wrap;
}
.result-overview__left { flex: 1; min-width: 200px; }
.result-level { font-size: 1.5rem; font-weight: 600; margin-bottom: 2px; }
.result-pct { font-size: 13px; color: var(--color-text-muted); margin-bottom: 6px; }
.result-desc { font-size: 12px; color: var(--color-text-muted); margin: 0 0 12px; line-height: 1.5; }
.result-overview__bar {
  height: 5px; background: var(--color-border);
  border-radius: var(--radius-sm); overflow: hidden;
}
.result-overview__fill {
  height: 100%; border-radius: var(--radius-sm); transition: width 0.5s ease;
}
.result-overview__right { display: flex; flex-direction: column; justify-content: center; gap: 8px; }
.result-weak-title { font-size: 12px; color: var(--color-text-muted); }
.result-weak-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.weak-tag {
  font-size: 11px; padding: 2px 8px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  color: var(--color-primary);
  background: var(--color-primary-light);
}

/* ─── 差距列表 ─── */
.gap-list { display: flex; flex-direction: column; gap: 6px; }
.gap-item {
  display: grid; grid-template-columns: 160px 1fr auto;
  align-items: center; gap: 12px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
}
.gap-item__name { font-size: 13px; font-weight: 500; color: var(--color-text); display: flex; flex-direction: column; gap: 2px; }
.gap-item__level { font-size: 10px; color: var(--color-text-subtle); font-weight: 400; }
.gap-item__bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.gap-bar-lbl { font-size: 10px; color: var(--color-text-subtle); width: 24px; flex-shrink: 0; }
.gap-bar-track { flex: 1; height: 4px; background: var(--color-border); border-radius: var(--radius-sm); overflow: hidden; }
.gap-bar-fill { height: 100%; border-radius: var(--radius-sm); }
.gap-bar-fill--user { background: var(--color-secondary); }
.gap-bar-fill--req { background: var(--color-text-subtle); opacity: 0.4; }
.gap-bar-val { font-size: 10px; color: var(--color-text-muted); width: 24px; text-align: right; flex-shrink: 0; }
.gap-badge {
  font-size: 10px; font-weight: 600;
  padding: 2px 8px; border-radius: var(--radius-sm); border: 1px solid;
  white-space: nowrap;
}

/* ─── 底部按钮 ─── */
.result-footer { display: flex; gap: 10px; flex-wrap: wrap; padding-top: 4px; }

.btn-primary {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 18px;
  background: var(--color-primary);
  color: var(--parchment-100); border: none;
  border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 500; cursor: pointer; transition: opacity var(--transition-fast);
}
.btn-primary:hover:not(:disabled) { opacity: 0.88; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-secondary {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 18px;
  background: var(--color-secondary);
  color: var(--parchment-100); border: none;
  border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 500; cursor: pointer; transition: opacity var(--transition-fast);
}
.btn-secondary:hover { opacity: 0.88; }

.btn-ghost {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 14px;
  background: none;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 13px; cursor: pointer; transition: background var(--transition-fast);
}
.btn-ghost:hover { background: var(--color-surface); }

@media (max-width: 960px) {
  .role-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .subrole-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (max-width: 768px) {
  .exams-page { padding: 20px 16px; }
  .role-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .subrole-panel { padding: 18px; }
  .subrole-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .role-card,
  .subrole-card { min-height: unset; }
}

@media (max-width: 640px) {
  .gap-item { grid-template-columns: 1fr; }
  .result-overview { flex-direction: column; }
  .role-grid { grid-template-columns: 1fr; }
  .subrole-grid { grid-template-columns: 1fr; }
  .track-list { grid-template-columns: 1fr; }
}
</style>


