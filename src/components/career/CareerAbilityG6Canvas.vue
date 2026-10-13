<!-- 职业分析内的能力关系图：只负责 G6 渲染与画布交互，不改业务数据契约。 -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Graph, type EdgeData, type GraphData, type NodeData, type ID, type IElementDragEvent, type IPointerEvent } from '@antv/g6'
import {
  GROUP_COLORS,
  RELATION_STYLES,
  type AbilityEdge,
  type AbilityGroup,
  type AbilityNode,
} from '@/composables/useAbilityGraph'

defineOptions({ name: 'CareerAbilityG6Canvas' })

const props = defineProps<{
  nodes: AbilityNode[]
  edges: AbilityEdge[]
  selectedNodeId: string | null
  showEdgeLabels: boolean
  roleName: string
}>()
const emit = defineEmits<{
  'node-click': [id: string]
  'canvas-click': []
}>()

const host = ref<HTMLElement | null>(null)
let graph: Graph | null = null
let activeRole = ''
let disposed = false
let operation = Promise.resolve()
let resizeObserver: ResizeObserver | null = null
let resizeFrame = 0
const positions = new Map<string, [number, number]>()
let renderedNodeIds = new Set<string>()

const groupOrder: Record<AbilityGroup, number> = {
  job: 0, professional: 1, position: 2, cognitive: 3, general: 4,
}

function groupOf(datum: NodeData): AbilityGroup {
  const group = datum.data?.group
  return typeof group === 'string' && group in GROUP_COLORS ? group as AbilityGroup : 'general'
}

function edgeKey(edge: AbilityEdge, index: number): string {
  return `${edge.source}:${edge.relation}:${edge.target}:${index}`
}

/** 只取业务字段的原始值，绝不把 Vue proxy 交给 G6。 */
function toGraphData(): GraphData {
  const ids = new Set(props.nodes.map(node => node.id))
  const fontFamily = host.value ? getComputedStyle(host.value).fontFamily : 'sans-serif'
  const nodes: NodeData[] = props.nodes.map(node => {
    const isJob = node.level === 0
    const isBoard = node.level === 1
    const color = GROUP_COLORS[node.group]
    const size: [number, number] = isJob ? [124, 124] : isBoard ? [88, 88] : [92, 30]
    const position = positions.get(node.id)
    return {
      id: node.id,
      type: isJob || isBoard ? 'circle' : 'rect',
      data: {
        name: node.name,
        group: node.group,
        level: node.level,
        parentId: node.parentId ?? null,
        heat: node.heat ?? null,
        order: groupOrder[node.group],
      },
      style: {
        ...(position ? { x: position[0], y: position[1] } : {}),
        size,
        radius: isJob || isBoard ? undefined : 15,
        fill: isJob || isBoard ? color : '#FFFCF8',
        stroke: color,
        lineWidth: isJob ? 1.6 : isBoard ? 1.4 : 1.05,
        halo: isJob || isBoard,
        haloStroke: color,
        haloLineWidth: isJob ? 12 : 9,
        haloStrokeOpacity: isJob ? 0.14 : 0.10,
        shadowColor: isJob ? 'rgba(139,37,0,.20)' : 'rgba(38,34,28,.09)',
        shadowBlur: isJob ? 19 : isBoard ? 12 : 4,
        shadowOffsetY: isJob ? 6 : isBoard ? 4 : 2,
        labelText: node.name,
        labelPlacement: 'center',
        labelFill: isJob || isBoard ? '#FFFFFF' : '#2C2925',
        labelFontFamily: fontFamily,
        labelFontSize: isJob ? 16 : isBoard ? 13 : 12,
        labelFontWeight: isJob || isBoard ? 700 : 500,
        labelMaxWidth: isJob ? 110 : isBoard ? 76 : 84,
        labelTextOverflow: 'ellipsis',
        cursor: 'grab',
      },
    }
  })

  const edges: EdgeData[] = props.edges.flatMap((edge, index) => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return []
    const relation = RELATION_STYLES[edge.relation]
    const isBelong = edge.relation === 'belong'
    return [{
      id: edgeKey(edge, index),
      source: edge.source,
      target: edge.target,
      type: isBelong ? 'line' : 'cubic',
      data: { relation: edge.relation, label: edge.label ?? '' },
      style: {
        stroke: isBelong ? '#B8B2A9' : relation.color,
        opacity: isBelong ? 0.42 : 0.32,
        lineWidth: isBelong ? 1.2 : 1.2,
        lineDash: relation.dash.length ? [...relation.dash] : undefined,
        labelText: props.showEdgeLabels && !isBelong ? edge.label || relation.label : '',
        labelFill: relation.color,
        labelFontSize: 10,
        labelBackground: true,
        labelBackgroundFill: '#F8F5EE',
        labelPadding: [2, 5],
      },
    }]
  })
  return { nodes, edges }
}

