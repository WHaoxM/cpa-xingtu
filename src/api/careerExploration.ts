import { httpGet, httpPost, httpSend } from './adapters/httpAdapter'

export type DirectionCandidate = { role_name: string; category: string; skills: string[]; matched_skills: string[]; source_status: string; source_note: string }
export type TrialSelection = { selected_role: string; question: string; reason: string; weekly_hours: string }
export type ExplorationRound = {
  round_id: string; ordinal: number; selection: TrialSelection; source_status: string; created_at: string
  closed_reason?: string | null
  plan: { plan_id: string; artifact_id: string; progress: {completed:number;total:number;status:string}; steps?: {title:string;detail:string}[] } | null
  review: { content: { observed:string;difficulties:string;uncertain:string;next_options:string }; reflection:string; status:string; attachments:{name:string;status:string}[]; boundary:string; created_at:string } | null
  decision: { choice:'continue'|'adjust'|'switch';reason:string;created_at:string } | null
}
export type Exploration = {
  exploration_id:string;revision:number;session_id:string;source_status:string;created_at:string;updated_at:string
  draft:{interest:string;compared_roles:string[];selection_draft?:TrialSelection}
  sources:{facts:{resume_status:string;skills:string[];projects:{name?:string;desc?:string}[];self_report:Record<string,unknown>;skill_exploration:Record<string,unknown>;self_reflection:unknown};candidates:DirectionCandidate[];catalogue_partial:boolean;boundary:string}
  rounds: ExplorationRound[]
  analysis_available?: boolean
  analysis_turns?: AnalysisTurn[]
}
export type ExplorationAnalysis = {
  reply:string; question:string|null
  comparisons:{role:string;connection:string;unknown:string}[]
  proposal:{selected_role:string;question:string;weekly_hours:string;steps:{title:string;detail:string}[]}|null
  review:{observed:string;difficulties:string;uncertain:string;next_options:string}|null
  evidence_summary:{name:string;status:string;coverage:string}[]
  positioning?: PersonalPositioning
}
export type PersonalPositioning = {
  content_version?:number
  reading_status?:'initial_interpretation'|'needs_clarification'|'partial';reading_note?:string
  role:string; starting_point:string
  connections:{text:string;evidence_ids:string[]}[]
  uncertainties:{kind:'needs_detail'|'not_done'|'unknown';text:string;evidence_ids:string[]}[]
  next_action:{kind:'clarify_experience'|'clarify_question'|'practice';text:string;reason:string;evidence_ids:string[]}
  evidence:{id:string;label:string;quote:string;kind:string}[]
}
export type AnalysisTurn = {turn_id:string;run_id:string;request_key?:string;round_id:string|null;message:string;status:string;stale:boolean;content_status?:'current'|'legacy';confirmed_round_id:string|null;result:ExplorationAnalysis|null;created_at:string}
export type AnalysisEvents = {events:{event_seq:number;event_type:string;payload:Record<string,unknown>}[];next_after_seq?:number;last_event_seq?:number;has_more?:boolean;dispatch_status?:string}
export type ExplorationListItem = {exploration_id:string;revision:number;draft:Exploration['draft'];created_at:string;updated_at:string;source_status?:string;analysis_available?:boolean;latest_analysis?:{status:string;stale:boolean;positioning:PersonalPositioning|null}|null}
const root = '/api/career/explorations'
const item = (id:string) => `${root}/${encodeURIComponent(id)}`
export const listExplorations = (role?:string) => httpGet<ExplorationListItem[]>(root,role?{role}:undefined)
export const readExploration = (id:string) => httpGet<Exploration>(item(id))
export const createExploration = (request_id:string, interest:string) => httpPost<Exploration>(root,{request_id,interest})
export const patchExploration = (id:string, payload:Record<string,unknown>) => httpSend<Exploration>('PATCH',item(id),payload)
export const startExplorationRound = (id:string, expected_revision:number, selection:TrialSelection) => httpPost<Exploration>(`${item(id)}/rounds`,{expected_revision,...selection})
export const generateExplorationPlan = (id:string,rid:string) => httpPost<Exploration>(`${item(id)}/rounds/${encodeURIComponent(rid)}/plan`,{})
export const reviewExploration = (id:string,rid:string,expected_revision:number,reflection:string) => httpPost<Exploration>(`${item(id)}/rounds/${encodeURIComponent(rid)}/review`,{expected_revision,reflection})
export const decideExploration = (id:string,rid:string,expected_revision:number,choice:string,reason:string) => httpSend<Exploration>('PUT',`${item(id)}/rounds/${encodeURIComponent(rid)}/decision`,{expected_revision,choice,reason})
export const connectExplorationSession = (id:string) => httpPost<Exploration>(`${item(id)}/session`,{})
export const restartUnplannedRound = (id:string,rid:string,expected_revision:number) => httpPost<Exploration>(`${item(id)}/rounds/${encodeURIComponent(rid)}/restart`,{expected_revision})
export const sendExplorationAnalysis = (id:string,payload:{message:string;expected_revision:number;round_id?:string},key:string) =>
  httpSend<Exploration>('POST',`${item(id)}/analysis-turns`,payload,undefined,{'Idempotency-Key':key})
export const readAnalysisEvents = (runId:string,after_seq:number) => httpGet<AnalysisEvents>(`/api/agent/runs/${encodeURIComponent(runId)}/events`,{after_seq,limit:100})
export const confirmExplorationProposal = (id:string,proposal_id:string,expected_revision:number,selection:TrialSelection) =>
  httpPost<Exploration>(`${item(id)}/rounds`,{proposal_id,expected_revision,...selection})
