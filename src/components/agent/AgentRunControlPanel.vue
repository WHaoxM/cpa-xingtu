<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  canCancelTask, canPauseTask, canResumeTask, canReviseTask,
  controlRequest, currentPlanCanBeSaved, isCancellationPending, statusLabel,
  type AgentRunControlRequest, type AgentRunControlSnapshot, type AgentRunTaskPatch,
} from './agentRunControlModel'

const props = withDefaults(defineProps<{
  run: AgentRunControlSnapshot | null
  readOnly?: boolean
  showFinalReply?: boolean
  savedPlan?: AgentRunControlSnapshot['current_plan']
  busy?: boolean
  error?: string
  saveState?: {
    contract_revision: number
    plan_version: number
    status: 'saving' | 'uncertain'
  } | null
}>(), { readOnly: false, showFinalReply: true, savedPlan: null, busy: false, error: '', saveState: null })

const emit = defineEmits<{
  control: [request: AgentRunControlRequest]
  resume: [request: { expected_revision: number }]
  save: [request: { contract_revision: number; plan_version: number }]
  refresh: []
  'read-saved-plan': [request: { plan_version: number }]
}>()

const goalEditorOpen = ref(false)
const goalDraft = ref('')
const selectedConstraint = ref('')
const constraintDraft = ref('')
const cancelConfirmOpen = ref(false)
const displayedStatus = computed(() => props.run ? statusLabel(props.run.status) : '')
const canRevise = computed(() => !props.readOnly && !!props.run && canReviseTask(props.run))
const canSave = computed(() => !props.readOnly && !!props.run && currentPlanCanBeSaved(props.run))
const verifiedSavedPlan = computed(() => {
  const run = props.run
  const plan = props.savedPlan
  if (!run || !plan) return null
  const contractRevision = plan.metadata?.task_contract_revision
  const receipt = (run.saved_artifacts || []).find(item =>
    item.plan_version === plan.plan_version
      && item.contract_revision === contractRevision
      && item.plan_sha256 === plan.plan_sha256,
  )
  return receipt ? { plan, receipt } : null
})
const saveMatchesCurrent = computed(() => !!props.run?.current_plan
  && props.saveState?.contract_revision === props.run.current_contract_revision
  && props.saveState?.plan_version === props.run.current_plan.plan_version)

watch(() => props.run?.current_contract_revision, () => {
  if (!props.run) return
  goalDraft.value = props.run.task_contract?.goal || ''
  selectedConstraint.value = ''
  constraintDraft.value = ''
  goalEditorOpen.value = false
})

watch(() => [props.run?.run_id, props.run?.status] as const, () => {
  const run = props.run
  if (!run || isCancellationPending(run) || ['completed', 'failed', 'cancelled', 'partial'].includes(run.status)) {
    cancelConfirmOpen.value = false
  }
})

function submitGoal() {
  const run = props.run
  const goal = goalDraft.value.trim()
  if (!run || !canRevise.value || !goal || goal === run.task_contract?.goal) return
  emit('control', controlRequest(run, 'revise_goal', { goal }))
}

function selectConstraint(event: Event) {
  const target = event.target as HTMLSelectElement
  selectedConstraint.value = target.value
  constraintDraft.value = target.value
}

function submitConstraint() {
  const run = props.run
  const value = constraintDraft.value.trim()
  if (!run || !canRevise.value || !value) return
  const patch: AgentRunTaskPatch = selectedConstraint.value
    ? { constraint_updates: [{ current: selectedConstraint.value, replacement: value }] }
    : { add_constraints: [value] }
  if (selectedConstraint.value === value) return
  emit('control', controlRequest(run, 'supplement', patch))
}

function reviseConstraint(current: string) {
  selectedConstraint.value = current
  constraintDraft.value = current
}

function useSavedPlan(planVersion: number) {
  emit('read-saved-plan', { plan_version: planVersion })
}

function confirmSave() {
  const run = props.run
  if (!run || !currentPlanCanBeSaved(run) || props.busy) return
  emit('save', {
    contract_revision: run.current_contract_revision,
    plan_version: run.current_plan!.plan_version,
  })
}

function confirmCancel() {
  const run = props.run
  if (!run || props.busy || !canCancelTask(run)) return
  emit('control', controlRequest(run, 'cancel'))
  cancelConfirmOpen.value = false
}
</script>

