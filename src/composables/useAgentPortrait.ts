import { getApiMode } from '@/api/config'

/* ══════════════════════════════════════════════
   简历解析后的技能结构（对应 resumeStore.parsedSkills）
══════════════════════════════════════════════ */
export interface ParsedSkill {
  name:     string
  weight:   number   // 0-1
  category: string
}

/* ══════════════════════════════════════════════
   个人信息结构
══════════════════════════════════════════════ */
export interface PersonInfo {
  name:       string
  school:     string
  major:      string
  grade:      string           // 大一 ~ 研三
  targetRole: string
  gpa?:       number
  selfSummary?: string
  honors:     { type: 'cert' | 'award' | 'intern'; label: string }[]
  projects:   { name: string; role: string; desc: string }[]
}

/* ══════════════════════════════════════════════
   七维能力
══════════════════════════════════════════════ */
export type AbilityKey =
  | 'professional'   // 专业技能   — 可计算
  | 'certificate'    // 证书资质   — 可计算
  | 'innovation'     // 创新能力   — 后端（论文算法）
  | 'learning'       // 学习能力   — 后端（论文算法）
  | 'stress'         // 抗压能力   — 后端（论文算法）
  | 'communication'  // 沟通能力   — 后端（论文算法）
  | 'internship'     // 实习能力   — 可计算

export interface AbilityDimension {
  key:    AbilityKey
  label:  string
  score:  number            // 0-100
  level:  '优秀' | '良好' | '待提升'
  desc:   string
  source: 'computed' | 'agent'  // 标记计算来源，联调时替换 agent 类型
}

/* ══════════════════════════════════════════════
   完整输入 / 输出
══════════════════════════════════════════════ */
/** Structured profile from BE parse/text (never invent GPA on FE). */
export interface StudentProfilePayload {
  name?: string
  school?: string
  major?: string
  degree?: string
  grade?: string
  gpa?: number
  rank_percent?: number
  phone?: string
  email?: string
  certificates?: string[]
  competitions?: Array<{ name?: string; level?: string; award?: string }>
  projects?: Array<{ name?: string; role?: string; desc?: string; is_team?: boolean }>
  research?: Array<{ name?: string; level?: string; type?: string }>
  leadership_roles?: string[]
  internship_months?: number
}

export interface AgentPortraitInput {
  resumeText:      string
  parsedSkills:    ParsedSkill[]
  predictedRole:   string
  confidence:      number
  matchedCareers:  { role: string; score: number }[]
  /** Prefer BE extract; when present, FE must not hash-fake GPA/school. */
  studentProfile?: StudentProfilePayload
}

export interface AgentPortraitResult {
  completenessScore:    number          // 完整度 0-100
  competitivenessScore: number          // 竞争力 0-100
  personInfo:           PersonInfo
  dimensions:           AbilityDimension[]
  skillTags:            { name: string; weight: number; category: string }[]
  agentSummary:         string
}

/* ══════════════════════════════════════════════
   分阶段流式渲染：Phase 类型与回调
══════════════════════════════════════════════ */
export type AgentPhase = 'parsing' | 'evaluating' | 'analyzing' | 'summarizing'

export type SummarySource = string | ReadableStream<string>

export type PhaseData =
  | { phase: 'parsing';      personInfo: PersonInfo; completenessScore: number }
  | { phase: 'evaluating';   dimensions: AbilityDimension[]; competitivenessScore: number; skillTags: { name: string; weight: number; category: string }[] }
  | { phase: 'analyzing';    honors: PersonInfo['honors']; projects: PersonInfo['projects'] }
  | { phase: 'summarizing';  agentSummary: SummarySource }

export type PhaseCallback = (data: PhaseData) => void

export type AgentTraceStatus = 'pending' | 'running' | 'done' | 'error'

export interface AgentTraceEvent {
  id: string
  phase: AgentPhase
  label: string
  detail: string
  status: AgentTraceStatus
  progress: number
  timestamp: number
  meta?: Record<string, unknown>
}

export type TraceCallback = (event: AgentTraceEvent) => void

export const PHASE_META: { key: AgentPhase; label: string }[] = [
  { key: 'parsing',      label: '简历解析' },
  { key: 'evaluating',   label: '能力评估' },
  { key: 'analyzing',    label: '经历分析' },
  { key: 'summarizing',  label: '生成综合评语' },
]

