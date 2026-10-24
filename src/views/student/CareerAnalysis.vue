<!-- 页面：职业分析；路由：student/career-analysis；角色：STUDENT -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import UserInfoBar from '@/components/UserInfoBar.vue'
import CareerExplorationWorkspace from '@/components/career/CareerExplorationWorkspace.vue'
import { getApiMode } from '@/api/config'
import { useAgentArtifactHandoff } from '@/composables/useAgentArtifactHandoff'
import type { MatchPreview } from '@/types'
import { useLearningStore } from '@/stores/learning'
import { gsap } from '@/plugins/gsap'
import { useCareerInsights, roleOptions, CAREER_DOMAINS as DEMO_CAREER_DOMAINS, type CareerRole } from '@/composables/useCareerInsights'
import { resolveCareerAnalysisView, careerOverviewGroups, careerOverviewSkills, type OverviewDomain } from '@/composables/careerOverviewContract'
import { getLandscape, type CareerInsight } from '@/api/career'
import { httpGet } from '@/api/adapters/httpAdapter'
const isHttpMode = getApiMode() === 'http'
const CAREER_DOMAINS: OverviewDomain[] = DEMO_CAREER_DOMAINS.map(d=>({...d,jobs:[...d.jobs]}))
import { hydrateCareerDomainsFromApi } from '@/api/careerHydrate'
import * as d3 from 'd3'
import VChart from 'vue-echarts'
import { use, registerMap, graphic } from 'echarts/core'
import { BarChart, LineChart, MapChart, BoxplotChart, GraphChart, CustomChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import { TooltipComponent, GridComponent, GeoComponent, VisualMapComponent, DataZoomComponent, MarkPointComponent, GraphicComponent } from 'echarts/components'
import chinaJson from '@/assets/data/china.json'
import worldJson from '@/assets/data/world.json'
import parchmentBaseUrl from '@/assets/images/parchment-base.jpg'
const parchmentBgUrl = `url("${parchmentBaseUrl}")`

use([BarChart, LineChart, MapChart, BoxplotChart, GraphChart, CustomChart, CanvasRenderer,
  TooltipComponent, GridComponent, GeoComponent, VisualMapComponent, DataZoomComponent, MarkPointComponent, GraphicComponent])
registerMap('china', chinaJson as any)
registerMap('world', worldJson as any)

/* ═══ 现代冷中性配色 (与 theme.css 统一) ═══ */
const C = {
  bg: '#F5F5F3',
  panel: '#EDEDEB',
  panelBorder: '#E3E3E0',
  zhusha: '#BB3418',
  zhushaLight: '#C85A3A',
  gold: '#C4961E',
  accent: '#3A6EAE',
  green: '#4A9058',
  textPrimary: '#111111',
  textSecondary: '#666666',
  textMuted: '#999999',
  parchment: '#F5F5F3',
  parchmentDark: '#CBCBC8',
  mapBorder: 'rgba(192,52,24,0.22)',
}

/* ═══ 省份简称映射 ═══ */
function shortName(name: string): string {
  return name
    .replace(/壮族|回族|维吾尔/g, '')
    .replace(/(自治区|特别行政区|省|市)$/g, '')
}

/* ═══ 确定性随机工具 ═══ */
function strHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h) || 1
}
function seededRng(seed: number): () => number {
  let s = seed
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
}

/* ═══ 省份模拟数据（按岗位名确定性生成） ═══ */
const ALL_PROVINCES = [
  '北京市','天津市','河北省','山西省','内蒙古自治区','辽宁省',
  '吉林省','黑龙江省','上海市','江苏省','浙江省','安徽省',
  '福建省','江西省','山东省','河南省','湖北省','湖南省',
  '广东省','广西壮族自治区','海南省','重庆市','四川省','贵州省',
  '云南省','西藏自治区','陕西省','甘肃省','青海省','宁夏回族自治区',
  '新疆维吾尔自治区','台湾省','香港特别行政区','澳门特别行政区',
]
// 主要科技城市的基准需求系数
const HUB_FACTOR: Record<string, number> = {
  '北京市': 1.0, '上海市': 0.95, '广东省': 0.98, '浙江省': 0.85,
  '江苏省': 0.80, '四川省': 0.68, '湖北省': 0.62, '重庆市': 0.55,
  '福建省': 0.56, '山东省': 0.58, '天津市': 0.50, '辽宁省': 0.46,
  '陕西省': 0.50, '香港特别行政区': 0.72, '台湾省': 0.42,
}

// 省份 IT 薪资系数（全国平均=1.0），基于国家统计局 2024 各省非私营平均工资 + IT 行业集中度
const PROVINCE_SALARY_COEFF: Record<string, number> = {
  '北京市': 1.82, '上海市': 1.75, '浙江省': 1.52, '广东省': 1.48,
  '江苏省': 1.18, '天津市': 1.08, '福建省': 1.06, '四川省': 1.05,
  '湖北省': 1.02, '陕西省': 0.98, '重庆市': 0.96, '山东省': 0.90,
  '辽宁省': 0.88, '湖南省': 0.86, '安徽省': 0.85, '海南省': 0.82,
  '河南省': 0.82, '云南省': 0.80, '江西省': 0.80, '内蒙古自治区': 0.78,
  '河北省': 0.78, '贵州省': 0.76, '广西壮族自治区': 0.76, '山西省': 0.76,
  '吉林省': 0.74, '黑龙江省': 0.72, '新疆维吾尔自治区': 0.70,
  '宁夏回族自治区': 0.70, '甘肃省': 0.68, '青海省': 0.66,
  '西藏自治区': 0.65, '台湾省': 1.25, '香港特别行政区': 2.10, '澳门特别行政区': 1.35,
}

// 15 岗位全国中位薪资（K/月），基于 BOSS直聘/猎聘 2025-2026 实际数据
const JOB_BASE_SALARY: Record<string, number> = {
  '大模型工程师': 32.0, '算法工程师': 28.0, 'AI 应用工程师': 22.0,
  'Go 后端工程师': 20.0, '数据开发工程师': 18.0, 'Java 后端工程师': 16.0,
  '增长分析师': 16.0, 'Python 后端工程师': 15.0, '质量平台工程师': 15.0,
  'React 前端工程师': 14.0, '可视化工程师': 14.0, '性能测试工程师': 14.0,
  'Vue 前端工程师': 13.0, '数据分析师': 13.0, '测试开发工程师': 12.0,
}
// 5 个通用方向基准薪资（子岗位均值）
const ROLE_BASE_SALARY: Record<string, number> = {
  '前端开发': 13.7, '后端开发': 17.0, '测试开发': 13.7, '数据分析': 15.7, '机器学习工程师': 27.3,
}

type ProvinceItem = { name: string; value: number; salary: number }
function getProvinceData(role: string): ProvinceItem[] {
  const rng = seededRng(strHash(role))
  const baseSalary = JOB_BASE_SALARY[role] ?? ROLE_BASE_SALARY[role] ?? (8 + seededRng(strHash('fallback_' + role))() * 5)
  return ALL_PROVINCES.map(name => {
    const hub = HUB_FACTOR[name] ?? (0.12 + rng() * 0.22)
    const value = Math.min(100, Math.max(5, Math.round((hub * 75 + rng() * 30) * (0.8 + rng() * 0.4))))
    const coeff = PROVINCE_SALARY_COEFF[name] ?? (0.65 + rng() * 0.20)
    const salary = +(baseSalary * coeff).toFixed(1)
    return { name, value, salary }
  })
}

/* 为省份对标图生成箱形数据 */
function getProvinceBox(provinceName: string, data: ProvinceItem[]): { box: number[]; demand: number } {
  const p = data.find(d => d.name === provinceName)
  const med = p?.salary ?? 12
  const demand = p?.value ?? 50
  const rng = seededRng(strHash('box_' + provinceName))
  const spread = 2.5 + rng() * 3
  return {
    box: [
      +(med - spread * 1.4 - rng() * 0.5).toFixed(1),
      +(med - spread * 0.5).toFixed(1),
      +med.toFixed(1),
      +(med + spread * 0.7).toFixed(1),
      +(med + spread * 1.6 + rng() * 0.5).toFixed(1),
    ],
    demand,
  }
}

// 15 岗位真实薪资区间（K/月）：junior=应届~2年, mid=3~5年, senior=5年以上
const JOB_SALARY_TABLE: Record<string, { junior: number; mid: number; senior: number }> = {
  '大模型工程师': { junior: 22, mid: 40, senior: 65 },
  '算法工程师':       { junior: 20, mid: 35, senior: 55 },
  'AI 应用工程师':    { junior: 15, mid: 25, senior: 42 },
  'Go 后端工程师':    { junior: 12, mid: 22, senior: 38 },
  '数据开发工程师':   { junior: 10, mid: 20, senior: 35 },
  'Java 后端工程师':  { junior: 10, mid: 18, senior: 32 },
  'Python 后端工程师':{ junior: 9,  mid: 16, senior: 28 },
  '增长分析师':       { junior: 9,  mid: 17, senior: 30 },
  '质量平台工程师':   { junior: 9,  mid: 16, senior: 28 },
  'React 前端工程师': { junior: 8,  mid: 16, senior: 28 },
  '可视化工程师':     { junior: 8,  mid: 15, senior: 28 },
  '性能测试工程师':   { junior: 8,  mid: 14, senior: 26 },
  'Vue 前端工程师':   { junior: 7,  mid: 14, senior: 25 },
  '商业数据分析师':   { junior: 7,  mid: 14, senior: 26 },
  '测试开发工程师': { junior: 7,  mid: 13, senior: 24 },
}
function getJobSalaryData(jobName: string) {
  const preset = JOB_SALARY_TABLE[jobName]
  if (preset) return { name: jobName, ...preset }
  const rng = seededRng(strHash('salary_' + jobName))
  const junior = Math.round(6 + rng() * 10)
  const mid = junior + Math.round(5 + rng() * 10)
  const senior = mid + Math.round(8 + rng() * 15)
  return { name: jobName, junior, mid, senior }
}

/* ═══ AI 评价模拟数据 ═══ */
function getAiComments(_province: string, _role: string) {
  return [
    { title: '整体趋势', content: `${_province}的${_role}岗位需求在近两年呈稳步上升趋势，薪资中位数高于全国平均水平。该地区互联网产业集群效应明显，头部企业集中，带动了整体薪资水平的提升。` },
    { title: '供需分析', content: `当前${_province}${_role}人才供给缺口约15%，尤其是3-5年经验的中高级岗位竞争激烈。建议关注新兴产业园区的招聘动态，这些区域通常提供更有竞争力的薪酬包。` },
    { title: '薪资建议', content: `基于当前市场数据，${_role}在${_province}的合理薪资预期为：初级 8-12K，中级 15-22K，高级 25-40K。核心技术栈熟练度和项目经验是薪资谈判的关键因素。` },
    { title: '发展前景', content: `${_province}已将数字经济列为重点发展方向，预计未来2-3年${_role}相关岗位将持续增长。建议提前布局云原生、AI辅助开发等新兴技能方向，以获得更大的职业发展空间。` },
  ]
}

/* ═══ KPI tooltip 详情数据 ═══ */
const kpiSalaryDetails = {
  method: '基于全国34省份主流招聘平台公开薪资数据，取中位数加权计算',
  updateDate: '2026-03-15',
  samples: [
    { company: '字节跳动', salary: '18-25K', city: '北京' },
    { company: '腾讯', salary: '16-22K', city: '深圳' },
    { company: '阿里巴巴', salary: '17-24K', city: '杭州' },
    { company: '美团', salary: '15-20K', city: '北京' },
  ],
}
const kpiDemandDetails = {
  method: '汇总主流招聘平台（Boss直聘、拉勾、猎聘）在线岗位数',
  updateDate: '2026-03-15',
  platforms: [
    { name: 'Boss直聘', count: 1850 },
    { name: '拉勾网', count: 1280 },
    { name: '猎聘', count: 950 },
  ],
}

/* ═══ 核心状态 ═══ */
const route = useRoute()
const router = useRouter()
const showExploration=computed(()=>resolveCareerAnalysisView(getApiMode(),route.query)==='exploration')
const isRealOverview=computed(()=>isHttpMode&&!artifactId.value)
const overviewGroups=ref<OverviewDomain[]>([]),overviewPage=ref(0),overviewLoading=ref(false),overviewError=ref('')
const overviewPartial=ref(false)
const overviewPages=computed(()=>Math.max(1,Math.ceil(overviewGroups.value.length/5)))
const overviewDetail=ref<CareerInsight|null>(null),overviewDetailError=ref(''),overviewDetailLoading=ref(false)
const overviewSkills=computed(()=>careerOverviewSkills(overviewDetail.value?.core_skills))
let overviewLive=true,overviewFlight=0,detailFlight=0,overviewReady=false
const returnOverviewRole=ref('')
function openExploration(){returnOverviewRole.value=selectedJob.value?.jobName||roleSearch.value;void router.push({query:{view:'exploration',...(returnOverviewRole.value?{role:returnOverviewRole.value}:{})}})}
function closeExploration(){const role=returnOverviewRole.value||(typeof route.query.role==='string'?route.query.role:'');void router.replace({query:role?{role}:{}})}
function setOverviewPage(page:number){
  overviewPage.value=Math.max(0,Math.min(page,overviewPages.value-1))
  CAREER_DOMAINS.splice(0,CAREER_DOMAINS.length,...overviewGroups.value.slice(overviewPage.value*5,overviewPage.value*5+5))
  _flatJobs=buildFlatJobs()
  void nextTick(()=>{if(overviewLive&&!showExploration.value)initBubbleChart()})
}
async function loadOverviewDetail(role:string){
  const n=++detailFlight;overviewDetail.value=null;overviewDetailError.value='';overviewDetailLoading.value=!!role
  if(!role)return
  try{const response=await httpGet<CareerInsight>('/api/career/insights/'+encodeURIComponent(role));if(n!==detailFlight||!overviewLive)return;if(!response.success||!response.data)throw Error();overviewDetail.value=response.data}
  catch{if(n===detailFlight&&overviewLive)overviewDetailError.value='这项方向资料暂时无法读取，请重试。'}
  finally{if(n===detailFlight&&overviewLive)overviewDetailLoading.value=false}
}
async function initializeOverview(){
  const n=++overviewFlight;overviewLoading.value=true;overviewError.value=''
  try{
    if(!overviewReady){const rows=await getLandscape();if(n!==overviewFlight||!overviewLive||showExploration.value||!isRealOverview.value)return;overviewGroups.value=careerOverviewGroups(rows);overviewPartial.value=rows.some(row=>!overviewGroups.value.some(group=>group.name===row.category&&group.jobs.length===(row.roles||[]).length));overviewReady=true}
    setOverviewPage(overviewPage.value)
    if(typeof route.query.role==='string'){roleSearch.value=route.query.role;handleSearchSubmit()}
    await nextTick();if(!overviewLive||showExploration.value||!isRealOverview.value)return
    if(selectedJob.value?.jobName)void loadOverviewDetail(selectedJob.value.jobName)
    setupEntranceAnimation();initBubbleChart()
    _bubbleRo?.disconnect();if(bubbleSvgRef.value){_bubbleRo=new ResizeObserver(initBubbleChart);_bubbleRo.observe(bubbleSvgRef.value)}
  }catch{if(n===overviewFlight&&overviewLive)overviewError.value='职业方向目录暂时不可用，原岗位舆图仍保留，请重试。'}
  finally{if(n===overviewFlight&&overviewLive)overviewLoading.value=false}
}
const artifactId = computed(() => {
  const value = route.query.artifact_id
  return typeof value === 'string' ? value : ''
})
if(isRealOverview.value)CAREER_DOMAINS.length=0
const artifactHandoff = useAgentArtifactHandoff(() => artifactId.value)
const matchArtifact = computed(() => {
  const artifact = artifactHandoff.artifact.value
  if (!artifact || !['match', 'match_result'].includes(artifact.kind)) return null
  const preview = artifact.preview as MatchPreview | undefined
  if (!preview || preview.type !== 'match_preview') return null
  if (typeof preview.total_score !== 'number' || !Number.isFinite(preview.total_score) || preview.total_score < 0 || preview.total_score > 100) return null
  if (typeof preview.coverage !== 'number' || !Number.isFinite(preview.coverage) || preview.coverage < 0 || preview.coverage > 100) return null
  const roleName = preview.primary_role || artifact.title.match(/与\s*(.+?)\s*的匹配结果/)?.[1]?.trim()
  const job = roleName && _flatJobs.find(item => item.jobName === roleName || item.jobName.replace(/工程师$/, '').trim() === roleName)
  if (!job) return null
  return { artifact, preview, job }
})
const artifactError = computed(() => {
  if (!artifactId.value || artifactHandoff.loading.value) return ''
  return artifactHandoff.error.value || (!matchArtifact.value ? '这份成果物缺少有效匹配分、覆盖率或可定位的岗位，无法展示为人岗匹配分析。' : '')
})
const matchArtifactChartOption = computed(() => {
  const preview = matchArtifact.value?.preview
  return {
    animation: true,
    grid: { left: 88, right: 38, top: 34, bottom: 44 },
    xAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: '#8b8175' }, splitLine: { lineStyle: { color: '#ded8ce' } } },
    yAxis: { type: 'category', data: ['技能覆盖率', '匹配分'], axisLabel: { color: '#423b34', fontSize: 13 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{ type: 'bar', barWidth: 28, data: [preview?.coverage ?? 0, preview?.total_score ?? 0], itemStyle: { color: '#bb3418', borderRadius: [0, 5, 5, 0] }, label: { show: true, position: 'right', formatter: '{c}', color: '#423b34', fontWeight: 'bold' } }],
  }
})
function returnToAgent() {
  void router.push({ name: 'student-ai-assistant', query: artifactHandoff.sessionId.value ? { session_id: artifactHandoff.sessionId.value } : {} })
}
const learningStore = useLearningStore()

const followableRole = computed<CareerRole | null>(() => {
  const normalizedRole = normalizeRouteRole(currentAnalysisLabel.value)
  return roleOptions.includes(normalizedRole as CareerRole) ? normalizedRole as CareerRole : null
})
const isCurrentRoleFollowed = computed(() => followableRole.value ? learningStore.isTargetRole(followableRole.value) : false)

function toggleFollowRole() {
  if (!followableRole.value) return
  learningStore.toggleTargetRole(followableRole.value)
}

function goToNavigation() {
  router.push('/app/student/career-navigation')
}

/* ═══ CTA 自动隐藏（3 秒后收起） ═══ */
const ctaVisible = ref(true)
let _ctaTimer: ReturnType<typeof setTimeout> | null = null
function resetCtaTimer() {
  if (_ctaTimer) clearTimeout(_ctaTimer)
  ctaVisible.value = true
  _ctaTimer = setTimeout(() => { ctaVisible.value = false }, 3000)
}

const pageRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const roleSearch = ref(isHttpMode?'':'前端开发')
const selectedProvince = ref<string | null>(null)
const scrollRevealed = ref(false)
const showSalaryTip = ref(false)
const showDemandTip = ref(false)
let gsapCtx: ReturnType<typeof gsap.context> | null = null

