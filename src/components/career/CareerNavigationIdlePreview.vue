<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { ResumeTraceEvent } from '@/api/pipeline'
import { describeResumeEntityCheckpoint } from '@/utils/resumeTraceAttempts'
import CareerNavigationBackdrop from '@/components/career/CareerNavigationBackdrop.vue'

const props = withDefaults(defineProps<{
  live?: boolean
  traceOnly?: boolean
  progress?: number
  attempt?: number | null
  trace?: ResumeTraceEvent[]
  historyTrace?: ResumeTraceEvent[]
  traceError?: string
  candidateReady?: boolean
  confirmed?: boolean
  failed?: boolean
}>(), { live: false, traceOnly: false, progress: 0, attempt: null, trace: () => [], historyTrace: () => [], traceError: '', candidateReady: false, confirmed: false, failed: false })

const agents = [
  { name: 'DocumentAgent', label: '文档读取', done: 'source_extracted', running: 'source_extract' },
  { name: 'StructureAgent', label: '事实结构化', done: 'structure_extracted', running: 'structure_extract' },
  { name: 'EntityAgent', label: '实体核验', done: 'entity_resolved', running: 'entity_extract' },
  { name: 'EvidenceAgent', label: '证据整理', done: 'evidence_assembled', running: 'evidence_assemble' },
] as const
const currentEvent = computed(() => props.trace[props.trace.length - 1])
const hasTeamTrace = computed(() => props.trace.some(event => event.stage === 'attempt_started' || event.stage === 'handoff_document'))
const savedWithoutTrace = computed(() => props.live && props.attempt !== null
  && (props.candidateReady || props.confirmed) && !props.trace.length && !props.traceError)
const showTeam = computed(() => hasTeamTrace.value
  || (!savedWithoutTrace.value && !props.candidateReady && !props.confirmed
    && !props.failed && !props.traceError && props.progress < 100))
const agentStates = computed(() => agents.map(agent => ({ ...agent,
  state: agent.name === 'EntityAgent' && props.trace.some(event => event.stage === agent.done
    && describeResumeEntityCheckpoint(event.facts?.link_status).limited) ? 'limited'
    : props.trace.some(event => event.stage === agent.done) ? 'done'
    : props.trace.some(event => event.stage === agent.running) ? (props.failed ? 'failed' : 'running') : 'waiting',
})))
const currentAgent = computed(() => [...agentStates.value].reverse().find(agent => agent.state === 'running')
  || [...agentStates.value].reverse().find(agent => agent.state === 'failed' || agent.state === 'done' || agent.state === 'limited'))
const stepIndex = computed(() => Math.min(3, Math.floor(Math.max(0, props.progress) / 25)))
const traceStatus = computed(() => props.failed ? '处理失败' : props.confirmed ? '简历已确认' : props.candidateReady ? '待本人核对' : props.traceError ? '进度暂不可读' : hasTeamTrace.value ? '正在解析' : '等待处理')
const phaseLabel = computed(() => savedWithoutTrace.value ? '历史轨迹未留存' : currentAgent.value?.label || '等待接收')
const attemptLabel = computed(() => savedWithoutTrace.value ? '已有结果'
  : props.attempt === null ? '等待开始' : props.attempt === 0 ? '等待处理'
    : props.attempt === 1 ? '首次处理' : `第 ${props.attempt} 次尝试`)
const progressLabel = computed(() => props.traceError ? '暂不可读取'
  : savedWithoutTrace.value ? '无可回放检查点'
    : props.attempt === null ? '等待进度更新' : `${Math.round(props.progress)}% · ${Math.floor(props.progress / 25)}/4 步`)
const milestoneDetails = computed(() => {
  const facts = (stage: string) => props.trace.find(event => event.stage === stage)?.facts || {}
  const document = facts('source_extracted')
  const structure = facts('structure_extracted')
  const entity = facts('entity_resolved')
  const evidence = facts('evidence_assembled')
  return [
    typeof document.block_count === 'number'
      ? `${document.block_count} 段文字${typeof document.text_chars === 'number' ? ` · ${document.text_chars} 字` : ''}` : '',
    typeof structure.field_count === 'number'
      ? `${structure.field_count} 个字段${typeof structure.project_count === 'number' ? ` · ${structure.project_count} 项项目` : ''}` : '',
    typeof entity.mention_count === 'number'
      ? `${entity.mention_count} 条技能提及 · ${describeResumeEntityCheckpoint(entity.link_status).detail}` : '',
    typeof evidence.block_count === 'number'
      ? `${evidence.block_count} 段证据${typeof evidence.missing_page_count === 'number' && evidence.missing_page_count > 0 ? ` · ${evidence.missing_page_count} 页未取得文字` : ''}` : '',
  ]
})
function eventTitle(event: ResumeTraceEvent) {
  if (event.stage === 'entity_resolved' && describeResumeEntityCheckpoint(event.facts?.link_status).limited) {
    return '技能线索已整理，关联核验尚未完成'
  }
  const labels: Record<string, string> = {
    file_received: '已接收简历', attempt_started: '开始本轮解析', source_extract: '读取文档内容', source_extracted: '文字与区块已提取',
    handoff_document: '开始整理简历事实', structure_extract: '识别简历事实',
    structure_model: '识别经历与教育信息', structure_extracted: '简历事实已整理',
    handoff_structure: '开始核对技术词', entity_extract: '核对技术词',
    mention_model: '识别简历提及的技术词', link_model: '核对技术词名称',
    entity_resolved: '技术词已核对', handoff_entity: '开始整理原文依据',
    evidence_assemble: '整理原文证据', evidence_assembled: '证据包已形成',
    candidate_saved: '候选档案已保存', failed: '任务未完成',
  }
  return labels[event.stage] || '解析过程有更新'
}
const stageLabels = ['结构解析', '维度评估', '经历映射', '总结生成']
const liveStageLabels = ['文档解析', '事实结构化', '实体核验', '证据整理']
const profileMetaWidths = ['102px', '86px', '56px']
const scoreCards = [
  { label: '完整度', width: '58%', tone: 'green' },
  { label: '竞争力', width: '46%', tone: 'red' },
]
const honorStatWidths = ['44px', '42px', '40px']
const dimensionRows = [
  { label: '专业能力', width: '82%', scoreWidth: '24px', descWidth: '84%' },
  { label: '项目表达', width: '68%', scoreWidth: '22px', descWidth: '72%' },
  { label: '协作推进', width: '74%', scoreWidth: '26px', descWidth: '80%' },
  { label: '岗位匹配', width: '61%', scoreWidth: '22px', descWidth: '70%' },
  { label: '成长潜力', width: '57%', scoreWidth: '20px', descWidth: '62%' },
]
const tagWidths = ['68px', '84px', '58px', '76px', '62px']
const honorCards = [
  { tone: 'gold', width: '72%' },
  { tone: 'blue', width: '64%' },
  { tone: 'red', width: '68%' },
]
const projectCards = [
  { titleWidth: '70%', roleWidth: '56px', descWidths: ['92%', '78%'] },
  { titleWidth: '62%', roleWidth: '48px', descWidths: ['86%', '64%'] },
]
const suggestionRows = [
  { tagWidth: '54px', lineWidths: ['90%'] },
  { tagWidth: '58px', lineWidths: ['84%'] },
  { tagWidth: '54px', lineWidths: ['88%'] },
]
const statusRows = [
  { label: '当前阶段', width: '78%' },
  { label: '任务状态', width: '64%' },
  { label: '处理步骤', width: '52%' },
  { label: '完成进度', width: '60%' },
]
const logRows = [
  { label: '接收简历', width: '52%' },
  { label: '拆解经历', width: '68%' },
  { label: '整理能力结构', width: '74%' },
  { label: '生成总结判断', width: '60%' },
]
const summaryLineWidths = ['92%', '88%', '78%']
const selfSummaryLineWidths = ['84%', '72%']
const actionWidths = ['106px', '132px', '92px']
</script>