export const PORTRAIT_TRACE_STEPS: Array<{
  id: string
  phase: AgentPhase
  label: string
  detail: string
  progress: number
  durationMs: number
}> = [
  { id: 'doc-structure', phase: 'parsing', label: '文档预处理', detail: '正在读取简历结构与基础字段', progress: 12, durationMs: 360 },
  { id: 'skill-extract', phase: 'parsing', label: '技能抽取', detail: '正在提取技能关键词与权重信息', progress: 28, durationMs: 420 },
  { id: 'role-match', phase: 'parsing', label: '岗位推断', detail: '正在匹配目标岗位与候选方向', progress: 44, durationMs: 380 },
  { id: 'dimension-score', phase: 'evaluating', label: '能力评估', detail: '正在计算七维能力与竞争力得分', progress: 66, durationMs: 520 },
  { id: 'experience-map', phase: 'analyzing', label: '经历分析', detail: '正在整理项目、荣誉与实习亮点', progress: 82, durationMs: 420 },
  { id: 'summary-generate', phase: 'summarizing', label: '综合结论', detail: '正在生成综合评语与提升建议', progress: 100, durationMs: 600 },
]

// 后端事件类型 → 前端 Phase 的映射（对接时按后端实际事件名补充）
export const PHASE_MAP: Record<string, AgentPhase> = {
  'resume_parsed':       'parsing',
  'ability_scored':      'evaluating',
  'experience_analyzed': 'analyzing',
  'summary_generated':   'summarizing',
}

/* ══════════════════════════════════════════════
   适配器接口：mock 与真实 API 共用签名
   联调时：实现 apiAdapter，将 activeAdapter 指向它
══════════════════════════════════════════════ */
export interface PortraitAdapter {
  run(input: AgentPortraitInput, onPhase: PhaseCallback, onTrace?: TraceCallback): Promise<AgentPortraitResult>
}

function emitTrace(
  onTrace: TraceCallback | undefined,
  step: typeof PORTRAIT_TRACE_STEPS[number],
  status: AgentTraceStatus,
  progress = step.progress,
  meta?: Record<string, unknown>,
) {
  onTrace?.({
    id: step.id,
    phase: step.phase,
    label: step.label,
    detail: step.detail,
    status,
    progress,
    timestamp: Date.now(),
    meta,
  })
}

async function mockStreamingImpl(
  input: AgentPortraitInput,
  onPhase: PhaseCallback,
  onTrace?: TraceCallback,
): Promise<AgentPortraitResult> {
  const result = await enrichPortraitFromProfile(mockPortrait(input))

  const [docStep, skillStep, roleStep, scoreStep, experienceStep, summaryStep] = PORTRAIT_TRACE_STEPS

  emitTrace(onTrace, docStep!, 'running', 6)
  await delay(docStep!.durationMs)
  emitTrace(onTrace, docStep!, 'done')

  emitTrace(onTrace, skillStep!, 'running', 20)
  await delay(skillStep!.durationMs)
  emitTrace(onTrace, skillStep!, 'done')
  onPhase({
    phase: 'parsing',
    personInfo: result.personInfo,
    completenessScore: result.completenessScore,
  })

  emitTrace(onTrace, roleStep!, 'running', 36)
  await delay(roleStep!.durationMs)
  emitTrace(onTrace, roleStep!, 'done')

  emitTrace(onTrace, scoreStep!, 'running', 54)
  await delay(scoreStep!.durationMs)
  emitTrace(onTrace, scoreStep!, 'done')
  onPhase({
    phase: 'evaluating',
    dimensions: result.dimensions,
    competitivenessScore: result.competitivenessScore,
    skillTags: result.skillTags,
  })

  emitTrace(onTrace, experienceStep!, 'running', 74)
  await delay(experienceStep!.durationMs)
  emitTrace(onTrace, experienceStep!, 'done')
  onPhase({
    phase: 'analyzing',
    honors: result.personInfo.honors,
    projects: result.personInfo.projects,
  })

  emitTrace(onTrace, summaryStep!, 'running', 90)
  await delay(summaryStep!.durationMs)
  onPhase({
    phase: 'summarizing',
    agentSummary: result.agentSummary,
  })
  emitTrace(onTrace, summaryStep!, 'done')

  return result
}

