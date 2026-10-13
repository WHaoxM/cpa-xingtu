<!-- 页面：快速制作简历（仿 magicv.art 三栏）；路由：student/resume-builder；角色：STUDENT -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { useResumeStore } from '@/stores/resume'
import { useUserStore } from '@/stores'
import TiptapEditor from '@/components/TiptapEditor.vue'
import { parseResumeText } from '@/api/pipeline'
import { DEMO_STUDENT_ID } from '@/api/config'
import { useAgentArtifactHandoff, commitMockArtifactHandoff } from '@/composables/useAgentArtifactHandoff'

const route       = useRoute()
const router      = useRouter()
const resumeStore = useResumeStore()
const userStore   = useUserStore()
const hasArtifactQuery = computed(() => Object.prototype.hasOwnProperty.call(route.query, 'artifact_id'))
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
  grade: '', targetRole: '', gpa: '', summary: '',
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
const accentColor  = ref('#8B2500')
const avatarBase64 = ref('')
const avatarInput  = ref<HTMLInputElement | null>(null)
const skillInput   = ref('')
const honorInput   = ref('')
const honorType    = ref<'cert' | 'intern' | 'award'>('intern')

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

const COLOR_PRESETS = ['#1a1a1a', '#8B2500', '#B8292B', '#1a3a6b', '#1a5c3a', '#6b4c1a']

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
const importText = ref('')
const importing = ref(false)
const showImport = ref(false)

async function importFromParse() {
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
function useResume() {
  resumeStore.setDraftText(resumeText.value)
  router.push({ name: 'student-career-navigation' })
}
function clearForm() {
  form.value = {
    name: '', phone: '', email: '', school: '', major: '',
    grade: '', targetRole: '', gpa: '', summary: '',
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
        <button class="rb-ghost-btn" type="button" @click="showImport = !showImport">
          <Icon icon="lucide:sparkles" :width="13"/>智能填充
        </button>
        <button class="rb-ghost-btn" disabled title="后端接入后开放">
          <Icon icon="lucide:download" :width="13"/>下载 PDF
          <span class="rb-soon-badge">即将开放</span>
        </button>
        <button class="rb-use-btn" :disabled="hasArtifactQuery && !artifactReady" @click="useResume">
          <Icon icon="lucide:check" :width="13"/>使用此简历
        </button>
      </div>
    </header>

    <div v-if="hasArtifactQuery && !artifactReady" class="rb-agent-state" role="status">
      <Icon :icon="handoff.loading.value ? 'lucide:loader-circle' : 'lucide:circle-alert'" :width="26" />
      <h2>{{ handoff.loading.value ? '正在读取对话中的简历' : '无法打开这份简历改进产物' }}</h2>
      <p v-if="!handoff.loading.value">{{ handoff.error.value || '成果物类型与简历页面不匹配。' }}</p>
      <button type="button" @click="browseOrdinaryResume">浏览普通简历制作</button>
    </div>

    <div v-if="(!hasArtifactQuery || artifactReady) && showImport" class="rb-import-panel">
      <textarea
        v-model="importText"
        class="rb-import-ta"
        rows="5"
        placeholder="粘贴简历全文，点击解析后自动填入姓名/学历/技能…"
      />
      <div class="rb-import-actions">
        <button class="rb-ghost-btn" type="button" :disabled="importing" @click="importFromParse">
          <Icon icon="lucide:wand-2" :width="13"/>
          {{ importing ? '解析中…' : '解析并填充' }}
        </button>
        <button class="rb-ghost-btn" type="button" @click="showImport = false">取消</button>
      </div>
    </div>

    <!-- ══ BODY 三栏 ══ -->
    <div v-if="!hasArtifactQuery || artifactReady" class="rb-body">

      <!-- ══ LEFT: 模块导航 ══ -->
      <aside class="rb-left">
        <div v-if="artifactReady" class="rb-agent-advice">
          <span class="rb-agent-advice__eyebrow">来自 Agent 对话 · 演示简历</span>
          <strong>{{ handoff.artifact.value?.title }}</strong>
          <p>{{ handoff.artifact.value?.summary }}</p>
          <div v-for="item in recommendations" :key="item.id" class="rb-agent-advice__item">
            <button type="button" :aria-label="item.applied ? `取消完成 ${item.title}` : `完成 ${item.title}`" @click="toggleRecommendation(item.id)"><Icon :icon="item.applied ? 'lucide:check-circle-2' : 'lucide:circle'" :width="15" /></button>
            <div><b>{{ item.title }}</b><small>{{ item.detail }}</small><button type="button" class="rb-agent-advice__jump" @click="activeModule = item.target">去修改 →</button></div>
          </div>
        </div>
        <div class="rb-left-section-hd">布局</div>
        <div class="rb-module-list">
          <button
            v-for="m in MODULES" :key="m.key"
            class="rb-module-btn"
            :class="{ 'rb-module-btn--active': activeModule === m.key }"
            @click="activeModule = m.key"
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
            <Icon :icon="MODULES.find(m => m.key === activeModule)?.icon ?? 'lucide:file'" :width="15"/>
          </span>
          {{ MODULES.find(m => m.key === activeModule)?.label }}
        </div>

        <!-- 模块内容 -->
        <div class="rb-mid-body">

          <!-- ── 基本信息 ── -->
          <template v-if="activeModule === 'basic'">
            <div class="rb-form-group">
              <div class="rb-form-group-title">资料</div>
              <div class="rb-field-row rb-field-row--avatar">
                <div class="rb-frow-l">
                  <Icon icon="lucide:image" :width="13" class="rb-frow-ico"/>
                  <span class="rb-frow-lbl">头像</span>
                </div>
                <div class="rb-avatar-box" @click="avatarInput?.click()">
                  <img v-if="avatarBase64" :src="avatarBase64" class="rb-avi" alt="头像"/>
                  <Icon v-else icon="lucide:camera" :width="16" class="rb-avi-ph"/>
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
          <button class="rb-use-btn-lg" @click="useResume">
            <Icon icon="lucide:check" :width="14"/>使用此简历
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
                <div v-if="w.desc" class="rp-richtext" v-html="w.desc"/>
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
                <div v-if="p.desc" class="rp-richtext" v-html="p.desc"/>
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
              <div class="rp-richtext" v-html="form.selfEval"/>
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
  </div><!-- /rb-page -->
</template>

<style scoped>
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
</style>
