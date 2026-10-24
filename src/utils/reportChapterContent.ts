/** Present saved chapter prose, never infer sections or recalculate a score. */
const labels: Record<string, string> = {
  summary: '章节要点', content: '详细内容', body: '详细内容', text: '', description: '',
  analysis: '分析', conclusion: '结论', recommendations: '建议', actions: '下一步',
  evidence: '相关依据', quote: '原文', rationale: '为什么', reason: '原因',
  milestones: '阶段目标', focus: '关注重点', cadence: '回顾安排', target_roles: '目标方向',
  match_score: '匹配估算分', strengths: '已有支持', gaps: '仍需了解',
  limitations: '阅读边界', requirements: '方向要求', skills: '相关技能',
}
const metadata = /^(?:id|.*_id|.*_ids|.*_sha256|.*_hash|.*_uri|.*_url|schema_version|status|score_kind|version|sources|evidence_refs|source_refs)$/i
export function chapterParagraphs(value: unknown): { label: string; text: string }[] {
  const output: { label: string; text: string }[] = []
  function visit(node: unknown, key = '', context = '', depth = 0) {
    if (metadata.test(key) || key.startsWith('_') || key === 'title') return
    const label = labels[key] ?? (/[^\x00-\x7f]/.test(key) ? key : context)
    if (Array.isArray(node)) { node.forEach(item => visit(item, '', label, depth + 1)); return }
    if (node && typeof node === 'object') {
      const object = node as Record<string, unknown>
      if (depth > 0 && typeof object.title === 'string') output.push({ label: object.title, text: '' })
      Object.entries(object).forEach(([field, child]) => visit(child, field, label, depth + 1))
      return
    }
    if (typeof node === 'string' && node.trim() && !/^(?:career|pipeline):\/\//.test(node)) output.push({ label, text: node })
    if (typeof node === 'number' && Number.isFinite(node)) output.push({ label, text: String(node) })
  }
  visit(value)
  return output
}
