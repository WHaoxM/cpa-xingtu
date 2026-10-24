<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores'
import { listReflectionDirections, getReflectionQuestionnaire, getLatestReflection, saveSelfReflection } from '@/api/career'
import type { ReflectionDirection, ReflectionQuestionnaire, ReflectionRecord, ReflectionSubmission } from '@/api/career'

const user = useUserStore(), owner = computed(() => user.currentUser?.id || '')
const phase = ref<'start' | 'quiz' | 'result'>('start')
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref('')
const directions = ref<ReflectionDirection[]>([]), latest = ref<ReflectionRecord | null>(null)
const mainDirections = computed(() => directions.value.filter(d => d.label === d.group))
const trackDirections = computed(() => directions.value.filter(d => d.label !== d.group))
const pack = ref<ReflectionQuestionnaire | null>(null), answers = ref<Record<string,string>>({}), index = ref(0)
const pending = ref<ReflectionSubmission | null>(null), uncertain = ref(false), versionChanged = ref(false)
let generation = 0, alive = true
const currentQuestion = computed(() => pack.value?.questions[index.value])
const complete = computed(() => !!pack.value && pack.value.questions.every(q => answers.value[q.id] !== undefined))
const dirty = computed(() => phase.value === 'quiz' && Object.keys(answers.value).length > 0)
const snapshot = computed(() => latest.value?.reflection)
const groupLabels = {not_started: '尚未接触', concept: '了解概念', practice: '已有实践', unknown: '暂无法判断'}
const summary = computed(() => {
  const counts = {not_started: 0, concept: 0, practice: 0, unknown: 0}
  const s = snapshot.value
  if (s) for (const answer of Object.values(s.answers)) {
    const option = s.options.find(o => o.id === answer)
    if (option) counts[option.group]++
  }
  return counts
})
const active = (id: string, epoch: number) => alive && owner.value === id && generation === epoch
const status = (e: unknown) => e && typeof e === 'object' && 'status' in e ? e.status : undefined
const reason = (e: unknown) => e && typeof e === 'object' && 'body' in e ? (e.body as {reason?:string})?.reason : undefined
function friendly(e: unknown) {
  if (e && typeof e === 'object' && 'kind' in e && e.kind === 'network') return '暂时无法连接自评服务，请稍后重新读取。'
  return e instanceof Error ? e.message : '自评服务暂不可用，请重试。'
}
function validateRecord(value?: ReflectionRecord): ReflectionRecord {
  if (!value || typeof value.assessment_id !== 'string') throw Error('保存记录未能核验，请重新读取。')
  if (value.reflection) {
    const s = value.reflection
    if (!s.direction?.label || !Array.isArray(s.questions) || !s.questions.length || !Array.isArray(s.options) || !s.answers
      || s.questions.some(q => !s.options.some(o => o.id === s.answers[q.id]))) throw Error('自评记录不完整，暂时无法完整回看。')
  }
  return value
}
async function readLatest(id: string) {
  try {
    const env = await getLatestReflection(id)
    if (!env.success) throw Error('最近记录读取失败，请重试。')
    return validateRecord(env.data)
  } catch (e) { if (status(e) === 404) return null; throw e }
}
async function initialize() {
  const id = owner.value, epoch = ++generation
  loading.value = true; error.value = ''; notice.value = ''
  latest.value = null; pack.value = null; answers.value = {}; pending.value = null; uncertain.value = false
  phase.value = 'start'; busy.value = false; versionChanged.value = false
  if (!id) { loading.value = false; error.value = '请先登录，再读取本人的自评记录。'; return }
  try {
    const [catalog, record] = await Promise.all([listReflectionDirections(), readLatest(id)])
    if (!catalog.success || !catalog.data || !Array.isArray(catalog.data.directions)) throw Error('自评方向暂不可用，请重试。')
    if (!active(id, epoch)) return
    directions.value = catalog.data.directions; latest.value = record
    phase.value = record ? 'result' : 'start'
  } catch (e) { if (active(id, epoch)) error.value = friendly(e) }
  finally { if (active(id, epoch)) loading.value = false }
}
async function selectDirection(direction: string) {
  if (busy.value) return
  const id = owner.value, epoch = ++generation
  busy.value = true; error.value = ''; notice.value = ''
  pack.value = null; answers.value = {}; pending.value = null; uncertain.value = false; versionChanged.value = false
  try {
    const env = await getReflectionQuestionnaire(direction)
    if (!env.success || !env.data || !env.data.questions?.length || !env.data.options?.length) throw Error('题目读取失败，请重试选择方向。')
    if (!active(id, epoch)) return
    pack.value = env.data; index.value = 0; phase.value = 'quiz'
  } catch (e) { if (active(id, epoch)) error.value = friendly(e) }
  finally { if (active(id, epoch)) busy.value = false }
}
function choose(option: string) {
  if (!currentQuestion.value || busy.value || uncertain.value) return
  answers.value = {...answers.value, [currentQuestion.value.id]: option}
  pending.value = null; error.value = ''; notice.value = ''
}
function body(): ReflectionSubmission {
  return {assessment_kind: 'self_reflection', submission_id: crypto.randomUUID(), direction_id: pack.value!.direction.id,
    questionnaire_version: pack.value!.version, answers: {...answers.value}}
}
function showSaved(record: ReflectionRecord, text: string) {
  latest.value = record; phase.value = 'result'; notice.value = text
  pending.value = null; uncertain.value = false; answers.value = {}; error.value = ''
}
async function reconcile() {
  if (!pending.value || busy.value) return
  const id = owner.value, epoch = generation, sid = pending.value.submission_id
  busy.value = true; error.value = ''
  try {
    const record = await readLatest(id)
    if (!active(id, epoch)) return
    if (record?.submission_id === sid) showSaved(record, '已从服务端找回本次保存的回答。')
    else error.value = '尚未找到可确认的本次记录。回答仍在本页；可稍后重新读取，或主动重试同一次提交。'
  } catch (e) { if (active(id, epoch)) error.value = friendly(e) }
  finally { if (active(id, epoch)) busy.value = false }
}
async function submit() {
  if (!complete.value || busy.value || !pack.value) return
  const id = owner.value, epoch = generation
  pending.value ??= body()
  const sent = pending.value
  busy.value = true; error.value = ''; notice.value = ''; versionChanged.value = false
  try {
    const env = await saveSelfReflection(sent)
    if (!active(id, epoch)) return
    const saved = validateRecord(env.data)
    if (!env.success || !saved.reflection || saved.submission_id !== sent.submission_id) throw Error('本次保存尚未核验。')
    const reread = await readLatest(id)
    if (!active(id, epoch)) return
    if (!reread) throw Error('保存响应已收到，但暂未读回记录。')
    if (reread.assessment_id === saved.assessment_id && reread.submission_id === sent.submission_id) {
      showSaved(reread, '已保存，并从服务端读回本次回答。')
    } else {
      showSaved(reread, '本次提交已保存；另一页面还有更新的提交，当前展示的是最近一次记录。')
    }
  } catch (e) {
    if (!active(id, epoch)) return
    versionChanged.value = reason(e) === 'questionnaire_changed'
    uncertain.value = !versionChanged.value
    error.value = versionChanged.value ? '题目已更新。当前回答尚未保存，请重新读取题目并逐项核对。' : `保存尚未确认：${friendly(e)}回答仍保留在本页。`
    // Read once after any ambiguous outcome; no automatic POST retry.
    if (!versionChanged.value && !(typeof status(e) === 'number' && Number(status(e)) >= 400 && Number(status(e)) < 500)) {
      try {
        const record = await readLatest(id)
        if (active(id, epoch) && record?.submission_id === sent.submission_id) showSaved(record, '保存响应未收到，已从服务端读回本次回答。')
      } catch { /* Keep the unresolved status and explicit retry/read controls. */ }
    }
  } finally { if (active(id, epoch)) busy.value = false }
}
async function startAgain() {
  phase.value = 'start'; answers.value = {}; pack.value = null; pending.value = null
  error.value = ''; notice.value = ''; uncertain.value = false; ++generation
}
async function reloadChangedPack() {
  if (!pack.value) return
  try {
    await ElMessageBox.confirm('重新读取会清空本页尚未提交的选择，请按新题目重新核对。', '题目已更新', {confirmButtonText: '重新读取并核对', cancelButtonText: '留在本页'})
    const direction = pack.value.direction.id; phase.value = 'start'; await selectDirection(direction)
  } catch { /* Student stays with the unsubmitted answers. */ }
}
function dateLabel(value?: string) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? '提交时间未提供' : new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)
}
function choiceLabel(question: string) {
  const saved = snapshot.value
  return saved?.options.find(option => option.id === saved.answers[question])?.label || '回答暂不可读'
}
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('本页回答尚未保存，离开后需要重新填写。', '离开未提交的自评？', {confirmButtonText:'离开，不保存',cancelButtonText:'继续填写'}); return true }
  catch { return false }
})
watch(owner, (_id, old) => {
  if (old && dirty.value) ElMessage.info('刚才未提交的回答没有保存，不会带入其他账号。')
  void initialize()
}, {immediate:true})
onBeforeUnmount(() => { alive = false; ++generation; window.removeEventListener('beforeunload', beforeUnload) })
</script>

