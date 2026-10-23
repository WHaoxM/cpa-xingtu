import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {parse,compileScript} from '@vue/compiler-sfc'
import ts from 'typescript'
import {reactive,nextTick} from 'vue'
const {descriptor}=parse(readFileSync(new URL('../src/components/learning/HttpSelfReflection.vue',import.meta.url),'utf8'))
const code=ts.transpileModule(compileScript(descriptor,{id:'reflection-test'}).content,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  .replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,source)=>source==='vue'
    ? `import {${names}} from ${JSON.stringify(import.meta.resolve('vue'))};` : `const {${names}}=globalThis.__reflectionTest;`)
const direction={id:'data',label:'数据分析',group:'数据分析'}
const pack={version:'v1',direction,questions:[{id:'sql',label:'SQL'},{id:'py',label:'Python'}],options:[
  {id:'concept',label:'了解概念',group:'concept'},{id:'unsure',label:'暂时无法判断',group:'unknown'}]}
const tick=()=>new Promise(resolve=>setImmediate(resolve))
async function fixture(){
  const user=reactive({currentUser:{id:'alice'}}),calls=[]
  let record=null,save=async body=>{record={assessment_id:'asm-1',submission_id:body.submission_id,created_at:'2026-10-22',reflection:{...pack,questionnaire_version:'v1',answers:{...body.answers}}};return {success:true,data:record}}
  let latest=async()=>{if(!record)throw Object.assign(Error('no record'),{status:404});return {success:true,data:record}}
  let guard,confirm=async()=>true
  globalThis.window={addEventListener(){},removeEventListener(){}}
  globalThis.__reflectionTest={useUserStore:()=>user,onBeforeRouteLeave:fn=>{guard=fn},ElMessage:{info(){}},ElMessageBox:{confirm:(...a)=>confirm(...a)},
    listReflectionDirections:async()=>({success:true,data:{version:'v1',directions:[direction]}}),
    getReflectionQuestionnaire:async()=>({success:true,data:structuredClone(pack)}),getLatestReflection:(...args)=>latest(...args),
    saveSelfReflection:async body=>{calls.push(JSON.parse(JSON.stringify(body)));assert.equal(body.student_id,undefined);return save(body)}}
  const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`)
  const ui=mod.default.setup({}, {expose(){}});await tick()
  return {ui,user,calls,save:fn=>{save=fn},latest:fn=>{latest=fn},persist:async body=>{record={assessment_id:'asm-1',submission_id:body.submission_id,reflection:{...pack,questionnaire_version:'v1',answers:{...body.answers}}};return {success:true,data:record}},record:()=>record,guard:()=>guard(),cancelLeave:()=>{confirm=async()=>{throw Error('cancel')}}}
}
async function answer(f){await f.ui.selectDirection('data');f.ui.choose('unsure');f.ui.index.value=1;f.ui.choose('concept')}
test('explicit unknown is preserved and grouped separately, never scored',async()=>{
  const f=await fixture();await answer(f);await f.ui.submit()
  assert.equal(f.ui.phase.value,'result');assert.equal(f.ui.summary.value.unknown,1);assert.equal(f.ui.summary.value.concept,1)
  assert.equal(f.calls[0].answers.sql,'unsure');assert.equal(f.ui.choiceLabel('sql'),'暂时无法判断')
})
test('failed save keeps answers, does not show result, explicit retry uses same identity',async()=>{
  const f=await fixture();await answer(f);f.save(async()=>{throw Error('unavailable')});await f.ui.submit()
  assert.equal(f.ui.phase.value,'quiz');assert.equal(f.ui.answers.value.sql,'unsure');assert.equal(f.ui.uncertain.value,true)
  const sid=f.calls[0].submission_id;f.save(f.persist);await f.ui.submit()
  assert.equal(f.calls.length,2);assert.equal(f.calls[1].submission_id,sid);assert.equal(f.ui.phase.value,'result')
})
test('committed response lost is read back without another POST',async()=>{
  const f=await fixture();await answer(f);f.save(async body=>{await f.persist(body);throw Error('response lost')});await f.ui.submit()
  assert.equal(f.calls.length,1);assert.equal(f.ui.phase.value,'result');assert.match(f.ui.notice.value,/读回/)
})
test('changed pack is an unsaved answer, not a completed local result',async()=>{
  const f=await fixture();await answer(f);f.save(async()=>{throw Object.assign(Error('version changed'),{status:409,body:{reason:'questionnaire_changed'}})});await f.ui.submit()
  assert.equal(f.ui.phase.value,'quiz');assert.equal(f.ui.versionChanged.value,true);assert.equal(f.ui.answers.value.sql,'unsure')
})
test('late previous-account latest read cannot populate a new account',async()=>{
  const f=await fixture();let release
  f.latest(id=>id==='alice'?new Promise(r=>{release=r}):Promise.reject(Object.assign(Error('empty'),{status:404})))
  const pending=f.ui.initialize();f.user.currentUser={id:'bob'};await nextTick()
  release({success:true,data:{assessment_id:'alice-private',reflection:{...pack,answers:{sql:'unsure',py:'concept'}}}})
  await pending;await tick();assert.equal(f.ui.latest.value,null);assert.equal(f.ui.phase.value,'start')
})
test('late save cannot restore old answers after account change',async()=>{
  const f=await fixture();await answer(f);let release
  f.save(body=>new Promise(r=>{release=()=>r({success:true,data:{assessment_id:'old-owner',submission_id:body.submission_id,reflection:{...pack,answers:body.answers}}})}))
  const pending=f.ui.submit();f.user.currentUser={id:'bob'};await tick();release();await pending
  assert.equal(f.ui.latest.value,null);assert.deepEqual(f.ui.answers.value,{})
})
test('a newer submission in another page is not claimed as this submission',async()=>{
  const f=await fixture();await answer(f)
  f.latest(async()=>({success:true,data:{assessment_id:'newer',submission_id:'other-submission',reflection:{...pack,answers:{sql:'concept',py:'unsure'}}}}))
  await f.ui.submit();assert.equal(f.ui.latest.value.assessment_id,'newer');assert.match(f.ui.notice.value,/另一页面/)
})
test('leaving unfinished answers can be cancelled; network errors hide developer URLs',async()=>{
  const f=await fixture();await answer(f);f.cancelLeave();assert.equal(await f.guard(),false)
  assert.doesNotMatch(f.ui.friendly(Object.assign(Error('http://127.0.0.1:5001'),{kind:'network'})),/127|http/)
})
