<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import * as d3 from 'd3'
import {
  GROUP_COLORS,
  RELATION_STYLES,
  type AbilityEdge,
  type AbilityNode,
} from '@/composables/useAbilityGraph'

defineOptions({ name: 'CareerAbilityBubbleMap' })

// Extract the project's soft, nested D3 bubble visual into a focused map component;
// bubble radius is for label fit only, never an inferred skill score.

const props = defineProps<{
  nodes: AbilityNode[]
  edges: AbilityEdge[]
  selectedNodeId: string | null
  roleName: string
}>()

const emit = defineEmits<{
  'node-click': [id: string]
  'canvas-click': []
}>()

interface BubbleSkill extends d3.SimulationNodeDatum {
  id: string
  name: string
  parentId: string
  color: string
  radius: number
}

interface BubbleBoard extends d3.SimulationNodeDatum {
  id: string
  name: string
  color: string
  radius: number
  skills: BubbleSkill[]
  x: number
  y: number
}

const host = ref<HTMLElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const svgHeight = ref(0)
const compact = ref(false)
const idPrefix = `career-bubble-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`
let resizeObserver: ResizeObserver | null = null
let resizeFrame = 0
let hoveredNodeId: string | null = null
let activeSvg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null
let pointLocations = new Map<string, [number, number]>()

function hash(value: string): number {
  let result = 2166136261
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619)
  return result >>> 0
}

function boardGradientId(id: string): string {
  return `${idPrefix}-board-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`
}

function skillGradientId(id: string): string {
  return `${idPrefix}-skill-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function labelRadius(name: string, isCompact: boolean): number {
  const length = Array.from(name.replace(/\s/g, '')).length
  return clamp((isCompact ? 20 : 22) + Math.max(0, length - 5) * (isCompact ? 0.52 : 0.78), isCompact ? 20 : 22, isCompact ? 25 : 30)
}

function labelLines(name: string, radius: number): string[] {
  const maxChars = Math.max(3, Math.floor(radius / 6.2))
  if (name.includes('/')) {
    const [left = '', right = ''] = name.split(/\s*\/\s*/, 2)
    return [`${left.trim()} /`, right.trim()].filter(Boolean)
  }
  if (/[A-Za-z]/.test(name) && /[\u3400-\u9fff]/.test(name)) {
    const segments = name.match(/[A-Za-z0-9.+#]+|[\u3400-\u9fff]+/g)
    if (segments?.length) return segments.slice(0, 3)
  }
  if (/^[A-Za-z0-9.+# -]+$/.test(name) && name.includes(' ')) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2)
  }

  const normalized = name
  const chunks: string[] = []
  let current = ''

  for (const char of Array.from(normalized)) {
    if (/\s/.test(char) && !current) continue
    if (current.length >= maxChars && !/\s/.test(char)) {
      chunks.push(current.trim())
      current = ''
    }
    current += char
    if (/\s/.test(char) && current.length >= maxChars - 1) {
      chunks.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) chunks.push(current.trim())

  // Keep common Latin tool names intact; their font scales down slightly instead of breaking mid-word.
  if (/^[A-Za-z0-9.+# -]+$/.test(name)) return [name]
  return chunks.slice(0, 3)
}

function boardNodes(): AbilityNode[] {
  return props.nodes.filter(node => node.level === 1)
}

function skillsFor(boardId: string): AbilityNode[] {
  return props.nodes.filter(node => node.parentId === boardId && node.level > 1)
}

function focusRelations(focusId: string | null): { related: Set<string>; edges: AbilityEdge[] } {
  const related = new Set<string>()
  if (!focusId) return { related, edges: [] }
  const edges = props.edges.filter(edge => {
    if (edge.relation === 'belong' || (edge.source !== focusId && edge.target !== focusId)) return false
    const neighbor = edge.source === focusId ? edge.target : edge.source
    related.add(neighbor)
    return true
  })
  return { related, edges }
}

function clearChart() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = 0
  pointLocations = new Map()
  activeSvg = null
  if (svg.value) d3.select(svg.value).selectAll('*').remove()
}

function scheduleDraw() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0
    draw()
  })
}

function addNodeAccessibility(selection: d3.Selection<SVGGElement, any, any, any>, type: 'skill' | 'board') {
  selection
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', node => type === 'board'
      ? `${node.name}，${(node as BubbleBoard).skills.length} 项能力`
      : `${node.name}，点击查看能力详情`)
    .on('click', (event: MouseEvent, node) => {
      event.stopPropagation()
      emit('node-click', node.id)
    })
    .on('keydown', (event: KeyboardEvent, node) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      emit('node-click', node.id)
    })
    .on('mouseenter', (_event, node) => {
      hoveredNodeId = node.id
      updateFocus()
    })
    .on('mouseleave', () => {
      hoveredNodeId = null
      updateFocus()
    })
}

function updateFocus() {
  if (!activeSvg) return
  const focusId = hoveredNodeId || props.selectedNodeId
  const { related, edges } = focusRelations(focusId)
  const selectedBoard = boardNodes().find(board => board.id === focusId)
  const boardChildren = selectedBoard ? new Set(skillsFor(selectedBoard.id).map(skill => skill.id)) : new Set<string>()
  const hasFocus = Boolean(focusId)

  activeSvg.selectAll<SVGGElement, BubbleSkill>('g.career-bubble-map__skill')
    .classed('is-selected', skill => skill.id === focusId)
    .classed('is-related', skill => related.has(skill.id) || boardChildren.has(skill.id))
    .classed('is-muted', skill => hasFocus && skill.id !== focusId && !related.has(skill.id) && !boardChildren.has(skill.id))

  activeSvg.selectAll<SVGGElement, BubbleBoard>('g.career-bubble-map__board')
    .classed('is-selected', board => board.id === focusId)
    .classed('is-muted', board => hasFocus && board.id !== focusId && !boardChildren.has(board.id)
      && board.skills.every(skill => !related.has(skill.id)))

  const linkData = edges
    .map(edge => {
      const start = pointLocations.get(edge.source)
      const end = pointLocations.get(edge.target)
      return start && end ? { edge, start, end } : null
    })
    .filter((item): item is { edge: AbilityEdge; start: [number, number]; end: [number, number] } => item !== null)

  const linkLayer = activeSvg.select<SVGGElement>('g.career-bubble-map__links')
  linkLayer.selectAll<SVGPathElement, typeof linkData[number]>('path')
    .data(linkData, item => `${item.edge.source}:${item.edge.relation}:${item.edge.target}`)
    .join('path')
    .attr('d', item => {
      const [x1, y1] = item.start
      const [x2, y2] = item.end
      const dx = x2 - x1
      const dy = y2 - y1
      const bend = Math.min(44, Math.hypot(dx, dy) * 0.14)
      const sign = (hash(`${item.edge.source}:${item.edge.target}`) % 2) ? 1 : -1
      const mx = (x1 + x2) / 2 - (dy / (Math.hypot(dx, dy) || 1)) * bend * sign
      const my = (y1 + y2) / 2 + (dx / (Math.hypot(dx, dy) || 1)) * bend * sign
      return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`
    })
    .attr('fill', 'none')
    .attr('stroke', item => RELATION_STYLES[item.edge.relation].color)
    .attr('stroke-width', 1.8)
    .attr('stroke-dasharray', item => RELATION_STYLES[item.edge.relation].dash.join(' '))
    .attr('opacity', 0.54)
    .attr('pointer-events', 'none')
}

