import type { ReportRecord, AIAnalysisResult, TargetRole } from '@/types'
import { generateMockAnalysis, generateMockCareerSuggestions } from '@/mock/aiAnalysis'
import { getApiMode } from './config'
import { httpPost } from './adapters/httpAdapter'

export async function getCareerSuggestions(
  userId: string,
  targetRoles: TargetRole[],
): Promise<string[]> {
  if (getApiMode() === 'mock') {
    return generateMockCareerSuggestions(targetRoles)
  }

  // HTTP suggestions resolve saved roles and resume evidence by Principal.
  const env = await httpPost<string[]>('/api/agent/career-suggestions', {})
  return env.data ?? []
}

export async function analyzeReports(
  userId: string,
  records: ReportRecord[],
  targetRoles: TargetRole[] = [],
): Promise<AIAnalysisResult> {
  if (getApiMode() === 'mock') {
    const careerSuggestions = await getCareerSuggestions(userId, targetRoles)
    return generateMockAnalysis(userId, records, careerSuggestions, targetRoles)
  }

  const env = await httpPost<AIAnalysisResult>('/api/ai/growth-analysis', {
    // The server resolves Principal, current portrait and report versions.
    // Browser snapshots and a caller-supplied userId are not evidence.
    reportIds: records.map((r) => r.id),
  })
  if (!env.data) {
    throw new Error(env.error || 'growth-analysis returned empty data')
  }
  return env.data
}