const { targetRole } = useCareerInsights()

function normalizeRouteRole(roleParam: unknown): string {
  if (typeof roleParam !== 'string') return ''
  if (roleOptions.includes(roleParam as CareerRole)) return roleParam
  const text = roleParam.toLowerCase()
  if (/机器学习|深度学习|算法|大模型|ai|pytorch|tensorflow|ml/.test(text)) return '机器学习工程师'
  if (/java|go|golang|c\+\+|后端|服务端|微服务|redis|mysql/.test(text)) return '后端开发'
  if (/测试|qa|playwright|selenium|自动化|质量/.test(text)) return '测试开发'
  if (/数据|分析|sql|bi|etl|python|增长/.test(text)) return '数据分析'
  if (/前端|vue|react|web|可视化/.test(text)) return '前端开发'
  return roleParam
}

function applyRouteRole(roleParam: unknown) {
  if(isRealOverview.value){roleSearch.value=typeof roleParam==='string'?roleParam:'';return}
  const normalizedRole = normalizeRouteRole(roleParam)
  if (!normalizedRole) {
    roleSearch.value = '前端开发'
    _baseProvinceData.value = getProvinceData('前端开发')
    selectedJob.value = null
    selectedProvince.value = null
    aiCommentPage.value = 0
    targetRole.value = '前端开发' as CareerRole
    return
  }
  const displayRole = typeof roleParam === 'string' && roleParam.trim() ? roleParam.trim() : normalizedRole
  roleSearch.value = displayRole
  _baseProvinceData.value = getProvinceData(displayRole)
  selectedJob.value = null
  selectedProvince.value = null
  aiCommentPage.value = 0
  if (roleOptions.includes(normalizedRole as CareerRole)) {
    targetRole.value = normalizedRole as CareerRole
  }
}


/* ═══ #4 AI评价翻页 ═══ */
const aiCommentPage = ref(0)
const aiComments = computed(() => {
  if (!selectedProvince.value) return []
  return getAiComments(selectedProvince.value, roleSearch.value)
})
const currentAiComment = computed(() => aiComments.value[aiCommentPage.value] || null)

const _baseProvinceData = ref<ProvinceItem[]>(isHttpMode?[]:getProvinceData(roleSearch.value))
const provinceData = computed(() => _baseProvinceData.value)

type CompareColumns = {
  role: string
  topProvince: ProvinceItem
  nationalAvg: number
  isTopSameAsCur: boolean
  boxes: number[][]
}

type CompareColumnsApiResponse = {
  topProvinceName: string
  nationalAvgSalary: number
  salaryBoxes: number[][]
}

function buildCompareColumnsFromMock(role: string, currentProvince: string, data: ProvinceItem[]): CompareColumns {
  const sorted = [...data].sort((a, b) => b.salary - a.salary)
  const topProvince = sorted[0]!
  const nationalAvg = +(data.reduce((s, d) => s + d.salary, 0) / data.length).toFixed(1)
  const avgData: ProvinceItem = {
    name: '全国均值',
    value: Math.round(data.reduce((s, d) => s + d.value, 0) / data.length),
    salary: nationalAvg,
  }

  const colTop = getProvinceBox(topProvince.name, data)
  const colAvg = getProvinceBox('全国均值', [...data, avgData])
  const isTopSameAsCur = topProvince.name === currentProvince
  const colCur = isTopSameAsCur ? colTop : getProvinceBox(currentProvince, data)

  return {
    role,
    topProvince,
    nationalAvg,
    isTopSameAsCur,
    boxes: [colTop.box, colAvg.box, colCur.box] as number[][],
  }
}

async function fetchCompareColumns(role: string, currentProvince: string, data: ProvinceItem[]): Promise<CompareColumns> {
  // 预留接口：接入后仅替换此函数
  // const resp = await api.get<CompareColumnsApiResponse>('/career/compare', { params: { role, province: currentProvince } })
  // return mapCompareColumnsResponse(role, currentProvince, data, resp.data)
  return Promise.resolve(buildCompareColumnsFromMock(role, currentProvince, data))
}

function mapCompareColumnsResponse(
  role: string,
  currentProvince: string,
  data: ProvinceItem[],
  payload: CompareColumnsApiResponse,
): CompareColumns {
  const fallback = buildCompareColumnsFromMock(role, currentProvince, data)
  const topProvince = data.find(p => p.name === payload.topProvinceName) ?? fallback.topProvince
  const isTopSameAsCur = topProvince.name === currentProvince
  return {
    role,
    topProvince,
    nationalAvg: payload.nationalAvgSalary ?? fallback.nationalAvg,
    isTopSameAsCur,
    boxes: payload.salaryBoxes?.length === 3 ? payload.salaryBoxes : fallback.boxes,
  }
}

const compareColumnsState = ref<CompareColumns | null>(null)

async function refreshCompareColumns() {
  const data = provinceData.value
  if (!data.length || !selectedProvince.value) {
    compareColumnsState.value = null
    return
  }
  compareColumnsState.value = await fetchCompareColumns(roleSearch.value, selectedProvince.value, data)
}

// 15 岗位全国需求量（基于 BOSS直聘/猎聘/拉勾 2025-2026 在线岗位数，总计 14518）
const JOB_DEMAND: Record<string, number> = {
  'Java 后端工程师': 2034, 'Vue 前端工程师': 1597, 'React 前端工程师': 1452,
  'Python 后端工程师': 1161, '算法工程师': 1016, 'Go 后端工程师': 1016,
  '测试开发工程师': 1016, '数据开发工程师': 871, 'AI 应用工程师': 871,
  '数据分析师': 726, '大模型工程师': 726, '性能测试工程师': 581,
  '增长分析师': 581, '可视化工程师': 435, '质量平台工程师': 435,
}

/* ═══ KPI 数据 ═══ */
const nationalKpi = computed(() => {
  if(isRealOverview.value)return {avgSalary:null,demandTotal:null,growthRate:null}
  const data = provinceData.value
  const avgSalary = data.length ? +(data.reduce((s, d) => s + d.salary, 0) / data.length).toFixed(1) : 0
  const demandTotal = JOB_DEMAND[roleSearch.value] ?? Math.round(data.reduce((s, d) => s + d.value, 0) * 3)
  const rng = seededRng(strHash('growth_' + roleSearch.value))
  const growthPct = +(8 + rng() * 12).toFixed(1)
  return {
    avgSalary,
    demandTotal,
    growthRate: `+${growthPct}%`,
  }
})

/* ═══ #9 省份需求排行 Top10 ═══ */
const provinceRanking = computed(() => {
  const sorted = [...provinceData.value].sort((a, b) => b.value - a.value)
  return sorted.slice(0, 10).map((p, i) => ({
    ...p, rank: i + 1,
    shortName: p.name.replace(/(省|市|自治区|特别行政区|壮族|回族|维吾尔)/g, ''),
    displayValue: p.value,
    barPercent: p.value,
  }))
})

/* 地图配置 */
const vchartRef = ref<any>(null)
const searchFocused = ref(false)
const mapInitOptions = { devicePixelRatio: Math.min(2, window.devicePixelRatio || 1) }
const mapUpdateOptions = { notMerge: true, lazyUpdate: false }
const hiddenRegions = [
  { name: '南海诸岛', itemStyle: { opacity: 0, borderWidth: 0, borderColor: 'transparent' }, label: { show: false } },
  { name: '香港特别行政区', itemStyle: { opacity: 0, borderWidth: 0, borderColor: 'transparent' }, label: { show: false } },
  { name: '澳门特别行政区', itemStyle: { opacity: 0, borderWidth: 0, borderColor: 'transparent' }, label: { show: false } }
]

const activeLevel = ref<number | null>(null)
function highlightMapLevel(level: number) {
  if (activeLevel.value === level) {
    activeLevel.value = null // toggle off
  } else {
    activeLevel.value = level
  }
}

/* ═══ 省份对标图（全国最高 / 全国均值 / 当前选中省） ═══ */
const compareOption = computed(() => {
  const compareColumns = compareColumnsState.value
  if (!compareColumns || !selectedProvince.value) return {}

  const topProvince = compareColumns.topProvince
  const curName = shortName(selectedProvince.value)
  const boxes = compareColumns.boxes
  const meds = boxes.map(box => box?.[2] ?? 0)

  const delta = +((meds[2] ?? 0) - (meds[1] ?? 0)).toFixed(1)
  const deltaSign = delta >= 0 ? '+' : ''
  const deltaColor = delta >= 0 ? C.green : C.zhusha
  const deltaArrow = delta >= 0 ? '▲' : '▼'

  const topShortName = shortName(topProvince.name)
  const labels = [topShortName, '全国均', curName]

  /* 中位值标注（markPoint 用 coord 坐标，category 字符串匹配） */
  const medColors = [C.gold, C.textMuted, C.zhusha] as const
  const markPointData = [0, 1, 2].map(idx => ({
    coord: [labels[idx], meds[idx] ?? 0] as [string, number],
    symbol: 'diamond',
    symbolSize: idx === 2 ? 13 : 9,
    itemStyle: {
      color: medColors[idx],
      borderColor: 'rgba(255,255,255,0.9)',
      borderWidth: 1.5,
      shadowBlur: idx === 2 ? 10 : 3,
      shadowColor: idx === 2 ? 'rgba(187,52,24,0.45)' : 'rgba(62,48,32,0.15)',
    },
    label: {
      show: true,
      formatter: `${meds[idx] ?? 0}K`,
      position: 'top' as const,
      fontSize: idx === 2 ? 11 : 10,
      fontFamily: 'KaiTi, serif',
      color: medColors[idx],
      fontWeight: idx === 2 ? ('bold' as const) : ('normal' as const),
      offset: [0, -6] as [number, number],
    },
  }))

  /* 箱形每列配置 */
  const boxColors = [
    { fill: 'rgba(196,150,30,0.13)', border: C.gold, width: 1.5 },
    { fill: 'rgba(107,93,79,0.07)', border: 'rgba(107,93,79,0.45)', width: 1.2 },
    { fill: 'rgba(187,52,24,0.17)', border: C.zhusha, width: 2.5 },
  ]
  const boxSeriesData = boxes.map((box, idx) => ({
    value: box,
    itemStyle: {
      color: boxColors[idx]?.fill ?? 'rgba(180,155,110,0.1)',
      borderColor: boxColors[idx]?.border ?? C.gold,
      borderWidth: boxColors[idx]?.width ?? 1.5,
    },
  }))

  return {
    backgroundColor: 'transparent',
    animation: true,
    animationDurationUpdate: 400,

    tooltip: {
      trigger: 'item',
      appendToBody: true,
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderColor: C.panelBorder,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: C.textPrimary, fontSize: 11 },
      extraCssText: 'border-radius:6px; box-shadow: 0 4px 16px rgba(62,48,32,0.14);',
      formatter: (params: any) => {
        const idx = (params.dataIndex as number) ?? 0
        const roles = ['全国最高', '全国均值', '当前省']
        const names = [topShortName, '全国', curName]
        const boxArr = boxes[idx] ?? []
        const ac = medColors[idx] ?? C.textPrimary
        return `<div style="font-weight:700;color:${ac};font-size:13px;margin-bottom:5px;border-bottom:1px solid ${C.panelBorder};padding-bottom:4px">`
          + `${names[idx]} <span style="font-size:10px;font-weight:400;opacity:.7">${roles[idx]}</span></div>`
          + `<table style="border-collapse:collapse;line-height:1.7">`
          + `<tr><td style="color:${C.textMuted};padding-right:12px">最高薪资</td><td style="font-variant-numeric:tabular-nums;font-weight:600">${boxArr[4]}K</td></tr>`
          + `<tr><td style="color:${ac};font-weight:700">中位薪资</td><td style="font-variant-numeric:tabular-nums;font-weight:700;color:${ac}">${boxArr[2]}K</td></tr>`
          + `<tr><td style="color:${C.textMuted}">最低薪资</td><td style="font-variant-numeric:tabular-nums;font-weight:600">${boxArr[0]}K</td></tr>`
          + `</table>`
      },
    },

    graphic: [{
      type: 'text',
      top: 6, left: 8,
      z: 8,
      style: {
        text: `${deltaArrow} ${deltaSign}${delta}K vs 全国均`,
        fill: deltaColor,
        fontSize: 11,
        fontFamily: 'KaiTi, serif',
        fontWeight: 'bold',
      },
    }],

    legend: {
      data: ['薪资分布'],
      top: 4, right: 4,
      textStyle: { color: C.textSecondary, fontSize: 10 },
      icon: 'roundRect', itemWidth: 8, itemHeight: 5,
    },

    grid: { top: 28, left: '8%', right: '8%', bottom: 32 },

    xAxis: {
      type: 'category',
      data: labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: C.panelBorder } },
      axisLabel: {
        interval: 0,
        fontSize: 11,
        formatter: (val: string) => val === curName ? `{cur|● ${val}}` : `{other|${val}}`,
        rich: {
          cur: { color: C.zhusha, fontWeight: 'bold' as const, fontSize: 12 },
          other: { color: C.textSecondary, fontSize: 11 },
        },
      },
    },

    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: C.textMuted, fontSize: 9, formatter: (v: number) => v + 'K' },
      splitLine: { lineStyle: { type: [4, 4] as any, color: 'rgba(139,37,0,0.07)' } },
    },

    series: [
      {
        name: '薪资分布',
        type: 'boxplot',
        data: boxSeriesData,
        boxWidth: ['38%', '62%'],
        markPoint: {
          symbolKeepAspect: true,
          data: markPointData,
          tooltip: { show: false },
        },
      },
    ],
  }
})

watch([provinceData, selectedProvince, roleSearch], () => {
  void refreshCompareColumns()
}, { immediate: true })

// Update mapOption to reflect highlighting — 内凹嵌入效果
const mapOption = computed<any>(() => {
  const provinceSelectable = hasSelectedJob.value
  /* activeLevel 筛选 regions — 同色系低调处理 */
  const chinaRegions = activeLevel.value === null
    ? hiddenRegions
    : [
      ...hiddenRegions,
      ...provinceData.value.map(p => {
        const level = p.value <= 20 ? 1 : p.value <= 40 ? 2 : p.value <= 60 ? 3 : 4
        const match = level === activeLevel.value
        return match
          ? {
            name: p.name,
            itemStyle: {
              areaColor: 'rgba(166,124,82,0.45)',
              borderColor: 'rgba(120,90,50,0.6)',
              borderWidth: 1.5,
            },
            label: { show: true, color: '#5A3E1B', fontWeight: 'bold', fontSize: 14,
              formatter: (p: any) => shortName(p.name || '') },
          }
          : {
            name: p.name,
            itemStyle: {
              areaColor: 'rgba(210,180,140,0.1)',
              borderColor: 'rgba(180,160,130,0.2)',
              borderWidth: 0.4,
            },
            label: { show: false },
          }
      }),
    ]

  const data = provinceData.value.map(p => ({ ...p }))
  const selectedProvinceRegion = selectedProvince.value
    ? {
        name: selectedProvince.value,
        itemStyle: {
          areaColor: 'rgba(155,100,50,0.85)',
          borderColor: 'rgba(90,45,5,0.95)',
          borderWidth: 2,
        },
        label: {
          show: true,
          color: '#2A1A08',
          fontWeight: 'bold' as const,
          fontSize: 16,
          formatter: (p: any) => shortName(p.name || ''),
        },
      }
    : null

  /* 世界底图中隐藏 China（由上层中国地图覆盖） */
  const worldLabelStyle = { show: true, color: 'rgba(120,100,70,0.55)', fontSize: 9, fontFamily: 'var(--font-title), serif', fontStyle: 'italic' as const }
  const worldHiddenRegions = [
    { name: 'China', itemStyle: { areaColor: 'transparent', borderWidth: 0, borderColor: 'transparent' }, label: { show: false } },
    { name: 'Russia', label: worldLabelStyle },
    { name: 'Mongolia', label: worldLabelStyle },
    { name: 'Japan', label: worldLabelStyle },
    { name: 'South Korea', label: worldLabelStyle },
    { name: 'North Korea', label: worldLabelStyle },
    { name: 'Vietnam', label: worldLabelStyle },
    { name: 'Laos', label: worldLabelStyle },
    { name: 'Myanmar', label: worldLabelStyle },
    { name: 'Thailand', label: worldLabelStyle },
    { name: 'Cambodia', label: worldLabelStyle },
    { name: 'Philippines', label: worldLabelStyle },
    { name: 'India', label: worldLabelStyle },
    { name: 'Nepal', label: worldLabelStyle },
    { name: 'Bangladesh', label: worldLabelStyle },
    { name: 'Pakistan', label: worldLabelStyle },
    { name: 'Afghanistan', label: worldLabelStyle },
    { name: 'Kazakhstan', label: worldLabelStyle },
    { name: 'Kyrgyzstan', label: worldLabelStyle },
    { name: 'Tajikistan', label: worldLabelStyle },
    { name: 'Indonesia', label: worldLabelStyle },
    { name: 'Malaysia', label: worldLabelStyle },
  ]

  // ✅ 公共定位配置：所有 geo 统一使用相同基线，避免错位
  const commonGeo = {
    boundingCoords: [[-180, 90], [180, -90]], // ✅ 强制4层geo使用全球范围作为zoom=1基线
    center: (vchartRef.value?.getOption?.()?.geo?.[0]?.center as number[]) ?? [104, 35],
    zoom: (vchartRef.value?.getOption?.()?.geo?.[0]?.zoom as number) ?? 4.5,
    roam: false,
    scaleLimit: { min: 1.0, max: 10 },
  }

  const option:any = {
    backgroundColor: 'transparent',
    animation: false,
    hoverLayerThreshold: Infinity,
    tooltip: {
      show: provinceSelectable,
      trigger: 'item', confine: true, transitionDuration: 0, showDelay: 60,
      backgroundColor: 'rgba(62,48,32,0.92)',
      borderColor: '#8B6914',
      borderWidth: 1,
      padding: [12, 16],
      textStyle: { color: '#F0E6D2', fontFamily: 'var(--font-title), KaiTi, serif', fontSize: 14 },
      extraCssText: 'border-radius:6px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);',
      formatter: (params: any) => {
        if (!params.name) return ''
        return `<div style="font-weight:700;margin-bottom:6px;color:#8B6914;font-size:15px;border-bottom:1px solid rgba(139,105,20,0.3);padding-bottom:4px">${params.name}</div><span style="color:#8B7A5E">岗位需求指数:</span> <b style="color:#6B4E14;font-size:16px">${params.value ?? '-'}</b>`
      }
    },
    visualMap: {
      left: 16, bottom: 48, min: 0, max: 100,
      text: ['高需求', '低需求'], calculable: true, show: true,
      inRange: { color: ['#e0d4be', '#d4b896', '#c49a6c', '#b07840', '#8B5E14', '#6B3A0A'] },
      textStyle: { color: '#3E3020', fontFamily: 'var(--font-title), KaiTi, serif', fontSize: 11, fontWeight: 'bold' },
      itemWidth: 12, itemHeight: 80,
      backgroundColor: 'rgba(245,245,243,0.85)',
      padding: [8, 10],
      borderColor: 'rgba(139,105,20,0.3)',
      borderWidth: 1,
      borderRadius: 8,
    },
    geo: [
      // geo[0]: 世界底图 — 静默，无 shadowBlur，仅填色+边框
      {
        ...commonGeo,
        map: 'world', zlevel: 0, silent: true,
        label: { show: false },
        itemStyle: {
          areaColor: 'rgba(212,201,181,0.18)',
          borderColor: 'rgba(120,100,70,0.3)', borderWidth: 0.6,
        },
        emphasis: { disabled: true },
        regions: worldHiddenRegions,
      },
      // geo[1]: 中国主交互层 — 无 shadowBlur，hover/select 用 areaColor+border 区分
      {
        ...commonGeo,
        map: 'china', zlevel: 1,
        silent: !provinceSelectable,
        itemStyle: {
          areaColor: 'rgba(210,185,145,0.6)',
          borderColor: 'rgba(139,105,20,0.55)', borderWidth: 1.2,
        },
        label: {
          show: true, color: 'rgba(62,48,32,0.75)', fontSize: 14,
          fontFamily: 'var(--font-title), KaiTi, serif', fontWeight: 500,
          formatter: (p: any) => shortName(p.name || ''),
        },
        emphasis: {
          itemStyle: {
            areaColor: 'rgba(176,120,64,0.8)',
            borderColor: 'rgba(107,58,10,0.9)', borderWidth: 2,
          },
          label: { show: true, color: '#2A1A08', fontSize: 16, fontWeight: 'bold',
            fontFamily: 'var(--font-title), KaiTi, serif',
            formatter: (p: any) => shortName(p.name || '') },
        },
        select: {
          itemStyle: {
            areaColor: 'rgba(155,100,50,0.85)',
            borderColor: 'rgba(90,45,5,0.95)', borderWidth: 2,
          },
          label: { show: true, color: '#2A1A08', fontWeight: 'bold', fontSize: 16,
            formatter: (p: any) => shortName(p.name || '') },
        },
        regions: selectedProvinceRegion ? [...chinaRegions, selectedProvinceRegion] : chinaRegions,
      },
    ],
    series: [{
      name: '需求量', type: 'map', geoIndex: 1,
      data: data, selectedMode: provinceSelectable ? 'single' : false, silent: !provinceSelectable, animation: true, animationDurationUpdate: 300
    }],
  }
  if(isRealOverview.value){option.visualMap={show:false};option.tooltip={show:false};option.series[0].data=[]}
  return option
})