<template>
  <section class="cnip-shell" :class="{ 'cnip-shell--trace-only': traceOnly }" :aria-label="live ? '简历解析过程' : '分析结果预览'">
    <div v-if="!traceOnly" class="cnip-portrait-side">
    <CareerNavigationBackdrop />
    <header class="cnip-header">
      <span class="cnip-eyebrow">{{ live ? '真实解析过程' : '分析结果预览' }}</span>
      <h2 class="cnip-title">{{ live ? (failed ? '解析未完成，可查看中断位置' : candidateReady ? '简历候选已生成，等你核对' : !hasTeamTrace ? '简历已接收，接下来逐步整理你的经历' : '你的经历，正在被整理成能力画像的依据') : '你的经历，会在这里被整理成一张能力画像' }}</h2>
      <p class="cnip-desc">{{ live ? '进度来自后端已完成的检查点；未核对的资料不会变成正式分数。' : '主结果会先落在左侧画像区，分析过程会持续出现在右侧仪表盘。' }}</p>
    </header>

      <article class="cnip-card cnip-card--portrait">
        <div class="cnip-phase-track">
          <div
            v-for="(label, index) in (live ? liveStageLabels : stageLabels)"
            :key="label"
            class="cnip-phase-step"
            :class="{ 'cnip-phase-step--active': live ? !failed && progress < 100 && index === stepIndex : index === 0, 'cnip-phase-step--done': live && progress >= (index + 1) * 25, 'cnip-phase-step--failed': live && failed && agentStates[index]?.state === 'failed' }"
          >
            <span class="cnip-phase-dot">{{ index + 1 }}</span>
            <span class="cnip-phase-label">{{ label }}</span>
            <span v-if="index < stageLabels.length - 1" class="cnip-phase-line"></span>
          </div>
        </div>

        <div v-if="live" class="cnip-live-banner" role="status" aria-live="polite">
          <div class="cnip-live-banner__top">
            <span><Icon icon="lucide:workflow" :width="15" /> {{ phaseLabel }}</span>
            <strong>{{ traceStatus }}</strong>
          </div>
          <p>{{ savedWithoutTrace ? '此任务没有留下可回放的解析进度。' : traceError ? '进度暂不可读取，请稍后刷新。' : currentEvent ? eventTitle(currentEvent) : '任务已建立，等待开始读取文件' }}<template v-if="!traceError && attempt !== null && !savedWithoutTrace"> · {{ Math.floor(progress / 25) }} / 4 步完成</template></p>
        </div>

        <div v-if="live" class="cnip-live-workspace">
          <div class="cnip-live-workspace__intro">
            <strong>{{ failed ? '解析在这里中断' : candidateReady ? '已取得可核对的简历候选' : !hasTeamTrace ? '文件已保存，等待开始读取' : '正在从原文整理事实' }}</strong>
            <p>{{ failed ? '已完成的步骤仍可在右侧查看；未完成的步骤不会补画结果。' : candidateReady ? '请到左侧对照原文核对。这里记录解析交接，不代表能力画像或岗位匹配已完成。' : '下方只展示服务端已经写入的检查点；画像分数要等核对后再生成。' }}</p>
          </div>
          <ol class="cnip-live-milestones" aria-label="简历解析四步进展">
            <li v-for="(agent, index) in agentStates" :key="agent.name" :class="`cnip-live-milestone--${agent.state}`">
              <span class="cnip-live-milestone__index">{{ String(index + 1).padStart(2, '0') }}</span>
              <div>
                <strong>{{ agent.label }}</strong>
                <p>{{ milestoneDetails[index] || (agent.state === 'failed' ? '此步骤未完成，已停止处理' : agent.state === 'running' ? '正在处理，等待后端检查点' : agent.state === 'done' ? '检查点已写入' : failed ? '未执行' : '等待前一步完成') }}</p>
              </div>
              <span class="cnip-live-milestone__state">{{ agent.state === 'failed' ? '已中断' : agent.state === 'limited' ? '部分可用' : agent.state === 'done' ? '已完成' : agent.state === 'running' ? '进行中' : failed ? '未执行' : '待开始' }}</span>
            </li>
          </ol>
        </div>

        <div v-else class="cnip-canvas">
          <section class="cnip-surface cnip-surface--header">
            <div class="cnip-profile">
              <span class="cnip-skeleton cnip-skeleton--avatar"></span>
              <div class="cnip-profile__meta">
                <div class="cnip-profile__name-row">
                  <span class="cnip-skeleton cnip-skeleton--name"></span>
                  <span class="cnip-skeleton cnip-skeleton--pill cnip-skeleton--pill-short"></span>
                  <span class="cnip-skeleton cnip-skeleton--pill"></span>
                </div>
                <div class="cnip-profile__school-row">
                  <Icon icon="lucide:school" :width="10" class="cnip-profile__meta-icon" />
                  <span
                    v-for="(width, index) in profileMetaWidths"
                    :key="width + index"
                    class="cnip-skeleton cnip-skeleton--meta"
                    :style="{ width }"
                  ></span>
                </div>
              </div>
            </div>

            <div class="cnip-scoreband">
              <div v-for="item in scoreCards" :key="item.label" class="cnip-score" :class="'cnip-score--' + item.tone">
                <span class="cnip-score__label">{{ item.label }}</span>
                <span class="cnip-skeleton cnip-skeleton--score-value" :style="{ width: item.width }"></span>
              </div>
              <div class="cnip-score cnip-score--gold cnip-score--honors">
                <div class="cnip-honor-row">
                  <span v-for="(width, index) in honorStatWidths" :key="width + index" class="cnip-honor-item">
                    <span class="cnip-skeleton cnip-skeleton--honor-count" :style="{ width }"></span>
                  </span>
                </div>
                <span class="cnip-score__label">荣誉档案</span>
              </div>
            </div>
          </section>

          <div class="cnip-visual-row">
            <section class="cnip-surface cnip-surface--radar">
              <div class="cnip-surface__head cnip-surface__head--compact">
                <span class="cnip-section__title">维度概览</span>
                <span class="cnip-section__hint">会先形成结构轮廓</span>
              </div>
              <div class="cnip-radar">
                <span class="cnip-radar__ring cnip-radar__ring--outer"></span>
                <span class="cnip-radar__ring cnip-radar__ring--mid"></span>
                <span class="cnip-radar__ring cnip-radar__ring--inner"></span>
                <span class="cnip-radar__axis cnip-radar__axis--x"></span>
                <span class="cnip-radar__axis cnip-radar__axis--y"></span>
                <span class="cnip-radar__axis cnip-radar__axis--d1"></span>
                <span class="cnip-radar__axis cnip-radar__axis--d2"></span>
                <span class="cnip-skeleton cnip-skeleton--radar-core"></span>
              </div>
            </section>

            <section class="cnip-surface cnip-surface--dims">
              <div class="cnip-surface__head cnip-surface__head--compact">
                <span class="cnip-section__title">维度判断</span>
                <span class="cnip-section__hint">分值、标签与说明会按真实报告的顺序铺开</span>
              </div>
              <div v-for="row in dimensionRows" :key="row.label" class="cnip-dim">
                <div class="cnip-dim__top">
                  <span class="cnip-dim__label">{{ row.label }}</span>
                  <div class="cnip-dim__meta">
                    <span class="cnip-skeleton cnip-skeleton--dim-badge"></span>
                    <span class="cnip-skeleton cnip-skeleton--dim-src"></span>
                  </div>
                </div>
                <div class="cnip-dim__bar-wrap">
                  <span class="cnip-skeleton cnip-skeleton--metric" :style="{ width: row.width }"></span>
                  <span class="cnip-skeleton cnip-skeleton--dim-score" :style="{ width: row.scoreWidth }"></span>
                </div>
                <span class="cnip-skeleton cnip-skeleton--dim-desc" :style="{ width: row.descWidth }"></span>
              </div>
              <div class="cnip-tags">
                <span class="cnip-tags__label">技能清单</span>
                <div class="cnip-tags__list">
                  <span
                    v-for="(width, index) in tagWidths"
                    :key="width + index"
                    class="cnip-skeleton cnip-skeleton--tag"
                    :style="{ width }"
                  ></span>
                </div>
              </div>
            </section>
          </div>

          <section class="cnip-surface cnip-surface--highlights">
            <div class="cnip-surface__head cnip-surface__head--compact">
              <span class="cnip-section__title">经历亮点</span>
              <span class="cnip-section__hint">真实报告里，这里会分成荣誉列与项目列</span>
            </div>
            <div class="cnip-highlights">
              <div class="cnip-highlights__col">
                <div
                  v-for="(item, index) in honorCards"
                  :key="item.tone + index"
                  class="cnip-honor-card"
                  :class="'cnip-honor-card--' + item.tone"
                >
                  <Icon
                    :icon="index === 0 ? 'lucide:award' : index === 1 ? 'lucide:briefcase' : 'lucide:trophy'"
                    :width="13"
                    class="cnip-honor-card__icon"
                  />
                  <span class="cnip-skeleton cnip-skeleton--highlight" :style="{ width: item.width }"></span>
                </div>
              </div>
              <div class="cnip-highlights__col">
                <div v-for="(project, index) in projectCards" :key="project.titleWidth + index" class="cnip-project-card">
                  <div class="cnip-project-card__accent"></div>
                  <div class="cnip-project-card__body">
                    <div class="cnip-project-card__head">
                      <span class="cnip-skeleton cnip-skeleton--project-title" :style="{ width: project.titleWidth }"></span>
                      <span class="cnip-skeleton cnip-skeleton--project-role" :style="{ width: project.roleWidth }"></span>
                    </div>
                    <div class="cnip-project-card__desc">
                      <span
                        v-for="(width, descIndex) in project.descWidths"
                        :key="project.titleWidth + width + descIndex"
                        class="cnip-skeleton cnip-skeleton--project-desc"
                        :style="{ width }"
                      ></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="cnip-surface cnip-surface--summary">
            <div class="cnip-surface__head cnip-surface__head--compact">
              <span class="cnip-section__title">AI 综合评语</span>
              <span class="cnip-section__hint">判断会在维度、经历与亮点收束后落在这里</span>
            </div>
            <div class="cnip-summary">
              <span
                v-for="(width, index) in summaryLineWidths"
                :key="width + index"
                class="cnip-skeleton cnip-skeleton--line"
                :style="{ width }"
              ></span>
            </div>
            <div class="cnip-suggestions">
              <div v-for="(item, index) in suggestionRows" :key="item.tagWidth + index" class="cnip-suggestion">
                <span class="cnip-skeleton cnip-skeleton--suggestion-tag" :style="{ width: item.tagWidth }"></span>
                <div class="cnip-suggestion__body">
                  <span
                    v-for="(width, lineIndex) in item.lineWidths"
                    :key="item.tagWidth + width + lineIndex"
                    class="cnip-skeleton cnip-skeleton--suggestion-line"
                    :style="{ width }"
                  ></span>
                </div>
              </div>
            </div>
            <div class="cnip-summary-divider"></div>
            <div class="cnip-self-summary">
              <span
                v-for="(width, index) in selfSummaryLineWidths"
                :key="width + index"
                class="cnip-skeleton cnip-skeleton--line"
                :style="{ width }"
              ></span>
            </div>
          </section>

          <section class="cnip-surface cnip-surface--step-guide">
            <div class="cnip-step-guide">
              <div class="cnip-step-guide__info">
                <span class="cnip-step-guide__title">下一步建议</span>
                <span class="cnip-skeleton cnip-skeleton--step-title"></span>
                <span class="cnip-skeleton cnip-skeleton--step-desc"></span>
                <div class="cnip-inline-note cnip-inline-note--soft">
                  <Icon icon="lucide:scan-search" :width="14" />
                  <span>上传之后，这里会接着给出保存画像与后续分析入口。</span>
                </div>
              </div>
              <div class="cnip-step-guide__actions">
                <span
                  v-for="(width, index) in actionWidths"
                  :key="width + index"
                  class="cnip-skeleton cnip-skeleton--action"
                  :style="{ width }"
                ></span>
              </div>
            </div>
          </section>
        </div>
      </article>
    </div>

    <aside class="cnip-dashboard-side" aria-label="简历解析进度">
        <div class="cnip-console__head">
          <div class="cnip-console__title-wrap">
            <span class="cnip-console__eyebrow">简历解析</span>
            <span class="cnip-console__title">{{ live || traceOnly ? '本次简历的解析进度' : '开始后将在这里看到进度' }}</span>
          </div>
          <div class="cnip-console__controls" aria-hidden="true">
            <span class="cnip-console__control"></span>
            <span class="cnip-console__control"></span>
          </div>
        </div>

        <template v-if="live || traceOnly">
          <div class="cnip-live-status">
            <div><span>当前进展</span><strong>{{ traceStatus }}</strong></div>
          </div>
          <div class="cnip-live-status">
            <div><span>处理步骤</span><strong>{{ phaseLabel }}</strong></div>
            <div><span>本轮处理</span><strong>{{ attemptLabel }}</strong></div>
            <details class="cnip-progress-details">
              <summary>查看解析检查点</summary>
              <div class="cnip-live-status__track"><span :style="{ width: `${traceError || attempt === null ? 0 : Math.min(100, Math.max(0, progress))}%` }"></span></div>
              <p class="cnip-live-status__note">{{ progressLabel }}；这里仅表示简历解析检查点，不代表画像已完成。</p>
            </details>
          </div>
          <div v-if="showTeam" class="cnip-team">
            <div class="cnip-team__heading">四步解析进度 <span>根据实际记录更新</span></div>
            <div v-for="(agent, index) in agentStates" :key="agent.name" class="cnip-team__agent" :class="`cnip-team__agent--${agent.state}`">
              <span class="cnip-team__index">0{{ index + 1 }}</span>
              <div><strong>{{ agent.label }}</strong><small v-if="milestoneDetails[index]">{{ milestoneDetails[index] }}</small></div>
              <span class="cnip-team__state">{{ agent.state === 'failed' ? '已中断' : agent.state === 'limited' ? '部分可用' : agent.state === 'done' ? '完成' : agent.state === 'running' ? '执行中' : failed ? '未执行' : '等待' }}</span>
            </div>
          </div>
          <p v-else-if="savedWithoutTrace" class="cnip-legacy-note">简历内容已保存，可以继续核对；这份历史记录没有可查看的解析进度。</p>
          <p v-if="traceError" class="cnip-trace-error">解析进度暂不可读取，请稍后刷新；已保存的简历内容不受影响。</p>
          <p v-if="!showTeam" class="cnip-trace-empty">{{ savedWithoutTrace ? '简历已确认，可以查看当前结果。' : '解析进度以已完成的步骤为准。' }}</p>
        </template>
        <template v-else>
        <div class="cnip-console__status-list">
          <div v-for="row in statusRows" :key="row.label" class="cnip-console__status">
            <span class="cnip-console__label">{{ row.label }}</span>
            <span class="cnip-skeleton cnip-skeleton--console-stat" :style="{ width: row.width }"></span>
          </div>
        </div>

        <div class="cnip-console__hintline">
          <Icon icon="lucide:bot" :width="12" />
          <span>开始后，这里会显示简历解析的关键步骤。</span>
        </div>

        <div class="cnip-console__logs">
          <div v-for="row in logRows" :key="row.label" class="cnip-log">
            <span class="cnip-log__dot"></span>
            <span class="cnip-log__label">{{ row.label }}</span>
            <span class="cnip-skeleton cnip-skeleton--log" :style="{ width: row.width }"></span>
          </div>
        </div>
        </template>
    </aside>
  </section>