<template>
  <main class="reflection-page">
    <header class="reflection-header"><p class="reflection-eyebrow">认识自己的下一步</p><h1>技能自评</h1><p>按你实际接触和实践的情况逐项整理。不确定，可以直接说不确定。</p></header>
    <aside class="reflection-boundary">这是本人自述，不是考试或能力认证，也不会自动改变简历、能力画像、岗位匹配或课程进度。</aside>
    <p v-if="loading" role="status">正在读取自评方向与本人最近记录…</p>
    <div v-if="error" class="reflection-error" role="alert">
      <p>{{ error }}</p><button v-if="!pack" :disabled="busy" @click="initialize">重新读取</button>
      <div v-if="uncertain" class="reflection-recovery"><button :disabled="busy" @click="reconcile">重新读取保存结果</button><button class="reflection-retry-submit" :disabled="busy" @click="submit">重试同一次提交</button></div>
      <button v-if="versionChanged" :disabled="busy" @click="reloadChangedPack">重新读取题目并核对</button>
    </div>
    <p v-if="notice" class="reflection-notice" role="status">{{ notice }}</p>
    <template v-if="!loading">
      <section v-if="phase === 'start' && !error" class="reflection-start">
        <h2>{{ latest ? '重新做一次自评' : '从你感兴趣的方向开始' }}</h2><p>题目只帮助你整理经历；这里的方向不代表真实岗位的招聘要求。</p>
        <div class="reflection-directions"><button v-for="direction in mainDirections" :key="direction.id" class="reflection-direction" :disabled="busy" @click="selectDirection(direction.id)"><strong>{{ direction.label }}</strong><span>从这个方向开始 →</span></button></div>
        <h3 class="reflection-tracks-heading">已有更具体的准备方向？</h3><p>也可以选择一个细分赛道，只整理相关主题。</p>
        <div class="reflection-directions"><button v-for="direction in trackDirections" :key="direction.id" class="reflection-direction" :disabled="busy" @click="selectDirection(direction.id)"><small>{{ direction.group }}</small><strong>{{ direction.label }}</strong><span>逐项整理 →</span></button></div>
        <p v-if="!directions.length">暂未提供可用自评方向。</p>
      </section>
      <section v-else-if="phase === 'quiz' && pack" class="reflection-quiz">
        <div class="reflection-quiz-head"><h2>{{ pack.direction.label }}</h2><span>第 {{ index + 1 }} / {{ pack.questions.length }} 项</span></div>
        <p class="reflection-unsaved">尚未提交。回答只保留在本页，离开不会自动保存。</p>
        <fieldset v-if="currentQuestion" :disabled="busy || uncertain || versionChanged" class="reflection-question"><legend>{{ currentQuestion.label }}</legend><p>你目前对这项技能的接触和实践情况是？</p><label v-for="option in pack.options" :key="option.id" class="reflection-option"><input type="radio" :name="currentQuestion.id" :value="option.id" :checked="answers[currentQuestion.id] === option.id" @change="choose(option.id)" /><span>{{ option.label }}</span></label></fieldset>
        <nav class="reflection-controls"><button :disabled="index === 0 || busy" @click="index--">上一项</button><button v-if="index < pack.questions.length - 1" :disabled="!currentQuestion || answers[currentQuestion.id] === undefined || busy" @click="index++">下一项</button><button v-else class="reflection-submit" :disabled="!complete || busy || uncertain || versionChanged" @click="submit">{{ busy ? '正在保存并核对…' : '提交并保存回答' }}</button></nav>
      </section>
      <section v-else-if="phase === 'result' && latest" class="reflection-result">
        <header class="reflection-result-head"><div><small>最近一次已保存的自评</small><h2>{{ snapshot?.direction.label || '旧版自评记录' }}</h2><p>{{ dateLabel(latest.created_at) }}</p></div><button class="reflection-start-again" @click="startAgain">重新做一次自评</button></header>
        <template v-if="snapshot"><div class="reflection-summary"><div v-for="(label, group) in groupLabels" :key="group"><strong>{{ summary[group] }} 项</strong><span>{{ label }}</span></div></div><p class="reflection-summary-note">分类只依据你当时选择的回答。尚未接触或只了解概念的项目可作为待补清单；未知项不算能力不足。</p><ol class="reflection-answers"><li v-for="question in snapshot.questions" :key="question.id"><h3>{{ question.label }}</h3><p>{{ choiceLabel(question.id) }}</p></li></ol></template>
        <div v-else class="reflection-legacy"><p>这份旧记录没有保存完整方向、题目和选项，无法恢复完整问答。你可以重新做一次自评。</p><p v-if="latest.weak_skills?.length">原记录中的待补项：{{ latest.weak_skills.join('、') }}</p></div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.reflection-page { max-width:1100px; margin:auto; padding:28px 24px 64px; color:var(--color-text); font:14px/1.7 var(--font-ui,sans-serif); }