const mockAdapter: PortraitAdapter = { run: mockStreamingImpl }

function toLevel(s: number): '优秀' | '良好' | '待提升' {
  return s >= 80 ? '优秀' : s >= 60 ? '良好' : '待提升'
}

function dimScore(block: { dimension_score?: number } | undefined, fallback: number): number {
  const n = Number(block?.dimension_score)
  return Number.isFinite(n) ? Math.round(n) : fallback
}

/** Map L2 portrait API → UI AgentPortraitResult (honest scores, no demo narrative). */
export function mapApiPortraitToResult(
  input: AgentPortraitInput,
  api: {
    name?: string
    D1_basic?: { dimension_score?: number; evidence?: string[]; school_tier?: string; major_category?: string }
    D2_skill?: {
      dimension_score?: number
      skill_coverage?: number
      evidence?: string[]
      sub_internship?: number
      internship_months?: number
    }
    D3_quality?: { dimension_score?: number; evidence?: string[] }
    D4_potential?: {
      dimension_score?: number
      evidence?: string[]
      sub_competition?: number
      sub_research?: number
      sub_academic?: number
      sub_leadership?: number
    }
    summary?: {
      competitiveness_score?: number
      competitiveness_level?: string
      completeness_score?: number
    }
  },
): AgentPortraitResult {
  const personBase = personInfoFromProfile(input)
  const d1 = dimScore(api.D1_basic, 55)
  const d2 = dimScore(api.D2_skill, Math.round((input.matchedCareers[0]?.score ?? 0.6) * 100))
  const d3 = dimScore(api.D3_quality, 58)
  const d4 = dimScore(api.D4_potential, 60)
  const evidence = (xs?: string[]) => (xs && xs.length ? xs.slice(0, 3).join('；') : '')

  // Map 4D → 7 UI dims. Finite 0 = real zero (evidence absent after valid structure).
  // Non-finite = field missing from API → fall back to parent dimension, never invent noise.
  const subAcademic = Number(api.D4_potential?.sub_academic)
  const subResearch = Number(api.D4_potential?.sub_research)
  const subComp = Number(api.D4_potential?.sub_competition)
  const subLead = Number(api.D4_potential?.sub_leadership)
  const hasAcademic = Number.isFinite(subAcademic)
  const hasResearch = Number.isFinite(subResearch)
  const hasComp = Number.isFinite(subComp)
  const learningScore = hasAcademic
    ? Math.round(Math.min(100, (subAcademic / 25) * 100))
    : d4
  const innovationScore = hasResearch || hasComp
    ? Math.round(Math.min(100, (((hasResearch ? subResearch : 0) + (hasComp ? subComp : 0)) / 50) * 100))
    : Math.round((d3 + d4) / 2)
  const internSub = Number(api.D2_skill?.sub_internship)
  const internshipScore = Number.isFinite(internSub)
    ? Math.round(Math.min(100, (internSub / 30) * 100))
    : Math.round(d3 * 0.9)

  const dimensions: AbilityDimension[] = [
    {
      key: 'professional',
      label: '专业技能',
      score: d2,
      source: 'computed',
      level: toLevel(d2),
      desc: evidence(api.D2_skill?.evidence)
        || `${input.parsedSkills.slice(0, 3).map(s => s.name).join('、') || '核心技能'} 覆盖度约 ${Math.round((api.D2_skill?.skill_coverage ?? 0) * 100)}%`,
    },
    {
      key: 'certificate',
      label: '证书资质',
      score: d1,
      source: 'computed',
      level: toLevel(d1),
      desc: evidence(api.D1_basic?.evidence) || `院校层级：${api.D1_basic?.school_tier || '未知'}；专业：${api.D1_basic?.major_category || personBase.major}`,
    },
    {
      key: 'innovation',
      label: '创新能力',
      score: innovationScore,
      source: 'computed',
      level: toLevel(innovationScore),
      desc: evidence(api.D4_potential?.evidence)
        || `科研 ${Number.isFinite(subResearch) ? subResearch : 0}/25 + 竞赛 ${Number.isFinite(subComp) ? subComp : 0}/25`,
    },
    {
      key: 'learning',
      label: '学习能力',
      score: learningScore,
      source: 'computed',
      level: toLevel(learningScore),
      desc: Number.isFinite(subAcademic)
        ? `学术子分 ${subAcademic}/25（GPA/排名证据）；领导力 ${Number.isFinite(subLead) ? subLead : 0}/25`
        : (evidence(api.D4_potential?.evidence) || '缺少 GPA/排名等学术证据时分数偏低属正常'),
    },
    {
      key: 'stress',
      label: '抗压能力',
      score: d3,
      source: 'computed',
      level: toLevel(d3),
      desc: evidence(api.D3_quality?.evidence) || '素养维度代理估计，建议用高强度项目交付补证据',
    },
    {
      key: 'communication',
      label: '沟通能力',
      score: Math.round(d3 * 0.95),
      source: 'computed',
      level: toLevel(Math.round(d3 * 0.95)),
      desc: '软技能多为间接估计；面试与协作产出才是硬证据',
    },
    {
      key: 'internship',
      label: '实习能力',
      score: internshipScore,
      source: 'computed',
      level: toLevel(internshipScore),
      desc: (api.D2_skill?.internship_months || personBase.honors.some(h => h.type === 'intern'))
        ? `实习约 ${api.D2_skill?.internship_months ?? '若干'} 个月信号；仍需对照目标岗 JD 验证深度`
        : '实习信号偏弱：校招筛选里这是常见短板，建议优先补一段相关实习',
    },
  ]

  const completenessScore = Math.round(Number(api.summary?.completeness_score) || 70)
  const competitivenessScore = Math.round(
    Number(api.summary?.competitiveness_score)
    || dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length,
  )
  const level = api.summary?.competitiveness_level || (competitivenessScore >= 75 ? '较强' : '中等')
  const top = [...dimensions].sort((a, b) => b.score - a.score)[0]!
  const weak = [...dimensions].sort((a, b) => a.score - b.score)[0]!
  const name = (api.name || personBase.name || '同学').trim()

  const agentSummary =
    `${name}同学目标方向为「${input.predictedRole}」。综合竞争力约 ${competitivenessScore} 分（${level}），` +
    `完整度约 ${completenessScore}%。相对突出的是「${top.label}」（${top.score}），` +
    `更需优先补强「${weak.label}」（${weak.score}）。` +
    `分数反映常见校招筛选信号，不是录用承诺；请用可验证项目/实习把决定项做实。`

  return {
    completenessScore,
    competitivenessScore,
    personInfo: {
      ...personBase,
      name: api.name || personBase.name,
      major: api.D1_basic?.major_category || personBase.major,
      targetRole: input.predictedRole,
    },
    dimensions,
    skillTags: input.parsedSkills.map(s => ({
      name: s.name,
      weight: s.weight,
      category: s.category,
    })),
    agentSummary,
  }
}

