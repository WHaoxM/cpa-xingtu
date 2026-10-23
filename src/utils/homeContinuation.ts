import type { DashboardActivity, DashboardResume } from '@/api/home'

export type ResumeHomeAction = {
  kind: 'review' | 'progress' | 'analysis' | 'results' | 'diagnostic' | 'previous' | 'draft' | 'start' | 'repair' | 'reload'
  title: string; cta: string; detail: string; route: string | null; identity: string
}

const navigation = '/app/student/career-navigation'
const taskRoute = (id: string | null | undefined, report = false) => id && /^task_[A-Za-z0-9]+$/.test(id)
  ? `${navigation}?task_id=${encodeURIComponent(id)}${report ? '&result_view=report' : ''}` : null

export function resumeHomeActions(resume?: DashboardResume): {primary: ResumeHomeAction; secondary: ResumeHomeAction[]} {
  const action = (kind: ResumeHomeAction['kind'], title: string, cta: string, detail: string, route: string | null,
    reference = ''): ResumeHomeAction => ({kind,title,cta,detail,route,identity:`${kind}:${reference}`})
  const reload = action('reload','暂时无法核对简历进度','重新读取进度','已有资料不会丢失，请勿重复上传。',null)
  if (!resume) return {primary:reload,secondary:[]}
  const current = taskRoute(resume.confirmation_task_id)
  const latest = taskRoute(resume.task_id)
  const draft = action('draft','已保存的简历草稿','打开已保存草稿','草稿尚不是正式简历，可继续核对和编辑。',
    '/app/student/resume-builder',String(resume.draft?.revision))
  let primary = reload
  switch (resume.state) {
    case 'waiting_for_user':
      primary=action('review','上次的简历已整理好，等你核对','继续核对简历','本人确认后，才会成为正式资料。',latest,resume.task_id || ''); break
    case 'queued': case 'parsing':
      primary=action('progress',resume.state==='queued'?'简历已保存，等待处理':'正在整理你上传的简历','查看处理进度',
        '可以离开后再回来，无需重新上传。',latest,resume.task_id || ''); break
    case 'upload_failed':
      primary=action('repair','这次简历处理未完成','查看处理问题','先查看失败原因；已保存的旧资料不会被删除。',latest,resume.task_id || ''); break
    case 'analysis_running':
      primary=action('analysis','简历已确认，正在分析','查看分析进度','画像与诊断分别处理；已有内容可以先阅读。',current,resume.confirmation_task_id || ''); break
    case 'results_ready':
      primary=action('results','这份简历已有可读结果','查看画像与诊断',resume.has_analysis_failures
        ?'部分内容可读，其他分析仍需处理；缺失依据不算零分。':'看看哪些经历值得突出，以及哪些表达可以补充。',current,resume.confirmation_task_id || ''); break
    case 'analysis_failed': case 'confirmed':
      primary=action('repair',resume.state==='analysis_failed'?'简历已确认，部分分析未完成':'简历已确认，等待进一步分析',
        '查看分析状态','确认资料已保留，请查看画像与诊断各自的状态。',current,resume.confirmation_task_id || ''); break
    case 'draft_only': primary={...draft,cta:'继续编辑简历'}; break
    case 'empty':
      primary=action('start','从整理自己的经历开始','上传并核对简历','已有简历可以上传，也可以从草稿开始制作。',navigation); break
    case 'source_invalid':
      primary=action('repair','当前资料需要重新核对','核对简历来源','暂不沿用失效的结果；已保存的草稿仍可继续编辑。',navigation); break
  }
  if (!primary.route && primary.kind!=='reload') primary=reload
  const secondary: ResumeHomeAction[]=[]
  if (resume.draft?.state==='saved' && primary.kind!=='draft') secondary.push(draft)
  if (resume.state==='empty') secondary.push({...draft,cta:'从草稿开始制作'})
  if (resume.based_on_previous_upload && current && (resume.portrait_ready || resume.diagnostic_ready)) {
    secondary.push(action('previous','上一份已确认资料','查看上一份已确认资料','这是上一份资料，不是本次上传的结果。',current,resume.confirmation_task_id || ''))
  } else if (resume.state==='analysis_running' && resume.diagnostic_ready && current) {
    secondary.push(action('diagnostic','简历诊断已可读','先看简历诊断','其他分析还在继续。',taskRoute(resume.confirmation_task_id,true),resume.diagnostic_report_id || ''))
  }
  return {primary,secondary}
}

export function activityDestination(item: DashboardActivity): string | null {
  if (item.type==='resume_confirmed' || item.type==='resume_diagnostic') return taskRoute(item.task_id,item.type==='resume_diagnostic')
  if (item.type==='career_report') return item.report_id
    ? `/app/student/my-reports?report_id=${encodeURIComponent(item.report_id)}` : '/app/student/my-reports'
  if (item.type==='course_completed') return item.course_id
    ? `/app/student/learning?course_id=${encodeURIComponent(item.course_id)}` : '/app/student/learning'
  return null
}

export function activityCopy(item: DashboardActivity) {
  switch (item.type) {
    case 'resume_confirmed': return {title:'本人已确认简历',detail:'查看这份已确认资料',icon:'lucide:file-check-2'}
    case 'resume_diagnostic': return {title:'简历诊断已有可读内容',detail:item.partial?'部分诊断可读，缺失内容仍未知':'查看这份简历的具体诊断',icon:'lucide:file-text'}
    case 'career_report': return {title:`岗位报告《${item.title}》`,detail:'查看当前有效的岗位报告',icon:'lucide:file-check-2'}
    default: return {title:`完成课程《${item.title}》`,detail:'本人已标记该课程全部章节',icon:'lucide:book-open-check'}
  }
}
