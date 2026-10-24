<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {Icon} from '@iconify/vue'
import EvidenceSummaryPart from '@/components/agent/EvidenceSummaryPart.vue'
import {useUserStore} from '@/stores/user'
import {sendExplorationAnalysis,readAnalysisEvents,readExploration,confirmExplorationProposal,
  type Exploration,type AnalysisTurn,type TrialSelection} from '@/api/careerExploration'
import type {MessagePart} from '@/types/ai'
import {useAgentTaskStore} from '@/stores/agentTask'

const props=defineProps<{record:Exploration;roundId?:string;disabled?:boolean;unifiedTask?:boolean}>()
const task=props.unifiedTask?useAgentTaskStore():null
const emit=defineEmits<{updated:[value:Exploration];confirmed:[value:Exploration]}>()
const user=useUserStore(),message=ref(''),error=ref(''),sending=ref(false),pollError=ref('')
const progress=ref(''),reads=ref<string[]>([]),reason=ref(''),question=ref(''),hours=ref('')
const end=ref<HTMLElement|null>(null)
const root=ref<HTMLElement|null>(null)
let live=true,epoch=0,timer:ReturnType<typeof setTimeout>|undefined,cursor=0,polledRun='',pollOwner:number|null=null
let pending:{key:string;payload:{message:string;expected_revision:number;round_id?:string}}|null=null
const turns=computed(()=>(props.record.analysis_turns||[]).filter(t=>props.roundId?t.round_id===props.roundId||t.confirmed_round_id===props.roundId:t.round_id===null&&!t.confirmed_round_id))
const latest=computed(()=>turns.value[turns.value.length-1])
const active=computed(()=>(props.record.analysis_turns||[]).find(t=>!['completed','failed','cancelled'].includes(t.status)))
const proposalTurn=computed(()=>latest.value?.result?.proposal&&!latest.value.stale&&!latest.value.confirmed_round_id?latest.value:null)
const blocked=computed(()=>props.disabled||sending.value||!!active.value||props.record.analysis_available!==true)
const proposalChanged=computed(()=>!!proposalTurn.value&&(question.value!==proposalTurn.value.result?.proposal?.question||hours.value!==proposalTurn.value.result?.proposal?.weekly_hours))
function summary(t:AnalysisTurn):Extract<MessagePart,{type:'evidence_summary'}>{
  const sources=(t.result?.evidence_summary||[]).map(s=>({label:s.name,status:(s.status==='read'?'read':s.status==='partial'?'partial':'unavailable') as 'read'|'partial'|'unavailable'}))
  const scope_note=t.round_id?'student_submitted_unverified':sources.some(s=>s.label==='已确认简历'&&s.status==='unavailable')?'resume_not_cross_checked':undefined
  return {type:'evidence_summary',title:'这次实际参考的资料',status:sources.every(s=>s.status==='read')?'complete':'partial',sources,scope_note}
}
function stop(){if(timer)clearTimeout(timer);timer=undefined}
async function poll(){
  if(props.unifiedTask)return
  stop();const t=active.value;if(!t||pollOwner===epoch)return
  const e=epoch,id=props.record.exploration_id
  pollOwner=e
  if(polledRun!==t.run_id){polledRun=t.run_id;cursor=0;reads.value=[];progress.value='分析请求已保存，等待开始'}
  try{
    const result=await readAnalysisEvents(t.run_id,cursor)
    if(!live||e!==epoch)return
    for(const event of result.data?.events||[]){
      cursor=Math.max(cursor,event.event_seq)
      const type=event.event_type,label=String(event.payload?.label||'')
      if(type==='run.step_started')progress.value='正在分析这次问题'
      if(type==='run.resource_read_started')progress.value=`正在读取${label}`
      if(type==='run.resource_read_completed'){if(!reads.value.includes(label))reads.value.push(label);progress.value='已读到这些资料，正在结合你的问题分析'}
      if(type==='run.finalizing')progress.value='正在整理本次答复'
      if(type==='run.failed')progress.value='这次分析没有完成；你的输入仍已保留'
      if(type.includes('needs_reconciliation'))progress.value='这次分析的执行状态需要核对，未自动重跑；原资料与输入仍保留'
    }
    if(result.data?.dispatch_status==='waiting_executor')progress.value='分析服务暂未接通，任务还未开始；输入已经保存'
    const detail=await readExploration(id)
    if(!live||e!==epoch||id!==props.record.exploration_id)return
    if(detail.data)emit('updated',detail.data)
    await nextTick()
    pollError.value=''
  }catch{if(live&&e===epoch)pollError.value='暂时读不到分析进展。已保存的任务不会因此重新提交。'}
  finally{if(pollOwner===e)pollOwner=null}
  if(live&&e===epoch&&active.value)timer=setTimeout(()=>void poll(),1600)
}
async function send(text?:string){
  if(task){
    await discuss(text)
    return
  }
  if(blocked.value)return
  const content=(text??message.value).trim();if(!content)return
  const e=epoch,id=props.record.exploration_id;sending.value=true;error.value=''
  if(pending&&pending.payload.message!==content){error.value='上次提交结果尚未核对，请先核对或重试原消息。';sending.value=false;return}
  if(!pending)pending={key:crypto.randomUUID(),payload:{message:content,expected_revision:props.record.revision,...(props.roundId?{round_id:props.roundId}:{})}}
  try{
    const response=await sendExplorationAnalysis(id,pending.payload,pending.key)
    if(!live||e!==epoch)return
    if(!response.data)throw Error('尚未取得已保存的讨论，请核对进展')
    emit('updated',response.data);pending=null;message.value=''
    await nextTick();void poll()
  }catch(ex){if(live&&e===epoch)error.value=ex instanceof Error?ex.message:'消息未确认保存，请重试原消息'}
  finally{if(live&&e===epoch)sending.value=false}
}
async function discuss(text?:string){
  if(!task)return
  task.opened=true
  try{
    if(!(task.busy&&task.sessionId===props.record.session_id)){
      await task.handoff([{uri:`career://me/explorations/${props.record.exploration_id}${props.roundId?'/rounds/'+props.roundId:''}`}],props.record.session_id)
    }
    if(text&&!task.busy)await task.send(text)
  }catch(ex){error.value=ex instanceof Error?ex.message:'资料交接暂不可用'}
}
watch(()=>task?.context?.last_run_id,async run=>{
  if(!run||!task||task.sessionId!==props.record.session_id)return
  const e=epoch
  const response=await readExploration(props.record.exploration_id)
  if(live&&e===epoch&&response.data)emit('updated',response.data)
})
async function reconcile(){
  const e=epoch
  try{const result=await readExploration(props.record.exploration_id);if(!live||e!==epoch||!result.data)return
    const prior=pending&&(result.data.analysis_turns||[]).find(t=>t.request_key===pending?.key)
    emit('updated',result.data);if(prior){pending=null;message.value='';error.value=''}
    else if(pending&&result.data.revision!==pending.payload.expected_revision){error.value='资料已更新。原消息保留，请核对后重新发送。';pending=null}
    void poll()
  }catch{if(live&&e===epoch)error.value='仍无法核对已保存状态，请保留输入后重试'}
}
async function confirm(){
  const t=proposalTurn.value,p=t?.result?.proposal;if(!t||!p||blocked.value||proposalChanged.value||!reason.value.trim())return
  const e=epoch;sending.value=true;error.value=''
  const selection:TrialSelection={selected_role:p.selected_role,question:p.question,weekly_hours:p.weekly_hours,reason:reason.value.trim()}
  try{const response=await confirmExplorationProposal(props.record.exploration_id,t.turn_id,props.record.revision,selection)
    if(live&&e===epoch&&response.data)emit('confirmed',response.data)
  }catch(ex){if(live&&e===epoch)error.value=ex instanceof Error?ex.message:'尚未确认保存，请读取进展后核对'}
  finally{if(live&&e===epoch)sending.value=false}
}
watch(()=>proposalTurn.value?.turn_id,()=>{const p=proposalTurn.value?.result?.proposal;question.value=p?.question||'';hours.value=p?.weekly_hours||'';reason.value=''},{immediate:true})
watch(()=>latest.value?.turn_id+':'+!!latest.value?.result,async(value,old)=>{if(!latest.value?.result||!old)return;await nextTick();if(live)root.value?.querySelector('.discussion-turn:last-child .companion-reply')?.scrollIntoView({block:'start',behavior:'auto'})})
watch([()=>user.currentUser?.id,()=>props.record.exploration_id,()=>props.roundId],()=>{epoch++;stop();pending=null;message.value='';error.value='';reads.value=[];progress.value='';polledRun='';sending.value=false;void poll()})
watch(()=>active.value?.run_id,(id,old)=>{if(id&&id!==old)void poll();if(!id)stop()},{immediate:true})
onBeforeUnmount(()=>{live=false;epoch++;stop()})
</script>

