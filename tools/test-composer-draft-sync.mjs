import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(path.join(root, 'src/utils/composerDraftSync.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
const { ComposerDraftSynchronizer } = await import(moduleUrl)

class FakeEditor {
  text = ''
  changes = []
  onChange = () => {}

  getText() { return this.text }
  async reset() {
    this.text = ''
    this.changes.push(this.text)
    this.onChange(this.text)
  }
  async setText(text) {
    this.text = text
    this.changes.push(this.text)
    this.onChange(this.text)
  }
}

async function testQuickEntryWritesVisibleTextWithoutReplacingTheDraft() {
  const sync = new ComposerDraftSynchronizer()
  const editor = new FakeEditor()
  let draft = '学习计划'
  editor.onChange = (text) => {
    if (!sync.shouldIgnoreChange(text)) draft = text
  }
  await sync.schedule(() => ({ getSender: () => editor }), draft, (text) => text === draft)
  assert.equal(editor.getText(), '学习计划')
  assert.equal(draft, '学习计划')
  assert.deepEqual(editor.changes, ['', '学习计划'])
}

async function testUserEditAndClearRemainDraftChanges() {
  const sync = new ComposerDraftSynchronizer()
  const editor = new FakeEditor()
  let draft = '学习计划'
  await sync.schedule(() => ({ getSender: () => editor }), draft, (text) => text === draft)
  editor.text = '学习计划：每周安排'
  if (!sync.shouldIgnoreChange(editor.getText())) draft = editor.getText()
  assert.equal(draft, '学习计划：每周安排')
  await sync.schedule(() => ({ getSender: () => editor }), '', (text) => text === '')
  assert.equal(editor.getText(), '')
  assert.equal(draft, '学习计划：每周安排')
  // The XSender's actual clear event is a user/programmatic message change and
  // remains observable once no programmatic replacement is in progress.
  if (!sync.shouldIgnoreChange(editor.getText())) draft = editor.getText()
  assert.equal(draft, '')
}

async function testStaleAsyncQuickEntryCannotOverwriteNewerDraft() {
  const sync = new ComposerDraftSynchronizer()
  const editor = new FakeEditor()
  let draft = '旧计划'
  let markResetStarted
  let releaseFirstReset
  const resetStarted = new Promise((resolve) => { markResetStarted = resolve })
  const firstReset = new Promise((resolve) => { releaseFirstReset = resolve })
  const reset = editor.reset.bind(editor)
  let resetCount = 0
  editor.reset = async () => {
    resetCount += 1
    if (resetCount === 1) {
      markResetStarted()
      await firstReset
    }
    await reset()
  }

  const first = sync.schedule(() => ({ getSender: () => editor }), draft, (text) => text === draft)
  await resetStarted
  draft = '新计划'
  const second = sync.schedule(() => ({ getSender: () => editor }), draft, (text) => text === draft)
  releaseFirstReset()
  await Promise.all([first, second])
  assert.equal(editor.getText(), '新计划')
  assert.equal(editor.changes.at(-1), '新计划')
  assert.equal(editor.changes.includes('旧计划'), false)
}

await testQuickEntryWritesVisibleTextWithoutReplacingTheDraft()
await testUserEditAndClearRemainDraftChanges()
await testStaleAsyncQuickEntryCannotOverwriteNewerDraft()
console.log('composer-draft-sync: 3 passed (quick entry, edit/clear, stale async write)')
