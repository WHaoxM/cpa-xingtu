import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {transform} from 'esbuild'
import * as vue from 'vue'

const source=readFileSync(new URL('../src/composables/useChatAttachments.ts',import.meta.url),'utf8')
const assistantSource=readFileSync(new URL('../src/views/student/AIAssistant.vue',import.meta.url),'utf8')
const code=(await transform(source,{loader:'ts',format:'esm'})).code.replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?/g,(_m,n)=>`const {${n.replace(/\s+as\s+/g,':')}}=globalThis.__attachmentTest;`)
test('queued file becoming ready updates rendered status and busy without another user action',async()=>{
 globalThis.__attachmentTest={...vue,getApiMode:()=> 'http',uploadAgentFile:async()=>({file_id:'owned',status:'queued'}),
 getAgentFileEvents:async()=>({cursor:1,snapshot:{status:'ready'}}),getAgentFile:async()=>({status:'ready',excerpt:'body'})}
 const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
 const scope=vue.effectScope();let ui,visible=''
 scope.run(()=>{ui=mod.useChatAttachments();vue.watchEffect(()=>{visible=ui.attachments.value.map(a=>a.status).join(',')+':'+ui.busy.value})})
 await ui.addFiles([{name:'resume.docx',size:36,type:'application/octet-stream'}])
 for(let i=0;i<8;i++){await Promise.resolve();await vue.nextTick()}
 assert.equal(visible,'ready:false');scope.stop()
})

test('a fresh composer restores only explicit pending references from server and follows real ingest',async()=>{
 const reads=[]
 globalThis.__attachmentTest={...vue,getApiMode:()=> 'http',getAgentFile:async id=>{
  reads.push(id);return {file_id:id,filename:'新提交简历.docx',status:'ready',size_bytes:80}},
  getAgentFileEvents:async()=>{throw Error('ready files must not spin')}}
 const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#restore`)
 const scope=vue.effectScope();let ui
 scope.run(()=>ui=mod.useChatAttachments())
 await ui.restoreFiles([{file_id:'selected'}])
 assert.deepEqual(ui.readyFileIds(),['selected']);assert.equal(ui.busy.value,false)
 assert.equal(ui.attachments.value[0].name,'新提交简历.docx')
 await ui.restoreFiles([])
 assert.deepEqual(ui.readyFileIds(),[]);assert.deepEqual(reads,['selected']);scope.stop()
})

test('late upload after account clear cannot repopulate attachments or hand off to new account',async()=>{
 let resolve,receipts=0
 const upload=new Promise(r=>resolve=r)
 globalThis.__attachmentTest={...vue,getApiMode:()=> 'http',uploadAgentFile:()=>upload}
 const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#late`)
 const scope=vue.effectScope();let ui
 scope.run(()=>ui=mod.useChatAttachments())
 const pending=ui.addFiles([{name:'resume.docx',size:36,type:'application/octet-stream'}],{onUploaded:()=>receipts++})
 ui.clearAttachments();resolve({file_id:'old_owner',status:'ready'});await pending
 assert.deepEqual(ui.attachments.value,[]);assert.equal(receipts,0);scope.stop()
})

test('restored queued selection follows actual completion; failed parse stays error, never ready',async()=>{
 let reads=0
 globalThis.__attachmentTest={...vue,getApiMode:()=> 'http',
  getAgentFile:async id=>({file_id:id,filename:id+'.docx',status:id==='bad'?'failed':++reads===1?'queued':'ready',error:'解析失败'}),
  getAgentFileEvents:async()=>({cursor:3,snapshot:{status:'ready'}})}
 const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#queued-restore`)
 const scope=vue.effectScope();let ui
 scope.run(()=>ui=mod.useChatAttachments())
 await ui.restoreFiles([{file_id:'good'},{file_id:'bad'}])
 for(let i=0;i<8;i++){await Promise.resolve();await vue.nextTick()}
 assert.deepEqual(ui.readyFileIds(),['good'])
 assert.equal(ui.attachments.value.find(r=>r.fileId==='bad').status,'error')
 assert.equal(ui.busy.value,false);scope.stop()
})

