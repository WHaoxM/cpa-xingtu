import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { transform } from 'esbuild'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { createSSRApp, h, reactive, nextTick } from 'vue'
import { renderToString } from '@vue/server-renderer'

const paths = {
  MessagePartsRenderer: '../src/components/agent/MessagePartsRenderer.vue',
  ToolCallCard: '../src/components/agent/ToolCallCard.vue',
  EvidenceSummaryPart: '../src/components/agent/EvidenceSummaryPart.vue',
  PlanProgress: '../src/components/agent/PlanProgress.vue',
}
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const registry = {
  ArtifactCard: { props: ['artifact'], render() { return h('article', this.artifact.title) } },
  CitationPart: { props: ['citation'], render() { return h('blockquote', this.citation.quote) } },
  DataCardPart: { props: ['title'], render() { return h('aside', this.title) } },
}
const markdownCode = (await transform(read('../src/utils/markdown.ts'), { loader: 'ts', format: 'esm' })).code
  .replace(/from "markdown-it"/g, `from ${JSON.stringify(import.meta.resolve('markdown-it'))}`)
const { renderMarkdown } = await import(`data:text/javascript;base64,${Buffer.from(markdownCode).toString('base64')}`)
globalThis.__messageReading = { registry, renderMarkdown }

async function load(name, inlineTemplate = false) {
  const { descriptor } = parse(read(paths[name]))
  const source = compileScript(descriptor, { id: name, inlineTemplate }).content
  const code = (await transform(source, { loader: 'ts', format: 'esm' })).code
    .replace(/from "vue"/g, `from ${JSON.stringify(import.meta.resolve('vue'))}`)
    .replace(/import \{ Icon \} from [^;]+;/, 'const Icon={render(){return null}};')
    .replace(/import \{ renderMarkdown \} from [^;]+;/, 'const {renderMarkdown}=globalThis.__messageReading;')
    .replace(/import (\w+) from [^;]+\.vue";/g, (_all, child) => `const ${child}=globalThis.__messageReading.registry.${child};`)
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${name}-${inlineTemplate}`)).default
}
for (const name of ['ToolCallCard', 'EvidenceSummaryPart', 'PlanProgress']) registry[name] = await load(name, true)
registry.MessagePartsRenderer = await load('MessagePartsRenderer', true)
const setup = async (name, props) => (await load(name)).setup(props, { expose() {}, emit() {} })
const render = async (name, props) => renderToString(createSSRApp(registry[name], props))
const message = (parts, extra = {}) => ({ id: 'm1', role: 'assistant', content: '', parts, ...extra })
const tool = (summary, status = 'done') => ({ type: 'tool_call', tool_call: { name: 'private_function', status, summary } })

test('adjacent processing is grouped without moving or changing text, questions, citations or artifacts', async () => {
  const original = message([
    { type: 'text', text: '我没有做前端展示；不是整个项目负责人。' },
    tool('读取已确认简历'), tool('核对岗位资料'),
    { type: 'text', text: '你是怎样检查重复报名的？' },
    { type: 'progress', title: '材料读取情况', progress: { document_complete: false } },
    { type: 'citation', source: '项目原文', quote: '独立完成查询，展示由同伴负责。' },
    { type: 'artifact_ref', artifact: { artifact_id: 'private_artifact', kind: 'action_plan', status: 'completed', title: '本人一周计划' } },
  ])
  const before = JSON.stringify(original)
  const view = await setup('MessagePartsRenderer', { message: original, presentation: 'student' })
  assert.deepEqual(view.readingBlocks.value.map(block => [block.process, block.items.map(item => item.index)]), [
    [false, [0]], [true, [1, 2]], [false, [3]], [true, [4]], [false, [5]], [false, [6]],
  ])
  const html = await render('MessagePartsRenderer', { message: original, presentation: 'student', compactEvidence: true })
  const sequence = ['我没有做前端展示；不是整个项目负责人。', '读取已确认简历', '核对岗位资料', '你是怎样检查重复报名的？', '附件仅部分可用', '独立完成查询，展示由同伴负责。', '本人一周计划']
  const positions = sequence.map(text => html.indexOf(text))
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])))
  assert.equal((html.match(/class="message-process"/g) || []).length, 2)
  assert.doesNotMatch(html, /private_function/)
  assert.equal(JSON.stringify(original), before)
})

test('student progress stays visible, retains all returned steps and preserves independent planned steps', async () => {
  const executed = Array.from({ length: 9 }, (_, i) => ({ label: `实际步骤${i + 1}`, status: i === 8 ? 'running' : 'completed' }))
  const progress = { executed_steps: executed, plan_sketch: ['实际步骤1', '另需核对资料', '另需回答问题'], filenames: ['简历.txt'], document_complete: false }
  const html = await render('PlanProgress', { presentation: 'student', summary: '这些是已读取的步骤与仍需处理的内容。', progress })
  assert.doesNotMatch(html, /<details|<summary/)
  executed.forEach(step => assert.ok(html.includes(step.label)))
  assert.ok(html.includes('另需核对资料') && html.includes('另需回答问题'))
  assert.ok(html.includes('附件仅部分可用') && html.includes('简历.txt'))
  assert.ok(html.includes('处理中'))
  const legacy = await render('PlanProgress', { progress })
  assert.match(legacy, /<details/)
  assert.doesNotMatch(legacy, /实际步骤9/)
})

test('unread/partial sources and statement limitations are visible even with compactEvidence on', async () => {
  for (const [scope, note] of [['resume_not_cross_checked', '当前无法读取已确认简历'], ['resume_partially_cross_checked', '只读取到一部分'], ['student_submitted_unverified', '不代表经历或能力已经核验']]) {
    const evidence = { type: 'evidence_summary', title: '这次参考的资料', status: 'partial', sources: [{ label: '已确认简历', status: 'unavailable' }, { label: '岗位报告', status: 'read' }], scope_note: scope }
    const html = await render('MessagePartsRenderer', { message: message([evidence]), presentation: 'student', compactEvidence: true })
    assert.ok(html.includes(note) && html.includes('已确认简历') && html.includes('暂不可用') && html.includes('岗位报告'))
    assert.doesNotMatch(html, /<details/)
    assert.match(await render('MessagePartsRenderer', { message: message([evidence]), compactEvidence: true }), /<details/)
  }
})

test('real Lead progress projects only generated protocol labels and distinguishes planned from executed work', async () => {
  const progress = { lead_action: 'clarify', missing_slots: ['resume', 'target_role'], plan_sketch: ['核对已确认简历', '了解目标方向'] }
  const props = { title: '当前阶段：clarify', summary: '还需要补充：resume、target_role', progress }
  const html = await render('PlanProgress', { ...props, presentation: 'student' })
  assert.match(html, /需要先了解的信息/)
  assert.match(html, /简历或学习、工作背景、目标岗位或方向/)
  assert.match(html, /拟处理步骤 · 尚未完成/)
  assert.match(html, /核对已确认简历/)
  assert.doesNotMatch(html, /clarify|resume|target_role/)
  const legacy = await render('PlanProgress', props)
  assert.match(legacy, /当前阶段：clarify/)
  assert.match(legacy, /resume、target_role/)
  const unknown = await render('PlanProgress', { presentation: 'student', title: '执行路径：internal_lead', summary: '还需要补充：future_slot', progress: { missing_slots: ['future_slot'] } })
  assert.match(unknown, /其他需要补充的信息/)
  assert.doesNotMatch(unknown, /future_slot|internal_lead/)
  const business = { title: '当前阶段：准备说明本人职责', summary: '还需要补充：查询由谁编写，以及怎样核对重复报名。', progress }
  const preserved = await render('PlanProgress', { ...business, presentation: 'student' })
  assert.ok(preserved.includes(business.title) && preserved.includes(business.summary))
  const actual = await render('PlanProgress', { presentation: 'student', progress: { executed_steps: [{ label: '读取简历', status: 'completed' }], plan_sketch: ['读取简历', '核对岗位'] } })
  assert.equal((actual.match(/读取简历/g) || []).length, 1)
  assert.match(actual, /拟处理步骤 · 尚未完成/)
  assert.match(actual, /核对岗位/)
})

test('generated explain progress follows the message and authoritative outcome terminal state', async () => {
  const progress = [{ type: 'progress', title: '当前阶段：explain' }]
  const running = await render('MessagePartsRenderer', {
    message: message(progress, { status: 'thinking', outcome: { status: 'running' } }),
    presentation: 'student',
  })
  assert.match(running, /任务仍在处理中/)
  assert.doesNotMatch(running, /本轮已完成/)

  const completed = await render('MessagePartsRenderer', {
    message: message(progress, { status: 'done', outcome: { status: 'completed', completion_scope: 'turn' } }),
    presentation: 'student',
  })
  assert.match(completed, /本轮已完成/)
  assert.doesNotMatch(completed, /正在说明处理方式/)

  for (const [status, title] of [
    ['needs_input', '需要你回应'], ['partial', '本轮部分完成'], ['failed', '本轮未完成'],
  ]) {
    const html = await render('MessagePartsRenderer', {
      message: message(progress, { status: 'done', outcome: { status, completion_scope: 'turn' } }),
      presentation: 'student',
    })
    assert.match(html, new RegExp(title))
    assert.doesNotMatch(html, /正在说明处理方式/)
  }

  const doneWithoutOutcome = await render('MessagePartsRenderer', {
    message: message(progress, { status: 'done' }), presentation: 'student',
  })
  assert.match(doneWithoutOutcome, /本轮已完成/)
  const nonGenerated = await render('MessagePartsRenderer', {
    message: message([{ type: 'progress', title: '正在说明处理方式：请核对附件范围' }], { status: 'done' }),
    presentation: 'student',
  })
  assert.match(nonGenerated, /正在说明处理方式：请核对附件范围/)
})

test('ordinary Ask HTTP replies feed outcome-bearing progress into the shared student renderer', () => {
  const page = read('../src/views/student/AIAssistant.vue')
  const rendererStart = page.indexOf('<MessagePartsRenderer')
  const rendererEnd = page.indexOf('/>', rendererStart)
  const renderer = page.slice(rendererStart, rendererEnd)
  assert.match(renderer, /:presentation="isHttpMode \? 'student' : undefined"/)
  assert.match(renderer, /:message="msg"/)

  const sendStart = page.indexOf('async function sendMessage(')
  const agentBranch = page.indexOf("interactionMode.value==='agent'", sendStart)
  const askResponse = page.indexOf('learningStore.getAIResponseFromApi(apiPayload, {', agentBranch)
  const doneMessage = page.indexOf("status: 'done'", askResponse)
  const outcome = page.indexOf('outcome: result.outcome', doneMessage)
  assert.ok(agentBranch >= 0 && askResponse > agentBranch, 'Ask mode must reach the ordinary response path')
  assert.ok(doneMessage > askResponse && outcome > doneMessage, 'HTTP status and authoritative outcome must reach the rendered message')
})

test('title-only progress remains visible and entirely empty progress never creates an empty processing group', async () => {
  const titleOnly = message([{ type: 'progress', title: '正在核对这份简历中的具体经历' }])
  const html = await render('MessagePartsRenderer', { message: titleOnly, presentation: 'student' })
  assert.match(html, /正在核对这份简历中的具体经历/)
  assert.match(html, /处理步骤/)
  assert.doesNotMatch(html, /已完成|拟处理步骤/)
  const empty = message([{ type: 'progress', title: ' ', summary: '', progress: { path: 'internal_path', plan_sketch: [], missing_slots: [] } }])
  const emptyHtml = await render('MessagePartsRenderer', { message: empty, presentation: 'student' })
  assert.doesNotMatch(emptyHtml, /处理步骤|message-process|internal_path/)
  assert.deepEqual((await setup('MessagePartsRenderer', { message: empty, presentation: 'student' })).readingBlocks.value, [])
})

test('student Markdown tables retain complete cell content safely; legacy rendering and fenced text stay unchanged', async () => {
  // Header and first row from the saved real-model answer, not shortened UI copy.
  const table = '| 维度 | 已写明？ | 为什么重要 | 举例说明（供你参考，非要求照搬） |\n|------|----------|------------|----------------------------------|\n| 数据来源与真实性 | 否 | 决定是课程练习还是真实业务介入 | “数据来自校团委导出的 Excel 表” vs “接入教务系统 MySQL 数据库实时查询” |'
  const source = `现有资料暂不能判断。\n\n${table}\n\n这些未说明不是能力不足。`
  const before = message([{ type: 'text', text: source }])
  const original = JSON.stringify(before)
  const html = await render('MessagePartsRenderer', { message: before, presentation: 'student' })
  assert.match(html, /<table class="md-table">/)
  assert.match(html, /tabindex="0" role="region" aria-label="表格，可横向滚动"/)
  assert.match(html, /接入教务系统 MySQL 数据库实时查询/)
  assert.ok(html.indexOf('现有资料暂不能判断') < html.indexOf('<table') && html.indexOf('</table>') < html.indexOf('这些未说明不是能力不足'))
  assert.equal(JSON.stringify(before), original)
  assert.doesNotMatch(renderMarkdown(source), /<table/)
  assert.doesNotMatch(renderMarkdown(`\`\`\`text\n${table}\n\`\`\``, { studentTables: true }), /<table/)
  const unsafe = renderMarkdown('| 项目 | 内容 |\n|---|---|\n| <script>alert(1)</script> | [点此](javascript:alert(1)) ![图](https://unsafe.test/pixel) <img src=x onerror=alert(1)> |', { studentTables: true })
  assert.doesNotMatch(unsafe, /<script|<img|href="javascript:|onerror="/)
  assert.match(unsafe, /&lt;script&gt;/)
  const css = read(paths.MessagePartsRenderer)
  assert.match(css, /md-table-scroll[^\n]+overflow-x: auto/)
  assert.match(css, /md-table th[^\n]+min-width: 9rem; max-width: 24rem/)
})

