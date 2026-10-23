import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as vue from 'vue'

const source = readFileSync(new URL('../src/utils/homeContinuation.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const { resumeHomeActions, activityDestination, activityCopy } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const base = {state:'results_ready',task_id:'task_new',confirmation_task_id:'task_old',based_on_previous_upload:true,
  portrait_ready:true,diagnostic_ready:true,diagnostic_report_id:'resume_old',has_analysis_failures:false,
  draft:{state:'saved',revision:2,updated_at:'2026-10-22T10:00:00'}}

test('candidate takes priority over older results, with an independent saved draft',()=>{
  const {primary,secondary}=resumeHomeActions({...base,state:'waiting_for_user'})
  assert.equal(primary.cta,'继续核对简历')
  assert.match(primary.route,/task_id=task_new/)
  assert.ok(secondary.some(a=>a.kind==='draft' && a.route==='/app/student/resume-builder'))
  assert.ok(secondary.some(a=>a.kind==='previous' && /task_id=task_old/.test(a.route)))
  assert.doesNotMatch(JSON.stringify({primary,secondary}),/未提交|HTTP|resume_old/)
})
test('partial results are readable, not blocked by scoring or a four-dimensional radar',()=>{
  const {primary}=resumeHomeActions({...base,based_on_previous_upload:false,confirmation_task_id:'task_new'})
  assert.equal(primary.kind,'results')
  assert.match(primary.route,/task_id=task_new/)
})
test('analysis in progress may also offer its already readable diagnosis',()=>{
  const actions=resumeHomeActions({...base,state:'analysis_running',based_on_previous_upload:false})
  assert.equal(actions.primary.kind,'analysis')
  assert.ok(actions.secondary.some(a=>a.kind==='diagnostic'))
})
test('unknown reads and missing contracts never pretend to be a new user',()=>{
  assert.equal(resumeHomeActions(undefined).primary.kind,'reload')
  assert.equal(resumeHomeActions({...base,state:'unavailable'}).primary.kind,'reload')
  assert.equal(resumeHomeActions({...base,state:'empty',draft:{state:'empty'}}).primary.kind,'start')
  assert.equal(resumeHomeActions({...base,state:'draft_only'}).primary.kind,'draft')
})
test('activity routes use specific resources and cannot accept arbitrary server destinations',()=>{
  assert.equal(activityDestination({type:'resume_diagnostic',task_id:'task_x',route:'https://evil.invalid'}),'/app/student/career-navigation?task_id=task_x&result_view=report')
  assert.equal(activityDestination({type:'career_report',report_id:'report_x'}),'/app/student/my-reports?report_id=report_x')
  assert.equal(activityDestination({type:'course_completed',course_id:'python'}),'/app/student/learning?course_id=python')
  assert.equal(activityDestination({type:'resume_diagnostic',task_id:'forged?x=1'}),null)
  assert.match(activityCopy({type:'resume_diagnostic',partial:true}).detail,/部分/)
})

const flush = async()=>{for(let i=0;i<5;i++){await Promise.resolve();await vue.nextTick()}}
const data = (resume={...base,based_on_previous_upload:false,confirmation_task_id:'task_new'}) => ({
  metrics:{completed_courses:0,weekly_completed_chapters:0},portrait:{state:'ready_with_unknowns',completeness:25,dimensions:{D2:55}},
  source_confirmation_task_id:resume.confirmation_task_id,evidence:{has_verified_completed_report:false},
  recent_activities:[],resume_continuation:resume,
})

async function lifecycle() {
  const {descriptor}=parse(readFileSync(new URL('../src/views/student/StudentDashboardHome.vue',import.meta.url),'utf8'))
  const script=compileScript(descriptor,{id:'home-owner-lifecycle'}).content.replace(/^import .*$/gm,'')
  const requests=[],routes=[],cleanups=[]
  const store=vue.reactive({currentUser:{id:'owner-a',name:'同学'}})
  const ctx={...vue,_defineComponent:vue.defineComponent,onBeforeUnmount:fn=>cleanups.push(fn),
    useRouter:()=>({push:async route=>routes.push(route)}),useUserStore:()=>store,getApiMode:()=> 'http',
    getStudentDashboard:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),
    listTargetRoles:async()=>[],inferConfirmedResumeRoles:async()=>({roles:{candidates:[]}}),
    getCareerSuggestions:async()=>[],addTargetRole:async()=>{},ApiError:class extends Error{},
    resumeHomeActions,activityDestination,activityCopy,Icon:{},D3RadarChart:{},
    heroLandscape:'',dataAnalysisImage:'',productManagementImage:'',frontendEngineeringImage:''}
  globalThis.__homeLifecycle=ctx
  const compiled=ts.transpileModule(`const {${Object.keys(ctx).join(',')}}=globalThis.__homeLifecycle;\n${script}`,
    {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  const module=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}#${Math.random()}`)
  const scope=vue.effectScope()
  const view=scope.run(()=>module.default.setup({}, {expose(){}}))
  return {view,requests,routes,store,cleanup(){cleanups.forEach(fn=>fn());scope.stop()}}
}

test('late dashboard response cannot restore another account or its resume action',async()=>{
  const f=await lifecycle()
  f.store.currentUser={id:'owner-b',name:'另一位同学'};await flush()
  assert.equal(f.requests.length,2)
  f.requests[0].resolve(data({...base,confirmation_task_id:'task_private'}));await flush()
  assert.equal(f.view.dashboard.value,null)
  f.requests[1].resolve(data({...base,confirmation_task_id:'task_other'}));await flush()
  assert.equal(f.view.dashboard.value.resume_continuation.confirmation_task_id,'task_other')
  assert.doesNotMatch(f.view.heroAction.value.route,/private/)
  f.cleanup()
})

test('learning records have their own unavailable state and do not replace the resume hero',async()=>{
  const f=await lifecycle();f.requests[0].resolve(data());await flush()
  assert.equal(f.view.learningContinuation.value.state,'unavailable')
  assert.equal(f.view.heroAction.value.kind,'results')
  assert.equal(f.view.learningTitle('\u0080bad'),'课程名称待整理')
  assert.equal(f.view.learningTitle('Python 入门'),'Python 入门')
  f.cleanup()
})

test('course continuation encodes only a local course query and suppresses duplicate navigation',async()=>{
  const f=await lifecycle()
  const course={course_id:'python?x=1',title:'Python',chapter_count:3,completed_chapters:1}
  f.requests[0].resolve({...data(),learning_continuation:{state:'ready',courses:[course]}});await flush()
  const opening=f.view.openLearningCourse(course.course_id)
  await f.view.openLearningCourse(course.course_id);await opening
  assert.deepEqual(f.routes,['/app/student/learning?course_id=python%3Fx%3D1'])
  await f.view.openLearningCourse('not-in-owner-summary')
  assert.equal(f.routes.length,1)
  assert.equal(f.view.learningBusy.value,false)
  f.cleanup()
})

test('account change clears learning records immediately and ignores the former owner late response',async()=>{
  const f=await lifecycle()
  f.requests[0].resolve({...data(),learning_continuation:{state:'ready',courses:[{course_id:'private-course'}]}});await flush()
  assert.equal(f.view.learningContinuation.value.courses.length,1)
  const pending=f.view.loadDashboard()
  f.store.currentUser={id:'owner-b'};await flush()
  assert.deepEqual(f.view.learningContinuation.value.courses,[])
  f.requests[1].resolve({...data(),learning_continuation:{state:'ready',courses:[{course_id:'private-course'}]}});await pending;await flush()
  assert.deepEqual(f.view.learningContinuation.value.courses,[])
  f.requests[2].resolve({...data(),learning_continuation:{state:'empty',courses:[]}});await flush()
  assert.equal(f.view.learningContinuation.value.state,'empty')
  f.cleanup()
})

test('click revalidation does not silently redirect an old result to a new candidate',async()=>{
  const f=await lifecycle();f.requests[0].resolve(data());await flush()
  const old=f.view.heroAction.value
  const action=f.view.openResumeAction(old)
  f.requests[1].resolve(data({...base,state:'waiting_for_user'}));await action
  assert.deepEqual(f.routes,[])
  assert.match(f.view.continuationNotice.value,/状态已有变化/)
  assert.equal(f.view.heroAction.value.cta,'继续核对简历')
  f.cleanup()
})

test('saved draft opens only after its revision is read back, without creating or replacing it',async()=>{
  const f=await lifecycle();f.requests[0].resolve(data());await flush()
  const draft=f.view.resumeActions.value.secondary.find(a=>a.kind==='draft')
  const action=f.view.openResumeAction(draft)
  f.requests[1].resolve(data({...base,draft:{state:'saved',revision:3}}));await action
  assert.deepEqual(f.routes,[])
  const retry=f.view.openResumeAction(f.view.resumeActions.value.secondary.find(a=>a.kind==='draft'))
  f.requests[2].resolve(data({...base,draft:{state:'saved',revision:3}}));await retry
  assert.deepEqual(f.routes,['/app/student/resume-builder'])
  f.cleanup()
})

test('a record missing from the recent five does not falsely claim that the underlying result expired',async()=>{
  const f=await lifecycle();f.requests[0].resolve(data());await flush()
  const pending=f.view.openActivity({id:'older-record',type:'resume_diagnostic',task_id:'task_new'})
  f.requests[1].resolve(data());await pending
  assert.deepEqual(f.routes,[])
  assert.match(f.view.continuationNotice.value,/列表已有变化/)
  assert.doesNotMatch(f.view.continuationNotice.value,/失效|不再.*可用/)
  f.cleanup()
})

test('unmounted click cannot navigate and a failed read never becomes empty/start',async()=>{
  const f=await lifecycle();f.requests[0].resolve(data());await flush()
  const pending=f.view.openResumeAction(f.view.heroAction.value);f.cleanup()
  f.requests[1].resolve(data());await pending
  assert.deepEqual(f.routes,[])
  const g=await lifecycle();g.requests[0].reject(new Error('unavailable'));await flush()
  assert.equal(g.view.dashboard.value,null)
  assert.equal(g.view.heroAction.value.kind,'reload')
  assert.match(g.view.pageError.value,/unavailable/)
  assert.ok(g.view.planningPhases.value.every(phase=>!phase.active),'read failure cannot imply that the student should restart the first stage')
  g.cleanup()
})
