import {readFileSync} from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {transform} from 'esbuild'
import {computed,onBeforeUnmount,ref,watch,reactive,nextTick,createSSRApp} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'

const source=readFileSync(new URL('../src/composables/useCareerClimbing.ts',import.meta.url),'utf8')
const names=['computed','onBeforeUnmount','ref','watch','useRoute','useRouter','useUserStore','getLandscape','httpGet','getStudentWorkbenchState','getStudentPortraitSnapshot','getLatestResumeDiagnosticReport','listExplorations','readExploration','createExploration','patchExploration','sendExplorationAnalysis']
const code=(await transform(`const {${names}}=globalThis.__climbingTest;\n`+source.replace(/^import .*$/gm,''),{loader:'ts',format:'esm'})).code
const flush=async()=>{for(let i=0;i<5;i++){await nextTick();await new Promise(r=>setTimeout(r,0))}}
const gate=()=>{let release;const promise=new Promise(r=>release=r);return {promise,release}}
const wb={source_confirmation_task_id:'task_current',portrait:{snapshot_id:'ps_current'},resume_diagnostic:{report_id:'r_current'}}
const record=(role='数据分析')=>({exploration_id:'exp_owned',revision:1,source_status:'current',analysis_available:true,rounds:[],analysis_turns:[],draft:{compared_roles:[role]}})
async function setup(overrides={}){
  const user=reactive({currentUser:{id:'owner'}}),route=reactive({query:{role:'数据分析'}}),calls=[],cleanup=[]
  const deps={computed,ref,watch,onBeforeUnmount:f=>cleanup.push(f),useUserStore:()=>user,useRoute:()=>route,
    useRouter:()=>({replace:async({query})=>{route.query=query},push:async()=>{}}),
    getLandscape:async()=>[{category:'数据',roles:['数据分析','数据开发']}],httpGet:async()=>({data:{paths:[]}}),
    getStudentWorkbenchState:async()=>({data:wb}),getStudentPortraitSnapshot:async()=>({data:{source_confirmation_task_id:'task_current'}}),
    getLatestResumeDiagnosticReport:async()=>({data:{source_confirmation_task_id:'task_current',chapters:[]}}),
    listExplorations:async()=>({data:[]}),readExploration:async()=>({data:record()}),
    createExploration:async()=>{calls.push('create');return {data:record()}},
    patchExploration:async()=>{calls.push('patch');return {data:record()}},
    sendExplorationAnalysis:async()=>{calls.push('send');return {data:record()}},...overrides}
  globalThis.__climbingTest=deps
  const {useCareerClimbing}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`)
  const state=useCareerClimbing(()=>true)
  await flush()
  return {state,user,route,calls,close:()=>cleanup.forEach(f=>f())}
}

test('entering and selecting a direction are reads only, not model submissions',async()=>{
  const f=await setup();f.state.choose('数据开发');await flush()
  assert.equal(f.state.role.value,'数据开发');assert.deepEqual(f.calls,[]);f.close()
})
test('late details cannot restore the previous account',async()=>{
  const held=gate();let n=0
  const f=await setup({listExplorations:async()=>({data:[{exploration_id:'exp_old'}]}),readExploration:async()=>{if(n++===0)return held.promise;return {data:null}}})
  f.user.currentUser={id:'other'};await flush();held.release({data:record()});await flush()
  assert.equal(f.state.record.value,null);assert.equal(f.state.positioning.value,null);f.close()
})
test('rapid direction changes invalidate old reads',async()=>{
  const held=gate()
  const f=await setup({listExplorations:async(role)=>role==='数据分析'?held.promise:{data:[]}})
  f.state.choose('数据开发');await flush();held.release({data:[{exploration_id:'exp_wrong'}]});await flush()
  assert.equal(f.state.record.value,null);assert.equal(f.state.role.value,'数据开发');f.close()
})
test('mismatched portrait and report versions are not rendered',async()=>{
  const f=await setup({getStudentPortraitSnapshot:async()=>({data:{source_confirmation_task_id:'task_old'}}),getLatestResumeDiagnosticReport:async()=>({data:{source_confirmation_task_id:'task_old'}})})
  assert.equal(f.state.portrait.value,null);assert.equal(f.state.report.value,null)
  assert.match(f.state.portraitError.value,/来源已变化/);assert.match(f.state.reportError.value,/来源已变化/);f.close()
})
test('unavailable analysis is explicit, not local success or an automatic retry',async()=>{
  const f=await setup({listExplorations:async()=>({data:[{exploration_id:'exp_owned'}]}),readExploration:async()=>({data:{...record(),analysis_available:false}})})
  await f.state.submit();await flush()
  assert.match(f.state.error.value,/尚未接通/);assert.deepEqual(f.calls,[]);assert.equal(f.state.positioning.value,null);f.close()
})
test('failed submission retains the student text and does not auto-resubmit',async()=>{
  const f=await setup({listExplorations:async()=>({data:[{exploration_id:'exp_owned'}]}),sendExplorationAnalysis:async()=>{throw Error('连接断开，结果未核对')}})
  f.state.message.value='这是我本人写的查询';await f.state.submit();await flush()
  assert.equal(f.state.message.value,'这是我本人写的查询');assert.match(f.state.error.value,/结果未核对/);assert.equal(f.state.positioning.value,null);f.close()
})
test('legacy interpretation remains historical without automatic regeneration',async()=>{
  const old={...record(),analysis_turns:[{status:'completed',stale:false,content_status:'legacy',result:{positioning:{role:'数据分析',starting_point:'旧版解读'}}}]}
  const f=await setup({listExplorations:async()=>({data:[{exploration_id:'exp_owned'}]}),readExploration:async()=>({data:old})})
  assert.equal(f.state.legacy.value,true);assert.equal(f.state.positioning.value,null)
  assert.equal(f.state.latest.value.result.positioning.starting_point,'旧版解读')
  assert.deepEqual(f.calls,[]);f.close()
})
test('an older backend without a content-status flag cannot restore a v1 answer as current',async()=>{
  const old={...record(),analysis_turns:[{status:'completed',stale:false,result:{positioning:{role:'数据分析',starting_point:'旧服务器的解读'}}}]}
  const f=await setup({listExplorations:async()=>({data:[{exploration_id:'exp_owned'}]}),readExploration:async()=>({data:old})})
  assert.equal(f.state.legacy.value,true);assert.equal(f.state.positioning.value,null)
  assert.deepEqual(f.calls,[]);f.close()
})
test('original climbing SFC still compiles; no HTTP mock score or simulated plan branch',()=>{
  const filename=new URL('../src/views/student/CareerReport.vue',import.meta.url).pathname
  const text=readFileSync(new URL('../src/views/student/CareerReport.vue',import.meta.url),'utf8')
  const sfc=parse(text)
  assert.deepEqual(sfc.errors,[])
  assert.deepEqual(compileTemplate({source:sfc.descriptor.template.content,filename,id:'climb'}).errors,[])
  assert.ok(text.includes('cw-wall-tex')&&text.includes('cw-tnut')&&text.includes('cw-climber'))
  assert.match(text,/isRealPath\.value \? '' : `\$\{Math.round\(job.matchScore/)
})
test('the personal reading keeps every conclusion and its limit visible, with only original quotes disclosed',async()=>{
  const text=readFileSync(new URL('../src/components/career/CareerStartingPoint.vue',import.meta.url),'utf8')
  const {descriptor}=parse(text)
  const bindings=compileScript(descriptor,{id:'starting-point-preservation'})
  const script=(await transform(bindings.content,{loader:'ts',format:'esm'})).code.replace(/from ["']vue["']/g,`from ${JSON.stringify(import.meta.resolve('vue'))}`)
  const template=compileTemplate({source:descriptor.template.content,filename:'CareerStartingPoint.vue',id:'starting-point-preservation',compilerOptions:{bindingMetadata:bindings.bindings}})
  assert.deepEqual(template.errors,[])
  const component=(await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`)).default
  const render=(await import(`data:text/javascript;base64,${Buffer.from(template.code.replace(/from ["']vue["']/g,`from ${JSON.stringify(import.meta.resolve('vue'))}`)).toString('base64')}`)).render
  component.render=render
  const value={role:'数据分析',reading_status:'partial',reading_note:'资料只支持查询职责；不能归入同伴完成的展示。',starting_point:'我完成了查询；展示由同伴完成。',next_action:{kind:'clarify_experience',text:'先讲清重复报名是如何判断的。',reason:'这能区分已经做过但没写清，还是尚未实践。',evidence_ids:['q']},connections:[{text:'分组统计可以联系数据整理任务，不代表已经掌握全部分析。',evidence_ids:['q']}],uncertainties:[{kind:'unknown',text:'尚不知道核对是否使用了代码。',evidence_ids:['q']}],evidence:[{id:'q',label:'本人补充',quote:'查询由我编写，展示由同伴完成。',kind:'student_statement'}]}
  const html=await renderToString(createSSRApp(component,{value,actionable:true}))
  for(const prose of [value.starting_point,value.next_action.text,value.next_action.reason,...value.connections.map(item=>item.text),...value.uncertainties.map(item=>item.text)])assert.ok(html.includes(prose),prose)
  assert.ok(html.indexOf(value.reading_note)<html.indexOf('<details'))
  assert.equal(html.split(value.reading_note).length-1,1)
  assert.match(html,/career-personal-start/);assert.match(html,/career-personal-next/)
  assert.match(html,/本人自述/);assert.match(html,/查询由我编写，展示由同伴完成。/)
  assert.equal((html.match(/<details/g)||[]).length,1)
  const historical=await renderToString(createSSRApp(component,{value,actionable:false}))
  assert.doesNotMatch(historical,/id="career-personal-/)
})

test('wall explains positions without repeating long conclusions, and source analysis stays on the page',()=>{
  const text=readFileSync(new URL('../src/views/student/CareerReport.vue',import.meta.url),'utf8')
  const wallNote=text.match(/<div v-if="isRealPath && hasClimbTarget && wallNoteOpen"[\s\S]*?<\/div>/)?.[0]
  assert.ok(wallNote)
  assert.doesNotMatch(wallNote,/positioning\?\.(starting_point|next_action)/)
  assert.match(wallNote,/wallReadingTarget\(selectedPathNode\)/)
  assert.match(text,/climb\.report\.analysis\.summary\.text/)
  assert.match(text,/<section v-if="climb\.portrait" class="cr-real-portrait"/)
  assert.doesNotMatch(text,/<details v-if="climb\.portrait"/)
  assert.match(text,/v-for="\(s,i\) in climb\.report\.analysis\.strengths"/)
  assert.match(text,/v-for="\(q,i\) in climb\.report\.analysis\.questions"/)
  assert.match(text,/\['projects','experience','achievements'\]/)
})

test('source experience presentation keeps actual role and descriptions without private fields',async()=>{
  const text=readFileSync(new URL('../src/views/student/CareerReport.vue',import.meta.url),'utf8')
  const fn=text.match(/function diagnosticFactParts[\s\S]*?(?=\nconst personalQuestion)/)?.[0]
  assert.ok(fn)
  const code=(await transform('export '+fn,{loader:'ts',format:'esm'})).code
  const {diagnosticFactParts}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  assert.deepEqual(diagnosticFactParts({role:'参与查询',desc:'我独立编写查询，同伴完成展示。',description:'我独立编写查询，同伴完成展示。',student_id:'private'}),[{label:'参与角色',text:'参与查询'},{label:'经历记录',text:'我独立编写查询，同伴完成展示。'}])
  assert.deepEqual(diagnosticFactParts({desc:'负责检查数据。',description:'向同伴说明结果。'}).map(item=>item.text),['负责检查数据。','向同伴说明结果。'])
  assert.deepEqual(diagnosticFactParts('一段实际经历'),[{label:'经历记录',text:'一段实际经历'}])
})

test('wall marker stays at personal evidence when the goal or interpretation changes',async()=>{
  const raw=readFileSync(new URL('../src/composables/careerClimbingContract.ts',import.meta.url),'utf8').replace(/^import .*$/gm,'')
  const compiled=(await transform(raw,{loader:'ts',format:'esm'})).code
  const {personalClimbLayout}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
  assert.deepEqual(personalClimbLayout('',null),{nodes:[],ropes:[]})
  const a=personalClimbLayout('数据分析',null),b=personalClimbLayout('前端开发',{next_action:{kind:'practice'},connections:[]})
  assert.deepEqual(a.nodes[0],b.nodes[0]);assert.equal(b.nodes[1].title,'动手试一次')
  assert.ok(!JSON.stringify(b).includes('salaryRange":"15'))
})
