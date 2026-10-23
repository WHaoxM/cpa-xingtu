import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, compileScript } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import * as vue from 'vue'

// Execute the existing SFC's lifecycle; only animation scheduling/DOM are controlled.
async function fixture() {
  const { descriptor }=parse(readFileSync(new URL('../src/components/bookshelf/BookOpenOverlay.vue',import.meta.url),'utf8'))
  const script=compileScript(descriptor,{id:'reader-close'}).content.replace(/^import .*$/gm,'')
  const timelines=[],cleanups=[],events=[]
  const gsap={set(){},timeline(options={}){const t={options,killed:false,to(){return t},kill(){t.killed=true},complete(){if(!t.killed)options.onComplete?.()}};timelines.push(t);return t}}
  const focus={focus(){events.push('focus')}}
  const context={...vue,_defineComponent:vue.defineComponent,onBeforeUnmount:fn=>cleanups.push(fn),gsap,
    useUserStore:()=>({currentUser:null}),mockUsers:[],JOB_PORTRAITS:[],getGrowthPlan:()=>[],
    Icon:{},BookPage:{},D3RadarChart:{}}
  globalThis.__readerLifecycle=context
  globalThis.window={matchMedia:()=>({matches:false}),innerWidth:1280,innerHeight:720}
  globalThis.document={activeElement:focus,addEventListener(){},removeEventListener(){}}
  const code=(await transform(`const {${Object.keys(context).join(',')}}=globalThis.__readerLifecycle;\n${script}`,{loader:'ts',format:'esm'})).code
  const module=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`)
  const props=vue.reactive({visible:false,record:{id:'one',type:'portrait',snapshot:{}},type:'portrait',originX:0,originY:0,serverMode:true})
  const view=module.default.setup(props,{expose(){},emit(name){events.push(name)}})
  view.bookRef.value={querySelector:()=>focus,querySelectorAll:()=>[]}
  view.pageRef.value={}
  props.visible=true;await vue.nextTick();await vue.nextTick()
  return {view,props,events,timelines,cleanup(){for(const fn of cleanups)fn()}}
}

test('repeated close while animating completes exactly once',async()=>{
  const f=await fixture();f.events.length=0
  f.view.closeWithAnim();f.view.closeWithAnim()
  assert.equal(f.events.filter(e=>e==='close').length,0,'second close must not bypass animation and emit early')
  for(const t of f.timelines)t.complete()
  assert.equal(f.events.filter(e=>e==='close').length,1)
  f.cleanup()
})
test('closing animation is cancelled on unmount and cannot close/focus a later page',async()=>{
  const f=await fixture();f.view.closeWithAnim();f.events.length=0;f.cleanup()
  for(const t of f.timelines)t.complete()
  assert.deepEqual(f.events,[])
})
test('same-id placeholder becoming detail cannot cancel the closing animation',async()=>{
  const f=await fixture();f.events.length=0;f.view.closeWithAnim()
  f.props.record={...f.props.record,snapshot:{loaded:true}}
  await vue.nextTick();await vue.nextTick()
  for(const t of f.timelines)t.complete()
  assert.equal(f.events.filter(e=>e==='close').length,1)
  f.cleanup()
})
test('switching to another record invalidates the old closing callback',async()=>{
  const f=await fixture();f.events.length=0;f.view.closeWithAnim()
  f.props.record={...f.props.record,id:'two'}
  await vue.nextTick();await vue.nextTick()
  for(const t of f.timelines)t.complete()
  assert.equal(f.events.filter(e=>e==='close').length,0)
  f.cleanup()
})
test('reduced-motion close is still idempotent',async()=>{
  const f=await fixture();f.events.length=0
  globalThis.window.matchMedia=()=>({matches:true})
  f.view.closeWithAnim();f.view.closeWithAnim()
  assert.equal(f.events.filter(e=>e==='close').length,1)
  f.cleanup()
})
