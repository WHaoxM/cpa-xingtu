import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'

// Run the actual SFC setup/async handlers. HTTP substitutes are unit-test
// inputs only; the separate browser replay verifies real routes and storage.
const { descriptor } = parse(readFileSync(new URL('../src/components/reports/JobComparison.vue', import.meta.url), 'utf8'))
const compiled = ts.transpileModule(compileScript(descriptor, { id: 'comparison-contract' }).content, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, names, source) => {
  if (source === 'vue') return `import {${names}} from ${JSON.stringify(import.meta.resolve('vue'))};`
  return `const {${names.replace(/\s+as\s+/g, ': ')}} = globalThis.__comparisonContract;`
})
const job = { job_portrait_id: 'public-job', publication_version: 'v1', content_sha256: 'job-digest', publication_status: 'published' }
function workbench(confirmation, eligible = true) {
  return { source_confirmation_task_id: confirmation, run: { state: 'settled' },
    based_on_previous_upload: false, portrait: { scoring_eligible: eligible } }
}
async function fixture() {
  let current = workbench('confirmed-one')
  let explain = async () => ({ keyword_coverage: { matched: ['Python'], missing: ['SQL'] } })
  let generated = 0
  globalThis.__comparisonContract = {
    useRouter: () => ({ push: async () => {} }), useUserStore: () => ({ currentUser: { id: 'owner' } }),
    ApiError: class extends Error { constructor(message, status = 0) { super(message); this.status = status } },
    getJobCatalogDetail: async () => job,
    getStudentWorkbenchState: async () => ({ success: true, data: current }),
    runJobComparison: async () => ({ success: false, status: 'partial', data: {
      result: { match_id: '1', task_id: 'match-one' } } }),
    getMatchResult: async () => ({ match_id: '1', student_id: 'owner', job_portrait_id: job.job_portrait_id,
      source_match_task_id: 'match-one', sources: { source_confirmation_task_id: 'confirmed-one',
        source_publication_version: 'v1', source_publication_sha256: 'job-digest' } }),
    getMatchExplain: (...args) => explain(...args),
    generateComparisonReport: async () => { generated++; return { data: {} } },
    getReportDetail: async () => null, getReportList: async () => [],
  }
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}#${Math.random()}`)
  const ui = module.default.setup({ job }, { expose() {} })
  await ui.prepare()
  return { ui, changeSource: (eligible = false) => { current = workbench('confirmed-two', eligible) },
    holdExplanation: () => {
      let release, entered
      const waiting = new Promise(resolve => { entered = resolve })
      const held = new Promise(resolve => { release = resolve })
      explain = async () => { entered(); await held; return {} }
      return { waiting, release }
    }, generated: () => generated }
}

test('a delayed V1 explanation cannot restore a score after V2 confirmation', async () => {
  const f = await fixture()
  const gate = f.holdExplanation()
  const pending = f.ui.compare()
  await gate.waiting
  f.changeSource()
  gate.release()
  await pending
  assert.equal(f.ui.result.value, null)
  assert.ok(f.ui.message.value)
  assert.equal(f.generated(), 0)
})

test('unchanged current evidence still produces a readable partial comparison', async () => {
  const f = await fixture()
  await f.ui.compare()
  assert.equal(f.ui.result.value.match_id, '1')
  assert.deepEqual(f.ui.explanation.value.keyword_coverage.missing, ['SQL'])
})

test('late V1 is rejected even when the new V2 portrait is already eligible', async () => {
  const f = await fixture()
  const gate = f.holdExplanation()
  const pending = f.ui.compare()
  await gate.waiting
  f.changeSource(true)
  gate.release()
  await pending
  assert.equal(f.ui.result.value, null)
  assert.match(f.ui.message.value, /版本或发布状态已变化/)
})

test('an already open V1 comparison cannot generate while V2 portrait is unavailable', async () => {
  const f = await fixture()
  await f.ui.compare()
  f.changeSource()
  await f.ui.generate()
  assert.equal(f.ui.result.value, null)
  assert.equal(f.generated(), 0)
})
