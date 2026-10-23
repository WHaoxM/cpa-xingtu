import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const source = readFileSync(fileURLToPath(new URL('../src/utils/resumeTraceAttempts.ts', import.meta.url)), 'utf8')
const moduleText = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { splitResumeTraceAttempts, describeResumeEntityCheckpoint } = await import(`data:text/javascript,${encodeURIComponent(moduleText)}`)

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
assert.deepEqual(describeResumeEntityCheckpoint('unresolved'), { limited: true, detail: '技能关联暂不可用，名称尚未核验' })
assert.equal(describeResumeEntityCheckpoint('partial').limited, true)
assert.equal(describeResumeEntityCheckpoint('unknown_internal_code').limited, true)
assert.equal(describeResumeEntityCheckpoint('completed').limited, false)
assert.equal(describeResumeEntityCheckpoint('proposed').detail.includes('候选'), true)
assert.equal(describeResumeEntityCheckpoint('not_required').limited, false)
console.log('resume entity checkpoint honesty: 6 assertions passed')

const page = readFileSync(new URL('../src/views/student/CareerNavigation.vue', import.meta.url), 'utf8')
const stageSource=page.slice(page.indexOf('const realCurrentStage'),page.indexOf('const resumeMainStatus'))
const stageCode=ts.transpileModule(stageSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
function stage({upload=false,task='owned_task',error='',current=[]}={}){
 return new Function('computed','acceptingUpload','activeResumeTaskId','traceError','tracePartitions',stageCode+';return realCurrentStage.value')(
  fn=>({value:fn()}),{value:upload},{value:task},{value:error},{value:{current}})
}
assert.equal(stage({upload:true,task:''}),'正在提交简历，请稍候')
assert.equal(stage(),'文件已收到，正在等待解析')
assert.equal(stage({current:[{stage:'file_received'}]}),'文件已收到')
assert.equal(stage({current:[{stage:'attempt_started'}]}),'开始读取这份简历')
assert.equal(stage({error:'failed',current:[{stage:'candidate_saved'}]}),'暂时读不到解析进展，请稍后重新查看')
assert.equal(stage({current:[{stage:'entity_resolved'}]}),'名称处理已有结果')
assert.equal(stage({current:[{stage:'candidate_saved'}]}),'识别结果已保存，等待你核对')
for(const event of ['handoff_document','handoff_structure','handoff_entity','future_private_stage']){
 assert.doesNotMatch(stage({current:[{stage:event}]}),/Agent|后端|任务编号|future_private_stage/)
}
console.log('resume student-facing progress projection: 11 assertions passed')

const parseSource = page.slice(page.indexOf('async function startParse()'), page.indexOf('async function confirmParsedResume()'))
const analysisFailure = [...parseSource.matchAll(/parseError\.value = (e instanceof Error \? e\.message : '[^']+')\s*\r?\n\s*parsePhase\.value = 'idle'/g)].at(-1)?.[1]
assert.ok(analysisFailure, 'analysis failure keeps the concrete error before its fallback')
const failureMessage = new Function('e', `return ${analysisFailure}`)
assert.equal(failureMessage(new Error('文件读取超时，请重新提交这份资料')), '文件读取超时，请重新提交这份资料', 'unique failure detail stays available')
assert.equal(failureMessage(null), '暂时未能完成分析，请稍后再试。', 'unknown failures use student-facing copy')
assert.match(page, /简历解析未能完成；右侧保留已完成的处理进展。/)
assert.doesNotMatch(page, /请检查后端是否已启动|最后完成的后端检查点/)
console.log('resume failure copy and original error preservation: 5 assertions passed')