<template>
  <section ref="root" class="companion" aria-label="一起探索方向" :aria-busy="sending||!!active">
    <header class="companion-heading"><Icon icon="lucide:sparkles" :width="19"/><div><h2>{{ roundId?'带着实际尝试，再想一想':'先说说，你在犹豫什么？' }}</h2><p>先理解你的经历和顾虑，不急着给你选职业。</p></div></header>
    <p v-if="record.analysis_available!==true" class="companion-warning">探索讨论暂未接通。你已有的方向、计划和成果仍保留；可以返回岗位舆图。</p>
    <div class="discussion">
      <article v-for="t in turns" :key="t.turn_id" class="discussion-turn">
        <p class="student-voice"><span>我的想法</span>{{ t.message }}</p>
        <template v-if="t.result">
          <p v-if="t.stale" class="companion-warning">这是当时的讨论，不再代表当前方向或最新资料。</p>
          <div class="companion-reply">{{ t.result.reply }}</div>
          <div v-if="t.result.comparisons.length" class="companion-comparison"><section v-for="c in t.result.comparisons" :key="c.role"><h3>{{ c.role }}</h3><p>{{ c.connection }}</p><small>还需了解：{{ c.unknown }}</small></section></div>
          <EvidenceSummaryPart :summary="summary(t)"/>
          <p v-if="t.result.question&&!t.stale" class="companion-question"><Icon icon="lucide:message-circle-question" :width="18"/>{{ t.result.question }}</p>
          <details v-if="t!==latest&&t.result.proposal"><summary>查看当时的尝试建议</summary><p>{{ t.result.proposal.question }}</p></details>
        </template>
        <p v-else-if="t.status==='failed'||t.status==='cancelled'" class="companion-warning">这次分析未完成。消息已保留，没有生成计划或替你作决定。可以重新讨论。</p>
      </article>
    </div>
    <div v-if="active" class="companion-progress" role="status"><span class="working-dot"/>{{ progress||'分析已保存，正在核对执行进展' }}<small v-if="reads.length">已读取：{{ reads.join('、') }}</small><small v-if="pollError">{{ pollError }}</small><button type="button" @click="poll">重新读取进展</button></div>
    <form v-if="proposalTurn?.result?.proposal" class="trial-proposal" @submit.prevent="confirm">
      <span class="proposal-label">待我确认 · 还不是已保存计划</span><h3>{{ proposalTurn.result.proposal.selected_role }} · 做一次小尝试</h3>
      <label>这次想验证的问题<textarea v-model="question" maxlength="500"/></label>
      <label>本周投入时间<input v-model="hours" maxlength="120"/></label>
      <ol><li v-for="(s,i) in proposalTurn.result.proposal.steps" :key="i"><strong>{{ s.title }}</strong><p>{{ s.detail }}</p></li></ol>
      <button v-if="proposalChanged" type="button" :disabled="blocked" @click="send(`请调整方案。想验证的问题：${question}；本周投入时间：${hours}。`)" class="companion-secondary">按我的修改更新方案</button>
      <label>我为什么愿意先试它？<input v-model="reason" maxlength="1000" placeholder="一句自己的理由就好"/></label>
      <button class="companion-primary" :disabled="blocked||proposalChanged||!reason.trim()" type="submit">确认这份安排，去实践</button>
    </form>
    <div v-if="unifiedTask" class="companion-input">
      <button type="button" class="companion-primary" @click="discuss()">{{task?.busy?'查看这次分析进展':'和助手继续这次探索'}}<Icon icon="lucide:arrow-right" :width="16"/></button>
    </div>
    <form v-else class="companion-input" @submit.prevent="send()">
      <label for="exploration-thought">{{ latest?.result?.question?'我的回答或补充':'我想和你一起想一想' }}</label>
      <textarea id="exploration-thought" v-model="message" maxlength="2000" rows="3" :placeholder="roundId?'实际做了什么、哪里卡住，或有什么喜欢与不喜欢的地方？':'例如：我喜欢做页面，也写过一些查询，但不知道更愿意把哪件事做下去。'"/>
      <div><button class="companion-primary" :disabled="blocked||(!message.trim()&&!pending)" type="submit">{{ pending?'核对并重试原消息':turns.length?'继续一起想':'帮我一起看看' }}<Icon icon="lucide:arrow-right" :width="16"/></button><button v-if="latest?.result?.question&&!active" type="button" :disabled="blocked" @click="send('暂时不确定，请保留这个未知，先帮我看看还能怎么了解。')">暂时不确定</button></div>
    </form>
    <div v-if="error" class="companion-warning" role="alert">{{ error }}<button type="button" @click="reconcile">核对已保存进展</button></div>
    <div ref="end"/>
  </section>
