<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import UserInfoBar from '@/components/UserInfoBar.vue'
import DirectionBubbleStage from './DirectionBubbleStage.vue'
import ExplorationCompanion from './ExplorationCompanion.vue'
import {taskCompanionEnabled} from '@/composables/taskCompanionFeature'
import { useUserStore } from '@/stores/user'
import { openAgentWithResource } from '@/composables/useAgentResourceHandoff'
import { listExplorations,readExploration,createExploration,patchExploration,startExplorationRound,
  generateExplorationPlan,reviewExploration,decideExploration,connectExplorationSession,restartUnplannedRound,
  type Exploration,type ExplorationListItem,type DirectionCandidate,type TrialSelection } from '@/api/careerExploration'
import parchmentBaseUrl from '@/assets/images/parchment-base.jpg'
const parchmentBgUrl = `url("${parchmentBaseUrl}")`
const router=useRouter(),route=useRoute(),user=useUserStore()
const emit=defineEmits<{back:[]}>()
const records=ref<ExplorationListItem[]>([]),record=ref<Exploration|null>(null)
const loading=ref(false),busy=ref(''),error=ref(''),notice=ref(''),reconcile=ref(false)
const interest=ref(''),search=ref(''),preview=ref(''),roundId=ref(''),tab=ref<'compare'|'trial'|'review'>('compare')
const bubblePage=ref(0)
const compactStage=ref(false)
const selection=ref<TrialSelection>({selected_role:'',question:'',reason:'',weekly_hours:''})
const reflection=ref(''),choice=ref(''),decisionReason=ref(''),newRound=ref(false)
const decisionPanel=ref<HTMLElement|null>(null)
const paper=ref<HTMLElement|null>(null)
let epoch=0,flight=0,live=true,createKey=crypto.randomUUID()
function explorationError(ex:unknown,fallback:string){const status=ex&&typeof ex==='object'&&'status' in ex?Number(ex.status):0;return status===404||status===405?'暂时无法打开方向探索。可以先返回岗位舆图；本页输入不会被当作已保存记录。':ex instanceof Error?ex.message:fallback}
const latestRound=computed(()=>record.value?.rounds[(record.value?.rounds.length||0)-1]||null)
const currentRound=computed(()=>record.value?.rounds.find(r=>r.round_id===roundId.value)||latestRound.value)
const candidates=computed(()=>record.value?.sources.candidates||[])
const filtered=computed(()=>{const q=search.value.trim().toLocaleLowerCase();const all=!q?candidates.value:candidates.value.filter(c=>[c.role_name,c.category,...c.skills].join(' ').toLocaleLowerCase().includes(q));const selected=record.value?.draft.compared_roles||[];return [...all.filter(c=>selected.includes(c.role_name)),...all.filter(c=>!selected.includes(c.role_name))]})
const bubblePages=computed(()=>Math.max(1,Math.ceil(filtered.value.length/10)))
const visibleCandidates=computed(()=>filtered.value.slice(bubblePage.value*10,(bubblePage.value+1)*10))
const compared=computed(()=>candidates.value.filter(c=>record.value?.draft.compared_roles.includes(c.role_name)))
const active=computed(()=>candidates.value.find(c=>c.role_name===preview.value)||null)
const canStart=computed(()=>!!record.value&&!busy.value&&!loading.value&&!reconcile.value&&record.value.source_status==='current'&&!!selection.value.selected_role&&!!selection.value.question.trim()&&!!selection.value.reason.trim()&&!!selection.value.weekly_hours.trim())
const choiceLabels:Record<string,string>={continue:'继续这个方向',adjust:'调整尝试方式',switch:'换一个方向尝试'}
const readLabels:Record<string,string>={read:'已读取',partial:'部分读取',processing:'仍在处理',failed:'读取失败',unavailable:'尚未读取'}
function date(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?'日期待核对':new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric'}).format(d)}
function accept(value:Exploration,restore=false){
  record.value=value
  if(restore){
    interest.value=value.draft.interest||''
    roundId.value=value.rounds[value.rounds.length-1]?.round_id||''
    const r=currentRound.value
    selection.value=r?{...r.selection}:{...(value.draft.selection_draft||{selected_role:'',question:'',reason:'',weekly_hours:''})}
    reflection.value=r?.review?.reflection||'';choice.value=r?.decision?.choice||'';decisionReason.value=r?.decision?.reason||''
    tab.value=r?.closed_reason?'compare':r?.review?'review':r?'trial':'compare';newRound.value=!!r?.closed_reason
  }
}
async function load(id?:string){
  const e=epoch,n=++flight;loading.value=true;error.value=''
  try{
    const list=await listExplorations();if(e!==epoch||n!==flight||!live)return
    records.value=list.data||[]
    const target=id||records.value[0]?.exploration_id
    if(target){const result=await readExploration(target);if(e!==epoch||n!==flight||!live)return;if(!result.data)throw new Error('没有取得探索记录');const retain=record.value?.exploration_id===target;accept(result.data,!retain);if(retain)notice.value='已读取最新进展，并保留本页填写内容；请核对后再保存。'}
    reconcile.value=false
  }catch(ex){if(e===epoch&&n===flight&&live)error.value=explorationError(ex,'暂时无法读取探索，请重试')}
  finally{if(e===epoch&&n===flight&&live)loading.value=false}
}
async function act(label:string,fn:()=>Promise<{data?:Exploration}>,restore=false){
  if(busy.value||loading.value)return
  const e=epoch,n=++flight;busy.value=label;error.value='';notice.value=''
  try{const result=await fn();if(e!==epoch||n!==flight||!live)return
    if(!result.data)throw new Error('尚未取得保存后的记录，请重新读取核对')
    accept(result.data,restore);reconcile.value=false;notice.value=label+'完成'
  }catch(ex){if(e===epoch&&n===flight&&live){error.value=explorationError(ex,'操作未完成');reconcile.value=true}}
  finally{if(e===epoch&&n===flight&&live)busy.value=''}
}
async function create(){
  if(error.value||loading.value)return
  await act('创建探索',()=>createExploration(createKey,interest.value),true)
  if(record.value&&!error.value){createKey=crypto.randomUUID();await router.replace({query:{exploration_id:record.value.exploration_id,...(typeof route.query.role==='string'?{role:route.query.role}:{})}})}
}
function saveDraft(){const r=record.value;if(!r)return;void act('保存草稿',()=>patchExploration(r.exploration_id,{expected_revision:r.revision,selection_draft:selection.value,...(interest.value.trim()?{interest:interest.value}:{})}))}
function toggleComparison(candidate:DirectionCandidate){
  const r=record.value;if(!r||busy.value||reconcile.value)return
  const roles=[...r.draft.compared_roles],i=roles.indexOf(candidate.role_name)
  if(i>=0)roles.splice(i,1);else if(roles.length<2)roles.push(candidate.role_name);else{notice.value='先移除一个方向，再加入另一个；一次比较两个更容易看清区别。';return}
  void act('更新比较',()=>patchExploration(r.exploration_id,{expected_revision:r.revision,compared_roles:roles})).then(()=>{if(!roles.includes(selection.value.selected_role))selection.value.selected_role=''})
}
function refreshSources(){const r=record.value;if(r)void act('更新参考资料',()=>patchExploration(r.exploration_id,{expected_revision:r.revision,refresh_sources:true}))}
async function start(){const r=record.value;if(!r||!canStart.value)return
  await act('保存本轮选择',()=>startExplorationRound(r.exploration_id,r.revision,selection.value))
  if(!error.value){roundId.value=latestRound.value?.round_id||'';newRound.value=false;tab.value='trial'}
}
function generate(){const r=record.value,t=currentRound.value;if(r&&t)void act('生成试做计划',()=>generateExplorationPlan(r.exploration_id,t.round_id))}
async function reprepare(){const r=record.value,t=currentRound.value;if(!r||!t||t.plan)return;await act('保留旧选择',()=>restartUnplannedRound(r.exploration_id,t.round_id,r.revision));if(!error.value){nextRound();notice.value='旧选择已保留，未写成实践决定。请先核对参考资料，再重新确认想尝试的问题。'}}
function review(){const r=record.value,t=currentRound.value;if(r&&t)void act('生成探索复盘',()=>reviewExploration(r.exploration_id,t.round_id,r.revision,reflection.value))}
async function decide(){const r=record.value,t=currentRound.value,e=epoch;if(!r||!t)return;await act('保存本人决定',()=>decideExploration(r.exploration_id,t.round_id,r.revision,choice.value,decisionReason.value));await nextTick();if(e===epoch&&!error.value&&live)decisionPanel.value?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
function openPlan(){const r=record.value,t=currentRound.value;if(r&&t?.plan)void router.push({name:'student-learning',query:{artifact_id:t.plan.artifact_id,session_id:r.session_id,exploration_id:r.exploration_id}})}
function confirmedPlan(value:Exploration){accept(value);roundId.value=value.rounds[value.rounds.length-1]?.round_id||'';newRound.value=false;tab.value='trial';notice.value='你确认的同一份安排已保存，可以开始实践。'}
async function discuss(){const r=record.value;if(!r)return;const round=currentRound.value?.round_id;await act('连接原对话',()=>connectExplorationSession(r.exploration_id));if(!error.value&&record.value)openAgentWithResource(router,{kind:'career_resource',uri:`career://me/explorations/${r.exploration_id}${round?'/rounds/'+round:''}`},record.value.session_id,'ask')}
function visitRound(id:string){roundId.value=id;tab.value=currentRound.value?.plan?'review':'trial';reflection.value=currentRound.value?.review?.reflection||'';choice.value=currentRound.value?.decision?.choice||'';decisionReason.value=currentRound.value?.decision?.reason||''}
function nextRound(){newRound.value=true;tab.value='compare';selection.value={selected_role:currentRound.value?.decision?.choice==='switch'?'':currentRound.value?.selection.selected_role||'',question:'',reason:'',weekly_hours:''};choice.value='';decisionReason.value='';reflection.value='';notice.value='上一轮保持原样。这一轮请重新确认想验证的问题和投入时间。'}
watch(()=>user.currentUser?.id,()=>{epoch++;flight++;record.value=null;records.value=[];busy.value='';error.value='';notice.value='';reflection.value='';decisionReason.value='';choice.value='';search.value='';preview.value='';roundId.value='';newRound.value=false;tab.value='compare';interest.value=typeof route.query.role==='string'?'想先了解 '+route.query.role:'';selection.value={selected_role:'',question:'',reason:'',weekly_hours:''};if(user.currentUser)void load(typeof route.query.exploration_id==='string'?route.query.exploration_id:undefined)},{immediate:true})
watch(()=>route.query.exploration_id,id=>{if(typeof id==='string'&&id!==record.value?.exploration_id)void load(id)})
watch(()=>record.value?.analysis_turns?.length||0,(count,old)=>{if(count>0&&count!==old)compactStage.value=true;else if(!count)compactStage.value=false})
watch(tab,async()=>{await nextTick();if(live&&paper.value)paper.value.scrollTop=0})
watch(search,()=>{bubblePage.value=0})
watch(bubblePages,n=>{bubblePage.value=Math.min(bubblePage.value,n-1)})
onBeforeUnmount(()=>{live=false;epoch++;flight++})
</script>

<template>
  <div class="da-page exploration-workspace" :aria-busy="!!busy||loading">
    <header class="da-header">
      <div class="da-header__left"><button class="da-back" @click="emit('back')"><Icon icon="lucide:arrow-left"/><span>返回岗位舆图</span></button><div class="da-brand"><h1 class="da-brand__title">职业分析 · 探索与尝试</h1></div></div>
      <form class="da-header__center" role="search" @submit.prevent><label class="da-header-search"><Icon icon="lucide:search"/><input v-model="search" class="da-header-search__input" placeholder="找一个想了解的方向" aria-label="搜索方向"/></label></form>
      <UserInfoBar class="da-header__right"/>
    </header>
    <div v-if="error" class="exploration-feedback" role="alert"><span>{{ error }}</span><button :disabled="!!busy||loading" @click="load(record?.exploration_id)">重新读取核对</button><small>当前输入仍在本页；重新读取前请先复制需要保留的内容。</small></div>
    <p v-if="notice||busy" class="exploration-notice" role="status">{{ busy?busy+'中，请稍候…':notice }}</p>
    <nav v-if="record" class="exploration-stages" aria-label="探索阶段"><button :aria-current="tab==='compare'?'step':undefined" @click="tab='compare'">01 了解与比较</button><button :disabled="!currentRound" :aria-current="tab==='trial'?'step':undefined" @click="tab='trial'">02 做一次尝试</button><button :disabled="!currentRound?.plan" :aria-current="tab==='review'?'step':undefined" @click="tab='review'">03 复盘与选择</button><button class="stage-refresh" :disabled="!!busy||loading" @click="load(record.exploration_id)">刷新进展</button></nav>
    <div class="da-body">
      <aside class="da-left exploration-left">
        <section class="da-section"><h2 class="da-section__title"><Icon icon="lucide:scan-face"/>从我已有的经历出发</h2>
          <template v-if="record"><div class="kpi-card"><div class="kpi-label">简历资料</div><strong class="facts-state">{{ record.sources.facts.resume_status==='confirmed'?'已有本人确认资料':'尚无确认简历' }}</strong><p>{{ record.sources.facts.resume_status==='confirmed'?'这里使用已确认的经历，不把未知当作零。':'可以先探索兴趣；平台还不能据此判断你的技能或经历。' }}</p></div>
            <div class="evidence-chips"><span v-for="skill in record.sources.facts.skills" :key="skill">{{ skill }}</span></div>
            <details v-if="record.sources.facts.projects.length"><summary>简历中的项目经历</summary><article v-for="(p,i) in record.sources.facts.projects" :key="i"><strong>{{ p.name }}</strong><p>{{ p.desc }}</p></article></details>
            <p class="quiet">另行自述和技能自评仅作探索参考，不等于已核验能力。</p>
            <p v-if="record.sources.facts.self_reflection" class="source-mark">已纳入本人保存的技能自评</p>
            <p v-if="record.source_status!=='current'" class="source-warning">参考资料已变化或暂不可核对。旧尝试保留；新计划前请先核对更新。</p>
            <button class="text-button" :disabled="!!busy||reconcile" @click="refreshSources">核对并更新参考资料</button>
          </template><p v-else>先看看哪些方向值得了解，再用一次小尝试验证自己的感受。不必急着确定一生的职业。</p>
        </section>
        <section class="da-section"><h2 class="da-section__title">继续之前的探索</h2><select aria-label="选择探索记录" :value="record?.exploration_id||''" :disabled="!!busy" @change="router.push({query:{exploration_id:($event.target as HTMLSelectElement).value}})"><option value="" disabled>选择本人记录</option><option v-for="r in records" :key="r.exploration_id" :value="r.exploration_id">{{ r.draft.compared_roles.join(' / ')||r.draft.interest||'还在寻找方向' }} · {{ date(r.created_at) }}</option></select>
          <ol class="round-history"><li v-for="r in record?.rounds||[]" :key="r.round_id"><button :aria-current="r.round_id===currentRound?.round_id?'true':undefined" @click="visitRound(r.round_id)"><span>第 {{ r.ordinal }} 轮 · {{ r.selection.selected_role }}</span><small>{{ r.closed_reason?'未开始 · 已重新准备':r.decision?choiceLabels[r.decision.choice]:'尝试进行中' }}</small></button></li></ol>
        </section>
      </aside>
      <main class="da-map exploration-center">
        <div v-if="loading&&!record" class="da-artifact-state" role="status">正在读取你的探索与资料…</div>
        <section v-else-if="!record" class="da-bubble-wrap exploration-start">
          <div class="start-editor"><span class="eyebrow">给未来一个可以尝试的起点</span><h2>不急着选定职业，<br/>先弄清自己想验证什么。</h2><p>从两种可能出发，做一点真实的事，再回来看看。</p><label>现在感兴趣的事<input v-model="interest" maxlength="64" placeholder="例如：做网页，或用数据解释问题"/></label><button class="da-link-btn" :disabled="loading||!!busy||reconcile||!!error" @click="create">开始我的方向探索 <Icon icon="lucide:arrow-right"/></button></div>
        </section>
        <template v-else>
          <div v-if="tab==='compare'&&(record.analysis_turns?.length||compactStage)" class="direction-toolbar"><span>{{ record.draft.compared_roles.join(' · ') }}</span><button type="button" :aria-expanded="!compactStage" @click="compactStage=!compactStage">{{ compactStage?'展开方向舞台，调整比较':'收起舞台，继续一起想' }}<Icon :icon="compactStage?'lucide:chevron-down':'lucide:chevron-up'" :width="16"/></button></div>
          <section v-show="tab==='compare'&&!compactStage" class="da-bubble-wrap exploration-bubbles"><div class="da-bubble-job-tag">先选一个想了解的方向，再加入比较 · 至多两个</div><DirectionBubbleStage :candidates="visibleCandidates" :selected="preview" :compared="record.draft.compared_roles" @select="c=>preview=c.role_name"/><nav class="bubble-controls" aria-label="方向目录翻页"><button :disabled="bubblePage===0" @click="bubblePage--" aria-label="上一页方向">←</button><span>{{ bubblePage+1 }} / {{ bubblePages }} 页 · {{ filtered.length }} 个方向</span><button :disabled="bubblePage+1>=bubblePages" @click="bubblePage++" aria-label="下一页方向">→</button></nav><span class="bubble-caption">已比较方向置前 · 气泡不表示适合程度</span></section>
          <section ref="paper" class="exploration-paper" :class="{'exploration-paper--full':tab!=='compare'}">
            <template v-if="tab==='compare'"><header class="paper-heading"><span class="eyebrow">把可能性摆在一起</span><h2>先从真实经历和一点好奇开始。</h2><p>选好方向后，说说你的犹豫；我们一起看依据，不急着给你贴标签。</p></header>
              <div v-if="compared.length" class="compared-ribbon"><span v-for="c in compared" :key="c.role_name">{{ c.role_name }}<button type="button" :aria-label="`移出比较：${c.role_name}`" :disabled="!!busy||reconcile" @click="toggleComparison(c)">×</button></span></div>
              <p v-else class="paper-empty">从上方气泡选一至两个方向，再一起讨论。没有预设“最适合你”的答案。</p>
              <p v-if="record.sources.catalogue_partial" class="quiet">部分目录条目尚不可用，当前展示不代表完整职业范围。</p>
            </template>
            <template v-else-if="tab==='trial'&&currentRound"><header class="paper-heading"><span class="eyebrow">第 {{ currentRound.ordinal }} 轮 · 一周尝试</span><h2>{{ currentRound.selection.selected_role }}</h2><p>这次想验证：{{ currentRound.selection.question }}</p></header><blockquote>{{ currentRound.selection.reason }}</blockquote><p class="source-mark">本周投入：{{ currentRound.selection.weekly_hours }} · 这不是能力考试</p>
              <template v-if="currentRound.plan"><ol class="trial-steps"><li v-for="(s,i) in currentRound.plan.steps||[]" :key="i"><span>{{ String(i+1).padStart(2,'0') }}</span><div><h3>{{ s.title }}</h3><p>{{ s.detail }}</p></div></li></ol><p>已记录进度 {{ currentRound.plan.progress.completed }} / {{ currentRound.plan.progress.total }}；勾选不等于能力已经验证。</p><button class="da-link-btn plan-open" @click="openPlan">去学习中心做练习、记录成果 <Icon icon="lucide:arrow-right"/></button><button class="text-button" @click="tab='review'">我想复盘做过的事或遇到的困难</button></template>
              <div v-else class="trial-invitation"><h3>用一件小事，替想象找一点依据。</h3><p>这轮旧选择尚无计划，可以保留它并重新准备，再让助手和你一起形成方案。</p><button v-if="!currentRound.closed_reason" class="text-button" :disabled="!!busy||reconcile" @click="reprepare">保留旧选择，重新准备</button></div>
              <p v-if="currentRound.source_status!=='current'" class="source-warning">这一轮的参考资料已变化或不可核对。原计划和进度仍能回看，但不再当作当前求职判断依据。</p>
            </template>
            <template v-else-if="tab==='review'&&currentRound"><header class="paper-heading"><span class="eyebrow">把做过的事与自己的感受放在一起</span><h2>这次尝试，让我更清楚了什么？</h2><p>不必为了完成计划而报喜；没做完、遇到困难也值得讨论。</p></header>
              <section v-if="currentRound.review" class="reflection-reading"><p v-if="currentRound.review.status==='stale'" role="status" class="source-warning">练习记录或来源状态已变化，这份复盘不是基于最新资料。请重新核对后生成复盘。</p><article v-for="(heading,k) in {observed:'我实际提交的记录',difficulties:'对困难与感受的解读 · 请核对',uncertain:'仍不能判断的部分',next_options:'可考虑的下一步 · 由我选择'}" :key="k"><h3>{{ heading }}</h3><p>{{ currentRound.review.content[k] }}</p></article><details><summary>这次读取了哪些练习附件？</summary><p v-if="!currentRound.review.attachments.length">本次没有读取附件；文字说明仍是学生本人提交，未经能力核验。</p><p v-for="(a,i) in currentRound.review.attachments" :key="i">{{ a.name }} · {{ readLabels[a.status]||'读取状态待核对' }}</p></details><p class="quiet">{{ currentRound.review.boundary }}</p></section>
              <p v-else class="paper-empty">先在学习中心记录成果，再通过下方“和助手继续这次探索”讨论实际尝试和卡点。没有做完也可以回来聊；平台不会替你补出练习经历。</p>
              <section v-if="currentRound.decision" ref="decisionPanel" class="student-decision"><span class="eyebrow">这是我自己的阶段决定</span><h3>{{ choiceLabels[currentRound.decision.choice] }}</h3><p>{{ currentRound.decision.reason }}</p><small>{{ date(currentRound.decision.created_at) }}</small><button v-if="currentRound.round_id===latestRound?.round_id" class="da-link-btn" @click="nextRound">带着这个决定开始下一轮</button></section>
            </template>
            <ExplorationCompanion :unified-task="taskCompanionEnabled" :key="`${record.exploration_id}:${newRound?'new':currentRound?.round_id||'draft'}`" :record="record" :round-id="newRound?undefined:currentRound?.round_id" :disabled="!!busy||reconcile||!compared.length||!!currentRound?.decision&&!newRound" @updated="value=>accept(value)" @confirmed="confirmedPlan"/>
          </section>
        </template>
      </main>
      <aside class="da-right exploration-right">
        <template v-if="record&&tab==='compare'"><section v-if="active" class="da-section"><h2 class="da-section__title">{{ active.role_name }}</h2><p>{{ active.skills.length?'目录中列出了这些技能线索：':'这个方向尚缺具体技能资料。' }}</p><div class="evidence-chips"><span v-for="s in active.skills" :key="s">{{ s }}</span></div><p class="quiet">{{ active.source_note }}</p><button class="da-link-btn" :disabled="!!busy||reconcile" @click="toggleComparison(active)">{{ record.draft.compared_roles.includes(active.role_name)?'移出比较':'加入比较' }}</button></section>
          <section v-if="!currentRound||newRound" class="da-section"><h2 class="da-section__title">不用先想清所有答案</h2><p>在纸页中说说你为什么犹豫。助手会依据你的资料一起比较，有必要时再问一个问题。</p><p class="quiet">讨论先形成建议；只有你确认，才保存为行动计划。</p></section>
          <section v-else class="da-right-empty"><h2>已经有一轮真实尝试</h2><p>先做一点，再带着成果回来看看；不要因为又看到一个方向，就丢掉之前的记录。</p><button class="da-link-btn" @click="tab=currentRound?.review?'review':'trial'">继续这一轮</button></section>
        </template>
        <template v-else-if="record&&currentRound"><section class="da-section"><h2 class="da-section__title">我的尝试问题</h2><p>{{ currentRound.selection.question }}</p><p class="quiet">{{ currentRound.selection.selected_role }} · {{ currentRound.selection.weekly_hours }}</p><button v-if="currentRound.plan" class="text-button" @click="openPlan">打开计划与练习记录</button></section>
          <form v-if="tab==='review'&&currentRound.review&&!currentRound.decision" class="selection-form decision-form" @submit.prevent="decide"><h2 class="da-section__title">下一步，由我决定</h2><label v-for="(label,key) in choiceLabels" :key="key" class="decision-choice"><input v-model="choice" type="radio" name="exploration-choice" :value="key"/>{{ label }}</label><label>为什么这样决定？<textarea v-model="decisionReason" maxlength="1000"/></label><button class="da-link-btn" :disabled="!!busy||reconcile||!choice||!decisionReason.trim()||currentRound.review.status!=='current'">保存我的决定</button></form>
        </template>
        <section v-else class="da-right-empty"><Icon icon="lucide:compass" :width="36"/><h2>先了解，再亲自试一次</h2><p>不替你选职业，也不拿一个分数定义你。</p></section>
        <p v-if="record" class="quiet">这次讨论会随本人探索记录保存，回来后可以在原页接着想。</p>
      </aside>
    </div>
  </div>
</template>

<style scoped src="../../views/student/careerAnalysis.css"></style>
<style scoped>
.exploration-stages{display:flex;gap:16px;padding:10px 24px;background:var(--bg-200);border-bottom:1px solid var(--bg-300);flex-wrap:wrap}
.compared-ribbon{display:flex;gap:12px;flex-wrap:wrap;padding:18px 0}.compared-ribbon>span{display:flex;align-items:center;gap:8px;font-size:14px;border-bottom:2px solid #bba17d}.compared-ribbon button{border:0;background:none;color:var(--primary-100);cursor:pointer;min-width:40px;min-height:44px;font-size:21px}
.direction-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 24px;border-bottom:1px solid #d4c5b2;font-size:13px;flex-wrap:wrap}.direction-toolbar button{display:inline-flex;align-items:center;gap:8px;border:0;background:none;font:inherit;color:var(--primary-100);min-height:40px;cursor:pointer}
.exploration-stages button,.text-button{border:0;background:transparent;font:inherit;color:var(--text-200);cursor:pointer;min-height:40px}
.da-header-search{flex-direction:row;gap:4px}
.exploration-stages [aria-current=step]{color:var(--primary-100);border-bottom:2px solid currentColor}.stage-refresh{margin-left:auto}
.exploration-feedback{display:flex;align-items:center;gap:12px;padding:10px 24px;background:#fff2e9;flex-wrap:wrap;color:#8b2500;font-size:13px}.exploration-feedback small{flex-basis:100%}
.exploration-feedback button{min-height:40px;background:#fff;border:1px solid currentColor;border-radius:4px;color:inherit;cursor:pointer}
.exploration-notice{margin:0;padding:8px 24px;background:#f1f4ed;font-size:13px;line-height:1.6}
.exploration-left{overflow-y:auto}.exploration-left p,.exploration-right p{font-size:13px;line-height:1.8;overflow-wrap:anywhere}
.facts-state{font-size:17px;font-weight:500}.evidence-chips{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.evidence-chips span{font-size:12px;background:#f5efe4;border:1px solid #d7c7af80;padding:4px 8px;border-radius:3px;color:#655038;overflow-wrap:anywhere}
.quiet{font-size:12px!important;color:var(--text-300);line-height:1.8}.source-mark{font-size:12px;color:#526b4a}.source-warning{font-size:13px;color:#8b4519;border-left:2px solid #bd8b43;padding:8px 12px;background:#f4ead9;line-height:1.8}
.text-button{color:var(--primary-100);font-size:13px;text-align:left;display:inline-flex;align-items:center;gap:8px;padding:6px 0;text-decoration:underline;text-underline-offset:5px}
.exploration-workspace button:disabled{opacity:.5;cursor:not-allowed}.exploration-workspace :is(button,input,textarea,select):focus-visible{outline:2px solid var(--primary-100);outline-offset:3px}
label{font-size:13px;display:flex;flex-direction:column;gap:8px;line-height:1.7}input,textarea,select{box-sizing:border-box;width:100%;font:inherit;font-size:14px;padding:10px 12px;background:#faf8f3;border:1px solid var(--bg-300);color:var(--text-100);border-radius:4px;min-height:42px}textarea{resize:vertical;min-height:88px}
.exploration-center{background:#f3eee3}.exploration-bubbles{flex:0 0 46%;min-height:350px;padding-top:45px}.bubble-caption{position:absolute;z-index:2;bottom:9px;right:20px;color:var(--text-300);font-size:11px;background:#fff9;padding:4px 8px}
.bubble-controls{position:absolute;z-index:3;bottom:5px;left:14px;display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-200);background:#fff9;border-radius:20px;padding:0 4px}.bubble-controls button{width:40px;min-height:40px;border:0;background:transparent;font:inherit;font-size:18px;color:var(--primary-100);cursor:pointer}
.exploration-paper{position:relative;flex:1;min-height:220px;overflow-y:auto;padding:26px 30px 40px;background:linear-gradient(#f6f1e7e8,#f8f4ecf2),v-bind(parchmentBgUrl);box-shadow:inset 7px 0 10px -10px #6a461f,inset -7px 0 10px -10px #6a461f}
.exploration-paper--full{padding:36px clamp(20px,5vw,65px)}.paper-heading{padding-bottom:16px;border-bottom:1px solid #d4c5b2}.paper-heading h2{font-family:var(--font-title);font-size:26px;font-weight:500;margin:12px 0;letter-spacing:.02em}.paper-heading p{color:var(--text-200);font-size:13px;line-height:1.8}.eyebrow{font-size:11px;letter-spacing:.1em;color:var(--primary-100)}
.comparison-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}.comparison-column{padding-top:24px}.comparison-column+.comparison-column{border-left:1px solid #d4c5b2;padding-left:28px}.comparison-column h3{font-family:var(--font-title);font-size:21px;font-weight:500}.comparison-column h4{font-size:12px;color:var(--primary-100);margin-top:24px}.comparison-column p{font-size:13px;line-height:1.8}.direction-category{font-size:11px;color:var(--text-300)}.paper-empty{padding:24px 0;color:var(--text-200);font-size:14px;line-height:1.9}
.selection-form{display:flex;flex-direction:column;gap:18px;margin-bottom:24px}.selection-form h2{font-size:15px}.exploration-right{min-width:310px;max-width:360px}.exploration-start{flex:1;padding:40px}.start-editor{position:relative;z-index:2;max-width:520px;width:100%}.start-editor h2{font-family:var(--font-title);font-size:clamp(28px,3vw,42px);font-weight:500;line-height:1.6;margin:22px 0}.start-editor p{color:var(--text-200);line-height:1.9;margin-bottom:32px}.start-editor .da-link-btn{margin-top:24px}.exploration-start:before{opacity:.45}
.round-history{list-style:none;padding:0}.round-history li{margin:8px 0}.round-history button{background:transparent;border:0;border-left:2px solid #d8cbb9;padding:10px;width:100%;text-align:left;font:inherit;cursor:pointer;color:var(--text-200)}.round-history button[aria-current=true]{border-color:var(--primary-100);background:#fff7}.round-history span,.round-history small{display:block;line-height:1.8;font-size:12px}.round-history small{color:var(--text-300)}
blockquote{margin:24px 0;padding:12px 20px;border-left:2px solid #bd8b43;line-height:1.9;color:var(--text-200)}.trial-steps{list-style:none;padding:0;counter-reset:trial}.trial-steps li{display:flex;gap:20px;padding:20px 0;border-bottom:1px solid #d4c5b2}.trial-steps li>span{font-family:var(--font-title);font-size:28px;color:#b99a6d}.trial-steps h3{font-size:17px;font-weight:500;margin:0 0 10px}.trial-steps p,.reflection-reading p{font-size:14px;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere}.plan-open{margin-top:24px}.trial-invitation{margin-top:36px}.trial-invitation p{line-height:1.8;font-size:14px}
.reflection-reading article{padding:16px 0;border-bottom:1px solid #d4c5b2}.reflection-reading h3{font-family:var(--font-title);font-size:19px;font-weight:500}.reflection-reading details{font-size:12px;line-height:1.8;margin-top:24px}.student-decision{margin-top:30px;border:1px solid #c2b397;padding:24px;background:#fffc}.student-decision h3{font-size:23px;font-family:var(--font-title);font-weight:500}.student-decision p{line-height:1.9}.student-decision small{color:var(--text-300)}.student-decision button{margin-top:22px}.decision-form{border-top:1px solid var(--bg-300);padding-top:24px}.decision-choice{flex-direction:row;align-items:center;min-height:44px}.decision-choice input{width:18px;min-height:18px;accent-color:var(--primary-100)}.assistant-link{margin-top:auto}
@media(max-width:1100px){.exploration-left{width:190px}.exploration-right{min-width:260px;max-width:300px}.exploration-paper{padding:22px 20px}.exploration-bubbles{min-height:340px}}
@media(max-width:850px){.exploration-workspace .da-body{display:flex;flex-direction:column;overflow:auto}.exploration-left{display:block!important;order:1;width:auto;border-right:0;padding:20px}.exploration-center{display:block;order:0;flex:none;overflow:visible}.exploration-right{order:2;display:block;max-width:none;min-width:0;overflow:visible;border-left:0;padding:24px}.exploration-bubbles{display:flex;min-height:480px;height:480px;padding:52px 10px 24px}.exploration-paper{overflow:visible;min-height:220px}.exploration-start{display:flex;min-height:500px;height:auto}.exploration-paper--full{padding:28px 20px}.exploration-stages{padding:6px 12px;gap:8px;font-size:12px}.comparison-columns{gap:14px}.comparison-column+.comparison-column{padding-left:14px}.comparison-column h3{font-size:18px}.exploration-feedback{padding:12px}.stage-refresh{margin-left:0}.exploration-header-search{width:100%}}
@media(max-width:480px){input,textarea,select{font-size:16px}.exploration-workspace .da-header__center{position:static;transform:none;grid-column:1/-1;grid-row:2}.exploration-start{padding:30px 20px}.comparison-columns{grid-template-columns:1fr}.comparison-column+.comparison-column{border-left:0;border-top:1px solid #d4c5b2;padding-left:0}.bubble-caption{font-size:10px;right:8px;bottom:50px;max-width:calc(100% - 24px)}.trial-steps li{gap:12px}}
</style>
