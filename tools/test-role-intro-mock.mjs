import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { buildSync } from 'esbuild'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = mkdtempSync(join(tmpdir(), 'role-intro-mock-'))
let fetchRoleIntro
try {
  const outfile = join(tmp, 'ability.cjs')
  buildSync({
    entryPoints: [join(root, 'src', 'api', 'ability.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    alias: { '@': join(root, 'src') },
    define: {
      'import.meta.env': JSON.stringify({ VITE_API_MODE: 'mock', PROD: true, BASE_URL: '/' }),
    },
    logLevel: 'error',
  })
  fetchRoleIntro = require(outfile).fetchRoleIntro
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

test('Mock role intro never substitutes frontend copy for another role', async () => {
  const fixture = readFileSync(join(root, 'public', 'fixtures', 'ability', 'role-intro.frontend.json'), 'utf8')
  const previousFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url) => {
    requests.push(String(url))
    if (String(url) === '/fixtures/ability/role-intro.frontend.json') {
      return new Response(fixture, { status: 200 })
    }
    return new Response('', { status: 404 })
  }
  try {
    assert.equal((await fetchRoleIntro('Vue 前端工程师'))?.title, '前端开发工程师')
    assert.equal(await fetchRoleIntro('SRE工程师'), null)
    assert.equal(await fetchRoleIntro('商业数据分析师'), null)
    assert.equal(requests.filter((url) => url.endsWith('role-intro.frontend.json')).length, 1)
  } finally {
    globalThis.fetch = previousFetch
  }
})