async function apiStreamingImpl(
  input: AgentPortraitInput,
  onPhase: PhaseCallback,
  onTrace?: TraceCallback,
): Promise<AgentPortraitResult> {
  const { createStudentPortrait, saveStudentPortrait } = await import('@/api/pipeline')
  const { DEMO_STUDENT_ID } = await import('@/api/config')

  const [docStep, skillStep, roleStep, scoreStep, experienceStep, summaryStep] = PORTRAIT_TRACE_STEPS
  const studentId = DEMO_STUDENT_ID

  emitTrace(onTrace, docStep!, 'running', 8)
  const personPreview = personInfoFromProfile(input)
  const profile = buildPortraitApiProfile(input, personPreview)
  emitTrace(onTrace, docStep!, 'done')

  emitTrace(onTrace, skillStep!, 'running', 22)
  const skills = input.parsedSkills
    .filter(s => s.name)
    .map(s => ({
      name: s.name,
      category: s.category || '通用',
      confidence: Math.min(1, Math.max(0.3, s.weight)),
    }))
  if (!skills.length) {
    throw new Error('未能提取到技能，请补充更完整的简历文本后再试')
  }
  emitTrace(onTrace, skillStep!, 'done')
  onPhase({
    phase: 'parsing',
    personInfo: personPreview,
    completenessScore: profile.gpa || profile.school ? 72 : 55,
  })

  emitTrace(onTrace, roleStep!, 'running', 40)
  emitTrace(onTrace, roleStep!, 'done', 44, { role: input.predictedRole })

  emitTrace(onTrace, scoreStep!, 'running', 55)
  const env = await createStudentPortrait({
    student_id: studentId,
    skills,
    student_profile: profile,
  })
  if (!env.success || !env.data) {
    throw new Error(env.error || '画像生成失败')
  }
  const result = mapApiPortraitToResult(input, env.data)
  emitTrace(onTrace, scoreStep!, 'done')
  onPhase({
    phase: 'evaluating',
    dimensions: result.dimensions,
    competitivenessScore: result.competitivenessScore,
    skillTags: result.skillTags,
  })

  emitTrace(onTrace, experienceStep!, 'running', 78)
  // Best-effort persist for profile / report pages
  try {
    const d1 = dimScore(env.data.D1_basic, 0)
    const d2 = dimScore(env.data.D2_skill, 0)
    const d3 = dimScore(env.data.D3_quality, 0)
    const d4 = dimScore(env.data.D4_potential, 0)
    await saveStudentPortrait({
      student_id: studentId,
      d1_score: d1,
      d2_score: d2,
      d3_score: d3,
      d4_score: d4,
      skill_coverage: env.data.D2_skill?.skill_coverage ?? 0,
      skill_count: skills.length,
      competitiveness_lvl: env.data.summary?.competitiveness_level || '',
      completeness: (result.completenessScore || 0) / 100,
    })
  } catch {
    /* persist is optional */
  }
  emitTrace(onTrace, experienceStep!, 'done')
  onPhase({
    phase: 'analyzing',
    honors: result.personInfo.honors,
    projects: result.personInfo.projects,
  })

  emitTrace(onTrace, summaryStep!, 'running', 92)
  onPhase({
    phase: 'summarizing',
    agentSummary: result.agentSummary,
  })
  emitTrace(onTrace, summaryStep!, 'done')
  return result
}

