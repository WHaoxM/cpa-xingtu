import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const source = readFileSync(fileURLToPath(new URL('../src/utils/resumeTraceAttempts.ts', import.meta.url)), 'utf8')
const moduleText = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { splitResumeTraceAttempts } = await import(`data:text/javascript,${encodeURIComponent(moduleText)}`)

const events = [
  { event_id: 1, stage: 'file_received', attempt: null },
  { event_id: 2, stage: 'attempt_started', attempt: 1 },
  { event_id: 3, stage: 'source_extracted', attempt: 1 },
  { event_id: 4, stage: 'handoff_document', attempt: 1 },
  { event_id: 5, stage: 'attempt_started', attempt: 2 },
  { event_id: 6, stage: 'source_extract', attempt: 2 },
  { event_id: 7, stage: 'legacy_event', attempt: null },
]
const ids = list => list.map(event => event.event_id)

assert.deepEqual(ids(splitResumeTraceAttempts(events, 0).current), [1], 'pre-claim shows the real upload receipt')
assert.deepEqual(ids(splitResumeTraceAttempts(events, 1).current), [2, 3, 4], 'first attempt has only its own Agent events')
const retry = splitResumeTraceAttempts(events, 2)
assert.deepEqual(ids(retry.current), [5, 6], 'retry must not inherit completed steps from attempt one')
assert.deepEqual(ids(retry.history), [1, 2, 3, 4, 7], 'old and legacy events remain auditable')
assert.deepEqual(ids(splitResumeTraceAttempts(events, null).current), [], 'missing attempt boundary must not invent active work')
assert.deepEqual(ids(events), [1, 2, 3, 4, 5, 6, 7], 'partitioning must not mutate cursor replay')
console.log('resume trace attempt partition: 6 assertions passed')