test('student outcome uses the supplied next action, not identifiers or an automatic input/retry claim', async () => {
  const props = reactive({ message: { ...message([]), outcome: { status: 'running', run_id: 'run_private', next_action: 'poll_run' } }, presentation: 'student' })
  const view = await setup('MessagePartsRenderer', props)
  assert.equal(view.outcomeLabel(), '正在处理中。')
  props.message.outcome = { status: 'partial' }; await nextTick()
  assert.doesNotMatch(view.outcomeLabel(), /重试|补充|run_private/)
  props.message.outcome = { status: 'partial', next_action: 'answer_in_session' }; await nextTick()
  assert.match(view.outcomeLabel(), /回答/)
  props.message.outcome = { status: 'partial', next_action: 'poll_run' }; await nextTick()
  assert.match(view.outcomeLabel(), /处理进展/)
  assert.doesNotMatch(view.outcomeLabel(), /正在|仍在处理中/)
  props.message.outcome = { status: 'failed' }; await nextTick()
  assert.doesNotMatch(view.outcomeLabel(), /重试|重新发起/)
})

test('a tool without success evidence never defaults to a successful student label', async () => {
  const html = await render('ToolCallCard', { presentation: 'student', tool: { name: 'private_tool', task_id: 'private_task' } })
  assert.match(html, /尚未确认/)
  assert.doesNotMatch(html, /已处理|已完成|private_tool|private_task/)
  const done = await render('ToolCallCard', { presentation: 'student', tool: { status: 'done' } })
  assert.match(done, /这一步已完成/)
})

