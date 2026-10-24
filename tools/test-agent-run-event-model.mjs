import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('../src/components/agent/agentRunEventModel.ts', import.meta.url))
const built = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
})
const model = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)
const event = (event_seq, event_type, payload = {}) => ({
  event_seq,
  event_type,
  run_status: 'running',
  payload,
  occurred_at: '2026-10-24T10:00:00Z',
})

test('durable event pages merge by sequence and discard duplicates', () => {
  const first = model.appendContiguousAgentRunEvents([], 0, [
    event(1, 'run.submitted'), event(2, 'run.planning'),
  ])
  assert.deepEqual({ cursor: first.cursor, gap: first.gap }, { cursor: 2, gap: false })

  const second = model.appendContiguousAgentRunEvents(first.events, first.cursor, [
    event(2, 'run.planning'), event(3, 'run.step_started', { step_index: 0 }),
  ])
  assert.deepEqual(second.events.map(row => row.event_seq), [1, 2, 3])
  assert.deepEqual({ cursor: second.cursor, gap: second.gap }, { cursor: 3, gap: false })
})

test('an event sequence gap is reported without advancing the contiguous cursor', () => {
  const result = model.appendContiguousAgentRunEvents([], 0, [event(1, 'run.submitted'), event(3, 'run.completed')])
  assert.equal(result.cursor, 1)
  assert.equal(result.gap, true)
})

test('timeline projection exposes allow-listed facts and ignores unknown tool events', () => {
  const resource = model.toAgentRunTimelineItem(event(4, 'run.resource_read_completed', {
    label: '已确认简历', raw_context: 'must not be displayed',
  }))
  assert.equal(resource.detail, '已确认简历')
  assert.equal(JSON.stringify(resource).includes('must not be displayed'), false)
  assert.equal(model.toAgentRunTimelineItem(event(5, 'run.tool_started', { arguments: 'private' })), null)
})

test('failed run shows a safe known cause and the run reference without exposing internal codes', () => {
  const known = model.toAgentRunTimelineItem(
    event(8, 'run.failed', { error_code: 'resource_read_result_unverified' }),
    'run_synthetic_123',
  )
  assert.equal(known.title, '任务执行失败')
  assert.match(known.detail, /没有取得可核验的读取结果/)
  assert.match(known.detail, /运行编号：run_synthetic_123/)
  assert.doesNotMatch(known.detail, /resource_read_result_unverified/)

  const unknown = model.toAgentRunTimelineItem(
    event(9, 'run.failed', { error_code: 'secret_internal_exception_name' }),
    'run_synthetic_456',
  )
  assert.match(unknown.detail, /系统没有提供可安全展示的失败说明/)
  assert.match(unknown.detail, /运行编号：run_synthetic_456/)
  assert.doesNotMatch(unknown.detail, /secret_internal_exception_name/)
})

test('summary names a real current step without fabricating a percentage or timer', () => {
  const summary = model.summarizeAgentRun({
    run_id: 'run_a', status: 'running', current_contract_revision: 1, current_plan_version: 2,
    current_plan: { plan_version: 2, goal_summary: 'goal', plan_sha256: 'digest', metadata: {}, steps: [
      { step_index: 2, role: 'research', goal: 'verify requirements', status: 'running' },
    ] },
  })
  assert.match(summary, /正在执行第 3 步/)
  assert.doesNotMatch(summary, /%|\d+\s*(秒|分钟)/)
})
