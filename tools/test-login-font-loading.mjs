import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8')
const base=readFileSync(new URL('../src/assets/styles/base.css',import.meta.url),'utf8')
test('remote font CSS cannot block the parser or application entry',()=>{
  const fonts=[...html.matchAll(/<link\b[^>]*>/g)].map(m=>m[0]).filter(tag=>tag.includes('fonts.googleapis.com/css'))
  assert.equal(fonts.length,1)
  assert.match(fonts[0],/media="print"/)
  assert.match(fonts[0],/id="app-web-fonts"/)
  assert.match(fonts[0],/display=swap/)
  assert.ok(!/@import\s+url\([^)]*fonts\.googleapis/.test(base),'base.css must not restore a second critical font stylesheet')
})
test('existing font families remain available without changing design tokens',()=>{
  for(const family of ['DM+Sans','Noto+Sans+SC','Noto+Serif+SC','Inter','JetBrains+Mono','Caveat','LXGW+WenKai','Space+Grotesk']) assert.ok(html.includes(family),family)
  assert.match(base,/--font-title:\s*'Noto Sans SC'/)
})
test('font activation is event-driven, optional and does not reload or await startup',()=>{
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(body=>body.includes("getElementById('app-web-fonts')"))
  assert.ok(script,'dedicated nonblocking font activation must exist')
  const listeners=new Map(),sheet={media:'print',addEventListener(name,callback,options){listeners.set(name,{callback,options})}}
  let touched=0
  const context={document:{getElementById(id){assert.equal(id,'app-web-fonts');return sheet}},location:{reload(){touched++}},setTimeout(){touched++}}
  runInNewContext(script,context)
  assert.equal(sheet.media,'print','waiting for or losing the CDN does not make CSS critical')
  assert.equal(listeners.get('load').options.once,true)
  listeners.get('load').callback()
  assert.equal(sheet.media,'all')
  assert.equal(touched,0,'no timeout/reload workaround')
  assert.doesNotThrow(()=>runInNewContext(script,{document:{getElementById(){return null}}}))
})