function draw() {
  if (!host.value || !svg.value) return
  const width = Math.max(1, host.value.clientWidth)
  const availableHeight = Math.max(380, host.value.clientHeight)
  const isCompact = width < 690
  compact.value = isCompact

  const boards = boardNodes().map(board => {
    const childNodes = skillsFor(board.id)
    return { board, childNodes }
  }).filter(item => item.childNodes.length > 0)

  if (!boards.length) {
    clearChart()
    return
  }

  const outerRadius = isCompact
    ? Math.min(130, width * 0.43)
    : Math.min(192, width * 0.225, Math.max(72, (availableHeight - 96) / 4))
  const rowPitch = outerRadius * 2 + 44
  const height = isCompact
    ? Math.max(availableHeight, boards.length * rowPitch + 52)
    : availableHeight
  svgHeight.value = height

  const boardViews: BubbleBoard[] = boards.map(({ board, childNodes }, index) => {
    const skills: BubbleSkill[] = childNodes.map(skill => ({
      id: skill.id,
      name: skill.name,
      parentId: board.id,
      color: GROUP_COLORS[board.group],
      radius: labelRadius(skill.name, isCompact),
      x: Math.cos(index * 1.7 + hash(skill.id) * 0.000001) * outerRadius * 0.42,
      y: Math.sin(index * 1.7 + hash(skill.id) * 0.000001) * outerRadius * 0.42,
    }))

    let x: number
    let y: number
    if (isCompact) {
      x = width / 2
      y = outerRadius + 70 + index * rowPitch
    } else {
      const horizontalGap = Math.max(24, outerRadius * 0.16)
      const verticalGap = Math.max(20, outerRadius * 0.16)
      const centerX = width / 2
      const centerY = height / 2 + 18
      const offsetX = outerRadius + horizontalGap / 2
      const offsetY = outerRadius + verticalGap / 2
      const positions = [
        [centerX - offsetX, centerY - offsetY],
        [centerX + offsetX, centerY - offsetY + 6],
        [centerX - offsetX + 8, centerY + offsetY],
        [centerX + offsetX, centerY + offsetY - 4],
      ] as const
      const position = positions[index % positions.length] ?? [centerX, centerY]
      x = position[0]
      y = position[1]
    }

    return {
      id: board.id,
      name: board.name,
      color: GROUP_COLORS[board.group],
      radius: outerRadius,
      skills,
      x,
      y,
    }
  })

  const root = d3.select(svg.value)
  root.selectAll('*').remove()
  root.attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMin meet')
    .style('height', isCompact ? `${height}px` : '100%')
  activeSvg = root
  pointLocations = new Map()

  const defs = root.append('defs')
  const inkFilter = defs.append('filter')
    .attr('id', `${idPrefix}-ink`)
    .attr('x', '-24%').attr('y', '-24%').attr('width', '148%').attr('height', '148%')
  inkFilter.append('feTurbulence')
    .attr('type', 'fractalNoise').attr('baseFrequency', 0.045).attr('numOctaves', 2).attr('seed', 8).attr('result', 'grain')
  inkFilter.append('feDisplacementMap')
    .attr('in', 'SourceGraphic').attr('in2', 'grain').attr('scale', 2.2).attr('result', 'soft-edge')
  inkFilter.append('feGaussianBlur').attr('in', 'soft-edge').attr('stdDeviation', 0.45)

  const glowFilter = defs.append('filter')
    .attr('id', `${idPrefix}-glow`)
    .attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%')
  glowFilter.append('feGaussianBlur').attr('stdDeviation', 7)

  boardViews.forEach(board => {
    const outerGradient = defs.append('radialGradient')
      .attr('id', boardGradientId(board.id))
      .attr('cx', '50%').attr('cy', '48%').attr('r', '56%')
    outerGradient.append('stop').attr('offset', '0%').attr('stop-color', board.color).attr('stop-opacity', 0.015)
    outerGradient.append('stop').attr('offset', '68%').attr('stop-color', board.color).attr('stop-opacity', 0.045)
    outerGradient.append('stop').attr('offset', '91%').attr('stop-color', board.color).attr('stop-opacity', 0.13)
    outerGradient.append('stop').attr('offset', '100%').attr('stop-color', board.color).attr('stop-opacity', 0.20)

    const innerGradient = defs.append('radialGradient')
      .attr('id', skillGradientId(board.id))
      .attr('cx', '45%').attr('cy', '39%').attr('r', '67%')
    innerGradient.append('stop').attr('offset', '0%').attr('stop-color', board.color).attr('stop-opacity', 0.96)
    innerGradient.append('stop').attr('offset', '45%').attr('stop-color', board.color).attr('stop-opacity', 0.82)
    innerGradient.append('stop').attr('offset', '78%').attr('stop-color', board.color).attr('stop-opacity', 0.42)
    innerGradient.append('stop').attr('offset', '100%').attr('stop-color', board.color).attr('stop-opacity', 0.08)
  })

  const outerGroups = root.selectAll<SVGGElement, BubbleBoard>('g.career-bubble-map__board')
    .data(boardViews, board => board.id)
    .enter()
    .append('g')
    .attr('class', 'career-bubble-map__board')
    .attr('transform', board => `translate(${board.x},${board.y})`)

  outerGroups.append('circle')
    .attr('class', 'career-bubble-map__domain-wash')
    .attr('r', board => board.radius)
    .attr('fill', board => `url(#${boardGradientId(board.id)})`)
    .attr('stroke', board => board.color)
    .attr('stroke-opacity', 0.22)
    .attr('stroke-width', 1.1)
    .attr('filter', `url(#${idPrefix}-ink)`)

  outerGroups.append('text')
    .attr('class', 'career-bubble-map__domain-label')
    .attr('text-anchor', 'middle')
    .attr('y', board => -board.radius - 10)
    .attr('fill', board => board.color)
    .text(board => board.name)

  outerGroups.append('text')
    .attr('class', 'career-bubble-map__domain-count')
    .attr('text-anchor', 'middle')
    .attr('y', board => -board.radius + 19)
    .text(board => `${board.skills.length} 项能力`)

  const linkLayer = root.append('g').attr('class', 'career-bubble-map__links')
  // The relation layer stays quiet until a bubble is focused.
  linkLayer.attr('aria-hidden', 'true')

  boardViews.forEach(board => {
    const innerLimit = Math.max(18, board.radius - Math.max(...board.skills.map(skill => skill.radius)) - 18)
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    board.skills.forEach((skill, index) => {
      const distance = innerLimit * Math.sqrt((index + 0.5) / board.skills.length) * 0.78
      const angle = index * goldenAngle + hash(skill.id) * 0.00001
      skill.x = Math.cos(angle) * distance
      skill.y = Math.sin(angle) * distance
    })

    const boundaryForce = () => {
      board.skills.forEach(skill => {
        const distance = Math.hypot(skill.x ?? 0, skill.y ?? 0)
        const limit = board.radius - skill.radius - 15
        if (distance <= limit || distance === 0) return
        const ratio = limit / distance
        skill.x = (skill.x ?? 0) * ratio
        skill.y = (skill.y ?? 0) * ratio
      })
    }

    const simulation = d3.forceSimulation(board.skills)
      .force('collide', d3.forceCollide<BubbleSkill>(skill => skill.radius + 2).iterations(3))
      .force('x', d3.forceX<BubbleSkill>(0).strength(0.065))
      .force('y', d3.forceY<BubbleSkill>(0).strength(0.065))
      .force('boundary', boundaryForce)
      .stop()
    simulation.tick(160)
    boundaryForce()

    const boardGroup = root.append('g')
      .attr('class', 'career-bubble-map__skills')
      .attr('transform', `translate(${board.x},${board.y})`)

    const skillGroups = boardGroup.selectAll<SVGGElement, BubbleSkill>('g.career-bubble-map__skill')
      .data(board.skills, skill => skill.id)
      .enter()
      .append('g')
      .attr('class', 'career-bubble-map__skill')
      .attr('data-node-id', skill => skill.id)
      .attr('transform', skill => {
        const x = skill.x ?? 0
        const y = skill.y ?? 0
        pointLocations.set(skill.id, [board.x + x, board.y + y])
        return `translate(${x},${y})`
      })
      .style('cursor', 'pointer')

    skillGroups.append('circle')
      .attr('class', 'career-bubble-map__skill-glow')
      .attr('r', skill => skill.radius + 3)
      .attr('fill', board.color)
      .attr('filter', `url(#${idPrefix}-glow)`)

    skillGroups.append('circle')
      .attr('class', 'career-bubble-map__skill-body')
      .attr('r', skill => skill.radius)
      .attr('fill', `url(#${skillGradientId(board.id)})`)
      .attr('filter', `url(#${idPrefix}-ink)`)

    skillGroups.append('text')
      .attr('class', 'career-bubble-map__skill-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('pointer-events', 'none')
      .attr('font-size', skill => {
        const latin = /^[A-Za-z0-9.+/# -]+$/.test(skill.name)
        const base = latin ? skill.radius * 0.38 : skill.radius * 0.39
        const fit = latin ? (skill.radius * 1.72) / (skill.name.length * 0.58) : base
        return clamp(Math.min(base, fit), 7.5, latin ? 11 : 11.5)
      })
      .each(function (skill) {
        const text = d3.select(this)
        const fontSize = Number(text.attr('font-size'))
        const lines = labelLines(skill.name, skill.radius)
        if (lines.length === 1) {
          text.text(lines[0] ?? skill.name)
          return
        }
        text.text('')
        const start = -((lines.length - 1) * 0.52)
        lines.forEach((line, index) => {
          text.append('tspan')
            .attr('x', 0)
            .attr('dy', `${index === 0 ? start : 1.04}em`)
            .text(line)
        })
        text.attr('data-font-size', fontSize)
      })

    skillGroups.append('title').text(skill => `${skill.name} · 点击查看关系`)
    addNodeAccessibility(skillGroups, 'skill')
  })

  addNodeAccessibility(outerGroups, 'board')
  root.on('click', (event: MouseEvent) => {
    if (event.target === svg.value) emit('canvas-click')
  })
  updateFocus()
}

watch(() => [props.nodes, props.edges, props.roleName], scheduleDraw, { deep: true })
watch(() => props.selectedNodeId, updateFocus)

onMounted(() => {
  if (!host.value) return
  resizeObserver = new ResizeObserver(scheduleDraw)
  resizeObserver.observe(host.value)
  scheduleDraw()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = 0
  activeSvg = null
})
</script>

<template>
  <div ref="host" class="career-bubble-map" :class="{ 'career-bubble-map--compact': compact }">
    <svg
      ref="svg"
      class="career-bubble-map__svg"
      :style="svgHeight ? { height: `${svgHeight}px` } : undefined"
      role="group"
      :aria-label="`${roleName}职业能力气泡总览`"
    />
    <div v-if="!selectedNodeId" class="career-bubble-map__hint" aria-hidden="true">
      <span class="career-bubble-map__hint-mark"></span>
      悬停看关联 · 点击看详情
    </div>
  </div>
</template>

<style>
.career-bubble-map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 460px;
  overflow: auto;
  background:
    radial-gradient(ellipse at 48% 45%, rgba(255, 255, 255, .76), transparent 68%),
    linear-gradient(135deg, #f7f4ed 0%, #f1eee7 52%, #f8f5ef 100%);
  scrollbar-color: rgba(111, 98, 79, .28) transparent;
  scrollbar-width: thin;
}
.career-bubble-map::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  content: '';
  pointer-events: none;
  opacity: .19;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.24'/%3E%3C/svg%3E");
}
.career-bubble-map__svg {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  min-height: 100%;
  overflow: visible;
}
.career-bubble-map__domain-label {
  font-family: KaiTi, STKaiti, 'Noto Serif SC', serif;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: .12em;
  paint-order: stroke;
  stroke: rgba(247, 244, 237, .86);
  stroke-width: 4px;
  stroke-linejoin: round;
}
.career-bubble-map__domain-count {
  fill: rgba(72, 67, 59, .52);
  font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 9px;
  letter-spacing: .08em;
  pointer-events: none;
}
.career-bubble-map__skill {
  outline: none;
  transition: opacity .2s ease;
}
.career-bubble-map__skill-body,
.career-bubble-map__skill-glow {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform .22s ease, opacity .22s ease;
}
.career-bubble-map__skill-glow { opacity: .31; }
.career-bubble-map__skill-label {
  fill: rgba(255, 255, 255, .97);
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-weight: 650;
  letter-spacing: .01em;
  paint-order: stroke;
  stroke: rgba(80, 50, 38, .12);
  stroke-width: 1.2px;
  stroke-linejoin: round;
  text-shadow: 0 1px 5px rgba(40, 27, 19, .16);
}
.career-bubble-map__skill:hover .career-bubble-map__skill-body,
.career-bubble-map__skill:focus-visible .career-bubble-map__skill-body,
.career-bubble-map__skill.is-selected .career-bubble-map__skill-body { transform: scale(1.09); }
.career-bubble-map__skill:hover .career-bubble-map__skill-glow,
.career-bubble-map__skill:focus-visible .career-bubble-map__skill-glow,
.career-bubble-map__skill.is-selected .career-bubble-map__skill-glow { opacity: .76; transform: scale(1.35); }
.career-bubble-map__skill:focus-visible .career-bubble-map__skill-body { stroke: rgba(255, 255, 255, .9); stroke-width: 2px; }
.career-bubble-map__skill.is-muted { opacity: .24; }
.career-bubble-map__skill.is-related .career-bubble-map__skill-glow { opacity: .56; }
.career-bubble-map__board { cursor: pointer; outline: none; }
.career-bubble-map__board .career-bubble-map__domain-wash { transition: stroke-opacity .2s ease, stroke-width .2s ease; }
.career-bubble-map__board:hover .career-bubble-map__domain-wash,
.career-bubble-map__board:focus-visible .career-bubble-map__domain-wash,
.career-bubble-map__board.is-selected .career-bubble-map__domain-wash {
  stroke-opacity: .48;
  stroke-width: 1.8px;
}
.career-bubble-map__board.is-muted { opacity: .45; }
.career-bubble-map__hint {
  position: absolute;
  top: 52px;
  left: 18px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid rgba(124, 111, 92, .14);
  background: rgba(250, 248, 243, .72);
  color: rgba(74, 69, 61, .66);
  font-size: 10px;
  letter-spacing: .04em;
  backdrop-filter: blur(8px);
  pointer-events: none;
}
.career-bubble-map__hint-mark {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #be2a00;
  box-shadow: 0 0 9px rgba(190, 42, 0, .38);
}
@media (max-width: 767px) {
  .career-bubble-map { min-height: 360px; }
  .career-bubble-map__domain-label { font-size: 14px; }
  .career-bubble-map__hint { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .career-bubble-map__skill,
  .career-bubble-map__skill-body,
  .career-bubble-map__skill-glow,
  .career-bubble-map__board .career-bubble-map__domain-wash { transition: none; }
}
</style>
