import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {transform} from 'esbuild'
import * as vue from 'vue'
import * as pinia from 'pinia'
let code=(await transform(readFileSync(new URL('../src/stores/agentChat.ts',import.meta.url),'utf8'),{loader:'ts',format:'esm'})).code
code=code.replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?/g,(_m,n)=>`const {${n.replace(/\s+as\s+/g,':')}}=globalThis.__sessionRestore;`)
async function setup(history=[]){
 pinia.setActivePinia(pinia.createPinia())
 const user=vue.reactive({currentUser:{id:'owner'}})
 let sid=null,creates=0
 globalThis.__sessionRestore={...vue,...pinia,getApiMode:()=> 'http',useUserStore:()=>user,
  getAgentSessionId:()=>sid,setAgentSessionId:id=>{sid=id},clearAgentSessionId:()=>{sid=null},
  listSessions:async()=>[
   {session_id:'latest',title:'最新任务',status:'active',updated_at:'2026-10-23T10:00:00'},
   {session_id:'older',title:'旧任务',status:'active',updated_at:'2026-10-22T10:00:00'}],
  getSessionHistory:async()=>history,mapAgentToolCalls:()=>[],
  createSession:async()=>{creates++;throw Error('Do not create a task to hide a restore failure')},
  archiveSession:async()=>{},deleteSession:async()=>{}}
 const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`)
 return {store:mod.useAgentChatStore(),creates:()=>creates}
}
test('fresh page restores newest owner task, not the reversed insertion order',async()=>{
 const t=await setup();await t.store.bootstrap()
 assert.equal(t.store.activeSessionId,'latest')
 assert.equal(t.creates(),0)
})
test('refresh preserves an explicitly selected older task rather than silently switching',async()=>{
 const t=await setup();await t.store.bootstrap();await t.store.switchSession('older');await t.store.bootstrap()
 assert.equal(t.store.activeSessionId,'older')
 assert.equal(t.creates(),0)
})
test('Ask generated progress restores its terminal outcome after session hydration',async()=>{
 const history=[{
  id:'ask-terminal',
  role:'assistant',
  content:'Synthetic Ask answer',
  timestamp:'2026-10-24T12:00:00Z',
  parts:[{type:'progress',title:'Current stage: explain'}],
  outcome:{status:'needs_input',completion_scope:'turn',next_action:'answer_in_session'},
  interaction_mode:'ask',
 }]
 const t=await setup(history);await t.store.bootstrap()
 const restored=t.store.messages.find(message=>message.id==='ask-terminal')
 assert.ok(restored)
 assert.equal(restored.status,'done')
 assert.equal(restored.interactionMode,'ask')
 assert.deepEqual(restored.parts,history[0].parts)
 assert.deepEqual(restored.outcome,history[0].outcome)
 assert.equal(t.creates(),0)
})
