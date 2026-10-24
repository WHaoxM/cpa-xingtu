import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {parse,compileScript} from '@vue/compiler-sfc'
import {transform} from 'esbuild'
import {reactive,nextTick} from 'vue'

const source=readFileSync(new URL('../src/components/career/ResumeImprovementPanel.vue',import.meta.url),'utf8')
const script=compileScript(parse(source).descriptor,{id:'improvement-contract'}).content
const bindings=[]
const stripped=script.replace(/^import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?\s*$/gm,(line,spec,path)=>{
  if(path==='vue')return line.replace(/['"]vue['"]/,JSON.stringify(import.meta.resolve('vue')))
  if(spec.startsWith('type '))return ''
  if(spec.startsWith('{'))bindings.push(...spec.slice(1,-1).split(',').map(s=>s.trim()).filter(s=>s&&!s.startsWith('type ')))
  else bindings.push(spec)
  return ''
})
const code=(await transform(`const {${bindings.join(',')}}=globalThis.__improvements;\n${stripped}`,{loader:'ts',format:'esm'})).code
const advice={id:'a1',target:'projects',title:'课程项目',source_text:'本人原文',problem:'表述笼统',questions:['本人负责什么？'],outline:'[请填写：本人负责的环节]'}
const report={report_id:'r1',improvements_status:'ready',improvements:[advice]}
function gate(){let release;return {promise:new Promise(r=>release=r),release:v=>release(v)}}
async function fixture(){
 const user=reactive({currentUser:{id:'owner'}}), props=reactive({report,loading:false}),routes=[],writes=[]
 let held, saved=false, rejected=false
 globalThis.__improvements={useUserStore:()=>user,useRouter:()=>({push:async v=>routes.push(v)}),
  getResumeDraft:async()=>({success:true,data:{revision:saved?2:1,guidance:saved?{advice,report_id:'r1',status:'current'}:null}}),
  previewDraftFromReport:async(...args)=>held?held.promise:{success:true,data:{draft_revision:1,has_existing_draft:true,status:'ready'}},
  startDraftFromReport:async(...args)=>{writes.push(args);if(rejected)throw Error('来源变化');saved=true;throw Error('提交响应丢失')},
 }
 const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`)
 const ui=mod.default.setup(props,{expose(){},emit(){}})
 return {ui,user,props,routes,writes,hold:()=>held=gate(),reject:()=>rejected=true}
}
test('preparation is read-only and does not silently initialize a draft',async()=>{
 const f=await fixture();await f.ui.prepare(advice)
 assert.equal(f.ui.preview.value.draft_revision,1);assert.deepEqual(f.writes,[]);assert.deepEqual(f.routes,[])
})
test('account change discards late conversion and advisory context',async()=>{
 const f=await fixture(),held=f.hold(),pending=f.ui.prepare(advice)
 await nextTick();f.user.currentUser={id:'other'};await nextTick()
 held.release({success:true,data:{draft_revision:1}});await pending
 assert.equal(f.ui.preview.value,null);assert.equal(f.ui.selected.value,null);assert.deepEqual(f.writes,[])
})
test('lost commit response is read back instead of automatically resubmitted',async()=>{
 const f=await fixture();await f.ui.prepare(advice);await f.ui.begin('continue')
 assert.equal(f.writes.length,1);assert.equal(f.writes[0][3],'continue')
 assert.equal(f.routes.length,1);assert.equal(f.routes[0].name,'student-resume-builder')
})
test('rejected source never navigates to a fake successful draft',async()=>{
 const f=await fixture();await f.ui.prepare(advice);f.reject();await f.ui.begin('replace')
 assert.equal(f.routes.length,0);assert.match(f.ui.error.value,/来源变化/)
})
test('no synthesized score, HTML advice injection or implicit applying controls',()=>{
 assert.ok(!source.includes('v-html'));assert.ok(!source.includes('applyFill'))
 assert.ok(source.includes('我确认用预览内容替换'));assert.ok(source.includes('不会套入'))
})
