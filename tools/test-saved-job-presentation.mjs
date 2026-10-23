import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

// Exercise the actual pure API mapper without adding a browser or test framework dependency.
const source = readFileSync(new URL('../src/api/mappers.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { mapSavedJob, mapReportRecord } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('saved job dates accept Flask RFC 1123, ISO and legacy date-only values', () => {
  for (const saved_at of ['Wed, 21 Oct 2026 13:03:00 GMT', '2026-10-21T13:03:00Z', '2026-10-21 13:03:00', '2026-10-21']) {
    assert.equal(mapSavedJob({ saved_at }).savedAt, '2026-10-21')
  }
  assert.equal(mapSavedJob({ savedAt: '2026-10-21' }).savedAt, '2026-10-21')
})

test('missing or invalid dates stay unknown instead of displaying truncated raw values', () => {
  for (const saved_at of [undefined, null, '', 'not a date']) {
    assert.equal(mapSavedJob({ saved_at }).savedAt, '')
  }
})

test('report calendar dates do not shift to tomorrow for late Flask RFC timestamps', () => {
  for (const created_at of ['Wed, 21 Oct 2026 21:47:29 GMT', '2026-10-21 21:47:29', '2026-10-21T21:47:29']) {
    assert.equal(mapReportRecord({ report_id: 'report-one', created_at }).createdAt, '2026-10-21')
  }
  assert.equal(mapReportRecord({ report_id: 'report-one' }).createdAt, '')
})
