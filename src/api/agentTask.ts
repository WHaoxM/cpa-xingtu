import { httpGet, httpSend } from './adapters/httpAdapter'
export type TaskReference = {file_id:string} | {uri:string} | {task_id:string}
export type TaskResult = {
  agent:string; state:string; reply:string; exploration_id?:string;round_id?:string
  compared_roles?:string[]; question?:string|null
  evidence_summary?: {name:string;status:string;coverage?:string;provenance?:'student_submitted_unverified'}[]
  proposal?:{selected_role:string;question:string;weekly_hours:string;steps:{title:string;detail:string}[]}|null
  files?:{file_id:string;name:string}[]
  continuation?:{file_id:string;version:string;next_offset:number}[]
}
export type TaskContext = {
  revision:number; active_run_id?:string|null;active_run_status?:string;last_run_id?:string
  latest_result?:TaskResult
  refs?:({name:string;version:string;status:string}&Partial<{file_id:string;uri:string;task_id:string}>)[]
  composer_files?:{file_id:string;name:string;version:string;status:string}[]
  turns?:{run_id:string;message:string;status:string;reply?:string;created_at:string;evidence_summary?:TaskResult['evidence_summary']}[]
}
export type AgentRunTaskPlan = {
  plan_version: number
  goal_summary: string
  plan_sha256: string
  metadata: {task_contract_revision?:number;[key:string]:unknown}
  steps: {step_index:number;role:string;goal:string;status:string;error_code?:string|null;result?:Record<string,unknown>|null}[]
}
export type AgentRunControlSnapshot = {
  run_id:string
  status:string
  current_contract_revision:number
  current_plan_version:number
  pause_requested?:boolean
  cancel_requested?:boolean
  updated_at?:string|null
  task_contract?:{revision:number;goal:string;deliverables:string[];constraints:string[];acceptance_criteria:string[]}|null
  current_plan?:AgentRunTaskPlan|null
  saved_artifacts?:{confirmation_id:string;artifact_id:string;contract_revision:number;plan_version:number;plan_sha256:string;saved_at:string|null}[]
  final_result?:{reply?:string;result_ref?:string}|null
  final_result_checkpoint?:boolean
}
export type AgentRunTaskPatch = {
  goal?:string
  deliverables?:string[]
  acceptance_criteria?:string[]
  constraint_updates?:{current:string;replacement:string}[]
  add_constraints?:string[]
  remove_constraints?:string[]
}
export type AgentRunControlRequest = {
  intent:'progress_query'|'supplement'|'revise_goal'|'pause'|'cancel'
  task_id:string
  expected_revision:number
  patch?:AgentRunTaskPatch
}
export type TaskRun = AgentRunControlSnapshot & {steps?:unknown[]}
export type AgentRunEnvelope = {
  run:TaskRun
  persistence_status?:string
  dispatch_status?:string
  created_revision?:boolean
}
export type AgentRunSaveResponse = {
  run:AgentRunEnvelope
  confirmation:NonNullable<TaskRun['saved_artifacts']>[number]
  artifact:Record<string,unknown>
}
export type AgentRunFollowupIntent =
  | 'supplement'|'revise_goal'|'progress_query'|'pause'|'cancel'
  | 'new_task'|'clarify'|'save_request'
export type AgentRunFollowupRequest = {
  task_id:string
  expected_revision:number
  message:string
}
export type AgentRunFollowupClassification = {
  intent:AgentRunFollowupIntent
  confidence:number
  patch:AgentRunTaskPatch|null
  clarification_question:string
  requested_plan_version:number|null
  reason:string
}
export type AgentRunFollowupResponse = {
  operation_status:'waiting_safe_point'|'classifying'|'classified'|'completed'|'needs_reconciliation'
  classification:AgentRunFollowupClassification|null
  result:{action:string;intent?:string;question?:string;message?:string;contract_revision?:number;plan_version?:number;plan_sha256?:string;reason?:string}|null
  run:AgentRunEnvelope
}
const session=(id:string)=>`/api/agent/session/${encodeURIComponent(id)}`
const runPath=(id:string)=>`/api/agent/runs/${encodeURIComponent(id)}`
export const readTaskContext = (id:string)=>httpGet<{task:TaskContext|null}>(`${session(id)}/context`)
export const bindTaskResources = (id:string,refs:TaskReference[],expected_revision:number,key:string,purpose?:'composer')=>
 httpSend<TaskContext>('POST',`${session(id)}/handoffs`,{refs,expected_revision,...(purpose?{purpose}:{})},undefined,{'Idempotency-Key':key})
export const submitTaskRun = (id:string,message:string,version:number,files:string[],key:string)=>
 httpSend<{run:TaskRun}>('POST','/api/agent/runs',{session_id:id,message,task_context_version:version,
   attachment_ids:[],interaction_mode:'experts',expert_id:'task-coordinator',capability_id:'student-task'},undefined,{'Idempotency-Key':key})
export const readTaskRun = (run:string)=>httpGet<{run:TaskRun}>(`/api/agent/runs/${encodeURIComponent(run)}`)
export const readAgentRunPlan = (run:string,planVersion:number)=>
  httpGet<AgentRunTaskPlan>(`${runPath(run)}/plans/${encodeURIComponent(String(planVersion))}`)
export const controlAgentRun = (run:string,control:AgentRunControlRequest,key?:string)=>{
  const requiresIdempotencyKey=control.intent==='supplement'||control.intent==='revise_goal'
  if(requiresIdempotencyKey&&!key)throw new Error('Task revisions require a stable Idempotency-Key')
  return httpSend<AgentRunEnvelope>('POST',`${runPath(run)}/control`,control,undefined,
    key?{'Idempotency-Key':key}:undefined)
}
export const submitAgentRunFollowup = (run:string,followup:AgentRunFollowupRequest,key:string)=>{
  if(!key)throw new Error('Agent task follow-ups require a stable Idempotency-Key')
  if(followup.task_id!==run)throw new Error('Follow-up task_id must match the selected run')
  return httpSend<AgentRunFollowupResponse>(
    'POST',`${runPath(run)}/followup`,followup,undefined,{'Idempotency-Key':key},
  )
}
export const resumeAgentRun = (run:string,expectedRevision:number)=>
  httpSend<AgentRunEnvelope>('POST',`${runPath(run)}/resume`,{expected_revision:expectedRevision})
export const saveAgentRunArtifact = (run:string,contractRevision:number,planVersion:number,key:string)=>{
  if(!key)throw new Error('Agent artifact saves require a stable Idempotency-Key')
  return httpSend<AgentRunSaveResponse>('POST',`${runPath(run)}/save`,
    {contract_revision:contractRevision,plan_version:planVersion},undefined,{'Idempotency-Key':key})
}
export const submitTaskResume = (id:string,file_id:string,expected_revision:number)=>httpSend<{task_id:string;context:TaskContext}>('POST',`${session(id)}/resume-submissions`,{file_id,expected_revision})
export const readTaskEvents = (run:string,after_seq:number)=>httpGet<{events:{event_type:string;payload?:{label?:string;agent?:string}}[];cursor:number;has_more?:boolean}>(`/api/agent/runs/${encodeURIComponent(run)}/events`,{after_seq})
