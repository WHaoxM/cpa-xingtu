import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript} from '@vue/compiler-sfc'
import {transform} from 'esbuild'
import * as vue from 'vue'

const source=readFileSync(new URL('../src/components/career/ExplorationCompanion.vue',import.meta.url),'utf8')
const {descriptor}=parse(source)
let code=(await transform(compileScript(descriptor,{id:'companion-test'}).content,{loader:'ts',format:'esm'})).code
code=code.replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?/g,(_m,n)=>`const {${n.replace(/\s+as\s+/g,':')}}=globalThis.__companionTest;`)
 .replace(/import\s+([\w$]+)\s+from\s*['"][^'"]+['"];?/g,(_m,n)=>`const ${n}={};`)
const settle=async()=>{for(let i=0;i<12;i++){await Promise.resolve();await vue.nextTick()}}
function record(){return {exploration_id:'exp_owner',revision:2,analysis_available:true,analysis_turns:[],rounds:[]}}
function turn(status='completed'){return {turn_id:'turn_one',run_id:'run_one',round_id:null,status,message:'我的犹豫',stale:false,result:{reply:'一起看看',question:null,comparisons:[],evidence_summary:[],proposal:{selected_role:'数据分析',question:'喜欢解释数据吗？',weekly_hours:'三小时',steps:[]}}}}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
async function setup(api={},initial=record()){
 const props=vue.reactive({record:initial,roundId:undefined,disabled:false}),user=vue.reactive({currentUser:{id:'owner'}}),clean=[]
 globalThis.__companionTest={...vue,onBeforeUnmount:f=>clean.push(f),useUserStore:()=>user,
  sendExplorationAnalysis:async()=>({data:record()}),readAnalysisEvents:async()=>({data:{events:[]}}),readExploration:async()=>({data:props.record}),...api}
 const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`)
 const emitted=[]
 const ui=mod.default.setup(props,{expose(){},emit:(name,value)=>{emitted.push([name,value]);if(name==='updated')props.record=value}})
 await settle();return {ui,props,user,emitted,stop:()=>clean.forEach(f=>f())}
}

test('same-page companion has no automatic model call on direction selection',async()=>{
 let calls=0;const t=await setup({sendExplorationAnalysis:async()=>{calls++;return {data:record()}}})
 assert.equal(calls,0);t.ui.message.value='先说说我的犹豫';await t.ui.send();assert.equal(calls,1);t.stop()
})
test('double send is one submission and lost response retries the same key',async()=>{
 const d=deferred(),seen=[];let n=0
 const t=await setup({sendExplorationAnalysis:async(_id,payload,key)=>{seen.push({payload,key});if(n++===0)return d.promise;return {data:record()}}})
 t.ui.message.value='我喜欢查询，也想做网页';const first=t.ui.send();await t.ui.send();assert.equal(seen.length,1)
 d.resolve({});await first;assert.equal(t.ui.message.value,'我喜欢查询，也想做网页')
 await t.ui.send();assert.equal(seen[0].key,seen[1].key);assert.deepEqual(seen[0].payload,seen[1].payload);t.stop()
})
test('late response cannot repopulate another account discussion',async()=>{
 const d=deferred();const t=await setup({sendExplorationAnalysis:()=>d.promise})
 t.ui.message.value='原账号的经历';const pending=t.ui.send();t.user.currentUser={id:'other'};await settle()
 d.resolve({data:{...record(),exploration_id:'exp_old'}});await pending
 assert.equal(t.ui.message.value,'');assert.equal(t.emitted.length,0);t.stop()
})
test('an edited problem requires updated proposal before confirmation',async()=>{
 let calls=0;const t=await setup({confirmExplorationProposal:async()=>{calls++;return {data:record()}}})
 t.props.record={...record(),analysis_turns:[turn()]};await settle()
 t.ui.reason.value='本人愿意尝试';t.ui.question.value='换一个问题';await t.ui.confirm();assert.equal(calls,0)
 t.ui.question.value='喜欢解释数据吗？';await t.ui.confirm();assert.equal(calls,1);t.stop()
})

test('a saved proposal restores editable question and time on initial page mount',async()=>{
 const t=await setup({}, {...record(),analysis_turns:[turn()]})
 assert.equal(t.ui.question.value,'喜欢解释数据吗？')
 assert.equal(t.ui.hours.value,'三小时')
 assert.equal(t.ui.proposalChanged.value,false)
 t.ui.question.value='本人尚未提交的修改'
 t.props.record={...t.props.record,revision:3};await settle()
 assert.equal(t.ui.question.value,'本人尚未提交的修改')
 t.stop()
})
test('stale proposal is historical and cannot be confirmed',async()=>{
 const t=await setup();t.props.record={...record(),analysis_turns:[{...turn(),stale:true}]};await settle()
 assert.equal(t.ui.proposalTurn.value,null);t.stop()
})
test('confirmed draft discussion follows the same trial instead of disappearing',async()=>{
 const t=await setup();t.props.roundId='round_one';t.props.record={...record(),analysis_turns:[{...turn(),confirmed_round_id:'round_one'}]};await settle()
 assert.equal(t.ui.turns.value.length,1);t.stop()
})
test('ordinary detail refresh does not discard unfinished text or reset the read cursor',async()=>{
 const t=await setup();t.ui.message.value='我还在输入的补充';t.props.record={...t.props.record,revision:3};await settle()
 assert.equal(t.ui.message.value,'我还在输入的补充');t.stop()
})
test('an older identical message is not proof that a lost submission was saved',async()=>{
 const previous={...turn(),message:'我想先试查询',request_key:'previous_request_key'}
 const t=await setup({sendExplorationAnalysis:async()=>{throw Error('响应丢失')},readExploration:async()=>({data:{...record(),analysis_turns:[previous]}})})
 t.ui.message.value='我想先试查询';await t.ui.send();await t.ui.reconcile()
 assert.equal(t.ui.message.value,'我想先试查询');t.stop()
})
test('page retains original overview and uses real events rather than a fake percentage',()=>{
 assert.match(source,/readAnalysisEvents/);assert.doesNotMatch(source,/chat\/stream|setInterval|Math\.random/)
 const workspace=readFileSync(new URL('../src/components/career/CareerExplorationWorkspace.vue',import.meta.url),'utf8')
 assert.match(workspace,/<ExplorationCompanion/);assert.doesNotMatch(workspace,/@submit\.prevent="start"|@submit\.prevent="review"/)
})
test('resume comparison does not claim practice records were read before a trial',async()=>{
 const t=await setup();const summary=t.ui.summary({...turn(),result:{...turn().result,evidence_summary:[{name:'本人经历与自述',status:'read'}]}})
 assert.equal(summary.scope_note,undefined);t.stop()
})
test('a legacy backend response without companion capability never offers a fake working action',async()=>{
 const t=await setup();t.props.record={...record(),analysis_available:undefined};await settle()
 assert.equal(t.ui.blocked.value,true);t.stop()
})