<template>
  <section v-if="run" class="agent-run-control" aria-label="Agent 任务进度与控制">
    <header class="agent-run-control__header">
      <div class="agent-run-control__title">
        <h3>任务进展</h3>
        <span>任务 {{ run.run_id }}</span>
      </div>
      <strong class="agent-run-control__status" role="status">{{ displayedStatus }}</strong>
      <button v-if="!readOnly" class="agent-run-control__refresh" type="button" :disabled="busy" @click="emit('refresh')">
        重新读取
      </button>
    </header>

    <p class="agent-run-control__revision">
      当前任务约束第 {{ run.current_contract_revision }} 版
      <span v-if="run.current_plan">· 执行计划第 {{ run.current_plan.plan_version }} 版</span>
      <span v-if="run.pause_requested">· 已记录暂停请求</span>
      <span v-if="isCancellationPending(run)">· 已记录取消请求</span>
    </p>

    <section v-if="run.task_contract" class="agent-run-control__section" aria-labelledby="agent-run-goal">
      <div class="agent-run-control__section-head">
        <h4 id="agent-run-goal">当前目标</h4>
        <button v-if="canRevise" type="button" :disabled="busy" @click="goalEditorOpen = !goalEditorOpen">
          {{ goalEditorOpen ? '收起修改' : '修改目标' }}
        </button>
      </div>
      <p class="agent-run-control__goal">{{ run.task_contract.goal }}</p>
      <form v-if="goalEditorOpen && canRevise" class="agent-run-control__form" @submit.prevent="submitGoal">
        <label>
          新目标
          <textarea v-model="goalDraft" rows="2" maxlength="2000" :disabled="busy" />
        </label>
        <button type="submit" :disabled="busy || !goalDraft.trim()">提交目标修订</button>
        <small>提交后会产生新契约版本；旧计划与结果不会作为新版本成果显示。</small>
      </form>

      <div v-if="run.task_contract.constraints.length" class="agent-run-control__constraints">
        <h5>当前约束</h5>
        <ul>
          <li v-for="constraint in run.task_contract.constraints" :key="constraint">
            <span>{{ constraint }}</span>
            <button v-if="canRevise" type="button" :disabled="busy"
              :aria-label="`修改约束：${constraint}`" @click="reviseConstraint(constraint)">
              修改
            </button>
          </li>
        </ul>
      </div>
      <form v-if="canRevise" class="agent-run-control__form" @submit.prevent="submitConstraint">
        <label>
          <span>{{ selectedConstraint ? '替换这条约束' : '新增约束' }}</span>
          <select :value="selectedConstraint" :disabled="busy" aria-label="选择需要修改的现有约束" @change="selectConstraint">
            <option value="">新增约束</option>
            <option v-for="constraint in run.task_contract.constraints" :key="constraint" :value="constraint">
              修改：{{ constraint }}
            </option>
          </select>
          <textarea v-model="constraintDraft" rows="2" maxlength="1000" :disabled="busy"
            :placeholder="selectedConstraint ? '写下替换后的约束' : '例如：每周投入六小时'" />
        </label>
        <button type="submit" :disabled="busy || !constraintDraft.trim()">
          {{ selectedConstraint ? '提交约束修订' : '添加约束' }}
        </button>
      </form>
    </section>

    <section v-if="run.current_plan" class="agent-run-control__section" aria-labelledby="agent-run-plan">
      <h4 id="agent-run-plan">已持久化计划 · 第 {{ run.current_plan.plan_version }} 版</h4>
      <p class="agent-run-control__goal">{{ run.current_plan.goal_summary }}</p>
      <ol class="agent-run-control__steps">
        <li v-for="step in run.current_plan.steps" :key="`${run.current_plan.plan_version}-${step.step_index}`">
          <span>{{ step.goal }}</span>
          <strong>{{ statusLabel(step.status) }}</strong>
        </li>
      </ol>
    </section>

    <section v-if="showFinalReply && run.final_result?.reply" class="agent-run-control__section" aria-labelledby="agent-run-result">
      <h4 id="agent-run-result">当前结果</h4>
      <p class="agent-run-control__result">{{ run.final_result.reply }}</p>
      <small v-if="run.final_result_checkpoint">结果已保存为暂停检查点，恢复时会继续核对，不会重做此调用。</small>
    </section>

    <section v-if="run.saved_artifacts?.length" class="agent-run-control__section" aria-labelledby="agent-run-saved">
      <h4 id="agent-run-saved">已确认保存的版本</h4>
      <ul class="agent-run-control__saved-list">
        <li v-for="saved in run.saved_artifacts" :key="saved.confirmation_id">
          <div>
            <strong>计划第 {{ saved.plan_version }} 版</strong>
            <span>· 契约第 {{ saved.contract_revision }} 版</span>
            <small v-if="saved.contract_revision !== run.current_contract_revision">这是较早的契约版本</small>
            <small v-if="saved.saved_at">保存时间：{{ saved.saved_at }}</small>
          </div>
          <button v-if="!readOnly" type="button" @click="useSavedPlan(saved.plan_version)">读取此版本</button>
        </li>
      </ul>
    </section>

    <section v-if="verifiedSavedPlan" class="agent-run-control__section" aria-label="已验证的保存版本正文">
      <h4>已核验保存计划 · 第 {{ verifiedSavedPlan.plan.plan_version }} 版</h4>
      <p class="agent-run-control__revision">
        契约第 {{ verifiedSavedPlan.receipt.contract_revision }} 版 · {{ verifiedSavedPlan.receipt.plan_sha256 }}
      </p>
      <p class="agent-run-control__goal">{{ verifiedSavedPlan.plan.goal_summary }}</p>
      <ol class="agent-run-control__steps">
        <li v-for="step in verifiedSavedPlan.plan.steps"
          :key="`${verifiedSavedPlan.plan.plan_version}-${step.step_index}`">
          <span>{{ step.goal }}</span><strong>{{ statusLabel(step.status) }}</strong>
        </li>
      </ol>
    </section>

    <section v-if="canSave || saveMatchesCurrent" class="agent-run-control__save" aria-label="保存计划版本">
      <template v-if="saveState && saveMatchesCurrent">
        <p v-if="saveState.status === 'saving'" role="status">
          正在核验计划第 {{ saveState.plan_version }} 版的保存结果。
        </p>
        <p v-else role="alert">
          保存结果尚未确认。请重新读取任务状态；若仍未确认，按原幂等键核对同一版本。
        </p>
      </template>
      <template v-else-if="canSave && run.current_plan">
        <h4>确认保存此计划版本</h4>
        <p>将保存计划第 {{ run.current_plan.plan_version }} 版、契约第 {{ run.current_contract_revision }} 版。</p>
        <button type="button" :disabled="busy" @click="confirmSave">
          确认保存计划第 {{ run.current_plan.plan_version }} 版
        </button>
      </template>
    </section>

    <footer v-if="!readOnly" class="agent-run-control__actions" aria-label="任务控制">
      <button v-if="canPauseTask(run)" type="button" :disabled="busy"
        @click="emit('control', controlRequest(run, 'pause'))">暂停任务</button>
      <button v-else-if="run.status === 'pause_requested' || run.status === 'paused'" type="button" disabled>
        {{ run.status === 'paused' ? '任务已暂停' : '正在等待安全点暂停' }}
      </button>
      <button v-if="canResumeTask(run)" type="button" :disabled="busy"
        @click="emit('resume', { expected_revision: run.current_contract_revision })">恢复任务</button>
      <button v-if="isCancellationPending(run)" class="agent-run-control__cancel"
        type="button" disabled>正在等待取消安全点</button>
      <button v-else-if="canCancelTask(run) && !cancelConfirmOpen" class="agent-run-control__cancel" type="button" :disabled="busy"
        @click="cancelConfirmOpen = true">取消任务</button>
      <button type="button" :disabled="busy"
        @click="emit('control', controlRequest(run, 'progress_query'))">查看最新进展</button>
    </footer>

    <div v-if="!readOnly && cancelConfirmOpen && canCancelTask(run)" class="agent-run-control__cancel-confirm" role="group" aria-label="确认取消任务">
      <p>取消会在安全节点生效，任务可能需要短暂时间才能停止。</p>
      <button class="agent-run-control__cancel-confirm-action" type="button" :disabled="busy" @click="confirmCancel">确认取消</button>
      <button type="button" :disabled="busy" @click="cancelConfirmOpen = false">继续任务</button>
    </div>

    <p v-if="error" class="agent-run-control__error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.agent-run-control {
  display: grid;
  gap: 14px;
  min-width: 0;
  color: var(--color-text-primary, #3b352c);
  font: inherit;
}
.agent-run-control button,
.agent-run-control textarea,
.agent-run-control select { font: inherit; }
.agent-run-control button {
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #ded8ce);
  border-radius: 8px;
  background: var(--color-surface, #fffdf8);
  color: inherit;
  cursor: pointer;
}
.agent-run-control button:disabled { opacity: .58; cursor: not-allowed; }
.agent-run-control button:focus-visible,
.agent-run-control textarea:focus-visible,
.agent-run-control select:focus-visible { outline: 2px solid var(--color-primary, #bb664b); outline-offset: 2px; }
.agent-run-control__header,
.agent-run-control__section-head,
.agent-run-control__actions,
.agent-run-control__saved-list li,
.agent-run-control__steps li {
  display: flex;
  align-items: center;
  gap: 10px;
}
.agent-run-control__header { flex-wrap: wrap; }
.agent-run-control__title { min-width: 0; }
.agent-run-control__title h3,
.agent-run-control h4,
.agent-run-control h5 { margin: 0; }
.agent-run-control__title h3 { font-size: 16px; }
.agent-run-control__title span,
.agent-run-control__revision,
.agent-run-control small { color: var(--color-text-secondary, #776e62); }
.agent-run-control__title span { display: block; overflow-wrap: anywhere; font-size: 11px; }
.agent-run-control__status { margin-left: auto; font-size: 13px; }
.agent-run-control__refresh { white-space: nowrap; }
.agent-run-control__revision { margin: -6px 0 0; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.agent-run-control__section {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--color-border, #ded8ce);
  border-radius: 12px;
  background: var(--color-surface, #fffdf8);
}
.agent-run-control__section h4 { font-size: 14px; }
.agent-run-control__section-head { justify-content: space-between; }
.agent-run-control__goal,
.agent-run-control__result { margin: 8px 0 0; line-height: 1.7; overflow-wrap: anywhere; white-space: pre-wrap; }
.agent-run-control__form { display: grid; gap: 8px; margin-top: 12px; }
.agent-run-control__form label { display: grid; gap: 6px; font-size: 12px; }
.agent-run-control__form textarea,
.agent-run-control__form select {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 9px 10px;
  border: 1px solid var(--color-border, #ded8ce);
  border-radius: 8px;
  background: var(--color-background, #f8f6f0);
  color: inherit;
  font-size: 16px;
  line-height: 1.5;
}
.agent-run-control__form textarea { resize: vertical; }
.agent-run-control__constraints { margin-top: 14px; }
.agent-run-control__constraints h5 { font-size: 12px; }
.agent-run-control__constraints ul,
.agent-run-control__saved-list,
.agent-run-control__steps { display: grid; gap: 8px; margin: 8px 0 0; padding: 0; list-style: none; }
.agent-run-control__constraints li { display: flex; align-items: flex-start; gap: 8px; }
.agent-run-control__constraints li span { flex: 1; min-width: 0; overflow-wrap: anywhere; line-height: 1.6; }
.agent-run-control__constraints li button { min-height: 36px; flex: none; }
.agent-run-control__steps li { align-items: flex-start; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--color-border, #ded8ce); }
.agent-run-control__steps li:last-child { border-bottom: 0; }
.agent-run-control__steps span { min-width: 0; overflow-wrap: anywhere; line-height: 1.6; }
.agent-run-control__steps strong { flex: none; font-size: 12px; font-weight: 600; }
.agent-run-control__saved-list li { align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
.agent-run-control__saved-list li div { min-width: 0; display: grid; gap: 3px; overflow-wrap: anywhere; }
.agent-run-control__saved-list li strong,
.agent-run-control__saved-list li span { font-size: 13px; }
.agent-run-control__saved-list li small { font-size: 11px; }
.agent-run-control__save { padding: 12px 14px; border-left: 3px solid var(--color-primary, #bb664b); background: color-mix(in srgb, var(--color-primary, #bb664b) 6%, var(--color-surface, #fffdf8)); }
.agent-run-control__save h4 { margin: 0; font-size: 14px; }
.agent-run-control__save p { margin: 5px 0 10px; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.agent-run-control__actions { flex-wrap: wrap; }
.agent-run-control__cancel { color: var(--color-danger, #9a4336) !important; }
.agent-run-control__cancel-confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--color-danger, #9a4336) 35%, var(--color-border, #ded8ce));
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-danger, #9a4336) 5%, var(--color-surface, #fffdf8));
}
.agent-run-control__cancel-confirm p { flex: 1 1 100%; margin: 0; font-size: 12px; line-height: 1.5; }
.agent-run-control__cancel-confirm .agent-run-control__cancel-confirm-action { color: var(--color-danger, #9a4336); }
.agent-run-control__error { margin: 0; color: var(--color-danger, #9a4336); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
@media (max-width: 560px) {
  .agent-run-control__section { padding: 12px; }
  .agent-run-control__actions > button { flex: 1 1 calc(50% - 10px); }
  .agent-run-control__saved-list li > button { width: 100%; }
}
</style>