</template>

<style scoped>
.companion{padding:26px 0 14px;border-top:1px solid #d4c5b2;color:var(--text-100);font-size:14px;line-height:1.85}.companion-heading{display:flex;gap:12px;align-items:flex-start;color:var(--primary-100)}h2,h3{font-family:var(--font-title);font-weight:500;margin:0 0 8px}.companion-heading h2{font-size:23px}.companion-heading p{color:var(--text-300);font-size:13px;margin:0}.discussion-turn{padding:22px 0;border-bottom:1px solid #dfd3c1}.student-voice{border-left:2px solid #ba9464;padding:8px 14px;background:#ede4d780;white-space:pre-wrap;overflow-wrap:anywhere}.student-voice span{display:block;font-size:11px;color:var(--text-300)}.companion-reply{white-space:pre-wrap;overflow-wrap:anywhere;margin:18px 0}.companion-comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;margin:18px 0}.companion-comparison section{border-top:2px solid #bba17d;padding-top:12px}.companion-comparison h3{font-size:19px}.companion-comparison small{color:var(--text-300)}.companion-question{display:flex;align-items:flex-start;gap:10px;background:#efe7d6;padding:15px 18px;border-radius:3px;font-weight:500}.companion-question svg{flex-shrink:0;margin-top:4px}.companion-input{margin-top:24px;display:grid;gap:10px}.companion-input>div{display:flex;gap:16px;align-items:center;flex-wrap:wrap}label{display:grid;gap:8px;font-size:13px}input,textarea{box-sizing:border-box;width:100%;font:inherit;padding:12px;color:inherit;background:#faf8f1;border:1px solid #d4c5b2;border-radius:4px;resize:vertical}button{font:inherit;min-height:44px;border:0;background:transparent;color:var(--primary-100);cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.companion-primary,.companion-secondary{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:10px 18px;background:var(--primary-100);color:#fff;border-radius:3px}.companion-secondary{background:#e9dfcf;color:var(--text-100)}.trial-proposal{margin-top:24px;padding:24px;border:1px solid #c7b493;background:#fffc;display:grid;gap:16px}.proposal-label{font-size:12px;color:var(--primary-100)}.trial-proposal ol{padding-left:22px;margin:0}.trial-proposal li{padding:8px 0}.trial-proposal p{margin:4px 0}.companion-warning{padding:12px 16px;background:#f2e4ce;color:#7e481d;border-left:2px solid #b58645;overflow-wrap:anywhere}.companion-progress{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:18px 0;color:var(--primary-100)}.companion-progress small{flex-basis:100%;color:var(--text-300)}.working-dot{width:7px;height:7px;border-radius:100%;background:currentColor;animation:breathe 1.4s ease-in-out infinite}.companion :deep(.evidence-summary){background:#f4eee3;border-color:#d8c8ad;border-radius:3px;color:var(--text-200)}.companion :is(button,input,textarea,summary):focus-visible{outline:2px solid var(--primary-100);outline-offset:3px}@keyframes breathe{50%{opacity:.3}}@media(prefers-reduced-motion:reduce){.working-dot{animation:none}}@media(max-width:600px){.companion-comparison{grid-template-columns:1fr}.trial-proposal{padding:16px}input,textarea{font-size:16px}.companion-heading h2{font-size:21px}}
</style>