.reflection-header h1 { font-size:28px; margin:2px 0 8px; }.reflection-header p { margin:0 0 10px; color:var(--color-text-muted); }.reflection-eyebrow { color:var(--color-primary)!important; font-size:12px; }
.reflection-boundary { padding:14px 18px; border-left:3px solid var(--color-primary); background:var(--color-surface); margin:18px 0 26px; color:var(--color-text-muted); }
.reflection-page button { border:1px solid var(--color-border); border-radius:10px; background:var(--color-surface); color:inherit; padding:10px 18px; min-height:42px; cursor:pointer; font:inherit; }.reflection-page button:disabled { opacity:.5; cursor:not-allowed; }
.reflection-page :is(button,input):focus-visible { outline:2px solid var(--color-primary); outline-offset:3px; }
.reflection-directions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }.reflection-direction { display:flex; flex-direction:column; align-items:start; gap:8px; text-align:left; }.reflection-direction strong { font-size:16px; }.reflection-direction small,.reflection-direction span { color:var(--color-text-muted); font-size:12px; }.reflection-direction:hover:not(:disabled) { border-color:var(--color-primary); }
.reflection-tracks-heading { margin-top:28px; margin-bottom:6px; font-size:18px; }
.reflection-error,.reflection-notice { padding:14px 18px; border-radius:10px; margin:16px 0; }.reflection-error { background:#fff4e9; border:1px solid #dec3aa; color:#80421f; }.reflection-error p { margin:0 0 10px; }.reflection-notice { background:var(--color-surface); border:1px solid var(--color-border); }
.reflection-quiz { max-width:720px; margin:24px auto; }.reflection-quiz-head,.reflection-result-head { display:flex; align-items:center; justify-content:space-between; gap:18px; }.reflection-quiz-head h2 { margin:0; }.reflection-quiz-head span,.reflection-unsaved { font-size:13px; color:var(--color-text-muted); }
.reflection-question { border:1px solid var(--color-border); background:var(--color-surface); border-radius:12px; padding:20px 24px 24px; margin:22px 0; min-width:0; }.reflection-question legend { font-size:20px; font-weight:600; max-width:100%; overflow-wrap:anywhere; }.reflection-question>p { color:var(--color-text-muted); }
.reflection-option { display:flex; gap:12px; align-items:center; border:1px solid var(--color-border); border-radius:10px; padding:13px 16px; margin-top:10px; cursor:pointer; }.reflection-option:has(input:checked) { border-color:var(--color-primary); background:color-mix(in srgb,var(--color-primary) 5%,var(--color-surface)); }.reflection-option input { accent-color:var(--color-primary); }
.reflection-controls,.reflection-recovery { display:flex; gap:12px; justify-content:space-between; margin:18px 0; flex-wrap:wrap; }.reflection-page .reflection-submit { background:var(--color-primary); border-color:var(--color-primary); color:white; }
.reflection-result { background:var(--color-surface); border:1px solid var(--color-border); border-radius:12px; padding:24px; }.reflection-result-head h2 { margin:4px 0; font-size:24px; }.reflection-result-head small,.reflection-result-head p { color:var(--color-text-muted); margin:0; }
.reflection-summary { display:grid; grid-template-columns:repeat(4,1fr); margin:24px 0 14px; gap:12px; }.reflection-summary>div { display:grid; padding:14px; border:1px solid var(--color-border); border-radius:10px; }.reflection-summary strong { font-size:22px; }.reflection-summary span,.reflection-summary-note { color:var(--color-text-muted); font-size:13px; }
.reflection-answers { padding-left:24px; margin-top:24px; }.reflection-answers li { padding:12px 0; border-top:1px solid var(--color-border); overflow-wrap:anywhere; }.reflection-answers h3 { margin:0 0 6px; font-size:16px; }.reflection-answers p { margin:0; color:var(--color-primary); }
@media(max-width:700px) { .reflection-page { padding:20px 16px; }.reflection-directions { grid-template-columns:1fr; }.reflection-summary { grid-template-columns:repeat(2,1fr); }.reflection-result-head { align-items:start; flex-direction:column; }.reflection-question { padding:16px; } }
</style>
