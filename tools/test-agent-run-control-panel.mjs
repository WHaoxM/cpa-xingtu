import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import * as vue from 'vue'

const filename = new URL('../src/components/agent/AgentRunControlPanel.vue', import.meta.url)
const source = readFileSync(filename, 'utf8')
const { descriptor, errors } = parse(source, { filename: filename.pathname })
assert.deepEqual(errors, [])
const modelSource = readFileSync(new URL('../src/components/agent/agentRunControlModel.ts', import.meta.url), 'utf8')
const modelCode = (await transform(modelSource, { loader: 'ts', format: 'esm' })).code
const model = await import(`data:text/javascript;base64,${Buffer.from(modelCode).toString('base64')}#${Math.random()}`)
globalThis.__agentRunTaskModel = model
const compiled = compileScript(descriptor, { id: 'agent-run-control-panel', inlineTemplate: true })
let code = (await transform(compiled.content, { loader: 'ts', format: 'esm' })).code
code = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]vue['"];?/g,
  (_match, names) => `const {${names.replace(/\s+as\s+/g, ':')}}=globalThis.__agentRunPanelTest;`)
code = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/agentRunControlModel['"];?/g,
  (_match, names) => `const {${names.replace(/\s+as\s+/g, ':')}}=globalThis.__agentRunTaskModel;`)