function rememberPositions() {
  if (!graph) return
  for (const node of props.nodes) {
    try {
      const point = graph.getElementPosition(node.id)
      if (Number.isFinite(point[0]) && Number.isFinite(point[1])) {
        positions.set(node.id, [point[0], point[1]])
      }
    } catch {
      // A node can be in props before G6 has completed its first draw.
    }
  }
}

function createGraph(data: GraphData) {
  if (!host.value) return null
  let instance: Graph
  instance = new Graph({
    container: host.value,
    data,
    autoFit: 'center',
    zoom: 1.15,
    zoomRange: [0.4, 2.8],
    padding: [72, 72, 72, 72],
    animation: { duration: 420, easing: 'ease-out' },
    layout: {
      type: 'concentric',
      // G6 官方同心圆布局：岗位、板块、技能严格分环，不受关系边牵引。
      sortBy: (datum: NodeData) => 100 - Number(datum.data?.level ?? 2) * 40
        - Number(datum.data?.order ?? 4) * 0.01,
      maxLevelDiff: 30,
      startAngle: -Math.PI / 2,
      clockwise: true,
      preventOverlap: true,
      nodeSize: (datum: NodeData) => {
        const level = Number(datum.data?.level ?? 2)
        return level === 0 ? [124, 124] : level === 1 ? [88, 88] : [92, 30]
      },
      nodeSpacing: 28,
    },
    node: {
      state: {
        selected: datum => ({
          halo: true,
          haloStroke: GROUP_COLORS[groupOf(datum)],
          haloLineWidth: 10,
          haloStrokeOpacity: 0.32,
          lineWidth: 3,
          shadowBlur: 24,
          shadowColor: GROUP_COLORS[groupOf(datum)],
        }),
        neighborActive: datum => ({
          halo: true,
          haloStroke: GROUP_COLORS[groupOf(datum)],
          haloLineWidth: 5,
          haloStrokeOpacity: 0.18,
          lineWidth: 2,
          opacity: 1,
        }),
        inactive: { opacity: 0.18, labelOpacity: 0.2 },
      },
    },
    edge: {
      state: {
        selected: { opacity: 1, lineWidth: 2.6 },
        neighborActive: { opacity: 0.98, lineWidth: 2.4 },
        inactive: { opacity: 0.07, labelOpacity: 0 },
      },
    },
    behaviors: [
      'drag-canvas',
      'zoom-canvas',
      {
        type: 'drag-element',
        enable: (event: IElementDragEvent) => event.targetType === 'node',
        shadow: false,
        hideEdge: 'none',
        onFinish: (ids: ID[]) => {
          for (const id of ids) {
            const point = instance.getElementPosition(id)
            if (Number.isFinite(point[0]) && Number.isFinite(point[1])) {
              positions.set(id, [point[0], point[1]])
            }
          }
        },
      },
      {
        type: 'click-select',
        degree: 1,
        state: 'selected',
        neighborState: 'neighborActive',
        unselectedState: 'inactive',
        enable: (event: IPointerEvent) => event.targetType === 'node' || event.targetType === 'canvas',
        onClick: (event: IPointerEvent) => {
          if (event.targetType === 'node') {
            const id = 'id' in event.target ? String(event.target.id) : ''
            if (!id) return
            if (instance.getElementState(id).includes('selected')) emit('node-click', id)
            else emit('canvas-click')
          } else if (event.targetType === 'canvas') {
            emit('canvas-click')
          }
        },
      },
    ],
  })
  return instance
}

async function applySelection() {
  if (!graph) return
  const data = graph.getData()
  const selected = props.selectedNodeId
  const currentIds = new Set((data.nodes ?? []).map(node => node.id))
  const neighbors = new Set<string>()
  const relatedEdges = new Set<string>()
  if (selected && currentIds.has(selected)) {
    for (const edge of data.edges ?? []) {
      if (edge.source === selected || edge.target === selected) {
        neighbors.add(edge.source === selected ? edge.target : edge.source)
        if (edge.id) relatedEdges.add(edge.id)
      }
    }
  }
  const states: Record<string, string[]> = {}
  for (const node of data.nodes ?? []) {
    states[node.id] = !selected || !currentIds.has(selected) ? []
      : node.id === selected ? ['selected']
      : neighbors.has(node.id) ? ['neighborActive'] : ['inactive']
  }
  for (const edge of data.edges ?? []) {
    if (!edge.id) continue
    states[edge.id] = !selected || !currentIds.has(selected) ? []
      : relatedEdges.has(edge.id) ? ['neighborActive'] : ['inactive']
  }
  if (Object.keys(states).length) await graph.setElementState(states, false)
}

