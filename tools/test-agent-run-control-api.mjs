import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const calls = []
globalThis.__agentTaskApiCalls = calls
const entry = fileURLToPath(new URL('../src/api/agentTask.ts', import.meta.url))
const built = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
  plugins: [{
    name: 'agent-task-http-stub',
    setup(builder) {
      builder.onResolve({ filter: /^\.\/adapters\/httpAdapter$/ }, () => ({
        path: 'http-adapter-stub', namespace: 'agent-task-test',
      }))
      builder.onLoad({ filter: /.*/, namespace: 'agent-task-test' }, () => ({
        loader: 'js',
        contents: `
          export const httpGet = (...args) => {
            globalThis.__agentTaskApiCalls.push(['GET', ...args]);
            return Promise.resolve({ success: true, data: {} });
          };
          export const httpSend = (...args) => {
            globalThis.__agentTaskApiCalls.push([args[0], ...args.slice(1)]);
            return Promise.resolve({ success: true, data: {} });
          };
        `,
      }))
    },
  }],
})
const api = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)

test('contract revisions bind run id, expected revision, patch, and idempotency key', async () => {
  calls.length = 0
  await api.controlAgentRun('run/one', {
    intent: 'revise_goal', task_id: 'run/one', expected_revision: 7,
    patch: { goal: 'Eight-week backend plan' },
  }, 'revision-key-7')
  assert.deepEqual(calls[0], [
    'POST', '/api/agent/runs/run%2Fone/control',
    { intent: 'revise_goal', task_id: 'run/one', expected_revision: 7,
      patch: { goal: 'Eight-week backend plan' } },
    undefined, { 'Idempotency-Key': 'revision-key-7' },
  ])
  assert.throws(() => api.controlAgentRun('run/one', {
    intent: 'supplement', task_id: 'run/one', expected_revision: 7,
    patch: { add_constraints: ['Six hours each week'] },
  }), /Idempotency-Key/)
})

test('read-only controls do not require an idempotency key; resume pins the revision', async () => {
  calls.length = 0
  await api.controlAgentRun('run-2', {
    intent: 'pause', task_id: 'run-2', expected_revision: 3,
  })
  await api.resumeAgentRun('run-2', 3)
  assert.deepEqual(calls[0], [
    'POST', '/api/agent/runs/run-2/control',
    { intent: 'pause', task_id: 'run-2', expected_revision: 3 }, undefined, undefined,
  ])
  assert.deepEqual(calls[1], [
    'POST', '/api/agent/runs/run-2/resume', { expected_revision: 3 },
  ])
})

test('save pins contract and plan versions with an idempotency key', async () => {
  calls.length = 0
  await api.saveAgentRunArtifact('run-3', 5, 8, 'save-key-8')
  assert.deepEqual(calls[0], [
    'POST', '/api/agent/runs/run-3/save',
    { contract_revision: 5, plan_version: 8 }, undefined,
    { 'Idempotency-Key': 'save-key-8' },
  ])
  assert.throws(() => api.saveAgentRunArtifact('run-3', 5, 8, ''), /Idempotency-Key/)
})

test('saved plan lookup uses the immutable run and version route', async () => {
  calls.length = 0
  await api.readAgentRunPlan('run/4', 9)
  assert.deepEqual(calls[0], ['GET', '/api/agent/runs/run%2F4/plans/9'])
})

test('natural-language follow-up is owner-run revision bound and replayable by one stable key', async () => {
  calls.length = 0
  const request = {
    task_id: 'run/5', expected_revision: 4,
    message: '把每周时间改成六小时',
  }
  await api.submitAgentRunFollowup('run/5', request, 'followup-key-5')
  assert.deepEqual(calls[0], [
    'POST', '/api/agent/runs/run%2F5/followup', request, undefined,
    { 'Idempotency-Key': 'followup-key-5' },
  ])
  assert.throws(() => api.submitAgentRunFollowup('run/5', request, ''), /Idempotency-Key/)
  assert.throws(() => api.submitAgentRunFollowup('run/6', request, 'followup-key-6'), /task_id/)
})
