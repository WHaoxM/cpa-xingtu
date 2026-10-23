import { httpGet, httpPost, httpSend } from './adapters/httpAdapter'
import type { ResumeImprovement } from './report'

export type ResumeDraftForm = {
  name: string; phone: string; email: string; school: string; major: string; grade: string
  targetRole: string; gpa: string; summary: string; selfEval: string; sourceText: string
  skills: string[]
  projects: { name: string; role: string; desc: string }[]
  workExps: { company: string; position: string; period: string; desc: string }[]
  educations: { school: string; major: string; degree: string; period: string; gpa: string }[]
  honors: { type: 'cert' | 'intern' | 'award'; label: string }[]
}
export type DraftGuidance = { report_id: string; source_confirmation_task_id: string; status: 'current' | 'stale' | 'unavailable'; origin: 'existing_draft' | 'confirmed_resume'; advice: ResumeImprovement }
export type ResumeDraft = { revision: number; form: ResumeDraftForm; theme: string; updated_at: string | null; text: string; guidance?: DraftGuidance | null }
export type ResumeDraftPreview = {status: 'ready' | 'mapping_incomplete'; form: ResumeDraftForm; unmapped_fields: string[]; notice: string; draft_revision: number; has_existing_draft: boolean; guidance: DraftGuidance}
export const previewDraftFromReport = (report_id: string, improvement_id: string, expected_revision: number) =>
  httpPost<ResumeDraftPreview>('/api/profile/student/resume-draft/from-report', {report_id,improvement_id,expected_revision,mode:'preview'})
export const startDraftFromReport = (report_id: string, improvement_id: string, expected_revision: number, mode: 'start' | 'continue' | 'replace') =>
  httpPost<ResumeDraft>('/api/profile/student/resume-draft/from-report', {report_id,improvement_id,expected_revision,mode})
export type ResumeFillPreview = { status: 'ready' | 'partial'; form: ResumeDraftForm; warnings: string[] }
export const getResumeDraft = () => httpGet<ResumeDraft>('/api/profile/student/resume-draft')
export const saveResumeDraft = (form: ResumeDraftForm, theme: string, expected_revision: number) =>
  httpSend<ResumeDraft>('PUT', '/api/profile/student/resume-draft', { form, theme, expected_revision })
export const previewResumeDraft = (text: string) =>
  httpPost<ResumeFillPreview>('/api/profile/student/resume-draft/parse-preview', { text })