</template>

<style scoped>
.cnip-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  color: var(--color-text, #111111);
}
.cnip-portrait-side { overflow-y: auto; scrollbar-color: #c9b9aa transparent; scrollbar-width: thin; }
.cnip-dashboard-side { overflow-y: auto; scrollbar-color: #555 transparent; scrollbar-width: thin; }
.cnip-live-status__note { color: #bcb3aa; line-height: 1.6; }
.cnip-progress-details summary { color: #d6d6d6; cursor: pointer; font-size: 12px; }
.cnip-progress-details summary:focus-visible { outline: 2px solid #e8ac5c; outline-offset: 3px; }
.cnip-shell--trace-only .cnip-dashboard-side { width: 100%; }
.cnip-phase-step--done .cnip-phase-dot { background: #41755b; color: #fff; border-color: #41755b; }
.cnip-phase-step--done .cnip-phase-label { color: #41755b; }
.cnip-phase-step--failed .cnip-phase-dot { color: #a43c20; border-color: #a43c20; }
.cnip-phase-step--failed .cnip-phase-label, .cnip-live-milestone--failed .cnip-live-milestone__state { color: #a43c20; }
.cnip-team__agent--failed .cnip-team__state { color: #f0a58b; }
.cnip-live-banner { padding: 12px 18px 14px; border-bottom: 1px solid #e6dfd7; background: #f8f3ed; }
.cnip-live-banner__top { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #5c392b; }
.cnip-live-banner__top span { display: inline-flex; gap: 7px; align-items: center; }
.cnip-live-banner__top strong { font-size: 18px; }
.cnip-live-banner__track, .cnip-live-status__track { height: 5px; border-radius: 99px; background: #ded9d3; overflow: hidden; margin-top: 10px; }
.cnip-live-banner__track span, .cnip-live-status__track span { display: block; height: 100%; background: #a43c20; transition: width .45s ease; }
.cnip-live-banner p { margin: 7px 0 0; color: #795e50; font-size: 11px; }
.cnip-live-workspace { flex: 1; min-height: 0; overflow-y: auto; padding: clamp(20px, 3vw, 36px); }
.cnip-live-workspace__intro { max-width: 560px; margin-bottom: 24px; }
.cnip-live-workspace__intro strong { color: var(--color-text, #111); font-size: clamp(18px, 2vw, 24px); font-weight: 650; }
.cnip-live-workspace__intro p { max-width: 52ch; margin: 8px 0 0; color: var(--color-text-muted, #666); font-size: 13px; line-height: 1.65; }
.cnip-live-milestones { display: grid; gap: 0; max-width: 660px; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--color-border, #cbc8c2); }
.cnip-live-milestones li { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: start; gap: 14px; padding: 19px 0; border-bottom: 1px solid var(--color-border, #cbc8c2); }
.cnip-live-milestone__index { color: #9c8f84; font-size: 11px; font-variant-numeric: tabular-nums; }
.cnip-live-milestones strong { color: var(--color-text, #111); font-size: 15px; font-weight: 600; }
.cnip-live-milestones p { margin: 5px 0 0; color: var(--color-text-muted, #666); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.cnip-live-milestone__state { color: #776f68; font-size: 11px; white-space: nowrap; }
.cnip-live-milestone--done .cnip-live-milestone__state { color: #41755b; }
.cnip-live-milestone--limited .cnip-live-milestone__state { color: #946329; }
.cnip-live-milestone--running .cnip-live-milestone__state { color: #a43c20; }
.cnip-live-status { padding: 12px 14px; display: grid; gap: 8px; border-bottom: 1px solid #303030; }
.cnip-live-status > div:not(.cnip-live-status__track) { display: flex; justify-content: space-between; gap: 8px; font: 10px Consolas, monospace; }
.cnip-live-status span { color: #818181; }
.cnip-live-status strong { color: #e5dfd8; font-weight: 500; text-align: right; }
.cnip-live-status__track { background: #363636; margin: 1px 0 0; }
.cnip-team { padding: 13px 12px; border-bottom: 1px solid #303030; }
.cnip-team__heading { color: #e3a58d; font: 700 12px/1.6 var(--font-body, sans-serif); }
.cnip-team__heading span { display: block; color: #aaa; font-size: 11px; font-weight: 400; }
.cnip-team__agent { display: grid; grid-template-columns: 20px 1fr auto; gap: 7px; align-items: center; padding: 12px 0; border-bottom: 1px solid #333; }
.cnip-team__agent:last-child { border-bottom: 0; }
.cnip-team__agent--running, .cnip-team__agent--done { opacity: 1; }
.cnip-team__agent--limited { opacity: 1; }
.cnip-team__agent--limited .cnip-team__state { color: #dfb776; }
.cnip-team__index { color: #8b6a5d; font: 10px Consolas, monospace; }
.cnip-team__agent strong { color: #e6e1dc; font: 600 12px/1.6 var(--font-body, sans-serif); display: block; }
.cnip-team__agent small { display: block; color: #b7afa9; font-size: 11px; margin-top: 3px; }
.cnip-team__state { color: #aaa; font-size: 11px; }
.cnip-team__agent--running .cnip-team__state { color: #e8ac5c; }
.cnip-team__agent--done .cnip-team__state { color: #79bf94; }
.cnip-legacy-note { margin: 0; padding: 12px 14px; border-bottom: 1px solid #303030; color: #a9a09a; font-size: 11px; line-height: 1.6; }
.cnip-trace-details { border-bottom: 1px solid #303030; }
.cnip-trace-details > summary { display: flex; justify-content: space-between; gap: 8px; padding: 13px 14px; cursor: pointer; list-style: none; color: #e9e2db; font-size: 12px; font-weight: 650; }
.cnip-trace-details > summary::-webkit-details-marker { display: none; }
.cnip-trace-details > summary span { color: #9b9b9b; font-weight: 400; }
.cnip-trace-list { overflow-y: auto; max-height: 50vh; padding: 0 11px 12px; display: flex; flex-direction: column; gap: 7px; }
.cnip-trace-event { border-left: 2px solid #5d5d5d; background: #232323; padding: 8px 9px; border-radius: 0 6px 6px 0; }
.cnip-trace-event--handoff { border-color: #cb673f; background: #2d231f; }
.cnip-trace-event--error { border-color: #d56262; }
.cnip-trace-event__top { display: flex; justify-content: space-between; gap: 8px; color: #9b9b9b; font: 10px Consolas, monospace; }
.cnip-trace-event strong { display: block; color: #e9e2db; font-size: 11px; margin-top: 4px; }
.cnip-trace-event p { color: #a4a09b; overflow-wrap: anywhere; font: 10px/1.5 Consolas, monospace; margin: 4px 0 0; }
.cnip-trace-empty, .cnip-trace-error { color: #aaa; font-size: 11px; padding: 10px 3px; }
.cnip-trace-error { color: #eb9b85; padding: 0 14px; }
.cnip-trace-history { border-top: 1px solid #303030; color: #a9a09a; font-size: 10px; }
.cnip-trace-history summary { display: flex; justify-content: space-between; gap: 8px; padding: 10px 14px; cursor: pointer; }
.cnip-trace-history summary span { color: #777; text-align: right; }
.cnip-trace-history__list { display: grid; gap: 7px; max-height: 190px; overflow-y: auto; padding: 0 11px 11px; }

.cnip-portrait-side {
  position: relative;
  isolation: isolate;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: clamp(22px, 3.8vw, 36px);
}
.cnip-portrait-side > :not(.career-nav-backdrop) { position: relative; z-index: 1; }

.cnip-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 720px;
}

.cnip-eyebrow,
.cnip-surface__eyebrow,
.cnip-console__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-primary-dark, #8B1A00) 70%, var(--color-text-muted, #666666) 30%);
}

.cnip-title {
  margin: 0;
  font-size: clamp(24px, 2.5vw, 34px);
  line-height: 1.18;
  letter-spacing: 0.01em;
  color: var(--color-text, #111111);
}

.cnip-desc,
.cnip-score__label,
.cnip-section__hint,
.cnip-console__label,
.cnip-log__label,
.cnip-surface__flag,
.cnip-surface__title,
.cnip-inline-note,
.cnip-console__title,
.cnip-phase-label,
.cnip-dim__label,
.cnip-tags__label,
.cnip-step-guide__title,
.cnip-project-card__head,
.cnip-project-card__desc {
  font-family: var(--font-body, 'Noto Sans SC', 'Microsoft YaHei', sans-serif);
}

.cnip-desc {
  margin: 0;
  max-width: 640px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-muted, #666666);
}

.cnip-card {
  min-width: 0;
  min-height: 0;
}

.cnip-card--portrait {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-border, #CBCBC8) 84%, #ffffff 16%);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(247, 245, 241, 0.92));
  box-shadow: 0 20px 42px rgba(52, 37, 20, 0.08);
}

.cnip-phase-track {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border, #CBCBC8) 82%, #ffffff 18%);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(249, 247, 243, 0.84));
}

.cnip-phase-step {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.cnip-phase-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--color-border, #CBCBC8) 82%, #ffffff 18%);
  background: rgba(255, 255, 255, 0.82);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-text-subtle, #999999);
}

.cnip-phase-step--active .cnip-phase-dot {
  border-color: color-mix(in srgb, var(--color-primary-dark, #8B1A00) 44%, var(--color-border, #CBCBC8) 56%);
  background: color-mix(in srgb, var(--color-primary) 8%, #ffffff 92%);
  color: var(--color-primary-dark, #8B1A00);
  box-shadow: 0 0 0 3px rgba(139, 26, 0, 0.06);
}

.cnip-phase-label {
  font-size: 11px;
  color: var(--color-text-muted, #666666);
  white-space: nowrap;
}

.cnip-phase-step--active .cnip-phase-label {
  color: var(--color-primary-dark, #8B1A00);
}

.cnip-phase-line {
  height: 1px;
  flex: 1;
  min-width: 12px;
  background: color-mix(in srgb, var(--color-border, #CBCBC8) 74%, transparent 26%);
}

.cnip-canvas {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cnip-canvas::-webkit-scrollbar,
.cnip-console__logs::-webkit-scrollbar {
  width: 3px;
}

.cnip-canvas::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--color-primary-dark, #8B1A00) 24%, var(--color-border, #CBCBC8) 76%);
  border-radius: 2px;
}

.cnip-surface {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--color-border, #CBCBC8) 86%, #ffffff 14%);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(249, 247, 243, 0.84));
  box-shadow: 0 10px 22px rgba(72, 48, 24, 0.06);
}

.cnip-surface__head,
.cnip-console__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cnip-surface__head--compact {
  margin-bottom: 2px;
}

.cnip-surface__title {
  margin: 6px 0 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  color: color-mix(in srgb, var(--color-text, #111111) 86%, var(--color-text-muted, #666666) 14%);
}

.cnip-surface__flag {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.03em;
  border: 1px solid color-mix(in srgb, var(--color-primary-dark, #8B1A00) 18%, var(--color-border, #CBCBC8) 82%);
  background: color-mix(in srgb, var(--color-primary) 6%, #ffffff 94%);
  color: var(--color-primary-dark, #8B1A00);
}

.cnip-profile {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cnip-profile__meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cnip-profile__name-row,
.cnip-profile__school-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.cnip-profile__meta-icon {
  flex-shrink: 0;
  color: var(--color-text-subtle, #999999);
}

.cnip-scoreband {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.cnip-score {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border, #CBCBC8) 86%, #ffffff 14%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
}

.cnip-score--green {
  background: color-mix(in srgb, #447755 8%, #ffffff 92%);
  border-color: color-mix(in srgb, #447755 22%, var(--color-border, #CBCBC8) 78%);
}

.cnip-score--red {
  background: color-mix(in srgb, var(--color-primary-dark, #8B1A00) 8%, #ffffff 92%);
  border-color: color-mix(in srgb, var(--color-primary-dark, #8B1A00) 22%, var(--color-border, #CBCBC8) 78%);
}

.cnip-score--gold {
  background: color-mix(in srgb, var(--color-gold-dark, #8B6A00) 8%, #ffffff 92%);
  border-color: color-mix(in srgb, var(--color-gold-dark, #8B6A00) 20%, var(--color-border, #CBCBC8) 80%);
}

.cnip-score__label {
  font-size: 11px;
  color: var(--color-text-muted, #666666);
}

.cnip-score--honors {
  justify-content: space-between;
}

.cnip-honor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cnip-honor-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-gold-dark, #8B6A00) 16%, var(--color-border, #CBCBC8) 84%);
  background: rgba(255, 255, 255, 0.84);
}

.cnip-visual-row {
  display: grid;
  grid-template-columns: minmax(220px, 0.88fr) minmax(0, 1.12fr);
  gap: 14px;
}

.cnip-radar {
  position: relative;
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.cnip-radar__ring,
.cnip-radar__axis {
  position: absolute;
  pointer-events: none;
}

.cnip-radar__ring {
  border-radius: 50%;
  border: 1px dashed color-mix(in srgb, var(--color-border, #CBCBC8) 80%, transparent 20%);
}

.cnip-radar__ring--outer {
  width: min(140px, 80%);
  aspect-ratio: 1 / 1;
}

.cnip-radar__ring--mid {
  width: min(100px, 58%);
  aspect-ratio: 1 / 1;
}

.cnip-radar__ring--inner {
  width: min(60px, 36%);
  aspect-ratio: 1 / 1;
}

.cnip-radar__axis {
  background: color-mix(in srgb, var(--color-border, #CBCBC8) 72%, transparent 28%);
}

.cnip-radar__axis--x {
  width: min(140px, 80%);
  height: 1px;
}

.cnip-radar__axis--y {
  width: 1px;
  height: min(140px, 80%);
}

.cnip-radar__axis--d1,
.cnip-radar__axis--d2 {
  width: 1px;
  height: min(140px, 80%);
}

.cnip-radar__axis--d1 {
  transform: rotate(45deg);
}

.cnip-radar__axis--d2 {
  transform: rotate(-45deg);
}

.cnip-dim {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cnip-dim + .cnip-dim {
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--color-border, #CBCBC8) 74%, transparent 26%);
}

.cnip-dim__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cnip-dim__meta,
.cnip-dim__bar-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cnip-dim__bar-wrap {
  min-width: 0;
}

.cnip-dim__label,
.cnip-section__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #111111);
}

.cnip-section__hint {
  font-size: 11px;
  color: var(--color-text-subtle, #999999);
}

.cnip-tags {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--color-border, #CBCBC8) 74%, transparent 26%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cnip-tags__label {
  font-size: 11px;
  color: var(--color-text-muted, #666666);
}

.cnip-tags__list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cnip-summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cnip-highlights {
  display: grid;
  grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
  gap: 12px;
}

.cnip-highlights__col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cnip-honor-card,
.cnip-project-card {
  padding: 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border, #CBCBC8) 80%, #ffffff 20%);
  background: color-mix(in srgb, var(--color-background, #F5F5F3) 74%, #ffffff 26%);
}

.cnip-honor-card {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cnip-honor-card--gold {
  background: color-mix(in srgb, var(--color-gold-dark, #8B6A00) 8%, #ffffff 92%);
  border-color: color-mix(in srgb, var(--color-gold-dark, #8B6A00) 18%, var(--color-border, #CBCBC8) 82%);
}

.cnip-honor-card--blue {
  background: color-mix(in srgb, var(--color-secondary, #1B4E79) 8%, #ffffff 92%);
  border-color: color-mix(in srgb, var(--color-secondary, #1B4E79) 16%, var(--color-border, #CBCBC8) 84%);
}

.cnip-honor-card--red {
  background: color-mix(in srgb, var(--color-primary-dark, #8B1A00) 8%, #ffffff 92%);
  border-color: color-mix(in srgb, var(--color-primary-dark, #8B1A00) 16%, var(--color-border, #CBCBC8) 84%);
}

.cnip-honor-card__icon {
  flex-shrink: 0;
  color: var(--color-text-subtle, #999999);
}

.cnip-project-card {
  display: flex;
  gap: 12px;
  background: rgba(255, 255, 255, 0.92);
}

.cnip-project-card__accent {
  width: 4px;
  border-radius: 999px;
  flex-shrink: 0;
  background: linear-gradient(180deg, var(--color-primary-dark, #8B1A00), var(--color-gold-dark, #8B6A00));
}

.cnip-project-card__body,
.cnip-project-card__desc {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.cnip-project-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cnip-surface--summary {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-primary-dark, #8B1A00) 4%, #ffffff 96%),
    color-mix(in srgb, var(--color-gold-dark, #8B6A00) 4%, #ffffff 96%)
  );
}

.cnip-inline-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border, #CBCBC8) 84%, #ffffff 16%);
  background: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-muted, #666666);
}

.cnip-inline-note--soft {
  background: rgba(255, 255, 255, 0.68);
}

.cnip-suggestions,
.cnip-self-summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cnip-suggestion {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border, #CBCBC8) 82%, #ffffff 18%);
  background: rgba(255, 255, 255, 0.76);
}

.cnip-suggestion__body {
  flex: 1;
  min-width: 0;
}

.cnip-summary-divider {
  height: 1px;
  background: color-mix(in srgb, var(--color-primary-dark, #8B1A00) 10%, var(--color-border, #CBCBC8) 90%);
}

.cnip-surface--step-guide {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-primary-dark, #8B1A00) 5%, #ffffff 95%),
    color-mix(in srgb, var(--color-gold-dark, #8B6A00) 7%, #ffffff 93%)
  );
}

.cnip-step-guide {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.cnip-step-guide__info,
.cnip-step-guide__actions {
  display: flex;
  flex-direction: column;
}

.cnip-step-guide__info {
  flex: 1;
  min-width: 0;
  gap: 10px;
}

.cnip-step-guide__actions {
  flex-shrink: 0;
  gap: 10px;
}

.cnip-step-guide__title {
  font-size: 12px;
  font-weight: 700;
  color: color-mix(in srgb, var(--color-text, #111111) 78%, var(--color-text-muted, #666666) 22%);
}

.cnip-dashboard-side {
  width: 248px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, #171717, #101010 62%, #0c0c0c);
  color: #d6d6d6;
  font-family: 'Consolas', 'Monaco', monospace;
}

.cnip-console__title-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cnip-console__head {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.cnip-console__title {
  font-size: 12px;
  line-height: 1.55;
  color: rgba(214, 214, 214, 0.76);
}

.cnip-console__controls {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.cnip-console__control {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
}

.cnip-console__status-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
}

.cnip-console__status {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cnip-console__label {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(214, 214, 214, 0.54);
}

.cnip-console__hintline {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11px;
  line-height: 1.7;
  color: rgba(214, 214, 214, 0.72);
}

.cnip-console__logs {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 14px 12px;
}

.cnip-console__logs::-webkit-scrollbar-thumb {
  background: #3a332c;
  border-radius: 2px;
}

.cnip-log {
  display: grid;
  grid-template-columns: 10px 58px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.cnip-log__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(104, 211, 145, 0.8);
  box-shadow: 0 0 8px rgba(104, 211, 145, 0.28);
}

.cnip-log__label {
  font-size: 11px;
  color: rgba(214, 214, 214, 0.64);
}

.cnip-skeleton {
  display: block;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(228, 225, 219, 0.88), rgba(255, 255, 255, 0.98), rgba(228, 225, 219, 0.88));
  background-size: 220% 100%;
  animation: cnip-shimmer 2.8s linear infinite;
}

.cnip-dashboard-side .cnip-skeleton {
  background: linear-gradient(90deg, rgba(64, 64, 64, 0.72), rgba(92, 92, 92, 0.92), rgba(64, 64, 64, 0.72));
  background-size: 220% 100%;
}

.cnip-skeleton--avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
}

.cnip-skeleton--name {
  width: min(220px, 72%);
  height: 18px;
}

.cnip-skeleton--pill {
  width: 84px;
  height: 22px;
}

.cnip-skeleton--pill-short {
  width: 56px;
}

.cnip-skeleton--meta {
  height: 12px;
}

.cnip-skeleton--sub {
  width: min(180px, 58%);
  height: 12px;
}

.cnip-skeleton--sub-short {
  width: min(140px, 42%);
}

.cnip-skeleton--score-value {
  height: 12px;
}

.cnip-skeleton--honor-count {
  height: 10px;
}

.cnip-skeleton--tag {
  height: 26px;
}

.cnip-skeleton--highlight {
  height: 12px;
}

.cnip-skeleton--project-title {
  height: 12px;
}

.cnip-skeleton--project-role,
.cnip-skeleton--suggestion-tag,
.cnip-skeleton--dim-badge,
.cnip-skeleton--dim-src,
.cnip-skeleton--action {
  height: 24px;
}

.cnip-skeleton--project-desc,
.cnip-skeleton--suggestion-line,
.cnip-skeleton--dim-desc,
.cnip-skeleton--step-title,
.cnip-skeleton--step-desc {
  height: 10px;
}

.cnip-skeleton--dim-score {
  height: 10px;
}

.cnip-skeleton--radar-core {
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.cnip-skeleton--metric,
.cnip-skeleton--line,
.cnip-skeleton--log,
.cnip-skeleton--console-stat {
  height: 10px;
}

.cnip-skeleton--console-stat {
  width: 80%;
}

@keyframes cnip-shimmer {
  from {
    background-position: 100% 50%;
  }
  to {
    background-position: -120% 50%;
  }
}

@media (max-width: 1180px) {
  .cnip-dashboard-side {
    width: 224px;
  }

  .cnip-visual-row,
  .cnip-highlights {
    grid-template-columns: 1fr;
  }

  .cnip-step-guide {
    flex-direction: column;
  }

  .cnip-step-guide__actions {
    width: 100%;
  }
}

@media (max-width: 900px) {
  .cnip-shell {
    flex-direction: column;
  }

  .cnip-portrait-side {
    padding: 22px 20px 18px;
    gap: 18px;
  }

  .cnip-dashboard-side {
    width: 100%;
    height: auto;
    min-height: 280px;
    border-left: none;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .cnip-phase-track {
    flex-wrap: wrap;
  }

  .cnip-phase-step {
    flex: 1 1 calc(50% - 8px);
  }

  .cnip-phase-line {
    display: none;
  }

  .cnip-surface__head,
  .cnip-surface__head--compact {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
}

@media (max-width: 640px) {
  .cnip-shell, .cnip-portrait-side, .cnip-dashboard-side,
  .cnip-canvas, .cnip-console, .cnip-surface, .cnip-profile { min-width: 0; max-width: 100%; box-sizing: border-box; }
  .cnip-shell { width: 100%; }
  .cnip-console__title, .cnip-phase-step, .cnip-log, .cnip-log > *,
  .cnip-trace-event, .cnip-team__agent { min-width: 0; overflow-wrap: anywhere; white-space: normal; }
  .cnip-portrait-side {
    padding: 18px 16px 16px;
  }

  .cnip-title {
    font-size: 24px;
  }

  .cnip-desc {
    font-size: 12px;
  }

  .cnip-phase-track {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 10px;
  }

  .cnip-phase-step {
    flex: none;
  }

  .cnip-profile {
    align-items: flex-start;
  }

  .cnip-scoreband {
    grid-template-columns: 1fr;
  }

  .cnip-project-card__head {
    flex-direction: column;
    align-items: flex-start;
  }

  .cnip-canvas,
  .cnip-console__head,
  .cnip-console__status-list,
  .cnip-console__hintline,
  .cnip-console__logs {
    padding-left: 12px;
    padding-right: 12px;
  }

  .cnip-log {
    grid-template-columns: 10px 52px minmax(0, 1fr);
    gap: 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cnip-skeleton {
    animation: none;
  }
}

/* 真实任务的常驻过程栏沿用宣纸、墨色和朱砂，不做整栏黑色调试终端。 */
.cnip-shell--trace-only .cnip-dashboard-side {
  width: 100%;
  height: 100%;
  background: var(--color-background, #f5f5f3);
  border-left: 0;
  color: var(--color-text, #1a1a1a);
  font-family: var(--font-ui, 'Noto Sans SC', sans-serif);
}
.cnip-shell--trace-only .cnip-console__head,
.cnip-shell--trace-only .cnip-live-status,
.cnip-shell--trace-only .cnip-team,
.cnip-shell--trace-only .cnip-legacy-note,
.cnip-shell--trace-only .cnip-trace-history {
  background: #fff;
  border-color: var(--color-border, #cbcbc8);
}
.cnip-shell--trace-only .cnip-console__head { padding: 18px 18px 15px; }
.cnip-shell--trace-only .cnip-console__controls { display: none; }
.cnip-shell--trace-only .cnip-console__eyebrow { color: var(--color-primary-dark, #8b1a00); }
.cnip-shell--trace-only .cnip-console__title {
  color: var(--color-text, #1a1a1a);
  font-size: 15px;
  font-weight: 650;
}
.cnip-shell--trace-only .cnip-live-status { padding: 14px 18px; gap: 9px; }
.cnip-shell--trace-only .cnip-live-status > div:not(.cnip-live-status__track) {
  font: 12px/1.4 var(--font-ui, 'Noto Sans SC', sans-serif);
}
.cnip-shell--trace-only .cnip-live-status span { color: var(--color-text-muted, #666); }
.cnip-shell--trace-only .cnip-live-status strong { color: var(--color-text, #1a1a1a); }
.cnip-shell--trace-only .cnip-live-status__track { background: var(--parchment-200, #ededea); }
.cnip-live-status__note { margin: 2px 0 0; color: #5d5954; font: 11px/1.5 var(--font-ui, 'Noto Sans SC', sans-serif); }
.cnip-shell--trace-only .cnip-team { padding: 0 18px; }
.cnip-shell--trace-only .cnip-team__heading {
  padding: 13px 0;
  color: var(--color-text, #1a1a1a);
  font: 600 12px/1.4 var(--font-ui, 'Noto Sans SC', sans-serif);
}
.cnip-shell--trace-only .cnip-team__heading span { color: var(--color-text-muted, #666); }
.cnip-shell--trace-only .cnip-team__agent { border-color: var(--color-border, #cbcbc8); opacity: 1; }
.cnip-shell--trace-only .cnip-team__agent strong,
.cnip-shell--trace-only .cnip-team__index { color: var(--color-text, #1a1a1a); }
.cnip-shell--trace-only .cnip-team__agent small,
.cnip-shell--trace-only .cnip-team__state { color: var(--color-text-muted, #666); }
.cnip-shell--trace-only .cnip-trace-details { border-color: var(--color-border, #cbcbc8); }
.cnip-shell--trace-only .cnip-trace-details > summary { color: var(--color-text, #1a1a1a); padding: 14px 18px; font: 650 12px/1.4 var(--font-ui, 'Noto Sans SC', sans-serif); }
.cnip-shell--trace-only .cnip-trace-details > summary span { color: var(--color-text-muted, #666); }
.cnip-shell--trace-only .cnip-trace-list { padding: 0 12px 16px; gap: 8px; }
.cnip-shell--trace-only .cnip-trace-event {
  padding: 11px 12px;
  border: 1px solid var(--color-border, #cbcbc8);
  border-radius: 8px;
  background: #fff;
}
.cnip-shell--trace-only .cnip-trace-event--handoff { border-color: #c7a68f; }
.cnip-shell--trace-only .cnip-trace-event--error { border-color: #ad604d; }
.cnip-trace-details > summary:focus-visible,
.cnip-trace-history summary:focus-visible { outline: 2px solid var(--color-primary, #be2a00); outline-offset: 2px; }
.cnip-shell--trace-only .cnip-trace-event__top { color: #57534e; font: 11px/1.4 var(--font-ui, 'Noto Sans SC', sans-serif); }
.cnip-shell--trace-only .cnip-trace-event__top span { min-width: 0; overflow-wrap: anywhere; }
.cnip-shell--trace-only .cnip-trace-event strong { color: var(--color-text, #1a1a1a); font-size: 14px; line-height: 1.4; }
.cnip-trace-event__detail { display: block; margin-top: 4px; overflow-wrap: anywhere; }
.cnip-shell--trace-only .cnip-trace-event__detail { color: #5d5954; font: 12px/1.5 var(--font-ui, 'Noto Sans SC', sans-serif); }
.cnip-shell--trace-only .cnip-trace-history { font-size: 11px; }
.cnip-shell--trace-only .cnip-trace-history summary { color: var(--color-text, #1a1a1a); }
.cnip-shell--trace-only .cnip-trace-history summary span { color: var(--color-text-muted, #666); }
.cnip-shell--trace-only .cnip-trace-history__list { max-height: 50vh; padding: 0 12px 14px; }
.cnip-shell--trace-only .cnip-legacy-note,
.cnip-shell--trace-only .cnip-trace-empty { color: var(--color-text-muted, #666); }

@container career-nav (max-width: 900px) {
  .cnip-shell { flex-direction: column; overflow-y: auto; }
  .cnip-portrait-side { flex: none; min-height: 680px; overflow: visible; }
  .cnip-dashboard-side { width: 100%; height: auto; min-height: 280px; flex: none; }
}
</style>
