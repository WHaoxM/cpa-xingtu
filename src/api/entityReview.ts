import { httpGet, httpPost } from './adapters/httpAdapter'

export type EntityReviewAction = 'accept' | 'reject' | 'defer'

export type ResumeEntityMention = {
  name?: string
  evidence?: string
  [key: string]: unknown
}

export type ResumeEntityProposal = {
  mention_index: number
  decision: 'equivalent' | 'related' | 'unresolved' | string
  candidate_index: number | null
  rationale?: string
}

export type ResumeEntityCandidate = {
  name: string
  category?: string
  source_id?: string
}

export type ResumeEntityReviewRecord = {
  mention_index: number
  action: EntityReviewAction
  note?: string
  relation?: 'equivalent' | 'related' | null
  candidate_index?: number | null
}

export type ResumeEntityMentionReview = {
  mention_index: number
  mention: ResumeEntityMention
  proposal: ResumeEntityProposal | null
  candidate: ResumeEntityCandidate | null
  review: ResumeEntityReviewRecord | null
}

export type ResumeEntityReviewSnapshot = {
  source_confirmation_task_id: string
  source_sha256: string
  entity_linking_status: string
  entity_linking_reason?: string | null
  next_action?: string | null
  revision: number
  mentions: ResumeEntityMentionReview[]
  reviews: ResumeEntityReviewRecord[]
  replayed: boolean
  graph_publication_status: 'not_requested' | string
}

export type ResumeEntityReviewEnvelope = {
  success: boolean
  data?: ResumeEntityReviewSnapshot
  error?: string
  status?: string
}

export async function getResumeEntityReview(): Promise<ResumeEntityReviewEnvelope> {
  return httpGet<ResumeEntityReviewSnapshot>('/api/pipeline/entity-review') as Promise<ResumeEntityReviewEnvelope>
}

export async function postResumeEntityReview(input: {
  source_confirmation_task_id: string
  source_sha256: string
  request_id: string
  expected_revision: number
  reviews: Array<{ mention_index: number; action: EntityReviewAction; note?: string }>
}): Promise<ResumeEntityReviewEnvelope> {
  return httpPost<ResumeEntityReviewSnapshot>('/api/pipeline/entity-review', input) as Promise<ResumeEntityReviewEnvelope>
}
