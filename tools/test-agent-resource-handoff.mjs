import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = resolve(root, 'src/composables/agentResourceHandoffContract.ts')
const source = await readFile(contractPath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const contractUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
const contract = await import(contractUrl)

async function loadHandoff(mode) {
  const handoffPath = resolve(root, 'src/composables/useAgentResourceHandoff.ts')
  const handoffSource = (await readFile(handoffPath, 'utf8'))
    .replace("import { getApiMode } from '@/api/config'", `const getApiMode = () => '${mode}'`)
    .replace("from './agentResourceHandoffContract'", `from '${contractUrl}'`)
  assert.ok(!handoffSource.includes("from '@/api/config'"))
  const js = ts.transpileModule(handoffSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

test('only fresh HTTP report rows with eligible status permit a collection CTA', () => {
  const completed = [{ id: 'report_owned_1', snapshot: { status: 'completed' } }]
  const partial = [{ id: 'report_owned_2', snapshot: { status: 'partial' } }]
  assert.equal(contract.hasServerReportCollection('http', completed), true)
  assert.equal(contract.hasServerReportCollection('http', partial), true)
  assert.equal(contract.hasServerReportCollection('mock', completed), false)
  assert.equal(contract.hasServerReportCollection('http', []), false)
  assert.equal(contract.hasServerReportCollection('http', [{ id: 'report_pending', snapshot: { status: 'pending' } }]), false)
  assert.equal(contract.hasServerReportCollection('http', [{ id: '../foreign', snapshot: { status: 'completed' } }]), false)
})

test('saved-job collection requires a nonempty HTTP row and is never a recommendation', () => {
  const saved = [{ id: 'job_saved_1' }]
  assert.equal(contract.hasServerSavedJobCollection('http', saved), true)
  assert.equal(contract.hasServerSavedJobCollection('mock', saved), false)
  assert.equal(contract.hasServerSavedJobCollection('http', []), false)
  assert.equal(contract.hasServerSavedJobCollection('http', [{ id: '   ' }]), false)
})

test('Agent career handoff sends only resource_uri, not browser scores or task IDs', () => {
  assert.deepEqual(
    contract.buildAgentResourceQuery('http', { kind: 'career_resource', uri: 'career://me/reports' }),
    { resource_uri: 'career://me/reports' },
  )
  assert.deepEqual(
    contract.buildAgentResourceQuery('http', { kind: 'career_resource', uri: 'career://me/saved-jobs' }),
    { resource_uri: 'career://me/saved-jobs' },
  )
  assert.equal(contract.buildAgentResourceQuery('mock', { kind: 'career_resource', uri: 'career://me/reports' }), null)
  assert.equal(contract.buildAgentResourceQuery('http', { kind: 'career_resource', uri: 'career://me/reports/../other' }), null)
})

test('actual handoff helper routes an HTTP resource and rejects mock navigation', async () => {
  const httpHandoff = await loadHandoff('http')
  const mockHandoff = await loadHandoff('mock')
  const pushed = []
  const router = { push: route => { pushed.push(route); return Promise.resolve() } }
  assert.equal(httpHandoff.openAgentWithResource(router, {
    kind: 'career_resource', uri: 'career://me/saved-jobs',
  }), true)
  assert.deepEqual(pushed, [{ name: 'student-ai-assistant', query: { resource_uri: 'career://me/saved-jobs' } }])
  assert.equal(mockHandoff.openAgentWithResource(router, {
    kind: 'career_resource', uri: 'career://me/saved-jobs',
  }), false)
  assert.equal(pushed.length, 1)
})

test('the three live pages bind guarded CTAs to the shared handoff', async () => {
  for (const [page, guard, label] of [
    ['MyReports', 'hasServerReports', '让 Agent 查看我的报告'],
    ['CareerReport', 'hasServerReports', '与 Agent 讨论已有报告'],
    ['Favorites', 'hasServerSavedJobs', '与 Agent 讨论已收藏岗位'],
  ]) {
    const path = resolve(root, `src/views/student/${page}.vue`)
    const sfc = parse(await readFile(path, 'utf8'), { filename: path }).descriptor
    assert.match(sfc.template.content, new RegExp(`v-if="[^"]*${guard}`))
    assert.ok(sfc.template.content.includes(label), `${page} CTA label missing`)
    assert.match(sfc.scriptSetup.content, /openAgentWithResource\(/)
  }
})
