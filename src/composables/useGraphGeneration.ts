/**
 * 模拟 SSE 图谱生成流程 — 驱动增量可见集合 + 日志输出
 * 本期：本地 mock setInterval 产出事件
 * 后续：替换为 EventSource / fetch streaming，事件结构不变
 */
import { ref, type Ref } from 'vue'
import type { AbilityNode, AbilityEdge } from '@/composables/useAbilityGraph'

/* ═══ 事件类型（mock / 真 SSE 同构） ═══ */

export interface LogEntry {
  level: 'info' | 'success' | 'warn'
  agent: string
  message: string
  ts: string
}

export interface StepPage {
  title: string
  logs: LogEntry[]
  progress: number   // 0-100
}

export type GenEvent =
  | { type: 'phase';    payload: { name: string; progress: number } }
  | { type: 'node:add'; payload: { nodeIds: string[] } }
  | { type: 'edge:add'; payload: { edgeIds: string[] } }
  | { type: 'log';      payload: LogEntry }
  | { type: 'done';     payload: { summary: string } }

/* ═══ 工具：生成时间戳 ═══ */
function nowTs(): string {
  const d = new Date()
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
}

/* ═══ 为边生成 id（source→target） ═══ */
export function edgeId(e: AbilityEdge): string {
  return `${e.source}→${e.target}`
}

/* ═══ Composable ═══ */

