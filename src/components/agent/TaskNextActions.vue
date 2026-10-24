<script setup lang="ts">
import {ref} from 'vue'
import {useRouter} from 'vue-router'
import {useAgentTaskStore} from '@/stores/agentTask'
import {useUserStore} from '@/stores/user'
import {submitTaskResume} from '@/api/agentTask'
import {Icon} from '@iconify/vue'
const task=useAgentTaskStore(),user=useUserStore(),router=useRouter(),saving=ref(false)
async function submit(file_id:string){
 const session=task.sessionId,revision=task.context?.revision,owner=user.currentUser?.id
 if(saving.value||task.busy||revision===undefined)return
 saving.value=true
 try{
  const response=await submitTaskResume(session,file_id,revision)
  if(task.sessionId!==session||user.currentUser?.id!==owner)return
  if(!response.data)throw Error('提交结果尚未确认，请先重新读取任务')
  task.context=response.data.context
  await router.push({name:'student-career-navigation',query:{task_id:response.data.task_id,session_id:session}})
 }catch(error){if(task.sessionId===session&&user.currentUser?.id===owner)task.error=error instanceof Error?error.message:'暂时未能提交，原材料已保留'}
 finally{saving.value=false}
}
</script>
<template>
 <div v-if="task.failedQuestion" class="task-next-actions">
  <button type="button" @click="task.recoverQuestion">取回这次问题，编辑后再发送</button>
  <button type="button" @click="task.restore">核对已保存进展</button>
  <small>不会自动重新执行，也不需要重新上传已保存材料。</small>
 </div>
 <div v-if="!task.busy&&task.result" class="task-next-actions">
  <button v-if="task.result.continuation?.length" type="button" @click="task.send('继续读取这份材料，沿上次保存的位置继续；只分析本次实际读取的部分。')">从上次位置继续读取<Icon icon="lucide:arrow-right"/></button>
  <button v-if="task.result.exploration_id" type="button" @click="router.push({name:'student-career-analysis',query:{exploration_id:task.result.exploration_id}})">回到这次方向探索<Icon icon="lucide:arrow-up-right"/></button>
  <button v-for="file in task.result.files||[]" :key="file.file_id" type="button" :disabled="saving" @click="submit(file.file_id)">{{saving?'正在提交核对…':'提交并核对'}} · {{file.name}}<Icon icon="lucide:arrow-up-right"/></button>
  <small v-if="task.result.files?.length">只有核对并确认后，才会更新正式简历。</small>
 </div>
</template>
<style scoped>
.task-next-actions{display:flex;align-items:flex-start;flex-wrap:wrap;gap:10px;margin:18px 0}
.task-next-actions button{display:inline-flex;align-items:center;gap:8px;max-width:100%;overflow-wrap:anywhere;text-align:left;font:inherit;font-size:13px;padding:9px 13px;border:1px solid var(--color-border,#d4c5b2);border-radius:8px;background:var(--color-surface,#fffdf8);color:var(--color-text-primary,#604d3b);cursor:pointer}
.task-next-actions button:disabled{opacity:.6;cursor:wait}.task-next-actions small{flex-basis:100%;font-size:12px;color:var(--color-text-secondary,#887968)}
</style>
