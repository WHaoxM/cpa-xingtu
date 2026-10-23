import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getLandscape } from '@/api/career'
import { httpGet } from '@/api/adapters/httpAdapter'
import { getStudentWorkbenchState, getStudentPortraitSnapshot, type StudentWorkbenchState, type PortraitSnapshot } from '@/api/pipeline'
import { getLatestResumeDiagnosticReport, type ResumeDiagnosticReport } from '@/api/report'
import { listExplorations, readExploration, createExploration, patchExploration, sendExplorationAnalysis, type Exploration } from '@/api/careerExploration'

/** Owner/selection epochs are shared by every request, including the polling loop. */
export function useCareerClimbing(enabled:()=>boolean) {
  const route=useRoute(),router=useRouter(),user=useUserStore()
  const catalogue=ref<{role:string;category:string}[]>([]),search=ref(''),page=ref(0)
  const recentRoles=ref<string[]>([])
  const promotionPaths=ref<{chain:string[];requirements:unknown[];depth:number}[]>([])
  const promotionState=ref<'loading'|'ready'|'empty'|'unavailable'>('empty')
  const loading=ref(false),error=ref(''),sourceError=ref(''),portraitError=ref(''),reportError=ref('')
  const workbench=ref<StudentWorkbenchState|null>(null),portrait=ref<PortraitSnapshot|null>(null),report=ref<ResumeDiagnosticReport|null>(null)
  const record=ref<Exploration|null>(null),busy=ref(false),message=ref(''),notice=ref('')
  const role=computed(()=>typeof route.query.role==='string'?route.query.role:'')
  const selected=computed(()=>catalogue.value.find(c=>c.role===role.value))
  const filtered=computed(()=>catalogue.value.filter(c=>!search.value||c.role.includes(search.value)||c.category.includes(search.value)))
  const pages=computed(()=>Math.ceil(filtered.value.length/8))
  const visible=computed(()=>filtered.value.slice(page.value*8,page.value*8+8))
  const latest=computed(()=>{const turns=record.value?.analysis_turns||[];return turns[turns.length-1]})
  const active=computed(()=>latest.value&&!['completed','failed','cancelled'].includes(latest.value.status))
  const stale=computed(()=>record.value?.source_status!=='current'||latest.value?.stale===true)
  const legacy=computed(()=>latest.value?.content_status==='legacy'||!!latest.value?.result?.positioning&&latest.value.result.positioning.content_version!==4)
  const positioning=computed(()=>!stale.value&&!legacy.value&&latest.value?.result?.positioning?.role===role.value?latest.value.result.positioning:null)
  let live=true,epoch=0,timer:ReturnType<typeof setTimeout>|undefined
  let pending:{key:string;payload:{expected_revision:number;message:string}}|null=null
  function stop(){if(timer)clearTimeout(timer);timer=undefined}
  function valid(e:number){return live&&e===epoch&&enabled()}
  const explanation=(ex:unknown)=>ex instanceof Error?ex.message:'暂时无法读取，请保留输入后核对进展。'
  async function loadSources(e:number){
    try{
      const state=(await getStudentWorkbenchState()).data
      if(!valid(e))return
      if(!state)throw Error('尚未取得本人简历进度')
      workbench.value=state
      await Promise.all([
        (async()=>{if(!state.portrait.snapshot_id)return;try{const p=(await getStudentPortraitSnapshot(state.portrait.snapshot_id)).data;if(!valid(e))return;if(p?.source_confirmation_task_id!==state.source_confirmation_task_id)throw Error('画像来源已变化，请重新读取');portrait.value=p}catch(ex){if(valid(e))portraitError.value=explanation(ex)}})(),
        (async()=>{if(!state.resume_diagnostic.report_id)return;try{const r=(await getLatestResumeDiagnosticReport()).data;if(!valid(e))return;if(r?.source_confirmation_task_id!==state.source_confirmation_task_id)throw Error('简历解读来源已变化，请重新读取');report.value=r}catch(ex){if(valid(e))reportError.value=explanation(ex)}})(),
      ])
    }catch(ex){if(valid(e))sourceError.value=explanation(ex)}
  }
  async function poll(e:number,id:string){
    stop()
    try{const value=(await readExploration(id)).data;if(!valid(e))return;if(!value)throw Error('未取得分析进展');record.value=value;error.value=''}
    catch(ex){if(!valid(e))return;error.value=explanation(ex);return}
    if(valid(e)&&active.value)timer=setTimeout(()=>void poll(e,id),1600)
  }
  async function restore(e:number){
    if(!role.value){const rows=(await listExplorations()).data||[];if(valid(e))recentRoles.value=[...new Set(rows.flatMap(r=>r.draft.compared_roles))].filter(r=>catalogue.value.some(c=>c.role===r)).slice(0,3);return}
    const rows=(await listExplorations(role.value)).data||[]
    if(!valid(e))return
    // Most recent explicit exploration wins; never revive an older answer after a failure.
    if(rows[0])await poll(e,rows[0].exploration_id)
  }
  async function load(){
    stop();const e=++epoch;pending=null;record.value=null;recentRoles.value=[];busy.value=false;error.value='';sourceError.value='';portraitError.value='';reportError.value=''
    workbench.value=null;portrait.value=null;report.value=null;notice.value='';message.value=''
    promotionPaths.value=[];promotionState.value='empty'
    if(!enabled()||!user.currentUser?.id)return
    loading.value=true
    if(role.value&&role.value.length<=100){
      promotionState.value='loading'
      void httpGet<{paths:{chain:string[];requirements:unknown[];depth:number}[];fallback?:boolean}>('/api/career/paths',{role:role.value}).then(response=>{
        if(!valid(e))return
        if(response.data?.fallback)promotionState.value='unavailable'
        else{promotionPaths.value=(response.data?.paths||[]).filter(p=>Array.isArray(p.chain)&&p.chain.length>1&&p.chain.every(n=>typeof n==='string'));promotionState.value=promotionPaths.value.length?'ready':'empty'}
      }).catch(()=>{if(valid(e))promotionState.value='unavailable'})
    }
    await Promise.all([loadSources(e),(async()=>{try{const rows=await getLandscape();if(!valid(e))return;catalogue.value=rows.flatMap(r=>(r.roles||[]).map(role=>({role,category:r.category}))).filter(c=>!/[\ufffd\u0080-\u009f]|æœ|å™|å­|Ã|Â/.test(c.role));const index=catalogue.value.findIndex(c=>c.role===role.value);if(index>=0)page.value=Math.floor(index/8);await restore(e)}catch(ex){if(valid(e))error.value=explanation(ex)}})()])
    if(valid(e))loading.value=false
  }
  async function submit(){
    if(busy.value||active.value||loading.value||!selected.value||!workbench.value?.source_confirmation_task_id||sourceError.value)return
    const e=epoch;busy.value=true;error.value='';notice.value=''
    try{
      let r=record.value
      // Changed sources get a new discussion; immutable historical interpretation stays intact.
      if(!r||r.source_status!=='current'||r.rounds.length||r.draft.compared_roles.length!==1){
        const created=(await createExploration(crypto.randomUUID(),role.value.slice(0,64))).data
        if(!valid(e))return
        if(!created)throw Error('创建结果尚未核对，请重新读取进展后再继续')
        record.value=created;r=created
        const bound=(await patchExploration(r.exploration_id,{expected_revision:r.revision,compared_roles:[role.value]})).data
        if(!valid(e))return
        if(!bound)throw Error('方向尚未绑定，请重新读取进展')
        record.value=bound;r=bound
      }
      if(r.analysis_available!==true)throw Error('个人分析服务尚未接通。当前画像与简历仍可阅读，请联系维护者接通分析服务。')
      const text=message.value.trim()||`我想了解${role.value}。请结合我已经做过的具体任务，解释我可以从哪里开始、哪个问题最值得先澄清，以及优先做什么。先看起点，不生成计划，也不需要先问投入时间。`
      if(pending&&pending.payload.message!==text)throw Error('上次提交结果尚未核对，请先重新读取进展，不要改写后重复提交。')
      pending??={key:crypto.randomUUID(),payload:{expected_revision:r.revision,message:text}}
      const response=await sendExplorationAnalysis(r.exploration_id,pending.payload,pending.key)
      if(!valid(e))return
      if(!response.data)throw Error('分析提交结果尚未核对，请先重新读取进展')
      record.value=response.data;pending=null;message.value='';notice.value='已保存分析请求，正在结合本人资料整理。'
      await poll(e,r.exploration_id)
    }catch(ex){if(valid(e))error.value=explanation(ex)}
    finally{if(valid(e))busy.value=false}
  }
  function choose(value:string){if(value===role.value)return;void router.replace({query:{...route.query,role:value||undefined}})}
  function reloadProgress(){if(record.value)void poll(epoch,record.value.exploration_id);else void load()}
  function discuss(){const r=record.value;if(r)void router.push({name:'student-career-analysis',query:{exploration_id:r.exploration_id}})}
  watch(search,()=>page.value=0)
  watch(()=>latest.value?.status,status=>{if(status==='failed'&&!message.value)message.value=latest.value?.message||''})
  watch([()=>user.currentUser?.id,role,enabled],()=>{catalogue.value=[];search.value='';page.value=0;void load()},{immediate:true})
  onBeforeUnmount(()=>{live=false;++epoch;stop();pending=null;record.value=null;portrait.value=null;report.value=null})
  return {catalogue,recentRoles,promotionPaths,promotionState,search,page,pages,visible,loading,error,sourceError,portraitError,reportError,workbench,portrait,report,role,selected,record,busy,message,notice,latest,active,stale,legacy,positioning,choose,submit,load,reloadProgress,discuss}
}
