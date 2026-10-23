import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transform } from 'esbuild'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const source = readFileSync(new URL('../src/utils/portraitFollowup.ts', import.meta.url), 'utf8')
const code = (await transform(source.replace(/^import .*$/gm, ''), { loader: 'ts', format: 'esm' })).code
const { portraitGuidance, followupLocation, currentPortraitLocation, followupStatus } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const current = { is_current: true, missing_fields: ['school_tier','communication','growth_evidence'], dimensions: {D1:null,D2:28,D3:null,D4:null} }
const state = { source_confirmation_task_id:'task_current', portrait:{state:'ready_with_unknowns',snapshot_id:'ps_'+'1'.repeat(32)} }

test('missing evidence has different responsibilities; school has no fake verification button', () => {
  const items = portraitGuidance(current)
  assert.equal(items.find(i=>i.key==='school_tier').action, undefined)
  assert.match(items.find(i=>i.key==='school_tier').text, /不能.*自行/)
  assert.equal(items.find(i=>i.key==='communication').action, 'self-report')
  assert.equal(items.find(i=>i.key==='growth_evidence').action, 'resume')
  assert.ok(!items.some(i=>/补齐.*评分/.test(i.text)))
})
test('unknown fields remain neutral and raw field codes are not shown', () => {
  const items=portraitGuidance({...current,missing_fields:['private_future_code','another_unknown']})
  assert.equal(items.length,1)
  assert.equal(items[0].action,undefined)
  assert.ok(!JSON.stringify(items).includes('private_future_code'))
})
test('related behavior gaps form one explanation rather than four repeated disclaimers', () => {
  const items=portraitGuidance({...current,missing_fields:['communication','teamwork','responsibility','stress_tolerance']})
  assert.equal(items.length,1)
  assert.match(items[0].text,/沟通、团队协作、承担责任、应对压力/)
})
test('historical versions are not editable and known zero is not treated as unknown', () => {
  assert.ok(portraitGuidance({...current,is_current:false}).every(i=>!i.action))
  assert.ok(portraitGuidance({...current,is_current:false}).every(i=>i.text.startsWith('当时')))
  assert.deepEqual(portraitGuidance({...current,missing_fields:[],dimensions:{D1:0,D2:28,D3:0,D4:0}}),[])
})
test('followup always uses the current server confirmation, never the snapshot task', () => {
  assert.deepEqual(followupLocation(state,'self-report'),{name:'student-career-navigation',query:{from:'my-reports',focus:'self-report',task_id:'task_current'}})
  assert.equal(followupLocation({...state,source_confirmation_task_id:null},'resume'),null)
  assert.equal(followupLocation(state,'https://attacker.invalid'),null)
})
test('a ready current snapshot can be opened; pending/failed cannot reopen an old snapshot', () => {
  assert.equal(currentPortraitLocation(state).query.snapshot_id,state.portrait.snapshot_id)
  for(const status of ['processing','failed','stale']) {
    assert.deepEqual(currentPortraitLocation({...state,portrait:{...state.portrait,state:status}}),{name:'student-my-reports'})
  }
})
test('saved submission, queued analysis, failure and a readable new result are distinct', () => {
  assert.match(followupStatus({...state,portrait:{state:'processing'}},true), /已保存.*分析/)
  assert.match(followupStatus({...state,portrait:{state:'failed'}},true), /已保存.*未成功/)
  assert.ok(!followupStatus({...state,portrait:{state:'failed'}},true).includes('稍后'))
  assert.match(followupStatus(state,true), /新画像.*查看/)
  assert.ok(!followupStatus(null,true).includes('新画像'))
})

