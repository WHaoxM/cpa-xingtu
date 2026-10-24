import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import { computed, nextTick, reactive, ref, watch } from 'vue'

const load = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const layout = load('../src/components/reports/ReportReadingLayout.vue')
const script = 'const {computed,nextTick,ref,watch,onBeforeUnmount}=globalThis.__readingTest; const _defineComponent=value=>value;\n' + compileScript(parse(layout).descriptor, { id: 'reading-test' }).content.replace(/^import .* from ['"]vue['"];?$/gm, '')
const code = (await transform(script, { loader: 'ts', format: 'esm' })).code
async function fixture() {
  const dispose = []
  globalThis.__readingTest = { computed, nextTick, ref, watch, onBeforeUnmount: fn => dispose.push(fn) }
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`)
  const props = reactive({ resourceKey: 'owner:snapshot1', sections: [{ id: 'D1', title: '基础背景' }, { id: 'basis', title: '依据与边界' }] })
  const view = mod.default.setup(props, { expose() {} })
  const host = { scrollTop: 0, scrollHeight: 1000, clientHeight: 600, classList: { contains: () => false }, getBoundingClientRect: () => ({ top: 0 }) }
  globalThis.getComputedStyle = () => ({ overflowY: 'auto' })
  view.root.value = { parentElement: host, getBoundingClientRect: () => ({ top: -host.scrollTop }), querySelector: () => null }
  let focused = 0
  view.heading.value = { focus: () => focused++ }
  return { props, view, host, dispose, focused: () => focused }
}
test('one chapter, focus and per-chapter scroll survive within a reading, not a new resource', async () => {
  const f = await fixture()
  assert.equal(f.view.active.value, 'overview')
  await f.view.open('D1'); f.host.scrollTop = 180
  await f.view.open('basis'); f.host.scrollTop = 37
  await f.view.open('D1'); assert.equal(f.host.scrollTop, 180)
  assert.equal(f.focused(), 3)
  f.props.resourceKey = 'owner:snapshot2'; await nextTick()
  assert.equal(f.view.active.value, 'overview'); assert.equal(f.view.positions.size, 0)
})
test('unknown chapter rejected and pending selection cannot focus after close or resource switch', async () => {
  const f = await fixture()
  await f.view.open('not-a-section'); assert.equal(f.view.active.value, 'overview')
  const pending = f.view.open('D1'); f.props.resourceKey = 'other:snapshot3'
  await pending; await nextTick(); assert.equal(f.view.active.value, 'overview')
  const before = f.focused(); const closing = f.view.open('basis'); f.dispose.forEach(fn => fn()); await closing
  assert.equal(f.focused(), before)
})
test('three readers compile, keep expanded prose, actual source values, and one adaptive directory', () => {
  for (const file of ['../src/components/reports/ServerPortraitDetail.vue','../src/components/reports/ServerReportDetail.vue','../src/components/career/ResumeDiagnosticReport.vue','../src/components/career/ResumeImprovementPanel.vue']) {
    const { descriptor } = parse(load(file))
    const result = compileTemplate({ source: descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: compileScript(descriptor, { id: file }).bindings } })
    assert.deepEqual(result.errors, [])
  }
  assert.match(layout, /@container \(min-width: 760px\)/)
  assert.match(layout, /<select/)
  assert.doesNotMatch(layout, /localStorage|router|fetch\(/)
  assert.match(load('../src/components/career/ResumeDiagnosticReport.vue'), /@click.prevent="showEvidence\(id\)"/)
  assert.match(load('../src/components/reports/ServerPortraitDetail.vue'), /item.value === null/)
  assert.match(load('../src/views/student/CareerNavigation.vue'), /display: flex;\s*flex-direction: column;\s*\/\* Desktop grid centering[\s\S]*?justify-content: flex-start;/)
})

test('legacy resume interpretations are marked without replacing prose or changing the reader', () => {
  const source=load('../src/components/career/ResumeDiagnosticReport.vue')
  assert.match(source,/report\.analysis_content_status === 'legacy'/)
  assert.match(source,/历史内容不会自动改写/)
  assert.match(source,/report\.analysis\.summary\.text/)
  assert.doesNotMatch(source,/\.replace\([^\n]*(闭环|颗粒度|端到端)/)
})

test('resume reading is not titled ability portrait just because a portrait exists',()=>{
  const source=load('../src/views/student/CareerNavigation.vue')
  const expression=source.match(/class="rp-header-tag">{{ ([^]*?) }}<\/div>/)[1]
  const title=new Function('portraitFollowup','route','showBackendPortrait','showBackendWorkspace','rightRealView',`return ${expression}`)
  assert.equal(title(false,{query:{}},true,true,'report'),'简历解读')
  assert.equal(title(false,{query:{}},true,true,'portrait'),'个人能力画像')
})

test('a rejected narrative still exposes its independently bound question without fake completion',()=>{
  const source=load('../src/components/career/ResumeDiagnosticReport.vue')
  const expression=source.match(/const firstReadingQuestion = computed\(\(\) => ([^\n]+)\)/)[1]
  const question=new Function('props',`return ${expression}`)
  const props={report:{analysis:null,status:'partial',improvements:[{questions:['关于展示，你参与了哪些工作？']}]}}
  assert.equal(question(props),'关于展示，你参与了哪些工作？')
  props.report={analysis:{questions:[{text:'当前解读的问题'}]},improvements:[]}
  assert.equal(question(props),'当前解读的问题')
  props.report=null
  assert.equal(question(props),undefined)
  assert.match(source,/经历解读尚未就绪/)
  assert.match(source,/open\(report\.analysis\?\.summary\?\.text \? 'analysis' : 'improvements'\)/)
})

test('opening the real resume report survives a late portrait restoration response', async () => {
  const source=load('../src/views/student/CareerNavigation.vue')
  const refresh=source.match(/async function refreshWorkbenchState\([^]*?\n\}/)[0]
  const select=source.match(/function selectRealView\([^]*?\n\}/)[0]
  const handler=source.match(/@click="([^"]+)"[^>]*>\s*<Icon icon="lucide:file-text"[^]*?查看完整简历报告/)[1]
  const state={value:'portrait'},route={query:{}},candidate={value:{task_id:'confirmed'}},partial={value:null}
  let release,requestedQuery
  const env={rightRealView:state,route,resumeCandidate:candidate,partialPortrait:partial,authoritativePortrait:{value:null},
    userStore:{currentUser:{id:'owner'}},workbenchState:{value:null},historicalPortrait:{value:null},
    resumeDiagnosticReport:null,resumeReportLoading:{value:false},resumeReportError:{value:''},
    getStudentWorkbenchState:()=>new Promise(resolve=>release=resolve),
    getResumeCandidate:async()=>({success:true,data:{task_id:'confirmed',portrait_task:{task_id:'new-portrait',status:'partial'}}}),
    router:{replace:({query})=>{requestedQuery=query;return Promise.resolve()}},
    loadResumeDiagnosticReport:()=>{},loadPortraitHistory:()=>{},stopAnalysisRefresh:()=>{},replayTaskEvents:()=>{},
    confirmedProfile:{value:{profile_ready:false}},parseError:{value:''}}
  const declarations='let workbenchRequestSeq=0,portraitDetailRequestSeq=0,analysisRefreshTimer=null,lastHistorySnapshotId=null;'
  const code=(await transform(`${declarations} const {${Object.keys(env).join(',')}}=env; ${refresh}; ${select}; return {refreshWorkbenchState,click:()=>{${handler.replace(/rightRealView =/g,'rightRealView.value =')}}}`,{loader:'ts'})).code
  const ui=new Function('env',code)(env)
  const pending=ui.refreshWorkbenchState('confirmed')
  ui.click()
  release({success:true,data:{source_confirmation_task_id:'confirmed',portrait:{state:'ready_with_unknowns',task_id:'new-portrait'},resume_diagnostic:{state:'partial'}}})
  await pending
  assert.equal(state.value,'report')
  route.query=requestedQuery
  assert.equal(route.query.result_view,'report')
})
const paragraphsCode = (await transform(load('../src/utils/reportChapterContent.ts'), { loader: 'ts', format: 'esm' })).code
const { chapterParagraphs } = await import(`data:text/javascript;base64,${Buffer.from(paragraphsCode).toString('base64')}`)
test('saved chapter body, not just summary, remains readable without internal identities', () => {
  const rows = chapterParagraphs({ title: '方向解读', summary: '只支持初步判断，不能认定掌握。', content: '完整分析全文。', sections: [{ title: '本人职责', content: '只完成查询，展示由同伴负责。' }], recommendations: ['先讲清去重规则。'], student_id: 'private-owner', evidence_refs: ['private-id'], source_uri: 'career://private', schema_version: 'v1' })
  assert.deepEqual(rows.map(row => row.text).filter(Boolean), ['只支持初步判断，不能认定掌握。','完整分析全文。','只完成查询，展示由同伴负责。','先讲清去重规则。'])
  assert.ok(rows.some(row => row.label === '本人职责'))
  assert.doesNotMatch(JSON.stringify(rows), /private|schema_version/)
  assert.deepEqual(chapterParagraphs(null), [])
})
