import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transform } from 'esbuild'
import { computed, reactive, watch, nextTick } from 'vue'

const source = readFileSync(new URL('../src/composables/useReportBookshelves.ts', import.meta.url), 'utf8')
const withoutImports = source.replace(/^import .*? from .*$/gm, '')
const compiled = (await transform(`const { computed, onBeforeUnmount, reactive, watch, getReportDetail, getReportShelfPage, getStudentPortraitSnapshot, getStudentPortraitSnapshots } = globalThis.__shelfTest;\n${withoutImports}`, {loader:'ts',format:'esm'})).code
function gate() { let release; const promise = new Promise(r => {release=r}); return {promise,release} }
const settle = async () => { await nextTick(); await new Promise(r => setTimeout(r, 0)) }
const snapshot = (id='ps_'+'1'.repeat(32)) => ({snapshot_id:id,is_current:true,created_at:'2026-10-22',state:'ready_with_unknowns',dimensions:{D1:null,D2:28,D3:null,D4:null},portrait:{D2_skill:{evidence:['Python']}}})
async function fixture(overrides={}) {
  const account = reactive({id:'owner'}), route = reactive({query:{}}), calls=[], cleanup=[]
  const deps = {computed,reactive,watch,onBeforeUnmount:fn=>cleanup.push(fn),
    getStudentPortraitSnapshots:async params=>{calls.push(['portraits',params]); return {success:true,data:{items:[snapshot()],total:31}}},
    getStudentPortraitSnapshot:async id=>({success:true,data:snapshot(id)}),
    getReportShelfPage:async(limit,offset)=>{calls.push(['reports',{limit,offset}]);return {items:[{id:'r1',type:'career',title:'岗位报告',snapshot:{},createdAt:'2026-10-22'}],total:31}},
    getReportDetail:async id=>({id,type:'career',title:'真实报告',snapshot:{},createdAt:'2026-10-22'}),...overrides}
  globalThis.__shelfTest=deps
  const mod=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}#${Math.random()}`)
  const router={push:async({query})=>{route.query=query},replace:async({query})=>{route.query=query}}
  const ui=mod.useReportBookshelves(()=>account.id,route,router,true)
  await settle()
  return {ui,account,route,calls,cleanup,mod,router}
}

test('both shelves retain real provenance and null dimensions',async()=>{
  const f=await fixture()
  assert.equal(f.ui.shelves.portrait.books[0].source,'portrait_snapshot')
  assert.equal(f.ui.shelves.career.books[0].source,'career_report')
  assert.equal(f.ui.shelves.portrait.books[0].snapshot.dimensions.D1,null)
  assert.equal(f.ui.shelves.portrait.total,31)
  assert.equal(f.ui.shelves.portrait.books[0].portraitVersion,'current')
  assert.equal(f.ui.shelves.career.books[0].portraitVersion,undefined)
})