const apiAdapter: PortraitAdapter = { run: apiStreamingImpl }

function resolvePortraitAdapter(): PortraitAdapter {
  return getApiMode() === 'http' ? apiAdapter : mockAdapter
}

/* ══════════════════════════════════════════════
   分阶段流式调用（TalentPortrait.vue 使用）
══════════════════════════════════════════════ */
export async function callAgentPortraitStreaming(
  input: AgentPortraitInput,
  onPhase: PhaseCallback,
  onTrace?: TraceCallback,
): Promise<AgentPortraitResult> {
  return resolvePortraitAdapter().run(input, onPhase, onTrace)
}

/* ══════════════════════════════════════════════
   主调用函数（向后兼容，一次性返回完整结果）
   联调时：将 mockPortrait(input) 替换为
     const res = await fetch(endpoint, { method:'POST', body: JSON.stringify(input) })
     return res.json()
══════════════════════════════════════════════ */
export async function callAgentPortrait(
  input: AgentPortraitInput,
): Promise<AgentPortraitResult> {
  return callAgentPortraitStreaming(input, () => {})
}

/* ══════════════════════════════════════════════
   抽象能力单独接口（后端读论文计算）
   联调时：替换函数体为 fetch 调用
══════════════════════════════════════════════ */
export async function getAbstractAbilityScores(
  input: AgentPortraitInput,
): Promise<Pick<AbilityDimension, 'key' | 'score' | 'desc'>[]> {
  return mockAbstractScores(input)
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

/* ══════════════════════════════════════════════
   工具：确定性伪随机（基于字符串哈希）
══════════════════════════════════════════════ */
function strHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h
}
function seededFloat(seed: number, lo: number, hi: number): number {
  const r = ((seed * 1664525 + 1013904223) >>> 0) / 4294967296
  return lo + r * (hi - lo)
}

