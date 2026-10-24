<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,ref,watch,nextTick} from 'vue'
import {useRoute} from 'vue-router'
import {Icon} from '@iconify/vue'
import {useAgentTaskStore} from '@/stores/agentTask'
import {useAgentChatStore} from '@/stores/agentChat'
import {useUserStore} from '@/stores/user'
import {getApiMode} from '@/api/config'
import type {TaskReference} from '@/api/agentTask'
import TaskNextActions from './TaskNextActions.vue'
import AgentMark from './AgentMark.vue'
import MessagePartsRenderer from './MessagePartsRenderer.vue'

const task=useAgentTaskStore(),chat=useAgentChatStore(),route=useRoute()
const user=useUserStore()
const picker=ref<HTMLInputElement|null>(null),end=ref<HTMLElement|null>(null),narrow=ref(false)
const opening=ref(false)
const fullPage=computed(()=>route.name==='student-ai-assistant')
const enabled=getApiMode()==='http'
function resize(){narrow.value=window.matchMedia('(max-width: 760px)').matches}
async function handoff(event:Event){
 const detail=(event as CustomEvent<{reference:{kind:string;uri?:string;taskId?:string};sessionId?:string}>).detail
 const ref:TaskReference|undefined=detail.reference.uri?{uri:detail.reference.uri}:detail.reference.taskId?{task_id:detail.reference.taskId}:undefined
 if(!ref)return
 const owner=user.currentUser?.id
 task.opened=true
 try{await task.handoff([ref],detail.sessionId)}catch{/* controller retains a visible error and input */}
 finally{if(owner&&user.currentUser?.id===owner)task.opened=true}
}
async function upload(event:Event){
 const files=(event.target as HTMLInputElement).files
 if(!files)return
 try{const sid=await task.ensure();await task.addFiles(files,{sessionId:sid})}
 catch(err){task.error=err instanceof Error?err.message:'上传入口暂不可用'}
 finally{if(picker.value)picker.value.value=''}
}
async function send(){
 await task.send(task.draft,task.readyFileIds())
}
async function open(){
 if(opening.value)return
 opening.value=true
 try{await task.open()}catch(err){task.error=err instanceof Error?err.message:'任务暂不可用'}
 finally{opening.value=false}
}
watch(()=>chat.messages.length,async()=>{await nextTick();end.value?.scrollIntoView({block:'nearest'})})
onMounted(()=>{resize();window.addEventListener('resize',resize);window.addEventListener('cpa:agent-handoff',handoff)})
onBeforeUnmount(()=>{window.removeEventListener('resize',resize);window.removeEventListener('cpa:agent-handoff',handoff)})
</script>

<template>
 <template v-if="enabled">
  <button v-if="!fullPage&&!task.opened" class="task-companion-launch" type="button" @click.stop="open" :disabled="opening" :aria-busy="opening" aria-label="打开任务助手">
   <AgentMark :size="23"/><span>{{opening?'正在读取任务':task.busy?'查看任务进展':'一起看看'}}</span>
  </button>
  <el-drawer v-if="!fullPage" v-model="task.opened" :append-to-body="true" :modal="narrow" :lock-scroll="narrow" :size="narrow?'100%':'min(460px, 42vw)'"
   class="task-companion-drawer" :with-header="false" :destroy-on-close="false" :close-on-click-modal="narrow">
   <section class="task-companion" aria-label="当前任务助手" :aria-busy="task.busy">
    <header class="task-companion-head"><AgentMark :size="26"/><div><h2>一起把这件事做下去</h2><span>同一任务，换页也能接着聊</span></div>
     <button type="button" @click="task.opened=false" aria-label="收起任务助手"><Icon icon="lucide:x"/></button>
    </header>
    <div class="task-companion-thread">
     <p v-if="!chat.messages.length" class="task-companion-empty">说说你现在想解决什么。也可以从当前页面选择一份资料，我们一起看。</p>
     <article v-for="message in chat.messages" :key="message.id" class="task-companion-message" :class="{'is-student':message.role==='user'}">
      <MessagePartsRenderer :message="message" :session-id="task.sessionId" compact-evidence/>
     </article>
     <p v-if="task.busy||task.transfer" class="task-companion-progress" role="status"><i aria-hidden="true"/>{{task.transfer||task.progress||'正在处理这次任务'}}</p>
     <TaskNextActions/>
     <div ref="end"/>
    </div>
    <form class="task-companion-compose" @submit.prevent="send">
     <div v-if="task.error" class="task-companion-error" role="alert">{{task.error}}<button type="button" @click="task.restore">重新读取任务</button></div>
     <div v-for="file in task.attachments" :key="file.id" class="task-companion-file">
      <i v-if="file.status==='reading'" class="file-transfer-spinner" aria-hidden="true"/><Icon v-else icon="lucide:file-text"/>
      <span>{{file.name}}</span><small v-if="file.status==='reading'">正在上传或解析</small><small v-if="file.status==='error'">{{file.error}}</small>
      <button type="button" :disabled="task.busy" @click="task.removeAttachment(file.id)" aria-label="移除本次附件">×</button>
     </div>
     <label class="sr-only" for="task-companion-input">继续当前任务</label>
     <textarea id="task-companion-input" v-model="task.draft" rows="3" placeholder="继续说说你的想法…" :disabled="task.busy" @keydown.enter.exact.prevent="send"/>
     <footer><input ref="picker" type="file" hidden accept=".pdf,.docx,.txt,.md" @change="upload"/>
      <button type="button" @click="picker?.click()" :disabled="task.busy||task.attachmentsBusy" aria-label="给当前任务上传资料"><Icon icon="lucide:paperclip"/>资料</button>
      <button type="submit" :disabled="task.busy||task.attachmentsBusy||!task.draft.trim()">发送<Icon icon="lucide:arrow-up"/></button>
     </footer>
    </form>
   </section>
  </el-drawer>
 </template>
