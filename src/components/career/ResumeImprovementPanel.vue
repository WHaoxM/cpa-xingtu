<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores'
import type { ResumeDiagnosticReport, ResumeImprovement } from '@/api/report'
import { getResumeDraft, previewDraftFromReport, startDraftFromReport, type ResumeDraftPreview } from '@/api/resumeDraft'

const props = defineProps<{report: ResumeDiagnosticReport | null; loading?: boolean; error?: string; expanded?: boolean}>()
const emit = defineEmits<{generate: []}>()
const router=useRouter(), user=useUserStore()
const selected=ref<ResumeImprovement|null>(null), preview=ref<ResumeDraftPreview|null>(null), error=ref(''), busy=ref(false), replacing=ref(false)
let epoch=0
onBeforeUnmount(()=>{epoch++})
watch(()=>[user.currentUser?.id,props.report],()=>{epoch++;selected.value=null;preview.value=null;error.value='';busy.value=false;replacing.value=false})
const items=computed(()=>props.report?.improvements_status==='ready'?(props.expanded ? props.report.improvements : props.report.improvements?.slice(0,3))||[]:[])
async function prepare(item: ResumeImprovement) {
  const gen=++epoch, owner=user.currentUser?.id, report=props.report
  if(!report)return
  selected.value=item;preview.value=null;error.value='';busy.value=true;replacing.value=false
  try {
    const draft=await getResumeDraft()
    if(gen!==epoch||owner!==user.currentUser?.id)return
    if(!draft.success||!draft.data)throw Error('无法读取本人草稿，未创建新稿')
    const result=await previewDraftFromReport(report.report_id,item.id,draft.data.revision)
    if(gen!==epoch||owner!==user.currentUser?.id)return
    if(!result.success||!result.data)throw Error('转换预览未返回；草稿未改变')
    preview.value=result.data
  } catch(e) {if(gen===epoch)error.value=e instanceof Error?e.message:'未能准备预览；草稿未改变'}
  finally {if(gen===epoch)busy.value=false}
}
async function begin(mode:'start'|'continue'|'replace') {
  if(busy.value||!preview.value||!selected.value||!props.report)return
  const gen=epoch,owner=user.currentUser?.id,report=props.report,item=selected.value,p=preview.value
  busy.value=true;error.value=''
  try {
    try { await startDraftFromReport(report.report_id,item.id,p.draft_revision,mode) }
    catch(e) {
      // A response may be lost after commit: read, never blindly resubmit.
      const check=await getResumeDraft()
      if(!check.success||check.data?.guidance?.advice.id!==item.id||check.data.guidance.report_id!==report.report_id||check.data.revision<=p.draft_revision)throw e
    }
    if(gen!==epoch||owner!==user.currentUser?.id)return
    const verified=await getResumeDraft()
    if(gen!==epoch||owner!==user.currentUser?.id)return
    if(!verified.success||verified.data?.guidance?.advice.id!==item.id||verified.data.guidance.status!=='current')throw Error('未能核验草稿承接，请重新读取；不要重复创建')
    await router.push({name:'student-resume-builder',query:{from:'diagnostic'}})
  }catch(e){if(gen===epoch)error.value=e instanceof Error?e.message:'草稿承接结果不明，请重新读取'}
  finally{if(gen===epoch)busy.value=false}
}
</script>