/* ═══ 事件处理 ═══ */
function handleMapClick(params: any) {
  if (!params.name || !hasSelectedJob.value) return
  if (params.name === '台湾省') {
    ElMessage({ message: '暂无中国台湾地区数据', type: 'warning', duration: 2000 })
    return
  }
  selectedProvince.value = params.name
  aiCommentPage.value = 0
}

function selectRankedProvince(name: string) {
  if (!hasSelectedJob.value) return
  if (name === '台湾省') {
    ElMessage({ message: '暂无中国台湾地区数据', type: 'warning', duration: 2000 })
    return
  }
  selectedProvince.value = name
  aiCommentPage.value = 0
}

function doSearch() {
  if(isRealOverview.value){selectedProvince.value=null;aiCommentPage.value=0;return}
  const nextRole = roleSearch.value.trim() || '前端开发'
  roleSearch.value = nextRole
  _baseProvinceData.value = getProvinceData(nextRole)
  const normalizedRole = normalizeRouteRole(nextRole)
  if (roleOptions.includes(normalizedRole as CareerRole)) {
    targetRole.value = normalizedRole as CareerRole
  }
  selectedProvince.value = null
  aiCommentPage.value = 0
}

function handleSearchSubmit() {
  const q = roleSearch.value.trim()
  if (!q) return
  if(isRealOverview.value){const group=overviewGroups.value.findIndex(g=>g.jobs.some(name=>name===q||name.includes(q)));if(group>=0)setOverviewPage(Math.floor(group/5))}
  // 尝试精确 / 模糊匹配气泡内的岗位
  const exact = _flatJobs.find(j => j.jobName === q)
  const fuzzy = !exact ? _flatJobs.find(j => j.jobName.includes(q) || q.includes(j.jobName)) : null
  const matched = exact || fuzzy
  if (matched) {
    selectedJob.value = { id: matched.domainId, name: matched.domainName, domainColor: matched.domainColor, jobName: matched.jobName }
    roleSearch.value = matched.jobName
  } else {
    selectedJob.value = null
    roleSearch.value = q
  }
  doSearch()
}

function prevAiPage() { if (aiCommentPage.value > 0) aiCommentPage.value-- }
function nextAiPage() { if (aiCommentPage.value < aiComments.value.length - 1) aiCommentPage.value++ }

/* ═══ AI Drawer 对话 ═══ */
interface DrawerMsg {
  role: 'user' | 'assistant'
  content: string
  time: string
  thinking?: string
  thinkingDuration?: number
  status?: 'streaming' | 'done'
  id?: string
}
const showAiDrawer = ref(false)
const aiDrawerInput = ref('')
const aiDrawerLoading = ref(false)
const aiDrawerMessages = ref<DrawerMsg[]>([])
const aiDrawerScrollRef = ref<HTMLDivElement>()

/* ── Drawer 流式输出状态 ── */
const drawerStreamingId = ref<string | null>(null)
const drawerStreamingContent = ref('')
const drawerIsThinking = ref(false)
const drawerThinkingSteps = ref<string[]>([])
const drawerCurrentThinkingStep = ref(0)
const drawerThinkingElapsed = ref(0)
const drawerExpandedThinking = ref<Set<string>>(new Set())
let _drawerStreamTimer: ReturnType<typeof setInterval> | null = null
let _drawerThinkTimer: ReturnType<typeof setTimeout> | null = null
let _drawerElapsedTimer: ReturnType<typeof setInterval> | null = null
let _drawerMsgIdCounter = 0

function clearDrawerTimers() {
  if (_drawerStreamTimer) { clearInterval(_drawerStreamTimer); _drawerStreamTimer = null }
  if (_drawerThinkTimer) { clearTimeout(_drawerThinkTimer); _drawerThinkTimer = null }
  if (_drawerElapsedTimer) { clearInterval(_drawerElapsedTimer); _drawerElapsedTimer = null }
}

function simulateDrawerThinking(steps: string[]): Promise<number> {
  return new Promise(resolve => {
    drawerThinkingSteps.value = steps
    drawerCurrentThinkingStep.value = 0
    drawerIsThinking.value = true
    const start = Date.now()
    drawerThinkingElapsed.value = 0
    _drawerElapsedTimer = setInterval(() => {
      drawerThinkingElapsed.value = Math.floor((Date.now() - start) / 1000)
    }, 1000)
    let step = 0
    const advance = () => {
      if (step < steps.length) {
        drawerCurrentThinkingStep.value = step
        step++
        _drawerThinkTimer = setTimeout(advance, 600 + Math.random() * 800) as unknown as ReturnType<typeof setTimeout>
      } else {
        if (_drawerElapsedTimer) { clearInterval(_drawerElapsedTimer); _drawerElapsedTimer = null }
        drawerIsThinking.value = false
        resolve(Math.round((Date.now() - start) / 1000))
      }
    }
    advance()
  })
}

function simulateDrawerStreaming(msgId: string, fullContent: string): Promise<void> {
  return new Promise(resolve => {
    drawerStreamingId.value = msgId
    drawerStreamingContent.value = ''
    let idx = 0
    const speed = 25 + Math.random() * 20
    _drawerStreamTimer = setInterval(() => {
      if (idx < fullContent.length) {
        const chunk = Math.random() > 0.9 ? 3 : (Math.random() > 0.7 ? 2 : 1)
        drawerStreamingContent.value += fullContent.slice(idx, idx + chunk)
        idx += chunk
        _scrollDrawer()
      } else {
        if (_drawerStreamTimer) { clearInterval(_drawerStreamTimer); _drawerStreamTimer = null }
        drawerStreamingId.value = null
        drawerStreamingContent.value = ''
        resolve()
      }
    }, speed)
  })
}

function renderDrawerContent(content: string): string {
  return content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

function getDrawerDisplayContent(msg: DrawerMsg): string {
  if (msg.id && msg.id === drawerStreamingId.value) {
    return renderDrawerContent(drawerStreamingContent.value)
  }
  return renderDrawerContent(msg.content)
}

function toggleDrawerThinking(msgId: string) {
  if (drawerExpandedThinking.value.has(msgId)) {
    drawerExpandedThinking.value.delete(msgId)
  } else {
    drawerExpandedThinking.value.add(msgId)
  }
}

function _getDrawerTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 16)
}
function _scrollDrawer() {
  nextTick(() => {
    if (aiDrawerScrollRef.value) aiDrawerScrollRef.value.scrollTop = aiDrawerScrollRef.value.scrollHeight
  })
}

function openAiDrawer() {
  if (aiDrawerMessages.value.length === 0) {
    const job = selectedJob.value?.jobName ?? roleSearch.value
    const prov = selectedProvince.value ?? '全国'
    aiDrawerMessages.value.push({
      role: 'assistant',
      content: `你好！当前分析岗位：${job}，目标省份：${prov}。\n你可以问我关于这个岗位的前景、薪资趋势、技能要求等问题，我会给你可执行的建议。`,
      time: _getDrawerTimestamp(),
    })
  }
  showAiDrawer.value = true
  _scrollDrawer()
}

const aiDrawerQuickPrompts = [
  '这个岗位未来两年前景如何？',
  '薪资还有多少上涨空间？',
  '我需要掌握哪些核心技能？',
]

interface DrawerQuickPreset {
  question: string
  reply: string
  thinkingSteps: string[]
}

