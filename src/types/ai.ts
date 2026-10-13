// AI 分析结果
export interface AIAnalysisResult {
  generatedAt: string
  summary: string                                  // 总体评价与鼓励
  growthScore: number                              // 0~100
  scoreTooltip: string                             // 综合竞争力计算说明
  topAbilities: string[]
  topAbilityDetails: { name: string; detail: string }[]  // 每个突出能力的数据依据
  improvementAreas: string[]
  improvementDetails: { name: string; detail: string }[] // 每个待提升方向的数据依据
  careerSuggestions: string[]
  timeline: { date: string; label: string }[]
  nextSteps: string[]
}

/** Agent 工具调用卡片（对话内展示） */
export interface AIToolCall {
  name: string
  status?: 'running' | 'done' | 'error' | 'needs_input' | 'partial' | 'unknown'
  summary?: string
  args?: Record<string, string>
  resultPreview?: string
  parameters?: Record<string, unknown>
  taskId?: string
  taskStatus?: string
}

/** 用户消息附带的文件芯片（仅展示名） */
export interface AIMessageAttachment {
  name: string
}

export type InteractionMode = 'ask' | 'agent' | 'experts'

export interface AgentUpgradeHint {
  to: InteractionMode | string
  reason?: string
}

// ── 成果物引用 ──────────────────────────────────────────

export type ArtifactKind =
  | 'portrait'
  | 'match'
  | 'career_report'
  | 'action_plan'
  | 'file'
  | 'pipeline_task'

export interface ArtifactAction {
  id: 'view_portrait' | 'open_match' | 'open_report' | 'continue_plan' | 'open_file' | 'open_pipeline_task' | string
  label: string
}

/** 画像预览 */
export interface PortraitPreview {
  type: 'portrait_preview'
  scores?: { d1?: number; d2?: number; d3?: number; d4?: number }
  strengths?: string[]
  weaknesses?: string[]
}

/** 匹配预览 */
export interface MatchPreview {
  type: 'match_preview'
  total_score?: number
  coverage?: number
  gaps?: string[]
  hard_pass?: boolean
  primary_role?: string
  candidates?: Array<{ role: string; score: number; coverage: number }>
}

/** 报告预览 */
export interface ReportPreview {
  type: 'report_preview'
  chapters?: string[]
  word_count?: number
}

/** 计划预览 */
export interface PlanPreview {
  type: 'plan_preview'
  steps?: number
  completed?: number
  duration?: string
}

export type ArtifactPreview = PortraitPreview | MatchPreview | ReportPreview | PlanPreview | Record<string, unknown>

export interface ArtifactRef {
  artifact_id: string
  kind: ArtifactKind | string
  status: 'pending' | 'running' | 'completed' | 'failed' | string
  title: string
  summary?: string
  preview?: ArtifactPreview
  actions?: ArtifactAction[]
  version?: number
  created_at?: string
}

// ── 引用来源 ──────────────────────────────────────────

export interface Citation {
  source: string
  quote: string
  page?: number | null
  section?: string | null
  url?: string | null
  relevance?: number | null
}

// ── 结构化数据卡片 ──────────────────────────────────────

export type DataCardType = 'kv' | 'score' | 'bar' | 'list' | 'comparison'

export interface DataCardItem {
  label: string
  value: string | number | boolean | (string | number)[] | null
}

export interface DataCard {
  title: string
  card_type: DataCardType
  items: DataCardItem[]
}

// ── MessagePart 联合类型 ──────────────────────────────

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'progress'; status?: string; title?: string; summary?: string; progress?: Record<string, unknown> }
  | { type: 'tool_call'; status?: string; title?: string; tool_call: AIToolCall | Record<string, unknown> }
  | { type: 'attachment'; title?: string; attachment?: Record<string, unknown> }
  | { type: 'artifact_ref'; artifact: ArtifactRef }
  | { type: 'citation'; source: string; quote: string; page?: number | null; section?: string | null; url?: string | null; relevance?: number | null }
  | { type: 'data_card'; title: string; card_type: DataCardType; items: DataCardItem[] }
  | { type: 'upgrade_hint'; to: InteractionMode | string; reason?: string }
  | { type: 'notice'; level?: 'info' | 'warning' | 'error' | string; text: string }

export interface TurnEvent {
  event_id: number
  turn_id: string
  type: 'turn_start' | 'progress' | 'tool_start' | 'tool_done' | 'artifact_committed' | 'reply_delta' | 'turn_done' | 'error' | string
  [key: string]: unknown
}

/** Turn-level result only; it does not certify a portrait/report DB row exists. */
export interface TurnOutcome {
  status: 'completed' | 'needs_input' | 'running' | 'partial' | 'failed'
  completion_scope: 'turn'
  reason?: string
  next_action?: 'none' | 'answer_in_session' | 'poll_run' | 'retry_new_turn'
  resume_state?: 'not_available'
  run_id?: string
}

export interface PublicTurn {
  turn_id?: string
  outcome?: TurnOutcome
  reply: string
  tool_calls?: unknown[]
  thinking_steps?: string[]
  parts?: MessagePart[]
  artifacts?: ArtifactRef[]
  events?: TurnEvent[]
  session_id?: string
  session_title?: string
  session_summary?: string
  elapsed_seconds?: number
  engine?: string
  active_subagent?: string
  interaction_mode?: InteractionMode | string
  upgrade_hint?: AgentUpgradeHint
  fork_jobs_enqueued?: string[]
  permission_denials?: Array<Record<string, unknown>>
  orchestration?: Record<string, unknown>
}

// AI 消息
export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  thinking?: string
  thinkingDuration?: number
  status?: 'streaming' | 'thinking' | 'done'
  toolCalls?: AIToolCall[]
  parts?: MessagePart[]
  artifacts?: ArtifactRef[]
  turnId?: string
  outcome?: TurnOutcome
  attachments?: AIMessageAttachment[]
  interactionMode?: InteractionMode | string
  upgradeHint?: AgentUpgradeHint
  sessionTitle?: string
  sessionSummary?: string
}
