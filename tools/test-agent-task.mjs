import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {transform} from 'esbuild'
import * as vue from 'vue'
import * as pinia from 'pinia'
let code=(await transform(readFileSync(new URL('../src/stores/agentTask.ts',import.meta.url),'utf8'),{loader:'ts',format:'esm'})).code
code=code.replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?/g,(_m,n)=>`const {${n.replace(/\s+as\s+/g,':')}}=globalThis.__taskTest;`)
const settle=async()=>{for(let i=0;i<12;i++){await Promise.resolve();await vue.nextTick()}}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
const runSnapshot=(runId,status='completed',extra={})=>({run_id:runId,status,current_contract_revision:0,current_plan_version:0,
 task_contract:null,current_plan:null,saved_artifacts:[],final_result:null,...extra})
async function setup(overrides={}){
 pinia.setActivePinia(pinia.createPinia())
 const user=vue.reactive({currentUser:{id:'owner'}}),messages=vue.reactive([])
  const storedValues=overrides.storedValues||new Map()
 globalThis.window={sessionStorage:{getItem:key=>storedValues.get(key)||null,setItem:(key,value)=>storedValues.set(key,value)}}
 const chat=vue.reactive({activeSessionId:'session_a',messages,bootstrap:async()=>{},ensureActiveSession:async()=>chat.activeSessionId,
  switchSession:async id=>{chat.activeSessionId=id},addMessage:m=>messages.push(m)})
  let submits=0,bindings=0,followupCalls=[]
 globalThis.__taskTest={...vue,...pinia,currentPlanCanBeSaved:()=>false,taskCompanionEnabled:true,useUserStore:()=>user,useAgentChatStore:()=>chat,
  useChatAttachments:()=>({attachments:vue.ref([]),busy:vue.ref(false),restoreFiles:async()=>{},clearAttachments(){},readyFileIds:()=>[]}),
  readTaskContext:async()=>({data:{task:{revision:0,turns:[]}}}),
  bindTaskResources:async()=>{bindings++;return {data:{revision:1,turns:[]}}},
  submitTaskRun:async()=>{submits++;return {data:{run:runSnapshot('run_a','queued')}}},
   submitAgentRunFollowup:async(...args)=>{followupCalls.push(args);throw Error('unexpected follow-up call')},
  readTaskEvents:async()=>({data:{events:[],cursor:2}}),readTaskRun:async run=>({data:{run:runSnapshot(run,'completed')}}),
  readAgentRunPlan:async()=>({data:null}),controlAgentRun:async()=>({data:{run:runSnapshot('run_a','completed')}}),
  resumeAgentRun:async()=>({data:{run:runSnapshot('run_a','running')}}),saveAgentRunArtifact:async()=>({data:{}}),...overrides}
 const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`)
  return {task:mod.useAgentTaskStore(),user,chat,calls:()=>({submits,bindings}),followups:()=>followupCalls}
}
const currentTaskContext=(runId='run_active')=>({revision:3,active_run_id:runId,last_run_id:runId,turns:[
 {run_id:runId,message:'制定一个学习任务',status:'completed',created_at:'2026-10-23T10:00:00Z'}
]})
const followupResult=(run,result,operation_status='completed')=>({data:{operation_status,classification:null,result,
 run:{run,persistence_status:'stored',dispatch_status:'queued'}}})
test('one in-flight submission despite double click, close does not cancel',async()=>{
 const d=deferred();let calls=0
 const t=await setup({submitTaskRun:async()=>{calls++;return d.promise}})
 t.task.opened=true;t.task.draft='一起看简历'
 const first=t.task.send();await settle();await t.task.send();assert.equal(calls,1)
 t.task.opened=false;assert.equal(t.task.busy,true)
 d.resolve({data:{run:{run_id:'run_a'}}});await first;assert.equal(t.task.busy,false)
})
test('late admission cannot publish another account state',async()=>{
 const d=deferred(),t=await setup({submitTaskRun:()=>d.promise})
 const request=t.task.send('原账号的问题');await settle()
 t.user.currentUser={id:'other'};await settle()
 d.resolve({data:{run:{run_id:'run_old'}}});await request
 assert.equal(t.task.context,null);assert.equal(t.task.sessionId,'');assert.equal(t.task.busy,false)
})
test('handoff only binds references; opening and binding never start a model',async()=>{
 const t=await setup();await t.task.open();await t.task.handoff([{file_id:'owned'}])
 assert.deepEqual(t.calls(),{submits:0,bindings:1});assert.equal(t.task.transfer,'')
})

test('selected ready files bind before run admission and keep the returned context revision',async()=>{
 const order=[]
 const t=await setup({
  bindTaskResources:async(sid,refs,revision)=>{order.push(['bind',sid,refs,revision]);return {data:{revision:7,turns:[]}}},
  submitTaskRun:async(sid,message,revision,files)=>{order.push(['run',sid,revision,files]);return {data:{run:{run_id:'run_bound'}}}},
 })
 await t.task.send('只读刚上传的材料',['file_selected'])
 assert.deepEqual(order,[['bind','session_a',[{file_id:'file_selected'}],0],['run','session_a',7,['file_selected']]])
})
test('switching tasks clears old context but restoring same task preserves draft',async()=>{
 const t=await setup();await t.task.open();t.task.draft='未发送的补充'
 await t.task.restore();assert.equal(t.task.draft,'未发送的补充')
 t.chat.activeSessionId='session_b';await settle();assert.equal(t.task.sessionId,'session_b');assert.equal(t.task.draft,'')
})

test('refresh restores pending server selection; send consumes that selection without rebinding old focus',async()=>{
 let stored={revision:3,composer_files:[{file_id:'new_file',name:'新简历.docx',version:'new',status:'ready'}],turns:[]}
 const attachments=vue.ref([]),submissions=[]
 const t=await setup({
  useChatAttachments:()=>({attachments,busy:vue.ref(false),clearAttachments:()=>attachments.value=[],
   restoreFiles:async refs=>{attachments.value=refs.map(r=>({id:r.file_id,fileId:r.file_id,status:'ready',name:r.name}))},
   readyFileIds:()=>attachments.value.map(r=>r.fileId)}),
  readTaskContext:async()=>({data:{task:structuredClone(stored)}}),
  bindTaskResources:async()=>{throw Error('must not replace persisted new selection')},
  submitTaskRun:async(sid,msg,revision)=>{submissions.push({sid,revision,ids:stored.composer_files.map(r=>r.file_id)});
   stored={...stored,revision:4,composer_files:[]};return {data:{run:{run_id:'new_resume_run'}}}},
 })
 await t.task.restore();assert.equal(t.task.attachments[0].name,'新简历.docx')
 await t.task.send('只看刚才的简历',t.task.readyFileIds())
 assert.deepEqual(submissions,[{sid:'session_a',revision:3,ids:['new_file']}])
 await t.task.restore();assert.deepEqual(t.task.attachments,[])
})

test('failed local upload is not erased by ensure and silently replaced with the old resume',async()=>{
 let reads=0
 const t=await setup({
  useChatAttachments:()=>({attachments:vue.ref([{id:'failed',status:'error'}]),busy:vue.ref(false),
   clearAttachments(){},restoreFiles:async()=>{throw Error('must not clear failed selection')},readyFileIds:()=>[]}),
  readTaskContext:async()=>{reads++;return {data:{task:{revision:0}}}},
 })
 await t.task.send('请分析这份简历')
 assert.equal(reads,0);assert.equal(t.calls().submits,0);assert.match(t.task.error,/不会改读旧简历/)
 assert.equal(t.task.attachments.length,1)
})

test('removing a restored selection waits for owner-scoped persistence; conflict retains the chip',async()=>{
 const attachments=vue.ref([{id:'chip',fileId:'selected',status:'ready'}]);let rejected=true
 const t=await setup({
  useChatAttachments:()=>({attachments,busy:vue.ref(false),clearAttachments:()=>attachments.value=[],restoreFiles:async()=>{},
   removeAttachment:id=>attachments.value=attachments.value.filter(r=>r.id!==id),readyFileIds:()=>[]}),
  readTaskContext:async()=>({data:{task:{revision:2,composer_files:[{file_id:'selected'}]}}}),
  bindTaskResources:async(_sid,refs,revision,_key,purpose)=>{
   assert.equal(purpose,'composer');assert.deepEqual(refs,[]);assert.equal(revision,2)
   if(rejected)throw Error('版本冲突')
   return {data:{revision:3,composer_files:[]}}
  },
 })
 await t.task.restore();await t.task.removeAttachment('chip')
 assert.equal(t.task.attachments.length,1);assert.match(t.task.error,/冲突/)
 rejected=false;await t.task.removeAttachment('chip')
 assert.deepEqual(t.task.attachments,[]);assert.equal(t.task.context.revision,3)
 assert.equal(t.calls().submits,0)
})

test('upload receipt updates task revision before ready; a new controller recovers that exact selection',async()=>{
 let stored={revision:0,composer_files:[],turns:[]},uploads=0
 const media=()=>{
  const attachments=vue.ref([])
  return {attachments,busy:vue.ref(false),clearAttachments:()=>attachments.value=[],readyFileIds:()=>[],
   restoreFiles:async refs=>attachments.value=refs.map(r=>({id:r.file_id,fileId:r.file_id,name:r.name,status:'ready'})),
   addFiles:async(_files,opts)=>{
    uploads++;assert.equal(opts.sessionId,'session_a');assert.equal(opts.taskContextVersion(),0)
    stored={revision:1,composer_files:[{file_id:'new_uploaded',name:'新材料.docx',status:'ready',version:'hash'}],turns:[]}
    await opts.onUploaded({file_id:'new_uploaded',task_context:structuredClone(stored)})
   },
  }
 }
 const services={useChatAttachments:media,readTaskContext:async()=>({data:{task:structuredClone(stored)}})}
 const first=await setup(services)
 await first.task.addFiles([{name:'新材料.docx'}]);assert.equal(first.task.context.revision,1)
 const refreshed=await setup(services);await refreshed.task.restore()
 assert.equal(refreshed.task.attachments[0].fileId,'new_uploaded')
 assert.equal(uploads,1);assert.equal(refreshed.calls().submits,0)
})

test('incremental run polling uses the authoritative cursor, not a guessed field',async()=>{
 const cursors=[];let reads=0
 const t=await setup({
  readTaskEvents:async(_run,cursor)=>{cursors.push(cursor);return {data:{events:[],cursor:3}}},
  readTaskRun:async run=>({data:{run:runSnapshot(run,++reads===1?'running':'completed')}})
 })
 await t.task.send('看看当前进展')
 assert.deepEqual(cursors,[0,3])
})

test('uncertain contract control reuses its stable key and stores no patch text',async()=>{
 const calls=[];let attempts=0
 const taskContract={revision:4,goal:'当前目标',deliverables:[],constraints:[],acceptance_criteria:[]}
 const t=await setup({
  readTaskContext:async()=>({data:{task:{revision:1,active_run_id:'run_control',active_run_status:'completed',turns:[]}}}),
  readTaskRun:async run=>({data:{run:runSnapshot(run,'completed',{current_contract_revision:4,task_contract:taskContract})}}),
  controlAgentRun:async(run,request,key)=>{
   calls.push({run,request,key})
   if(++attempts===1)throw Error('response interrupted')
   return {data:{run:runSnapshot(run,'completed',{current_contract_revision:5,task_contract:{...taskContract,revision:5,constraints:['new private constraint']}})}}
  },
 })
 await t.task.restore()
 assert.equal(t.task.runControlSnapshot?.run_id,'run_control','restore should load the owner-bound run snapshot before controls')
 const request={intent:'supplement',task_id:'run_control',expected_revision:4,patch:{add_constraints:['new private constraint']}}
 await t.task.controlAgentRun(request)
 assert.equal(t.task.runControlSnapshot?.current_contract_revision,4,'uncertain control must preserve the last confirmed run snapshot')
 await t.task.controlAgentRun(request)
 assert.equal(calls.length,2)
 assert.equal(calls[0].key,calls[1].key)
 assert.equal(t.task.runControlSnapshot.current_contract_revision,5)
 assert.doesNotMatch(window.sessionStorage.getItem('cpa.agentRunControl.pending.v1')||'',/new private constraint/)
})

test('late control response from a previous session cannot replace the restored run',async()=>{
 const control=deferred()
 const t=await setup({
  readTaskContext:async sid=>({data:{task:{revision:1,active_run_id:sid==='session_a'?'run_a':'run_b',active_run_status:'completed',turns:[]}}}),
  readTaskRun:async run=>({data:{run:runSnapshot(run,'completed',{current_contract_revision:2})}}),
  controlAgentRun:async()=>control.promise,
 })
 await t.task.restore()
 const request=t.task.controlAgentRun({intent:'progress_query',task_id:'run_a',expected_revision:2})
 await settle()
 t.chat.activeSessionId='session_b';await settle()
 assert.equal(t.task.runControlSnapshot.run_id,'run_b')
 control.resolve({data:{run:runSnapshot('run_a','completed',{current_contract_revision:3})}})
 await request;await settle()
 assert.equal(t.task.runControlSnapshot.run_id,'run_b')
})

test('each restored turn keeps its own evidence rather than the latest turn sources',async()=>{
 const t=await setup({readTaskContext:async()=>({data:{task:{revision:2,turns:[
  {run_id:'old',message:'看第一份',reply:'第一份答复',evidence_summary:[{name:'旧简历',status:'partial'}]},
  {run_id:'new',message:'看第二份',reply:'第二份答复',evidence_summary:[{name:'新简历',status:'read'}]}
 ]}}})})
 await t.task.restore()
 const reply=t.chat.messages.find(m=>m.id==='task-reply-old')
 assert.equal(reply.parts[1].sources[0].label,'旧简历')
 assert.equal(reply.parts[1].status,'partial')
})

test('restored submitted resume keeps its unverified provenance outside the reply',async()=>{
 const t=await setup({readTaskContext:async()=>({data:{task:{revision:2,turns:[
  {run_id:'resume',message:'看简历',reply:'仅依据本人提交材料',evidence_summary:[
   {name:'我的简历',status:'read',provenance:'student_submitted_unverified'}]}
 ]}}})})
 await t.task.restore()
 const reply=t.chat.messages.find(m=>m.id==='task-reply-resume')
 assert.equal(reply.parts[0].text,'仅依据本人提交材料')
 assert.equal(reply.parts[1].scope_note,'student_submitted_unverified')
})

test('reconciliation is a visible stop, not an automatic polling loop',async()=>{
 let polls=0
 const t=await setup({
  readTaskContext:async()=>({data:{task:{revision:2,active_run_id:'run_uncertain',active_run_status:'needs_reconciliation',turns:[]}}}),
  readTaskRun:async run=>({data:{run:runSnapshot(run,'needs_reconciliation')}}),
  readTaskEvents:async()=>{polls++;throw Error('must not poll')}
 })
 await t.task.restore();await settle()
 assert.equal(polls,0);assert.equal(t.task.busy,false)
 assert.match(t.task.error,/核对/)
})

test('failed question can be recovered without a model call and without overwriting current input',async()=>{
 const t=await setup({readTaskContext:async()=>({data:{task:{revision:4,active_run_status:'failed',turns:[
  {run_id:'failed',message:'我原来的复盘问题',reply:'本轮调用额度不足，原材料保留',status:'failed'}
 ]}}}),readTaskRun:async run=>({data:{run:runSnapshot(run,'failed',{final_result:{reply:'本轮调用额度不足，原材料保留'}})}})})
 await t.task.restore()
 assert.match(t.task.error,/额度不足/)
 t.task.recoverQuestion();assert.equal(t.task.draft,'我原来的复盘问题')
 assert.equal(t.calls().submits,0)
 t.task.draft='我正在写的新问题';t.task.recoverQuestion()
 assert.equal(t.task.draft,'我正在写的新问题')
 t.user.currentUser={id:'other'};await settle()
 assert.equal(t.task.failedQuestion,'');assert.equal(t.task.draft,'')
})

test('ordinary Agent follow-up uses the current run and exact revision instead of creating a run',async()=>{
 const calls=[]
 const taskRun=runSnapshot('run_active','completed',{current_contract_revision:4,
  task_contract:{revision:4,goal:'学习后端',deliverables:[],constraints:[],acceptance_criteria:[]}})
 const t=await setup({
  readTaskContext:async()=>({data:{task:currentTaskContext()}}),
  readTaskRun:async()=>({data:{run:taskRun}}),
  submitAgentRunFollowup:async(run,request,key)=>{calls.push({run,request,key});return followupResult(
   {...taskRun,current_contract_revision:5,task_contract:{...taskRun.task_contract,revision:5,constraints:['每周六小时']}},
   {action:'contract_revised',intent:'supplement'})},
 })
 await t.task.restore()
 t.task.busy=true // An active run must still accept a follow-up when its snapshot is current.
 await t.task.send('每周时间改成六小时')
 assert.equal(calls.length,1)
 assert.equal(calls[0].run,'run_active')
 assert.deepEqual(calls[0].request,{task_id:'run_active',expected_revision:4,message:'每周时间改成六小时'})
 assert.ok(calls[0].key)
 assert.equal(t.calls().submits,0)
 assert.equal(t.task.runControlSnapshot.current_contract_revision,5)
 assert.equal(t.chat.messages.filter(m=>m.role==='user'&&m.content==='每周时间改成六小时').length,1)
 assert.match(t.chat.messages.find(m=>m.role==='assistant')?.content||'',/已更新当前任务约束第 5 版/)
})

test('202 follow-up polling reuses the same body and idempotency key',async()=>{
 const originalSetTimeout=globalThis.setTimeout
 globalThis.setTimeout=(callback,...args)=>originalSetTimeout(callback,0,...args)
 const t=await setup({
  readTaskContext:async()=>({data:{task:currentTaskContext()}}),
  readTaskRun:async run=>({data:{run:runSnapshot(run,'completed',{current_contract_revision:3})}}),
  submitAgentRunFollowup:async(run,request,key)=>{
   t.followups().push([run,request,key])
   return t.followups().length===1
    ?followupResult(runSnapshot(run,'running',{current_contract_revision:3}),null,'waiting_safe_point')
    :followupResult(runSnapshot(run,'completed',{current_contract_revision:3}),{action:'progress_query',intent:'progress_query'})
  },
 })
 try{await t.task.restore();await t.task.send('现在进展到哪了？')}
 finally{globalThis.setTimeout=originalSetTimeout}
 const calls=t.followups()
 assert.equal(calls.length,2)
 assert.deepEqual(calls[0][1],calls[1][1])
 assert.equal(calls[0][2],calls[1][2])
 assert.equal(t.calls().submits,0)
 assert.match(t.chat.messages.find(m=>m.role==='assistant')?.content||'',/当前任务：已完成/)
})

test('uncertain follow-up blocks a changed message and retries the original key',async()=>{
 const calls=[];let attempt=0
 const t=await setup({
  readTaskContext:async()=>({data:{task:currentTaskContext()}}),
  readTaskRun:async run=>({data:{run:runSnapshot(run,'completed',{current_contract_revision:3})}}),
  submitAgentRunFollowup:async(run,request,key)=>{
   calls.push({run,request,key})
   if(++attempt===1)throw Error('response interrupted')
   return followupResult(runSnapshot(run,'completed',{current_contract_revision:3}),
    {action:'ask_clarification',question:'你要查询当前进度还是另开新任务？'})
  },
 })
 await t.task.restore();await t.task.send('我想继续')
 const original=t.task.retryableFollowup
 assert.ok(original)
 await t.task.send('换个目标，重新开始')
 assert.equal(calls.length,1)
 await t.task.retryAgentRunFollowup(original.key)
 assert.equal(calls.length,2)
 assert.deepEqual(calls[0].request,calls[1].request)
 assert.equal(calls[0].key,calls[1].key)
 assert.equal(t.calls().submits,0)
 assert.match(t.chat.messages.find(m=>m.role==='assistant')?.content||'',/查询当前进度还是另开新任务/)
})

test('new run is submitted only after classifier returns create_new_task',async()=>{
 let stored=currentTaskContext();const created=[]
 const t=await setup({
  readTaskContext:async()=>({data:{task:structuredClone(stored)}}),
  readTaskRun:async run=>({data:{run:runSnapshot(run,'completed',{current_contract_revision:3})}}),
  submitAgentRunFollowup:async(run,request)=>followupResult(
   runSnapshot(run,'completed',{current_contract_revision:3}),{action:'create_new_task',message:request.message}),
  submitTaskRun:async(sid,message,revision,files,key)=>{
   created.push({sid,message,revision,files,key})
   const newRun=runSnapshot('run_new','completed',{current_contract_revision:0})
   stored={...currentTaskContext('run_new'),turns:[...stored.turns,{run_id:'run_new',message,status:'completed'}]}
   return {data:{run:newRun}}
  },
 })
 await t.task.restore();await t.task.send('这是一个全新的独立任务')
 assert.equal(created.length,1)
 assert.deepEqual({sid:created[0].sid,message:created[0].message,revision:created[0].revision,files:created[0].files},
  {sid:'session_a',message:'这是一个全新的独立任务',revision:3,files:[]})
 assert.equal(typeof created[0].key,'string');assert.ok(created[0].key)
 assert.equal(t.task.activeRunId,'run_new')
})

test('save classification waits for an explicit exact-version confirmation',async()=>{
 const digest='a'.repeat(64),calls=[]
 const receipt={confirmation_id:'c2',artifact_id:'a2',contract_revision:4,plan_version:2,plan_sha256:digest,saved_at:null}
 const plan={plan_version:2,goal_summary:'八周计划',plan_sha256:digest,metadata:{task_contract_revision:4},steps:[]}
 let taskRun=runSnapshot('run_save','completed',{current_contract_revision:4,current_plan_version:2,current_plan:plan,saved_artifacts:[]})
 const t=await setup({
  currentPlanCanBeSaved:run=>run.status==='completed'&&!!run.current_plan,
  readTaskContext:async()=>({data:{task:currentTaskContext('run_save')}}),
  readTaskRun:async()=>({data:{run:taskRun}}),
  submitAgentRunFollowup:async()=>followupResult(taskRun,{action:'confirm_save',contract_revision:4,plan_version:2,plan_sha256:digest}),
  saveAgentRunArtifact:async(run,revision,version,key)=>{
   calls.push({run,revision,version,key});taskRun={...taskRun,saved_artifacts:[receipt]}
   return {data:{run:{run:taskRun},confirmation:receipt,artifact:{artifact_id:'a2',resource_type:'agent_run_plan',
    resource_id:`${run}:plan:${version}`,version,status:'completed'}}}
  },
 })
 await t.task.restore();await t.task.send('请保存这份计划')
 const confirmation=t.task.pendingFollowupConfirmation
 assert.ok(confirmation)
 assert.equal(calls.length,0,'classification must not save before explicit confirmation')
 await t.task.confirmFollowupSave(confirmation.key)
 assert.deepEqual(calls.map(({run,revision,version})=>({run,revision,version})),[{run:'run_save',revision:4,version:2}])
 assert.equal(t.task.runControlSnapshot.saved_artifacts[0].plan_sha256,digest)
 assert.equal(t.task.pendingFollowupConfirmation,null)
})

test('refresh restores a pending follow-up exchange and continues only with its original key',async()=>{
 const storedValues=new Map(),calls=[]
 const shared={storedValues,readTaskContext:async()=>({data:{task:currentTaskContext('run_restore')}}),
  readTaskRun:async run=>({data:{run:runSnapshot(run,'completed',{current_contract_revision:6})}})}
 const first=await setup({...shared,submitAgentRunFollowup:async(run,request,key)=>{calls.push({run,request,key});throw Error('connection interrupted')}})
 await first.task.restore();await first.task.send('再补一条限制')
 const pending=first.task.retryableFollowup
 assert.ok(pending)
 const firstAssistantId=pending.assistantMessageId

 const refreshed=await setup({...shared,submitAgentRunFollowup:async(run,request,key)=>{
  calls.push({run,request,key})
  return followupResult(runSnapshot(run,'completed',{current_contract_revision:7}),{action:'contract_revised',intent:'supplement'})
 }})
 await refreshed.task.restore()
 assert.ok(refreshed.chat.messages.some(m=>m.id===firstAssistantId))
 await refreshed.task.retryAgentRunFollowup(pending.key)
 assert.equal(calls.length,2)
 assert.deepEqual(calls[0].request,calls[1].request)
 assert.equal(calls[0].key,calls[1].key)
 assert.match(refreshed.chat.messages.find(m=>m.id===firstAssistantId).content,/已更新当前任务约束第 7 版/)
})

test('late follow-up response from a previous session cannot replace the selected task',async()=>{
 const response=deferred()
 const t=await setup({
  readTaskContext:async sid=>({data:{task:currentTaskContext(sid==='session_a'?'run_a':'run_b')}}),
  readTaskRun:async run=>({data:{run:runSnapshot(run,'completed',{current_contract_revision:2})}}),
  submitAgentRunFollowup:async()=>response.promise,
 })
 await t.task.restore()
 const request=t.task.send('旧会话的补充')
 await settle()
 t.chat.activeSessionId='session_b';await settle()
 assert.equal(t.task.runControlSnapshot.run_id,'run_b')
 response.resolve(followupResult(runSnapshot('run_a','completed',{current_contract_revision:3}),
  {action:'ask_clarification',question:'旧任务的迟到问题'}))
 await request;await settle()
 assert.equal(t.task.runControlSnapshot.run_id,'run_b')
 assert.equal(t.chat.messages.some(m=>m.role==='assistant'&&m.content==='旧任务的迟到问题'),false)
})