const drawerPresets: Record<string, DrawerQuickPreset[]> = {
  /* ── 前端开发 ── */
  'Vue 前端工程师': [
    { question: '这个岗位未来两年前景如何？', reply: 'Vue 前端工程师在未来两年仍有稳定需求，尤其在国内市场。\n\n**利好因素：**\n1. Vue 3 生态逐步成熟，企业级项目迁移带来大量改造需求\n2. Nuxt 3 的 SSR/ISR 方案让 Vue 在中大型项目中更有竞争力\n3. 国内头部公司（字节、美团、快手）持续招聘 Vue 方向\n\n**风险提示：**\n- 纯页面切图类岗位会被 AI 工具压缩，需往工程化方向深入\n- 跨端方案（uni-app / Taro）能力会成为加分项\n\n建议关注 **Vue 3 + TypeScript + Vite** 工程链路的深度掌握。', thinkingSteps: ['检索 Vue 生态最新趋势数据...', '分析头部企业招聘需求变化...', '评估技术栈演进方向...', '生成前景分析报告...'] },
    { question: '薪资还有多少上涨空间？', reply: '基于当前市场数据，Vue 前端工程师的薪资空间如下：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：10-16K，增长空间约 30%\n- 中级（3-5年）：18-28K，增长空间约 25%\n- 高级（5年+）：28-45K，增长空间约 15%\n\n**薪资提升关键因素：**\n1. 掌握 SSR / 微前端架构能力可提升 15-20%\n2. 有大型项目性能优化经验可提升 10-15%\n3. 具备团队 Tech Lead 经验可突破 40K+ 天花板\n\n当前市场中级 Vue 工程师供需比约 1:1.3，仍属于卖方市场。', thinkingSteps: ['获取各级别薪资分布数据...', '计算供需比与增长趋势...', '对比同级别其他技术栈薪资...'] },
    { question: '我需要掌握哪些核心技能？', reply: '作为 Vue 前端工程师，以下技能按优先级排列：\n\n**必备技能（P0）：**\n- Vue 3 Composition API + `<script setup>` 熟练应用\n- TypeScript 工程级使用（泛型、类型体操基础）\n- Vite 构建配置与性能调优\n- Pinia 状态管理 + Vue Router\n\n**竞争力技能（P1）：**\n- Nuxt 3 SSR / SSG 实战\n- 微前端方案（qiankun / Module Federation）\n- 组件库开发与 Design Token 体系\n- E2E 测试（Playwright / Cypress）\n\n**加分技能（P2）：**\n- WebGL / Canvas 可视化基础\n- Node.js BFF 层开发\n- CI/CD 流水线配置', thinkingSteps: ['分析 Vue 岗位 JD 高频关键词...', '按技能热度和薪资关联度排序...', '生成分层技能清单...'] },
  ],
  'React 前端工程师': [
    { question: '这个岗位未来两年前景如何？', reply: 'React 前端工程师在全球和国内市场均保持强劲需求。\n\n**利好因素：**\n1. React 19 + Server Components 带来全新架构范式\n2. Next.js App Router 已成为全栈 React 开发的标准方案\n3. React Native / Expo 持续巩固跨端生态\n\n**市场趋势：**\n- 外企和出海业务线对 React 需求最为集中\n- 国内新项目中 React 占比约 35%，仅次于 Vue\n- AI + React 的前端智能化方向正在兴起\n\n建议重点关注 **RSC（React Server Components）** 和 **Next.js** 的深度实践。', thinkingSteps: ['检索 React 生态和 Next.js 发展趋势...', '分析外企与国内企业招聘偏好...', '评估 Server Components 影响...', '汇总前景分析...'] },
    { question: '薪资还有多少上涨空间？', reply: 'React 前端工程师薪资水平整体略高于 Vue 方向：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：12-18K，增长空间约 35%\n- 中级（3-5年）：20-32K，增长空间约 28%\n- 高级（5年+）：32-50K+，增长空间约 18%\n\n**薪资溢价场景：**\n1. 外企 / 出海业务：薪资普遍高出 20-30%\n2. 全栈（Next.js + Node）能力：额外溢价 15%\n3. React Native 跨端经验：移动端项目可叠加 10%\n\nReact 在外企和大厂的定价权更强，如果目标是高薪，建议深耕 Next.js 全栈方向。', thinkingSteps: ['获取 React 岗位薪资分位数据...', '对比 Vue/React 薪资差异...', '分析外企溢价场景...'] },
    { question: '我需要掌握哪些核心技能？', reply: '以下是 React 前端工程师的核心技能路线：\n\n**必备技能（P0）：**\n- React 18/19 Hooks 深度使用（useTransition、useDeferredValue）\n- TypeScript + React 类型体系\n- Next.js App Router + Server Components\n- 状态管理（Zustand / Jotai / React Query）\n\n**竞争力技能（P1）：**\n- React Server Components 架构设计\n- 服务端渲染 / 流式渲染优化\n- Monorepo（Turborepo）+ 组件库发布\n- React Testing Library + Playwright\n\n**加分技能（P2）：**\n- React Native / Expo 跨端开发\n- GraphQL（Apollo / urql）\n- Tailwind CSS + Headless UI 组件体系', thinkingSteps: ['提取 React 岗位 JD 核心要求...', '按市场需求热度加权排序...', '生成分级技能图谱...'] },
  ],
  '可视化工程师': [
    { question: '这个岗位未来两年前景如何？', reply: '可视化工程师属于前端细分中的稀缺方向，前景乐观。\n\n**利好因素：**\n1. 数据驱动决策的趋势下，BI 和数据大屏需求持续增长\n2. 3D 可视化（数字孪生、WebGPU）打开了新的应用场景\n3. AI 生成图表尚无法替代复杂交互可视化的定制能力\n\n**需求集中领域：**\n- 金融风控大屏、城市数字孪生、工业 IoT 监控\n- 互联网大厂的数据平台和 BI 工具团队\n\n**风险提示：**\n- 简单图表类需求会被 AI 工具侵蚀\n- 需往 **3D / 地理信息 / 大规模数据渲染** 方向深入才有长期壁垒', thinkingSteps: ['分析可视化岗位市场规模...', '评估 AI 对可视化领域的替代风险...', '检索数字孪生等新兴场景需求...'] },
    { question: '薪资还有多少上涨空间？', reply: '可视化工程师因稀缺性，薪资定价通常高于普通前端：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：12-18K\n- 中级（3-5年）：22-35K，稀缺度溢价约 15%\n- 高级（5年+）：35-55K，顶尖人才可达 60K+\n\n**高薪突破路径：**\n1. WebGL / Three.js 3D 可视化能力：溢价 20%+\n2. GIS 地理信息可视化（Mapbox / Cesium）：特定行业溢价 25%\n3. 大规模数据渲染优化（Canvas / WebGPU）：技术壁垒带来议价权\n\n核心优势在于**技术门槛高、人才供给少**，只要持续深耕，薪资天花板远高于普通前端。', thinkingSteps: ['获取可视化岗位薪资数据...', '计算稀缺度溢价系数...', '评估 3D/GIS 方向薪资增量...'] },
    { question: '我需要掌握哪些核心技能？', reply: '可视化工程师的技能栈较为专精：\n\n**必备技能（P0）：**\n- D3.js 数据驱动文档操作\n- ECharts / AntV 图表库深度定制\n- Canvas 2D 绑定与性能优化\n- SVG 动画与交互\n\n**竞争力技能（P1）：**\n- Three.js / WebGL 3D 场景构建\n- 地理信息可视化（Mapbox GL / Deck.gl）\n- 大数据量渲染优化（虚拟列表、LOD、Web Worker）\n- Shader 编程基础（GLSL）\n\n**加分技能（P2）：**\n- WebGPU 计算与渲染\n- 数字孪生平台集成经验\n- Python 数据处理（配合 Jupyter 做探索性分析）', thinkingSteps: ['梳理可视化技术栈全景图...', '按岗位 JD 频次排序核心技能...', '生成分层学习路径...'] },
  ],
  /* ── 后端开发 ── */
  'Java 后端工程师': [
    { question: '这个岗位未来两年前景如何？', reply: 'Java 后端工程师仍是国内需求量最大的后端方向之一。\n\n**利好因素：**\n1. 金融、电商、企业服务等核心领域的存量 Java 系统庞大\n2. Spring Boot 3 + GraalVM 原生编译提升了 Java 的云原生竞争力\n3. 中大型公司的核心交易系统短期内不会迁移\n\n**趋势变化：**\n- 纯 CRUD 岗位减少，中间件 / 架构方向需求增加\n- 微服务治理、分布式事务等高阶能力成为分水岭\n- AI 对 Java 生态的影响主要在辅助编码层面，核心设计能力不可替代\n\n建议从 **Spring Cloud + 分布式** 方向深入，避免停留在单体 CRUD 层面。', thinkingSteps: ['分析 Java 岗位市场存量与增量...', '评估 Spring Boot 3 生态演进...', '对比 Go/Rust 对 Java 市场的冲击...', '生成趋势分析...'] },
    { question: '薪资还有多少上涨空间？', reply: 'Java 后端工程师薪资分化明显，架构能力是关键分水岭：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：10-16K，竞争激烈\n- 中级（3-5年）：18-30K，增长空间约 30%\n- 高级/架构（5年+）：30-50K+，分布式经验可突破 55K\n\n**薪资杠杆点：**\n1. 微服务架构设计能力：薪资提升 20%\n2. 高并发 / 性能调优经验：提升 15%\n3. 中间件开发经验（MQ、RPC、网关）：提升 20%\n\n**注意：** 初级 Java 市场供给过剩，需尽快建立差异化优势。', thinkingSteps: ['获取 Java 各级别薪资分位...', '分析架构能力与薪资关联度...', '评估初级市场供给压力...'] },
    { question: '我需要掌握哪些核心技能？', reply: 'Java 后端工程师技能栈要求深且广：\n\n**必备技能（P0）：**\n- Spring Boot 3 + Spring Cloud 微服务全家桶\n- MySQL 深度优化（索引、慢查询、分库分表）\n- Redis 缓存方案设计（穿透/击穿/雪崩防御）\n- 消息队列（Kafka / RocketMQ）\n\n**竞争力技能（P1）：**\n- 分布式事务（Seata / TCC / Saga）\n- JVM 调优与 GC 分析\n- Kubernetes + Docker 容器化部署\n- 链路追踪与可观测性（SkyWalking / Prometheus）\n\n**加分技能（P2）：**\n- DDD 领域驱动设计实践\n- GraalVM Native Image\n- 大数据组件（Flink / Spark 基础）', thinkingSteps: ['提取 Java 岗位 JD 高频技能...', '按薪资关联度加权排序...', '生成分级技能清单...'] },
  ],
  'Go 后端工程师': [
    { question: '这个岗位未来两年前景如何？', reply: 'Go 后端工程师处于高速增长期，尤其在云原生和基础设施领域。\n\n**利好因素：**\n1. 云原生生态（Kubernetes、Docker、Istio）几乎全部用 Go 构建\n2. 字节跳动、B站、七牛等公司大规模使用 Go\n3. Go 在微服务和高并发场景下的性能优势明显\n\n**增长点：**\n- 基础架构和中间件方向的 Go 需求年增长约 25%\n- AI 推理服务的后端网关层越来越多采用 Go\n- 区块链和 Web3 项目中 Go 使用率很高\n\n**需要注意：** Go 的业务开发岗位增长较慢，主要增量在基础设施和中间件方向。', thinkingSteps: ['检索 Go 语言岗位增长数据...', '分析云原生生态对 Go 的拉动...', '评估 Go vs Rust 的定位差异...'] },
    { question: '薪资还有多少上涨空间？', reply: 'Go 后端工程师因供给相对紧张，薪资普遍高于同级别 Java：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：14-20K\n- 中级（3-5年）：22-35K，增长空间约 30%\n- 高级（5年+）：35-55K，基础设施方向可达 60K+\n\n**薪资溢价方向：**\n1. Kubernetes 二次开发 / Operator 开发：溢价 25%\n2. 分布式存储 / 数据库内核：溢价 30%+\n3. 服务网格 / eBPF 等前沿领域：稀缺度极高\n\nGo 工程师在头部互联网公司的定价权很强，但中小公司岗位相对少。建议优先瞄准头部公司。', thinkingSteps: ['获取 Go 岗位薪资分布数据...', '对比 Go/Java 同级别薪资差异...', '分析基础设施方向溢价...'] },
    { question: '我需要掌握哪些核心技能？', reply: 'Go 后端工程师需要兼顾语言特性和基础设施能力：\n\n**必备技能（P0）：**\n- Go 并发模型（goroutine、channel、sync 包）\n- Go 标准库深度使用（net/http、context、io）\n- gRPC + Protocol Buffers\n- MySQL / PostgreSQL + Redis\n\n**竞争力技能（P1）：**\n- Kubernetes 原理与 Operator 开发\n- 微服务框架（go-zero / Kratos / go-micro）\n- 分布式系统设计（一致性、CAP、Raft）\n- 性能分析工具（pprof、trace、benchmark）\n\n**加分技能（P2）：**\n- eBPF 内核级可观测\n- 分布式存储原理（etcd、TiKV）\n- Rust 基础（在 Go 生态中逐渐渗透）', thinkingSteps: ['梳理 Go 岗位核心技能要求...', '按云原生方向加权排序...', '生成分级技能路径...'] },
  ],
  'Python 后端工程师': [
    { question: '这个岗位未来两年前景如何？', reply: 'Python 后端工程师受益于 AI 浪潮，需求持续增长。\n\n**利好因素：**\n1. AI / ML 应用落地需要大量 Python 后端支撑（模型服务化、API 网关）\n2. 数据平台和自动化运维持续依赖 Python 生态\n3. FastAPI 等现代框架让 Python 后端性能不再是瓶颈\n\n**增长方向：**\n- AI 应用后端（LLM API 编排、RAG 服务）增速最快\n- 数据工程方向（ETL、数据管道）稳定增长\n- 传统 Django/Flask Web 开发增速放缓\n\n建议往 **AI 应用后端 + FastAPI** 方向发展，纯 Web 开发方向竞争力有限。', thinkingSteps: ['分析 Python 后端岗位增长趋势...', '评估 AI 浪潮对 Python 的拉动效应...', '对比不同框架方向的需求差异...'] },
    { question: '薪资还有多少上涨空间？', reply: 'Python 后端薪资受方向影响较大：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：10-16K\n- 中级（3-5年）：18-30K，AI 方向可达 35K\n- 高级（5年+）：30-50K，AI 基础设施方向更高\n\n**方向差异：**\n1. AI 应用后端（LLM 服务化）：薪资比普通 Python 后端高 25-40%\n2. 数据工程方向：薪资与 Java 后端持平\n3. 纯 Django/Flask Web 开发：薪资增长已接近天花板\n\n关键建议：Python 后端的薪资天花板取决于你是否能切入 **AI + 数据** 赛道。', thinkingSteps: ['获取 Python 各方向薪资数据...', '计算 AI 方向溢价幅度...', '评估 Web 方向天花板...'] },
    { question: '我需要掌握哪些核心技能？', reply: 'Python 后端工程师的技能栈需要与时俱进：\n\n**必备技能（P0）：**\n- FastAPI / Django REST Framework\n- SQLAlchemy + PostgreSQL / MySQL\n- Redis 缓存与消息队列（Celery）\n- Docker + 基本部署运维\n\n**竞争力技能（P1）：**\n- LLM 应用开发（LangChain / LlamaIndex）\n- 异步编程（asyncio、aiohttp）\n- 数据管道（Apache Airflow / Prefect）\n- Kubernetes 部署与服务编排\n\n**加分技能（P2）：**\n- 模型推理服务（vLLM / TensorRT）\n- 向量数据库（Milvus / Qdrant）\n- Spark / Flink 大数据处理', thinkingSteps: ['分析 Python 后端 JD 技能趋势...', '按 AI 应用方向加权...', '生成分层技能路径...'] },
  ],
  /* ── 测试开发 ── */
  '测试开发工程师': [
    { question: '这个岗位未来两年前景如何？', reply: '自动化测试工程师的角色正在从"测试执行者"向"质量工程师"转型。\n\n**利好因素：**\n1. DevOps 和持续交付要求自动化测试全面覆盖\n2. AI 测试工具（自动生成用例、智能回归）提升了测试工程师的杠杆\n3. 测试左移和质量内建理念在大厂深入推进\n\n**趋势变化：**\n- 纯手工功能测试岗位大幅减少\n- 自动化 + 平台化能力成为准入门槛\n- 测试开发（SDET）定位更接近研发工程师\n\n建议同时掌握 **UI 自动化 + API 自动化 + CI 集成** 三条线。', thinkingSteps: ['分析测试岗位角色演变趋势...', '评估 AI 测试工具的影响...', '检索 DevOps 对测试的需求变化...'] },
    { question: '薪资还有多少上涨空间？', reply: '自动化测试工程师薪资已明显高于手工测试：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：10-15K\n- 中级（3-5年）：16-26K，增长空间约 25%\n- 高级（5年+）：26-40K，测试架构师可达 45K\n\n**薪资提升杠杆：**\n1. 测试平台开发能力：溢价 20%\n2. 性能 / 安全测试专项：溢价 15%\n3. 全栈质量保障（含 CI/CD 流水线）：溢价 20%\n\n与同级别研发相比，测试薪资通常低 10-15%，但测试架构师和质量平台方向可以弥补差距。', thinkingSteps: ['获取自动化测试岗位薪资数据...', '对比测试与研发薪资差异...', '分析平台化能力的溢价...'] },
    { question: '我需要掌握哪些核心技能？', reply: '自动化测试工程师的技能栈日趋全面：\n\n**必备技能（P0）：**\n- Selenium / Playwright UI 自动化\n- API 测试框架（Pytest + Requests / REST Assured）\n- 测试用例设计方法（等价类、边界值、场景法）\n- Git + Jenkins / GitHub Actions CI 集成\n\n**竞争力技能（P1）：**\n- Appium / XCUITest 移动端自动化\n- Docker 容器化测试环境管理\n- 测试数据工厂和 Mock 服务搭建\n- JMeter / Locust 性能测试基础\n\n**加分技能（P2）：**\n- AI 辅助测试用例生成\n- 混沌工程 / 故障注入\n- Allure 测试报告与质量度量体系', thinkingSteps: ['梳理自动化测试核心技能图谱...', '按 JD 高频词排序...', '生成分层学习建议...'] },
  ],
  '质量平台工程师': [
    { question: '这个岗位未来两年前景如何？', reply: '质量平台工程师是测试领域中最接近研发的方向，前景较好。\n\n**利好因素：**\n1. 大厂普遍在建设内部质量中台（用例管理、环境管理、度量看板）\n2. 持续测试和智能测试平台化是行业趋势\n3. 该方向技术深度要求高，AI 难以替代\n\n**需求特点：**\n- 主要集中在中大型互联网公司和金融科技企业\n- 中小公司更倾向于使用成熟工具而非自研平台\n- 该方向人才稀缺，竞争压力小于纯测试执行\n\n建议积累 **测试平台架构 + 数据驱动质量度量** 的复合能力。', thinkingSteps: ['分析质量平台岗位市场分布...', '评估大厂质量中台建设趋势...', '对比该方向与传统测试的需求差异...'] },
    { question: '薪资还有多少上涨空间？', reply: '质量平台工程师薪资接近同级别研发工程师：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：12-18K\n- 中级（3-5年）：20-32K，增长空间约 28%\n- 高级（5年+）：32-48K，平台架构师可达 50K+\n\n**薪资优势来源：**\n1. 全栈开发能力（前后端 + 基础设施）：核心竞争力\n2. 质量度量体系设计经验：稀缺能力\n3. 跨团队协作和工具推广经验：管理线跳板\n\n该方向的薪资天花板接近研发架构师，远高于普通测试工程师。', thinkingSteps: ['获取质量平台岗位薪资数据...', '对比同级别研发薪资...', '分析全栈能力的溢价效应...'] },
    { question: '我需要掌握哪些核心技能？', reply: '质量平台工程师需要较强的全栈开发能力：\n\n**必备技能（P0）：**\n- Python / Java / Go 至少一门后端语言\n- Vue / React 前端开发基础\n- MySQL + Redis 数据存储\n- RESTful API 设计与开发\n\n**竞争力技能（P1）：**\n- 分布式任务调度（Celery / XXL-Job）\n- Kubernetes + Docker 环境管理\n- 测试数据管理和流量录制回放\n- ELK / Grafana 日志与度量可视化\n\n**加分技能（P2）：**\n- 智能测试算法（用例推荐、变更影响分析）\n- 前端低代码 / 可视化编排能力\n- 质量度量模型设计', thinkingSteps: ['梳理质量平台工程师技能要求...', '按全栈维度分层...', '生成学习路径...'] },
  ],
  '性能测试工程师': [
    { question: '这个岗位未来两年前景如何？', reply: '性能测试工程师是测试领域中技术壁垒最高的方向之一。\n\n**利好因素：**\n1. 高并发系统（电商大促、金融交易）始终需要性能保障\n2. 云原生架构下性能问题更复杂（容器资源、服务网格延迟）\n3. 该方向涉及底层系统知识，AI 替代风险极低\n\n**市场特点：**\n- 需求集中在电商、金融、游戏等高流量行业\n- 人才供给严重不足，优秀性能工程师极为抢手\n- 常与 SRE / 可靠性工程师角色重叠\n\n建议深入 **全链路压测 + 系统瓶颈分析** 方向，构建不可替代性。', thinkingSteps: ['分析性能测试岗位需求分布...', '评估云原生对性能测试的影响...', '对比 SRE 方向的角色重叠...'] },
    { question: '薪资还有多少上涨空间？', reply: '性能测试工程师因高门槛，薪资在测试领域最具竞争力：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：12-18K\n- 中级（3-5年）：22-35K，增长空间约 30%\n- 高级（5年+）：35-55K，首席性能专家可达 60K+\n\n**高薪关键能力：**\n1. 全链路压测方案设计与执行：核心价值\n2. JVM / Linux 内核级性能调优：溢价 25%\n3. APM 工具链（SkyWalking / Arthas / perf）：深度使用\n\n该方向的薪资天花板在测试领域最高，甚至可以超过部分研发工程师。', thinkingSteps: ['获取性能测试岗位薪资分位...', '分析高门槛带来的薪资溢价...', '评估行业分布对薪资的影响...'] },
    { question: '我需要掌握哪些核心技能？', reply: '性能测试工程师需要深厚的系统级知识：\n\n**必备技能（P0）：**\n- JMeter / Gatling / Locust 压测工具\n- HTTP 协议与网络基础（TCP、DNS、负载均衡）\n- Linux 性能分析（top、vmstat、perf、strace）\n- 性能指标体系（TPS、P99、吞吐量、资源利用率）\n\n**竞争力技能（P1）：**\n- JVM 调优（GC 分析、堆外内存、线程池）\n- 全链路压测方案（流量隔离、影子库）\n- APM 工具（SkyWalking、Prometheus + Grafana）\n- 数据库性能优化（慢查询、连接池、索引）\n\n**加分技能（P2）：**\n- eBPF 内核级分析\n- 混沌工程（ChaosBlade / LitmusChaos）\n- 容量规划与成本优化', thinkingSteps: ['梳理性能测试核心知识体系...', '按系统层次分级...', '生成深度学习路径...'] },
  ],
  /* ── 数据分析 ── */
  '商业数据分析师': [
    { question: '这个岗位未来两年前景如何？', reply: '商业数据分析师在各行业的需求持续且稳定。\n\n**利好因素：**\n1. 企业数据驱动决策的意识越来越强\n2. 电商、金融、游戏等行业对精细化运营的需求增长\n3. AI 工具让分析师能处理更复杂的分析任务\n\n**趋势变化：**\n- 基础的取数和报表类工作正在被 BI 工具和 AI 自动化\n- 需要具备业务洞察力和实验设计能力才有竞争力\n- "分析 + 策略"复合型人才最受欢迎\n\n建议在数据技能之外，深入理解 **业务指标体系和增长实验** 方法论。', thinkingSteps: ['分析数据分析师市场需求趋势...', '评估 AI 对基础分析工作的替代...', '检索行业对复合型人才的偏好...'] },
    { question: '薪资还有多少上涨空间？', reply: '商业数据分析师薪资与行业和业务理解深度强相关：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：10-16K\n- 中级（3-5年）：18-28K，增长空间约 25%\n- 高级/专家（5年+）：28-45K，策略分析师可达 50K\n\n**薪资杠杆点：**\n1. 行业 know-how（如电商增长、金融风控）：溢价 20%\n2. A/B 实验设计与因果推断能力：溢价 15%\n3. 数据产品化思维（指标体系、自助 BI）：管理线跳板\n\n数据分析师转管理（数据团队 Lead）或转产品经理的路径也很成熟。', thinkingSteps: ['获取数据分析师薪资分布...', '分析行业差异对薪资的影响...', '评估业务能力的溢价效应...'] },
    { question: '我需要掌握哪些核心技能？', reply: '商业数据分析师需要数据 + 业务双轮驱动：\n\n**必备技能（P0）：**\n- SQL 高级查询（窗口函数、CTE、性能优化）\n- Python 数据分析（Pandas、NumPy、Matplotlib）\n- Excel / Google Sheets 高级功能\n- BI 工具（Tableau / Power BI / Metabase）\n\n**竞争力技能（P1）：**\n- A/B 实验设计与统计检验\n- 指标体系设计（北极星指标、OSM 模型）\n- 用户分群与生命周期分析\n- 数据仓库基础（维度建模、ETL 概念）\n\n**加分技能（P2）：**\n- 因果推断方法（DID、PSM、RDD）\n- 机器学习预测模型基础\n- 数据叙事与演示能力', thinkingSteps: ['梳理数据分析师核心技能...', '按业务驱动维度分层...', '生成学习路径建议...'] },
  ],
  '数据开发工程师': [
    { question: '这个岗位未来两年前景如何？', reply: '数据开发工程师在大数据和 AI 时代需求旺盛。\n\n**利好因素：**\n1. 数据基础设施（数仓、数据湖、实时计算）投入持续增长\n2. AI 大模型的训练和推理依赖数据管道建设\n3. 数据治理和合规要求推动数据工程体系化\n\n**增长最快的方向：**\n- 实时数据处理（Flink + Kafka）\n- 数据湖仓一体化（Lakehouse 架构）\n- AI 特征工程和数据标注管道\n\n建议掌握 **实时 + 离线双链路** 的数据开发能力，避免只做离线 ETL。', thinkingSteps: ['分析数据开发岗位增长趋势...', '评估 AI 对数据工程的需求拉动...', '检索实时计算方向的市场热度...'] },
    { question: '薪资还有多少上涨空间？', reply: '数据开发工程师薪资处于后端开发的上游水平：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：12-18K\n- 中级（3-5年）：20-32K，增长空间约 30%\n- 高级（5年+）：32-50K，数据架构师可达 55K+\n\n**薪资提升方向：**\n1. 实时计算（Flink）经验：溢价 20%\n2. 数据湖架构（Iceberg / Hudi）：溢价 18%\n3. 数据治理和质量保障体系：管理线跳板\n\n数据开发的薪资天花板与后端架构师相当，且岗位稳定性更高。', thinkingSteps: ['获取数据开发薪资分位数据...', '对比实时与离线方向薪资差异...', '评估数据架构师的天花板...'] },
    { question: '我需要掌握哪些核心技能？', reply: '数据开发工程师的技能栈偏基础设施：\n\n**必备技能（P0）：**\n- Hive SQL + Spark 离线处理\n- Kafka + Flink 实时数据处理\n- 数仓建模（维度建模、数据分层）\n- Python / Java / Scala 开发能力\n\n**竞争力技能（P1）：**\n- 数据湖（Apache Iceberg / Hudi / Delta Lake）\n- 任务调度（Airflow / DolphinScheduler）\n- 数据质量监控与治理\n- ClickHouse / Doris OLAP 引擎\n\n**加分技能（P2）：**\n- Kubernetes 上的数据平台部署\n- 数据血缘和元数据管理\n- 特征工程平台（Feast / Tecton）', thinkingSteps: ['梳理数据开发技术栈全景...', '按实时/离线分层...', '生成分级学习路径...'] },
  ],
  '增长分析师': [
    { question: '这个岗位未来两年前景如何？', reply: '增长分析师在互联网和消费品行业需求稳定增长。\n\n**利好因素：**\n1. 流量红利消退后，企业更依赖数据驱动的精细化增长\n2. 产品增长和用户增长团队编制持续扩张\n3. 增长黑客方法论在更多传统行业渗透\n\n**趋势变化：**\n- 从"粗放买量"转向"LTV 精细化运营"\n- 需要同时掌握数据分析和产品实验能力\n- 增长分析师的角色边界与产品经理越来越模糊\n\n建议建立 **数据分析 + 增长实验 + 产品思维** 三合一能力。', thinkingSteps: ['分析增长分析师岗位趋势...', '评估流量红利消退的影响...', '检索行业对增长角色的需求变化...'] },
    { question: '薪资还有多少上涨空间？', reply: '增长分析师薪资与业务成果强挂钩：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：10-16K\n- 中级（3-5年）：18-30K，增长空间约 30%\n- 高级（5年+）：30-50K，增长负责人可达 55K+\n\n**薪资杠杆点：**\n1. 可量化的增长案例（DAU 提升 X%、转化率提升 X%）：最强背书\n2. A/B 实验和因果推断能力：溢价 15%\n3. 跨职能协调能力（产品 + 研发 + 运营）：管理线跳板\n\n增长分析师转产品经理或增长负责人的路径非常清晰。', thinkingSteps: ['获取增长分析师薪资数据...', '分析业务成果对薪资的影响...', '评估职业发展路径...'] },
    { question: '我需要掌握哪些核心技能？', reply: '增长分析师需要数据与业务的深度结合：\n\n**必备技能（P0）：**\n- SQL 查询与数据提取\n- 用户行为分析（漏斗、留存、归因）\n- A/B 实验设计与统计显著性检验\n- 数据可视化与报告撰写\n\n**竞争力技能（P1）：**\n- 增长模型（AARRR、北极星指标）\n- 用户分群与个性化策略\n- Python 自动化分析（Pandas + 统计库）\n- 广告投放与 ROI 分析\n\n**加分技能（P2）：**\n- 因果推断（工具变量、断点回归）\n- 推荐系统基础知识\n- 产品 PRD 撰写与需求管理', thinkingSteps: ['梳理增长分析师核心技能...', '按增长方法论分层...', '生成学习路径建议...'] },
  ],
  /* ── 机器学习工程师 ── */
  '算法工程师': [
    { question: '这个岗位未来两年前景如何？', reply: '算法工程师正处于 AI 浪潮的核心位置，前景极佳但竞争激烈。\n\n**利好因素：**\n1. 大模型应用落地创造了大量算法工程需求\n2. 搜索/推荐/广告等传统算法领域仍在持续招聘\n3. AI Agent 和多模态方向开辟了新的应用场景\n\n**挑战与风险：**\n- 校招竞争极其激烈，顶会论文几乎成为准入门槛\n- 预训练和基座模型方向集中在少数头部公司\n- 应用层算法工程师需要更强的工程化能力\n\n建议根据自身背景选择 **大模型应用** 或 **搜推广** 方向深耕。', thinkingSteps: ['分析算法工程师市场需求分布...', '评估大模型对算法岗位的重塑...', '对比基座模型 vs 应用层算法的定位...', '生成趋势分析...'] },
    { question: '薪资还有多少上涨空间？', reply: '算法工程师薪资在技术岗中处于顶端：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：18-28K，校招白菜价已达 20K+\n- 中级（3-5年）：30-50K，增长空间约 25%\n- 高级（5年+）：50-80K+，首席科学家级别更高\n\n**薪资差异因素：**\n1. 顶会论文 + 竞赛奖牌：校招起薪溢价 30%+\n2. 大模型方向经验：当前最热门，溢价 25%\n3. 搜推广系统实战：大厂核心岗位，薪资稳定且高\n\n算法岗的薪资上限极高，但入门门槛也最高。学历（硕/博）和科研成果是重要的筛选条件。', thinkingSteps: ['获取算法工程师薪资分布...', '分析论文和竞赛对薪资的影响...', '对比不同方向的薪资差异...'] },
    { question: '我需要掌握哪些核心技能？', reply: '算法工程师需要扎实的数学基础和工程能力：\n\n**必备技能（P0）：**\n- 机器学习理论（损失函数、优化算法、正则化）\n- PyTorch 深度学习框架\n- Python 科学计算（NumPy、Pandas、Scikit-learn）\n- 数学基础（线性代数、概率论、最优化）\n\n**竞争力技能（P1）：**\n- Transformer 架构深度理解\n- 大模型微调（LoRA、QLoRA、RLHF）\n- 模型部署（ONNX、TensorRT、vLLM）\n- 分布式训练（DeepSpeed、Megatron）\n\n**加分技能（P2）：**\n- 搜索/推荐/广告系统设计\n- 多模态模型（视觉-语言）\n- 强化学习基础', thinkingSteps: ['梳理算法工程师核心知识体系...', '按理论+工程维度分层...', '生成学习路径...'] },
  ],
  '大模型工程师': [
    { question: '这个岗位未来两年前景如何？', reply: '大模型应用工程师是 2025-2026 年最炙手可热的岗位，供需严重失衡。\n\n**利好因素：**\n1. 企业级 AI 落地需求爆发，RAG/Agent 方向岗位年增长超 40%\n2. 人才供给严重不足，懂 AI 的工程化人才仅满足市场需求的 30%\n3. 从 Prompt 工程到多 Agent 协作，技术栈快速演进带来持续学习红利\n\n**方向选择：**\n- **RAG 应用方向**：企业知识库、智能客服，需求最大\n- **Agent 方向**：多智能体协作、工具调用，天花板最高\n- **模型微调方向**：LoRA/QLoRA 微调 + 部署，工程要求高\n\n建议优先深耕 **RAG + Agent** 组合，这是当前企业需求最大的方向。', thinkingSteps: ['分析大模型应用工程师岗位增长趋势...', '评估 RAG/Agent 方向的市场需求...', '检索人才供需比数据...', '生成前景分析...'] },
    { question: '薪资还有多少上涨空间？', reply: '大模型应用工程师薪资处于技术岗顶端：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：20-35K，校招白菜价已达 22K+\n- 中级（3-5年）：35-60K，增长空间约 40%\n- 高级（5年+）：60-100K+，AI 架构师年薪可达 200 万\n\n**薪资溢价因素：**\n1. RAG 系统实战经验：溢价 30%，企业最看重"能落地"\n2. Agent 框架设计能力：稀缺度极高，溢价 35%\n3. 模型微调 + 部署全链路：综合能力溢价 25%\n\n**与算法工程师的差异：**\n- 大模型应用更看重工程化能力而非论文\n- 入门门槛低于算法研究，但天花板同样很高\n- 当前市场溢价高于传统算法岗约 15%', thinkingSteps: ['获取大模型应用工程师薪资分布...', '对比算法工程师薪资差异...', '分析 RAG/Agent 经验的溢价...', '评估薪资天花板...'] },
    { question: '我需要掌握哪些核心技能？', reply: '大模型应用工程师需要 LLM + 工程化的复合能力：\n\n**必备技能（P0）：**\n- LLM API 深度使用（OpenAI / Claude / 通义千问 / DeepSeek）\n- Prompt Engineering 与结构化输出\n- RAG 管道构建（向量化 → 检索 → 重排序 → 生成）\n- Python 后端开发（FastAPI + 异步编程）\n\n**竞争力技能（P1）：**\n- LangChain / LangGraph / LlamaIndex 框架\n- 向量数据库（Milvus / Qdrant / Weaviate）\n- AI Agent 框架（AutoGen / CrewAI / Dify）\n- MCP 协议与工具调用\n\n**加分技能（P2）：**\n- LoRA/QLoRA 微调 + vLLM 部署\n- GraphRAG 与知识图谱集成\n- 多模态应用（视觉 + 语音 + LLM）\n- 模型评测与对齐（RLHF/DPO）', thinkingSteps: ['梳理大模型应用工程师技能图谱...', '按 LLM 应用全链路分层...', '生成分级学习路径...'] },
  ],
  'AI 应用工程师': [
    { question: '这个岗位未来两年前景如何？', reply: 'AI 应用工程师是 AI 落地的"最后一公里"，需求增长最快。\n\n**利好因素：**\n1. 大模型 API 的普及降低了 AI 应用的开发门槛\n2. 企业级 AI 助手、智能客服、RAG 系统需求爆发\n3. AI Agent 和工作流编排方向还处于早期红利\n\n**岗位定位：**\n- 不需要从零训练模型，更关注 **API 编排 + 工程集成**\n- 介于后端开发和算法工程师之间\n- 需要理解 Prompt Engineering 和模型能力边界\n\n建议重点掌握 **LangChain / LlamaIndex + RAG + Agent** 技术栈。', thinkingSteps: ['分析 AI 应用工程师岗位增长数据...', '评估大模型 API 普及的影响...', '检索 RAG/Agent 方向的市场热度...'] },
    { question: '薪资还有多少上涨空间？', reply: 'AI 应用工程师薪资处于快速上升期：\n\n**各级别薪资区间（一线城市）：**\n- 初级（1-2年）：14-22K\n- 中级（3-5年）：24-38K，增长空间约 35%\n- 高级（5年+）：38-55K，AI 架构师可达 60K+\n\n**当前市场特征：**\n1. 岗位数量年增长约 40%，但成熟人才稀缺\n2. 有 RAG/Agent 实战经验的候选人供不应求\n3. 薪资溢价来自「能落地」而非「会论文」\n\n**提薪关键：**\n- 企业级 RAG 系统构建经验：溢价 25%\n- 多 Agent 协作框架设计：稀缺度极高\n- 模型评测与对齐能力：差异化竞争', thinkingSteps: ['获取 AI 应用岗位薪资趋势...', '分析 RAG/Agent 经验的溢价...', '评估岗位增速与人才供给比...'] },
    { question: '我需要掌握哪些核心技能？', reply: 'AI 应用工程师需要连接模型和业务：\n\n**必备技能（P0）：**\n- LLM API 使用（OpenAI / Claude / 通义千问）\n- Prompt Engineering 与提示词优化\n- RAG 管道构建（向量化、检索、生成）\n- Python 后端开发（FastAPI / Flask）\n\n**竞争力技能（P1）：**\n- LangChain / LlamaIndex 框架\n- 向量数据库（Milvus / Qdrant / Pinecone）\n- AI Agent 框架（AutoGen / CrewAI）\n- 模型评测与 A/B 测试\n\n**加分技能（P2）：**\n- 模型微调基础（LoRA）\n- 多模态应用集成\n- 语音交互（ASR + TTS + LLM）', thinkingSteps: ['梳理 AI 应用工程师技能图谱...', '按 LLM 应用链路分层...', '生成学习路径建议...'] },
  ],
}