/** 折叠后的主图放大，单簇展开时保证所有技能进入首屏。 */
async function fitOverview() {
  if (!graph) return
  await graph.fitView({ when: 'always' }, { duration: 0 })
  const maxZoom = props.nodes.length <= 5 ? 1.68 : props.nodes.length <= 20 ? 1.25 : 0.82
  if (graph.getZoom() > maxZoom) {
    await graph.zoomTo(maxZoom, { duration: 0 }, graph.getCanvasCenter())
  }
}

async function syncGraph() {
  if (disposed || !host.value || host.value.clientWidth < 1 || host.value.clientHeight < 1) return
  if (activeRole !== props.roleName) {
    graph?.destroy()
    graph = null
    positions.clear()
    renderedNodeIds.clear()
    activeRole = props.roleName
  }
  if (props.nodes.length === 0) {
    graph?.destroy()
    graph = null
    positions.clear()
    renderedNodeIds.clear()
    return
  }

  const currentNodeIds = new Set(props.nodes.map(node => node.id))
  const needsLayout = currentNodeIds.size !== renderedNodeIds.size
    || [...currentNodeIds].some(id => !renderedNodeIds.has(id))
  if (needsLayout) positions.clear()
  const data = toGraphData()
  // 跨板块关系是解释层，不参与空间排布；否则 radial 会把四个能力簇拉成乱网。
  const hierarchyData: GraphData = {
    nodes: data.nodes,
    edges: data.edges?.filter(edge => edge.data?.relation === 'belong'),
  }
  if (!graph) {
    graph = createGraph(hierarchyData)
    if (!graph) return
    await graph.render()
    rememberPositions()
    renderedNodeIds = currentNodeIds
    graph.setData(toGraphData())
    await graph.draw()
    await fitOverview()
  } else {
    if (needsLayout) {
      graph.setData(hierarchyData)
      await graph.render()
      rememberPositions()
      renderedNodeIds = currentNodeIds
      graph.setData(toGraphData())
      await graph.draw()
      await fitOverview()
    } else {
      // Collapsing, relation reveals and label switches must not reset a dragged node.
      graph.setData(data)
      await graph.draw()
    }
  }
  if (!disposed) await applySelection()
}

function enqueue(task: () => Promise<void>) {
  operation = operation.then(async () => {
    if (!disposed) await task()
  }).catch(error => {
    console.error('[career-ability-g6] render failed', error)
  })
}

async function focusNode(id: string) {
  await operation
  if (!graph || !props.nodes.some(node => node.id === id)) return
  // 保留一阶邻域的空间上下文：只把目标移到中央，放得太大会裁掉所属板块。
  const overviewZoom = Math.min(graph.getZoom(), 0.94)
  await graph.zoomTo(overviewZoom, { duration: 260, easing: 'ease-in-out' }, graph.getCanvasCenter())
  await graph.focusElement(id, { duration: 420, easing: 'ease-in-out' })
}

async function resetView() {
  await operation
  if (!graph) return
  await fitOverview()
}

function resize() {
  graph?.resize()
  if (!graph && props.nodes.length) enqueue(syncGraph)
}

defineExpose({ focusNode, resetView, resize })

onMounted(() => {
  if (host.value) {
    resizeObserver = new ResizeObserver(() => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0
        if (!disposed) resize()
      })
    })
    resizeObserver.observe(host.value)
  }
  enqueue(syncGraph)
})
watch(() => [props.nodes, props.edges, props.showEdgeLabels, props.roleName], () => enqueue(syncGraph))
watch(() => props.selectedNodeId, () => enqueue(applySelection))
onBeforeUnmount(() => {
  disposed = true
  resizeObserver?.disconnect()
  resizeObserver = null
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  void operation.finally(() => { graph?.destroy(); graph = null })
})
</script>

<template>
  <div ref="host" class="career-ability-g6" :aria-label="`${roleName}职业能力复合图谱`"></div>
</template>

<style scoped>
.career-ability-g6 {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: transparent;
}
</style>
