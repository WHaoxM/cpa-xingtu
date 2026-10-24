import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript} from '@vue/compiler-sfc'
import {transform} from 'esbuild'
import * as vue from 'vue'

const path='../src/components/career/CareerExplorationWorkspace.vue'
const source=readFileSync(new URL(path,import.meta.url),'utf8')
const {descriptor}=parse(source)
let compiled=(await transform(compileScript(descriptor,{id:'exploration-tests'}).content,{loader:'ts',format:'esm'})).code
compiled=compiled.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_m,names)=>`const {${names.replace(/\s+as\s+/g,':')}}=globalThis.__explorationTest;`)
  .replace(/import\s+([A-Za-z_$][\w$]*)\s+from\s*['"][^'"]+['"];?/g,(_m,name)=>`const ${name}={};`)
const settle=async()=>{for(let n=0;n<10;n++){await Promise.resolve();await vue.nextTick()}}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
function record(id='exp_one',revision=1){return {exploration_id:id,revision,session_id:'session_one',source_status:'current',
  draft:{interest:'数据与网页',compared_roles:[]},sources:{facts:{resume_status:'missing',skills:[],projects:[]},
  candidates:[{role_name:'数据分析',category:'数据',skills:['SQL'],matched_skills:[],source_note:'目录参考'}],boundary:'探索不评分'},rounds:[]}}
async function setup(overrides={}){
  const user=vue.reactive({currentUser:{id:'owner_one'}}),route=vue.reactive({query:{}}),cleanup=[]
  const api={listExplorations:async()=>({data:[]}),readExploration:async()=>({data:record()}),
    patchExploration:async()=>({data:record()}),...overrides}
  globalThis.__explorationTest={...vue,onBeforeUnmount:fn=>cleanup.push(fn),useUserStore:()=>user,
    useRoute:()=>route,useRouter:()=>({replace:async()=>{},push:async()=>{}}),...api,Icon:{}}
  const mod=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}#${Math.random()}`)
  const ui=mod.default.setup({}, {expose(){}});await settle()
  return {ui,user,route,stop:()=>cleanup.forEach(fn=>fn())}
}

test('late owner response cannot restore a former account exploration',async()=>{
  const pending=deferred();let reads=0
  const {ui,user,stop}=await setup({listExplorations:async()=>({data:[{exploration_id:'exp_old'}]}),readExploration:()=>++reads===1?pending.promise:Promise.resolve({data:record('exp_other')})})
  user.currentUser={id:'owner_two'};await settle()
  assert.equal(ui.record.value.exploration_id,'exp_other')
  pending.resolve({data:record('exp_old')});await settle()
  assert.equal(ui.record.value.exploration_id,'exp_other');stop()
})

test('account switch clears an unfinished interest instead of carrying it to another owner',async()=>{
  const {ui,user,stop}=await setup()
  ui.interest.value='原账号尚未保存的个人兴趣';user.currentUser={id:'owner_two'};await settle()
  assert.equal(ui.interest.value,'');assert.equal(ui.choice.value,'');stop()
})

test('an unavailable exploration route stays readable and does not submit a new record',async()=>{
  let creates=0
  const {ui,stop}=await setup({listExplorations:async()=>{throw Object.assign(Error('The requested URL was not found'),{status:404})},createExploration:async()=>{creates++;return {data:record()}}})
  assert.match(ui.error.value,/返回岗位舆图/);assert.doesNotMatch(ui.error.value,/requested URL/)
  await ui.create();assert.equal(creates,0);stop()
})

test('failed comparison save preserves input and never claims saved',async()=>{
  const {ui,stop}=await setup({patchExploration:async()=>{throw Error('保存未完成')}})
  ui.accept(record(),true);ui.selection.value.reason='我想保留的文字'
  ui.toggleComparison(ui.record.value.sources.candidates[0]);await settle()
  assert.deepEqual(ui.record.value.draft.compared_roles,[])
  assert.equal(ui.selection.value.reason,'我想保留的文字');assert.equal(ui.reconcile.value,true)
  assert.match(ui.error.value,/保存未完成/);stop()
})

test('refresh after a conflict retains this tab text while loading new revision',async()=>{
  const {ui,stop}=await setup({readExploration:async()=>({data:record('exp_one',8)})})
  ui.accept(record(),true);ui.selection.value.reason='尚未覆盖的本页输入';ui.reconcile.value=true
  await ui.load('exp_one');assert.equal(ui.record.value.revision,8)
  assert.equal(ui.selection.value.reason,'尚未覆盖的本页输入');assert.equal(ui.reconcile.value,false);stop()
})

