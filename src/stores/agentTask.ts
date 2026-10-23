/** One controller outside route lifetime; UI drafts are not authoritative task state. */
import {computed,ref,watch} from 'vue'
import {defineStore} from 'pinia'
import {useUserStore} from './user'
import {useAgentChatStore} from './agentChat'
import {
 readTaskContext,bindTaskResources,submitTaskRun,readTaskRun,readTaskEvents,
 readAgentRunPlan,controlAgentRun as postAgentRunControl,resumeAgentRun as postAgentRunResume,
 saveAgentRunArtifact as postAgentRunSave,
 submitAgentRunFollowup,
 type TaskContext,type TaskReference,type AgentRunFollowupRequest,type AgentRunFollowupResponse,
} from '@/api/agentTask'
import {currentPlanCanBeSaved} from '@/components/agent/agentRunControlModel'
import type {AgentRunControlRequest,AgentRunControlSnapshot} from '@/components/agent/agentRunControlModel'
import type {MessagePart} from '@/types/ai'
import {useChatAttachments} from '@/composables/useChatAttachments'
import {taskCompanionEnabled} from '@/composables/taskCompanionFeature'

type PendingAgentRunOperation={
 ownerId:string;sessionId:string;runId:string;kind:'control'|'save';fingerprint:string;key:string
 contractRevision?:number;planVersion?:number;planSha256?:string
}
type AgentRunSaveState={contract_revision:number;plan_version:number;status:'saving'|'uncertain'}
type FollowupRecord={
 ownerId:string;sessionId:string;runId:string;key:string;request:AgentRunFollowupRequest
 userMessageId:string;assistantMessageId:string;createdAt:string
 status:'pending'|'needs_reconciliation'|'completed'|'stale'
 operationStatus?:AgentRunFollowupResponse['operation_status'];result?:AgentRunFollowupResponse['result']
 displayText:string;saveConfirmation?:{contract_revision:number;plan_version:number;plan_sha256:string}
 saveChoice?:'confirmed'|'declined'|'stale';newTaskKey?:string;newTaskRevision?:number
 newTaskStatus?:'pending'|'started'|'uncertain'|'blocked';newTaskRunId?:string
}
const pendingAgentRunStorageKey='cpa.agentRunControl.pending.v1'
const agentRunFollowupStorageKey='cpa.agentRunFollowup.v1'
const activeAgentRunStatuses=new Set(['queued','planning','planned','running','steps_completed','finalizing','pause_requested','cancel_requested'])

function readPendingAgentRunOperations():PendingAgentRunOperation[]{
 try{
  if(typeof window==='undefined')return []
  const parsed=JSON.parse(window.sessionStorage.getItem(pendingAgentRunStorageKey)||'[]')
  if(!Array.isArray(parsed))return []
  return parsed.filter((row):row is PendingAgentRunOperation=>!!row&&typeof row==='object'
   &&typeof row.ownerId==='string'&&typeof row.sessionId==='string'&&typeof row.runId==='string'
   &&(row.kind==='control'||row.kind==='save')&&typeof row.fingerprint==='string'
   &&typeof row.key==='string'&&row.key.length>0)
 }catch{return []}
}

function writePendingAgentRunOperations(rows:PendingAgentRunOperation[]):void{
 try{if(typeof window!=='undefined')window.sessionStorage.setItem(pendingAgentRunStorageKey,JSON.stringify(rows.slice(-32)))}catch{/* session storage may be disabled */}
}

function readAgentRunFollowups():FollowupRecord[]{
 try{
  if(typeof window==='undefined')return []
  const parsed=JSON.parse(window.sessionStorage.getItem(agentRunFollowupStorageKey)||'[]')
  if(!Array.isArray(parsed))return []
  return parsed.filter((row):row is FollowupRecord=>!!row&&typeof row==='object'
   &&typeof row.ownerId==='string'&&typeof row.sessionId==='string'&&typeof row.runId==='string'
   &&typeof row.key==='string'&&row.key.length>0&&typeof row.request==='object'&&row.request!==null
   &&row.request.task_id===row.runId&&Number.isInteger(row.request.expected_revision)
   &&typeof row.request.message==='string'&&typeof row.userMessageId==='string'
   &&typeof row.assistantMessageId==='string'&&typeof row.createdAt==='string'
   &&['pending','needs_reconciliation','completed','stale'].includes(row.status)
   &&typeof row.displayText==='string')
 }catch{return []}
}

function writeAgentRunFollowups(rows:FollowupRecord[]):void{
 try{if(typeof window!=='undefined')window.sessionStorage.setItem(agentRunFollowupStorageKey,JSON.stringify(rows.slice(-80)))}catch{/* session storage may be disabled */}
}

function agentRunOperationIdentity(row:Pick<PendingAgentRunOperation,'ownerId'|'sessionId'|'runId'|'kind'|'fingerprint'>):string{
 return [row.ownerId,row.sessionId,row.runId,row.kind,row.fingerprint].join('|')
}

function findOrCreateAgentRunOperation(row:Omit<PendingAgentRunOperation,'key'>):PendingAgentRunOperation{
 const rows=readPendingAgentRunOperations(),identity=agentRunOperationIdentity(row)
 const existing=rows.find(item=>agentRunOperationIdentity(item)===identity)
 if(existing)return existing
 const created={...row,key:crypto.randomUUID()}
 writePendingAgentRunOperations([...rows,created])
 return created
}

function forgetAgentRunOperation(row:PendingAgentRunOperation):void{
 writePendingAgentRunOperations(readPendingAgentRunOperations().filter(item=>agentRunOperationIdentity(item)!==agentRunOperationIdentity(row)))
}

async function agentRunFingerprint(value:unknown):Promise<string>{
 const encoded=new TextEncoder().encode(JSON.stringify(value))
 if(globalThis.crypto?.subtle){
  const digest=await globalThis.crypto.subtle.digest('SHA-256',encoded)
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
 }
 // A collision only reuses a key with a different request body; the server's
 // idempotency payload check rejects that request without applying it.
 let first=0xdeadbeef|0,second=0x41c6ce57|0
 for(const byte of encoded){first=Math.imul(first^byte,0x85ebca6b);second=Math.imul(second^byte,0xc2b2ae35)}
 return `${(first>>>0).toString(16)}${(second>>>0).toString(16)}`
}