test('existing product mode labels do not expose internal codes or pretend unknown modes can be switched', async () => {
  for (const [to, label] of [['ask', '直接回答'], ['agent', '自动处理'], ['experts', '协作处理']]) {
    const html = await render('MessagePartsRenderer', { presentation: 'student', message: message([{ type: 'upgrade_hint', to, reason: '该请求更适合更高预算模式。' }]) })
    assert.ok(html.includes(`切换到 ${label}`))
    assert.doesNotMatch(html, /更高预算/)
  }
  const html = await render('MessagePartsRenderer', { presentation: 'student', message: message([{ type: 'upgrade_hint', to: 'INTERNAL_PLAN' }]) })
  assert.doesNotMatch(html, /INTERNAL_PLAN|切换到/)
})

test('upgrade business reasons stay intact; only exact known internal copy is projected and default callers are unchanged', async () => {
  for (const reason of ['先确认每周可投入的时间，才能按你的安排生成练习计划。', '这段经历尚未说明本人负责的部分，请先补清职责。', '你的活动预算是300元，需要结合预算与活动安排继续讨论。', '当前可处理的资料范围已用尽，剩余内容还未读取。']) {
    const item = { type: 'upgrade_hint', to: 'agent', reason }
    const html = await render('MessagePartsRenderer', { presentation: 'student', message: message([item]) })
    assert.ok(html.includes(reason))
    const legacy = await render('MessagePartsRenderer', { message: message([item]) })
    assert.ok(legacy.includes(reason))
  }
  const internal = { type: 'upgrade_hint', to: 'agent', reason: '该请求更适合更高预算模式。' }
  assert.doesNotMatch(await render('MessagePartsRenderer', { presentation: 'student', message: message([internal]) }), /更高预算/)
  assert.match(await render('MessagePartsRenderer', { message: message([internal]) }), /该请求更适合更高预算模式。/)
  assert.match(await render('MessagePartsRenderer', { presentation: 'student', message: message([{ type: 'upgrade_hint', to: 'agent' }]) }), /需要结合资料继续处理/)
})

