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

const toolPayload = (phase, callId = 'call-a', overrides = {}) => ({
  schema_version: 2,
  model_iteration: 1,
  turn_id: `turn_${'a'.repeat(32)}`,
  assistant_message_id: `msg_${'b'.repeat(32)}`,
  tool_call_id: callId,
  plan_version: 2,
  contract_revision: 3,
  step_index: 1,
  attempt: 1,
  tool_name: 'career_data_read',
  status: phase === 'started' ? 'started' : 'succeeded',
  ...(phase === 'started'
    ? { input_summary: { argument_count: 2, argument_names: ['query', 'resume_id'] } }
    : { output_summary: { result_kind: 'json_object', output_bytes: 420, field_count: 3, attempts: 1, error_code: null } }),
  ...overrides,
})

test('typed tool start and settlement pair on the full stable call identity', () => {
  const start = event(7, 'run.tool_call_started', {
    ...toolPayload('started'),
    private_context: 'RAW_CONTEXT_SENTINEL',
    input_summary: { argument_count: 2, argument_names: ['query', 'privateResumeId'], values: ['SECRET_SENTINEL'] },
  })
  const settled = event(8, 'run.tool_call_settled', {
    ...toolPayload('settled'),
    private_output: 'PRIVATE_RESULT_SENTINEL',
  })
  const items = model.toAgentRunTimelineItems([settled, start], 'run_fixture', 'completed')
  assert.equal(items.length, 1)
  assert.equal(items[0].kind, 'tool_call')
  assert.equal(items[0].eventSeq, 7)
  assert.match(items[0].title, /职业资料/)
  assert.match(items[0].detail, /已完成/)
  assert.match(items[0].detail, /对象结果，3 个字段/)
  assert.doesNotMatch(JSON.stringify(items), /RAW_CONTEXT_SENTINEL|SECRET_SENTINEL|PRIVATE_RESULT_SENTINEL|privateResumeId|call-a|msg_[a-f0-9]{32}/)
})

test('duplicate event pages and out-of-order rows produce one tool call item', () => {
  const start = event(2, 'run.tool_call_started', toolPayload('started'))
  const settled = event(3, 'run.tool_call_settled', toolPayload('settled'))
  const items = model.toAgentRunTimelineItems([settled, start, start, settled], 'run_fixture', 'completed')
  assert.equal(items.length, 1)
  assert.equal(items[0].eventSeq, 2)
})

test('schema v2 requires a bounded model iteration while older typed rows remain readable', () => {
  const valid = toolPayload('started')
  const missingIteration = { ...valid }
  delete missingIteration.model_iteration
  assert.equal(model.toAgentRunTimelineItems([event(1, 'run.tool_call_started', missingIteration)], 'run_fixture', 'running').length, 0)
  const invalidIteration = { ...valid, model_iteration: 7 }
  assert.equal(model.toAgentRunTimelineItems([event(2, 'run.tool_call_started', invalidIteration)], 'run_fixture', 'running').length, 0)
  const legacy = { ...valid, schema_version: 1 }
  delete legacy.model_iteration
  const legacyItems = model.toAgentRunTimelineItems([event(3, 'run.tool_call_started', legacy)], 'run_fixture', 'running')
  assert.equal(legacyItems.length, 1)
  assert.match(legacyItems[0].detail, /尚未包含工具结果/)
})

test('tool start and result from different model iterations never pair', () => {
  const started = event(20, 'run.tool_call_started', toolPayload('started', 'same-provider-id'))
  const anotherIteration = event(21, 'run.tool_call_settled', toolPayload('settled', 'same-provider-id', {
    model_iteration: 2,
  }))
  const items = model.toAgentRunTimelineItems([started, anotherIteration], 'run_fixture', 'running')
  assert.equal(items.length, 2)
  assert.ok(items.some(item => /尚未包含工具结果/.test(item.detail)))
  assert.ok(items.some(item => /已完成/.test(item.detail)))
})

test('two calls from one assistant message stay separate and keep independent results', () => {
  const firstStart = event(3, 'run.tool_call_started', toolPayload('started', 'call-one'))
  const firstResult = event(4, 'run.tool_call_settled', toolPayload('settled', 'call-one'))
  const secondStart = event(5, 'run.tool_call_started', toolPayload('started', 'call-two'))
  const secondResult = event(6, 'run.tool_call_settled', toolPayload('settled', 'call-two', {
    status: 'failed',
    output_summary: { result_kind: 'empty', output_bytes: 0, field_count: 0, attempts: 1, error_code: 'tool_timeout' },
  }))
  const items = model.toAgentRunTimelineItems([firstStart, firstResult, secondStart, secondResult], 'run_fixture', 'failed')
  assert.equal(items.length, 2)
  assert.match(items[0].detail, /已完成/)
  assert.match(items[1].detail, /未完成/)
  assert.match(items[1].detail, /等待超时/)
  assert.doesNotMatch(JSON.stringify(items), /call-one|call-two/)
})

test('unsettled, non-terminal, and unknown tool states never imply success', () => {
  const startOnly = event(9, 'run.tool_call_started', toolPayload('started'))
  const active = model.toAgentRunTimelineItems([startOnly], 'run_fixture', 'running')
  assert.match(active[0].detail, /尚未包含工具结果/)
  assert.doesNotMatch(active[0].detail, /已完成/)

  const pending = event(10, 'run.tool_call_settled', toolPayload('settled', 'call-pending', { status: 'pending' }))
  const pendingItems = model.toAgentRunTimelineItems([pending], 'run_fixture', 'running')
  assert.match(pendingItems[0].detail, /处理中/)
  assert.doesNotMatch(pendingItems[0].detail, /已完成/)

  const cancelledItems = model.toAgentRunTimelineItems([startOnly], 'run_fixture', 'cancelled')
  assert.match(cancelledItems[0].detail, /任务已结束/)
  assert.doesNotMatch(cancelledItems[0].detail, /已完成/)

  const future = event(11, 'run.tool_call_settled', toolPayload('settled', 'call-future', { status: 'awaiting_result' }))
  const futureItems = model.toAgentRunTimelineItems([future], 'run_fixture', 'running')
  assert.match(futureItems[0].detail, /状态待核验/)
  assert.doesNotMatch(futureItems[0].detail, /已完成/)
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