test('version presentation follows server is_current, never equal dates or list order',async()=>{
  const f=await fixture({getStudentPortraitSnapshots:async()=>({success:true,data:{items:[{...snapshot(),is_current:false},snapshot('ps_'+'2'.repeat(32))],total:2}})})
  assert.deepEqual(f.ui.shelves.portrait.books.map(b=>b.portraitVersion),['historical','current'])
})
test('a failed shelf does not clear the other shelf or masquerade as zero',async()=>{
  const f=await fixture({getReportShelfPage:async()=>{throw Error('503')}})
  assert.match(f.ui.shelves.career.error,/重试/)
  assert.equal(f.ui.shelves.portrait.books.length,1)
})
test('selection uses distinct detail endpoints and rejects ambiguous links before IO',async()=>{
  const seen=[]
  const f=await fixture({getReportDetail:async id=>{seen.push(id); return {id,title:'report',snapshot:{},type:'career',createdAt:''}}})
  await f.ui.open(f.ui.shelves.portrait.books[0]); await settle()
  assert.equal(f.ui.detail.book.source,'portrait_snapshot')
  assert.deepEqual(seen,[])
  f.route.query={report_id:'r1',snapshot_id:snapshot().snapshot_id}; await settle()
  assert.match(f.ui.detail.error,/链接无效/)
  assert.equal(f.ui.detail.book,null); assert.deepEqual(seen,[])
})
test('late details cannot reopen a closed book or overwrite the next book',async()=>{
  const held=gate()
  const f=await fixture({getReportDetail:id=>id==='slow'?held.promise:Promise.resolve({id,type:'career',title:'next',snapshot:{},createdAt:''})})
  f.route.query={report_id:'slow'}; await settle()
  f.route.query={report_id:'next'}; await settle()
  held.release({id:'slow',type:'career',title:'old',snapshot:{},createdAt:''}); await settle()
  assert.equal(f.ui.detail.book.id,'next')
  await f.ui.close(); await settle()
  assert.equal(f.ui.detail.book,null); assert.equal(f.ui.overlayBook.value,null)
})
test('logout revokes all pending list and detail responses',async()=>{
  const held=gate(), detail=gate()
  const f=await fixture({getReportShelfPage:()=>held.promise,getReportDetail:()=>detail.promise})
  f.route.query={report_id:'r1'}; await settle()
  f.account.id=''; await settle()
  held.release({items:[{id:'private'}],total:1}); detail.release({id:'r1',title:'private',snapshot:{}}); await settle()
  assert.equal(f.ui.shelves.career.books.length,0)
  assert.equal(f.ui.shelves.portrait.books.length,0)
  assert.equal(f.ui.detail.book,null); assert.equal(f.ui.detail.loading,false)
})
test('viewport capacity drives server pages, not silent slicing',async()=>{
  const f=await fixture()
  f.ui.capacity('career',9); await settle()
  f.ui.paginate('career',2); await settle()
  assert.deepEqual(f.calls.at(-1),['reports',{limit:9,offset:9}])
})
test('unmount revokes a pending request',async()=>{
  const held=gate()
  const f=await fixture({getReportShelfPage:()=>held.promise})
  f.cleanup.forEach(fn=>fn()); held.release({items:[{id:'late'}],total:1}); await settle()
  assert.equal(f.ui.shelves.career.books.length,0)
})

test('server reader never feeds the demo defaults; mascot has explicit guide mode',()=>{
  const reader=readFileSync(new URL('../src/components/bookshelf/BookOpenOverlay.vue',import.meta.url),'utf8')
  assert.match(reader,/if \(props.serverMode \|\| !props.record/)
  assert.match(reader,/<slot v-if="serverMode"/)
  assert.match(reader,/v-if="!serverMode" class="icon-btn icon-btn--danger"/)
  const flower=readFileSync(new URL('../src/components/reports/ServerPortraitDetail.vue',import.meta.url),'utf8')
  assert.match(flower,/axis: item.label, value: item.value/)
  const page=readFileSync(new URL('../src/views/student/MyReports.vue',import.meta.url),'utf8')
  assert.doesNotMatch(page,/server-report-list/)
  assert.match(page,/report-guide="isHttpMode"/)
  const layout=readFileSync(new URL('../src/layouts/AppLayout.vue',import.meta.url),'utf8')
  assert.match(layout,/route.name === 'student-my-reports' \? route.path : route.fullPath/)
})

test('report follow-up titles and tooltips omit complete or truncated routing metadata',()=>{
  const source=readFileSync(new URL('../src/views/student/AIAssistant.vue',import.meta.url),'utf8')
  const start=source.indexOf('function displayUserText(')
  const fn=source.slice(start,source.indexOf('\n}',start)+2).replace('content: string','content').replace('): string',')')
  const clean=new Function(`${fn}; return displayUserText`)()
  assert.equal(clean('先补什么？ [业务资料引用:career://me/reports/report_123]'),'先补什么？')
  assert.equal(clean('先补什么？ [业务资料引用:career://me/reports/report_12…'),'先补什么？')
  assert.equal(clean('我想了解报告内容'),'我想了解报告内容')
  assert.match(source,/label: displayUserText\(conversation.title/)
})
