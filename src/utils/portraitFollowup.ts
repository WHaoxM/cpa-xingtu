import type { PortraitSnapshot, StudentWorkbenchState } from '@/api/pipeline'

export type PortraitFocus = 'resume' | 'self-report'
type Guidance = { key: string; dimension: 'D1' | 'D2' | 'D3' | 'D4' | null; text: string; action?: PortraitFocus }
const guidance: Record<string, Omit<Guidance, 'key'>> = {
  school_tier: { dimension: 'D1', text: '学校背景尚缺可核验依据，不能由你自行填写解除。目前可以先阅读其他已有依据。' },
  major_category: { dimension: 'D1', text: '专业类别尚未取得足够依据。如果原简历写得不清楚，可以核对并补充原件，再重新提交确认。', action: 'resume' },
  skills: { dimension: 'D2', text: '当前简历缺少可核对的技能依据。如果确有遗漏，可以补充原件，再重新提交确认；另填技能自述不会替代简历证据。', action: 'resume' },
  growth_evidence: { dimension: 'D4', text: '现有资料尚不足以判断成长潜力。如果遗漏了实际的竞赛、科研或持续成长经历，可以核对原件后补充；没有这些经历也不代表能力为零。', action: 'resume' },
  source_pages: { dimension: null, text: '部分页面尚未取得文字。请核对原件，确有缺页时补传清晰文件并再次确认；填写自述不能消除缺页限制。', action: 'resume' },
}
for (const [key, label] of Object.entries({ communication: '沟通', teamwork: '团队协作', responsibility: '承担责任', stress_tolerance: '应对压力' })) {
  guidance[key] = { dimension: 'D3', text: `尚缺${label}的具体经历。可以另行补充本人自述，不会改写简历原文，也不等于经过事实核验。`, action: 'self-report' }
}

export function portraitGuidance(snapshot: PortraitSnapshot): Guidance[] {
  const items: Guidance[] = [], seen = new Set<string>()
  for (const key of snapshot.missing_fields) {
    const known = guidance[key]
    const safeKey = known ? key : 'other'
    if (seen.has(safeKey)) continue
    seen.add(safeKey)
    items.push({ ...(known || { dimension: null, text: '还有部分资料尚不能判断，具体原因暂未明确；这不代表能力为零。' }), key: safeKey })
  }
  const behavior = items.filter(item => item.dimension === 'D3')
  if (behavior.length > 1) {
    const names: Record<string, string> = { communication: '沟通', teamwork: '团队协作', responsibility: '承担责任', stress_tolerance: '应对压力' }
    behavior[0]!.text = `尚缺${behavior.map(item => names[item.key]).join('、')}的具体经历。可以另行补充本人自述，不会改写简历原文，也不等于经过事实核验。`
  }
  return items.filter(item => item.dimension !== 'D3' || item === behavior[0])
    .map(item => {
      if (snapshot.is_current) return item
      const history: Record<string, string> = {
        school_tier: '当时缺少学校背景的可核验依据。', major_category: '当时缺少专业类别的可核对依据。',
        skills: '当时的简历尚缺可核对的技能依据。', growth_evidence: '当时的资料不足以判断成长潜力，不代表能力为零。',
        source_pages: '当时有部分页面尚未取得文字，此版本保留原有读取边界。',
      }
      return { ...item, action: undefined, text: item.dimension === 'D3'
        ? '当时尚缺部分沟通、协作等职业素养经历的依据。' : history[item.key] || '当时还有部分资料尚不能判断，具体原因未明确。' }
    })
}

export function followupLocation(state: StudentWorkbenchState, focus: string) {
  const task = state.source_confirmation_task_id
  if (!task || !/^task_[A-Za-z0-9]+$/.test(task) || !['resume', 'self-report'].includes(focus)) return null
  return { name: 'student-career-navigation', query: { from: 'my-reports', focus, task_id: task } }
}

export function currentPortraitLocation(state: StudentWorkbenchState) {
  const portrait = state.portrait
  if (['ready_scored', 'ready_with_unknowns'].includes(portrait.state) && /^ps_[0-9a-f]{32}$/.test(portrait.snapshot_id || '')) {
    return { name: 'student-my-reports', query: { snapshot_id: portrait.snapshot_id! } }
  }
  return { name: 'student-my-reports' }
}

export function followupStatus(state: StudentWorkbenchState | null, saved: boolean) {
  const prefix = saved ? '补充已保存。' : ''
  if (!state) return prefix + '当前分析状态暂时无法读取，请重试；不需要重复提交。'
  if (state.portrait.state === 'processing') return prefix + '正在重新分析，可以稍后回来查看。'
  if (state.portrait.state === 'failed') return prefix + '这次重新分析未成功，已保存的内容不会丢失；当前没有新画像，不需要重复提交。'
  if (['ready_scored', 'ready_with_unknowns'].includes(state.portrait.state) && state.portrait.snapshot_id) {
    return saved ? prefix + '新画像已可查看，仍可能有部分信息未知。' : '当前画像已可查看，仍可能有部分信息未知。'
  }
  return prefix + '当前尚未形成可查看的新画像，可以继续查看分析进度。'
}