globalThis.__agentRunPanelTest = vue
globalThis.document = { activeElement: null }
const component = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`)).default

function makeRenderer() {
  const node = (type, text = '') => ({
    type, tagName: type.toUpperCase(), text, value: '', props: {}, children: [], parent: null, listeners: {},
    addEventListener(name, handler) { this.listeners[name] = handler },
    removeEventListener(name) { delete this.listeners[name] },
  })
  const renderer = vue.createRenderer({
    createElement: type => node(type),
    createText: text => node('#text', text),
    createComment: text => node('#comment', text),
    setText: (target, text) => { target.text = text },
    setElementText: (target, text) => { target.text = text; target.children = [] },
    patchProp: (target, key, _previous, value) => { target.props[key] = value },
    insert: (child, parent, anchor = null) => {
      child.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      if (index < 0) parent.children.push(child)
      else parent.children.splice(index, 0, child)
    },
    remove: child => {
      const siblings = child.parent?.children || []
      const index = siblings.indexOf(child)
      if (index >= 0) siblings.splice(index, 1)
      child.parent = null
    },
    parentNode: target => target.parent,
    nextSibling: target => {
      const siblings = target.parent?.children || []
      return siblings[siblings.indexOf(target) + 1] || null
    },
  })
  return { renderer, root: node('root') }
}

function textOf(target) {
  return target.text + target.children.map(textOf).join(' ')
}

function find(target, predicate) {
  if (predicate(target)) return target
  for (const child of target.children) {
    const found = find(child, predicate)
    if (found) return found
  }
  return null
}

const run = (overrides = {}) => ({
  run_id: 'run_0123456789abcdef0123456789abcdef',
  status: 'running',
  current_contract_revision: 4,
  current_plan_version: 2,
  pause_requested: false,
  cancel_requested: false,
  task_contract: {
    revision: 4,
    goal: '制定后端学习计划',
    deliverables: ['八周计划'],
    constraints: ['每周投入四小时'],
    acceptance_criteria: ['覆盖八周'],
  },
  current_plan: {
    plan_version: 2,
    goal_summary: '基于资料形成八周计划',
    plan_sha256: 'f'.repeat(64),
    metadata: { task_contract_revision: 4 },
    steps: [{ step_index: 1, role: 'qa', goal: '读取授权资料', status: 'running' }],
  },
  saved_artifacts: [],
  final_result: null,
  ...overrides,
})

async function mount(props) {
  const { renderer, root } = makeRenderer()
  const events = []
  const app = renderer.createApp(component, {
    ...props,
    onControl: request => events.push(['control', request]),
    onResume: request => events.push(['resume', request]),
    onSave: request => events.push(['save', request]),
    onRefresh: () => events.push(['refresh']),
    onReadSavedPlan: request => events.push(['read-saved-plan', request]),
  })
  app.mount(root)
  await vue.nextTick()
  return { root, events, app }
}

test('renders only persisted task and plan data; no run means no fabricated plan card', async () => {
  const empty = await mount({ run: null })
  assert.equal(find(empty.root, item => item.props['aria-label'] === 'Agent 任务进度与控制'), null)
  empty.app.unmount()

  const ready = await mount({ run: run() })
  const rendered = textOf(ready.root)
  assert.match(rendered, /当前目标/)
  assert.match(rendered, /每周投入四小时/)
  assert.match(rendered, /计划第 2 版/)
  assert.match(rendered, /读取授权资料/)
  ready.app.unmount()
})

test('pause request is bound to the displayed task id and contract revision', async () => {
  const view = await mount({ run: run() })
  const button = find(view.root, item => item.type === 'button' && textOf(item).includes('暂停任务'))
  assert.ok(button)
  button.props.onClick()
  assert.deepEqual(view.events, [['control', {
    intent: 'pause', task_id: run().run_id, expected_revision: 4,
  }]])
  view.app.unmount()
})

test('cancel and refresh are explicit parent-store events', async () => {
  const snapshot = run()
  const view = await mount({ run: snapshot })
  find(view.root, item => item.type === 'button' && textOf(item).includes('取消任务')).props.onClick()
  find(view.root, item => item.type === 'button' && textOf(item).includes('重新读取')).props.onClick()
  assert.deepEqual(view.events, [
    ['control', { intent: 'cancel', task_id: snapshot.run_id, expected_revision: 4 }],
    ['refresh'],
  ])
  view.app.unmount()
})

test('goal edit emits a revision-bound patch without changing the displayed snapshot locally', async () => {
  const snapshot = run()
  const view = await mount({ run: snapshot })
  find(view.root, item => item.type === 'button' && textOf(item).includes('修改目标')).props.onClick()
  await vue.nextTick()
  const input = find(view.root, item => item.type === 'textarea' && item.props.maxlength === '2000')
  assert.ok(input)
  input.value = '每周六小时，完成八周后端学习'
  input.listeners.input({ target: input })
  await vue.nextTick()
  const form = find(view.root, item => item.type === 'form' && textOf(item).includes('新目标'))
  form.props.onSubmit({ preventDefault() {} })
  assert.deepEqual(view.events[0], ['control', {
    intent: 'revise_goal', task_id: snapshot.run_id, expected_revision: 4,
    patch: { goal: '每周六小时，完成八周后端学习' },
  }])
  assert.equal(snapshot.task_contract.goal, '制定后端学习计划')
  view.app.unmount()
})

test('constraint replacement names the exact current text and preserves the original snapshot', async () => {
  const snapshot = run()
  const view = await mount({ run: snapshot })
  find(view.root, item => item.type === 'button'
    && item.props['aria-label'] === '修改约束：每周投入四小时').props.onClick()
  await vue.nextTick()
  const input = find(view.root, item => item.type === 'textarea'
    && item.props.placeholder === '写下替换后的约束')
  assert.ok(input)
  input.value = '每周投入六小时'
  input.listeners.input({ target: input })
  await vue.nextTick()
  const form = find(view.root, item => item.type === 'form' && textOf(item).includes('替换这条约束'))
  form.props.onSubmit({ preventDefault() {} })
  assert.deepEqual(view.events[0], ['control', {
    intent: 'supplement', task_id: snapshot.run_id, expected_revision: 4,
    patch: { constraint_updates: [{ current: '每周投入四小时', replacement: '每周投入六小时' }] },
  }])
  assert.deepEqual(snapshot.task_contract.constraints, ['每周投入四小时'])
  view.app.unmount()
})

test('saving requires a completed plan bound to the current contract; event pins both versions', async () => {
  const snapshot = run({
    status: 'completed',
    task_contract: { ...run().task_contract, revision: 5 },
    current_contract_revision: 5,
    current_plan: { ...run().current_plan, metadata: { task_contract_revision: 5 } },
  })
  const view = await mount({ run: snapshot })
  const button = find(view.root, item => item.type === 'button' && textOf(item).includes('确认保存计划第 2 版'))
  assert.ok(button)
  button.props.onClick()
  assert.deepEqual(view.events, [['save', { contract_revision: 5, plan_version: 2 }]])
  view.app.unmount()

  const stale = await mount({ run: run({
    status: 'completed',
    current_contract_revision: 5,
    task_contract: { ...run().task_contract, revision: 5 },
  }) })
  assert.equal(find(stale.root, item => item.type === 'button' && textOf(item).includes('确认保存计划')), null)
  stale.app.unmount()
})

test('paused tasks resume at the displayed revision and saved cards retain exact version identity', async () => {
  const saved = {
    confirmation_id: 'confirmation_v2', artifact_id: 'artifact_v2',
    contract_revision: 4, plan_version: 2, plan_sha256: 'f'.repeat(64),
    saved_at: '2026-10-23T10:00:00Z',
  }
  const view = await mount({ run: run({ status: 'paused', saved_artifacts: [saved] }) })
  find(view.root, item => item.type === 'button' && textOf(item).includes('恢复任务')).props.onClick()
  find(view.root, item => item.type === 'button' && textOf(item).includes('读取此版本')).props.onClick()
  assert.deepEqual(view.events, [
    ['resume', { expected_revision: 4 }],
    ['read-saved-plan', { plan_version: 2 }],
  ])
  assert.match(textOf(view.root), /计划第 2 版/)
  assert.match(textOf(view.root), /契约第 4 版/)
  view.app.unmount()
})

test('saved plan body is rendered only when its version, contract revision, and digest match a saved receipt', async () => {
  const receipt = {
    confirmation_id: 'confirmation_v2', artifact_id: 'artifact_v2',
    contract_revision: 4, plan_version: 2, plan_sha256: 'f'.repeat(64), saved_at: null,
  }
  const savedPlan = run().current_plan
  const verified = await mount({ run: run({ saved_artifacts: [receipt] }), savedPlan })
  assert.match(textOf(verified.root), /已核验保存计划/)
  assert.match(textOf(verified.root), /读取授权资料/)
  verified.app.unmount()

  const stale = await mount({
    run: run({ saved_artifacts: [receipt] }),
    savedPlan: { ...savedPlan, plan_sha256: 'a'.repeat(64) },
  })
  assert.doesNotMatch(textOf(stale.root), /已核验保存计划/)
  stale.app.unmount()
})
