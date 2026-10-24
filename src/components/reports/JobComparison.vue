<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ApiError } from '@/api/types'
import { getStudentWorkbenchState, type StudentWorkbenchState } from '@/api/pipeline'
import { getJobCatalogDetail, type JobCatalogItem } from '@/api/jobCatalog'
import { runJobComparison, getMatchResult, getMatchExplain, type DecisionOutcome, type MatchResult, type MatchExplain } from '@/api/match'
import { generateComparisonReport, getReportDetail, getReportList } from '@/api/report'

const props = defineProps<{ job: JobCatalogItem }>()
const router = useRouter()
const user = useUserStore()
const opened = ref(false)
const busy = ref(false)
const state = ref<StudentWorkbenchState | null>(null)
const result = ref<MatchResult | null>(null)
const explanation = ref<MatchExplain | null>(null)
const outcome = ref<DecisionOutcome | null>(null)
const message = ref('')
const uncertain = ref<'match' | 'report' | null>(null)
const blockedMessages: Record<string, string> = {
  confirmed_resume_unavailable: '简历尚未确认或确认依据已变化。请到职途导航重新核对并确认。',
  confirmed_portrait_unavailable: '当前确认简历还没有可用于对照的完整画像。请到职途导航查看处理进度和缺失依据。',
  catalog_requirements_unknown: '这份岗位的评分必需要求尚未核实，暂时不能对照。请重新选择已具备依据的岗位。',
  catalog_publication_unavailable: '这份岗位已撤回或发布版本不可用。请返回目录重新选择。',
  scoring_evidence_incomplete: '评分依据尚不完整，本次没有生成匹配记录。未知项不会记成零分。',
}
const ready = computed(() => !!state.value?.source_confirmation_task_id
  && state.value.run.state !== 'waiting_for_user'
  && !state.value.based_on_previous_upload && state.value.portrait.scoring_eligible)
const readiness = computed(() => {
  const s = state.value
  if (!s) return ''
  if (s.run.state === 'waiting_for_user') return '新简历还在等待你确认，请先到职途导航核对。'
  if (!s.source_confirmation_task_id) return '还没有可使用的已确认简历，请先到职途导航上传并确认。'
  if (s.based_on_previous_upload) return '最新上传还没有完成确认，暂不使用上一份简历开始新的对照。'
  if (!s.portrait.scoring_eligible) return '当前简历画像尚不满足对照条件。请到职途导航查看缺失依据或处理进度；未知项不是零分。'
  return '将使用本人当前已确认简历及对应画像，与这份岗位资料对照。'
})
function resetResult() { result.value = null; explanation.value = null; outcome.value = null }
function friendly(error: unknown) {
  if (error instanceof ApiError && [403, 404, 409].includes(error.status)) {
    return '资料权限、确认版本或发布状态已变化，旧结果不再显示。请重新读取资料，或到职途导航完成确认后再对照。'
  }
  if (state.value && !ready.value) return readiness.value
  return '暂时无法核对服务端结果。没有确认成功，也不会自动重复生成；请先核对已保存成果。'
}
async function checkInputs() {
  const current = await getJobCatalogDetail(props.job.job_portrait_id)
  if (current.publication_status !== 'published'
    || current.publication_version !== props.job.publication_version
    || current.content_sha256 !== props.job.content_sha256) throw new Error('岗位版本已变化，请返回目录重新打开资料。')
  const response = await getStudentWorkbenchState()
  if (!response.data) throw new Error('无法读取本人当前简历，请稍后重试。')
  state.value = response.data
}
async function prepare() {
  if (busy.value) return
  opened.value = true; busy.value = true; message.value = ''; resetResult()
  try { await checkInputs() } catch (e) { state.value = null; message.value = friendly(e) }
  finally { busy.value = false }
}
async function readMatch() {
  const id = user.currentUser?.id
  if (!id) throw new Error('请重新登录')
  const value = await getMatchResult(id, props.job.job_portrait_id)
  if (!value || value.job_portrait_id !== props.job.job_portrait_id || value.student_id !== id) throw new Error('成果尚未核实')
  const detail = await getMatchExplain(id, props.job.job_portrait_id)
  // Both reads can finish after another tab confirms a different resume.
  // Recheck immediately before publishing; an old HTTP 200 is not current evidence.
  await checkInputs()
  if (!ready.value || user.currentUser?.id !== id) throw new Error('当前资料尚不可用于对照')
  if (!value.match_id || (outcome.value?.match_id && String(value.match_id) !== String(outcome.value.match_id))
    || (outcome.value?.task_id && value.source_match_task_id !== outcome.value.task_id)
    || value.sources?.source_confirmation_task_id !== state.value?.source_confirmation_task_id
    || value.sources?.source_publication_version !== props.job.publication_version
    || value.sources?.source_publication_sha256 !== props.job.content_sha256) throw new ApiError('成果来源已变化', 409)
  result.value = value; explanation.value = detail
}
async function compare() {
  if (busy.value || uncertain.value) return
  busy.value = true; message.value = ''; resetResult()
  try {
    await checkInputs()
    if (!ready.value) return
    // Never send client skills, owner, scores, or a preselected report reference.
    uncertain.value = 'match'
    const response = await runJobComparison(props.job.job_portrait_id)
    outcome.value = response.data?.result ?? response.data ?? null
    uncertain.value = null
    if (!outcome.value?.match_id) {
      message.value = blockedMessages[outcome.value?.reason ?? '']
        || '本次尚未产生可核验的对照成果。请到职途导航检查画像与确认依据，完善后再试。'
      return
    }
    await readMatch()
  } catch (e) { resetResult(); message.value = friendly(e) }
  finally { busy.value = false }
}
async function generate() {
  if (busy.value || !result.value || uncertain.value) return
  busy.value = true; message.value = ''
  try {
    await checkInputs()
    if (!ready.value) { resetResult(); return }
    await readMatch() // Recheck the persisted match before creating a report.
    uncertain.value = 'report'
    const response = await generateComparisonReport(props.job.job_portrait_id)
    const id = response.data?.report_id
    if (!id) {
      uncertain.value = null
      message.value = blockedMessages[response.data?.reason ?? ''] || '尚未生成可回读的报告。请检查当前资料后再试。'
      return
    }
    const report = await getReportDetail(id)
    if (!report) throw new Error('报告尚未读回')
    const sources = report.snapshot.sources as Record<string, unknown> | undefined
    if (!sources || String(sources.match_id) !== String(result.value?.match_id)
      || sources.source_confirmation_task_id !== state.value?.source_confirmation_task_id
      || sources.source_publication_sha256 !== props.job.content_sha256) throw new Error('报告来源与本次对照不一致')
    uncertain.value = null
    await router.push({ name: 'student-my-reports', query: { report_id: id } })
  } catch (e) { resetResult(); message.value = friendly(e) }
  finally { busy.value = false }
}
async function reconcile() {
  if (busy.value) return
  busy.value = true; message.value = ''; resetResult()
  try {
    await checkInputs()
    if (uncertain.value === 'report') {
      await getReportList()
      await router.push({ name: 'student-my-reports' })
    } else { await readMatch(); uncertain.value = null }
  } catch (e) { message.value = friendly(e) }
  finally { busy.value = false }
}
</script>

