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

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const groupOrder: Record<AbilityGroup, number> = {
  job: 0, professional: 1, position: 2, cognitive: 3, general: 4,
}

function groupOf(datum: NodeData): AbilityGroup {
  const group = datum.data?.group
  return typeof group === 'string' && group in GROUP_COLORS ? group as AbilityGroup : 'general'
}

function skillNodes(): AbilityNode[] {
  return props.nodes.filter(node => node.level > 1)
}

function skillEdges(): AbilityEdge[] {
  const ids = new Set(skillNodes().map(node => node.id))
  return props.edges.filter(edge => edge.relation !== 'belong' && ids.has(edge.source) && ids.has(edge.target))
}

function edgeKey(edge: AbilityEdge, index: number): string {
  return edge.source + ':' + edge.relation + ':' + edge.target + ':' + index
}

function networkLabelLines(name: string): string[] {
  const normalized = name.trim()
  if (normalized.includes('/')) {
    const [left = '', right = ''] = normalized.split(/\s*\/\s*/, 2)
    return [left.trim() + ' /', right.trim()].filter(Boolean)
  }
  if (/\s/.test(normalized)) return normalized.split(/\s+/).filter(Boolean).slice(0, 3)
  if (/^[A-Za-z][A-Za-z0-9.+#]*$/.test(normalized) && normalized.length > 9) {
    const parts = normalized.match(/[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)|[0-9]+/g)
    if (parts && parts.join('') === normalized) return parts.slice(0, 3)
  }
  if (/[\u3400-\u9fff]/.test(normalized) && Array.from(normalized).length > 4) {
    const chars = Array.from(normalized)
    return [chars.slice(0, 4).join(''), chars.slice(4).join('')].filter(Boolean)
  }
  return [normalized]
}

function networkLabelFontSize(name: string, compact: boolean, diameter: number): number {
  const lines = networkLabelLines(name)
  const maxUnits = Math.max(...lines.map(line => Array.from(line).reduce((sum, char) =>
    sum + (/[A-Za-z0-9.+#]/.test(char) ? 0.58 : /\s/.test(char) ? 0.34 : 1), 0)))
  const available = diameter * 0.72
  const preferred = compact ? 9.5 : 11.5
  return Math.max(compact ? 8 : 9, Math.min(preferred, available / Math.max(1, maxUnits)))
}

function initialPosition(node: AbilityNode, index: number, count: number, compact: boolean, nodeSize: [number, number]): [number, number] {
  const width = Math.max(1, host.value?.clientWidth ?? 1)
  const height = Math.max(1, host.value?.clientHeight ?? 1)
  const slots: Record<string, [number, number]> = {
    professional: [0.20, 0.23],
    position: [0.80, 0.23],
    cognitive: [0.20, 0.77],
    general: [0.80, 0.77],
  }
  const mobileSlots: Record<string, [number, number]> = {
    professional: [0.22, 0.21],
    position: [0.78, 0.21],
    cognitive: [0.22, 0.79],
    general: [0.78, 0.79],
  }
  const [cx, cy] = (compact ? mobileSlots[node.group] : slots[node.group]) ?? [0.5, 0.5]
  if (compact) {
    const columns = 3
    const row = Math.floor(index / columns)
    const rowCount = Math.ceil(count / columns)
    const x = (index % columns - (columns - 1) / 2) * (nodeSize[0] + 7)
    const y = (row - (rowCount - 1) / 2) * (nodeSize[1] + 6)
    return [width * cx + x, height * cy + y]
  }
  const angle = index * 2.399963229728653
  const distance = Math.sqrt((index + 0.45) / Math.max(1, count)) * Math.min(width, height) * 0.15
  return [width * cx + Math.cos(angle) * distance, height * cy + Math.sin(angle) * distance]
}

function toGraphData(): GraphData {
  const skills = skillNodes()
  const grouped = new Map<AbilityGroup, AbilityNode[]>()
  skills.forEach(node => {
    const group = grouped.get(node.group) ?? []
    group.push(node)
    grouped.set(node.group, group)
  })
  const compact = (host.value?.clientWidth ?? 1000) < 600
  const nodeSize: [number, number] = compact ? [46, 46] : [78, 78]
  const layoutSize: [number, number] = compact ? [51, 51] : [110, 110]
  const fontFamily = host.value ? getComputedStyle(host.value).fontFamily : 'sans-serif'

  const nodes: NodeData[] = skills.map(node => {
    const groupNodes = grouped.get(node.group) ?? []
    const groupIndex = groupNodes.findIndex(item => item.id === node.id)
    const position = positions.get(node.id) ?? initialPosition(node, groupIndex, groupNodes.length, compact, nodeSize)
    const color = GROUP_COLORS[node.group]
    return {
      id: node.id,
      type: 'circle',
      data: {
        name: node.name,
        group: node.group,
        groupLabel: node.group,
        level: node.level,
        parentId: node.parentId ?? null,
        order: groupOrder[node.group],
        size: nodeSize,
        layoutSize,
      },
      style: {
        x: position[0],
        y: position[1],
        size: nodeSize,
        fill: color + '18',
        stroke: color,
        lineWidth: 1.4,
        shadowColor: color + '2B',
        shadowBlur: 9,
        shadowOffsetY: 3,
        labelText: networkLabelLines(node.name).join('\n'),
        labelPlacement: 'center',
        labelFill: '#302B25',
        labelFontFamily: fontFamily,
        labelFontSize: networkLabelFontSize(node.name, compact, nodeSize[0]),
        labelFontWeight: 600,
        labelMaxWidth: nodeSize[0] - 9,
        labelMaxLines: 3,
        labelWordWrap: true,
        labelTextOverflow: 'ellipsis',
        cursor: 'grab',
      },
    }
  })

  const edges: EdgeData[] = skillEdges().flatMap((edge, index) => {
    const relation = RELATION_STYLES[edge.relation]
    return [{
      id: edgeKey(edge, index),
      source: edge.source,
      target: edge.target,
      type: 'cubic',
      data: { relation: edge.relation, label: edge.label ?? '' },
      style: {
        stroke: relation.color,
        opacity: 0.34,
        lineWidth: 1.3,
        lineDash: relation.dash.length ? [...relation.dash] : undefined,
        labelText: props.showEdgeLabels ? edge.label || relation.label : '',
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
  for (const node of skillNodes()) {
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

// Keep the mobile force-layout result legible as four compact cluster tiles;
// G6 still owns edges, selection and dragging while these collision-safe seeds avoid node pileups.
async function placeCompactSeeds(data: GraphData) {
  if (!graph || (host.value?.clientWidth ?? 1000) >= 600) return
  const missing: Record<string, [number, number]> = {}
  for (const node of data.nodes ?? []) {
    if (positions.has(node.id)) continue
    const x = Number(node.style?.x)
    const y = Number(node.style?.y)
    if (Number.isFinite(x) && Number.isFinite(y)) missing[node.id] = [x, y]
  }
  if (Object.keys(missing).length) await graph.translateElementTo(missing, false)
}

function createGraph(data: GraphData) {
  if (!host.value) return null
  let instance: Graph
  instance = new Graph({
    container: host.value,
    data,
    autoFit: 'center',
    zoom: 1,
    zoomRange: [0.28, 2.6],
    padding: [52, 52, 52, 52],
    animation: { duration: prefersReducedMotion() ? 0 : 360, easing: 'ease-out' },
    layout: {
      type: 'force',
      maxIteration: 560,
      minMovement: 0.2,
      nodeStrength: -220,
      edgeStrength: 5,
      linkDistance: (edge: EdgeData) => (host.value?.clientWidth ?? 1000) < 600 ? 52 : 96,
      gravity: (host.value?.clientWidth ?? 1000) < 600 ? 0.02 : 0.2,
      clustering: true,
      nodeClusterBy: (node: NodeData) => String(node.data?.group ?? 'general'),
      clusterNodeStrength: (host.value?.clientWidth ?? 1000) < 600 ? 12 : 30,
      preventOverlap: true,
      nodeSize: (datum: NodeData) => (datum.data?.layoutSize as [number, number]) ?? [96, 96],
      nodeSpacing: (host.value?.clientWidth ?? 1000) < 600 ? 6 : 8,
      collideStrength: 1,
    },
    node: {
      state: {
        selected: datum => ({
          halo: true,
          haloStroke: GROUP_COLORS[groupOf(datum)],
          haloLineWidth: 9,
          haloStrokeOpacity: 0.28,
          lineWidth: 2.8,
          shadowBlur: 18,
          shadowColor: GROUP_COLORS[groupOf(datum)],
        }),
        neighborActive: datum => ({
          halo: true,
          haloStroke: GROUP_COLORS[groupOf(datum)],
          haloLineWidth: 5,
          haloStrokeOpacity: 0.16,
          lineWidth: 2,
          opacity: 1,
        }),
        inactive: { opacity: 0.42, labelOpacity: 0.66 },
      },
    },
    edge: {
      state: {
        selected: { opacity: 1, lineWidth: 2.8 },
        neighborActive: { opacity: 0.98, lineWidth: 2.6 },
        inactive: { opacity: 0.09, labelOpacity: 0 },
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
              positions.set(String(id), [point[0], point[1]])
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
            if (id) emit('node-click', id)
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

async function fitOverview() {
  if (!graph) return
  await graph.fitView({ when: 'always' }, { duration: 0 })
  const minimumZoom = (host.value?.clientWidth ?? 1000) < 600 ? 0.52 : 0.76
  if (graph.getZoom() < minimumZoom) {
    await graph.zoomTo(minimumZoom, { duration: 0 }, graph.getCanvasCenter())
  }
  if (graph.getZoom() > 1.18) {
    await graph.zoomTo(1.18, { duration: 0 }, graph.getCanvasCenter())
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
  const nodes = skillNodes()
  if (nodes.length === 0) {
    graph?.destroy()
    graph = null
    positions.clear()
    renderedNodeIds.clear()
    return
  }

  const currentNodeIds = new Set(nodes.map(node => node.id))
  const needsLayout = currentNodeIds.size !== renderedNodeIds.size
    || [...currentNodeIds].some(id => !renderedNodeIds.has(id))
  const data = toGraphData()
  if (!graph) {
    graph = createGraph(data)
    if (!graph) return
    await graph.render()
    renderedNodeIds = currentNodeIds
    graph.setData(toGraphData())
    await graph.draw()
    await placeCompactSeeds(data)
    rememberPositions()
    await fitOverview()
  } else if (needsLayout) {
    // Preserve already positioned skills; force layout only settles newly arrived nodes.
    graph.setData(data)
    await graph.draw()
    await placeCompactSeeds(data)
    rememberPositions()
    renderedNodeIds = currentNodeIds
    await fitOverview()
  } else {
    // Relation label changes keep both the user's camera and dragged node positions.
    graph.setData(data)
    await graph.draw()
    rememberPositions()
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
  if (!graph || !skillNodes().some(node => node.id === id)) return
  const overviewZoom = Math.min(graph.getZoom(), 0.94)
  const duration = prefersReducedMotion() ? 0 : 220
  await graph.zoomTo(overviewZoom, { duration, easing: 'ease-in-out' }, graph.getCanvasCenter())
  await graph.focusElement(id, { duration: prefersReducedMotion() ? 0 : 320, easing: 'ease-in-out' })
}

async function resetView() {
  await operation
  if (!graph) return
  positions.clear()
  renderedNodeIds.clear()
  graph.destroy()
  graph = null
  await syncGraph()
}

function resize() {
  if (graph) {
    graph.resize()
    // Keep node coordinates intact, but reframe the same arrangement for the new viewport.
    void fitOverview()
  } else if (skillNodes().length) {
    enqueue(syncGraph)
  }
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
  <div ref="host" class="career-ability-g6" :aria-label="roleName + '职业能力关系网络'"></div>
</template>

<style scoped>
.career-ability-g6 {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: transparent;
  touch-action: none;
}
</style>