/* ══════════════════════════════════════════════
   抽象维度 Mock（沟通/抗压/创新/学习）
══════════════════════════════════════════════ */
function mockAbstractScores(input: AgentPortraitInput) {
  const base = strHash(input.predictedRole + input.resumeText.slice(0, 20))
  const entries: { key: AbilityKey; labelCN: string; descs: [string, string, string] }[] = [
    {
      key: 'innovation',
      labelCN: '创新能力',
      descs: [
        '参与多个原创项目，具备较强的技术创新意识',
        '有一定项目经历，展现出良好的问题解决能力',
        '创新实践经验有待积累，建议参与更多开源项目',
      ],
    },
    {
      key: 'learning',
      labelCN: '学习能力',
      descs: [
        '技术栈更新迭代快，自主学习能力突出',
        '能够快速掌握新技术，学习路径清晰',
        '建议系统化学习规划，提升知识体系完整度',
      ],
    },
    {
      key: 'stress',
      labelCN: '抗压能力',
      descs: [
        '有高强度项目交付经验，抗压表现优秀',
        '能在一定压力下保持工作效率',
        '建议通过团队协作项目锻炼抗压能力',
      ],
    },
    {
      key: 'communication',
      labelCN: '沟通能力',
      descs: [
        '文档表达清晰，具备良好的跨团队协作能力',
        '能够有效传达技术方案，沟通能力良好',
        '建议增加技术分享和团队协作的实践经验',
      ],
    },
  ]
  return entries.map((e, i) => {
    const seed = (base + i * 997) >>> 0
    const score = Math.round(seededFloat(seed, 52, 90))
    const descIdx = score >= 80 ? 0 : score >= 65 ? 1 : 2
    return { key: e.key, score, desc: e.descs[descIdx]! }
  })
}

/* ══════════════════════════════════════════════
   个人信息：优先 BE student_profile，禁止哈希伪造 GPA
══════════════════════════════════════════════ */
function personInfoFromProfile(input: AgentPortraitInput): PersonInfo {
  const sp = input.studentProfile
  // Grade/name/school/major only from LLM student_profile — no resumeText regex/includes guess.
  const grade = sp?.grade?.trim() || '—'

  const honors: PersonInfo['honors'] = []
  for (const c of sp?.certificates || []) {
    honors.push({ type: 'cert', label: String(c) })
  }
  for (const c of sp?.competitions || []) {
    honors.push({ type: 'award', label: String(c.name || c.level || '获奖') })
  }
  if ((sp?.internship_months || 0) > 0) {
    honors.push({ type: 'intern', label: `实习/实践约 ${sp!.internship_months} 个月` })
  }
  for (const role of sp?.leadership_roles || []) {
    honors.push({ type: 'award', label: String(role) })
  }

  const projects: PersonInfo['projects'] = (sp?.projects || []).map(p => ({
    name: String(p.name || '项目'),
    role: String(p.role || '成员'),
    desc: String(p.desc || '').slice(0, 160),
  }))

  const name = (sp?.name || '').trim() || '同学'
  const school = (sp?.school || '').trim()
  const major = (sp?.major || '').trim()

  return {
    name,
    school: school || '（结构未通过校验：缺院校）',
    major: major || '（结构未通过校验：缺专业）',
    grade,
    targetRole: input.predictedRole,
    // Only real GPA from extractor — never seededFloat
    gpa: typeof sp?.gpa === 'number' ? sp.gpa : undefined,
    selfSummary: projects.length
      ? `目标方向「${input.predictedRole}」，简历解析到 ${projects.length} 个项目信号。`
      : `目标方向「${input.predictedRole}」。`,
    honors,
    projects,
  }
}

function buildPortraitApiProfile(
  input: AgentPortraitInput,
  person: PersonInfo,
): Record<string, unknown> {
  const sp = input.studentProfile || {}
  return {
    name: sp.name || person.name,
    school: sp.school || (person.school.startsWith('（') ? '' : person.school),
    major: sp.major || (person.major.startsWith('（') ? '' : person.major),
    degree: sp.degree || '本科',
    ...(typeof sp.gpa === 'number' ? { gpa: sp.gpa } : {}),
    ...(typeof sp.rank_percent === 'number' ? { rank_percent: sp.rank_percent } : {}),
    certificates: sp.certificates || person.honors.filter(h => h.type === 'cert').map(h => h.label),
    competitions: sp.competitions || [],
    research: sp.research || [],
    leadership_roles: sp.leadership_roles || [],
    projects: (sp.projects || person.projects).map(p => ({
      name: p.name,
      role: p.role,
      is_team: Boolean((p as { is_team?: boolean }).is_team),
      desc: p.desc,
    })),
    internship_months: sp.internship_months ?? 0,
  }
}