test('plan double click starts only one request; unknown result requires readback',async()=>{
  const pending=deferred();let calls=0
  const {ui,stop}=await setup({generateExplorationPlan:()=>{calls++;return pending.promise}})
  const row=record();row.rounds=[{round_id:'round_one',selection:{},source_status:'current',plan:null,review:null,decision:null}]
  ui.accept(row,true);ui.generate();ui.generate();assert.equal(calls,1)
  pending.resolve({});await settle();assert.equal(ui.reconcile.value,true);assert.equal(ui.record.value.rounds[0].plan,null);stop()
})

test('next round needs an explicit new selection and never edits history',async()=>{
  const {ui,stop}=await setup();const row=record()
  row.rounds=[{round_id:'round_one',selection:{selected_role:'数据分析'},decision:{choice:'switch',reason:'本人决定'},review:{reflection:'记录'},plan:{plan_id:'plan_original'}}]
  ui.accept(row,true);ui.nextRound()
  assert.equal(ui.newRound.value,true);assert.equal(ui.selection.value.selected_role,'')
  assert.equal(ui.record.value.rounds[0].decision.reason,'本人决定');assert.equal(ui.record.value.rounds.length,1);stop()
})

test('direction pages preserve every server name, without five-role remapping',async()=>{
  const {ui,stop}=await setup();const row=record()
  row.sources.candidates=Array.from({length:23},(_,i)=>({role_name:'实际方向'+i,category:'目录',skills:[],matched_skills:[]}))
  ui.accept(row,true);assert.equal(ui.bubblePages.value,3)
  const names=[];for(let i=0;i<3;i++){ui.bubblePage.value=i;names.push(...ui.visibleCandidates.value.map(c=>c.role_name))}
  assert.equal(new Set(names).size,23);stop()
})

test('repreparing a choice requires a saved close and does not invent a decision',async()=>{
  const row=record();row.rounds=[{round_id:'round_one',selection:{selected_role:'数据分析'},plan:null,decision:null,source_status:'expired'}]
  const saved=structuredClone(row);saved.revision=2;saved.rounds[0].closed_reason='reprepared_before_plan'
  let calls=0
  const {ui,stop}=await setup({restartUnplannedRound:async()=>{calls++;return {data:saved}}})
  ui.accept(row,true);await ui.reprepare()
  assert.equal(calls,1);assert.equal(ui.newRound.value,true);assert.equal(ui.tab.value,'compare')
  assert.equal(ui.record.value.rounds[0].decision,null);assert.equal(ui.record.value.rounds[0].plan,null)
  assert.match(ui.notice.value,/未写成实践决定/);stop()
})

test('successful human decision reveals the saved decision rather than only a toast',async()=>{
  const row=record();row.rounds=[{round_id:'round_one',selection:{selected_role:'数据分析'},decision:null,review:{status:'current'}}]
  const saved=structuredClone(row);saved.rounds[0].decision={choice:'adjust',reason:'本人想缩小练习'}
  const {ui,stop}=await setup({decideExploration:async()=>({data:saved})})
  const prior=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true})
  try{
    let scrolling=null;ui.accept(row,true);ui.choice.value='adjust';ui.decisionReason.value='本人想缩小练习'
    ui.decisionPanel.value={scrollIntoView:opts=>{scrolling=opts}}
    await ui.decide();assert.equal(ui.record.value.rounds[0].decision.reason,'本人想缩小练习')
    assert.deepEqual(scrolling,{block:'nearest',behavior:'auto'})
  }finally{globalThis.matchMedia=prior;stop()}
})

test('both original page and exploration reuse the original stylesheet',()=>{
  const page=readFileSync(new URL('../src/views/student/CareerAnalysis.vue',import.meta.url),'utf8')
  assert.match(page,/<style scoped src="\.\/careerAnalysis.css"/)
  assert.match(source,/<style scoped src="\.\.\/\.\.\/views\/student\/careerAnalysis.css"/)
  assert.match(page,/if\(showExploration.value\)return/)
  assert.doesNotMatch(source,/mockTargetRole|medianSalary|demandCount|referenceMatch/)
})
