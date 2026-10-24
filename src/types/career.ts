// 布局模式（职业能力图谱页面）
export type LayoutMode = 'single' | 'split' | 'workspace'

// 心仪岗位（收藏的岗位）
export interface SavedJob {
  id: string
  savedJobId?: string
  jobTitle: string
  company: string
  industry: string
  salary: string
  location: string
  matchScore: number       // 0-100，人岗匹配度
  requiredSkills: string[] // 岗位关键技能
  savedAt: string
  notes?: string           // 用户备注
  role?: string            // 对应的 CareerRole 方向
  jobPortraitId?: string
  publicationVersion?: string
  publicationStatus?: 'current' | 'revoked' | 'superseded' | 'unavailable' | 'legacy_unverified' | string
  contentSha256?: string
  vacancyValidity?: 'unknown' | string
  publicationSnapshot?: Record<string, unknown> | null
}

// 从职业分析收藏的职业方向（与 savedJobs 的具体职位严格区分）
export interface TargetRole {
  role: string   // CareerRole 值，如 '前端开发'
  savedAt: string
}

export interface TargetRoleMarket {
  role: string
  salaryRange: string
  medianSalary: number
  demandLevel: string
  hotCities: string[]
  industries: string[]
  skillTags: string[]
  sampleJobs: string[]
  trendNote: string
  referenceMatch: number
}

// ══ 职业生涯报告相关类型 ══

export type SevenDim = {
  专业技能: number
  证书资质: number
  创新能力: number
  学习能力: number
  抗压能力: number
  沟通能力: number
  实习经验: number
}

export type JobLevel = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'expert'

export type JobPortrait = {
  id: string
  title: string
  level: JobLevel
  lineId: string
  stack?: string
  sevenDim: SevenDim
  keySkills: string[]
  salaryRange: string
  desc: string
  matchScore: number
}

export type CareerPathEdge = {
  fromId: string
  toId: string
  type: 'promote' | 'transfer'
  skills: string[]
}

/** 已废弃（保留兼容），新代码请用 CAREER_PATH_EDGES */
export type MetroLine = {
  id: string
  name: string
  color: string
  trackColor: string
  stationIds: string[]
}

export type TransferEdge = {
  fromId: string
  toId: string
  skills: string[]
  label: string
}

export type GrowthAction = {
  phase: 'short' | 'mid'
  phaseLabel: string
  goal: string
  tasks: string[]
  milestone: string
}