/* ══════════════════════════════════════════════
   钟梓珉硬编码画像（基于真实简历深度解析）
══════════════════════════════════════════════ */
const ZHONGZIMIN_PORTRAIT: AgentPortraitResult = {
  completenessScore: 100,
  competitivenessScore: 84,
  personInfo: {
    name: '钟梓珉',
    school: '四川轻化工大学',
    major: '计算机科学与技术',
    grade: '大二',
    targetRole: '大模型工程师/AI Agent开发',
    gpa: 3.92,
    selfSummary:
      '具备扎实的 Python 后端与 AI Agent 开发能力，熟练掌握 LangChain/LangGraph 多 Agent 协作架构、RAG 系统与 GraphRAG 混合检索。有 LoRA 微调实战经验，熟悉 Neo4j 图数据库与 Milvus 向量数据库。作为技术负责人主导过 2 个完整 Agent 项目交付，具备从模型微调到工程化部署的全链路能力。科研方面参与省重点实验室具身智能体研究，以第一作者目标冲击顶刊。',
    honors: [
      { type: 'award', label: '2025全球校园AI算法精英大赛 国家级一等奖' },
      { type: 'award', label: '专业排名前1% 一等奖学金' },
      { type: 'award', label: '省级大创项目负责人（在研）' },
      { type: 'cert', label: '人工智能协会学科竞赛部副部长' },
      { type: 'intern', label: '省重点人工智能实验室 学生科研成员' },
      { type: 'intern', label: '组织校内开发团队交付多个盈利项目' },
    ],
    projects: [
      {
        name: '职导星图 — 大学生职业规划智能体',
        role: '核心开发者',
        desc: '基于 LangGraph 设计 3-Agent 协作架构（路由/检索/生成），Qwen3.5 2B LoRA 微调 F1 达 87.3%，Neo4j 知识图谱 3200+ 节点，GraphRAG 召回率 89%，端到端延迟 ~800ms，50 QPS',
      },
      {
        name: '智网·图谱 — 多模态网络课程智能教学平台',
        role: '技术负责人',
        desc: '主导 Agent 核心模块设计，LangGraph 任务规划 + Milvus 混合检索，单轮准确率 89%（基线 72%），FastAPI + Docker 工程化交付，支撑 200+ 学生，可用性 99.5%',
      },
      {
        name: '省级大创 — 具身智能体分层规划与视觉-动作控制',
        role: '项目负责人',
        desc: 'LLM 动态编排 + VLM 时空记忆 + NoMaD VLA 控制三层解耦架构，Unitree Go2 四足机器人真机验证，预期第一作者发表 AI 顶刊论文',
      },
    ],
  },
  dimensions: [
    { key: 'professional', label: '专业技能', score: 90, source: 'computed', level: '优秀', desc: 'Python、LangChain、RAG、FastAPI、Neo4j、Milvus 等技术掌握扎实，具备全栈 Agent 开发能力' },
    { key: 'certificate', label: '证书资质', score: 85, source: 'computed', level: '优秀', desc: '全球校园AI算法精英大赛国家级一等奖（国金）、专业排名前1%一等奖学金、协会学科竞赛部副部长，竞赛成果突出' },
    { key: 'innovation', label: '创新能力', score: 92, source: 'agent', level: '优秀', desc: '省级大创负责人，自研 GraphRAG 融合检索、3-Agent 协作架构，三层解耦具身智能架构，具备原创性技术方案设计能力' },
    { key: 'learning', label: '学习能力', score: 93, source: 'agent', level: '优秀', desc: '专业排名前 1%，快速掌握 Qwen LoRA 微调、MCP 协议等前沿技术，自主学习路径清晰' },
    { key: 'stress', label: '抗压能力', score: 88, source: 'agent', level: '优秀', desc: '同时推进 3 个项目（科研+竞赛+外包），高强度多线程交付，具备出色的抗压与时间管理能力' },
    { key: 'communication', label: '沟通能力', score: 82, source: 'agent', level: '优秀', desc: '作为技术负责人与客户对接交付，担任协会副部长组织团队，文档与方案表达清晰' },
    { key: 'internship', label: '实习能力', score: 65, source: 'computed', level: '良好', desc: '有实验室科研经历与多个项目交付经验，具备一定的职场实践基础，建议补充企业实习' },
  ],
  skillTags: [
    { name: 'Python', weight: 0.95, category: '机器学习' },
    { name: 'LangChain / LangGraph', weight: 0.92, category: '机器学习' },
    { name: 'RAG 系统', weight: 0.90, category: '机器学习' },
    { name: 'Prompt Engineering', weight: 0.88, category: '机器学习' },
    { name: 'FastAPI', weight: 0.85, category: '后端' },
    { name: 'Neo4j', weight: 0.82, category: '数据' },
    { name: 'Milvus / 向量检索', weight: 0.80, category: '数据' },
    { name: 'LoRA 微调', weight: 0.78, category: '机器学习' },
    { name: 'Docker', weight: 0.75, category: '通用' },
    { name: 'Git', weight: 0.72, category: '通用' },
    { name: 'Ollama', weight: 0.70, category: '机器学习' },
    { name: 'MCP 协议', weight: 0.65, category: '机器学习' },
    { name: 'Flask', weight: 0.60, category: '后端' },
  ],
  agentSummary:
    '钟梓珉同学目前就读于四川轻化工大学计算机科学与技术专业，目标方向为「大模型工程师/AI Agent开发」。综合评估竞争力得分 84 分，整体处于较强竞争水平，在本科生中具备显著优势。' +
    '六项维度达到优秀等级：「学习能力」（93 分）最为突出，专业排名前 1% 且能快速掌握 LoRA 微调、MCP 协议等前沿技术；「创新能力」（92 分）同样亮眼，作为省级大创负责人自研 GraphRAG 融合检索方案与三层解耦具身智能架构；「专业技能」（90 分）覆盖 Python 全栈 + Agent 开发 + 模型微调 + 容器化部署的完整技术链路；「证书资质」（85 分）手握国金级算法竞赛大奖，竞赛成果突出。' +
    '「实习经验」（65 分）是唯一良好维度，目前以实验室科研和项目交付为主，建议在暑期争取 AI 头部企业（如智谱、百度、阿里）实习岗位，将科研成果转化为工业级实践经验，届时竞争力有望突破 90 分。' +
    '建议持续深耕 Agent 开发方向，积极参与开源社区（如 LangChain、Dify 贡献），争取在顶刊/顶会上发表论文，全面提升学术与工程双线竞争力。',
}