<template>
  <section class="job-comparison" aria-label="简历与岗位对照" aria-live="polite">
    <button v-if="!opened" type="button" class="primary" @click="prepare">用我的简历对照这个岗位</button>
    <template v-else>
      <h3>先确认本次使用的资料</h3>
      <p v-if="busy" role="status">正在核对资料与服务端成果，请稍候…</p>
      <p v-if="readiness && message !== readiness">{{ readiness }}</p>
      <p>岗位资料：{{ job.position_name }} · 管理员审核发布；招聘状态仍未确认。</p>
      <button v-if="!ready" type="button" @click="router.push({ name: 'student-career-navigation' })">去职途导航查看资料</button>
      <button v-if="!result && !uncertain && !message" type="button" :disabled="busy" @click="prepare">重新读取资料</button>
      <button v-if="ready && !result && !uncertain" class="primary" type="button" :disabled="busy" @click="compare">确认资料并开始对照</button>
      <div v-if="result" class="comparison-result">
        <h3>这次对照已有部分成果</h3>
        <p>以下是基于当前资料的规则估计，不是录用概率，也不是申请建议；评分规则与建议质量尚未验证。</p>
        <p v-if="typeof result.total_score === 'number'">规则估计参考值：{{ result.total_score }}。不能据此认定能力已核实。</p>
        <h4>有依据的对应项</h4>
        <p>{{ explanation?.keyword_coverage?.matched?.join('、') || '当前结果没有列出可直接对应的技能，不能推定已满足要求。' }}</p>
        <h4>资料显示的差距</h4>
        <p>{{ explanation?.keyword_coverage?.missing?.join('、') || '当前结果没有列出具体缺口；这不代表没有差距。' }}</p>
        <h4>仍然未知</h4>
        <p>实际能力、招聘有效性、行动建议和资源推荐仍缺少独立核验依据；未知项不记为零分。</p>
        <button class="primary" type="button" :disabled="busy || !!uncertain" @click="generate">生成这次对照报告</button>
      </div>
      <p v-if="message" class="comparison-error" role="alert">{{ message }}</p>
      <button v-if="uncertain" type="button" :disabled="busy" @click="reconcile">核对已保存成果</button>
      <button v-else-if="message" type="button" :disabled="busy" @click="prepare">重新读取资料</button>
    </template>
  </section>
</template>

<style scoped>
.job-comparison { margin-top: 20px; padding: 18px; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface, #fff); }
h3,h4 { margin: 8px 0; color: var(--text); }
p { color: var(--muted); font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
button { min-height: 42px; padding: 9px 15px; margin: 4px 8px 4px 0; border: 1px solid var(--line); border-radius: var(--radius-pill); background: transparent; color: var(--color-primary-dark); cursor: pointer; font: inherit; font-size: 13px; }
button.primary { background: var(--color-primary); color: white; border-color: transparent; }
button:disabled { opacity: .6; cursor: wait; }
.comparison-error { color: #a14031; }
.comparison-result { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 12px; }
</style>