/* 通用 fallback：如果岗位不在预设中 */
const defaultDrawerPresets: DrawerQuickPreset[] = [
  { question: '这个岗位未来两年前景如何？', reply: '根据当前市场数据分析，该岗位方向在未来两年整体呈**稳中向好**趋势。\n\n**核心判断依据：**\n1. 行业数字化转型持续推进，技术岗需求保持增长\n2. AI 工具提升了从业者效率，但暂未大规模替代核心岗位\n3. 中高级人才仍处于供不应求状态\n\n建议关注该方向中**增速最快的细分赛道**，提前布局技能储备。\n\n你可以选择具体岗位后再次提问，我会给出更精准的分析。', thinkingSteps: ['分析该方向市场数据...', '评估行业发展趋势...', '生成综合分析...'] },
  { question: '薪资还有多少上涨空间？', reply: '基于当前薪资数据，该方向仍有一定上涨空间：\n\n**一般规律：**\n- 初级（1-2年）：增长空间约 25-35%\n- 中级（3-5年）：增长空间约 20-30%\n- 高级（5年+）：增长空间约 10-20%\n\n**薪资杠杆的通用建议：**\n1. 掌握该方向的**差异化技能**\n2. 积累可量化的**项目成果**\n3. 向**架构和管理方向**发展以突破天花板\n\n选择具体岗位后我可以给出更精确的薪资区间和提升路径。', thinkingSteps: ['获取该方向薪资分布...', '计算各级别增长空间...', '生成薪资建议...'] },
  { question: '我需要掌握哪些核心技能？', reply: '该方向的技能要求可以分为三个层次：\n\n**基础能力：**\n- 扎实的编程基础和算法思维\n- 核心框架和工具链的熟练使用\n- 团队协作和版本管理\n\n**竞争力能力：**\n- 系统设计和架构思维\n- 性能优化和问题诊断\n- 技术选型和方案评估\n\n**领导力能力：**\n- 技术规划和团队建设\n- 跨团队沟通协调\n- 业务理解和价值判断\n\n建议选择具体岗位后再来提问，我会给出该岗位精确的技能清单。', thinkingSteps: ['梳理该方向通用技能体系...', '按能力层次分级...', '生成学习建议...'] },
]

async function sendAiDrawerMsg(text?: string) {
  const content = (text ?? aiDrawerInput.value).trim()
  if (!content || aiDrawerLoading.value) return
  aiDrawerInput.value = ''
  const job = selectedJob.value?.jobName ?? roleSearch.value
  const prov = selectedProvince.value ?? '全国'
  aiDrawerMessages.value.push({ role: 'user', content, time: _getDrawerTimestamp() })
  _scrollDrawer()
  aiDrawerLoading.value = true

  /* 1. 查找预设回答（快捷问题命中） */
  const presets = drawerPresets[job] ?? defaultDrawerPresets
  const matched = presets.find(p => p.question === content)

  let reply: string
  let thinkingSteps: string[]
  let thinkingSummary: string

  if (matched) {
    reply = matched.reply
    thinkingSteps = matched.thinkingSteps
    thinkingSummary = thinkingSteps.join(' → ')
  } else {
    /* 自由输入走通用回复 */
    const resp = learningStore.getAIResponse(`[岗位:${job}][省份:${prov}] ${content}`)
    reply = resp.content
    thinkingSteps = resp.thinking ?? ['理解问题...', '检索相关数据...', '组织回答...']
    thinkingSummary = thinkingSteps.join(' → ')
  }

  /* 2. 思考动画 */
  _scrollDrawer()
  const duration = await simulateDrawerThinking(thinkingSteps)

  /* 3. 推入 AI 消息（流式占位） */
  const msgId = `drawer-msg-${++_drawerMsgIdCounter}`
  const aiMsg: DrawerMsg = {
    role: 'assistant',
    content: reply,
    time: _getDrawerTimestamp(),
    thinking: thinkingSummary,
    thinkingDuration: duration,
    status: 'streaming',
    id: msgId,
  }
  aiDrawerMessages.value.push(aiMsg)
  _scrollDrawer()

  /* 4. 逐字流式输出 */
  await simulateDrawerStreaming(msgId, reply)
  aiMsg.status = 'done'
  aiDrawerLoading.value = false
  _scrollDrawer()
}

function goToCareerCenter() {
  router.push({ name: 'career-ability', query: { role: roleSearch.value } })
}

const goBack = () => router.push({ name: 'student-career' })

/* ═══ GSAP 动画 ═══ */
function animateKpiNumbers() {
  if (!pageRef.value) return
  const nums = pageRef.value.querySelectorAll('.kpi-num')
  nums.forEach(el => {
    gsap.fromTo(el, { opacity: 0.3, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', clearProps: 'transform,opacity' })
  })
}

function setupEntranceAnimation() {
  if (!pageRef.value) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    scrollRevealed.value = true
    return
  }

  gsapCtx = gsap.context(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out', clearProps: 'transform,opacity' } })

    tl.fromTo('.da-header', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.3 })
      .fromTo('.da-left', { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.35 }, '<0.1')
      .fromTo('.da-right', { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.35 }, '<0.15')

    // Scroll unroll animation (left to right)
    const scrollEl = scrollRef.value
    if (scrollEl) {
      tl.fromTo(scrollEl,
        { clipPath: 'inset(0 100% 0 0)' },
        { clipPath: 'inset(0 0% 0 0)', duration: 1.2, ease: 'power2.inOut',
          onComplete: () => { scrollRevealed.value = true } },
        '<0.2')
    } else {
      scrollRevealed.value = true
    }

    // KPI cards stagger
    gsap.from('.kpi-card', { opacity: 0, y: 10, stagger: 0.06, duration: 0.25, ease: 'power2.out', delay: 0.35, clearProps: 'transform,opacity' })

    // Ranking items stagger
    gsap.from('.rank-item', { opacity: 0, x: -10, stagger: 0.03, duration: 0.2, ease: 'power2.out', delay: 0.5, clearProps: 'transform,opacity' })

    setTimeout(() => animateKpiNumbers(), 600)
  }, pageRef.value)
}

watch(selectedProvince, (val, oldVal) => {
  if (!val || !pageRef.value) return
  // 仅在右面板已处于 insight-ready 状态（省份切换，非首次进入）时做 stagger 刷新
  // 首次进入由 Vue <Transition> 的 GSAP hooks 负责
  if (oldVal && analysisStage.value === 'insight-ready') {
    nextTick(() => {
      const sections = pageRef.value?.querySelectorAll('.da-right-content > .da-section')
      if (sections?.length) {
        gsap.killTweensOf(sections)
        gsap.fromTo(sections,
          { opacity: 0.3, y: 10 },
          { opacity: 1, y: 0, duration: 0.45, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity' }
        )
      }
    })
  }
})

/* ═══ 三图切换 GSAP 过渡钩子 ═══ */

// 薪资排行：从左侧展开滑入
function onSalaryEnter(el: Element, done: () => void) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { void nextTick(done); return }
  gsap.fromTo(el,
    { opacity: 0, x: -50, clipPath: 'inset(0 100% 0 0)' },
    { opacity: 1, x: 0, clipPath: 'inset(0 0% 0 0)', duration: 0.55, ease: 'power3.out', onComplete: done, clearProps: 'transform,opacity,clipPath' }
  )
}
function onSalaryLeave(el: Element, done: () => void) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { void nextTick(done); return }
  gsap.to(el,
    { opacity: 0, x: -40, clipPath: 'inset(0 100% 0 0)', duration: 0.35, ease: 'power3.inOut', onComplete: done }
  )
}

