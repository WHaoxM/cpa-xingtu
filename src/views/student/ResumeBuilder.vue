<!-- 页面：快速制作简历（仿 magicv.art 三栏）；路由：student/resume-builder；角色：STUDENT -->
<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { generateHTML, generateJSON } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { useResumeStore } from '@/stores/resume'
import { useUserStore } from '@/stores'
import TiptapEditor from '@/components/TiptapEditor.vue'
import { parseResumeText } from '@/api/pipeline'
import { DEMO_STUDENT_ID, getApiMode } from '@/api/config'
import { getResumeDraft, saveResumeDraft, previewResumeDraft, type ResumeDraftForm, type ResumeFillPreview, type DraftGuidance } from '@/api/resumeDraft'
import { ApiError } from '@/api/types'
import { useAgentArtifactHandoff, commitMockArtifactHandoff } from '@/composables/useAgentArtifactHandoff'

const route       = useRoute()
const router      = useRouter()
const resumeStore = useResumeStore()
const userStore   = useUserStore()
const hasArtifactQuery = computed(() => Object.prototype.hasOwnProperty.call(route.query, 'artifact_id'))
const isHttpMode = getApiMode() === 'http'
const accountDraft = computed(() => isHttpMode && !hasArtifactQuery.value)
const artifactId = computed(() => typeof route.query.artifact_id === 'string' ? route.query.artifact_id.trim() : '')
const handoff = useAgentArtifactHandoff(() => artifactId.value)
type ResumeRecommendation = { id: string; target: 'basic' | 'skills' | 'projects' | 'selfEval'; title: string; detail: string; applied: boolean }
type ResumeArtifactPreview = {
  type?: string
  draft?: { name?: string; targetRole?: string; skills?: string[]; projects?: ProjectEntry[]; summary?: string; selfEval?: string }
  recommendations?: ResumeRecommendation[]
}
const artifactReady = computed(() => handoff.ready.value && handoff.artifact.value?.kind === 'file')
const resumePreview = computed<ResumeArtifactPreview | null>(() => artifactReady.value
  ? handoff.artifact.value?.preview as ResumeArtifactPreview ?? null
  : null)
const recommendations = computed<ResumeRecommendation[]>(() => {
  const items = resumePreview.value?.recommendations
  if (Array.isArray(items) && items.length) return items
  const artifact = handoff.artifact.value
  return artifactReady.value && artifact
    ? [{ id: 'summary', target: 'projects', title: artifact.title, detail: artifact.summary || '请结合简历内容编辑相关模块。', applied: false }]
    : []
})

function backToAgent() {
  void router.push({ name: 'student-ai-assistant', query: handoff.sessionId.value ? { session_id: handoff.sessionId.value } : {} })
}

function browseOrdinaryResume() {
  const query = { ...route.query }
  delete query.artifact_id
  delete query.session_id
  void router.replace({ path: route.path, query })
}

function commitResumePreview() {
  const artifact = handoff.artifact.value
  if (!artifactReady.value || !artifact) return
  const preview = (artifact.preview && typeof artifact.preview === 'object' ? artifact.preview : {}) as ResumeArtifactPreview
  preview.draft = {
    name: form.value.name,
    targetRole: form.value.targetRole,
    skills: [...form.value.skills],
    projects: form.value.projects.map(project => ({ ...project })),
    summary: form.value.summary,
    selfEval: form.value.selfEval,
  }
  artifact.preview = preview
  commitMockArtifactHandoff(handoff.sessionId.value, artifact)
}

function toggleRecommendation(id: string) {
  const artifact = handoff.artifact.value
  if (!artifactReady.value || !artifact) return
  const preview = (artifact.preview && typeof artifact.preview === 'object' ? artifact.preview : {}) as ResumeArtifactPreview
  if (!Array.isArray(preview.recommendations) || !preview.recommendations.length) preview.recommendations = recommendations.value.map(item => ({ ...item }))
  const item = preview.recommendations.find(candidate => candidate.id === id)
  if (!item) return
  item.applied = !item.applied
  artifact.preview = preview
  commitMockArtifactHandoff(handoff.sessionId.value, artifact)
}

/* ══ 类型定义 ══ */
interface ProjectEntry { name: string; role: string; desc: string }
interface HonorEntry   { type: 'cert' | 'intern' | 'award'; label: string }
interface WorkExpEntry { company: string; position: string; period: string; desc: string }
interface EduEntry     { school: string; major: string; degree: string; period: string; gpa: string }
type ModuleKey = 'basic' | 'skills' | 'work' | 'projects' | 'education' | 'honors' | 'selfEval'

/* ══ 表单数据 ══ */
const form = ref({
  name: '', phone: '', email: '', school: '', major: '',
  grade: '', targetRole: '', gpa: '', summary: '', sourceText: '',
  skills:     [] as string[],
  projects:   [{ name: '', role: '', desc: '' }] as ProjectEntry[],
  honors:     [] as HonorEntry[],
  workExps:   [] as WorkExpEntry[],
  educations: [] as EduEntry[],
  selfEval:   '',
})

watch(() => handoff.artifact.value, artifact => {
  if (!artifactReady.value || !artifact) return
  const draft = resumePreview.value?.draft
  if (!draft) return
  form.value.name = draft.name || ''
  form.value.targetRole = draft.targetRole || ''
  form.value.skills = Array.isArray(draft.skills) ? [...draft.skills] : []
  form.value.projects = Array.isArray(draft.projects) && draft.projects.length
    ? draft.projects.map(project => ({ ...project }))
    : [{ name: '', role: '', desc: '' }]
  form.value.summary = draft.summary || ''
  form.value.selfEval = draft.selfEval || ''
}, { immediate: true })

watch(form, () => { if (artifactReady.value) commitResumePreview() }, { deep: true })

watch(hasArtifactQuery, hasArtifact => {
  if (!hasArtifact) clearForm()
})

/* ══ UI 状态 ══ */
const activeModule = ref<ModuleKey>('basic')
const draftGuidance = ref<DraftGuidance|null>(null)
const accentColor  = ref('#F4514B')
const avatarBase64 = ref('')
const avatarInput  = ref<HTMLInputElement | null>(null)
const mobileNav    = ref<HTMLElement | null>(null)
const skillInput   = ref('')
const honorInput   = ref('')
const honorType    = ref<'cert' | 'intern' | 'award'>('intern')

/* Account draft: serialized saves with optimistic revision, never formal evidence. */
const draftLoading = ref(accountDraft.value)
const draftError = ref('')
const submitHint = ref('')
const saveState = ref<'idle' | 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict'>('idle')
const draftRevision = ref(0)
const submitting = ref(false)
const fillPreview = ref<ResumeFillPreview | null>(null)
const fillApplied = ref(false)
const previewError = ref('')
let loaded = false
let active = true
let owner = userStore.currentUser?.id
let generation = 0
let editGeneration = 0
let fillGeneration = 0
let savedSnapshot = ''
let pendingSave: Promise<boolean> | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined
const snapshot = () => JSON.stringify({ form: form.value, theme: accentColor.value })
const saveLabel = computed(() => ({idle: '草稿尚未保存', dirty: '有未保存的修改', saving: '保存中…', saved: '已保存到本人账号', failed: '保存失败，输入仍保留', conflict: '其他页面已更新草稿'}[saveState.value]))
const current = (gen: number) => active && generation === gen && owner === userStore.currentUser?.id

async function loadDraft() {
  if (!accountDraft.value) return
  clearTimeout(saveTimer)
  const gen = ++generation
  loaded = false
  draftLoading.value = true
  draftError.value = ''
  try {
    const env = await getResumeDraft()
    if (!current(gen)) return
    if (!env.success || !env.data) throw new Error('草稿未能读取')
    form.value = env.data.form
    accentColor.value = env.data.theme
    draftRevision.value = env.data.revision
    draftGuidance.value = env.data.guidance || null
    if(draftGuidance.value?.status==='current')activeModule.value=draftGuidance.value.advice.target
    savedSnapshot = snapshot()
    saveState.value = env.data.revision ? 'saved' : 'idle'
    // Vue watchers flush before this continuation; loading suppresses autosave.
    await Promise.resolve()
    loaded = true
  } catch (e) {
    if (current(gen)) draftError.value = e instanceof Error ? e.message : '暂时无法读取草稿'
  } finally {
    if (current(gen)) draftLoading.value = false
  }
}

async function flushDraft(): Promise<boolean> {
  clearTimeout(saveTimer)
  if (!accountDraft.value) return true
  if (!loaded || draftLoading.value || draftError.value || saveState.value === 'conflict') return false
  if (pendingSave) {
    if (!await pendingSave) return false
    return flushDraft()
  }
  if (snapshot() === savedSnapshot) return true
  const gen = generation
  const payload = snapshot()
  const parsed = JSON.parse(payload) as {form: ResumeDraftForm; theme: string}
  saveState.value = 'saving'
  const operation = (async () => {
    try {
      const env = await saveResumeDraft(parsed.form, parsed.theme, draftRevision.value)
      if (!current(gen)) return false
      if (!env.success || !env.data) throw new Error('草稿保存未确认')
      draftRevision.value = env.data.revision
      draftGuidance.value = env.data.guidance || null
      savedSnapshot = payload
      saveState.value = snapshot() === payload ? 'saved' : 'dirty'
      return true
    } catch (e) {
      if (current(gen)) {
        saveState.value = e instanceof ApiError && e.status === 409 ? 'conflict' : 'failed'
        draftError.value = ''
        ElMessage.error(e instanceof Error ? e.message : '保存失败，输入仍保留')
      }
      return false
    }
  })()
  pendingSave = operation
  const ok = await operation
  if (pendingSave === operation) pendingSave = null
  if (!ok) return false
  if (snapshot() !== savedSnapshot) return flushDraft()
  return true
}

watch([form, accentColor], () => {
  editGeneration += 1
  submitHint.value = ''
  if (!fillApplied.value) fillPreview.value = null
  if (!accountDraft.value || !loaded || draftLoading.value) return
  if (saveState.value === 'conflict') return
  saveState.value = snapshot() === savedSnapshot ? (draftRevision.value ? 'saved' : 'idle') : 'dirty'
  clearTimeout(saveTimer)
  if (saveState.value === 'dirty') saveTimer = setTimeout(() => void flushDraft(), 1000)
}, { deep: true, flush: 'sync' })

async function reloadDraft() {
  try {
    await ElMessageBox.confirm('重新载入会替换本页未保存的输入，请先复制需要保留的内容。', '重新载入草稿', {confirmButtonText: '重新载入', cancelButtonText: '保留本页'})
    await loadDraft()
  } catch { /* Keep local input. */ }
}
onMounted(() => void loadDraft())
watch(() => userStore.currentUser?.id, id => {
  generation += 1
  fillGeneration += 1
  clearTimeout(saveTimer)
  pendingSave = null
  loaded = false
  form.value = {name:'',phone:'',email:'',school:'',major:'',grade:'',targetRole:'',gpa:'',summary:'',sourceText:'',skills:[],projects:[],honors:[],workExps:[],educations:[],selfEval:''}
  fillPreview.value = null
  draftGuidance.value = null
  fillApplied.value = false
  importing.value = false
  previewError.value = ''
  submitHint.value = ''
  submitting.value = false
  draftRevision.value = 0
  savedSnapshot = ''
  owner = id
  if (id) void loadDraft()
})
onBeforeRouteLeave(async () => {
  if (!accountDraft.value || !loaded || owner !== userStore.currentUser?.id || snapshot() === savedSnapshot) return true
  if (await flushDraft()) return true
  try {
    await ElMessageBox.confirm('草稿还未保存。离开将丢失本页尚未保存的修改。', '保存未完成', {confirmButtonText:'放弃修改并离开', cancelButtonText:'继续填写'})
    return true
  } catch { return false }
})
function beforeUnload(event: BeforeUnloadEvent) {
  if (accountDraft.value && loaded && snapshot() !== savedSnapshot) {event.preventDefault(); event.returnValue = ''}
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => { active = false; generation += 1; clearTimeout(saveTimer); window.removeEventListener('beforeunload', beforeUnload) })
function safeRichText(value: string) {
  return generateHTML(generateJSON(value, [StarterKit, Underline]), [StarterKit, Underline])
}

