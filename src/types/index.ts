/**
 * 类型定义 barrel re-export
 * 按领域拆分到独立文件，此处统一导出以保持外部 import 路径不变。
 */

// 用户 & 权限
export { UserRole } from './user'
export type { User, AuthUser, ClassData, StudentGrade, SystemStats } from './user'

// 课程 & 学习
export { QuestionType } from './course'
export type {
  Category, Chapter, Course, LearningProgress,
  Question, QuizRecord, WrongQuestion, Note, LearningReport,
} from './course'

// 职业发展
export type {
  LayoutMode, SavedJob, TargetRole, TargetRoleMarket,
  SevenDim, JobLevel, JobPortrait, CareerPathEdge,
  MetroLine, TransferEdge, GrowthAction,
} from './career'

// 图表数据
export type { ChartDataPoint, LineChartData, PieChartData, RadarChartData } from './chart'

// 知识图谱 & Agent
export type {
  KnowledgeLayer, KnowledgeDifficulty, KnowledgeKind, EdgeRelation,
  KnowledgeNode, KnowledgeEdge, KnowledgeNodeDetail,
  AgentRole, AgentStepStatus, AgentStep,
} from './knowledge'

// 报告
export type { ReportRecord } from './report'

// AI
export type {
  AIMessage, AIAnalysisResult, AIToolCall, AIMessageAttachment,
  ArtifactRef, MessagePart, PublicTurn, TurnEvent,
  InteractionMode, AgentUpgradeHint, ArtifactKind, ArtifactAction,
} from './ai'