// 右面板：柔和淡入 + 上浮 + sections 依次 stagger
function onRightEnter(el: Element, done: () => void) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { void nextTick(done); return }
  gsap.fromTo(el,
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out',
      onComplete: () => {
        gsap.set(el, { clearProps: 'transform,opacity' })
        // sections stagger — 内容出场后依次展开
        const sections = (el as HTMLElement).querySelectorAll('.da-section')
        if (sections.length) {
          gsap.fromTo(sections,
            { opacity: 0.5, y: 6 },
            { opacity: 1, y: 0, duration: 0.35, stagger: 0.06, ease: 'power2.out', clearProps: 'transform,opacity' }
          )
        }
        done()
      },
    }
  )
}
function onRightLeave(el: Element, done: () => void) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { void nextTick(done); return }
  gsap.to(el,
    { opacity: 0, y: -10, duration: 0.2, ease: 'power2.in', onComplete: done }
  )
}

/* ═══ 气泡图数据（基于 CAREER_DOMAINS 5×3=15 岗位）═══ */

interface FlatJob { domainIdx: number; jobIdx: number; domainId: string; domainName: string; domainColor: string; jobName: string }
function buildFlatJobs(): FlatJob[] {
  return CAREER_DOMAINS.flatMap((domain, di) =>
    domain.jobs.map((jobName, ji) => ({
      domainIdx: di,
      jobIdx: ji,
      domainId: domain.id,
      domainName: domain.name,
      domainColor: domain.color,
      jobName,
    })),
  )
}
let _flatJobs: FlatJob[] = buildFlatJobs()

const selectedJob = ref<{ id: string; name: string; domainColor: string; jobName?: string } | null>(null)
watch(()=>selectedJob.value?.jobName,role=>{if(isRealOverview.value)void loadOverviewDetail(role||'')})
const hasSelectedJob = computed(() => Boolean(selectedJob.value?.jobName))
const hasSelectedProvince = computed(() => Boolean(selectedProvince.value))
const analysisStage = computed<'job-pending' | 'province-pending' | 'insight-ready'>(() => {
  if (!hasSelectedJob.value) return 'job-pending'
  if (!hasSelectedProvince.value) return 'province-pending'
  return 'insight-ready'
})
const currentAnalysisLabel = computed(() => selectedJob.value?.jobName || roleSearch.value || '职业方向')
const selectedJobLabel = computed(() => selectedJob.value?.jobName ?? '未选择岗位')
const selectedJobDomainLabel = computed(() => selectedJob.value?.name ?? '岗位方向')
const selectedProvinceLabel = computed(() => selectedProvince.value ?? '未选择省份')
const rankModeLabel = computed(() => hasSelectedJob.value ? '需求指数' : '待选岗位')

// CTA 自动隐藏：关注列表或阶段变化时重置计时
watch(
  [analysisStage, () => learningStore.targetRoles.length],
  ([stage, len]) => { if (stage === 'insight-ready' && len > 0) resetCtaTimer() },
  { immediate: true },
)

/* ═══ D3 气泡图（双层嵌套 simulation）═══ */
const bubbleSvgRef = ref<SVGSVGElement | null>(null)
let _outerSim: d3.Simulation<any, undefined> | null = null
let _innerSims: d3.Simulation<any, undefined>[] = []
let _bubbleRo: ResizeObserver | null = null
const reducedBubbleMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const refreshBubbleMotion = () => initBubbleChart()

// ── 节点类型 ──
interface DomainNode extends d3.SimulationNodeDatum {
  id: string; name: string; color: string; r: number; domainIdx: number
  _phaseX?: number; _phaseY?: number
}
interface JobNode extends d3.SimulationNodeDatum {
  id: string; jobName: string; domainId: string; domainName: string
  domainColor: string; r: number; domainIdx: number; jobIdx: number
  _phaseX?: number; _phaseY?: number
}

function stopAllSimulations() {
  if (_outerSim) { _outerSim.stop(); _outerSim = null }
  _innerSims.forEach(s => s.stop()); _innerSims = []
}

function getBubbleTextColor(color: string, isSelected = false): string {
  const normalized = color.trim().replace(/^#/, '')
  const hex = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized
  if (!/^[\da-fA-F]{6}$/.test(hex)) {
    return isSelected ? 'rgba(255,252,246,0.99)' : 'rgba(255,252,246,0.96)'
  }
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  if (brightness >= 160) {
    return isSelected ? 'rgba(30,18,8,0.98)' : 'rgba(43,27,13,0.96)'
  }
  return isSelected ? 'rgba(255,252,246,0.99)' : 'rgba(255,252,246,0.96)'
}

function initBubbleChart() {
  const svg = bubbleSvgRef.value
  if (!svg) return
  stopAllSimulations()
  const el = d3.select(svg)
  el.selectAll('*').remove()

  const W = svg.clientWidth || 500
  const H = svg.clientHeight || 300
  const mobile = window.matchMedia('(max-width: 767px)').matches
  const still = mobile || reducedBubbleMotion.matches
  const scale = Math.min(W, H)
  const JOB_R = mobile ? 24 : Math.min(32, Math.max(20, scale / 13))
  const DOMAIN_R = mobile ? 70 : JOB_R * 2.6 + 4
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  const LABEL_PADDING = 10
  const DOMAIN_LABEL_Y = -DOMAIN_R - 7

  // ── defs ──
  const defs = el.append('defs')

  // SVG filter — 轻微边缘扰动
  const fInk = defs.append('filter').attr('id', 'f-ink-bleed')
    .attr('x', '-18%').attr('y', '-18%').attr('width', '136%').attr('height', '136%')
  fInk.append('feTurbulence')
    .attr('type', 'fractalNoise').attr('baseFrequency', 0.045)
    .attr('numOctaves', 3).attr('seed', 7).attr('result', 'noise')
  fInk.append('feDisplacementMap')
    .attr('in', 'SourceGraphic').attr('in2', 'noise').attr('scale', 3).attr('result', 'displaced')
  fInk.append('feGaussianBlur')
    .attr('in', 'displaced').attr('stdDeviation', 0.6)

  // SVG filter — 选中态（域色外发光）
  const fSel = defs.append('filter').attr('id', 'f-ink-sel')
    .attr('x', '-35%').attr('y', '-35%').attr('width', '170%').attr('height', '170%')
  fSel.append('feGaussianBlur')
    .attr('in', 'SourceAlpha').attr('stdDeviation', 5).attr('result', 'blur')
  fSel.append('feFlood')
    .attr('flood-color', 'rgba(190,42,0,0.35)').attr('result', 'color')
  fSel.append('feComposite')
    .attr('in', 'color').attr('in2', 'blur').attr('operator', 'in').attr('result', 'glow')
  const fSelMerge = fSel.append('feMerge')
  fSelMerge.append('feMergeNode').attr('in', 'glow')
  fSelMerge.append('feMergeNode').attr('in', 'SourceGraphic')

  CAREER_DOMAINS.forEach(domain => {
    // ── 小气泡渐变 ──
    const g1 = defs.append('radialGradient').attr('id', `jb-${domain.id}`)
      .attr('cx', '50%').attr('cy', '50%').attr('r', '50%')
    g1.append('stop').attr('offset', '0%').attr('stop-color', domain.color).attr('stop-opacity', 0.92)
    g1.append('stop').attr('offset', '50%').attr('stop-color', domain.color).attr('stop-opacity', 0.8)
    g1.append('stop').attr('offset', '78%').attr('stop-color', domain.color).attr('stop-opacity', 0.38)
    g1.append('stop').attr('offset', '100%').attr('stop-color', domain.color).attr('stop-opacity', 0.06)

    // ── 大气泡背景渐变 ──
    const g2 = defs.append('radialGradient').attr('id', `db-${domain.id}`)
      .attr('cx', '50%').attr('cy', '50%').attr('r', '50%')
    g2.append('stop').attr('offset', '0%').attr('stop-color', domain.color).attr('stop-opacity', 0.02)
    g2.append('stop').attr('offset', '60%').attr('stop-color', domain.color).attr('stop-opacity', 0.04)
    g2.append('stop').attr('offset', '88%').attr('stop-color', domain.color).attr('stop-opacity', 0.14)
    g2.append('stop').attr('offset', '100%').attr('stop-color', domain.color).attr('stop-opacity', 0.2)
  })

  // ── 外层 domain 节点 ──
  const domainCount = CAREER_DOMAINS.length
  const angleStep = (2 * Math.PI) / domainCount
  const spread = Math.min(W, H) * 0.29

  const domainNodes: DomainNode[] = CAREER_DOMAINS.map((d, i) => ({
    id: d.id, name: d.name, color: d.color, r: DOMAIN_R, domainIdx: i,
    x: mobile ? W * (i % 2 === 0 ? 0.25 : 0.75) : W / 2 + Math.cos(angleStep * i - Math.PI / 2) * spread,
    y: mobile ? 100 + Math.floor(i / 2) * 180 : H / 2 + Math.sin(angleStep * i - Math.PI / 2) * spread,
  }))
  if (mobile) domainNodes.forEach(d => { d.fx = d.x; d.fy = d.y })

  // ── 每个领域的内层 job 节点 ──
  const jobNodesByDomain: JobNode[][] = CAREER_DOMAINS.map((domain, di) =>
    domain.jobs.map((jobName, ji) => ({
      id: `${domain.id}-${ji}`, jobName, domainId: domain.id,
      domainName: domain.name, domainColor: domain.color,
      r: JOB_R, domainIdx: di, jobIdx: ji,
      x: mobile ? Math.cos(ji * 2 * Math.PI / domain.jobs.length) * 44 : (Math.random() - 0.5) * JOB_R * 0.6,
      y: mobile ? Math.sin(ji * 2 * Math.PI / domain.jobs.length) * 44 : (Math.random() - 0.5) * JOB_R * 0.6,
    })),
  )

  // ── 渲染 domain 组 ──
  const domainGroups = el.selectAll('g.domain-group')
    .data(domainNodes)
    .enter().append('g')
    .attr('class', 'domain-group')

  // 大气泡背景圈
  domainGroups.append('circle')
    .attr('class', 'domain-bg')
    .attr('r', DOMAIN_R)
    .attr('fill', d => `url(#db-${d.id})`)
    .attr('stroke', d => d.color)
    .attr('stroke-width', 0.8)
    .attr('stroke-opacity', 0.28)

  // 领域名标签（大气泡顶部外侧）
  const domainLabels = domainGroups.append('text')
    .attr('class', 'domain-label')
    .attr('x', 0)
    .attr('y', DOMAIN_LABEL_Y)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'auto')
    .attr('fill', d => d.color)
    .attr('font-size', 12).attr('font-weight', '700')
    .attr('font-family', 'KaiTi, STKaiti, serif')
    .attr('paint-order', 'stroke')
    .attr('stroke', 'rgba(245,245,243,0.9)').attr('stroke-width', 3)
    .text(d => d.name)

  // ── 渲染 job 节点 ──
  domainGroups.each(function (_domainD, di) {
    const domainG = d3.select(this)
    const jobs = jobNodesByDomain[di]!
    const nodeG = domainG.selectAll('g.job-node')
      .data(jobs)
      .enter().append('g')
      .attr('class', 'job-node')
      .attr('role', 'button')
      .attr('tabindex', artifactId.value ? -1 : 0)
      .attr('aria-disabled', artifactId.value ? 'true' : 'false')
      .attr('aria-label', d => `${d.jobName} · ${d.domainName}`)
      .style('cursor', 'pointer')
      .on('keydown', function (ev: KeyboardEvent) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault()
          d3.select(this).dispatch('click')
        }
      })
      .on('click', (_ev, d) => {
        if (artifactId.value) return
        selectedJob.value = { id: d.domainId, name: d.domainName, domainColor: d.domainColor, jobName: d.jobName }
        roleSearch.value = d.jobName
        doSearch()
        updateBubbleSelection()
      })

    // 岗位气泡
    nodeG.append('circle')
      .attr('class', 'job-circle')
      .attr('r', d => d.r)
      .attr('fill', d => `url(#jb-${d.domainId})`)
      .attr('stroke', 'none')
      .attr('filter', 'url(#f-ink-bleed)')

    // 岗位文字
    nodeG.append('text')
      .attr('class', 'job-text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', d => getBubbleTextColor(d.domainColor))
      .attr('font-size', mobile ? 12 : Math.max(8, JOB_R * 0.36))
      .attr('font-family', FONT)
      .attr('font-weight', '600')
      .attr('letter-spacing', '0.02em')
      .attr('pointer-events', 'none')
      .each(function (d) {
        const txt = d3.select(this)
        const name = d.jobName
        if (mobile) {
          // A short visible label stays inside the touch target; selection and aria-label retain the full name.
          const compact = name.replace(/工程师$/, '').replace(/\s+/g, '')
          const latin = compact.match(/^([A-Za-z]+)(.*)$/)
          const split = Math.ceil(compact.length / 2)
          const lines = latin ? [latin[1]!, latin[2]!].filter(Boolean)
            : compact.length <= 3 ? [compact] : [compact.slice(0, split), compact.slice(split)]
          txt.text('')
          lines.slice(0, 2).forEach((line, i) => txt.append('tspan').attr('x', 0)
            .attr('dy', i === 0 ? (lines.length > 1 ? '-0.45em' : '0') : '1.15em')
            .text(i === 1 && lines.length > 2 ? line.slice(0, 2) + '…' : line))
          return
        }
        const maxW = d.r * 1.65
        const spaceIdx = name.indexOf(' ')
        let line1 = '', line2 = ''
        if (spaceIdx > 0 && spaceIdx < name.length - 1) {
          line1 = name.slice(0, spaceIdx)
          line2 = name.slice(spaceIdx + 1)
        } else {
          const boundary = name.search(/[a-zA-Z][^\x00-\x7F]|[^\x00-\x7F][a-zA-Z]/)
          const split = boundary > 0 ? boundary + 1 : Math.ceil(name.length / 2)
          line1 = name.slice(0, split)
          line2 = name.slice(split)
        }
        txt.text(name)
        const measured = (this as SVGTextElement).getComputedTextLength?.() ?? name.length * 7
        if (measured > maxW && line2.length > 0) {
          txt.text('')
          txt.append('tspan').attr('x', 0).attr('dy', '-0.45em').text(line1)
          txt.append('tspan').attr('x', 0).attr('dy', '1.15em').text(line2)
        }
      })

    // tooltip
    nodeG.append('title').text(d => {
      if(isHttpMode)return `${d.jobName}\n${d.domainName}\n职业目录线索，暂无经核验的薪资统计。`
      const sal = getJobSalaryData(d.jobName)
      return `${d.jobName}\n${d.domainName}\n初级 ${sal.junior}K · 中级 ${sal.mid}K · 高级 ${sal.senior}K`
    })
  })

  // ── 弹性碰撞力工厂（两层共用） ──
  function makeElasticCollideForce<N extends d3.SimulationNodeDatum & { r: number }>(nodes: N[], e = 0.65) {
    return () => {
      for (let i = 0; i < nodes.length; i++) {
        for (let k = i + 1; k < nodes.length; k++) {
          const a = nodes[i]!, b = nodes[k]!
          const dx = (b.x ?? 0) - (a.x ?? 0)
          const dy = (b.y ?? 0) - (a.y ?? 0)
          const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6
          const minD = a.r + b.r + 2
          if (dist >= minD) continue
          // 1. 位置分离（按质量 r² 比例）
          const overlap = minD - dist
          const m1 = a.r * a.r, m2 = b.r * b.r
          const total = m1 + m2
          const nx = dx / dist, ny = dy / dist
          a.x = (a.x ?? 0) - nx * overlap * (m2 / total)
          a.y = (a.y ?? 0) - ny * overlap * (m2 / total)
          b.x = (b.x ?? 0) + nx * overlap * (m1 / total)
          b.y = (b.y ?? 0) + ny * overlap * (m1 / total)
          // 2. 弹性速度交换（只在相互接近时触发）
          const dvx = (a.vx ?? 0) - (b.vx ?? 0)
          const dvy = (a.vy ?? 0) - (b.vy ?? 0)
          const dvn = dvx * nx + dvy * ny
          if (dvn <= 0) continue
          const J = (1 + e) * dvn / (1 / m1 + 1 / m2)
          a.vx = (a.vx ?? 0) - (J / m1) * nx
          a.vy = (a.vy ?? 0) - (J / m1) * ny
          b.vx = (b.vx ?? 0) + (J / m2) * nx
          b.vy = (b.vy ?? 0) + (J / m2) * ny
        }
      }
    }
  }

  // ── 内层 simulations（永不停止 + 正弦波平滑 wander）──
  CAREER_DOMAINS.forEach((_, di) => {
    const jobs = jobNodesByDomain[di]!
    // 初始化各自独立随机相位
    jobs.forEach(j => {
      j._phaseX = Math.random() * Math.PI * 2
      j._phaseY = Math.random() * Math.PI * 2
    })
    const domainG = d3.select(el.selectAll<SVGGElement, DomainNode>('g.domain-group').nodes()[di]!)
    const innerNodeG = domainG.selectAll<SVGGElement, JobNode>('g.job-node')
    const innerBound = DOMAIN_R - JOB_R - 2

    const sim = d3.forceSimulation(jobs)
      .alphaDecay(0)
      .alphaTarget(0.15)
      .velocityDecay(0.18)
      .force('elasticCollide', makeElasticCollideForce(jobs, 0.65))
      .force('center', d3.forceCenter(0, 0).strength(0.02))
      .force('wander', () => {
        if (still) return
        jobs.forEach(j => {
          j._phaseX = (j._phaseX ?? 0) + 0.009 + Math.random() * 0.004
          j._phaseY = (j._phaseY ?? 0) + 0.009 + Math.random() * 0.004
          j.vx = (j.vx ?? 0) + Math.sin(j._phaseX) * 0.06
          j.vy = (j.vy ?? 0) + Math.cos(j._phaseY) * 0.06
        })
      })
      .on('tick', () => {
        jobs.forEach(j => {
          const dist = Math.sqrt((j.x ?? 0) ** 2 + (j.y ?? 0) ** 2)
          if (dist > innerBound && dist > 0) {
            const ratio = innerBound / dist
            j.x = (j.x ?? 0) * ratio
            j.y = (j.y ?? 0) * ratio
            // 反射外向速度分量（restitution = 0.65）
            const nx = (j.x ?? 0) / innerBound
            const ny = (j.y ?? 0) / innerBound
            const vr = (j.vx ?? 0) * nx + (j.vy ?? 0) * ny
            if (vr > 0) {
              j.vx = (j.vx ?? 0) - 1.65 * vr * nx
              j.vy = (j.vy ?? 0) - 1.65 * vr * ny
            }
          }
        })
        innerNodeG.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })
    _innerSims.push(sim)
    if (still) {
      sim.stop().tick(100)
      sim.on('tick')?.call(sim)
    }
  })

  // ── 外层 simulation（弹性反射边界 + 正弦波平滑 wander）──
  // 初始化各大气泡独立相位
  domainNodes.forEach(d => {
    d._phaseX = Math.random() * Math.PI * 2
    d._phaseY = Math.random() * Math.PI * 2
  })
  _outerSim = d3.forceSimulation(domainNodes)
    .alphaDecay(0)
    .alphaTarget(0.12)
    .velocityDecay(0.18)
    .force('elasticCollide', makeElasticCollideForce(domainNodes, 0.70))
    .force('center', d3.forceCenter(W / 2, H / 2).strength(0.01))
    .force('wander', () => {
      if (still) return
      domainNodes.forEach(d => {
        d._phaseX = (d._phaseX ?? 0) + 0.007 + Math.random() * 0.003
        d._phaseY = (d._phaseY ?? 0) + 0.007 + Math.random() * 0.003
        d.vx = (d.vx ?? 0) + Math.sin(d._phaseX) * 0.09
        d.vy = (d.vy ?? 0) + Math.cos(d._phaseY) * 0.09
      })
    })
    .force('bound', () => {
      // 弹性反射：碰壁后保证最小弹出速度（MIN_V），确保离开边界
      const MIN_V = 0.5
      domainNodes.forEach(d => {
        const pad = d.r + 14
        if ((d.x ?? 0) < pad)     { d.x = pad;     d.vx =  Math.max(MIN_V, Math.abs(d.vx ?? 0)) * 0.8 }
        if ((d.x ?? 0) > W - pad) { d.x = W - pad; d.vx = -Math.max(MIN_V, Math.abs(d.vx ?? 0)) * 0.8 }
        if ((d.y ?? 0) < pad)     { d.y = pad;     d.vy =  Math.max(MIN_V, Math.abs(d.vy ?? 0)) * 0.8 }
        if ((d.y ?? 0) > H - pad) { d.y = H - pad; d.vy = -Math.max(MIN_V, Math.abs(d.vy ?? 0)) * 0.8 }
      })
    })
    .on('tick', () => {
      domainGroups.attr('transform', d => `translate(${d.x ?? W / 2},${d.y ?? H / 2})`)
      const svgRect = svg.getBoundingClientRect()
      domainLabels
        .attr('x', 0)
        .attr('y', DOMAIN_LABEL_Y)
        .each(function () {
          const label = d3.select(this)
          const rect = (this as SVGTextElement).getBoundingClientRect()
          let offsetX = 0
          let offsetY = 0
          const left = rect.left - svgRect.left
          const right = rect.right - svgRect.left
          const top = rect.top - svgRect.top
          const bottom = rect.bottom - svgRect.top
          if (left < LABEL_PADDING) offsetX += LABEL_PADDING - left
          if (right > W - LABEL_PADDING) offsetX -= right - (W - LABEL_PADDING)
          if (top < LABEL_PADDING) offsetY += LABEL_PADDING - top
          if (bottom > H - LABEL_PADDING) offsetY -= bottom - (H - LABEL_PADDING)
          if (offsetX !== 0 || offsetY !== 0) {
            label
              .attr('x', offsetX)
              .attr('y', DOMAIN_LABEL_Y + offsetY)
          }
        })
    })

  if (still) {
    _outerSim.stop().tick(100)
    _outerSim.on('tick')?.call(_outerSim)
  }
  updateBubbleSelection()
}

