import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'
import { reactive, nextTick } from 'vue'

const { descriptor } = parse(readFileSync(new URL('../src/components/learning/HttpCourseLibrary.vue', import.meta.url), 'utf8'))
const code = ts.transpileModule(compileScript(descriptor, {id: 'course-contract'}).content, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
}).outputText.replace(/import D3Treemap from [^;]+;/, 'const D3Treemap = {};').replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, names, src) =>
  src === 'vue' ? `import {${names}} from ${JSON.stringify(import.meta.resolve('vue'))};` : `const {${names}} = globalThis.__courseTest;`)
async function fixture() {
  const user = reactive({currentUser: {id: 'alice'}}), route = reactive({query: {}})
  let read = async () => ({success: true, data: []}), writes = 0, failure = null
  let catalog = async () => ({success:true,data:{courses:[],total:0,categories:[],category_options:[],catalog_summary:{total:0,scope:'all_courses'}}})
  let detail = async id => ({success: true, data: {course_id: id, title: 'SQL', chapters: []}})
  globalThis.__courseTest = {
    useUserStore: () => user, useRoute: () => route, useRouter: () => ({replace: async ({query}) => {route.query = query}}),
    readCourseCatalog: (...args) => catalog(...args),
    readLearningCourse: id => detail(id),
    readChapterRecords: (...args) => read(...args),
    saveProgress: async body => {writes++; assert.equal(body.user_id, undefined); if (failure) throw failure; return {success: true}},
  }
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`)
  const ui = module.default.setup({}, {expose() {}})
  await new Promise(r => setImmediate(r))
  return {ui, user, route, catalog: fn => {catalog = fn}, read: fn => {read = fn}, detail: fn => {detail = fn}, fail: (error = Error('lost response')) => {failure = error}, writes: () => writes}
}

test('missing full-catalog metadata is an error, never an invented zero chart', async () => {
  const f = await fixture()
  f.catalog(async()=>({success:true,data:{courses:[{course_id:'x'}],total:100,categories:[]}}))
  await f.ui.loadList()
  assert.match(f.ui.listError.value,/目录结构暂不可用/)
  assert.deepEqual(f.ui.courses.value,[])
})
test('material links allow only absolute HTTP(S), never credentials or scripts', async () => {
  const {ui} = await fixture()
  for (const url of ['javascript:alert(1)', 'data:text/html,bad', '/relative', '//host/a', 'https://user:password@example.invalid/']) assert.equal(ui.material(url), '')
  assert.equal(ui.material('https://example.com/lesson'), 'https://example.com/lesson')
})

test('course covers never turn random seed imagery into real course evidence', async () => {
  const {ui} = await fixture()
  assert.equal(ui.cover({course_id:'x',thumbnail_url:'https://picsum.photos/400/300'}), '')
  assert.equal(ui.cover({course_id:'x',thumbnail_url:'javascript:alert(1)'}), '')
  assert.equal(ui.cover({course_id:'x',thumbnail_url:'https://example.org/cover.png'}), 'https://example.org/cover.png')
  ui.failedCovers.value.add('x')
  assert.equal(ui.cover({course_id:'x',thumbnail_url:'https://example.org/cover.png'}), '')
})

test('observed malformed catalog text is marked unreviewed, never reencoded', async () => {
  const {ui} = await fixture()
  assert.equal(ui.catalogText('Vue å‰\u008dç«¯', '课程名称待整理'),'课程名称待整理')
  assert.equal(ui.catalogText('Python äººå·¥æ™ºèƒ½','课程名称待整理'),'课程名称待整理')
  assert.equal(ui.catalogText('Français'),'Français')
  assert.equal(ui.catalogText('Python 入门'),'Python 入门')
})
test('network errors use student language, never developer host diagnostics', async () => {
  const {ui} = await fixture()
  const text = ui.message(Object.assign(Error('启动后端 http://127.0.0.1:5001'), {kind: 'network'}))
  assert.doesNotMatch(text, /https?:|127\.0\.0\.1|启动后端/)
  assert.match(text, /重新读取/)
})
test('partial historical records remain partial and reads do not write', async () => {
  const f = await fixture()
  f.read(async () => ({success: true, data: [{user_id: 'alice', course_id: 'sql', chapter_id: '1', progress: 40, completed: 0}]}))
  await f.ui.loadRecords()
  assert.equal(f.ui.marked({id: 1, course_id: 'sql'}), false)
  assert.equal(f.ui.record({id: 1, course_id: 'sql'}).progress, 40)
  assert.equal(f.writes(), 0)
})
test('late progress from a previous owner cannot restore records after switch', async () => {
  const f = await fixture()
  let release
  f.read(id => id === 'alice' ? new Promise(r => {release = r}) : Promise.resolve({success: true, data: []}))
  const pending = f.ui.loadRecords()
  f.user.currentUser = {id: 'bob'}
  await nextTick()
  release({success: true, data: [{user_id: 'alice', course_id: 'sql', chapter_id: 1, progress: 100, completed: 1}]})
  await pending
  assert.deepEqual(f.ui.records.value, [])
})
test('failed read is unknown, not unlearned', async () => {
  const f = await fixture()
  f.ui.saveMessage.value = '已从服务端核对本人记录。'
  f.read(async () => {throw Error('unavailable')})
  await f.ui.loadRecords()
  assert.equal(f.ui.recordsReady.value, false)
  assert.match(f.ui.progressError.value, /unavailable/)
  assert.equal(f.ui.saveMessage.value, '')
})
test('lost save response reconciles once without repeating write', async () => {
  const f = await fixture(), chapter = {id: 1, course_id: 'sql'}
  f.route.query = {course_id: 'sql'}
  await new Promise(r => setImmediate(r))
  f.ui.course.value = {course_id: 'sql', chapters: [chapter]}
  f.ui.recordsReady.value = true
  f.fail()
  f.read(async () => ({success: true, data: [{user_id: 'alice', course_id: 'sql', chapter_id: 1, progress: 100, completed: 1}]}))
  await f.ui.toggle(chapter)
  assert.equal(f.writes(), 1)
  assert.equal(f.ui.marked(chapter), true)
  assert.match(f.ui.saveMessage.value, /重新读取/)
})

test('return point is located after chapters are rendered, not while hidden by loading', async () => {
  const f = await fixture(), located = []
  f.read(async () => ({success: true, data: [{user_id: 'alice', course_id: 'sql', chapter_id: 1, progress: 100, completed: 1}]}))
  f.detail(async () => ({success: true, data: {course_id: 'sql', chapters: [{id: 1, course_id: 'sql'}, {id: 2, course_id: 'sql'}]}}))
  const original = globalThis.document
  globalThis.document = {getElementById: id => {
    assert.equal(f.ui.detailLoading.value, false)
    located.push(id)
    return {focus() {}, scrollIntoView() {}}
  }}
  try {
    f.route.query = {course_id: 'sql'}
    await new Promise(r => setImmediate(r))
    assert.ok(located.includes('learning-chapter-2'))
  } finally { globalThis.document = original }
})

test('deleted course/chapter rejection clears cached current details immediately', async () => {
  const f = await fixture(), chapter = {id: 1, course_id: 'sql'}
  f.route.query = {course_id: 'sql'}
  await new Promise(r => setImmediate(r))
  f.ui.course.value = {course_id: 'sql', chapters: [chapter]}
  f.ui.recordsReady.value = true
  f.fail(Object.assign(Error('课程或章节不存在'), {status: 404}))
  await f.ui.toggle(chapter)
  assert.equal(f.ui.course.value, null)
  assert.match(f.ui.detailError.value, /课程|章节/)
  assert.equal(f.writes(), 1)
})