/* ══ 模块配置 ══ */
const MODULES: { key: ModuleKey; label: string; icon: string; color: string }[] = [
  { key: 'basic',     label: '基本信息',    icon: 'lucide:user',         color: '#4A90D9' },
  { key: 'skills',    label: '专业技能',    icon: 'lucide:zap',          color: '#F5A623' },
  { key: 'work',      label: '工作经验',    icon: 'lucide:briefcase',    color: '#E8624B' },
  { key: 'projects',  label: '项目经历',    icon: 'lucide:folder-open',  color: '#2ABFAA' },
  { key: 'education', label: '教育经历',    icon: 'lucide:graduation-cap', color: '#E87AC5' },
  { key: 'honors',    label: '实习 & 荣誉', icon: 'lucide:award',        color: '#F5C842' },
  { key: 'selfEval',  label: '自我评价',    icon: 'lucide:message-square', color: '#9B59B6' },
]

const COLOR_PRESETS = ['#F4514B', '#1a1a1a', '#8B2500', '#B8292B', '#1a3a6b', '#1a5c3a', '#6b4c1a']

function selectModule(key: ModuleKey) {
  activeModule.value = key
  requestAnimationFrame(() => {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    mobileNav.value
      ?.querySelector<HTMLButtonElement>(`[data-module="${key}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior })
  })
}

const accentRgb = computed(() => {
  const hex = accentColor.value.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return `${r}, ${g}, ${b}`
})

const accentDeep = computed(() => {
  const hex = accentColor.value.replace('#', '')
  const r = Math.round(parseInt(hex.substring(0, 2), 16) * 0.35)
  const g = Math.round(parseInt(hex.substring(2, 4), 16) * 0.35)
  const b = Math.round(parseInt(hex.substring(4, 6), 16) * 0.35)
  return `rgb(${Math.max(r, 14)}, ${Math.max(g, 8)}, ${Math.max(b, 4)})`
})

/* ══ 头像 ══ */
function onAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { avatarBase64.value = reader.result as string }
  reader.readAsDataURL(file)
}

/* ══ 技能 ══ */
function addSkill() {
  const s = skillInput.value.trim()
  if (s && !form.value.skills.includes(s)) form.value.skills.push(s)
  skillInput.value = ''
}
function removeSkill(i: number) { form.value.skills.splice(i, 1) }
function onSkillKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill() }
}

/* ══ 项目 ══ */
function addProject()            { form.value.projects.push({ name: '', role: '', desc: '' }) }
function removeProject(i: number){ if (form.value.projects.length > 1) form.value.projects.splice(i, 1) }

/* ══ 工作经验 ══ */
function addWork()            { form.value.workExps.push({ company: '', position: '', period: '', desc: '' }) }
function removeWork(i: number){ form.value.workExps.splice(i, 1) }

/* ══ 教育经历 ══ */
function addEdu()            { form.value.educations.push({ school: '', major: '', degree: '', period: '', gpa: '' }) }
function removeEdu(i: number){ form.value.educations.splice(i, 1) }

/* ══ 实习 & 荣誉 ══ */
function addHonor() {
  const s = honorInput.value.trim()
  if (s) form.value.honors.push({ type: honorType.value, label: s })
  honorInput.value = ''
}
function removeHonor(i: number) { form.value.honors.splice(i, 1) }

/* ══ HTML → 纯文本（供 CareerNavigation 使用）══ */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/* ══ 生成简历文本 ══ */
const resumeText = computed(() => {
  const f = form.value
  const lines: string[] = []
  lines.push(f.name || '（未填写姓名）')
  const meta = [f.school, f.major, f.grade, f.gpa ? `GPA ${f.gpa}` : ''].filter(Boolean)
  if (meta.length) lines.push(meta.join(' | '))
  const contact = [f.phone, f.email, f.targetRole ? `目标方向：${f.targetRole}` : ''].filter(Boolean)
  if (contact.length) lines.push(contact.join(' | '))
  if (f.summary) { lines.push(''); lines.push('【个人总结】'); lines.push(f.summary) }
  if (f.skills.length) { lines.push(''); lines.push('【专业技能】'); lines.push(f.skills.join(' · ')) }
  const vWork = f.workExps.filter(w => w.company.trim())
  if (vWork.length) {
    lines.push(''); lines.push('【工作经验】')
    vWork.forEach(w => {
      lines.push(`${w.company}${w.position ? ` | ${w.position}` : ''}${w.period ? ` | ${w.period}` : ''}`)
      if (w.desc) lines.push(stripHtml(w.desc))
    })
  }
  const vProj = f.projects.filter(p => p.name.trim())
  if (vProj.length) {
    lines.push(''); lines.push('【项目经历】')
    vProj.forEach(p => {
      lines.push(`${p.name}${p.role ? ` | 担任：${p.role}` : ''}`)
      if (p.desc) lines.push(stripHtml(p.desc))
    })
  }
  const vEdu = f.educations.filter(e => e.school.trim())
  if (vEdu.length) {
    lines.push(''); lines.push('【教育经历】')
    vEdu.forEach(e => {
      lines.push(`${e.school}${e.major ? ` | ${e.major}` : ''}${e.degree ? ` | ${e.degree}` : ''}${e.period ? ` | ${e.period}` : ''}${e.gpa ? ` | GPA ${e.gpa}` : ''}`)
    })
  }
  const interns = f.honors.filter(h => h.type === 'intern')
  const certs   = f.honors.filter(h => h.type === 'cert')
  const awards  = f.honors.filter(h => h.type === 'award')
  if (interns.length) { lines.push(''); lines.push('【实习经历】'); interns.forEach(h => lines.push(h.label)) }
  if (certs.length)   { lines.push(''); lines.push('【证书资质】'); certs.forEach(h => lines.push(h.label)) }
  if (awards.length)  { lines.push(''); lines.push('【获奖荣誉】'); awards.forEach(h => lines.push(h.label)) }
  if (f.selfEval)     { lines.push(''); lines.push('【自我评价】'); lines.push(stripHtml(f.selfEval)) }
  return lines.join('\n')
})

/* ══ 粘贴解析填充 ══ */
const mockImportText = ref('')
const importText = computed({ get: () => accountDraft.value ? form.value.sourceText : mockImportText.value,
  set: value => { if (accountDraft.value) form.value.sourceText = value; else mockImportText.value = value } })
const importing = ref(false)
const showImport = ref(false)

async function importFromParse() {
  if (isHttpMode) {
    const text = importText.value.trim()
    if (!text) { ElMessage.warning('请先粘贴你自己的经历文字'); return }
    const request = ++fillGeneration, gen = generation, edits = editGeneration
    importing.value = true
    fillApplied.value = false
    fillPreview.value = null
    previewError.value = ''
    try {
      const env = await previewResumeDraft(text)
      if (!current(gen) || request !== fillGeneration) return
      if (edits !== editGeneration) { previewError.value = '读取期间内容已修改，请重新读取以免覆盖新输入'; return }
      if (!env.success || !env.data) throw new Error('未能取得建议')
      fillPreview.value = env.data
      fillApplied.value = false
    } catch (e) {
      if (current(gen) && request === fillGeneration) previewError.value = e instanceof Error ? e.message : '读取失败，原表单未改变'
    } finally {
      if (current(gen) && request === fillGeneration) importing.value = false
    }
    return
  }
  const text = importText.value.trim() || resumeText.value.trim()
  if (!text) {
    ElMessage.warning('请先粘贴简历文本')
    return
  }
  importing.value = true
  try {
    const env = await parseResumeText({
      text,
      student_id: userStore.currentUser?.id || DEMO_STUDENT_ID,
      source: 'resume-builder',
    })
    const data = env.data as {
      name?: string
      contact?: { phone?: string; email?: string }
      education?: Array<{ school?: string; major?: string; degree?: string }>
      skills?: Array<string | { name?: string }>
      raw_text?: string
    } | undefined
    if (!data) throw new Error('empty parse')

    if (data.name) form.value.name = data.name
    if (data.contact?.phone) form.value.phone = data.contact.phone
    if (data.contact?.email) form.value.email = data.contact.email
    const edu0 = data.education?.[0]
    if (edu0?.school) form.value.school = edu0.school
    if (edu0?.major) form.value.major = edu0.major
    if (edu0 && form.value.educations[0]) {
      form.value.educations[0] = {
        school: edu0.school || '',
        major: edu0.major || '',
        degree: edu0.degree || '',
        period: '',
        gpa: '',
      }
    } else if (edu0) {
      form.value.educations = [{
        school: edu0.school || '',
        major: edu0.major || '',
        degree: edu0.degree || '',
        period: '',
        gpa: '',
      }]
    }
    if (data.skills?.length) {
      form.value.skills = data.skills.map(s => (typeof s === 'string' ? s : String(s?.name ?? ''))).filter(Boolean)
    }
    showImport.value = false
    ElMessage.success('已根据解析结果填充表单')
  } catch (e) {
    console.warn('[resume-builder] parse failed', e)
    ElMessage.error('解析失败，请检查文本后重试')
  } finally {
    importing.value = false
  }
}

/* ══ 操作 ══ */
async function applyFill(overwrite = false) {
  if (fillApplied.value) return
  const preview = fillPreview.value
  if (!preview) return
  if (overwrite) {
    try { await ElMessageBox.confirm('将用建议替换已有的对应字段和列表，请对照原文核对。', '确认覆盖', {confirmButtonText:'确认替换', cancelButtonText:'取消'}) }
    catch { return }
    if (fillPreview.value !== preview) return
  }
  const next = structuredClone(JSON.parse(JSON.stringify(form.value))) as ResumeDraftForm
  for (const key of ['name','phone','email','school','major','grade','targetRole','gpa','summary','selfEval'] as const) {
    if (preview.form[key] && (overwrite || !next[key].trim())) next[key] = preview.form[key]
  }
  for (const key of ['skills','projects','honors','workExps','educations'] as const) {
    if (preview.form[key].length && (overwrite || !next[key].some(item => typeof item === 'string' ? item.trim() : Object.values(item).some(v => v.trim())))) {
      // Keys are correlated array types; assign through their shared record projection.
      Object.assign(next, {[key]: preview.form[key]})
    }
  }
  fillApplied.value = true
  form.value = next
  showImport.value = false
  ElMessage.success('已应用到草稿，仍需核对后提交')
}
async function useResume() {
  if (accountDraft.value) {
    if (submitting.value) return
    const submitOwner = userStore.currentUser?.id
    const submitGeneration = generation
    submitting.value = true
    submitHint.value = ''
    try {
      if (!await flushDraft()) return
      if (!draftRevision.value) {submitHint.value = '请先填写足够的经历内容再提交核对'; return}
      if (submitOwner !== userStore.currentUser?.id || !current(submitGeneration)) return
      const env = await getResumeDraft()
      if (submitOwner !== userStore.currentUser?.id || !current(submitGeneration)) return
      if (!env.data || env.data.revision !== draftRevision.value) {saveState.value = 'conflict'; return}
      if (env.data.text.trim().length < 20) {submitHint.value = '请先填写足够的经历内容再提交核对'; return}
      await router.push({name:'student-career-navigation', query:{new_resume:'1', draft_revision:String(draftRevision.value)}})
    } catch (e) {
      if (current(submitGeneration)) submitHint.value = e instanceof Error ? e.message : '暂时无法核对已保存草稿，请重试；草稿仍保留'
    } finally { if (current(submitGeneration)) submitting.value = false }
    return
  }
  resumeStore.setDraftText(resumeText.value)
  router.push({ name: 'student-career-navigation' })
}
function clearForm() {
  form.value = {
    name: '', phone: '', email: '', school: '', major: '',
    grade: '', targetRole: '', gpa: '', summary: '', sourceText: '',
    skills: [], projects: [{ name: '', role: '', desc: '' }],
    honors: [], workExps: [], educations: [], selfEval: '',
  }
  avatarBase64.value = ''
  importText.value = ''
}

const gradeOptions    = ['大一', '大二', '大三', '大四', '研一', '研二', '研三', '已毕业']
const degreeOptions   = ['本科', '硕士', '博士', '专科', '其他']
const honorTypeLabels = { cert: '证书', intern: '实习', award: '获奖' } as const
const honorTypeIcons  = { cert: 'lucide:award', intern: 'lucide:briefcase', award: 'lucide:trophy' } as const
</script>

<template>
  <div class="rb-page" :style="{ '--accent': accentColor, '--accent-rgb': accentRgb, '--accent-deep': accentDeep }">

    <!-- ══ HEADER ══ -->
    <header class="rb-hdr">
      <button class="rb-hdr-back" @click="hasArtifactQuery ? backToAgent() : router.push({ name: 'student-career-navigation' })">
        <Icon icon="lucide:arrow-left" :width="14"/>{{ hasArtifactQuery ? '返回对话' : '返回' }}
      </button>
      <span class="rb-hdr-title">{{ artifactReady ? '简历改进 · ' + handoff.artifact.value?.title : '快速制作简历' }}</span>
      <div class="rb-hdr-actions">
        <button v-if="hasArtifactQuery" class="rb-ghost-btn rb-agent-exit" type="button" @click="browseOrdinaryResume">退出对话产物</button>
        <button class="rb-ghost-btn" type="button" :disabled="accountDraft && (draftLoading || !!draftError)" @click="showImport = !showImport">
          <Icon icon="lucide:sparkles" :width="13"/>智能填充
        </button>
        <button class="rb-ghost-btn" disabled title="后端接入后开放">
          <Icon icon="lucide:download" :width="13"/>下载 PDF
          <span class="rb-soon-badge">即将开放</span>
        </button>
        <button class="rb-use-btn" :disabled="(hasArtifactQuery && !artifactReady) || (accountDraft && (draftLoading || !!draftError || submitting || saveState === 'conflict'))" @click="useResume">
          <Icon icon="lucide:check" :width="13"/>{{ accountDraft ? (submitting ? '正在准备…' : '提交并核对简历') : '使用此简历' }}
        </button>
      </div>
    </header>
    <div v-if="accountDraft" class="rb-draft-status" role="status" aria-live="polite">
      <span>{{ draftLoading ? '正在读取本人草稿…' : (draftError || saveLabel) }}</span>
      <button v-if="draftError" type="button" @click="loadDraft">重新读取</button>
      <button v-if="saveState === 'failed'" type="button" @click="flushDraft">重试保存</button>
      <button v-if="saveState === 'conflict'" type="button" @click="reloadDraft">重新载入并核对</button>
      <small>草稿尚未成为正式资料；提交后还需解析并由你确认。</small>
      <p v-if="submitHint" class="rb-submit-hint" role="alert">{{ submitHint }}</p>
    </div>

    <details v-if="accountDraft && draftGuidance" class="rb-guidance">
      <summary>本次修改指引 · {{ draftGuidance.advice.title }} <span>{{ draftGuidance.status==='current' ? '尚未自动应用' : '来源已变化或暂不可核对' }}</span></summary>
      <template v-if="draftGuidance.status==='current'">
        <p v-if="draftGuidance.origin==='existing_draft'">你正在继续现有草稿，没有套入诊断的预填内容。请自行对照这条来自已确认简历的建议。</p>
        <p>{{ draftGuidance.advice.problem }} · {{ draftGuidance.advice.why }}</p>
        <blockquote>{{ draftGuidance.advice.source_text }}</blockquote>
        <ul><li v-for="q in draftGuidance.advice.questions" :key="q">{{ q }}</li></ul>
        <p>{{ draftGuidance.advice.outline }}</p><small>括号是待填写提示，不是你的经历。保存草稿后仍须提交并核对。</small>
      </template>
      <p v-else>草稿已保留，但旧诊断不再作为当前修改依据。可手动继续编辑，或返回职途导航读取新诊断。</p>
    </details>
    <div v-if="hasArtifactQuery && !artifactReady" class="rb-agent-state" role="status">
      <Icon :icon="handoff.loading.value ? 'lucide:loader-circle' : 'lucide:circle-alert'" :width="26" />
      <h2>{{ handoff.loading.value ? '正在读取对话中的简历' : '无法打开这份简历改进产物' }}</h2>
      <p v-if="!handoff.loading.value">{{ handoff.error.value || '成果物类型与简历页面不匹配。' }}</p>
      <button type="button" @click="browseOrdinaryResume">浏览普通简历制作</button>
    </div>

    <div v-if="(!hasArtifactQuery || artifactReady) && showImport && !draftLoading && !draftError" class="rb-import-panel">
      <textarea
        v-model="importText"
        class="rb-import-ta"
        rows="5"
        placeholder="粘贴你自己的经历文字，先读取填充建议；不会修改正式资料"
      />
      <div class="rb-import-actions">
        <button class="rb-ghost-btn" type="button" :disabled="importing" @click="importFromParse">
          <Icon icon="lucide:wand-2" :width="13"/>
          {{ importing ? '正在读取…' : (isHttpMode ? '读取填充建议' : '解析并填充') }}
        </button>
        <button class="rb-ghost-btn" type="button" @click="showImport = false">取消</button>
      </div>
      <p v-if="previewError" role="alert">{{ previewError }}</p>
      <section v-if="fillPreview" class="rb-fill-preview">
        <h2>{{ fillApplied ? '上次已应用的建议（只读回看）' : '待核对的填充建议' }}{{ fillPreview.status === 'partial' ? ' · 部分读取' : '' }}</h2>
        <p v-if="fillApplied">这是上次应用时的建议，不会随当前编辑内容更新。</p>
        <p v-for="warning in fillPreview.warnings" :key="warning">{{ warning }}</p>
        <dl class="rb-suggestion-fields">
          <template v-for="(label, key) in {name:'姓名',school:'学校',major:'专业',grade:'年级',targetRole:'意向方向',gpa:'GPA',phone:'手机',email:'邮箱'}" :key="key">
            <template v-if="fillPreview.form[key]"><dt>{{ label }}</dt><dd>{{ fillPreview.form[key] }}</dd></template>
          </template>
          <template v-if="fillPreview.form.skills.length"><dt>技能</dt><dd>{{ fillPreview.form.skills.join('、') }}</dd></template>
        </dl>
        <article v-for="(project, index) in fillPreview.form.projects" :key="index" class="rb-suggestion-project"><h3>{{ project.name || '项目名称待补充' }}</h3><p v-if="project.role">参与角色：{{ project.role }}</p><p>{{ stripHtml(project.desc) }}</p></article>
        <ul v-if="fillPreview.form.honors.length"><li v-for="(honor, index) in fillPreview.form.honors" :key="`h${index}`">{{ honor.label }}</li></ul>
        <button v-if="!fillApplied" class="rb-use-btn" type="button" @click="applyFill(false)">核对后补充空白字段</button>
        <button v-if="!fillApplied" class="rb-ghost-btn" type="button" @click="applyFill(true)">核对并替换对应字段…</button>
      </section>
    </div>

    <div v-if="fillApplied && !showImport" class="rb-applied-summary" role="status"><div><strong>已应用到草稿，尚需提交确认</strong><p>请在编辑区核对内容，右侧同步预览；原文和建议仍可展开查看。</p></div><button class="rb-ghost-btn" type="button" @click="showImport = true">查看原文与建议</button></div>

    <nav
      v-if="(!hasArtifactQuery || artifactReady) && !draftLoading && !draftError"
      ref="mobileNav"
      class="rb-mobile-nav"
      aria-label="简历内容分段"
    >
      <button
        v-for="m in MODULES"
        :key="m.key"
        type="button"
        class="rb-mobile-tab"
        :class="{ 'rb-mobile-tab--active': activeModule === m.key }"
        :aria-pressed="activeModule === m.key"
        :data-module="m.key"
        @click="selectModule(m.key)"
      >
        <span class="rb-mobile-tab-icon"><Icon :icon="m.icon" :width="22" aria-hidden="true" /></span>
        <span class="rb-mobile-tab-label">{{ m.label }}</span>
      </button>
    </nav>

    <!-- ══ BODY 三栏 ══ -->
    <div v-if="(!hasArtifactQuery || artifactReady) && !draftLoading && !draftError" class="rb-body" :inert="submitting">

      <!-- ══ LEFT: 模块导航 ══ -->
      <aside class="rb-left">
        <div v-if="artifactReady" class="rb-agent-advice">
          <span class="rb-agent-advice__eyebrow">来自 Agent 对话 · 演示简历</span>
          <strong>{{ handoff.artifact.value?.title }}</strong>
          <p>{{ handoff.artifact.value?.summary }}</p>
          <div v-for="item in recommendations" :key="item.id" class="rb-agent-advice__item">
            <button type="button" :aria-label="item.applied ? `取消完成 ${item.title}` : `完成 ${item.title}`" @click="toggleRecommendation(item.id)"><Icon :icon="item.applied ? 'lucide:check-circle-2' : 'lucide:circle'" :width="15" /></button>
            <div><b>{{ item.title }}</b><small>{{ item.detail }}</small><button type="button" class="rb-agent-advice__jump" @click="selectModule(item.target)">去修改 →</button></div>
          </div>
        </div>
        <div class="rb-left-section-hd">布局</div>
        <div class="rb-module-list">
          <button
            v-for="m in MODULES" :key="m.key"
            class="rb-module-btn"
            :class="{ 'rb-module-btn--active': activeModule === m.key }"
            @click="selectModule(m.key)"
          >
            <span class="rb-module-icon" :style="{ background: m.color + '22', color: m.color }">
              <Icon :icon="m.icon" :width="13"/>
            </span>
            <span class="rb-module-label">{{ m.label }}</span>
          </button>
        </div>

        <div class="rb-left-sep"/>

        <div class="rb-left-section-hd">主题色</div>
        <div class="rb-color-row">
          <button
            v-for="c in COLOR_PRESETS" :key="c"
            class="rb-color-dot"
            :class="{ 'rb-color-dot--active': accentColor === c }"
            :style="{ background: c }"
            :title="c"
            @click="accentColor = c"
          />
        </div>
      </aside>

      <!-- ══ MIDDLE: 模块编辑器 ══ -->
      <main class="rb-mid">
        <!-- 模块标题 -->
        <div class="rb-mid-hd">
          <span class="rb-mid-hd-icon"
            :style="{ color: MODULES.find(m => m.key === activeModule)?.color }">
            <Icon :icon="MODULES.find(m => m.key === activeModule)?.icon ?? 'lucide:file'" :width="22"/>
          </span>
          <span class="rb-mid-hd-copy">
            <strong>{{ MODULES.find(m => m.key === activeModule)?.label }}</strong>
            <small v-if="activeModule === 'basic'">填写个人基本信息，让企业更好地了解你</small>
          </span>
        </div>

        <!-- 模块内容 -->
        <div class="rb-mid-body">

          <div v-if="artifactReady" class="rb-agent-advice rb-agent-advice--mobile">
            <span class="rb-agent-advice__eyebrow">来自 Agent 对话 · 演示简历</span>
            <strong>{{ handoff.artifact.value?.title }}</strong>
            <p>{{ handoff.artifact.value?.summary }}</p>
            <div v-for="item in recommendations" :key="item.id" class="rb-agent-advice__item">
              <button type="button" :aria-label="item.applied ? `取消完成 ${item.title}` : `完成 ${item.title}`" @click="toggleRecommendation(item.id)"><Icon :icon="item.applied ? 'lucide:check-circle-2' : 'lucide:circle'" :width="18" /></button>
              <div><b>{{ item.title }}</b><small>{{ item.detail }}</small><button type="button" class="rb-agent-advice__jump" @click="selectModule(item.target)">去修改 →</button></div>
            </div>
          </div>

          <!-- ── 基本信息 ── -->
          <template v-if="activeModule === 'basic'">
            <div v-if="!isHttpMode" class="rb-form-group">
              <div class="rb-form-group-title">资料</div>
              <div class="rb-field-row rb-field-row--avatar">
                <div class="rb-frow-l">
                  <Icon icon="lucide:image" :width="13" class="rb-frow-ico"/>
                  <span class="rb-frow-lbl">头像</span>
                </div>
                <button type="button" class="rb-avatar-box" aria-label="上传头像" @click="avatarInput?.click()">
                  <img v-if="avatarBase64" :src="avatarBase64" class="rb-avi" alt="头像"/>
                  <Icon v-else icon="lucide:camera" :width="16" class="rb-avi-ph"/>
                </button>
                <div class="rb-avatar-hint">
                  <span>点击上传头像</span>
                  <small>支持图片格式</small>
                </div>
                <input ref="avatarInput" type="file" accept="image/*" class="rb-hidden" @change="onAvatarChange"/>
              </div>
            </div>

            <div class="rb-form-group">
              <div class="rb-form-group-title">基础字段</div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:user" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">姓名</span></div>
                <input v-model="form.name" class="rb-finput" placeholder="请输入姓名"/>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:target" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">职位</span></div>
                <input v-model="form.targetRole" class="rb-finput" placeholder="目标职位 / 方向"/>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:phone" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">手机</span></div>
                <input v-model="form.phone" class="rb-finput" placeholder="13800000000"/>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:mail" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">邮箱</span></div>
                <input v-model="form.email" class="rb-finput" placeholder="name@email.com"/>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:building-2" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">学校</span></div>
                <input v-model="form.school" class="rb-finput" placeholder="就读学校"/>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:book-open" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">专业</span></div>
                <input v-model="form.major" class="rb-finput" placeholder="如：计算机科学"/>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:layers" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">年级</span></div>
                <select v-model="form.grade" class="rb-finput rb-fselect">
                  <option value="">请选择</option>
                  <option v-for="g in gradeOptions" :key="g" :value="g">{{ g }}</option>
                </select>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:star" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">GPA</span></div>
                <input v-model="form.gpa" class="rb-finput" placeholder="如：3.85"/>
              </div>
            </div>

            <div class="rb-form-group">
              <div class="rb-form-group-title">个人总结</div>
              <textarea v-model="form.summary" class="rb-ftextarea" rows="4"
                placeholder="用 2-3 句话概括技术方向和优势…"/>
            </div>
          </template>

          <!-- ── 专业技能 ── -->
          <template v-else-if="activeModule === 'skills'">
            <div class="rb-form-group">
              <div class="rb-form-group-title">添加技能标签</div>
              <div class="rb-tag-row">
                <input v-model="skillInput" class="rb-finput" style="flex:1"
                  placeholder="输入技能，按 Enter 或 , 确认…"
                  @keydown="onSkillKey"/>
                <button class="rb-add-btn" @click="addSkill">
                  <Icon icon="lucide:plus" :width="14"/>
                </button>
              </div>
              <div class="rb-skill-chips">
                <span v-for="(s, i) in form.skills" :key="s" class="rb-stag">
                  {{ s }}
                  <button class="rb-stag-x" @click="removeSkill(i)">
                    <Icon icon="lucide:x" :width="9"/>
                  </button>
                </span>
                <span v-if="!form.skills.length" class="rb-hint-text">暂未添加技能</span>
              </div>
            </div>
          </template>

          <!-- ── 工作经验 ── -->
          <template v-else-if="activeModule === 'work'">
            <p v-if="!form.workExps.length" class="rb-hint-text" style="text-align:center;padding:20px 0">
              点击下方按钮添加工作经历
            </p>
            <div v-for="(w, i) in form.workExps" :key="i" class="rb-entry-card">
              <div class="rb-entry-hd">
                <span class="rb-entry-num">{{ i + 1 }}</span>
                <span class="rb-entry-name">{{ w.company || '未填写公司' }}</span>
                <button class="rb-entry-del" @click="removeWork(i)">
                  <Icon icon="lucide:trash-2" :width="12"/>
                </button>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:building-2" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">公司</span></div>
                <input v-model="w.company" class="rb-finput" placeholder="公司名称"/>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:briefcase" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">职位</span></div>
                <input v-model="w.position" class="rb-finput" placeholder="担任职位"/>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:calendar" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">时间</span></div>
                <input v-model="w.period" class="rb-finput" placeholder="2023.07 – 2024.01"/>
              </div>
              <div class="rb-field-col">
                <span class="rb-fcol-lbl">工作描述</span>
                <TiptapEditor v-model="w.desc" placeholder="描述主要职责和成果，可使用列表…"/>
              </div>
            </div>
            <button class="rb-add-entry-btn" @click="addWork">
              <Icon icon="lucide:plus" :width="13"/>添加工作经历
            </button>
          </template>

          <!-- ── 项目经历 ── -->
          <template v-else-if="activeModule === 'projects'">
            <div v-for="(p, i) in form.projects" :key="i" class="rb-entry-card">
              <div class="rb-entry-hd">
                <span class="rb-entry-num">{{ i + 1 }}</span>
                <span class="rb-entry-name">{{ p.name || '未命名项目' }}</span>
                <button v-if="form.projects.length > 1" class="rb-entry-del" @click="removeProject(i)">
                  <Icon icon="lucide:trash-2" :width="12"/>
                </button>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:folder" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">项目名</span></div>
                <input v-model="p.name" class="rb-finput" placeholder="项目名称"/>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:user-check" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">角色</span></div>
                <input v-model="p.role" class="rb-finput" placeholder="核心开发 / 组长"/>
              </div>
              <div class="rb-field-col">
                <span class="rb-fcol-lbl">项目描述</span>
                <TiptapEditor v-model="p.desc" placeholder="描述项目背景、你的贡献和量化成果…"/>
              </div>
            </div>
            <button class="rb-add-entry-btn" @click="addProject">
              <Icon icon="lucide:plus" :width="13"/>添加项目
            </button>
          </template>

          <!-- ── 教育经历 ── -->
          <template v-else-if="activeModule === 'education'">
            <p v-if="!form.educations.length" class="rb-hint-text" style="text-align:center;padding:20px 0">
              点击下方按钮添加教育经历
            </p>
            <div v-for="(e, i) in form.educations" :key="i" class="rb-entry-card">
              <div class="rb-entry-hd">
                <span class="rb-entry-num">{{ i + 1 }}</span>
                <span class="rb-entry-name">{{ e.school || '未填写学校' }}</span>
                <button class="rb-entry-del" @click="removeEdu(i)">
                  <Icon icon="lucide:trash-2" :width="12"/>
                </button>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:building-2" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">学校</span></div>
                <input v-model="e.school" class="rb-finput" placeholder="学校名称"/>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:book-open" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">专业</span></div>
                <input v-model="e.major" class="rb-finput" placeholder="专业名称"/>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:graduation-cap" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">学历</span></div>
                <select v-model="e.degree" class="rb-finput rb-fselect">
                  <option value="">请选择</option>
                  <option v-for="d in degreeOptions" :key="d" :value="d">{{ d }}</option>
                </select>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:calendar" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">时间</span></div>
                <input v-model="e.period" class="rb-finput" placeholder="2020.09 – 2024.06"/>
              </div>
              <div class="rb-field-row">
                <div class="rb-frow-l"><Icon icon="lucide:star" :width="13" class="rb-frow-ico"/><span class="rb-frow-lbl">GPA</span></div>
                <input v-model="e.gpa" class="rb-finput" placeholder="如：3.85（选填）"/>
              </div>
            </div>
            <button class="rb-add-entry-btn" @click="addEdu">
              <Icon icon="lucide:plus" :width="13"/>添加教育经历
            </button>
          </template>

          <!-- ── 实习 & 荣誉 ── -->
          <template v-else-if="activeModule === 'honors'">
            <div class="rb-form-group">
              <div class="rb-form-group-title">添加条目（Enter 确认）</div>
              <div class="rb-tag-row">
                <select v-model="honorType" class="rb-finput rb-fselect" style="width:68px;flex-shrink:0">
                  <option value="intern">实习</option>
                  <option value="cert">证书</option>
                  <option value="award">获奖</option>
                </select>
                <input v-model="honorInput" class="rb-finput" style="flex:1"
                  placeholder="填写内容…"
                  @keydown.enter.prevent="addHonor"/>
                <button class="rb-add-btn" @click="addHonor">
                  <Icon icon="lucide:plus" :width="14"/>
                </button>
              </div>
              <div class="rb-honor-list">
                <div v-for="(h, i) in form.honors" :key="i"
                  class="rb-honor-item" :class="`rb-honor--${h.type}`">
                  <Icon :icon="honorTypeIcons[h.type]" :width="11"/>
                  <span class="rb-honor-type-lbl">{{ honorTypeLabels[h.type] }}</span>
                  <span class="rb-honor-txt">{{ h.label }}</span>
                  <button class="rb-honor-del" @click="removeHonor(i)">
                    <Icon icon="lucide:x" :width="10"/>
                  </button>
                </div>
                <span v-if="!form.honors.length" class="rb-hint-text">暂未添加</span>
              </div>
            </div>
          </template>

          <!-- ── 自我评价 ── -->
          <template v-else-if="activeModule === 'selfEval'">
            <div class="rb-form-group">
              <div class="rb-form-group-title">自我评价内容</div>
              <TiptapEditor v-model="form.selfEval"
                placeholder="介绍你的综合素质、学习能力和职业规划…"/>
            </div>
          </template>

        </div><!-- /rb-mid-body -->

        <!-- 底部操作栏 -->
        <div class="rb-mid-footer">
          <button class="rb-clear-btn" @click="clearForm">
            <Icon icon="lucide:rotate-ccw" :width="12"/>清空
          </button>
          <button class="rb-use-btn-lg" :disabled="submitting || saveState === 'conflict'" @click="useResume">
            <Icon icon="lucide:check" :width="14"/>{{ accountDraft ? '提交并核对简历' : '使用此简历' }}
          </button>
        </div>
      </main>

      <!-- ══ RIGHT: 简历预览 ══ -->
      <div class="rb-right">
        <div class="rb-preview-bar">
          <Icon icon="lucide:eye" :width="11"/>实时预览
        </div>
        <div class="rb-preview-scroll">
          <div class="rb-paper">

            <!-- 简历头部 -->
            <div class="rp-hdr">
              <div class="rp-avi-wrap">
                <img v-if="avatarBase64" :src="avatarBase64" class="rp-avi" alt="头像"/>
                <div v-else class="rp-avi-ph"><Icon icon="lucide:user" :width="24"/></div>
              </div>
              <div class="rp-info">
                <div class="rp-name">{{ form.name || '你的姓名' }}</div>
                <div v-if="form.targetRole" class="rp-role">{{ form.targetRole }}</div>
                <div class="rp-meta">
                  <span v-if="form.school">{{ form.school }}</span>
                  <template v-if="form.major"><span class="rp-dot">·</span>{{ form.major }}</template>
                  <template v-if="form.grade"><span class="rp-dot">·</span>{{ form.grade }}</template>
                  <template v-if="form.gpa"><span class="rp-dot">·</span>GPA {{ form.gpa }}</template>
                </div>
                <div class="rp-contact">
                  <span v-if="form.phone"><Icon icon="lucide:phone" :width="10"/>{{ form.phone }}</span>
                  <span v-if="form.email"><Icon icon="lucide:mail" :width="10"/>{{ form.email }}</span>
                </div>
              </div>
            </div>

            <div v-if="form.summary" class="rp-summary">{{ form.summary }}</div>

            <div class="rp-rule"/>

            <!-- 专业技能 -->
            <template v-if="form.skills.length">
              <div class="rp-sec-title">专业技能</div>
              <div class="rp-chips">
                <span v-for="s in form.skills" :key="s" class="rp-chip">{{ s }}</span>
              </div>
              <div class="rp-rule-light"/>
            </template>

            <!-- 工作经验 -->
            <template v-if="form.workExps.some(w => w.company)">
              <div class="rp-sec-title">工作经验</div>
              <div v-for="(w, i) in form.workExps.filter(w => w.company)" :key="i" class="rp-entry">
                <div class="rp-entry-hd">
                  <span class="rp-entry-name">{{ w.company }}</span>
                  <span v-if="w.position" class="rp-entry-sub">{{ w.position }}</span>
                  <span v-if="w.period" class="rp-entry-period">{{ w.period }}</span>
                </div>
              <div v-if="w.desc" class="rp-richtext" v-html="safeRichText(w.desc)"/>
              </div>
              <div class="rp-rule-light"/>
            </template>

            <!-- 项目经历 -->
            <template v-if="form.projects.some(p => p.name)">
              <div class="rp-sec-title">项目经历</div>
              <div v-for="(p, i) in form.projects.filter(p => p.name)" :key="i" class="rp-entry">
                <div class="rp-entry-hd">
                  <span class="rp-entry-name">{{ p.name }}</span>
                  <span v-if="p.role" class="rp-entry-role">{{ p.role }}</span>
                </div>
                <div v-if="p.desc" class="rp-richtext" v-html="safeRichText(p.desc)"/>
              </div>
              <div class="rp-rule-light"/>
            </template>

            <!-- 教育经历 -->
            <template v-if="form.educations.some(e => e.school)">
              <div class="rp-sec-title">教育经历</div>
              <div v-for="(e, i) in form.educations.filter(e => e.school)" :key="i" class="rp-entry">
                <div class="rp-entry-hd">
                  <span class="rp-entry-name">{{ e.school }}</span>
                  <span v-if="e.major" class="rp-entry-sub">{{ e.major }}</span>
                  <span v-if="e.degree" class="rp-entry-badge">{{ e.degree }}</span>
                  <span v-if="e.period" class="rp-entry-period">{{ e.period }}</span>
                </div>
                <div v-if="e.gpa" class="rp-entry-gpa">GPA {{ e.gpa }}</div>
              </div>
              <div class="rp-rule-light"/>
            </template>

            <!-- 实习经历 -->
            <template v-if="form.honors.some(h => h.type === 'intern')">
              <div class="rp-sec-title">实习经历</div>
              <div v-for="h in form.honors.filter(h => h.type === 'intern')" :key="h.label" class="rp-honor-row">
                <Icon icon="lucide:briefcase" :width="10" class="rp-hico rp-hico--intern"/>{{ h.label }}
              </div>
              <div class="rp-rule-light"/>
            </template>

            <!-- 证书资质 -->
            <template v-if="form.honors.some(h => h.type === 'cert')">
              <div class="rp-sec-title">证书资质</div>
              <div v-for="h in form.honors.filter(h => h.type === 'cert')" :key="h.label" class="rp-honor-row">
                <Icon icon="lucide:award" :width="10" class="rp-hico rp-hico--cert"/>{{ h.label }}
              </div>
              <div class="rp-rule-light"/>
            </template>

            <!-- 获奖荣誉 -->
            <template v-if="form.honors.some(h => h.type === 'award')">
              <div class="rp-sec-title">获奖荣誉</div>
              <div v-for="h in form.honors.filter(h => h.type === 'award')" :key="h.label" class="rp-honor-row">
                <Icon icon="lucide:trophy" :width="10" class="rp-hico rp-hico--award"/>{{ h.label }}
              </div>
              <div class="rp-rule-light"/>
            </template>

            <!-- 自我评价 -->
            <template v-if="form.selfEval">
              <div class="rp-sec-title">自我评价</div>
              <div class="rp-richtext" v-html="safeRichText(form.selfEval)"/>
            </template>

            <!-- 空状态 -->
            <div v-if="!form.name && !form.skills.length && !form.projects.some(p => p.name) && !form.workExps.some(w => w.company)" class="rp-empty">
              <Icon icon="lucide:file-text" :width="32" class="rp-empty-ico"/>
              <p>填写中间栏信息，简历将在这里实时显示</p>
            </div>

          </div><!-- /rb-paper -->
        </div><!-- /rb-preview-scroll -->
      </div><!-- /rb-right -->

    </div><!-- /rb-body -->

    <div v-if="!hasArtifactQuery || artifactReady" class="rb-mobile-footer">
      <button class="rb-clear-btn" type="button" @click="clearForm">
        <Icon icon="lucide:rotate-ccw" :width="19" aria-hidden="true"/>清空
      </button>
      <button class="rb-use-btn-lg" type="button" :disabled="(hasArtifactQuery && !artifactReady) || (accountDraft && (draftLoading || !!draftError || submitting || saveState === 'conflict'))" @click="useResume">
        <Icon icon="lucide:check" :width="20" aria-hidden="true"/>{{ accountDraft ? (submitting ? '正在准备…' : '提交并核对简历') : '使用此简历' }}
      </button>
    </div>
  </div><!-- /rb-page -->
</template>

<style scoped>
.rb-guidance{flex-shrink:0;background:#fff8ee;border-bottom:1px solid #e2d3bf;padding:10px 24px;color:#644b35;font-size:12px;max-height:220px;overflow:auto}.rb-guidance summary{cursor:pointer;font-weight:600}.rb-guidance summary span{font-weight:400;margin-left:10px;color:#8a7461}.rb-guidance p,.rb-guidance li{line-height:1.7}.rb-guidance blockquote{margin:8px 0;padding-left:12px;border-left:2px solid #b99d7f}@media(max-width:600px){.rb-guidance{padding:10px 16px;max-height:160px}}
.rb-draft-status { display:flex; gap:12px; align-items:center; flex-wrap:wrap; padding:10px 24px; background:#fff8f2; color:#633d2c; border-bottom:1px solid #ead8ca; font-size:13px; }
.rb-draft-status small { color:#75685f; }
.rb-submit-hint { width:100%; margin:0; font-weight:600; }
.rb-page .rb-draft-status button { color:#633d2c; border:1px solid #633d2c; border-radius:6px; background:#fff; padding:5px 10px; cursor:pointer; }
.rb-fill-preview { max-height:35vh; overflow:auto; margin-top:12px; padding:14px; border:1px solid var(--rb-border); background:var(--rb-field); color:var(--rb-text); }
.rb-page .rb-use-btn:disabled,.rb-page .rb-use-btn-lg:disabled { opacity:.45; cursor:not-allowed; }
.rb-import-panel { flex-shrink:0; max-height:65vh; overflow:auto; }
.rb-fill-preview h2 { font-size:16px; margin:0 0 10px; }
.rb-fill-preview p,.rb-fill-preview dl { font-size:13px; line-height:1.7; margin:8px 0; }
.rb-fill-preview dt { font-weight:600; display:inline; }
.rb-fill-preview dd { display:inline; margin:0 16px 0 6px; }
.rb-fill-preview .rb-suggestion-fields { display: grid; grid-template-columns: minmax(70px,auto) minmax(0,1fr); gap: 8px 16px; }
.rb-fill-preview .rb-suggestion-fields dt,.rb-fill-preview .rb-suggestion-fields dd { display: block; margin: 0; overflow-wrap: anywhere; }
.rb-suggestion-project { border-top: 1px solid var(--rb-border); padding-top: 12px; margin-top: 12px; }
.rb-suggestion-project h3 { font-size: 14px; margin: 0 0 8px; }
.rb-suggestion-project p { white-space: pre-line; overflow-wrap: anywhere; }
.rb-applied-summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 24px; border-bottom: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); font-size: 13px; }
.rb-applied-summary p { color: var(--color-text-muted); margin: 5px 0 0; font-size: 12px; }
.rb-agent-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center; }
.rb-agent-state h2 { margin: 14px 0 6px; font-size: 18px; }
.rb-agent-state p { color: #aaa; }
.rb-agent-state button { margin-top: 12px; padding: 9px 14px; border: 1px solid #62594d; border-radius: 7px; background: transparent; color: #e2d7c8; cursor: pointer; }
.rb-agent-exit { cursor: pointer !important; color: #d8c8b5 !important; }
.rb-agent-advice { margin: 4px 4px 18px; padding: 12px; border: 1px solid rgba(220,185,142,.24); border-radius: 10px; background: rgba(130,76,25,.11); }
.rb-agent-advice__eyebrow { display: block; color: #c7a477; font-size: 10px; margin-bottom: 5px; }
.rb-agent-advice > strong { display: block; font-size: 12px; line-height: 1.4; }
.rb-agent-advice > p { color: #ad9d8c; font-size: 11px; line-height: 1.5; }
.rb-agent-advice__item { display: flex; align-items: flex-start; gap: 7px; padding: 8px 0; border-top: 1px solid rgba(220,185,142,.13); }
.rb-agent-advice__item > button { flex: none; border: 0; background: transparent; color: #d6ae75; cursor: pointer; padding: 0; }
.rb-agent-advice__item b { display: block; font-size: 11px; font-weight: 600; }
.rb-agent-advice__item small { display: block; margin-top: 3px; color: #ad9d8c; font-size: 10px; line-height: 1.5; }
.rb-agent-advice__jump { margin-top: 5px; padding: 0; border: 0; background: transparent; color: #d6ae75; font-size: 10px; cursor: pointer; }
/* ══ 页面容器 ══ */
.rb-page {
  --accent: #8B2500;
  height: 100%; display: flex; flex-direction: column;
  background: #151515; color: rgba(220,220,220,0.9);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

/* ══ Header ══ */
.rb-hdr {
  display: flex; align-items: center; gap: 12px;
  padding: 0 20px; height: 50px; flex-shrink: 0;
  border-bottom: 1px solid rgba(212,201,181,0.1);
  background: rgba(20,20,20,0.98);
}
.rb-hdr-back {
  display: flex; align-items: center; gap: 6px;
  background: none; border: 1px solid rgba(212,201,181,0.18); border-radius: 5px;
  color: rgba(180,160,130,0.75); font-size: 12px; padding: 4px 10px; cursor: pointer;
  transition: border-color 0.3s, color 0.3s;
}
.rb-hdr-back:hover { border-color: rgba(139,37,0,0.4); color: rgba(200,150,110,0.9); }
.rb-hdr-title { font-size: 14px; font-weight: 600; flex: 1; letter-spacing: 0.02em; }
.rb-import-panel {
  margin: 0 20px 12px;
  padding: 12px 14px;
  border: 1px solid #e3e3e0;
  border-radius: 8px;
  background: #fafaf8;
}
.rb-import-ta {
  width: 100%;
  resize: vertical;
  border: 1px solid #e3e3e0;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #333;
  background: #fff;
  box-sizing: border-box;
}
.rb-import-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.rb-hdr-actions { display: flex; align-items: center; gap: 8px; }
.rb-ghost-btn {
  position: relative; display: flex; align-items: center; gap: 5px;
  background: none; border: 1px solid rgba(212,201,181,0.15); border-radius: 5px;
  color: rgba(140,125,100,0.45); font-size: 12px; padding: 5px 12px; cursor: not-allowed;
}
.rb-soon-badge {
  position: absolute; bottom: -22px; left: 50%; transform: translateX(-50%);
  font-size: 9px; white-space: nowrap; background: rgba(30,20,10,0.95);
  color: rgba(140,125,100,0.7); padding: 2px 7px; border-radius: 3px;
  opacity: 0; transition: opacity 0.15s; pointer-events: none;
}
.rb-ghost-btn:hover .rb-soon-badge { opacity: 1; }
.rb-use-btn {
  display: flex; align-items: center; gap: 6px;
  background: var(--accent); border: 1px solid rgba(255,255,255,0.1); border-radius: 5px;
  color: rgba(240,220,195,0.95); font-size: 12px; font-weight: 600; padding: 5px 14px; cursor: pointer;
  transition: filter 0.3s;
}
.rb-use-btn:hover { filter: brightness(1.2); }

/* ══ Body 三栏 ══ */
.rb-body { flex: 1; display: grid; grid-template-columns: 210px 400px 1fr; overflow: hidden; min-height: 0; }

/* ══ Left ══ */
.rb-left {
  border-right: 1px solid rgba(212,201,181,0.1);
  background: rgba(14,8,2,0.8);
  overflow-y: auto; padding: 12px 8px;
  display: flex; flex-direction: column;
}
.rb-left::-webkit-scrollbar { width: 3px; }
.rb-left::-webkit-scrollbar-thumb { background: rgba(139,37,0,0.2); border-radius: 2px; }
.rb-left-section-hd {
  font-size: 9px; font-weight: 600; letter-spacing: 0.06em;
  color: rgba(160,160,160,0.5); text-transform: uppercase;
  padding: 0 8px; margin: 6px 0 8px;
}
.rb-module-list { display: flex; flex-direction: column; gap: 2px; }
.rb-module-btn {
  display: flex; align-items: center; gap: 9px;
  width: 100%; padding: 7px 9px; border-radius: 6px; border: none;
  background: none; cursor: pointer; text-align: left;
  color: rgba(170,155,130,0.7); font-size: 12px;
  transition: background 0.15s, color 0.15s;
}
.rb-module-btn:hover { background: rgba(255,255,255,0.05); color: rgba(210,195,170,0.9); }
.rb-module-btn--active { background: rgba(255,255,255,0.08); color: rgba(220,205,185,0.95); font-weight: 600; }
.rb-module-icon {
  width: 24px; height: 24px; border-radius: 5px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.rb-module-label { font-size: 12px; }
.rb-left-sep { height: 1px; background: rgba(212,201,181,0.08); margin: 10px 0; }
.rb-color-row { display: flex; flex-wrap: wrap; gap: 7px; padding: 0 8px; }
.rb-color-dot {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid transparent; cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.rb-color-dot:hover { transform: scale(1.15); }
.rb-color-dot--active { border-color: rgba(255,255,255,0.75); }

/* ══ Middle ══ */
.rb-mid {
  border-right: 1px solid rgba(212,201,181,0.1);
  background: rgba(22,13,5,0.6);
  display: flex; flex-direction: column; overflow: hidden;
}
.rb-mid-hd {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  padding: 13px 18px;
  border-bottom: 1px solid rgba(212,201,181,0.08);
  font-size: 14px; font-weight: 600; color: rgba(220,220,220,0.95);
}
.rb-mid-hd-icon { display: flex; align-items: center; }
.rb-mid-body { flex: 1; overflow-y: auto; padding: 16px 18px; }
.rb-mid-body::-webkit-scrollbar { width: 3px; }
.rb-mid-body::-webkit-scrollbar-thumb { background: rgba(139,37,0,0.2); border-radius: 2px; }
.rb-mid-footer {
  display: flex; gap: 8px; padding: 10px 18px; flex-shrink: 0;
  border-top: 1px solid rgba(212,201,181,0.08);
  background: rgba(20,12,4,0.7);
}
.rb-clear-btn {
  display: flex; align-items: center; gap: 5px;
  background: none; border: 1px solid rgba(212,201,181,0.15); border-radius: 5px;
  color: rgba(150,135,110,0.6); font-size: 12px; padding: 6px 12px; cursor: pointer;
}
.rb-clear-btn:hover { border-color: rgba(200,80,70,0.3); color: rgba(200,90,80,0.8); }
.rb-use-btn-lg {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  background: var(--accent); border: 1px solid rgba(255,255,255,0.1); border-radius: 5px;
  color: rgba(240,220,195,0.95); font-size: 13px; font-weight: 600; padding: 7px; cursor: pointer;
  transition: filter 0.3s;
}
.rb-use-btn-lg:hover { filter: brightness(1.2); }

/* ══ Form Groups ══ */
.rb-form-group { margin-bottom: 18px; }
.rb-form-group-title {
  font-size: 11px; font-weight: 600; color: rgba(160,160,160,0.7);
  letter-spacing: 0.02em; margin-bottom: 8px; padding-bottom: 5px;
  border-bottom: 1px solid rgba(212,201,181,0.08);
}

/* ══ Field Row（图标 + 标签 + 输入）══ */
.rb-field-row {
  display: flex; align-items: center; gap: 10px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(212,201,181,0.06);
}
.rb-field-row--avatar { padding: 8px 0; }
.rb-frow-l { display: flex; align-items: center; gap: 6px; width: 68px; flex-shrink: 0; }
.rb-frow-ico { color: rgba(145,130,105,0.5); flex-shrink: 0; }
.rb-frow-lbl { font-size: 12px; color: rgba(160,145,120,0.8); white-space: nowrap; }
.rb-finput {
  flex: 1; background: transparent; border: none; outline: none;
  font-size: 12px; color: rgba(215,200,178,0.9); padding: 2px 0; line-height: 1.4;
}
.rb-finput::placeholder { color: rgba(120,108,85,0.4); }
.rb-fselect {
  flex: 1; background: rgba(30,18,8,0.7); border: none; border-radius: 4px;
  padding: 3px 6px; font-size: 12px; color: rgba(215,200,178,0.9); cursor: pointer; outline: none;
}
.rb-field-col { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.rb-fcol-lbl { font-size: 11px; color: rgba(155,140,115,0.65); }
.rb-ftextarea {
  width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(212,201,181,0.12);
  border-radius: 5px; padding: 8px 10px; font-size: 12px; color: rgba(215,200,178,0.9);
  outline: none; resize: vertical; font-family: inherit; line-height: 1.6; box-sizing: border-box;
}
.rb-ftextarea:focus { border-color: rgba(139,37,0,0.4); }
.rb-ftextarea::placeholder { color: rgba(120,108,85,0.4); }

/* ══ 头像 ══ */
.rb-avatar-box {
  width: 52px; height: 52px; border-radius: 7px;
  border: 1.5px dashed rgba(200,200,200,0.2); background: rgba(255,255,255,0.04);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; overflow: hidden; transition: border-color 0.3s;
}
.rb-avatar-box:hover { border-color: rgba(139,37,0,0.4); }
.rb-avi { width: 100%; height: 100%; object-fit: cover; }
.rb-avi-ph { color: rgba(145,130,105,0.4); }
.rb-hidden { display: none; }

/* ══ 技能标签 ══ */
.rb-tag-row { display: flex; gap: 6px; margin-bottom: 10px; }
.rb-add-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; flex-shrink: 0; border-radius: 5px;
  background: rgba(139,37,0,0.15); border: 1px solid rgba(139,37,0,0.3);
  color: rgba(200,120,90,0.8); cursor: pointer; transition: background 0.3s;
}
.rb-add-btn:hover { background: rgba(139,37,0,0.3); }
.rb-skill-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.rb-stag {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 4px; font-size: 11px;
  background: rgba(139,37,0,0.12); border: 1px solid rgba(139,37,0,0.25);
  color: rgba(210,150,110,0.9);
}
.rb-stag-x { background: none; border: none; cursor: pointer; padding: 0; color: rgba(180,120,90,0.6); display: flex; }
.rb-stag-x:hover { color: rgba(200,80,60,0.9); }

/* ══ Entry cards（工作/项目/教育）══ */
.rb-entry-card {
  border: 1px solid rgba(212,201,181,0.08); border-radius: 7px;
  padding: 12px 14px; margin-bottom: 12px; background: rgba(255,255,255,0.02);
}
.rb-entry-hd { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.rb-entry-num {
  width: 20px; height: 20px; border-radius: 50%; font-size: 10px; font-weight: 600;
  background: rgba(139,37,0,0.2); color: rgba(200,140,110,0.85);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.rb-entry-name { font-size: 12px; font-weight: 600; color: rgba(200,185,160,0.9); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rb-entry-del {
  margin-left: auto; background: none; border: none; cursor: pointer;
  color: rgba(160,80,70,0.5); display: flex; align-items: center; padding: 3px;
  transition: color 0.15s; border-radius: 4px;
}
.rb-entry-del:hover { color: rgba(200,80,70,0.9); background: rgba(200,80,70,0.08); }
.rb-add-entry-btn {
  display: flex; align-items: center; gap: 7px; width: 100%;
  padding: 8px 12px; border-radius: 6px; font-size: 12px;
  background: rgba(139,37,0,0.07); border: 1px dashed rgba(139,37,0,0.25);
  color: rgba(175,120,90,0.7); cursor: pointer; transition: background 0.3s;
}
.rb-add-entry-btn:hover { background: rgba(139,37,0,0.15); }

/* ══ 实习&荣誉 ══ */
.rb-honor-list { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
.rb-honor-item {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 9px; border-radius: 5px; font-size: 11px; border: 1px solid;
}
.rb-honor--cert   { background: rgba(139,105,20,0.08); border-color: rgba(139,105,20,0.2); color: rgba(200,165,80,0.85); }
.rb-honor--intern { background: rgba(74,107,138,0.08); border-color: rgba(74,107,138,0.2); color: rgba(120,155,190,0.85); }
.rb-honor--award  { background: rgba(139,37,0,0.08);  border-color: rgba(139,37,0,0.2);  color: rgba(210,140,100,0.85); }
.rb-honor-type-lbl { font-size: 9px; font-weight: 600; opacity: 0.7; }
.rb-honor-txt { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rb-honor-del { margin-left: auto; background: none; border: none; cursor: pointer; color: rgba(160,80,70,0.5); display: flex; }
.rb-honor-del:hover { color: rgba(200,80,70,0.9); }

/* ══ 通用 ══ */
.rb-hint-text { font-size: 11px; color: rgba(110,98,78,0.45); font-style: italic; }

/* ══ Right: 预览 ══ */
.rb-right { display: flex; flex-direction: column; background: #1a1a1a; overflow: hidden; }
.rb-preview-bar {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding: 8px 20px; font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
  color: rgba(160,160,160,0.5); border-bottom: 1px solid rgba(212,201,181,0.08);
  text-transform: uppercase;
}
.rb-preview-scroll { flex: 1; overflow-y: auto; padding: 22px 20px; display: flex; flex-direction: column; }
.rb-preview-scroll::-webkit-scrollbar { width: 4px; }
.rb-preview-scroll::-webkit-scrollbar-thumb { background: rgba(139,37,0,0.2); border-radius: 2px; }

/* ══ Resume Paper ══ */
.rb-paper {
  background: #fff; border-radius: 8px;
  padding: 32px 36px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.5);
  font-family: 'PingFang SC', 'Noto Sans SC', sans-serif;
  color: #111; min-height: 400px; flex: 1;
}

/* 简历头部 */
.rp-hdr { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 14px; }
.rp-avi-wrap { flex-shrink: 0; }
.rp-avi { width: 70px; height: 70px; border-radius: 6px; object-fit: cover; }
.rp-avi-ph {
  width: 70px; height: 70px; border-radius: 6px;
  background: #f5f5f3; border: 1px solid #e3e3e0;
  display: flex; align-items: center; justify-content: center; color: #b0a898;
}
.rp-info { flex: 1; }
.rp-name { font-size: 24px; font-weight: 600; color: var(--accent); line-height: 1.15; margin-bottom: 3px; }
.rp-role { font-size: 13px; font-weight: 600; color: var(--accent); margin-bottom: 4px; }
.rp-meta { font-size: 11px; color: #666; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-bottom: 5px; }
.rp-dot  { color: #bbb; }
.rp-contact { display: flex; gap: 14px; flex-wrap: wrap; }
.rp-contact > span { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #666; }

.rp-summary {
  font-size: 11.5px; color: #555; line-height: 1.7;
  border-left: 3px solid var(--accent); padding: 6px 12px;
  background: rgba(var(--accent-rgb), 0.04); margin-bottom: 12px; border-radius: 0 4px 4px 0;
}
.rp-rule       { height: 1.5px; background: var(--accent); margin: 0 0 14px; }
.rp-rule-light { height: 1px; background: #e3e3e0; margin: 10px 0 14px; }

.rp-sec-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--accent);
  margin-bottom: 8px; padding-bottom: 3px;
  border-bottom: 1px solid rgba(var(--accent-rgb), 0.15);
}

.rp-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 4px; }
.rp-chip {
  font-size: 10px; padding: 2px 9px; border-radius: 4px;
  background: #f5f5f3; color: #555; border: 1px solid #e3e3e0;
}

.rp-entry { margin-bottom: 12px; }
.rp-entry-hd { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.rp-entry-name   { font-size: 13px; font-weight: 600; color: var(--accent-deep); }
.rp-entry-sub    { font-size: 11px; color: #666; }
.rp-entry-badge  {
  font-size: 10px; padding: 1px 7px; border-radius: 8px;
  background: rgba(var(--accent-rgb), 0.08); color: var(--accent); border: 1px solid rgba(var(--accent-rgb), 0.15);
}
.rp-entry-role   {
  font-size: 10px; padding: 1px 7px; border-radius: 8px;
  background: rgba(42,191,170,0.1); color: #2abfaa; border: 1px solid rgba(42,191,170,0.25);
}
.rp-entry-period { font-size: 10px; color: #999; margin-left: auto; }
.rp-entry-gpa    { font-size: 11px; color: #666; }

.rp-richtext { font-size: 11px; color: #555; line-height: 1.65; }
.rp-richtext :deep(p)  { margin: 0 0 3px; }
.rp-richtext :deep(ul),
.rp-richtext :deep(ol) { margin: 0 0 3px; padding-left: 18px; }
.rp-richtext :deep(li) { margin-bottom: 2px; }
.rp-richtext :deep(strong) { font-weight: 700; }
.rp-richtext :deep(em)     { font-style: italic; }
.rp-richtext :deep(u)      { text-decoration: underline; }

.rp-honor-row { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; font-size: 11px; color: #555; }
.rp-hico           { flex-shrink: 0; }
.rp-hico--cert     { color: rgba(139,105,20,0.7); }
.rp-hico--intern   { color: rgba(74,107,138,0.7); }
.rp-hico--award    { color: rgba(var(--accent-rgb), 0.7); }

.rp-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 60px 20px; text-align: center;
}
.rp-empty-ico { color: #ccc; }
.rp-empty p { font-size: 12px; color: #aaa; line-height: 1.6; }

/* ══ 深蓝黑 / 珊瑚红主题 ══ */
.rb-page {
  --rb-bg: #0b1422;
  --rb-surface: #111c2b;
  --rb-surface-raised: #162338;
  --rb-field: #172437;
  --rb-border: #27364a;
  --rb-border-soft: rgba(142, 162, 188, 0.16);
  --rb-text: #f2f5fa;
  --rb-muted: #98a8bd;
  --rb-subtle: #7788a0;
  --rb-blue: #55aaf2;
  background: var(--rb-bg);
  color: var(--rb-text);
  color-scheme: dark;
}

.rb-hdr {
  border-bottom-color: var(--rb-border-soft);
  background: #0d1726;
}
.rb-hdr-back {
  min-height: 36px;
  border-color: rgba(178, 196, 220, 0.18);
  color: #d4dfef;
}
.rb-hdr-back:hover { border-color: var(--accent); color: var(--rb-text); }
.rb-hdr-title { color: var(--rb-text); }
.rb-import-panel {
  border-color: var(--rb-border);
  background: var(--rb-surface);
}
.rb-import-ta {
  border-color: var(--rb-border);
  background: var(--rb-field);
  color: var(--rb-text);
}
.rb-import-ta::placeholder { color: var(--rb-subtle); }
.rb-ghost-btn {
  border-color: rgba(178, 196, 220, 0.2);
  color: var(--rb-muted);
}
.rb-ghost-btn:not(:disabled) { cursor: pointer; }
.rb-use-btn,
.rb-use-btn-lg {
  background: var(--accent);
  color: #fff;
}
.rb-body { background: var(--rb-bg); }
.rb-left {
  border-right-color: var(--rb-border-soft);
  background: #0d1726;
}
.rb-left-section-hd { color: var(--rb-subtle); }
.rb-module-btn { color: var(--rb-muted); }
.rb-module-btn:hover { background: rgba(255,255,255,0.05); color: var(--rb-text); }
.rb-module-btn--active {
  background: rgba(244, 81, 75, 0.13);
  color: var(--rb-text);
}
.rb-module-icon {
  background: var(--rb-surface-raised) !important;
  color: #b8c8de !important;
}
.rb-module-btn--active .rb-module-icon {
  background: var(--accent) !important;
  color: #fff !important;
}
.rb-left-sep {
  background: var(--rb-border-soft);
}
.rb-mid { border-right-color: var(--rb-border-soft); }
.rb-left-sep,
.rb-form-group-title,
.rb-field-row,
.rb-mid-hd,
.rb-mid-footer,
.rb-preview-bar {
  border-color: var(--rb-border-soft);
}
.rb-color-dot { border-color: transparent; }
.rb-color-dot--active { border-color: #fff; }
.rb-mid { background: #101b2a; }
.rb-mid-hd { color: var(--rb-text); }
.rb-mid-hd-icon { color: var(--rb-blue) !important; }
.rb-mid-hd-copy { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.rb-mid-hd-copy strong { color: var(--rb-text); font-weight: 650; }
.rb-mid-hd-copy small { color: var(--rb-muted); font-size: 12px; font-weight: 400; }
.rb-mid-body { scrollbar-color: #33445c transparent; }
.rb-mid-footer { background: #0d1726; }
.rb-clear-btn {
  border-color: var(--rb-border);
  color: #d0dced;
}
.rb-clear-btn:hover { border-color: rgba(244, 81, 75, 0.58); color: #ffaaa4; }
.rb-form-group-title { color: #d1dced; }
.rb-frow-ico { color: var(--rb-blue); }
.rb-frow-lbl { color: #e0e8f4; }
.rb-finput { color: var(--rb-text); }
.rb-finput::placeholder,
.rb-ftextarea::placeholder { color: var(--rb-subtle); }
.rb-fselect { background: var(--rb-field); color: var(--rb-text); }
.rb-ftextarea {
  border-color: var(--rb-border);
  background: var(--rb-field);
  color: var(--rb-text);
}
.rb-ftextarea:focus { border-color: var(--accent); }
.rb-avatar-box {
  padding: 0;
  border-color: rgba(164, 185, 214, 0.42);
  background: rgba(255,255,255,0.025);
  color: #aabbd3;
}
.rb-avatar-box:hover { border-color: var(--accent); }
.rb-avatar-hint { display: none; }
.rb-avi-ph { color: #aabbd3; }
.rb-add-btn {
  border-color: rgba(244, 81, 75, 0.38);
  background: rgba(244, 81, 75, 0.15);
  color: #ff9a93;
}
.rb-stag {
  border-color: rgba(244, 81, 75, 0.35);
  background: rgba(244, 81, 75, 0.12);
  color: #ffc0bc;
}
.rb-entry-card {
  border-color: var(--rb-border-soft);
  background: rgba(255,255,255,0.025);
}
.rb-entry-num { background: rgba(244,81,75,0.18); color: #ffaaa4; }
.rb-entry-name { color: #e2eaf5; }
.rb-add-entry-btn {
  border-color: rgba(244,81,75,0.38);
  background: rgba(244,81,75,0.08);
  color: #ffaaa4;
}
.rb-hint-text { color: var(--rb-muted); }
.rb-right { background: #0d1726; }
.rb-preview-bar { color: var(--rb-muted); }
.rb-preview-scroll { scrollbar-color: #33445c transparent; }
.rb-agent-state { color: var(--rb-text); }
.rb-agent-state p { color: var(--rb-muted); }
.rb-agent-state button {
  border-color: var(--rb-border);
  color: #d4dfef;
}
.rb-agent-advice {
  border-color: rgba(244,81,75,.25);
  background: rgba(244,81,75,.08);
}
.rb-agent-advice__eyebrow { color: #ffaaa4; }
.rb-agent-advice > p,
.rb-agent-advice__item small { color: var(--rb-muted); }
.rb-agent-advice__item { border-top-color: var(--rb-border-soft); }
.rb-agent-advice__item > button,
.rb-agent-advice__jump { color: #ffaaa4; }
.rb-agent-advice--mobile,
.rb-mobile-nav,
.rb-mobile-footer { display: none; }
.rb-page :is(button, input, select, textarea):focus-visible {
  outline: 2px solid #67b7ff;
  outline-offset: 2px;
}

@media (max-width: 767px) {
  .rb-page { min-height: 0; height: 100%; overflow: hidden; }
  .rb-hdr {
    position: relative;
    min-height: calc(58px + env(safe-area-inset-top, 0px));
    height: auto;
    padding: calc(7px + env(safe-area-inset-top, 0px)) 12px 7px;
    gap: 0;
    border-bottom: 0;
  }
  .rb-hdr-back {
    z-index: 1;
    width: 88px;
    min-height: 44px;
    justify-content: flex-start;
    padding: 0 4px;
    border: 0;
    border-radius: 8px;
    color: #d4dfef;
    font-size: 16px;
  }
  .rb-hdr-back :deep(svg) { width: 22px; height: 22px; }
  .rb-hdr-title {
    position: absolute;
    left: 50%;
    max-width: calc(100% - 132px);
    overflow: hidden;
    transform: translateX(-50%);
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rb-hdr-actions,
  .rb-import-panel { display: none !important; }
  .rb-mobile-nav {
    display: flex;
    flex: 0 0 92px;
    align-items: stretch;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 7px 12px 9px;
    border: 1px solid var(--rb-border-soft);
    border-radius: 18px;
    background: #0f1928;
    overscroll-behavior-x: contain;
    scroll-padding-inline: 12px;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .rb-mobile-nav::-webkit-scrollbar { display: none; }
  .rb-mobile-tab {
    display: flex;
    flex: 0 0 78px;
    min-width: 78px;
    min-height: 74px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 3px;
    border: 0;
    border-radius: 14px;
    background: transparent;
    color: #b9c8dc;
    cursor: pointer;
    scroll-snap-align: center;
    -webkit-tap-highlight-color: transparent;
  }
  .rb-mobile-tab-icon { display: flex; align-items: center; justify-content: center; height: 28px; }
  .rb-mobile-tab-label {
    max-width: 100%;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rb-mobile-tab--active {
    background: var(--accent);
    color: #fff;
    font-weight: 650;
  }
  .rb-mobile-tab:active { background: rgba(244,81,75,.22); }
  .rb-mobile-tab--active:active { background: var(--accent); }
  .rb-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 12px 10px 10px;
  }
  .rb-left,
  .rb-right { display: none; }
  .rb-mid {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--rb-border-soft);
    border-radius: 18px;
    background: linear-gradient(155deg, #121e2e, #0f1928 80%);
    box-shadow: 0 12px 32px rgba(0,0,0,.14);
  }
  .rb-mid-hd {
    flex: 0 0 auto;
    align-items: flex-start;
    gap: 12px;
    padding: 18px 16px 14px;
    border-bottom: 1px solid var(--rb-border-soft);
  }
  .rb-mid-hd-icon {
    display: flex;
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    align-items: center;
    justify-content: center;
    color: var(--rb-blue) !important;
  }
  .rb-mid-hd-copy { padding-top: 1px; gap: 3px; }
  .rb-mid-hd-copy strong { font-size: 21px; }
  .rb-mid-hd-copy small { font-size: 13px; line-height: 1.45; }
  .rb-mid-body {
    min-height: 0;
    padding: 4px 16px 18px;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }
  .rb-mid-footer { display: none; }
  .rb-mobile-footer {
    display: flex;
    flex: 0 0 auto;
    gap: 10px;
    padding: 10px 12px calc(12px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--rb-border-soft);
    background: rgba(11,20,34,.98);
  }
  .rb-mobile-footer .rb-clear-btn {
    flex: 0 0 37%;
    min-height: 58px;
    justify-content: center;
    gap: 10px;
    border: 1px solid var(--rb-border);
    border-radius: 14px;
    background: transparent;
    color: #c3d0e1;
    font-size: 17px;
  }
  .rb-mobile-footer .rb-use-btn-lg {
    min-height: 58px;
    border: 0;
    border-radius: 14px;
    font-size: 18px;
    box-shadow: 0 5px 16px rgba(244,81,75,.22);
  }
  .rb-mobile-footer .rb-use-btn-lg:disabled { opacity: .55; cursor: not-allowed; }
  .rb-mid-body .rb-agent-advice--mobile { display: block; margin: 8px 0 18px; }
  .rb-agent-advice--mobile .rb-agent-advice__item > button { min-width: 36px; min-height: 36px; display: grid; place-items: center; }
  .rb-agent-advice--mobile .rb-agent-advice__jump { min-height: 36px; font-size: 12px; }
  .rb-form-group { margin-bottom: 20px; }
  .rb-form-group-title {
    margin-bottom: 6px;
    padding: 4px 0 8px;
    border-bottom: 0;
    color: #d5dfed;
    font-size: 14px;
    font-weight: 600;
  }
  .rb-field-row {
    display: grid;
    grid-template-columns: 94px minmax(0, 1fr);
    gap: 10px;
    min-height: 66px;
    padding: 8px 0;
    border-bottom-color: rgba(142,162,188,.14);
  }
  .rb-frow-l { width: auto; min-width: 0; gap: 8px; }
  .rb-frow-ico { width: 20px; height: 20px; }
  .rb-frow-lbl { color: #e3ebf6; font-size: 15px; }
  .rb-finput {
    min-width: 0;
    min-height: 52px;
    padding: 0 13px;
    border: 1px solid var(--rb-border);
    border-radius: 12px;
    outline: none;
    background: var(--rb-field);
    font-size: 16px;
    line-height: 1.4;
  }
  .rb-finput:focus { border-color: #4c97d2; }
  .rb-fselect { min-height: 52px; padding-right: 30px; }
  .rb-field-row--avatar {
    grid-template-columns: 84px 64px minmax(0, 1fr);
    gap: 10px;
    min-height: 98px;
    padding: 12px 0;
  }
  .rb-avatar-box { width: 64px; height: 64px; border-radius: 12px; }
  .rb-avatar-box :deep(.rb-avi) { width: 100%; height: 100%; object-fit: cover; }
  .rb-avatar-hint { display: flex; min-width: 0; flex-direction: column; gap: 5px; color: #cbd7e8; font-size: 14px; }
  .rb-avatar-hint small { color: var(--rb-muted); font-size: 12px; }
  .rb-field-col { gap: 8px; margin-top: 14px; }
  .rb-fcol-lbl { color: #d5dfed; font-size: 14px; }
  .rb-ftextarea {
    min-height: 126px;
    padding: 12px 14px;
    border-radius: 12px;
    font-size: 16px;
  }
  .rb-tag-row { gap: 8px; }
  .rb-tag-row .rb-finput { flex: 1; }
  .rb-add-btn { width: 48px; height: 48px; border-radius: 12px; }
  .rb-stag { min-height: 40px; padding: 4px 10px; border-radius: 10px; font-size: 13px; }
  .rb-stag-x { width: 30px; height: 30px; align-items: center; justify-content: center; }
  .rb-entry-card { padding: 13px; border-radius: 13px; }
  .rb-entry-hd { min-height: 40px; }
  .rb-entry-name { font-size: 14px; }
  .rb-entry-del { min-width: 40px; min-height: 40px; justify-content: center; }
  .rb-add-entry-btn { min-height: 48px; justify-content: center; border-radius: 12px; font-size: 14px; }
  .rb-honor-item { min-height: 44px; border-radius: 10px; font-size: 13px; }
  .rb-honor-del { min-width: 36px; min-height: 36px; justify-content: center; }
  .rb-page :deep(.tip-wrap) {
    border-color: var(--rb-border);
    border-radius: 12px;
    background: var(--rb-field);
  }
  .rb-page :deep(.tip-toolbar) {
    min-height: 44px;
    border-bottom-color: var(--rb-border-soft);
    background: #111c2b;
  }
  .rb-page :deep(.tip-tool) { width: 40px; height: 40px; color: #c0cee0; }
  .rb-page :deep(.tip-tool--on) { background: rgba(244,81,75,.2); color: #ffaaa4; }
  .rb-page :deep(.tip-content) {
    min-height: 120px;
    padding: 12px 14px;
    color: var(--rb-text);
    font-size: 16px;
  }
}

@media (max-width: 360px) {
  .rb-field-row { grid-template-columns: 82px minmax(0, 1fr); gap: 8px; }
  .rb-field-row--avatar { grid-template-columns: 72px 58px minmax(0, 1fr); gap: 8px; }
  .rb-avatar-box { width: 58px; height: 58px; }
  .rb-frow-lbl { font-size: 14px; }
  .rb-mobile-footer { gap: 8px; padding-right: 9px; padding-left: 9px; }
  .rb-mobile-footer .rb-clear-btn { flex-basis: 34%; font-size: 15px; }
  .rb-mobile-footer .rb-use-btn-lg { font-size: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .rb-mobile-nav { scroll-behavior: auto; }
  .rb-page *,
  .rb-page *::before,
  .rb-page *::after { scroll-behavior: auto !important; }
}
/* Preserve the existing editor layout, but share the surrounding product's
   warm-paper palette. This is not a second app-wide theme. */
.rb-page { --rb-bg: var(--color-background,#f5f3ef); --rb-surface: var(--color-surface,#fffdf9); --rb-surface-raised: #f0e9df; --rb-field: #fffdf9; --rb-border: #d9cfc2; --rb-border-soft: #e8e1d7; --rb-text: #302d29; --rb-muted: #716b62; --rb-subtle: #898077; --rb-blue: var(--color-primary,#8b2500); color-scheme: light; }
.rb-hdr,.rb-left,.rb-mid-footer { background: var(--rb-surface); }
.rb-hdr-back { color: var(--rb-muted); border-color: var(--rb-border); }
.rb-mid { background: var(--rb-bg); }
.rb-right { background: #eee8df; }
.rb-preview-bar { background: var(--rb-surface); }
.rb-frow-lbl,.rb-form-group-title,.rb-clear-btn,.rb-entry-name { color: var(--rb-muted); }
.rb-add-btn,.rb-add-entry-btn,.rb-stag,.rb-entry-num { color: var(--color-primary,#8b2500); border-color: #d9bca9; background: #f4e9df; }
.rb-clear-btn:hover { color: var(--color-primary,#8b2500); border-color: var(--rb-border); }
.rb-preview-bar { color: var(--rb-muted); }
.rb-module-icon { color: var(--rb-muted) !important; }
.rb-ghost-btn,.rb-finput,.rb-fselect { border-color: var(--rb-border); }
.rb-mid-body,.rb-preview-scroll { scrollbar-color: #c9b9aa transparent; }
.rb-module-btn--active { background: #ede0d4; color: var(--rb-text); }
.rb-applied-summary { flex-shrink: 0; }
.rb-mobile-nav,.rb-mobile-footer { background: var(--rb-surface); border-color: var(--rb-border); }
.rb-mobile-tab { color: var(--rb-muted); }
.rb-mobile-tab--active { color: var(--rb-text); background: #ede0d4; }
.rb-mobile-footer .rb-clear-btn { color: var(--rb-muted); }
.rb-page :deep(.tip-wrap) { border-color: var(--rb-border); background: #fffdfa; }
.rb-page :deep(.tip-toolbar) { background: #f1e8dc; border-color: var(--rb-border); }
.rb-page :deep(.tip-tool) { color: #685b4c; }
.rb-page :deep(.tip-tool--on) { color: #8b2500; background: #ead8c5; }
.rb-page :deep(.tip-content) { color: var(--rb-text); caret-color: #8b2500; }
.rb-page :deep(.tip-content:focus-visible) { outline: 2px solid #a65d39; outline-offset: -2px; }
.rb-page :deep(.tip-content:empty::before) { color: #817264; }
.rb-page :deep(.tip-sep) { background: #d9c9b8; }
.rb-fcol-lbl { color: var(--rb-muted); }
@media(max-width:640px) { .rb-applied-summary { align-items: start; padding: 10px 12px; } .rb-applied-summary button { flex-shrink: 0; } }
</style>
