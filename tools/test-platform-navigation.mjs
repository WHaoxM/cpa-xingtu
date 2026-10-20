import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../src/utils/platformNavigation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { resolvePlatformRedirectUrl } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
)

test('redirects a platform route to the configured app origin and preserves query/hash', () => {
  assert.equal(
    resolvePlatformRedirectUrl(
      'https://app.example.test',
      'https://www.example.test',
      '/login?next=%2Fapp%2Fdashboard#resume',
    ),
    'https://app.example.test/login?next=%2Fapp%2Fdashboard#resume',
  )
})

test('does not redirect when configuration is unset or current host is already the app', () => {
  assert.equal(resolvePlatformRedirectUrl(undefined, 'https://www.example.test', '/login'), null)
  assert.equal(resolvePlatformRedirectUrl('https://app.example.test', 'https://app.example.test', '/login'), null)
})

test('rejects non-HTTPS, credentialed, path-bearing, or query-bearing origins', () => {
  for (const origin of [
    'http://app.example.test',
    'https://user:pass@app.example.test',
    'https://app.example.test/platform',
    'https://app.example.test?next=/login',
  ]) {
    assert.equal(resolvePlatformRedirectUrl(origin, 'https://www.example.test', '/login'), null, origin)
  }
})

test('rejects protocol-relative and malformed navigation paths', () => {
  assert.equal(resolvePlatformRedirectUrl('https://app.example.test', 'https://www.example.test', '//evil.test/'), null)
  assert.equal(resolvePlatformRedirectUrl('https://app.example.test', 'https://www.example.test', 'https://evil.test/'), null)
})