function updateBubbleSelection() {
  const svg = bubbleSvgRef.value
  if (!svg) return
  const sel = selectedJob.value
  const selJobName = sel?.jobName ?? ''
  const selDomainId = sel?.id ?? ''

  d3.select(svg).selectAll<SVGGElement, JobNode>('g.job-node').each(function (d) {
    const g = d3.select(this)
    const isSelected = d.jobName === selJobName && d.domainId === selDomainId
    g.select('.job-circle')
      .classed('job-circle--selected', isSelected)
      .attr('r', isSelected && !window.matchMedia('(max-width: 767px)').matches ? d.r + 3 : d.r)
      .attr('filter', isSelected ? 'url(#f-ink-sel)' : 'url(#f-ink-bleed)')
    g.select('.job-text')
      .attr('font-weight', isSelected ? '700' : '600')
      .attr('fill', getBubbleTextColor(d.domainColor, isSelected))
  })

  d3.select(svg).selectAll<SVGCircleElement, DomainNode>('.domain-bg').each(function (d) {
    const isActive = selDomainId === d.id
    d3.select(this)
      .attr('stroke-opacity', isActive ? 0.5 : 0.28)
      .attr('stroke-width', isActive ? 1.5 : 0.8)
  })
}

watch(selectedJob, () => updateBubbleSelection())

/* ═══ 省份中位薪资排行（全岗位滑动） ═══ */
function getJobMedianByProvince(jobName: string, provinceSalary: number, nationalAvgSalary: number): number {
  const base = getJobSalaryData(jobName)
  const factor = nationalAvgSalary > 0 ? provinceSalary / nationalAvgSalary : 1
  return +(base.mid * Math.max(0.5, Math.min(factor, 1.8))).toFixed(1)
}

const allJobMedians = computed(() => {
  const data = provinceData.value
  const prov = data.find(d => d.name === selectedProvince.value)
  const provinceSalary = prov?.salary ?? 12
  const nationalAvg = data.length ? data.reduce((s, d) => s + d.salary, 0) / data.length : 12
  return _flatJobs
    .map(j => ({ name: j.jobName, domain: j.domainName, color: j.domainColor, median: getJobMedianByProvince(j.jobName, provinceSalary, nationalAvg) }))
    .sort((a, b) => b.median - a.median)
    .filter((j, idx, arr) => arr.findIndex(x => x.name === j.name) === idx) // 去重
})

const salaryChartOption = computed(() => {
  const selName = selectedJob.value?.jobName ?? ''
  const jobs = allJobMedians.value
  const visibleCount = 12
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(255,255,255,0.96)', borderColor: C.panelBorder,
      textStyle: { color: C.textPrimary, fontSize: 11 },
      formatter: (params: any[]) => {
        const p = params[0]
        if (!p) return ''
        const job = jobs.find(j => j.name === p.name)
        return `<b style="color:${job?.color ?? C.textPrimary}">${p.name}</b><br/>中位薪资: <b>${p.value}K</b><br/><span style="opacity:.7">${job?.domain ?? ''}</span>`
      },
    },
    grid: { left: 90, right: 18, top: 8, bottom: 36 },
    dataZoom: [{
      type: 'slider', orient: 'vertical',
      right: 2, top: 8, bottom: 36,
      width: 12,
      startValue: 0, endValue: visibleCount - 1,
      brushSelect: false,
      handleStyle: { color: C.parchmentDark, borderColor: C.gold },
      fillerColor: 'rgba(139,105,20,0.1)',
      borderColor: 'rgba(139,105,20,0.2)',
      showDetail: false,
    }],
    xAxis: {
      type: 'value', name: 'K/月',
      nameTextStyle: { color: C.textMuted, fontSize: 9 },
      axisLabel: { color: C.textSecondary, fontSize: 9 },
      splitLine: { lineStyle: { type: 'dashed', color: 'rgba(139,37,0,0.06)' } },
    },
    yAxis: {
      type: 'category',
      data: jobs.map(j => j.name),
      axisLabel: { color: C.textSecondary, fontSize: 10, width: 80, overflow: 'truncate' as const },
      inverse: false,
    },
    series: [{
      name: '中位薪资', type: 'bar', barMaxWidth: 14,
      data: jobs.map(j => ({
        value: j.median,
        itemStyle: {
          color: j.name === selName
            ? { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: C.zhushaLight }, { offset: 1, color: C.zhusha }] }
            : { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: 'rgba(180,155,110,0.55)' }, { offset: 1, color: 'rgba(139,105,20,0.7)' }] },
          borderRadius: [0, 3, 3, 0],
        },
      })),
    }],
  }
})

async function initializeAnalysis() {
  if(showExploration.value)return
  if(isRealOverview.value){await initializeOverview();return}
  applyRouteRole(route.query.role)
  try {
    await hydrateCareerDomainsFromApi()
    CAREER_DOMAINS.splice(0,CAREER_DOMAINS.length,...DEMO_CAREER_DOMAINS.map(d=>({...d,jobs:[...d.jobs]})))
    _flatJobs = buildFlatJobs()
  } catch (e) {
    console.warn('[career-analysis] landscape hydrate failed', e)
  }
  await nextTick()
  // A route transition may have switched to an Agent artifact while hydration was pending.
  if (artifactId.value) return
  if (_bubbleRo) { _bubbleRo.disconnect(); _bubbleRo = null }
  setupEntranceAnimation()
  // D3 气泡图初始化（domains 可能已被 landscape 覆盖 jobs）
  initBubbleChart()
  if (bubbleSvgRef.value) {
    _bubbleRo = new ResizeObserver(() => initBubbleChart())
    _bubbleRo.observe(bubbleSvgRef.value)
  }
}

onMounted(() => {
  reducedBubbleMotion.addEventListener('change', refreshBubbleMotion)
  if (!artifactId.value) void initializeAnalysis()
})

watch(matchArtifact, async result => {
  if (!artifactId.value || !result) return
  // The conversation artifact supplies the scores; the existing job graph supplies only positioning.
  roleSearch.value = result.job.jobName
  selectedJob.value = {
    id: result.job.domainId,
    name: result.job.domainName,
    domainColor: result.job.domainColor,
    jobName: result.job.jobName,
  }
  doSearch()
  await nextTick()
  if (!artifactId.value || !bubbleSvgRef.value) return
  if (_bubbleRo) { _bubbleRo.disconnect(); _bubbleRo = null }
  initBubbleChart()
  updateBubbleSelection()
  _bubbleRo = new ResizeObserver(() => initBubbleChart())
  _bubbleRo.observe(bubbleSvgRef.value)
}, { immediate: true })

watch(artifactId, (current, previous) => {
  if(current){overviewFlight++;detailFlight++;CAREER_DOMAINS.splice(0,CAREER_DOMAINS.length,...DEMO_CAREER_DOMAINS.map(d=>({...d,jobs:[...d.jobs]})));_flatJobs=buildFlatJobs()}
  if (!current && previous) void initializeAnalysis()
})
watch(showExploration,show=>{overviewFlight++;overviewLoading.value=false;stopAllSimulations();_bubbleRo?.disconnect();_bubbleRo=null;if(!show)void initializeAnalysis()})

watch(() => route.query.role, (val) => {
  applyRouteRole(val)
})

