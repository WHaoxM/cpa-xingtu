import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

function inlineScript(file) {
  const html = readFileSync(new URL(file, import.meta.url), 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script, `${file} must have an inline script`)
  return script
}

const fallbackScript = inlineScript('../public/404.html')
const entryScript = inlineScript('../index.html')

function execute(script, href) {
  const source = new URL(href)
  let redirect
  let restored
  runInNewContext(script, {
    window: {
      location: {
        href: source.href,
        origin: source.origin,
        hostname: source.hostname,
        pathname: source.pathname,
        search: source.search,
        hash: source.hash,
        replace(value) { redirect = new URL(value, source).href },
      },
      history: {
        replaceState(_state, _title, value) { restored = new URL(value, source).href },
      },
    },
    URL,
  })
  return { redirect, restored }
}

test('legacy printed project URLs go to the marketing website', () => {
  const withoutTrailingSlash = execute(entryScript, 'https://whaoxm.github.io/cpa-xingtu')
  assert.equal(withoutTrailingSlash.redirect, 'https://www.xingtulabs.top/')

  const exact = execute(entryScript, 'https://whaoxm.github.io/cpa-xingtu/')
  assert.equal(exact.redirect, 'https://www.xingtulabs.top/')

  const fallbackWithoutTrailingSlash = execute(fallbackScript, 'https://whaoxm.github.io/cpa-xingtu')
  assert.equal(fallbackWithoutTrailingSlash.redirect, 'https://www.xingtulabs.top/')

  const deepLink = execute(fallbackScript, 'https://whaoxm.github.io/cpa-xingtu/app/dashboard?tab=1#recent')
  assert.equal(deepLink.redirect, 'https://www.xingtulabs.top/')
})

test('a custom hostname restores SPA deep links', () => {
  const original = 'https://app.example.test/app/student/learning?role=AI%20Engineer&tab=2#courses'
  const fallback = execute(fallbackScript, original)
  assert.match(fallback.redirect, /^https:\/\/app\.example\.test\/\?__spa_redirect=/)

  const restored = execute(entryScript, fallback.redirect)
  assert.equal(restored.restored, original)
})

test('lookalike hosts and unsafe redirect values are ignored', () => {
  assert.deepEqual(
    execute(entryScript, 'https://notwhaoxm.github.io/cpa-xingtu/'),
    { redirect: undefined, restored: undefined },
  )
  assert.deepEqual(
    execute(entryScript, 'https://app.example.test/?__spa_redirect=https%3A%2F%2Fevil.example%2F'),
    { redirect: undefined, restored: undefined },
  )
  assert.deepEqual(
    execute(entryScript, 'https://app.example.test/?__spa_redirect=%2F%2Fevil.example%2F'),
    { redirect: undefined, restored: undefined },
  )
})
