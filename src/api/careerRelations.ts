import { httpGet } from './adapters/httpAdapter'

export type CareerRelationEvidence = {
  url: string
  note: string
}

export type CareerRelationSkill = {
  skill_id: number
  name: string
  evidence: CareerRelationEvidence
}

export type CareerRelationNode = {
  id: string
  label: string
  revision: string
  content_sha256: string
  skill_count: number
  skills: CareerRelationSkill[]
}

export type CareerRelationEdge = {
  id: string
  source: string
  target: string
  relation_type: 'shared_skill'
  weight: number
  shared_skill_count: number
  union_skill_count: number
  shared_skills: Array<{
    skill_id: number
    name: string
    source_evidence: CareerRelationEvidence
    target_evidence: CareerRelationEvidence
  }>
  source_revision: string
  target_revision: string
}

export type CareerRelationGraph = {
  status: 'ready' | 'empty' | 'pending'
  reason: string | null
  algorithm_version: string
  source_kind: string
  weight_definition: string
  input_sha256: string
  source_count: number
  node_count: number
  edge_count: number
  computed_at: string | null
  nodes: CareerRelationNode[]
  edges: CareerRelationEdge[]
}

export async function getCareerRelationGraph(): Promise<CareerRelationGraph> {
  const response = await httpGet<CareerRelationGraph>('/api/career/relationship-graph')
  if (!response.success || !response.data) {
    throw new Error(response.error || '职业关联资料暂不可用。')
  }
  return response.data
}