test('the real reader exposes self-report provenance without rendering private metadata', async () => {
  const file=readFileSync(new URL('../src/components/reports/ServerPortraitDetail.vue',import.meta.url),'utf8')
  const {descriptor}=parse(file)
  const script=(await transform(compileScript(descriptor,{id:'portrait-evidence'}).content,{loader:'ts',format:'esm'})).code
    .replace(/from "vue"/g,`from ${JSON.stringify(import.meta.resolve('vue'))}`)
    .replace(/import D3FlowerChart from [^;]+;/,'const D3FlowerChart={};')
    .replace(/import ReportReadingLayout from [^;]+;/,'const ReportReadingLayout={};')
    .replace(/import \{ portraitGuidance \} from [^;]+;/,`const portraitGuidance=globalThis.__portraitGuidance;`)
  globalThis.__portraitGuidance=portraitGuidance
  const component=await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`)
  const view=component.default.setup({snapshot:current},{expose(){},emit(){}})
  const raw={communication:{evidence:'我组织小组会议并逐一确认交付安排。',provenance:{kind:'user_self_report',revision:7}},source_sha256:'private_hash'}
  assert.deepEqual(view.evidence(raw),['本人自述 · 我组织小组会议并逐一确认交付安排。'])
  assert.equal(view.hasSelfReport(raw),true)
  assert.equal(view.hasSelfReport({communication:{evidence:'原文',provenance:{kind:'confirmed_self_description'}}}),false)
  assert.match(file,/snapshot.is_current \? '当前版本' : '历史版本 · 仅供回看'/)
  assert.match(file,/snapshot.is_current \? '当前' : '当时'/)
  assert.deepEqual(view.quickActions.value,['self-report','resume'])
  const history=component.default.setup({snapshot:{...current,is_current:false}},{expose(){},emit(){}})
  assert.deepEqual(history.quickActions.value,[])
  const schoolOnly=component.default.setup({snapshot:{...current,missing_fields:['school_tier','private_future_code']}},{expose(){},emit(){}})
  assert.deepEqual(schoolOnly.quickActions.value,[])
})

test('self-report feedback belongs to the form and report handoff keeps its context',()=>{
  const source=readFileSync(new URL('../src/views/student/CareerNavigation.vue',import.meta.url),'utf8')
  const {descriptor}=parse(source)
  const template=descriptor.template.content
  const form=template.match(/<section v-if="canSupplementBehavior"[\s\S]*?<\/section>/)?.[0]
  assert.ok(form)
  assert.match(form,/role="alert"[^>]*>{{ selfReportError }}/)
  assert.match(form,/rp-self-report__next/)
  assert.match(template,/portraitFollowup \? \(route.query.focus === 'self-report' \? '补充职业素养经历' : '核对当前简历'\)/)
  assert.match(source,/selfReportErrorElement.value\?\.scrollIntoView/)
})

test('verified navigation keeps all applicable forms visible in distinct reading groups',()=>{
  const source=readFileSync(new URL('../src/views/student/CareerNavigation.vue',import.meta.url),'utf8')
  const verified=source.slice(source.indexOf('<div v-else-if="parsePhase === \'verified\'"'),source.indexOf('<!-- DONE 态 -->'))
  for(const label of ['当前成果与下一步','补充与核对资料','职业方向参考'])assert.ok(verified.includes(label))
  assert.doesNotMatch(verified,/<details|v-show=|aria-expanded|实体候选|归一化|演示岗位|skillExploration\.revision/)
  assert.match(verified,/<section v-if="canSupplementBehavior" class="rp-self-report"/)
  assert.match(verified,/v-model="selfReportDraft\[field.key\]!\.example"/)
  assert.match(verified,/v-model="skillExplorationDraft"/)
  assert.match(verified,/@click="submitSelfReport"/)
  assert.match(verified,/@click="submitSkillExploration"/)
  assert.match(verified,/@click="returnToReports"/)
  assert.match(verified,/workbenchState\?\.portrait.state === 'processing'/)
  assert.doesNotMatch(verified,/missingFactLabels.length }} 项依据尚不确定/)
  assert.match(source,/\.rp-confirm-wrap--verified \.rp-missing-facts ul \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 8px 24px;/)
  assert.match(source,/@media \(max-width: 768px\) \{\s*\.rp-confirm-wrap--verified \.rp-missing-facts ul \{ grid-template-columns: minmax\(0, 1fr\); \}/)
  const {descriptor}=parse(source)
  const result=compileTemplate({source:descriptor.template.content,filename:'CareerNavigation.vue',id:'navigation-reading-groups'})
  assert.deepEqual(result.errors,[])
})