</template>

<style scoped>
.task-companion-launch{position:fixed;right:24px;bottom:88px;z-index:80;display:flex;align-items:center;gap:8px;border:1px solid var(--color-border,#d9d2c6);border-radius:28px;padding:11px 17px;background:var(--color-surface,#fffdf8);color:var(--color-text-primary,#3b352c);box-shadow:0 4px 20px #3b352c12;font:inherit;cursor:pointer}
.task-companion{height:100%;display:flex;flex-direction:column;background:var(--color-background,#f8f6f0);color:var(--color-text-primary,#3b352c);font-family:inherit}
.task-companion-head{display:flex;gap:12px;align-items:center;padding:20px;border-bottom:1px solid var(--color-border,#ded8ce)}
.task-companion-head h2{font:600 17px/1.5 var(--font-family-heading,inherit);margin:0}.task-companion-head span{font-size:12px;color:var(--color-text-secondary,#776e62)}
.task-companion-head>button{margin-left:auto}.task-companion button{font:inherit;cursor:pointer}.task-companion button:disabled{opacity:.5;cursor:default}
.task-companion-head>button,.task-companion-file button{border:0;background:transparent;padding:8px;color:inherit;display:flex}
.task-companion-thread{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:22px}
.task-companion-empty{line-height:1.9;color:var(--color-text-secondary,#776e62)}
.task-companion-message{line-height:1.85;margin:0 0 28px;overflow-wrap:anywhere}.task-companion-message.is-student{margin-left:28px;padding:12px 16px;background:var(--color-surface,#fffdf8);border-radius:16px 16px 3px 16px}
.task-companion-compose{padding:16px 20px 20px;border-top:1px solid var(--color-border,#ded8ce)}
.task-companion-compose textarea{display:block;box-sizing:border-box;width:100%;resize:vertical;max-height:180px;min-height:76px;border:0;background:transparent;color:inherit;font:inherit;line-height:1.7;padding:8px 0}
.task-companion-compose footer{display:flex;justify-content:space-between;gap:12px}.task-companion-compose footer button,.task-companion-next button{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--color-border,#ded8ce);border-radius:8px;background:var(--color-surface,#fffdf8);color:inherit}
.task-companion-compose footer button[type=submit]{background:var(--color-primary,#bb664b);color:white;border-color:transparent}
.task-companion-next{margin:16px 0}.task-companion-next small{display:block;margin-top:6px;color:var(--color-text-secondary,#776e62)}
.task-companion-file{display:flex;gap:8px;align-items:center;font-size:12px;margin-bottom:8px}.task-companion-file span{overflow-wrap:anywhere}.task-companion-file small{color:var(--color-text-secondary,#776e62)}
.task-companion-progress{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--color-text-secondary,#776e62)}
.task-companion-progress i,.file-transfer-spinner{width:13px;height:13px;flex:none;border:1.5px solid currentColor;border-right-color:transparent;border-radius:50%;animation:task-transfer 1s linear infinite}
.task-companion-error{font-size:13px;line-height:1.7;color:var(--color-danger,#9a4336)}.task-companion-error button{border:0;background:transparent;color:inherit;text-decoration:underline;margin-left:8px}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
@keyframes task-transfer{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.task-companion-progress i,.file-transfer-spinner{animation:none}}
@media(max-width:760px){.task-companion-launch{right:16px;bottom:84px}.task-companion-thread{padding:18px}.task-companion-compose{padding-bottom:max(20px,env(safe-area-inset-bottom))}}
</style>
<style>.task-companion-drawer .el-drawer__body{padding:0;overflow:hidden}</style>