test('explicit reload retries a failed metadata read without duplicate chips or a new upload',async()=>{
 let reads=0
 globalThis.__attachmentTest={...vue,getApiMode:()=> 'http',getAgentFile:async id=>{
  if(++reads===1)throw Error('网络暂不可用')
  return {file_id:id,filename:'resume.docx',status:'ready'}
 },uploadAgentFile:()=>{throw Error('must not reupload')}}
 const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#retry`)
 const scope=vue.effectScope();let ui
 scope.run(()=>ui=mod.useChatAttachments())
 await ui.restoreFiles([{file_id:'owned'}]);assert.equal(ui.attachments.value[0].status,'error')
 await ui.restoreFiles([{file_id:'owned'}]);assert.equal(ui.attachments.value.length,1)
 assert.deepEqual(ui.readyFileIds(),['owned']);scope.stop()
})

test('taking a sent selection and restoring a failed send keeps newer drafts and does not duplicate chips',async()=>{
 globalThis.__attachmentTest={...vue,getApiMode:()=> 'http',getAgentFile:async()=>{throw Error('unexpected read')}}
 const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#take-restore`)
 const scope=vue.effectScope();let ui
 scope.run(()=>ui=mod.useChatAttachments())
 const sent=vue.reactive({id:'sent-row',name:'sent.pdf',size:10,mime:'application/pdf',status:'ready',excerpt:'',fileId:'sent-file'})
 const newer=vue.reactive({id:'new-row',name:'new.pdf',size:12,mime:'application/pdf',status:'ready',excerpt:'',fileId:'new-file'})
 ui.attachments.value=[sent,newer]
 const taken=ui.takeAttachmentsByFileIds(['sent-file'])
 assert.deepEqual(taken,[sent]);assert.deepEqual(ui.readyFileIds(),['new-file'])
 ui.restoreTakenAttachments(taken)
 ui.restoreTakenAttachments(taken)
 assert.deepEqual(ui.attachments.value,[newer,sent])
 assert.deepEqual(ui.readyFileIds(),['new-file','sent-file'])
 scope.stop()
})

test('a concurrent upload survives taking the sent file; the send epoch is not invalidated',async()=>{
 let resolveUpload
 const upload=new Promise(resolve=>{resolveUpload=resolve})
 globalThis.__attachmentTest={...vue,getApiMode:()=> 'http',uploadAgentFile:()=>upload}
 const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#take-inflight`)
 const scope=vue.effectScope();let ui
 scope.run(()=>ui=mod.useChatAttachments())
 ui.attachments.value.push(vue.reactive({id:'sent-row',name:'sent.pdf',size:10,mime:'application/pdf',status:'ready',excerpt:'',fileId:'sent-file'}))
 const pending=ui.addFiles([{name:'new.pdf',size:12,type:'application/pdf'}])
 const taken=ui.takeAttachmentsByFileIds(['sent-file'])
 resolveUpload({file_id:'new-file',status:'ready',filename:'new.pdf'})
 await pending
 assert.deepEqual(ui.readyFileIds(),['new-file'])
 ui.restoreTakenAttachments(taken)
 assert.deepEqual(ui.readyFileIds(),['new-file','sent-file'])
 scope.stop()
})

test('Ask send keeps the sent bubble attachment and restores only its draft on same-session failure',()=>{
 const send=assistantSource.slice(assistantSource.indexOf('async function sendMessage('),assistantSource.indexOf('function startActionPlan('))
 const messageIndex=send.indexOf('agentChat.addMessage({\n    role: \'user\'')
 const takeIndex=send.indexOf('takeAttachmentsByFileIds(fileIds)')
 assert.ok(messageIndex>=0&&takeIndex>messageIndex)
 assert.match(send,/attachments: readyAtts\.length \? readyAtts\.map\(a => \(\{ name: a\.name \}\)\) : undefined/)
 assert.match(send,/submittedSessionId && agentChat\.activeSessionId === submittedSessionId\)\s*\{\s*restoreTakenAttachments\(submittedAttachments\)/)
 assert.match(send,/if \(userMsg && !inputMessage\.value\.trim\(\)\) inputMessage\.value = userMsg/)
 assert.doesNotMatch(send,/clearAttachments\(\)/)
})
