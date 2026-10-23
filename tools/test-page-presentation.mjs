import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'
import { addCollection, iconLoaded } from '@iconify/vue'

async function setup(path, props) {
  const {descriptor} = parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
  const source = ts.transpileModule(compileScript(descriptor,{id:'presentation-contract'}).content,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    .replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,src)=>src==='vue' ? `import {${names}} from ${JSON.stringify(import.meta.resolve('vue'))};` : `const {${names}} = {Icon:{},useRouter:()=>({push(){}}),describeResumeEntityCheckpoint:()=>({limited:false})};`)
    // These tests execute projection functions, not child-component rendering.
    .replace(/import\s+([\w$]+)\s+from\s*['"][^'"]+\.vue['"];?/g,(_,name)=>`const ${name} = {};`)
    .replace(/import \* as d3 from ['"]d3['"];?/,`import * as d3 from ${JSON.stringify(import.meta.resolve('d3'))};`)
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Math.random()}`)
  return module.default.setup(props,{expose(){},emit(){}})
}

test('diagnostic field projection hides internal hashes and record references', async()=>{
  const ui = await setup('../src/components/career/ResumeDiagnosticReport.vue',{report:null})
  assert.deepEqual(ui.fieldsFor({name:'SQL 项目',source_sha256:'a'.repeat(64),task_id:'task_private',student_id:'other',_internal:'debug'}),[{key:'name',label:'名称',value:'SQL 项目'}])
})

test('logical text blocks never claim original document pagination', async()=>{
  const ui = await setup('../src/components/career/ResumeDiagnosticReport.vue',{report:{coverage:{page_count:1,observed_pages:[1],missing_pages:[]},chapters:[]}})
  assert.doesNotMatch(ui.pageCoverage.value,/第.*页|1.*页/)
})

test('empty count chart has no synthetic root course or duration', async()=>{
  const ui = await setup('../src/components/charts/D3Treemap.vue',{categories:[],courses:[],aggregates:[]})
  assert.deepEqual(ui.buildHierarchy(),{name:'root',children:[]})
})

test('waiting, failed read, candidate and confirmation have honest main states', async()=>{
  const base = {live:true,progress:0,trace:[],historyTrace:[],traceError:'',attempt:null,candidateReady:false,confirmed:false,failed:false}
  assert.equal((await setup('../src/components/career/CareerNavigationIdlePreview.vue',base)).traceStatus.value,'等待处理')
  assert.equal((await setup('../src/components/career/CareerNavigationIdlePreview.vue',{...base,traceError:'unavailable'})).traceStatus.value,'进度暂不可读')
  assert.equal((await setup('../src/components/career/CareerNavigationIdlePreview.vue',{...base,progress:100,candidateReady:true})).traceStatus.value,'待本人核对')
  assert.equal((await setup('../src/components/career/CareerNavigationIdlePreview.vue',{...base,confirmed:true})).traceStatus.value,'简历已确认')
})

test('real parsing keeps the central stage and visible four-step process', ()=>{
  const page = readFileSync(new URL('../src/views/student/CareerNavigation.vue',import.meta.url),'utf8')
  const preview = readFileSync(new URL('../src/components/career/CareerNavigationIdlePreview.vue',import.meta.url),'utf8')
  assert.doesNotMatch(page, /:trace-only="showLiveResumeTrace && !showBackendWorkspace"/)
  assert.doesNotMatch(preview, /<details class="cnip-processing-details">/)
  assert.match(preview, /aria-label="简历解析四步进展"/)
})

test('transient first status-read failures keep the accepted task visible and retry', ()=>{
  const page = readFileSync(new URL('../src/views/student/CareerNavigation.vue',import.meta.url),'utf8')
  assert.match(page, /简历任务已接收，但当前进度暂不可读取；正在自动重试。请勿重新上传。/)
  assert.match(page, /简历任务已接收，当前进度暂不可读；正在自动重试。请勿重新上传。/)
  assert.match(page, /resumeTaskReadUnavailable = ref\(false\)/)
  assert.match(page, /if \(resumeTaskReadUnavailable\.value\) return '进度暂不可读'/)
  assert.match(page, /if \(resumeStatusRetryPaused\.value\) return '读取已暂停'/)
  assert.match(page, /retryResumeTaskRead\(taskId, seq, error\)/)
  assert.match(page, /retryResumeTaskRead\(value, seq, statusReadError\)/)
  assert.match(page, /\[401, 403, 404\]/)
  assert.match(page, /resumeStatusRetryCount >= 8/)
  assert.match(page, /seq !== candidateLoadSeq \|\| activeResumeTaskId\.value !== taskId/)
  assert.match(page, /stopEventPoll\(\)[\s\S]*?resumeTaskPollTimer = null/)
  assert.match(page, /重试读取这份任务/)
})

test('terminal failure never leaves a specialist looking still running', async()=>{
  const ui = await setup('../src/components/career/CareerNavigationIdlePreview.vue',{
    live:true,progress:0,attempt:1,candidateReady:false,confirmed:false,failed:true,traceError:'',historyTrace:[],
    trace:[{stage:'attempt_started'},{stage:'source_extract'},{stage:'failed'}],
  })
  assert.equal(ui.traceStatus.value,'处理失败')
  assert.equal(ui.agentStates.value[0].state,'failed')
  assert.ok(ui.agentStates.value.every(agent=>agent.state !== 'running'))
})

test('navigation, editor and result icons exist locally without public icon APIs', ()=>{
  const icons = JSON.parse(readFileSync(new URL('../src/assets/icons/resume-lucide.json',import.meta.url),'utf8'))
  addCollection(icons)
  const paths = ['views/student/CareerNavigation.vue','views/student/ResumeBuilder.vue','views/student/TalentPortrait.vue',
    'components/career/CareerNavigationIdlePreview.vue','components/career/ResumeDiagnosticReport.vue','components/career/ResumeEntityReview.vue','components/UserInfoBar.vue']
  for(const path of paths) {
    const text = readFileSync(new URL('../src/'+path,import.meta.url),'utf8')
    for(const [icon] of text.matchAll(/lucide:[a-z0-9-]+/g)) assert.ok(iconLoaded(icon),`${path}: missing local ${icon}`)
  }
  assert.ok(JSON.stringify(icons).length < 30000, 'Only the used icon subset belongs in the client bundle')
})

test('historical static textures stay intact without substituting star-map ripples for a matrix wave', ()=>{
  const backdrop = readFileSync(new URL('../src/components/career/CareerNavigationBackdrop.vue',import.meta.url),'utf8')
  assert.match(backdrop, /width="26" height="26"/)
  assert.match(backdrop, /baseFrequency="0.75"/)
  assert.doesNotMatch(backdrop, /<circle v-for|@keyframes|__ripple/)
  const page = readFileSync(new URL('../src/views/student/CareerNavigation.vue',import.meta.url),'utf8')
  assert.match(page, /removeEventListener\('visibilitychange', updateVisualVisibility\)/)
  assert.doesNotMatch(page, /rp-dot-grid-flow/)
  assert.match(page, /container: career-nav \/ inline-size/)
  assert.match(page, /@container career-nav \(max-width: 900px\)/)
})
