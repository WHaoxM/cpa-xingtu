import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parse, compileScript } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import { reactive, ref, nextTick } from 'vue'

const source = readFileSync(new URL('../src/views/student/ResumeBuilder.vue', import.meta.url), 'utf8')
const script = compileScript(parse(source).descriptor, { id: 'draft-contract' }).content
const names = []
const injected = script.replace(/^import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?\s*$/gm, (line, spec, path) => {
  if (path === 'vue') return line.replace(/['"]vue['"]/, JSON.stringify(import.meta.resolve('vue')))
  if (spec.startsWith('{')) {
    names.push(...spec.slice(1, -1).split(',').map(s => s.trim()).filter(s => s && !s.startsWith('type ')))
  } else names.push(spec)
  return ''
})
const compiled = (await transform(`const {${names.join(',')}} = globalThis.__draftContract;\n${injected}`, { loader:'ts', format:'esm' })).code
const blank = () => ({name:'',phone:'',email:'',school:'',major:'',grade:'',targetRole:'',gpa:'',summary:'',selfEval:'',sourceText:'',skills:[],projects:[],workExps:[],educations:[],honors:[]})

test('applied suggestions collapse into a recoverable draft-only summary', async () => {
  const f = await fixture()
  const preview = {form:{...blank(),name:'建议姓名'},status:'ready',warnings:[]}
  f.ui.fillPreview.value = preview
  f.ui.showImport.value = true
  await f.ui.applyFill(false)
  assert.equal(f.ui.showImport.value, false)
  assert.equal(f.ui.fillApplied.value, true)
  assert.equal(f.ui.fillPreview.value.form.name, '建议姓名')
  assert.equal(f.ui.form.value.name, '建议姓名')
  f.user.currentUser = {id:'another'}
  await nextTick()
  assert.equal(f.ui.fillApplied.value, false)
  assert.equal(f.ui.fillPreview.value, null)
})
function gate() { let release; return {promise:new Promise(r => {release=r}), release: v => release(v)} }
async function fixture() {
  const user = reactive({currentUser:{id:'owner'}})
  const messages = [], writes = []
  let revision = 1, record = blank(), heldPreview, heldSave, failSave = false, conflict = false
  globalThis.__draftContract = {
    useRoute: () => reactive({query:{}}), useRouter: () => ({push:async () => {}}), useUserStore: () => user,
    useResumeStore: () => ({setDraftText() {}}), onBeforeRouteLeave() {}, Icon:{}, TiptapEditor:{},
    getApiMode: () => 'http', DEMO_STUDENT_ID:'demo', parseResumeText: () => {throw Error('legacy write route used')},
    useAgentArtifactHandoff: () => ({artifact:ref(null), ready:ref(false), sessionId:ref(''), loading:ref(false)}), commitMockArtifactHandoff() {},
    generateHTML:v=>v, generateJSON:v=>v, StarterKit:{}, Underline:{},
    ElMessage:{error:m=>messages.push(m), warning:m=>messages.push(m), success:m=>messages.push(m)},
    ElMessageBox:{confirm:async()=>{}},
    ApiError:class extends Error {constructor(message,status){super(message);this.status=status}},
    getResumeDraft:async()=>({success:true,data:{form:structuredClone(record),revision,theme:'#F4514B',text:'有效的草稿文字内容，供学生继续核对。'}}),
    saveResumeDraft:async(form,theme,expected)=>{
      writes.push({form:structuredClone(form),expected})
      if(heldSave) await heldSave.promise
      if(failSave) throw Error('保存不可用')
      if(conflict) throw new globalThis.__draftContract.ApiError('版本冲突',409)
      record=structuredClone(form); revision++
      return {success:true,data:{revision,form:structuredClone(record),theme}}
    },
    previewResumeDraft:async()=>heldPreview ? heldPreview.promise : ({success:true,data:{status:'ready',form:{...blank(),name:'建议姓名',skills:['Python']},warnings:[]}}),
  }
  const mod = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}#${Math.random()}`)
  const ui = mod.default.setup({}, {expose(){}})
  await ui.loadDraft()
  return {ui,user,messages,writes,holdPreview:()=>heldPreview=gate(),holdSave:()=>heldSave=gate(),
    failSave:()=>failSave=true,conflict:()=>conflict=true,close:async()=>{user.currentUser=undefined;await nextTick()}}
}
test('smart fill waits for approval and only fills blank fields by default', async()=>{
  const f=await fixture(); f.ui.form.value.name='本人填写'
  f.ui.importText.value='本人粘贴的一段项目经历说明，不使用自动生成的示例内容。'
  await f.ui.importFromParse()
  assert.equal(f.ui.form.value.skills.length,0)
  await f.ui.applyFill(false)
  assert.equal(f.ui.form.value.name,'本人填写')
  assert.deepEqual(f.ui.form.value.skills,['Python'])
  await f.ui.flushDraft(); await f.close()
})
test('late fill cannot overwrite edits or a switched account', async()=>{
  const f=await fixture(); f.ui.importText.value='本人粘贴的一段项目经历说明，不使用自动生成的示例内容。'
  const held=f.holdPreview(), pending=f.ui.importFromParse()
  f.ui.form.value.name='读取中继续编辑'
  held.release({success:true,data:{status:'ready',form:{...blank(),name:'旧建议'},warnings:[]}})
  await pending
  assert.equal(f.ui.fillPreview.value,null)
  assert.equal(f.ui.form.value.name,'读取中继续编辑')
  assert.match(f.ui.previewError.value,/已修改/)
  await f.ui.flushDraft(); await f.close()
})
test('serialized saves retain edits made while a save is pending', async()=>{
  const f=await fixture(), held=f.holdSave()
  f.ui.form.value.name='第一版'
  const pending=f.ui.flushDraft()
  f.ui.form.value.name='第二版'
  held.release()
  assert.equal(await pending,true)
  assert.equal(f.writes.length,2)
  assert.equal(f.writes[1].expected,2)
  assert.equal(f.writes[1].form.name,'第二版')
  await f.close()
})
test('account exit discards late preview and clears personal input',async()=>{
  const f=await fixture(); f.ui.importText.value='原账号粘贴的项目经历，不能被另一账号看到。'
  const held=f.holdPreview(), pending=f.ui.importFromParse()
  await f.close()
  held.release({success:true,data:{status:'ready',form:{...blank(),name:'原账号姓名'},warnings:[]}})
  await pending
  assert.equal(f.ui.fillPreview.value,null)
  assert.equal(f.ui.form.value.name,'')
  assert.equal(f.ui.form.value.sourceText,'')
  assert.equal(f.ui.importing.value,false)
})
test('preview failure preserves both source text and existing form',async()=>{
  const f=await fixture(); f.ui.form.value.name='本人姓名'
  f.ui.importText.value='读取失败时，这段学生自己粘贴的材料也不能丢失。'
  const held=f.holdPreview(), pending=f.ui.importFromParse()
  held.release(Promise.reject(Error('模型暂不可用')))
  await pending
  assert.equal(f.ui.fillPreview.value,null)
  assert.equal(f.ui.form.value.name,'本人姓名')
  assert.match(f.ui.importText.value,/不能丢失/)
  assert.match(f.ui.previewError.value,/不可用/)
  await f.close()
})
test('empty untouched draft gives a visible submission hint',async()=>{
  const f=await fixture(); f.ui.draftRevision.value=0
  await f.ui.useResume()
  assert.match(f.ui.submitHint.value,/请先填写/)
  assert.equal(f.writes.length,0)
  await f.close()
})
test('save failure and conflict keep input and never claim saved',async()=>{
  const f=await fixture(); f.failSave(); f.ui.form.value.name='不能丢失'
  assert.equal(await f.ui.flushDraft(),false)
  assert.equal(f.ui.saveState.value,'failed')
  assert.equal(f.ui.form.value.name,'不能丢失')
  await f.close()
  const c=await fixture(); c.conflict(); c.ui.form.value.name='本页输入'
  assert.equal(await c.ui.flushDraft(),false)
  assert.equal(c.ui.saveState.value,'conflict')
  assert.equal(await c.ui.flushDraft(),false)
  assert.equal(c.writes.length,1)
  await c.close()
})