/** Map backend 4D scores onto the 7-dim portrait used by the UI. */
async function enrichPortraitFromProfile(base: AgentPortraitResult): Promise<AgentPortraitResult> {
  try {
    const { getStudent4d } = await import('@/api/profile')
    const { DEMO_STUDENT_ID } = await import('@/api/config')
    const env = await getStudent4d(DEMO_STUDENT_ID)
    const data = env.data as {
      completeness?: number
      total_score?: number
      dimensions?: Record<string, { score?: number; name?: string; description?: string }>
    } | undefined
    if (!data?.dimensions) return base

    const d = data.dimensions
    const scoreOf = (key: string, fallback: number) => {
      const n = Number(d[key]?.score)
      return Number.isFinite(n) ? Math.round(n) : fallback
    }

    const next: AgentPortraitResult = {
      ...base,
      completenessScore: Math.round(Number(data.completeness) || base.completenessScore),
      competitivenessScore: Math.round(Number(data.total_score) || base.competitivenessScore),
      dimensions: base.dimensions.map(dim => {
        let score = dim.score
        if (dim.key === 'professional') score = scoreOf('D2', dim.score)
        else if (dim.key === 'certificate') score = scoreOf('D1', dim.score)
        else if (dim.key === 'internship') score = scoreOf('D3', dim.score)
        else if (dim.key === 'innovation' || dim.key === 'learning') {
          score = Math.round((scoreOf('D3', dim.score) + scoreOf('D4', dim.score)) / 2)
        }
        else if (dim.key === 'stress' || dim.key === 'communication') score = scoreOf('D4', dim.score)
        const level: AbilityDimension['level'] = score >= 80 ? '优秀' : score >= 60 ? '良好' : '待提升'
        const desc = d.D2?.description && dim.key === 'professional'
          ? String(d.D2.description)
          : dim.desc
        return { ...dim, score, level, desc, source: 'computed' as const }
      }),
    }
    return next
  } catch {
    return base
  }
}

/* ══════════════════════════════════════════════
   完整 Mock 实现
══════════════════════════════════════════════ */
function mockPortrait(input: AgentPortraitInput): AgentPortraitResult {
  // Demo narrative portrait; scores optionally overlaid from profile 4d API/fixture
  void input
  return ZHONGZIMIN_PORTRAIT
}