test('only HTTP student assistant opts in; shared callers retain the default presentation contract', () => {
  const page = read('../src/views/student/AIAssistant.vue')
  assert.match(page, /:presentation="isHttpMode \? 'student' : undefined"/)
  assert.doesNotMatch(page, /content: userMsg \|\| \(taskRef \? `（已引用任务/)
  assert.doesNotMatch(read('../src/components/agent/TaskCompanionPanel.vue'), /presentation="student"/)
  assert.doesNotMatch(read('../src/components/career/ExplorationCompanion.vue'), /presentation="student"/)
  for (const [name, path] of Object.entries(paths)) {
    const { descriptor } = parse(read(path))
    const result = compileTemplate({ source: descriptor.template.content, filename: path, id: name, compilerOptions: { bindingMetadata: compileScript(descriptor, { id: name }).bindings } })
    assert.deepEqual(result.errors, [])
  }
})

test('raw reasoning fields are never rendered, while the assistant page uses truthful request status', async () => {
  const privateReasoning = 'PRIVATE_CHAIN_SHOULD_NOT_APPEAR'
  const html = await render('MessagePartsRenderer', {
    message: message([{ type: 'text', text: 'Visible answer' }], { thinking: privateReasoning, thinkingDuration: 9 }),
    presentation: 'student',
  })
  assert.ok(html.includes('Visible answer'))
  assert.ok(!html.includes(privateReasoning))

  const page = read('../src/views/student/AIAssistant.vue')
  assert.doesNotMatch(page, /simulateThinking|simulateStreaming|PRIVATE_CHAIN/)
  assert.match(page, /ai-request-status" role="status"/)
  assert.match(page, /showJumpToLatest/)
  assert.match(page, /onMessagesScroll/)

})

test('legacy generated task placeholder is friendly, while ordinary student text and model paragraphs are untouched', async () => {
  const source = read('../src/views/student/AIAssistant.vue')
  const fn = source.slice(source.indexOf('function displayUserText('), source.indexOf('function displayUserAttachments('))
  const code = (await transform(`export ${fn}`, { loader: 'ts', format: 'esm' })).code
  const { displayUserText } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  assert.equal(displayUserText('（已引用任务 task_private）'), '（已关联这次简历核对）')
  assert.equal(displayUserText('我的项目里有 task_private 这个字段，并不是个人任务编号。'), '我的项目里有 task_private 这个字段，并不是个人任务编号。')
  const prose = '原文里提到 task_private，但这不代表我负责整个项目。'
  assert.ok((await render('MessagePartsRenderer', { presentation: 'student', message: message([{ type: 'text', text: prose }]) })).includes(prose))
})

test('composer cannot accept a draft before the requested session has finished restoring', async () => {
  const source = read('../src/views/student/AIAssistant.vue')
  const mount = source.slice(source.indexOf('onMounted(async () => {'), source.indexOf('/** Transport modes'))
  const select = source.slice(source.indexOf('async function onSelectConversation('), source.indexOf('async function onDeleteConversation('))
  const stateDeclaration = source.match(/const composerRestoring = ref\([^\n]+\)/)?.[0] || ''
  let releaseBootstrap
  let releaseHistory
  const bootstrapGate = new Promise(resolve => { releaseBootstrap = resolve })
  const historyGate = new Promise(resolve => { releaseHistory = resolve })
  const agentChat = {
    activeSessionId: 'default', conversations: [{ sessionId: 'requested' }],
    async bootstrap() { await bootstrapGate },
    async switchSession(id) { this.activeSessionId = id; await historyGate },
  }
  let mounted
  const noop = () => {}
  globalThis.__assistantStartupTest = { agentChat, route: { query: { session_id: 'requested' } }, onMounted: fn => { mounted = fn }, window: { matchMedia: () => ({ matches: false }) }, getApiMode: () => 'http' }
  const harness = `import {ref,nextTick,watch} from 'vue'; const {agentChat,route,onMounted,window,getApiMode}=globalThis.__assistantStartupTest; const taskCompanionEnabled=false;
    const inputMessage=ref(''), loading=ref(false), isHttpMode=ref(true), workspaceView=ref('chat'), sidebarOpen=ref(true),isProcessing=ref(false),requestElapsed=ref(0),selectedExpert=ref(null),interactionMode=ref('agent');
    const clearAllTimers=()=>{},stopAllPolls=()=>{},closeComposerMenu=()=>{},scrollToBottom=()=>{},setInteractionMode=()=>{};
    ${stateDeclaration}\n${select}\n${mount}\nexport {inputMessage}; export const restoring=typeof composerRestoring==='undefined'?undefined:composerRestoring;`
  const code = (await transform(harness, { loader: 'ts', format: 'esm' })).code.replace(/from "vue"/g, `from ${JSON.stringify(import.meta.resolve('vue'))}`)
  const view = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  const boot = mounted()
  const editableBeforeBootstrap = !view.restoring?.value
  if (editableBeforeBootstrap) view.inputMessage.value = '页面刚出现时输入的真实问题'
  releaseBootstrap()
  await new Promise(resolve => setImmediate(resolve))
  const lostEarlyDraft = editableBeforeBootstrap && view.inputMessage.value === ''
  const editableBeforeHistory = !view.restoring?.value
  releaseHistory()
  await boot
  assert.equal(lostEarlyDraft, false, 'the real mount→select sequence cleared input accepted before initialization')
  assert.equal(editableBeforeBootstrap, false)
  assert.equal(editableBeforeHistory, false)
  assert.equal(view.restoring.value, false)
  view.inputMessage.value = '恢复后输入的问题'
  await nextTick()
  assert.equal(view.inputMessage.value, '恢复后输入的问题')
  assert.match(source, /:disabled="loading \|\| composerRestoring"/)
  assert.match(source, /正在恢复对话/)
})