<template>
  <section class="ri-panel" :class="{ 'ri-panel--reading': expanded }" aria-label="简历改进建议">
    <header><span>把经历说清楚</span><h2>先从一个具体问题开始</h2><p>补充你真实做过的事，不需要把每段经历写成夸大的成绩。</p></header>
    <p v-if="loading" role="status">正在读取这份简历的诊断…</p>
    <p v-else-if="props.error" role="alert">{{ props.error }}<button @click="emit('generate')">重新读取／生成</button></p>
    <template v-else-if="report?.improvements_status === 'ready'">
      <p v-if="!items.length">这次没有提出需要优先修改的具体问题。可继续核对原文与经历，不必为了填满清单而改动。</p>
      <component :is="expanded ? 'article' : 'details'" v-for="item in items" :key="item.id" class="ri-item">
        <component :is="expanded ? 'header' : 'summary'"><span>{{ item.title }}</span><strong>{{ item.problem }}</strong></component>
        <p class="ri-reason">{{ item.why }}</p>
        <div class="ri-source"><small>对应的已确认内容</small><p>{{ item.source_text }}</p>
          <blockquote v-for="(source,index) in item.evidence_refs" :key="index">{{ source.quote }}</blockquote></div>
        <p v-if="item.kind==='incomplete_reading'">当前材料未读完整，不能据此判断你没有其他经历。请先补齐原文件。</p>
        <h3>需要你补充的事实</h3><ul><li v-for="question in item.questions" :key="question">{{ question }}</li></ul>
        <h3>表达提纲 · 括号内需要你自己填写</h3><p class="ri-outline">{{ item.outline }}</p>
        <button type="button" :disabled="busy" @click="prepare(item)">去补充这段经历</button>
      </component>
    </template>
    <div v-else class="ri-unavailable"><p>{{ report?.improvements_status==='pending_upgrade'?'这份旧报告没有具体修改建议，已有内容仍可阅读。':'具体修改建议尚未就绪；不会用通用问题代替本人的诊断。' }}</p><button :disabled="loading" @click="emit('generate')">生成具体改进建议</button></div>
    <section v-if="selected" class="ri-conversion" aria-label="草稿转换预览" role="region">
      <h3>先检查将要带入制作页的内容</h3>
      <p v-if="busy" role="status">正在核验本人资料…</p><p v-if="error" role="alert">{{ error }} <button :disabled="busy" @click="prepare(selected)">重新读取</button></p>
      <template v-if="preview"><p>{{ preview.notice }}</p>
        <p v-if="preview.status==='mapping_incomplete'" role="alert">部分内容不能安全带入：{{ preview.unmapped_fields.length }} 项。不会创建残缺草稿，请修改原文件后重新上传。</p>
        <ul v-if="preview.status==='mapping_incomplete'"><li v-for="(field,index) in preview.unmapped_fields" :key="index">{{ field }}</li></ul>
        <details><summary>查看转换后的内容及保留的原文</summary>
          <p>{{ [preview.form.name,preview.form.targetRole,preview.form.phone,preview.form.email,preview.form.school,preview.form.major,preview.form.grade,preview.form.gpa].filter(Boolean).join(' · ') }}</p>
          <p>{{ preview.form.summary }}</p><p>{{ preview.form.skills.join('、') }}</p>
          <article v-for="(project,index) in preview.form.projects" :key="index"><strong>{{ project.name }}</strong><p>{{ project.role }}</p><p>{{ project.desc }}</p></article>
          <p v-for="(education,index) in preview.form.educations" :key="'edu'+index">{{ [education.school,education.major,education.degree,education.period,education.gpa].filter(Boolean).join(' · ') }}</p>
          <p v-for="(honor,index) in preview.form.honors" :key="'honor'+index">{{ honor.label }}</p><p>{{ preview.form.selfEval }}</p>
          <p class="ri-original">{{ preview.form.sourceText }}</p>
          <p v-if="preview.status==='mapping_incomplete'">不能完整转换的原始资料仍保留在原文件中，未创建新草稿。请对照上方转换内容检查遗漏，使用修改原文件后重新上传的方式保留完整经历。</p>
        </details>
        <p v-if="preview.has_existing_draft">你已有保存的草稿。继续原稿不会套入这些预填内容；这条建议针对已确认的简历，请自行对照。</p>
        <button v-if="preview.has_existing_draft" :disabled="busy" @click="begin('continue')">继续现有草稿，旁看建议</button>
        <template v-if="preview.status==='ready'">
          <button v-if="!preview.has_existing_draft" :disabled="busy" @click="begin('start')">确认预填内容，开始修改</button>
          <template v-else><label><input v-model="replacing" type="checkbox">我确认用预览内容替换当前已保存草稿；原草稿的编辑会被替换</label><button :disabled="busy||!replacing" @click="begin('replace')">确认替换并打开制作页</button></template>
        </template>
        <button :disabled="busy" @click="selected=null;preview=null">取消，保留原稿</button>
      </template>
    </section>
  </section>
</template>

<style scoped>
.ri-panel{margin:24px 0;padding:24px;border:1px solid #dfd5c7;border-radius:14px;background:#fffcf7;color:#3b3027}.ri-panel header>span{font-size:11px;color:#9b3b1c;letter-spacing:.12em}.ri-panel h2{font-size:23px;margin:8px 0}.ri-panel h3{font-size:14px;margin:18px 0 7px}.ri-panel p,.ri-panel li{font-size:13px;line-height:1.8;overflow-wrap:anywhere}.ri-panel header p{color:#77695c}.ri-item{border-top:1px solid #e8dfd3;margin-top:16px;padding-top:15px}.ri-item summary{cursor:pointer;display:list-item;padding:6px 0}.ri-item summary span{display:block;font-size:11px;color:#8a715d;margin-bottom:5px}.ri-item summary strong{font-size:15px;font-weight:600}.ri-source{border-left:3px solid #d2bea7;padding:6px 14px;background:#f6f1e9}.ri-source small{color:#8a715d}.ri-source blockquote{margin:8px 0;color:#75695c;font-size:12px}.ri-outline{padding:14px;background:#f4e9db;white-space:pre-wrap}.ri-panel button{padding:9px 14px;border:1px solid #a24b2c;border-radius:7px;background:#fff;color:#8b2c0e;cursor:pointer;margin:8px 10px 0 0;font:inherit;font-size:12px}.ri-panel button:disabled{opacity:.5;cursor:not-allowed}.ri-panel button:focus-visible,.ri-panel summary:focus-visible{outline:2px solid #9b3b1c;outline-offset:3px}.ri-conversion{border:1px solid #cdbba5;padding:18px;margin-top:20px;border-radius:10px;background:#fff}.ri-conversion label{display:block;font-size:12px;line-height:1.7;margin:15px 0}.ri-conversion article{padding:12px;border-top:1px solid #eee;white-space:pre-wrap}@media(max-width:600px){.ri-panel{padding:17px}.ri-panel button{min-height:44px;max-width:100%;white-space:normal}}
</style>

<style scoped>
.ri-panel--reading { margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; }
.ri-panel--reading .ri-item { padding: 24px 0; }
.ri-panel--reading .ri-item > header { display: grid; gap: 8px; }
.ri-panel--reading .ri-item > header span { font-size: 14px; color: #8a4b37; }
.ri-panel--reading .ri-item > header strong { font-size: 17px; line-height: 1.65; }
.ri-panel--reading p, .ri-panel--reading li { font-size: 15px; line-height: 1.85; }
.ri-panel--reading button { min-height: 44px; font-size: 14px; }
</style>