export function useGraphGeneration(
  allNodes: Ref<AbilityNode[]>,
  allEdges: Ref<AbilityEdge[]>,
) {
  const visibleNodeIds = ref<Set<string>>(new Set())
  const visibleEdgeIds = ref<Set<string>>(new Set())
  const logs = ref<LogEntry[]>([])
  const stepPages = ref<StepPage[]>([])
  const currentPage = ref(0)
  const phase = ref('')
  const progress = ref(0)
  const isDone = ref(false)
  const isRunning = ref(false)

  let timers: number[] = []

  function addLog(entry: LogEntry) {
    logs.value = [...logs.value, entry]
    // 追加到当前 stepPage
    const pages = stepPages.value
    if (pages.length > 0) {
      const last = pages[pages.length - 1]
      if (last) last.logs = [...last.logs, entry]
    }
  }

  function addNodes(ids: string[]) {
    const s = new Set(visibleNodeIds.value)
    ids.forEach(id => s.add(id))
    visibleNodeIds.value = s
  }

  function addEdges(ids: string[]) {
    const s = new Set(visibleEdgeIds.value)
    ids.forEach(id => s.add(id))
    visibleEdgeIds.value = s
  }

  function startPhase(name: string, prog: number) {
    phase.value = name
    progress.value = prog
    stepPages.value = [...stepPages.value, { title: name, logs: [], progress: prog }]
    currentPage.value = stepPages.value.length - 1
  }

  /**
   * 启动模拟生成流程
   * 6 个阶段（含前置连接），总耗时约 8 秒
   */
  function start() {
    stop()
    visibleNodeIds.value = new Set()
    visibleEdgeIds.value = new Set()
    logs.value = []
    stepPages.value = []
    currentPage.value = 0
    phase.value = ''
    progress.value = 0
    isDone.value = false
    isRunning.value = true

    const nodes = allNodes.value
    const edges = allEdges.value

    if (nodes.length === 0) {
      startPhase('暂无图谱数据', 0)
      addLog({ level: 'warn', agent: 'System', message: '该岗位暂无能力节点，图谱暂不可展示', ts: nowTs() })
      isRunning.value = false
      return
    }

    // 分类节点
    const centerNode = nodes.filter(n => n.level === 0)
    const boardNodes = nodes.filter(n => n.level === 1)
    const childNodes = nodes.filter(n => n.level >= 2)
    const belongEdges = edges.filter(e => e.relation === 'belong')
    const crossEdges = edges.filter(e => e.relation !== 'belong')

    // 板块子节点按板块分组
    const childByBoard = new Map<string, AbilityNode[]>()
    for (const c of childNodes) {
      const arr = childByBoard.get(c.parentId || '') || []
      arr.push(c)
      childByBoard.set(c.parentId || '', arr)
    }

    let delay = 0

    // ── 阶段 0：连接后端（~0.5s）──
    delay += 180
    timers.push(window.setTimeout(() => {
      startPhase('连接服务', 5)
      addLog({ level: 'info', agent: 'System', message: '正在连接能力图谱服务…', ts: nowTs() })
    }, delay))

    delay += 320
    timers.push(window.setTimeout(() => {
      addLog({ level: 'success', agent: 'System', message: '后端连接成功，开始处理请求', ts: nowTs() })
      progress.value = 8
    }, delay))

    // ── 阶段 1：简历解析（~0.9s）──
    delay += 270
    timers.push(window.setTimeout(() => {
      startPhase('简历解析', 12)
      addLog({ level: 'info', agent: 'JobParsingAgent', message: '职位解析完成', ts: nowTs() })
    }, delay))

    delay += 360
    timers.push(window.setTimeout(() => {
      addLog({ level: 'info', agent: 'ResumeParsingAgent', message: '简历解析中…', ts: nowTs() })
    }, delay))

    delay += 450
    timers.push(window.setTimeout(() => {
      addLog({ level: 'success', agent: 'ResumeParsingAgent', message: '关键信息提取成功', ts: nowTs() })
      // 中心节点出现
      addNodes(centerNode.map(n => n.id))
      progress.value = 20
    }, delay))

    // ── 阶段 2：技能识别（~1.0s）──
    delay += 360
    timers.push(window.setTimeout(() => {
      startPhase('技能识别', 30)
      addLog({ level: 'info', agent: 'MatchingAgent', message: '开始匹配分析…', ts: nowTs() })
    }, delay))

    delay += 720
    timers.push(window.setTimeout(() => {
      addLog({ level: 'success', agent: 'MatchingAgent', message: '识别 4 大技能板块，进入展开阶段', ts: nowTs() })
      // 板块节点 + belong 边
      addNodes(boardNodes.map(n => n.id))
      const boardBelong = belongEdges.filter(e =>
        centerNode.some(c => c.id === e.source) && boardNodes.some(b => b.id === e.target),
      )
      addEdges(boardBelong.map(e => edgeId(e)))
      progress.value = 40
    }, delay))

    // ── 阶段 3：子技能展开（逐板块，~630ms/板块）──
    delay += 450
    timers.push(window.setTimeout(() => {
      startPhase('子技能展开', 50)
      addLog({ level: 'info', agent: 'SkillExpandAgent', message: '逐板块展开子技能…', ts: nowTs() })
    }, delay))

    let boardIdx = 0
    for (const board of boardNodes) {
      const children = childByBoard.get(board.id) || []
      if (children.length === 0) continue
      delay += 630
      const bi = boardIdx
      timers.push(window.setTimeout(() => {
        addNodes(children.map(c => c.id))
        const childBelong = belongEdges.filter(e => e.source === board.id && children.some(c => c.id === e.target))
        addEdges(childBelong.map(e => edgeId(e)))
        addLog({
          level: 'success',
          agent: 'SkillExpandAgent',
          message: `${board.name}：展开 ${children.length} 个子技能`,
          ts: nowTs(),
        })
        progress.value = 50 + Math.round((bi + 1) / boardNodes.length * 25)
      }, delay))
      boardIdx++
    }

    // ── 阶段 4：关系推理（~1.6s）──
    delay += 630
    timers.push(window.setTimeout(() => {
      startPhase('关系推理', 80)
      addLog({ level: 'info', agent: 'RelationAgent', message: '推理跨板块关系线…', ts: nowTs() })
    }, delay))

    delay += 900
    timers.push(window.setTimeout(() => {
      addEdges(crossEdges.map(e => edgeId(e)))
      addLog({
        level: 'success',
        agent: 'RelationAgent',
        message: `发现 ${crossEdges.length} 条跨板块关系，应用完成`,
        ts: nowTs(),
      })
      progress.value = 92
    }, delay))

    // ── 阶段 5：完成（~0.7s）──
    delay += 720
    timers.push(window.setTimeout(() => {
      startPhase('渲染完成', 100)
      addLog({
        level: 'success',
        agent: 'System',
        message: `图谱构建完成：${nodes.length} 节点 / ${edges.length} 边`,
        ts: nowTs(),
      })
      progress.value = 100
      isDone.value = true
      isRunning.value = false
    }, delay))
  }

  function stop() {
    timers.forEach(t => clearTimeout(t))
    timers = []
    isRunning.value = false
  }

  return {
    visibleNodeIds,
    visibleEdgeIds,
    logs,
    stepPages,
    currentPage,
    phase,
    progress,
    isDone,
    isRunning,
    start,
    stop,
  }
}