export const useAgentTaskStore=defineStore('agentTask',()=>{
 const user=useUserStore(),chat=useAgentChatStore()
 const media=useChatAttachments()
 const opened=ref(false),draft=ref(''),busy=ref(false),error=ref(''),progress=ref(''),context=ref<TaskContext|null>(null)
 const available=ref<boolean|null>(null),sessionId=ref(''),transfer=ref('')
 const activeRunId=ref(''),runControlSnapshot=ref<AgentRunControlSnapshot|null>(null)
 const savedRunPlan=ref<AgentRunControlSnapshot['current_plan']>(null)
 const runControlBusy=ref(false),runControlError=ref(''),runSaveState=ref<AgentRunSaveState|null>(null)
  const followupRecords=ref<FollowupRecord[]>(readAgentRunFollowups())
  const followupBusy=ref(false)
  const newTaskBusyRunKey=ref('')
 const mediaMutation=ref(false)
 const result=computed(()=>context.value?.latest_result)
 const failedQuestion=computed(()=>{
  const turns=context.value?.turns||[],last=turns[turns.length-1]
  return !busy.value&&!transfer.value&&last?.status==='failed'?last.message:''
 })
 let generation=0,runReadSeq=0,savedPlanReadSeq=0,pollingKey='',pollingPromise:Promise<void>|null=null,admitting=false,pending:{key:string;message:string;version:number;files:string[]}|null=null
  const followupInFlight=new Set<string>()
 let retryHandoff:{session:string;key:string;refs:TaskReference[];revision:number}|null=null
 const owner=()=>user.currentUser?.id||''
 const current=(e:number,sid:string)=>e===generation&&!!owner()&&sid===sessionId.value
 const runCurrent=(e:number,sid:string,runId:string)=>current(e,sid)&&activeRunId.value===runId
 const isActiveRun=(run:AgentRunControlSnapshot)=>activeAgentRunStatuses.has(run.status)
  const followupIdentity=(row:Pick<FollowupRecord,'ownerId'|'sessionId'|'runId'|'key'>)=>([row.ownerId,row.sessionId,row.runId,row.key].join('|'))
  const unresolvedFollowup=computed(()=>followupRecords.value.find(row=>row.ownerId===owner()&&row.sessionId===sessionId.value
   &&row.runId===activeRunId.value&&(row.status==='pending'||row.status==='needs_reconciliation'))||null)
  const unresolvedClassifiedNewTask=computed(()=>followupRecords.value.find(row=>row.ownerId===owner()&&row.sessionId===sessionId.value
   &&row.runId===activeRunId.value&&row.result?.action==='create_new_task'
   &&(row.newTaskStatus==='pending'||row.newTaskStatus==='uncertain'))||null)
  const canSendFollowup=computed(()=>!!activeRunId.value&&runControlSnapshot.value?.run_id===activeRunId.value
   &&runControlSnapshot.value.status!=='needs_reconciliation'&&!runControlBusy.value&&!followupBusy.value
   &&newTaskBusyRunKey.value!==[owner(),sessionId.value,activeRunId.value].join('|')
   &&!unresolvedFollowup.value&&!unresolvedClassifiedNewTask.value)
  const retryableFollowup=computed(()=>unresolvedFollowup.value)
  const retryableNewTask=computed(()=>unresolvedClassifiedNewTask.value?.newTaskStatus==='uncertain'?unresolvedClassifiedNewTask.value:null)
  const pendingFollowupConfirmation=computed(()=>followupRecords.value.find(row=>row.ownerId===owner()&&row.sessionId===sessionId.value
   &&row.runId===activeRunId.value&&runControlSnapshot.value?.run_id===activeRunId.value
   &&row.result?.action==='confirm_save'&&row.saveConfirmation
   &&row.saveChoice!=='declined'&&row.saveChoice!=='stale'
   &&!(row.saveChoice==='confirmed'&&(runControlSnapshot.value?.saved_artifacts||[]).some(item=>item.contract_revision===row.saveConfirmation?.contract_revision
    &&item.plan_version===row.saveConfirmation?.plan_version&&item.plan_sha256===row.saveConfirmation?.plan_sha256)))||null)
  function persistFollowup(row:FollowupRecord){
   const identity=followupIdentity(row),rows=followupRecords.value.filter(item=>followupIdentity(item)!==identity)
   followupRecords.value=[...rows,row].slice(-80);writeAgentRunFollowups(followupRecords.value)
  }
  function findFollowup(key:string){
   return followupRecords.value.find(row=>row.ownerId===owner()&&row.sessionId===sessionId.value
    &&row.runId===activeRunId.value&&row.key===key)||null
  }
  function upsertFollowupMessage(row:FollowupRecord,role:'user'|'assistant',content:string){
   const id=role==='user'?row.userMessageId:row.assistantMessageId
   const existing=chat.messages.find(message=>message.id===id)
   if(existing){existing.content=content;existing.parts=role==='assistant'?[{type:'text',text:content}]:undefined;existing.status='done';return}
   chat.addMessage({id,role,content,timestamp:row.createdAt.replace('T',' ').substring(0,16),status:'done',
    ...(role==='assistant'?{parts:[{type:'text' as const,text:content}]}:{})})
  }
  function presentFollowup(row:FollowupRecord,text:string){
   row.displayText=text;persistFollowup(row)
   upsertFollowupMessage(row,'user',row.request.message)
   upsertFollowupMessage(row,'assistant',text)
  }
  function restoreFollowupMessages(sid:string,currentRunId:string){
   followupRecords.value=readAgentRunFollowups()
   for(const existing of [...followupRecords.value]){
    if(existing.ownerId!==owner()||existing.sessionId!==sid)continue
    const row={...existing}
    if((row.status==='pending'||row.status==='needs_reconciliation')&&currentRunId&&row.runId!==currentRunId){
     row.status='stale';row.displayText='这条跟进对应的任务已切换，未再次提交。请在当前任务里重新说明需要做的事。';persistFollowup(row)
    }
    upsertFollowupMessage(row,'user',row.request.message)
    upsertFollowupMessage(row,'assistant',row.displayText)
   }
  }
 function clearRunControlState(){
  runReadSeq++;savedPlanReadSeq++;activeRunId.value='';runControlSnapshot.value=null;savedRunPlan.value=null
  runControlBusy.value=false;runControlError.value='';runSaveState.value=null
 }
 function applyRunSnapshot(run:AgentRunControlSnapshot,e:number,sid:string){
  if(!runCurrent(e,sid,run.run_id))return false
  runReadSeq++;runControlSnapshot.value=run
  const pendingSaves=readPendingAgentRunOperations().filter(row=>row.ownerId===owner()&&row.sessionId===sid&&row.runId===run.run_id&&row.kind==='save')
  for(const operation of pendingSaves){
   const receipt=(run.saved_artifacts||[]).find(item=>item.contract_revision===operation.contractRevision&&item.plan_version===operation.planVersion&&(!operation.planSha256||item.plan_sha256===operation.planSha256))
   if(receipt)forgetAgentRunOperation(operation)
  }
  const unresolved=readPendingAgentRunOperations().find(row=>row.ownerId===owner()&&row.sessionId===sid&&row.runId===run.run_id&&row.kind==='save')
  if(unresolved){
   const receipt=(run.saved_artifacts||[]).find(item=>item.contract_revision===unresolved.contractRevision&&item.plan_version===unresolved.planVersion)
   if(receipt){runSaveState.value=null;runControlError.value=''}
   else if(runSaveState.value?.status!=='saving')runSaveState.value=null
  }else runSaveState.value=null
  return true
 }
 async function readRunSnapshot(runId:string,e:number,sid:string,showError=true){
  const requestedOwner=owner(),seq=++runReadSeq
  try{
   const response=await readTaskRun(runId)
   if(!runCurrent(e,sid,runId)||owner()!==requestedOwner||seq!==runReadSeq)return null
   const run=response.data?.run
   if(!run||run.run_id!==runId)throw Error('任务回读未返回对应的运行记录')
   runControlSnapshot.value=run
   const saves=readPendingAgentRunOperations().filter(row=>row.ownerId===requestedOwner&&row.sessionId===sid&&row.runId===runId&&row.kind==='save')
   let receiptFound=false
   for(const operation of saves){
   const receipt=(run.saved_artifacts||[]).find(item=>item.contract_revision===operation.contractRevision&&item.plan_version===operation.planVersion&&(!operation.planSha256||item.plan_sha256===operation.planSha256))
    if(receipt){forgetAgentRunOperation(operation);receiptFound=true}
   }
   const unresolved=readPendingAgentRunOperations().find(row=>row.ownerId===requestedOwner&&row.sessionId===sid&&row.runId===runId&&row.kind==='save')
   if(receiptFound){runSaveState.value=null;runControlError.value=''}
   else if(unresolved){
    if(runSaveState.value?.status==='saving')runSaveState.value={contract_revision:unresolved.contractRevision||0,plan_version:unresolved.planVersion||0,status:'uncertain'}
    else runSaveState.value=null
   }else runSaveState.value=null
   return run
  }catch(err){
   if(runCurrent(e,sid,runId)&&owner()===requestedOwner&&seq===runReadSeq&&showError)
    runControlError.value=err instanceof Error?err.message:'任务状态暂时无法读取'
   return null
  }
 }
 function updateRunActivity(run:AgentRunControlSnapshot,e:number,sid:string,startPolling=true){
  if(!runCurrent(e,sid,run.run_id))return
  if(isActiveRun(run)){
   busy.value=true
   if(!progress.value)progress.value='正在核对执行进展'
   if(startPolling)void poll(run.run_id,e,sid)
  }else{
   busy.value=false;progress.value=''
  }
 }
  function responseFromFollowupError(error:unknown):AgentRunFollowupResponse|null{
   if(!error||typeof error!=='object'||!('body' in error))return null
   const body=(error as {body?:unknown}).body
   if(!body||typeof body!=='object')return null
   const data='data' in body?(body as {data?:unknown}).data:body
   if(!data||typeof data!=='object'||!('operation_status' in data))return null
   return data as AgentRunFollowupResponse
  }
  function runFromFollowupResponse(response:AgentRunFollowupResponse):AgentRunControlSnapshot|null{
   const envelope=response.run as unknown
   if(!envelope||typeof envelope!=='object')return null
   const run='run' in envelope?(envelope as {run?:unknown}).run:envelope
   return run&&typeof run==='object'&&'run_id' in run?run as AgentRunControlSnapshot:null
  }
  function followupProgressText(status:string){
   if(status==='waiting_safe_point')return '已接收这条跟进，正在等待当前任务到达安全点。'
   if(status==='classifying')return '正在核对这条跟进与当前任务约束。'
   if(status==='classified')return '已完成识别，正在提交到当前任务。'
   return '这条跟进仍在处理，原请求已保留。'
  }
  function runProgressText(run:AgentRunControlSnapshot|null){
   if(!run)return '已请求读取进展，但目前无法核实最新状态。'
   const labels:Record<string,string>={queued:'排队中',planning:'正在整理任务',planned:'计划已生成',running:'执行中',steps_completed:'步骤已完成，正在整理结果',
    finalizing:'正在整理最终结果',pause_requested:'已记录暂停请求，等待安全点',paused:'已暂停',cancel_requested:'已记录取消请求，等待安全点',
    completed:'已完成',failed:'未完成',cancelled:'已取消',partial:'部分完成',needs_reconciliation:'需要核对执行结果',waiting_input:'等待你补充信息'}
   const result=run.final_result?.reply?.trim()
   return `当前任务：${labels[run.status]||'状态待核实'}。${result?`\n\n当前结果：${result}`:''}`
  }
  function formatFollowupResult(row:FollowupRecord,run:AgentRunControlSnapshot|null){
   const result=row.result
   if(!result)return '跟进结果暂未返回。请重新读取任务状态。'
   switch(result.action){
    case 'contract_revised':return `已更新当前任务约束第 ${run?.current_contract_revision??'新'} 版，正在按新约束继续执行。`
    case 'progress_query':return runProgressText(run)
    case 'pause_requested':return '已记录暂停请求，任务会在安全点暂停。'
    case 'cancel_requested':return '已记录取消请求，任务会在安全点停止。'
    case 'ask_clarification':return result.question?.trim()||'我还不能确定这条跟进的意思。请说明要补充当前任务、查询进度，还是另开新任务。'
    case 'confirm_save':return `当前可保存的是计划第 ${result.plan_version} 版（任务约束第 ${result.contract_revision} 版）。请确认后再保存。`
    case 'save_not_ready':return '当前计划还没有达到可保存状态；没有保存任何内容。任务完成后可以再次请求保存。'
    case 'stale_revision':return '任务约束版本已变化，这条跟进没有应用。请重新读取任务后再说明补充内容。'
    case 'classification_unavailable':return '当前预算或分类服务不可用，这条跟进没有被应用，也没有创建新任务。'
    case 'create_new_task':return '已确认这是一个独立新任务，正在创建对应运行。'
    default:return '任务返回了无法识别的跟进结果；没有执行新的任务提交。请重新读取状态。'
   }
  }
  async function submitClassifiedNewTask(row:FollowupRecord,e:number,sid:string){
   if(row.result?.action!=='create_new_task'||!runCurrent(e,sid,row.runId))return
   const busyKey=[owner(),sid,row.runId].join('|')
   if(newTaskBusyRunKey.value===busyKey)return
   const message=row.result.message
   if(typeof message!=='string'||message!==row.request.message){
    row.newTaskStatus='blocked';row.displayText='服务确认要另开任务，但返回的原始消息与本次输入不一致；没有提交新运行。';persistFollowup(row);upsertFollowupMessage(row,'assistant',row.displayText);return
   }
   if(row.newTaskStatus==='started'&&row.newTaskRunId)return
   if(!context.value){row.newTaskStatus='uncertain';row.displayText='已确认另开新任务，但当前任务上下文暂不可用；没有提交新运行。请先重新读取。';persistFollowup(row);upsertFollowupMessage(row,'assistant',row.displayText);return}
   row.newTaskKey=row.newTaskKey||crypto.randomUUID()
   row.newTaskRevision=row.newTaskRevision??context.value.revision
   row.newTaskStatus='pending';persistFollowup(row)
   newTaskBusyRunKey.value=busyKey
   busy.value=true;progress.value='已确认另开新任务，正在保存新任务请求'
   try{
    const response=await submitTaskRun(sid,message,row.newTaskRevision,[],row.newTaskKey)
    if(!current(e,sid)||activeRunId.value!==row.runId)return
    const created=response.data?.run
    if(!created?.run_id)throw Error('新任务提交回执未包含运行编号')
    row.newTaskStatus='started';row.newTaskRunId=created.run_id
    row.displayText=`已确认这是独立新任务，运行 ${created.run_id} 已创建。旧任务结果仍保留在上方任务记录中。`
    persistFollowup(row);upsertFollowupMessage(row,'assistant',row.displayText)
    pending=null;draft.value='';error.value=''
    await restore(created,false)
    if(activeRunId.value===created.run_id&&isActiveRun(created))await poll(created.run_id,e,sid)
   }catch(err){
    if(current(e,sid)&&activeRunId.value===row.runId){
     row.newTaskStatus='uncertain';row.displayText=`新任务提交结果尚未核实，已保留同一幂等请求。${err instanceof Error?err.message:'请用原请求继续核对。'}`
     persistFollowup(row);upsertFollowupMessage(row,'assistant',row.displayText)
     busy.value=isActiveRun(runControlSnapshot.value||({status:'completed'} as AgentRunControlSnapshot));progress.value=''
    }
   }finally{if(newTaskBusyRunKey.value===busyKey)newTaskBusyRunKey.value=''}
  }
  async function applyFollowupResponse(row:FollowupRecord,response:AgentRunFollowupResponse,e:number,sid:string):Promise<boolean>{
   if(!runCurrent(e,sid,row.runId))return false
   row.operationStatus=response.operation_status
   const latest=runFromFollowupResponse(response)
   if(latest&&latest.run_id===row.runId){applyRunSnapshot(latest,e,sid);updateRunActivity(latest,e,sid)}
   if(response.operation_status==='needs_reconciliation'){
    row.status='needs_reconciliation';row.displayText='这条跟进的分类结果需要核对。尚未据此启动新任务；可用原请求和原幂等键继续核对。'
    persistFollowup(row);upsertFollowupMessage(row,'assistant',row.displayText);return false
   }
   if(response.operation_status!=='completed'){
    row.status='pending';row.displayText=followupProgressText(response.operation_status)
    persistFollowup(row);upsertFollowupMessage(row,'assistant',row.displayText);return true
   }
   if(!response.result||typeof response.result.action!=='string'){
    row.status='needs_reconciliation';row.displayText='服务已结束跟进流程，但没有返回可核验的结果。没有创建新任务；请用原请求继续核对。'
    persistFollowup(row);upsertFollowupMessage(row,'assistant',row.displayText);return false
   }
   row.status='completed';row.result=response.result
   if(response.result.action==='confirm_save'){
    const revision=response.result.contract_revision,version=response.result.plan_version,digest=response.result.plan_sha256
    if(!Number.isInteger(revision)||!Number.isInteger(version)||typeof digest!=='string'||! /^[a-f0-9]{64}$/i.test(digest)){
     row.status='needs_reconciliation';row.displayText='保存请求没有返回可核验的计划版本；没有执行保存。请重新读取任务状态。'
     persistFollowup(row);upsertFollowupMessage(row,'assistant',row.displayText);return false
    }
    row.saveConfirmation={contract_revision:revision as number,plan_version:version as number,plan_sha256:digest}
   }
   const message=formatFollowupResult(row,latest)
   presentFollowup(row,message)
   if(response.result.action==='create_new_task')await submitClassifiedNewTask(row,e,sid)
   else if(response.result.action==='contract_revised'&&latest)updateRunActivity(latest,e,sid)
   return false
  }
  async function driveAgentRunFollowup(row:FollowupRecord,e:number,sid:string,allowUncertain=false){
   const identity=followupIdentity(row)
   if(followupInFlight.has(identity)||!runCurrent(e,sid,row.runId))return
   if(row.status==='needs_reconciliation'&&!allowUncertain)return
   followupInFlight.add(identity);followupBusy.value=true
   try{
    for(let attempt=0;attempt<40&&runCurrent(e,sid,row.runId);attempt++){
     try{
       const response=await submitAgentRunFollowup(row.runId,row.request,row.key)
      if(!runCurrent(e,sid,row.runId))return
       if(!response.data)throw Error('跟进响应没有返回可核验的操作状态')
       const keepPolling=await applyFollowupResponse(row,response.data,e,sid)
      if(!keepPolling)return
     }catch(err){
      if(!runCurrent(e,sid,row.runId))return
      const recoverable=responseFromFollowupError(err)
      if(recoverable){
       const keepPolling=await applyFollowupResponse(row,recoverable,e,sid)
       if(keepPolling)continue
       return
      }
      const status=err&&typeof err==='object'&&'status' in err?(err as {status?:number}).status:undefined
      row.status=status===409?'stale':'needs_reconciliation'
      row.displayText=status===409
       ?'任务版本或当前任务状态已变化，这条跟进没有应用。请重新读取任务后再说明。'
       :'跟进请求的结果暂时无法核实；没有换用新幂等键重发。可使用原请求继续核对。'
      persistFollowup(row);upsertFollowupMessage(row,'assistant',row.displayText)
      if(status===409){const latest=await readRunSnapshot(row.runId,e,sid,false);if(latest&&runCurrent(e,sid,row.runId))updateRunActivity(latest,e,sid)}
      return
     }
     await new Promise(resolve=>setTimeout(resolve,1500))
    }
    if(runCurrent(e,sid,row.runId)&&row.status==='pending'){
     row.displayText='这条跟进仍在等待处理，原请求和幂等键已保留。可稍后继续核对，不会创建第二个跟进请求。'
     persistFollowup(row);upsertFollowupMessage(row,'assistant',row.displayText)
    }
   }finally{followupInFlight.delete(identity);if(!followupInFlight.size)followupBusy.value=false}
  }
  async function startFollowup(message:string,sid:string,e:number){
   const run=runControlSnapshot.value,runId=activeRunId.value
   if(!run||run.run_id!==runId||!runCurrent(e,sid,runId)){error.value='当前任务尚未完成读取，请先重新读取任务状态';return}
   if(run.status==='needs_reconciliation'){error.value='当前任务需要先核对执行结果，暂不能接收新的跟进';return}
   const existing=followupRecords.value.find(row=>row.ownerId===owner()&&row.sessionId===sid&&row.runId===runId
    &&(row.status==='pending'||row.status==='needs_reconciliation'))
   if(existing){
    if(existing.request.message!==message){error.value='上一条跟进仍待核对，请先用原请求继续核对；未发送新内容';return}
    error.value='';await driveAgentRunFollowup(existing,e,sid,true);return
   }
   const request:AgentRunFollowupRequest={task_id:runId,expected_revision:run.current_contract_revision,message}
   const key=crypto.randomUUID(),createdAt=new Date().toISOString()
   const row:FollowupRecord={ownerId:owner(),sessionId:sid,runId,key,request,
    userMessageId:`agent-followup-user-${runId}-${key}`,assistantMessageId:`agent-followup-assistant-${runId}-${key}`,
    createdAt,status:'pending',displayText:followupProgressText('waiting_safe_point')}
   persistFollowup(row);presentFollowup(row,row.displayText);error.value='';draft.value='';busy.value=isActiveRun(run);progress.value='正在核对这条任务跟进'
   await driveAgentRunFollowup(row,e,sid)
  }
  async function retryAgentRunFollowup(key:string){
   const row=findFollowup(key),sid=sessionId.value,e=generation
   if(!row||!sid||row.runId!==activeRunId.value||!runCurrent(e,sid,row.runId)){
    runControlError.value='这条跟进已不属于当前任务，没有重新提交';return
   }
   await driveAgentRunFollowup(row,e,sid,true)
  }
  async function retryClassifiedNewTask(key:string){
   const row=findFollowup(key),sid=sessionId.value,e=generation
   if(!row||!sid||row.runId!==activeRunId.value||row.result?.action!=='create_new_task'||!runCurrent(e,sid,row.runId)){
    runControlError.value='新任务请求已不属于当前运行，没有重新提交';return
   }
   await submitClassifiedNewTask(row,e,sid)
  }
  async function confirmFollowupSave(key:string){
   const row=findFollowup(key),sid=sessionId.value,e=generation,confirmation=row?.saveConfirmation,run=runControlSnapshot.value
   if(!row||!confirmation||!sid||!run||!runCurrent(e,sid,row.runId)||run.run_id!==row.runId)return
   const priorReceipt=(run.saved_artifacts||[]).find(item=>item.contract_revision===confirmation.contract_revision
    &&item.plan_version===confirmation.plan_version&&item.plan_sha256===confirmation.plan_sha256)
   if(priorReceipt){row.saveChoice='confirmed';row.displayText=`已核验计划第 ${confirmation.plan_version} 版此前已按确认保存。`
    presentFollowup(row,row.displayText);return}
   const exact=run.current_contract_revision===confirmation.contract_revision&&run.current_plan?.plan_version===confirmation.plan_version
    &&run.current_plan.plan_sha256===confirmation.plan_sha256&&currentPlanCanBeSaved(run)
   if(!exact){row.saveChoice='stale';row.displayText='待确认的计划版本已变化；没有保存。请重新读取当前任务后再次请求保存。'
    presentFollowup(row,row.displayText);return}
   row.saveChoice='confirmed';row.displayText=`已确认保存计划第 ${confirmation.plan_version} 版，正在核对回执。`
   presentFollowup(row,row.displayText)
   await saveAgentRunPlan({contract_revision:confirmation.contract_revision,plan_version:confirmation.plan_version})
   if(!runCurrent(e,sid,row.runId))return
   const updated=runControlSnapshot.value
   const receipt=updated?.saved_artifacts?.find(item=>item.contract_revision===confirmation.contract_revision
    &&item.plan_version===confirmation.plan_version&&item.plan_sha256===confirmation.plan_sha256)
   row.displayText=receipt?`已按你的确认保存计划第 ${confirmation.plan_version} 版（任务约束第 ${confirmation.contract_revision} 版）。`
    :'保存结果尚未核实；计划卡已保留核对状态，可重新读取后继续核实。'
   persistFollowup(row);upsertFollowupMessage(row,'assistant',row.displayText)
  }
  function dismissFollowupSave(key:string){
   const row=findFollowup(key)
   if(!row?.saveConfirmation)return
   row.saveChoice='declined';row.displayText='已取消保存；当前计划没有被保存。'
   presentFollowup(row,row.displayText)
  }
  async function reconcileStoredFollowups(sid:string,runId:string,e:number){
   const records=followupRecords.value.filter(row=>row.ownerId===owner()&&row.sessionId===sid&&row.runId===runId)
   for(const row of records){
    if(!runCurrent(e,sid,runId))return
    if((row.status==='pending'||row.status==='needs_reconciliation')&&row.status==='pending'){
     void driveAgentRunFollowup(row,e,sid)
    }
    if(row.result?.action==='create_new_task'&&row.newTaskStatus==='pending')void submitClassifiedNewTask(row,e,sid)
    if(row.result?.action==='confirm_save'&&row.saveChoice==='confirmed'&&row.saveConfirmation){
     const currentPlan=runControlSnapshot.value?.current_plan
     if(runControlSnapshot.value?.current_contract_revision===row.saveConfirmation.contract_revision
      &&currentPlan?.plan_version===row.saveConfirmation.plan_version&&currentPlan.plan_sha256===row.saveConfirmation.plan_sha256
      &&currentPlanCanBeSaved(runControlSnapshot.value))void confirmFollowupSave(row.key)
    }
   }
  }
 watch(()=>user.currentUser?.id,()=>{
  generation++;opened.value=false;draft.value='';busy.value=false;error.value='';context.value=null;sessionId.value='';
  pending=null;retryHandoff=null;pollingKey='';pollingPromise=null;available.value=null;transfer.value='';progress.value='';clearRunControlState()
   followupRecords.value=readAgentRunFollowups();followupBusy.value=false;followupInFlight.clear()
  media.clearAttachments()
  mediaMutation.value=false
 },{flush:'sync'})
 watch(()=>chat.activeSessionId,id=>{
   if(!taskCompanionEnabled)return
   if(id&&id!==sessionId.value){generation++;media.clearAttachments();mediaMutation.value=false;sessionId.value=id;context.value=null;pending=null;draft.value='';busy.value=false;followupBusy.value=false;followupRecords.value=readAgentRunFollowups();error.value='';pollingKey='';pollingPromise=null;clearRunControlState();void restore()}
 })
 function parts(reply:string,evidence=result.value?.evidence_summary):MessagePart[]{
  const sources=(evidence||[]).filter(r=>r&&typeof r.name==='string')
  return [{type:'text',text:reply},...(sources.length?[{type:'evidence_summary' as const,title:'参考资料',
   status:sources.every(r=>r.status==='read')?'complete' as const:'partial' as const,
   ...(sources.some(r=>r.provenance==='student_submitted_unverified')?{scope_note:'student_submitted_unverified' as const}:{}),
   sources:sources.map(r=>({label:r.name,status:(r.status==='read'?'read':r.status==='partial'?'partial':'unavailable') as 'read'|'partial'|'unavailable'}))}]:[])]
 }
 function hydrate(){
  for(const turn of context.value?.turns||[]){
   if(!chat.messages.some(m=>m.id==='task-user-'+turn.run_id))chat.addMessage({id:'task-user-'+turn.run_id,role:'user',content:turn.message,timestamp:turn.created_at,status:'done'})
   const existing=chat.messages.find(m=>m.id==='task-reply-'+turn.run_id)
   if(turn.reply&&!existing)chat.addMessage({id:'task-reply-'+turn.run_id,role:'assistant',content:turn.reply,
    parts:parts(turn.reply,turn.evidence_summary),timestamp:turn.created_at,status:'done'})
   else if(turn.reply&&existing&&turn.status==='failed'){existing.content=turn.reply;existing.parts=parts(turn.reply,turn.evidence_summary)}
  }
 }
 async function restore(preferredRun?:AgentRunControlSnapshot|string,startPolling=true){
  const sid=sessionId.value||chat.activeSessionId
  if(!sid||!owner())return
  sessionId.value=sid;const e=generation
  try{
   const response=await readTaskContext(sid);if(!current(e,sid))return
   if(context.value&&response.data?.task&&response.data.task.revision<context.value.revision)return
   context.value=response.data?.task||null;available.value=!!context.value
   if(!context.value){error.value='当前服务尚未接通任务陪伴，请先完成对应迁移和服务更新。';return}
   if(!mediaMutation.value)await media.restoreFiles(context.value.composer_files||[])
   if(!current(e,sid))return
   hydrate()
   const turns=context.value.turns||[],last=turns[turns.length-1]
   if(last?.status==='failed'&&(!context.value.active_run_id||context.value.active_run_status==='failed'))error.value=last.reply||'这次分析未完成，请先核对进展。'
   const preferredRunId=typeof preferredRun==='string'?preferredRun:preferredRun?.run_id
   const runId=preferredRunId||context.value.active_run_id||context.value.last_run_id||last?.run_id||''
    restoreFollowupMessages(sid,runId)
   if(runId!==activeRunId.value){
    clearRunControlState();activeRunId.value=runId
   }
   if(!runId){busy.value=false;progress.value='';return}
   runControlError.value=''
   const run=typeof preferredRun==='object'&&preferredRun?preferredRun:await readRunSnapshot(runId,e,sid,true)
   if(!current(e,sid)||activeRunId.value!==runId)return
   if(run){
    if(typeof preferredRun==='object'&&preferredRun)applyRunSnapshot(run,e,sid)
    updateRunActivity(run,e,sid,startPolling)
    if(run.status==='needs_reconciliation')error.value='这次任务需要先核对执行结果，暂不重复提交。'
    else if(['failed','cancelled','partial','unavailable'].includes(run.status))error.value=run.final_result?.reply||'这次执行尚未完整完成，请先核对进展。'
    else if(run.status==='completed')error.value=''
     if(run.status!=='needs_reconciliation')void reconcileStoredFollowups(sid,runId,e)
   }
   else if(context.value.active_run_status==='needs_reconciliation'){
    busy.value=false;error.value='这次任务需要先核对执行结果，暂不重复提交。';progress.value=''
   }else if(context.value.active_run_id){
    busy.value=true;progress.value='当前任务状态暂时无法读取，请先重新核对，避免重复提交'
   }
  }catch(err){if(current(e,sid))error.value=err instanceof Error?err.message:'任务暂时无法读取'}
 }
 async function ensure(){
  await chat.bootstrap()
  const sid=await chat.ensureActiveSession()
  if(sessionId.value!==sid){generation++;sessionId.value=sid;context.value=null;busy.value=false;pollingKey='';pollingPromise=null;clearRunControlState()}
  await restore()
  if(!context.value)throw Error(error.value||'任务上下文不可用')
  return sid
 }
 async function handoff(refs:TaskReference[],preferredSession?:string){
  if(busy.value)throw Error('当前任务仍在执行，请先核对结果再交接资料。')
  if(preferredSession&&preferredSession!==chat.activeSessionId){await chat.bootstrap();await chat.switchSession(preferredSession)}
  const sid=await ensure(),e=generation
  transfer.value='正在关联资料';error.value=''
  try{
   if(!retryHandoff||retryHandoff.session!==sid||JSON.stringify(retryHandoff.refs)!==JSON.stringify(refs))
    retryHandoff={session:sid,key:crypto.randomUUID(),refs,revision:context.value!.revision}
   const attempt=retryHandoff
   const response=await bindTaskResources(sid,refs,attempt.revision,attempt.key)
   if(!current(e,sid))return
   if(!response.data)throw Error('未取得资料交接回执')
   context.value=response.data;retryHandoff=null
  }catch(err){if(current(e,sid)){error.value=err instanceof Error?err.message:'资料关联失败';throw err}}
  finally{if(current(e,sid))transfer.value=''}
 }
 async function addFiles(files:FileList|File[],_opts?:{sessionId?:string|null;studentId?:string}){
  if(busy.value||mediaMutation.value)throw Error('请先等待当前资料处理完成')
  const requestedOwner=owner(),sid=await ensure(),e=generation
  if(owner()!==requestedOwner)return
  mediaMutation.value=true;error.value=''
  try{
   await media.addFiles(files,{sessionId:sid,
    taskContextVersion:()=>{
     if(!current(e,sid))throw Error('任务已切换，未继续上传')
     return context.value!.revision
    },
    onUploaded:meta=>{
     if(!current(e,sid))return
     if(!meta.task_context)throw Error('文件已上传但未关联到任务，请重新读取核对；暂不发送')
     context.value=meta.task_context
    }})
  }finally{if(current(e,sid))mediaMutation.value=false}
 }
 async function removeAttachment(id:string){
  if(busy.value||mediaMutation.value)return
  const row=media.attachments.value.find(r=>r.id===id)
  if(!row)return
  if(!row.fileId){media.removeAttachment(id);return}
  const sid=sessionId.value,e=generation
  if(!context.value||!sid)return
  mediaMutation.value=true;error.value=''
  try{
   const refs=(context.value.composer_files||[]).filter(r=>r.file_id!==row.fileId).map(r=>({file_id:r.file_id}))
   const response=await bindTaskResources(sid,refs,context.value.revision,crypto.randomUUID(),'composer')
   if(!current(e,sid))return
   if(!response.data)throw Error('移除结果尚未确认，请重新读取任务')
   context.value=response.data;media.removeAttachment(id)
  }catch(err){if(current(e,sid))error.value=err instanceof Error?err.message:'移除附件失败，原选择保留'}
  finally{if(current(e,sid))mediaMutation.value=false}
 }
 async function send(text=draft.value,files:string[]=[]){
   const hasLoadedCurrentRun=!!activeRunId.value&&runControlSnapshot.value?.run_id===activeRunId.value
   if((busy.value&&!hasLoadedCurrentRun)||admitting||followupBusy.value||mediaMutation.value||!text.trim())return
  if(media.attachments.value.some(r=>r.status!=='ready')){
   error.value='请先核对本次附件状态；尚未就绪时不会改读旧简历。';return
  }
  admitting=true;const submittedOwner=owner()
  const content=text.trim();error.value=''
  let sid='',e=generation
  try{
   sid=await ensure();e=generation
   if(owner()!==submittedOwner)return
   if(media.attachments.value.some(r=>r.status!=='ready'))throw Error('请先核对本次附件状态；尚未就绪时不会改读旧简历。')
    const turns=context.value?.turns||[]
    const expectedCurrentRun=context.value?.active_run_id||context.value?.last_run_id||turns[turns.length-1]?.run_id||''
    if(expectedCurrentRun){
     if(!activeRunId.value||activeRunId.value!==expectedCurrentRun||!runControlSnapshot.value||runControlSnapshot.value.run_id!==expectedCurrentRun){
      error.value='当前任务状态尚未完整读取；没有启动新运行。请先重新读取任务状态。';return
     }
     if(files.length){error.value='当前任务的自然语言续接暂不接受新附件；未新建任务。请先完成当前跟进，再另开任务关联材料。';return}
     await startFollowup(content,sid,e)
     return
    }
   const selected=context.value?.composer_files||[]
   if(files.length&&!selected.length)await handoff(files.map(file_id=>({file_id})))
   else if(files.some(id=>!selected.some(r=>r.file_id===id)))throw Error('附件选择已变化，请核对恢复后的资料再发送')
   if(!current(e,sid))return
   busy.value=true;progress.value='请求正在保存'
   if(!pending)pending={key:crypto.randomUUID(),message:content,version:context.value!.revision,files}
   else if(pending.message!==content)throw Error('上一请求结果尚未核对，请先重试原消息。')
   const response=await submitTaskRun(sid,pending.message,pending.version,pending.files,pending.key)
   if(!current(e,sid))return
   if(!response.data?.run?.run_id)throw Error('请求结果未确认，请保留原消息重试')
   pending=null;draft.value='';error.value='';media.clearAttachments()
   await restore(response.data.run,false)
   if(activeRunId.value===response.data.run.run_id&&isActiveRun(response.data.run))await poll(response.data.run.run_id,e,sid)
  }catch(err){if((current(e,sid)||!sid)&&owner()===submittedOwner){error.value=err instanceof Error?err.message:'任务暂时未能执行';busy.value=false;progress.value=''}}
  finally{admitting=false}
 }
 function poll(run:string,e:number,sid:string):Promise<void>{
  const key=JSON.stringify([e,sid,run])
  if(pollingKey===key&&pollingPromise)return pollingPromise
  pollingKey=key;let cursor=0
  const loop=(async()=>{
   try{
    while(runCurrent(e,sid,run)){
     const events=await readTaskEvents(run,cursor);if(!runCurrent(e,sid,run))return
     cursor=events.data?.cursor??cursor
     for(const event of events.data?.events||[]){
      if(event.event_type==='run.resource_read_started')progress.value='正在读取'+(event.payload?.label||'所需资料')
      else if(event.event_type==='run.resource_read_completed')progress.value='已读取'+(event.payload?.label||'所需资料')
      else if(event.event_type==='run.planning')progress.value='正在理解这次任务'
      else if(event.event_type==='run.step_started')progress.value='正在结合资料分析'
      else if(event.event_type==='run.business_delegated')progress.value=({resume_preparation:'正在查看这份简历',career_exploration:'正在一起比较方向',practice_review:'正在复盘这次练习',clarify:'正在整理需要你补充的问题'} as Record<string,string>)[event.payload?.agent||'']||'正在核对这次任务'
     }
     const runSnapshot=await readRunSnapshot(run,e,sid,true)
     if(!runCurrent(e,sid,run))return
     if(!runSnapshot){await new Promise(resolve=>setTimeout(resolve,1500));continue}
     const status=runSnapshot.status
     if(!activeAgentRunStatuses.has(status)){
      busy.value=false;progress.value=''
      if(['failed','cancelled','needs_reconciliation','partial','unavailable'].includes(status))
       error.value=runSnapshot.final_result?.reply||'这次执行尚未完整完成，请先核对进展。'
      else if(status==='completed')error.value=''
      await restore(runSnapshot);return
     }
     if(events.data?.has_more)continue
     await new Promise(resolve=>setTimeout(resolve,1500))
    }
   }catch(err){if(runCurrent(e,sid,run)){
    const message=err instanceof Error?err.message:'进展同步失败，原任务仍保留，请重试读取'
    error.value=message;runControlError.value=message
    busy.value=!!runControlSnapshot.value&&isActiveRun(runControlSnapshot.value)
    progress.value=busy.value?'进展同步暂不可用，原任务仍在核对中':''
   }}
  })()
  const tracked=loop.finally(()=>{if(pollingKey===key){pollingKey='';pollingPromise=null}})
  pollingPromise=tracked
  return tracked
 }
 async function refreshAgentRun(){
  const sid=sessionId.value,runId=activeRunId.value,e=generation
  if(!sid||!runId||!current(e,sid)){runControlError.value='当前会话还没有可读取的Agent运行记录';return}
  runControlError.value=''
  const run=await readRunSnapshot(runId,e,sid,true)
   if(run&&runCurrent(e,sid,runId)){updateRunActivity(run,e,sid);if(run.status!=='needs_reconciliation')void reconcileStoredFollowups(sid,runId,e)}
 }
 async function controlAgentRun(request:AgentRunControlRequest){
  const sid=sessionId.value,runId=activeRunId.value,e=generation,initial=runControlSnapshot.value
  if(runControlBusy.value||!sid||!runId||!initial||!runCurrent(e,sid,runId))return
  if(request.task_id!==runId||request.expected_revision!==initial.current_contract_revision){
   runControlError.value='任务版本已变化，请先重新读取当前状态';return
  }
  const requiresStableKey=request.intent==='supplement'||request.intent==='revise_goal'
  runControlBusy.value=true;runControlError.value=''
  let operation:PendingAgentRunOperation|null=null
  try{
   const fingerprint=await agentRunFingerprint({
    intent:request.intent,task_id:request.task_id,expected_revision:request.expected_revision,patch:request.patch||null,
   })
   if(!runCurrent(e,sid,runId)||runControlSnapshot.value?.current_contract_revision!==request.expected_revision)return
   operation=findOrCreateAgentRunOperation({ownerId:owner(),sessionId:sid,runId,kind:'control',fingerprint})
   const response=await postAgentRunControl(runId,request,operation.key)
   if(!runCurrent(e,sid,runId))return
   const updated=response.data?.run
   if(!updated||updated.run_id!==runId)throw Error('服务没有返回这次控制操作对应的运行记录')
   forgetAgentRunOperation(operation);operation=null
   applyRunSnapshot(updated,e,sid);runControlError.value=''
   updateRunActivity(updated,e,sid)
  }catch(err){
   if(operation&&!requiresStableKey){forgetAgentRunOperation(operation);operation=null}
   if(runCurrent(e,sid,runId)){
    runControlError.value=err instanceof Error?err.message:'任务控制未确认，请重新读取状态'
    const latest=await readRunSnapshot(runId,e,sid,false)
    if(latest&&runCurrent(e,sid,runId))updateRunActivity(latest,e,sid)
   }
  }finally{if(runCurrent(e,sid,runId))runControlBusy.value=false}
 }
 async function resumeAgentRun(request:{expected_revision:number}){
  const sid=sessionId.value,runId=activeRunId.value,e=generation,initial=runControlSnapshot.value
  if(runControlBusy.value||!sid||!runId||!initial||!runCurrent(e,sid,runId))return
  if(initial.status!=='paused'||request.expected_revision!==initial.current_contract_revision){
   runControlError.value='任务版本或状态已变化，请重新读取后再恢复';return
  }
  runControlBusy.value=true;runControlError.value=''
  try{
   const response=await postAgentRunResume(runId,request.expected_revision)
   if(!runCurrent(e,sid,runId))return
   const updated=response.data?.run
   if(!updated||updated.run_id!==runId)throw Error('服务没有返回恢复后的运行状态')
   applyRunSnapshot(updated,e,sid);runControlError.value='';updateRunActivity(updated,e,sid)
  }catch(err){
   if(runCurrent(e,sid,runId)){
    runControlError.value=err instanceof Error?err.message:'恢复结果未确认，请重新读取状态'
    const latest=await readRunSnapshot(runId,e,sid,false)
    if(latest&&runCurrent(e,sid,runId))updateRunActivity(latest,e,sid)
   }
  }finally{if(runCurrent(e,sid,runId))runControlBusy.value=false}
 }
 async function saveAgentRunPlan(request:{contract_revision:number;plan_version:number}){
  const sid=sessionId.value,runId=activeRunId.value,e=generation,run=runControlSnapshot.value
  if(runControlBusy.value||!sid||!runId||!run||!runCurrent(e,sid,runId))return
  if(request.contract_revision!==run.current_contract_revision||request.plan_version!==run.current_plan?.plan_version||!currentPlanCanBeSaved(run)){
   runControlError.value='待保存的计划版本已变化，请重新读取当前任务';return
  }
  const planSha256=run.current_plan!.plan_sha256
  runControlBusy.value=true;runControlError.value=''
  let operation:PendingAgentRunOperation|undefined
  try{
   const fingerprint=await agentRunFingerprint({runId,contract_revision:request.contract_revision,plan_version:request.plan_version,plan_sha256:planSha256})
   if(!runCurrent(e,sid,runId)||runControlSnapshot.value?.current_contract_revision!==request.contract_revision||runControlSnapshot.value?.current_plan?.plan_version!==request.plan_version)return
   operation=findOrCreateAgentRunOperation({ownerId:owner(),sessionId:sid,runId,kind:'save',fingerprint,
    contractRevision:request.contract_revision,planVersion:request.plan_version,planSha256})
   runSaveState.value={contract_revision:request.contract_revision,plan_version:request.plan_version,status:'saving'}
   const response=await postAgentRunSave(runId,request.contract_revision,request.plan_version,operation.key)
   if(!runCurrent(e,sid,runId))return
   const envelope=response.data?.run,updated=envelope?.run,confirmation=response.data?.confirmation,artifact=response.data?.artifact
   const receipt=updated?.saved_artifacts?.find(item=>item.confirmation_id===confirmation?.confirmation_id
    &&item.artifact_id===confirmation?.artifact_id&&item.contract_revision===request.contract_revision
    &&item.plan_version===request.plan_version&&item.plan_sha256===planSha256)
   const artifactVerified=!!artifact&&artifact.artifact_id===confirmation?.artifact_id
    &&artifact.resource_type==='agent_run_plan'&&artifact.resource_id===`${runId}:plan:${request.plan_version}`
    &&artifact.version===request.plan_version&&artifact.status==='completed'
   if(!updated||updated.run_id!==runId||confirmation?.contract_revision!==request.contract_revision
    ||confirmation?.plan_version!==request.plan_version||confirmation?.plan_sha256!==planSha256||!receipt||!artifactVerified)
    throw Error('保存回执与指定计划版本不一致；结果未显示为已保存')
   forgetAgentRunOperation(operation);operation=undefined
   applyRunSnapshot(updated,e,sid);savedRunPlan.value=null;runSaveState.value=null;runControlError.value=''
  }catch(err){
   if(runCurrent(e,sid,runId)){
    runSaveState.value={contract_revision:request.contract_revision,plan_version:request.plan_version,status:'uncertain'}
    runControlError.value=err instanceof Error?err.message:'计划保存结果尚未核验，请重新读取后再试'
    const latest=await readRunSnapshot(runId,e,sid,false)
    if(latest&&runCurrent(e,sid,runId))updateRunActivity(latest,e,sid)
   }
  }finally{if(runCurrent(e,sid,runId))runControlBusy.value=false}
 }
 async function readSavedAgentRunPlan(request:{plan_version:number}){
  const sid=sessionId.value,runId=activeRunId.value,e=generation,run=runControlSnapshot.value
  if(!sid||!runId||!run||!runCurrent(e,sid,runId))return
  const receipt=(run.saved_artifacts||[]).find(item=>item.plan_version===request.plan_version)
  if(!receipt){runControlError.value='没有找到这份计划的保存回执，请先重新读取任务';savedRunPlan.value=null;return}
  const requestedOwner=owner(),seq=++savedPlanReadSeq
  runControlError.value='';savedRunPlan.value=null
  try{
   const response=await readAgentRunPlan(runId,request.plan_version)
   if(!runCurrent(e,sid,runId)||owner()!==requestedOwner||seq!==savedPlanReadSeq)return
   const plan=response.data
   const currentReceipt=(runControlSnapshot.value?.saved_artifacts||[]).find(item=>item.confirmation_id===receipt.confirmation_id
    &&item.contract_revision===receipt.contract_revision&&item.plan_version===receipt.plan_version&&item.plan_sha256===receipt.plan_sha256)
   if(!plan||!currentReceipt||plan.plan_version!==receipt.plan_version||plan.plan_sha256!==receipt.plan_sha256
    ||plan.metadata?.task_contract_revision!==receipt.contract_revision)
    throw Error('回读计划与已保存版本回执不一致，未显示正文')
   savedRunPlan.value=plan
  }catch(err){
   if(runCurrent(e,sid,runId)&&owner()===requestedOwner&&seq===savedPlanReadSeq)
    runControlError.value=err instanceof Error?err.message:'保存计划暂时无法读取'
  }
 }
 async function open(){
  const requestedOwner=owner()
  try{await ensure()}finally{if(owner()===requestedOwner&&requestedOwner)opened.value=true}
 }
 function recoverQuestion(){
  if(!failedQuestion.value)return
  if(draft.value.trim()&&draft.value.trim()!==failedQuestion.value){error.value='输入框中已有未发送内容，未覆盖；原问题仍在本任务记录中。';return}
  draft.value=failedQuestion.value
 }
  return {opened,draft,busy,error,progress,context,available,sessionId,transfer,result,failedQuestion,recoverQuestion,restore:()=>restore(),ensure,handoff,send,open,
   activeRunId,runControlSnapshot,savedRunPlan,runControlBusy,runControlError,runSaveState,
    refreshAgentRun,controlAgentRun,resumeAgentRun,saveAgentRunPlan,readSavedAgentRunPlan,
    followupBusy,canSendFollowup,retryableFollowup,retryableNewTask,pendingFollowupConfirmation,
    retryAgentRunFollowup,retryClassifiedNewTask,confirmFollowupSave,dismissFollowupSave,
   attachments:media.attachments,attachmentsBusy:computed(()=>media.busy.value||mediaMutation.value),addFiles,
   removeAttachment,clearAttachments:media.clearAttachments,readyFileIds:media.readyFileIds}
})