onBeforeUnmount(() => {
  overviewLive=false;overviewFlight++;detailFlight++
  reducedBubbleMotion.removeEventListener('change', refreshBubbleMotion)
  gsapCtx?.revert()
  if (_ctaTimer) clearTimeout(_ctaTimer)
  stopAllSimulations()
  clearDrawerTimers()
  if (_bubbleRo) { _bubbleRo.disconnect(); _bubbleRo = null }
})
</script>
<template>
  <CareerExplorationWorkspace v-if="showExploration" @back="closeExploration" />
  <div v-else class="da-page" :class="{ 'da-page--artifact': artifactId }" ref="pageRef">
    <!-- ═══ 顶部标题栏 ═══ -->
    <header class="da-header">
      <div class="da-header__left">
        <button class="da-back" @click="artifactId ? returnToAgent() : goBack()" :title="artifactId ? '返回 Agent 对话' : '返回职业发展中心'">
          <Icon icon="lucide:arrow-left" :width="16" />
          <span>{{ artifactId ? '返回 Agent' : '返回' }}</span>
        </button>
        <div class="da-brand">
          <span class="da-brand__title">{{ artifactId ? '职业分析 · 本次岗位匹配' : '职业分析 · 岗位舆图' }}</span>
        </div>
      </div>
      <div v-if="!artifactId" class="da-header__center">
        <div class="da-header-search">
          <Icon icon="lucide:search" :width="14" class="da-header-search__icon" />
          <input
            class="da-header-search__input"
            v-model="roleSearch"
            placeholder="搜索岗位，如 前端工程师、算法…"
            @keydown.enter="handleSearchSubmit"
            @focus="searchFocused = true"
            @blur="searchFocused = false"
          />
          <button class="da-header-search__btn" aria-label="搜索岗位" @click="handleSearchSubmit">
            <Icon icon="lucide:arrow-right" :width="14" />
          </button>
        </div>
      </div>
      <div class="da-header__right">
        <button v-if="isRealOverview" class="da-back overview-trial-entry" @click="openExploration"><Icon icon="lucide:compass" :width="15"/><span>探索与实践</span></button>
        <UserInfoBar />
      </div>
    </header>

    <!-- ═══ 主体三栏 ═══ -->
    <div v-if="artifactId && artifactHandoff.loading.value" class="da-artifact-state" role="status">正在载入本次匹配结果…</div>
    <div v-else-if="artifactId && artifactError" class="da-artifact-state" role="alert"><strong>无法展示匹配结果</strong><p>{{ artifactError }}</p><button type="button" @click="returnToAgent">返回原对话</button></div>
    <div v-else class="da-body">
      <!-- 左面板 -->
      <aside class="da-left">
        <div v-if="artifactId" class="da-section da-artifact-result">
          <span class="da-artifact-result__eyebrow">来自本次 Agent 对话</span>
          <h1>{{ matchArtifact?.artifact.title }}</h1>
          <p>{{ matchArtifact?.artifact.summary }}</p>
          <div class="da-artifact-result__metric"><span>匹配分</span><strong>{{ matchArtifact?.preview.total_score }}</strong><small>/ 100</small></div>
          <div class="da-artifact-result__metric"><span>技能覆盖率</span><strong>{{ matchArtifact?.preview.coverage }}%</strong></div>
          <div v-if="matchArtifact?.preview.candidates?.length" class="da-artifact-result__candidates">
            <span class="da-artifact-result__eyebrow">候选方向对比</span>
            <div v-for="candidate in matchArtifact.preview.candidates" :key="candidate.role" class="da-artifact-result__candidate">
              <span>{{ candidate.role }}</span><strong>{{ candidate.score }}</strong>
            </div>
          </div>
          <span class="da-artifact-result__note">中央岗位图谱仅定位目标岗位，不是本次匹配结果的额外分数。</span>
        </div>
        <template v-else>
        <!-- #8 KPI 卡片 (带 tooltip 增强可信度) -->
        <div class="da-section da-section--overview">
          <div class="da-section__title"><Icon icon="lucide:activity" :width="14" />方向概览 · {{ currentAnalysisLabel }}</div>
          <div class="kpi-card">
            <button class="kpi-label kpi-info-button" :aria-expanded="showDemandTip" @click="showDemandTip = !showDemandTip">岗位需求总量 <Icon icon="lucide:info" :width="14" class="kpi-info-icon" /></button>
            <div class="kpi-val"><span class="kpi-num">{{ nationalKpi.demandTotal?.toLocaleString() ?? '—' }}</span></div>
            <p v-if="isRealOverview" class="overview-muted">尚无可核验的需求统计</p>
            <div class="kpi-tooltip kpi-tooltip--right" v-show="showDemandTip">
              <div class="tooltip-header">需求趋势说明</div>
              <div v-if="isRealOverview" class="tooltip-body">当前只有方向目录，没有可追溯的招聘需求统计；此处不使用演示数字补齐。</div>
              <div v-else class="tooltip-body">
                <p>• 当前指数基于演示岗位样本的热度、活跃度和地区分布综合估算。</p>
                <p>• 主要用于展示不同岗位和不同省份的相对差异。</p>
              </div>
              <div class="tooltip-footer">{{ isRealOverview?'等待可信统计来源':'演示模式 · 非真实招聘平台统计' }}</div>
            </div>
          </div>
          <div class="kpi-card">
            <button class="kpi-label kpi-info-button" :aria-expanded="showSalaryTip" @click="showSalaryTip = !showSalaryTip">平均中位薪资 <Icon icon="lucide:info" :width="14" class="kpi-info-icon" /></button>
            <div class="kpi-val"><span class="kpi-num">{{ nationalKpi.avgSalary ?? '—' }}</span><span v-if="!isRealOverview" class="kpi-unit">K</span></div>
            <p v-if="isRealOverview" class="overview-muted">尚无可核验的薪资统计</p>
            <div class="kpi-tooltip kpi-tooltip--right" v-show="showSalaryTip">
              <div class="tooltip-header">演示样本说明</div>
              <div v-if="isRealOverview" class="tooltip-body">方向目录没有提供可核验的薪资样本，未知不显示为零，也不套用演示薪资。</div>
              <div v-else class="tooltip-body">
                <p>• 当前结果基于演示岗位样本的趋势估算，用于展示职业分析路径。</p>
                <p>• 数值会随岗位方向与后续省份选择联动变化。</p>
                <p>• 适合用来比较方向差异，不代表真实招聘数据库结论。</p>
              </div>
              <div class="tooltip-footer">{{ isRealOverview?'等待可信统计来源':'演示模式 · 用于展示分析流程' }}</div>
            </div>
          </div>
        </div>

        <!-- #9 省份排行 (需求/薪资双榜切换) -->
        <div class="da-section da-section--ranking">
          <div class="da-section__title">
            <Icon icon="lucide:trophy" :width="14" />
            <span>{{ isRealOverview?'地区排行':'TOP 10' }}</span>
            <span class="rank-mode-label">{{ isRealOverview?'待可信数据':rankModeLabel }}</span>
          </div>
          <div class="rank-list">
            <p v-if="isRealOverview" class="overview-muted">暂无可信地区排行。可以在原地图中选择想了解的地区，不代表当地需求或薪资。</p>
            <div
              v-for="p in provinceRanking" :key="p.name"
              class="rank-item"
              :class="{ 'rank-item--active': hasSelectedProvince && selectedProvince === p.name, 'rank-item--disabled': !hasSelectedJob }"
              :aria-disabled="!hasSelectedJob"
              role="button"
              :tabindex="hasSelectedJob ? 0 : -1"
              @click="selectRankedProvince(p.name)"
              @keydown.enter="selectRankedProvince(p.name)"
              @keydown.space.prevent="selectRankedProvince(p.name)"
            >
              <span class="rank-badge" :class="{ 'rank-badge--top': p.rank <= 3 }">{{ p.rank }}</span>
              <span class="rank-name">{{ p.shortName }}</span>
              <span class="rank-bar-wrap">
                <span class="rank-bar" :style="{ width: p.barPercent + '%' }"></span>
              </span>
              <span class="rank-val">{{ p.displayValue }}</span>
            </div>
          </div>
        </div>
        </template>

      </aside>

      <!-- 中央区域：气泡图（上50%）+ 地图&薪资图（下50%） -->
      <main class="da-map">
        <!-- 上半：行业气泡图（ECharts graph + force） -->
        <div class="da-bubble-wrap">
          <div class="da-bubble-job-tag" :class="{ 'da-bubble-job-tag--empty': !hasSelectedJob }">
            <Icon :icon="hasSelectedJob ? 'lucide:briefcase' : 'lucide:mouse-pointer-click'" :width="12" />
            <template v-if="hasSelectedJob">
              <span class="da-bubble-job-tag__step">{{ artifactId ? '本次产物目标岗位' : '已选岗位' }}</span>
              <b :style="{ color: selectedJob?.domainColor }">{{ selectedJobLabel }}</b>
              <span class="da-bubble-job-tag__domain">{{ selectedJobDomainLabel }}</span>
            </template>
            <template v-else>
              <span>第 1 步：从气泡图选择岗位</span>
              <span class="da-bubble-job-tag__domain">当前方向：{{ currentAnalysisLabel }}</span>
            </template>
          </div>
          <svg ref="bubbleSvgRef" class="da-bubble-svg"></svg>
          <div v-if="isRealOverview" class="overview-directory-state"><span v-if="overviewLoading">正在读取方向目录…</span><span v-else-if="overviewError" role="alert">{{ overviewError }} <button @click="initializeOverview">重试</button></span><span v-else-if="!overviewGroups.length">当前没有可用的方向资料</span><template v-else><button :disabled="overviewPage===0" aria-label="上一组职业方向" @click="setOverviewPage(overviewPage-1)">←</button><span>{{ overviewPage+1 }} / {{ overviewPages }} 组 · 目录线索，不是匹配度{{ overviewPartial?' · 部分条目待核对':'' }}</span><button :disabled="overviewPage+1>=overviewPages" aria-label="下一组职业方向" @click="setOverviewPage(overviewPage+1)">→</button></template></div>
        </div>

        <!-- 下半：薪资柱状图 + 地图 -->
        <div v-if="artifactId" class="da-artifact-chart-wrap">
          <div class="da-section__title"><Icon icon="lucide:chart-no-axes-combined" :width="15" />本次匹配指标</div>
          <VChart class="da-artifact-chart" :option="matchArtifactChartOption" autoresize />
          <p>指标仅取自当前对话中的同一份匹配产物。</p>
        </div>
        <div v-else class="da-bottom" :class="{ 'da-bottom--focus-map': !hasSelectedProvince }">
          <!-- 左：省份中位薪资排行（全岗位滑动） -->
          <Transition :css="false" @enter="onSalaryEnter" @leave="onSalaryLeave">
            <div v-if="hasSelectedProvince" class="da-salary-chart">
              <div class="da-section__title da-section__title--sm">
                <Icon icon="lucide:list-ordered" :width="12" />{{ selectedProvinceLabel }} · {{ isRealOverview?'薪资对照':'中位薪资排行（K/月）' }}
              </div>
              <p v-if="isRealOverview" class="overview-muted">此处保留原薪资图位置，当前没有可信样本，暂不绘制数值。</p>
              <VChart v-else class="da-salary-vchart" :option="salaryChartOption" autoresize />
            </div>
          </Transition>

          <!-- 右：地图区域 -->
          <div class="da-map-inner" ref="scrollRef" :class="{ 'da-map-inner--locked': !hasSelectedJob, 'da-map-inner--pending': hasSelectedJob && !hasSelectedProvince }">
            <img :src="parchmentBaseUrl" class="da-map-inner__base" alt="" draggable="false" />
            <VChart
              ref="vchartRef"
              class="da-map__chart"
              :option="mapOption"
              :init-options="mapInitOptions"
              :update-options="mapUpdateOptions"
              @click="handleMapClick"
              autoresize
            />
            <div class="da-map-inner__vignette"></div>
            <!-- 图钉图例（缩小版） -->
            <div v-if="!isRealOverview" class="da-pin-legend da-pin-legend--sm" :class="{ 'da-pin-legend--muted': !hasSelectedJob }">
              <div class="pin-legend__list">
                <div class="pin-item" :class="{ active: activeLevel === 4 }" @click="highlightMapLevel(4)">
                  <div class="pin pin--sm" style="--pin-color:#8B5E14"><div class="pin__head"></div><div class="pin__needle"></div></div>
                  <span class="pin-label">极高(&gt;60)</span>
                </div>
                <div class="pin-item" :class="{ active: activeLevel === 3 }" @click="highlightMapLevel(3)">
                  <div class="pin pin--sm" style="--pin-color:#a67c52"><div class="pin__head"></div><div class="pin__needle"></div></div>
                  <span class="pin-label">高(41-60)</span>
                </div>
                <div class="pin-item" :class="{ active: activeLevel === 2 }" @click="highlightMapLevel(2)">
                  <div class="pin pin--sm" style="--pin-color:#c4a878"><div class="pin__head"></div><div class="pin__needle"></div></div>
                  <span class="pin-label">中(21-40)</span>
                </div>
                <div class="pin-item" :class="{ active: activeLevel === 1 }" @click="highlightMapLevel(1)">
                  <div class="pin pin--sm" style="--pin-color:#ddd0b8"><div class="pin__head"></div><div class="pin__needle"></div></div>
                  <span class="pin-label">低(≤20)</span>
                </div>
              </div>
            </div>
            <div v-if="!isRealOverview && analysisStage === 'job-pending'" class="da-map-overlay">
              <span class="da-map-overlay__badge">待选择岗位</span>
              <strong class="da-map-overlay__title">先从上方气泡图中选择岗位</strong>
              <p class="da-map-overlay__desc">当前先展示 {{ currentAnalysisLabel }} 方向概览，选中岗位后再查看各省份差异。</p>
            </div>
            <div v-if="analysisStage === 'insight-ready'" class="da-map__hint da-map__hint--sm">
              <span class="da-map__hint-dot"></span>
              <span><b>{{ selectedProvinceLabel }}</b> · {{ selectedJobLabel }}</span>
            </div>
            <div v-if="isRealOverview" class="overview-map-note">{{ hasSelectedJob?'可选择地区偏好':'先从上方选择一个方向' }} · 暂无需求热力统计</div>
          </div>

        </div>
      </main>

      <!-- 右面板 -->
      <aside class="da-right">
        <div v-if="artifactId" class="da-artifact-gaps">
          <span class="da-artifact-result__eyebrow">岗位差距</span>
          <h2>优先补齐的能力</h2>
          <div v-if="matchArtifact?.preview.gaps?.length" class="da-artifact-gaps__list">
            <span v-for="gap in matchArtifact.preview.gaps" :key="gap">{{ gap }}</span>
          </div>
          <p v-else>这份匹配产物没有列出具体能力差距。</p>
          <p class="da-artifact-gaps__note">本页只展示当前产物已提供的指标与差距；不会将通用演示岗位统计当作你的个人匹配结果。</p>
          <button type="button" @click="returnToAgent"><Icon icon="lucide:arrow-left" :width="14" />返回原对话</button>
        </div>
        <div v-else-if="isRealOverview" class="da-right-content overview-live-detail">
          <template v-if="hasSelectedJob"><section class="da-section"><div class="da-section__title"><Icon icon="lucide:briefcase" :width="14"/>{{ selectedJobLabel }}</div><p class="overview-muted">来自职业方向目录，不是当前招聘公告，也不是你的胜任结论。</p><p v-if="overviewDetailLoading" role="status">正在读取这项方向资料…</p><p v-else-if="overviewDetailError" role="alert">{{ overviewDetailError }} <button class="da-back" @click="loadOverviewDetail(selectedJobLabel)">重试</button></p><template v-else><h3>目录列出的技能线索</h3><div class="overview-skill-tags"><span v-for="skill in overviewSkills" :key="skill">{{ skill }}</span></div><p v-if="!overviewSkills.length" class="overview-muted">暂未列出技能依据，不补造要求。</p></template></section>
          <section class="da-section da-section--chart"><div class="da-section__title"><Icon icon="lucide:git-compare" :width="14"/>{{ selectedProvince?selectedProvinceLabel+' · ':'' }}薪资水平对标</div><div class="overview-chart-unavailable"><Icon icon="lucide:chart-no-axes-combined" :width="24"/><p>暂缺可核验的薪资分布样本</p><small>暂时无法比较不同地区。</small></div><p v-if="selectedProvince" class="overview-muted">地区是你选定的了解范围，不代表这里更适合你。</p></section>
          <section class="da-section da-section--ai"><div class="da-section__title"><Icon icon="lucide:sparkles" :width="14"/>AI 市场洞察</div><div class="ai-card"><p class="ai-card__content">当前只有方向目录线索，尚不足以判断地区行情。待有可信来源后，再在这里提供市场分析。</p></div></section>
          <section class="da-section"><button class="da-link-btn" @click="goToCareerCenter"><Icon icon="lucide:cpu" :width="14"/>查看「{{ selectedJobLabel }}」能力图谱</button></section>
          <section class="da-section"><button class="da-link-btn" @click="openExploration"><Icon icon="lucide:compass" :width="14"/>把这个方向变成一次尝试</button><p class="overview-muted">先试一件小事，再看看自己是否愿意继续。</p></section></template>
          <div v-else class="da-right-empty"><Icon icon="lucide:mouse-pointer-click" :width="36"/><span class="da-right-empty__badge">第 1 步</span><p class="da-right-empty__title">先从气泡图选择方向</p><p class="da-right-empty__desc">看看目录列出了什么，再决定要不要亲自试试。</p></div>
        </div>
        <Transition v-else :css="false" mode="out-in" @enter="onRightEnter" @leave="onRightLeave">
          <div v-if="analysisStage === 'insight-ready'" key="insight" class="da-right-content">
            <!-- 省份对标图 -->
            <div class="da-section da-section--chart">
              <div class="da-section__title">
                <Icon icon="lucide:git-compare" :width="14" />
                <span class="da-trend-province">{{ selectedProvinceLabel }}</span>
                <span class="da-trend-sep">·</span>
                薪资水平对标
              </div>
              <VChart class="da-trend-chart" :option="compareOption" autoresize />
            </div>

            <!-- #4 AI 评价模块（可翻页） -->
            <div class="da-section da-section--ai">
              <div class="da-section__title da-section__title--with-action">
                <span class="da-section__title-text"><Icon icon="lucide:sparkles" :width="14" />AI 市场洞察</span>
                <button class="da-ask-ai-btn" @click="openAiDrawer">
                  <Icon icon="lucide:message-circle" :width="12" />问 AI
                </button>
              </div>
              <div class="ai-card" v-if="currentAiComment">
                <div class="ai-card__tabs">
                  <button
                    v-for="(comment, idx) in aiComments"
                    :key="idx"
                    class="ai-card__tab"
                    :class="{ 'ai-card__tab--active': aiCommentPage === idx }"
                    @click="aiCommentPage = idx"
                  >{{ comment.title }}</button>
                </div>
                <p class="ai-card__content">{{ currentAiComment.content }}</p>
              </div>
            </div>

            <!-- #7 查看图谱 — 增强引导 -->
            <div class="da-section">
              <button class="da-link-btn" @click="goToCareerCenter">
                <Icon icon="lucide:cpu" :width="14" />
                <span>查看「{{ selectedJobLabel }}」能力图谱</span>
                <Icon icon="lucide:arrow-right" :width="12" />
              </button>
              <p class="da-link-hint">基于当前已选岗位，查看所需技能和学习路径</p>
            </div>

            <!-- 关注此方向 -->
            <div class="da-section">
              <button
                class="da-follow-btn"
                :class="{ 'da-follow-btn--active': isCurrentRoleFollowed, 'da-follow-btn--disabled': !followableRole }"
                :disabled="!followableRole"
                @click="toggleFollowRole"
              >
                <Icon :icon="followableRole && isCurrentRoleFollowed ? 'lucide:bookmark-check' : 'lucide:bookmark'" :width="12" />
                <span>{{ !followableRole ? '暂不支持关注' : isCurrentRoleFollowed ? '已关注 · 取消' : '关注此方向' }}</span>
              </button>
            </div>
          </div>

          <!-- 未选中提示 -->
          <div v-else :key="'empty-' + analysisStage" class="da-right-empty" :class="{ 'da-right-empty--pending': analysisStage === 'province-pending' }">
            <Icon :icon="analysisStage === 'job-pending' ? 'lucide:mouse-pointer-click' : 'lucide:map-pinned'" :width="36" />
            <span class="da-right-empty__badge">{{ analysisStage === 'job-pending' ? '第 1 步' : '第 2 步' }}</span>
            <p class="da-right-empty__title">{{ analysisStage === 'job-pending' ? '先从气泡图选择岗位' : '继续选择目标省份' }}</p>
            <p class="da-right-empty__desc" v-if="analysisStage === 'job-pending'">当前先展示 {{ currentAnalysisLabel }} 方向概览，选中岗位后这里会展开省份分析。</p>
            <p class="da-right-empty__desc" v-else>已选岗位：{{ selectedJobLabel }}。选择地区排行或地图中的省份，再查看完整洞察。</p>
          </div>
        </Transition>
      </aside>
    </div>

    <!-- 底部 CTA：已关注方向时出现 -->
    <Transition name="cta-slide">
      <div v-if="!isRealOverview && !artifactId && analysisStage === 'insight-ready' && learningStore.targetRoles.length > 0 && ctaVisible" class="da-bottom-cta">
        <span class="da-bottom-cta__text">
          已关注
          <strong>{{ learningStore.targetRoles.map(r => r.role).join(' / ') }}</strong>
          ，去看看自己能否匹配
        </span>
        <button class="da-bottom-cta__btn" @click="goToNavigation">
          <Icon icon="lucide:route" :width="14" />
          前往职途导航
          <Icon icon="lucide:arrow-right" :width="14" />
        </button>
      </div>
    </Transition>

    <!-- AI 对话 Drawer -->
    <el-drawer
      v-model="showAiDrawer"
      title=""
      direction="rtl"
      size="min(380px, 100vw)"
      :with-header="false"
      class="ai-drawer"
    >
      <div class="ai-drawer__wrap">
        <!-- 头部 -->
        <div class="ai-drawer__header">
          <div class="ai-drawer__header-info">
            <span class="ai-drawer__avatar"><Icon icon="lucide:sparkles" :width="16" /></span>
            <div>
              <p class="ai-drawer__title">AI 市场洞察</p>
              <p class="ai-drawer__sub">{{ selectedJob?.jobName ?? roleSearch }} · {{ selectedProvince ?? '全国' }}</p>
            </div>
          </div>
          <button class="ai-drawer__close" @click="showAiDrawer = false">
            <Icon icon="lucide:x" :width="16" />
          </button>
        </div>

        <!-- 消息列表 -->
        <div class="ai-drawer__messages" ref="aiDrawerScrollRef">
          <template v-for="(msg, i) in aiDrawerMessages" :key="msg.id ?? i">
            <!-- 用户消息 -->
            <div v-if="msg.role === 'user'" class="ai-drawer__msg ai-drawer__msg--user">
              <div class="ai-drawer__bubble">{{ msg.content }}</div>
              <span class="ai-drawer__time">{{ msg.time }}</span>
            </div>
            <!-- AI 消息 -->
            <div v-else class="ai-drawer__msg ai-drawer__msg--ai">
              <!-- 推理过程折叠 -->
              <button
                v-if="msg.thinking && msg.status === 'done'"
                class="ai-drawer__reasoning-toggle"
                @click="toggleDrawerThinking(msg.id!)"
              >
                <Icon icon="lucide:brain" :width="12" />
                <span>推理过程</span>
                <span class="ai-drawer__reasoning-dur">{{ msg.thinkingDuration }}s</span>
                <Icon :icon="drawerExpandedThinking.has(msg.id!) ? 'lucide:chevron-up' : 'lucide:chevron-down'" :width="12" />
              </button>
              <div v-if="msg.id && drawerExpandedThinking.has(msg.id)" class="ai-drawer__reasoning-detail">
                {{ msg.thinking }}
              </div>
              <!-- 气泡内容 -->
              <div class="ai-drawer__bubble" v-html="getDrawerDisplayContent(msg)"></div>
              <span v-if="msg.id === drawerStreamingId" class="ai-drawer__cursor"></span>
              <span class="ai-drawer__time">{{ msg.time }}</span>
            </div>
          </template>

          <!-- 思考中动画 -->
          <div v-if="drawerIsThinking" class="ai-drawer__msg ai-drawer__msg--ai">
            <div class="ai-drawer__thinking">
              <div class="ai-drawer__thinking-head">
                <span class="ai-drawer__thinking-dot"></span>
                <span>正在分析</span>
                <span class="ai-drawer__thinking-time">{{ drawerThinkingElapsed }}s</span>
              </div>
              <div class="ai-drawer__thinking-steps">
                <div
                  v-for="(step, si) in drawerThinkingSteps" :key="si"
                  class="ai-drawer__thinking-step"
                  :class="{
                    'is-current': si === drawerCurrentThinkingStep,
                    'is-past': si < drawerCurrentThinkingStep,
                    'is-future': si > drawerCurrentThinkingStep,
                  }"
                >{{ step }}</div>
              </div>
            </div>
          </div>

          <!-- typing 占位（仅 loading 且未进入 thinking 时显示） -->
          <div v-if="aiDrawerLoading && !drawerIsThinking && !drawerStreamingId" class="ai-drawer__msg ai-drawer__msg--ai">
            <div class="ai-drawer__bubble ai-drawer__bubble--typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>

        <!-- 快捷问题 -->
        <div class="ai-drawer__quick" v-if="aiDrawerMessages.length <= 1">
          <button
            v-for="q in aiDrawerQuickPrompts"
            :key="q"
            class="ai-drawer__quick-btn"
            @click="sendAiDrawerMsg(q)"
          >{{ q }}</button>
        </div>

        <!-- 输入框 -->
        <div class="ai-drawer__input-row">
          <input
            class="ai-drawer__input"
            v-model="aiDrawerInput"
            placeholder="输入你的问题…"
            @keydown.enter="sendAiDrawerMsg()"
            :disabled="aiDrawerLoading"
          />
          <button class="ai-drawer__send" @click="sendAiDrawerMsg()" :disabled="aiDrawerLoading || !aiDrawerInput.trim()">
            <Icon icon="lucide:send" :width="15" />
          </button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>
<style scoped src="./careerAnalysis.css"></style>
<style scoped>
.overview-muted{font-size:12px;line-height:1.85;color:var(--text-300);margin:10px 0;overflow-wrap:anywhere}
.overview-directory-state{position:absolute;bottom:6px;left:16px;z-index:4;display:flex;gap:8px;align-items:center;background:#fff9;border-radius:18px;padding:0 8px;font-size:11px;color:var(--text-200);max-width:calc(100% - 32px)}
.overview-directory-state button{border:0;background:transparent;min-height:36px;min-width:32px;font:inherit;color:var(--primary-100);cursor:pointer}.overview-directory-state button:disabled{opacity:.4}
.overview-live-detail h3{font-size:14px;font-weight:500;margin:20px 0 12px}.overview-skill-tags{display:flex;flex-wrap:wrap;gap:8px}.overview-skill-tags span{font-size:12px;border:1px solid #c5b39366;background:#f6efe2;padding:6px 10px;border-radius:3px}
.overview-chart-unavailable{min-height:110px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;border:1px solid #c5b39344;background:#f5f0e6a6;color:var(--text-300);text-align:center;font-size:12px}.overview-chart-unavailable p{margin:0}.overview-chart-unavailable small{font-size:11px}
.overview-map-note{position:absolute;bottom:14px;left:20px;z-index:5;background:#f8f3e8db;border:1px solid #c5b39366;padding:7px 12px;font-size:11px;color:#6d5c43;pointer-events:none}
@media(max-width:767px){.overview-trial-entry{font-size:12px}.overview-directory-state{max-width:calc(100% - 20px);left:10px}.overview-map-note{left:12px;right:12px;font-size:10px}}
</style>
