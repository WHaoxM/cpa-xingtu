<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import * as d3 from 'd3'
import {
  GROUP_COLORS,
  GROUP_LABELS,
  RELATION_STYLES,
  type AbilityEdge,
  type AbilityNode,
} from '@/composables/useAbilityGraph'

defineOptions({ name: 'CareerAbilityBubbleMap' })

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
  groupName: string
  radius: number
  x: number
  y: number
}

interface BubbleBoard {
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
const idPrefix = 'career-bubble-' + useId().replace(/[^A-Za-z0-9_-]/g, '')
let resizeObserver: ResizeObserver | null = null
let resizeFrame = 0
let hoveredNodeId: string | null = null
let activeSvg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null
let mapLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null
let pointLocations = new Map<string, [number, number]>()
const rolePositions = new Map<string, Map<string, [number, number]>>()
const roleTransforms = new Map<string, d3.ZoomTransform>()
let activeRole = ''
let nodePositions = new Map<string, [number, number]>()
let currentTransform = d3.zoomIdentity
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let renderWidth = 0
let renderHeight = 0
let suppressClickUntil = 0

function hash(value: string): number {
  let result = 2166136261
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619)
  return result >>> 0
}

function boardGradientId(id: string): string {
  return idPrefix + '-board-' + id.replace(/[^A-Za-z0-9_-]/g, '-')
}

function skillGradientId(id: string): string {
  return idPrefix + '-skill-' + id.replace(/[^A-Za-z0-9_-]/g, '-')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function labelLines(name: string, radius: number, isCompact: boolean): string[] {
  const normalized = name.trim()
  if (normalized.includes('/')) {
    const [left = '', right = ''] = normalized.split(/\s*\/\s*/, 2)
    return [left.trim() + ' /', right.trim()].filter(Boolean)
  }
  if (/^[A-Za-z0-9.+# -]+$/.test(normalized)) {
    const words = normalized.split(/\s+/).filter(Boolean)
    if (words.length > 1) return words.slice(0, 3)
    return [normalized]
  }
  const maxChars = Math.max(3, Math.floor(radius / (isCompact ? 6.1 : 6.7)))
  const lines: string[] = []
  const mixedSegments = normalized.match(/[A-Za-z0-9.+#]+|[\u3400-\u9fff]+/g)
  if (/[A-Za-z]/.test(normalized) && /[\u3400-\u9fff]/.test(normalized) && mixedSegments) {
    for (const segment of mixedSegments) {
      if (!/[\u3400-\u9fff]/.test(segment)) {
        lines.push(segment)
      } else {
        const chars = Array.from(segment)
        for (let index = 0; index < chars.length; index += maxChars) {
          lines.push(chars.slice(index, index + maxChars).join(''))
        }
      }
    }
    return lines.slice(0, 3)
  }
  if (/\s/.test(normalized)) {
    for (const token of normalized.split(/\s+/).filter(Boolean)) {
      if (!/[\u3400-\u9fff]/.test(token)) {
        lines.push(token)
      } else {
        const chars = Array.from(token)
        for (let index = 0; index < chars.length; index += maxChars) {
          lines.push(chars.slice(index, index + maxChars).join(''))
        }
      }
    }
    return lines.slice(0, 3)
  }
  let current = ''
  for (const char of Array.from(normalized)) {
    if (/\s/.test(char) && !current) continue
    if (current.length >= maxChars && !/\s/.test(char)) {
      lines.push(current.trim())
      current = ''
    }
    current += char
    if (/\s/.test(char) && current.length >= maxChars - 1) {
      lines.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) lines.push(current.trim())
  return lines.slice(0, 3)
}

function labelRadius(name: string, isCompact: boolean): number {
  const normalized = name.trim()
  let maxLineUnits = 0
  if (normalized.includes('/')) {
    const [left = '', right = ''] = normalized.split(/\s*\/\s*/, 2)
    maxLineUnits = Math.max(left.length + 1, right.length)
  } else if (/^[A-Za-z0-9.+# -]+$/.test(normalized)) {
    maxLineUnits = Math.max(...normalized.split(/\s+/).map(word => word.length))
  } else {
    maxLineUnits = Math.min(4, Array.from(normalized.replace(/\s/g, '')).length)
  }
  const base = isCompact ? 21 : 24
  return clamp(base + Math.max(0, maxLineUnits - 5) * (isCompact ? 1.45 : 1.65), base, isCompact ? 34 : 38)
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
    related.add(edge.source === focusId ? edge.target : edge.source)
    return true
  })
  return { related, edges }
}

function saveCurrentRoleState() {
  if (!activeRole) return
  rolePositions.set(activeRole, nodePositions)
  roleTransforms.set(activeRole, currentTransform)
}

function activateRoleState() {
  if (activeRole === props.roleName) return
  saveCurrentRoleState()
  activeRole = props.roleName
  nodePositions = rolePositions.get(activeRole) ?? new Map()
  currentTransform = roleTransforms.get(activeRole) ?? d3.zoomIdentity
}

function clearChart() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = 0
  pointLocations = new Map()
  activeSvg = null
  mapLayer = null
  zoomBehavior = null
  if (svg.value) d3.select(svg.value).selectAll('*').remove()
}

function scheduleDraw() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0
    draw()
  })
}

function addSkillAccessibility(selection: d3.Selection<SVGGElement, BubbleSkill, any, any>) {
  selection
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', skill => skill.name + '，' + skill.groupName + '，按回车查看详情，也可拖动调整位置')
    .on('click', (event: MouseEvent, skill) => {
      event.stopPropagation()
      if (Date.now() < suppressClickUntil) return
      emit('node-click', skill.id)
    })
    .on('keydown', (event: KeyboardEvent, skill) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      emit('node-click', skill.id)
    })
    .on('mouseenter', (_event, skill) => {
      hoveredNodeId = skill.id
      updateFocus()
    })
    .on('mouseleave', () => {
      hoveredNodeId = null
      updateFocus()
    })
}

function updateFocus() {
  if (!activeSvg || !mapLayer) return
  const focusId = hoveredNodeId || props.selectedNodeId
  const { related, edges } = focusRelations(focusId)
  const hasFocus = Boolean(focusId)

  mapLayer.selectAll<SVGGElement, BubbleSkill>('g.career-bubble-map__skill')
    .classed('is-selected', skill => skill.id === focusId)
    .classed('is-related', skill => related.has(skill.id))
    .classed('is-muted', skill => hasFocus && skill.id !== focusId && !related.has(skill.id))

  mapLayer.selectAll<SVGGElement, BubbleBoard>('g.career-bubble-map__board')
    .classed('is-muted', board => hasFocus && !board.skills.some(skill => skill.id === focusId || related.has(skill.id)))

  const linkData = edges
    .map(edge => {
      const start = pointLocations.get(edge.source)
      const end = pointLocations.get(edge.target)
      return start && end ? { edge, start, end } : null
    })
    .filter((item): item is { edge: AbilityEdge; start: [number, number]; end: [number, number] } => item !== null)

  const linkLayer = mapLayer.select<SVGGElement>('g.career-bubble-map__links')
  linkLayer.selectAll<SVGPathElement, typeof linkData[number]>('path')
    .data(linkData, item => item.edge.source + ':' + item.edge.relation + ':' + item.edge.target)
    .join('path')
    .attr('d', item => {
      const [x1, y1] = item.start
      const [x2, y2] = item.end
      const dx = x2 - x1
      const dy = y2 - y1
      const bend = Math.min(44, Math.hypot(dx, dy) * 0.14)
      const sign = (hash(item.edge.source + ':' + item.edge.target) % 2) ? 1 : -1
      const distance = Math.hypot(dx, dy) || 1
      const mx = (x1 + x2) / 2 - (dy / distance) * bend * sign
      const my = (y1 + y2) / 2 + (dx / distance) * bend * sign
      return 'M' + x1 + ',' + y1 + ' Q' + mx + ',' + my + ' ' + x2 + ',' + y2
    })
    .attr('fill', 'none')
    .attr('stroke', item => RELATION_STYLES[item.edge.relation].color)
    .attr('stroke-width', 1.8)
    .attr('stroke-dasharray', item => RELATION_STYLES[item.edge.relation].dash.join(' '))
    .attr('opacity', 0.68)
    .attr('pointer-events', 'none')
}

function clampSkillToBoard(skill: BubbleSkill, radius: number) {
  const limit = Math.max(0, radius - skill.radius - 13)
  const distance = Math.hypot(skill.x, skill.y)
  if (distance <= limit || distance === 0) return
  const ratio = limit / distance
  skill.x *= ratio
  skill.y *= ratio
}

/** Keep the dragged bubble pinned while redistributing nearby bubbles inside its fixed category. */
function settleCollisions(skills: BubbleSkill[], pinned: BubbleSkill | null, boardRadius: number) {
  for (let pass = 0; pass < 36; pass += 1) {
    let changed = false
    for (let leftIndex = 0; leftIndex < skills.length; leftIndex += 1) {
      const left = skills[leftIndex]
      if (!left) continue
      for (let rightIndex = leftIndex + 1; rightIndex < skills.length; rightIndex += 1) {
        const right = skills[rightIndex]
        if (!right) continue
        let dx = right.x - left.x
        let dy = right.y - left.y
        let distance = Math.hypot(dx, dy)
        const minimum = left.radius + right.radius + 4
        if (distance >= minimum) continue
        if (distance < 0.01) {
          const angle = (hash(left.id + right.id) % 360) * Math.PI / 180
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          distance = 1
        }
        const overlap = minimum - distance
        const ux = dx / distance
        const uy = dy / distance
        if (left === pinned) {
          right.x += ux * overlap
          right.y += uy * overlap
        } else if (right === pinned) {
          left.x -= ux * overlap
          left.y -= uy * overlap
        } else {
          left.x -= ux * overlap * 0.5
          left.y -= uy * overlap * 0.5
          right.x += ux * overlap * 0.5
          right.y += uy * overlap * 0.5
        }
        clampSkillToBoard(left, boardRadius)
        clampSkillToBoard(right, boardRadius)
        changed = true
      }
    }
    if (!changed) break
  }
}

function renderSkillPositions(board: BubbleBoard, boardGroup: d3.Selection<SVGGElement, unknown, null, undefined>) {
  boardGroup.selectAll<SVGGElement, BubbleSkill>('g.career-bubble-map__skill')
    .attr('transform', skill => {
      pointLocations.set(skill.id, [board.x + skill.x, board.y + skill.y])
      return 'translate(' + skill.x + ',' + skill.y + ')'
    })
}

function draw() {
  if (!host.value || !svg.value) return
  const width = host.value.clientWidth
  if (width < 100) return
  activateRoleState()
  const availableHeight = Math.max(380, host.value.clientHeight)
  const isCompact = width < 690
  compact.value = isCompact

  const boards = boardNodes().map(board => ({ board, childNodes: skillsFor(board.id) }))
    .filter(item => item.childNodes.length > 0)
  if (!boards.length) {
    clearChart()
    return
  }

  const boardViews: BubbleBoard[] = boards.map(({ board, childNodes }) => {
    const skills: BubbleSkill[] = childNodes.map(skill => ({
      id: skill.id,
      name: skill.name,
      parentId: board.id,
      color: GROUP_COLORS[board.group],
      groupName: GROUP_LABELS[board.group],
      radius: labelRadius(skill.name, isCompact),
      x: 0,
      y: 0,
    }))
    const maxBubbleRadius = Math.max(...skills.map(skill => skill.radius))
    const required = Math.sqrt(skills.reduce((sum, skill) => sum + (skill.radius + 3) ** 2, 0) / 0.72)
      + maxBubbleRadius + 12
    const radius = clamp(required, isCompact ? 108 : 120, isCompact ? 162 : 180)
    return {
      id: board.id,
      name: board.name,
      color: GROUP_COLORS[board.group],
      radius,
      skills,
      x: 0,
      y: 0,
    }
  })

  const columnCount = isCompact ? 1 : 2
  const rowCount = Math.ceil(boardViews.length / columnCount)
  const rowRadius = Array.from({ length: rowCount }, (_, row) =>
    Math.max(...boardViews.slice(row * columnCount, (row + 1) * columnCount).map(board => board.radius)))
  const rowPitch = rowRadius.map(radius => radius * 2 + 58)
  const topInset = 96
  const contentHeight = topInset + rowPitch.reduce((sum, value) => sum + value, 0) + 12
  const height = isCompact ? Math.max(availableHeight, contentHeight) : Math.max(availableHeight, contentHeight)
  svgHeight.value = height
  renderWidth = width
  renderHeight = height

  let rowTop = topInset
  boardViews.forEach((board, index) => {
    const row = Math.floor(index / columnCount)
    const column = index % columnCount
    const radius = rowRadius[row] ?? board.radius
    board.x = isCompact ? width / 2 : width * (column === 0 ? 0.27 : 0.73)
    board.y = rowTop + radius
    if (column === columnCount - 1 || index === boardViews.length - 1) rowTop += rowPitch[row] ?? radius * 2 + 58
  })

  const root = d3.select(svg.value)
  root.selectAll('*').remove()
  root.attr('viewBox', '0 0 ' + width + ' ' + height)
    .attr('preserveAspectRatio', 'xMidYMin meet')
    .attr('width', width)
    .attr('height', height)
    .style('height', isCompact ? height + 'px' : '100%')
  activeSvg = root
  pointLocations = new Map()

  const defs = root.append('defs')
  const glowFilter = defs.append('filter')
    .attr('id', idPrefix + '-glow')
    .attr('x', '-75%').attr('y', '-75%').attr('width', '250%').attr('height', '250%')
  glowFilter.append('feGaussianBlur').attr('stdDeviation', 7)

  boardViews.forEach(board => {
    const outerGradient = defs.append('radialGradient')
      .attr('id', boardGradientId(board.id))
      .attr('cx', '50%').attr('cy', '46%').attr('r', '62%')
    outerGradient.append('stop').attr('offset', '0%').attr('stop-color', board.color).attr('stop-opacity', 0.015)
    outerGradient.append('stop').attr('offset', '76%').attr('stop-color', board.color).attr('stop-opacity', 0.055)
    outerGradient.append('stop').attr('offset', '100%').attr('stop-color', board.color).attr('stop-opacity', 0.13)

    const innerGradient = defs.append('radialGradient')
      .attr('id', skillGradientId(board.id))
      .attr('cx', '42%').attr('cy', '36%').attr('r', '76%')
    innerGradient.append('stop').attr('offset', '0%').attr('stop-color', board.color).attr('stop-opacity', 0.98)
    innerGradient.append('stop').attr('offset', '58%').attr('stop-color', board.color).attr('stop-opacity', 0.89)
    innerGradient.append('stop').attr('offset', '100%').attr('stop-color', board.color).attr('stop-opacity', 0.70)
  })

  const background = root.append('rect')
    .attr('class', 'career-bubble-map__background')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'transparent')
  background.lower()
  mapLayer = root.append('g').attr('class', 'career-bubble-map__world')

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.58, 2.4])
    .extent([[0, 0], [width, height]])
    .translateExtent([[-width * 0.6, -height * 0.6], [width * 1.6, height * 1.6]])
    .filter(event => {
      if (event.type === 'wheel') return true
      if (event.type === 'touchstart' || event.type === 'touchmove') return (event.touches?.length ?? 0) >= 2
      return event.type === 'mousedown' && event.button === 0
    })
    .on('zoom', event => {
      currentTransform = event.transform
      roleTransforms.set(activeRole, currentTransform)
      mapLayer?.attr('transform', event.transform.toString())
    })
  zoomBehavior = zoom
  root.call(zoom)
    .on('dblclick.zoom', null)
    .call(zoom.transform, currentTransform)
  mapLayer.attr('transform', currentTransform.toString())

  const outerGroups = mapLayer.selectAll<SVGGElement, BubbleBoard>('g.career-bubble-map__board')
    .data(boardViews, board => board.id)
    .enter()
    .append('g')
    .attr('class', 'career-bubble-map__board')
    .attr('transform', board => 'translate(' + board.x + ',' + board.y + ')')

  outerGroups.append('circle')
    .attr('class', 'career-bubble-map__domain-wash')
    .attr('r', board => board.radius)
    .attr('fill', board => 'url(#' + boardGradientId(board.id) + ')')
    .attr('stroke', board => board.color)
    .attr('stroke-opacity', 0.28)
    .attr('stroke-width', 1.25)

  outerGroups.append('text')
    .attr('class', 'career-bubble-map__domain-label')
    .attr('text-anchor', 'middle')
    .attr('y', board => -board.radius - 27)
    .attr('fill', board => board.color)
    .text(board => board.name)

  outerGroups.append('text')
    .attr('class', 'career-bubble-map__domain-count')
    .attr('text-anchor', 'middle')
    .attr('y', board => -board.radius - 9)
    .text(board => board.skills.length + ' 项能力')

  mapLayer.append('g').attr('class', 'career-bubble-map__links').attr('aria-hidden', 'true')

  boardViews.forEach(board => {
    const maxSkillRadius = Math.max(...board.skills.map(skill => skill.radius))
    const innerLimit = Math.max(20, board.radius - maxSkillRadius - 13)
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    board.skills.forEach((skill, index) => {
      const saved = nodePositions.get(skill.id)
      if (saved) {
        skill.x = saved[0]
        skill.y = saved[1]
        clampSkillToBoard(skill, board.radius)
      } else {
        const distance = innerLimit * Math.sqrt((index + 0.5) / board.skills.length) * 0.78
        const angle = index * goldenAngle + hash(skill.id) * 0.00001
        skill.x = Math.cos(angle) * distance
        skill.y = Math.sin(angle) * distance
      }
    })

    const simulation = d3.forceSimulation(board.skills)
      .force('collide', d3.forceCollide<BubbleSkill>(skill => skill.radius + 3).iterations(4))
      .force('x', d3.forceX<BubbleSkill>(skill => {
        const saved = nodePositions.get(skill.id)
        return saved ? saved[0] : 0
      }).strength(skill => nodePositions.has(skill.id) ? 0.28 : 0.045))
      .force('y', d3.forceY<BubbleSkill>(skill => {
        const saved = nodePositions.get(skill.id)
        return saved ? saved[1] : 0
      }).strength(skill => nodePositions.has(skill.id) ? 0.28 : 0.045))
      .force('boundary', () => board.skills.forEach(skill => clampSkillToBoard(skill, board.radius)))
      .stop()
    simulation.tick(nodePositions.size ? 80 : 220)
    board.skills.forEach(skill => clampSkillToBoard(skill, board.radius))
    settleCollisions(board.skills, null, board.radius)

    const boardGroup = root.select<SVGGElement>('g.career-bubble-map__world').append('g')
      .attr('class', 'career-bubble-map__skills')
      .attr('transform', 'translate(' + board.x + ',' + board.y + ')')

    const skillGroups = boardGroup.selectAll<SVGGElement, BubbleSkill>('g.career-bubble-map__skill')
      .data(board.skills, skill => skill.id)
      .enter()
      .append('g')
      .attr('class', 'career-bubble-map__skill')
      .attr('data-node-id', skill => skill.id)
      .attr('transform', skill => {
        pointLocations.set(skill.id, [board.x + skill.x, board.y + skill.y])
        nodePositions.set(skill.id, [skill.x, skill.y])
        return 'translate(' + skill.x + ',' + skill.y + ')'
      })
      .style('cursor', 'grab')

    skillGroups.append('circle')
      .attr('class', 'career-bubble-map__skill-glow')
      .attr('r', skill => skill.radius + 4)
      .attr('fill', board.color)
      .attr('filter', 'url(#' + idPrefix + '-glow)')

    skillGroups.append('circle')
      .attr('class', 'career-bubble-map__skill-body')
      .attr('r', skill => skill.radius)
      .attr('fill', 'url(#' + skillGradientId(board.id) + ')')
      .attr('stroke', board.color)
      .attr('stroke-opacity', 0.30)
      .attr('stroke-width', 1)

    skillGroups.append('text')
      .attr('class', 'career-bubble-map__skill-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('pointer-events', 'none')
      .attr('font-size', skill => {
        const lines = labelLines(skill.name, skill.radius, isCompact)
        const maxUnits = Math.max(...lines.map(line => Array.from(line).reduce((sum, char) =>
          sum + (/[A-Za-z0-9.+#]/.test(char) ? 0.58 : /\s/.test(char) ? 0.34 : 1), 0)))
        const preferred = isCompact ? 11.5 : 13
        const widthFit = (skill.radius * 1.68 - 8) / Math.max(1, maxUnits * (isCompact ? 10.5 : 11.2))
        const heightFit = (skill.radius * 1.55) / Math.max(1, lines.length * (isCompact ? 10.5 : 11.2))
        return clamp(Math.min(preferred, widthFit, heightFit), isCompact ? 9 : 10, preferred)
      })
      .each(function (skill) {
        const text = d3.select(this)
        const lines = labelLines(skill.name, skill.radius, isCompact)
        if (lines.length === 1) {
          text.text(lines[0] ?? skill.name)
          return
        }
        const start = -((lines.length - 1) * 0.52)
        lines.forEach((line, index) => {
          text.append('tspan')
            .attr('x', 0)
            .attr('dy', (index === 0 ? start : 1.04) + 'em')
            .text(line)
        })
      })

    skillGroups.append('title').text(skill => skill.name + ' · 点击查看详情')
    addSkillAccessibility(skillGroups)

    const drag = d3.drag<SVGGElement, BubbleSkill>()
      .container(() => boardGroup.node() as SVGGElement)
      .clickDistance(5)
      .on('start', (event, skill) => {
        event.sourceEvent?.stopPropagation()
        suppressClickUntil = Date.now() + 220
        skillGroups.filter(item => item.id === skill.id).raise().style('cursor', 'grabbing')
      })
      .on('drag', (event, skill) => {
        event.sourceEvent?.stopPropagation()
        skill.x = event.x
        skill.y = event.y
        clampSkillToBoard(skill, board.radius)
        settleCollisions(board.skills, skill, board.radius)
        renderSkillPositions(board, boardGroup)
        board.skills.forEach(item => nodePositions.set(item.id, [item.x, item.y]))
        updateFocus()
      })
      .on('end', (_event, skill) => {
        skillGroups.filter(item => item.id === skill.id).style('cursor', 'grab')
        board.skills.forEach(item => nodePositions.set(item.id, [item.x, item.y]))
        rolePositions.set(activeRole, nodePositions)
      })
    skillGroups.call(drag)
  })

  root.on('click', (event: MouseEvent) => {
    if (Date.now() < suppressClickUntil) return
    if (event.target === svg.value || (event.target as Element | null)?.classList?.contains('career-bubble-map__background')) {
      emit('canvas-click')
    }
  })
  updateFocus()
}

function focusNode(id: string) {
  const point = pointLocations.get(id)
  if (!point || !activeSvg || !zoomBehavior) return
  const scale = Math.min(1.7, Math.max(1.08, currentTransform.k))
  const transform = d3.zoomIdentity
    .translate(renderWidth / 2 - point[0] * scale, renderHeight / 2 - point[1] * scale)
    .scale(scale)
  currentTransform = transform
  activeSvg.transition()
    .duration(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260)
    .call(zoomBehavior.transform, transform)
}

function resetView() {
  nodePositions.clear()
  rolePositions.delete(props.roleName)
  currentTransform = d3.zoomIdentity
  roleTransforms.delete(props.roleName)
  scheduleDraw()
}

defineExpose({ focusNode, resetView })

watch(() => [props.nodes, props.edges, props.roleName], scheduleDraw, { deep: true })
watch(() => props.selectedNodeId, updateFocus)

onMounted(() => {
  if (!host.value) return
  resizeObserver = new ResizeObserver(scheduleDraw)
  resizeObserver.observe(host.value)
  scheduleDraw()
})

onBeforeUnmount(() => {
  saveCurrentRoleState()
  resizeObserver?.disconnect()
  resizeObserver = null
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = 0
  activeSvg = null
  mapLayer = null
})
</script>

<template>
  <div ref="host" class="career-bubble-map" :class="{ 'career-bubble-map--compact': compact }">
    <svg
      ref="svg"
      class="career-bubble-map__svg"
      :style="svgHeight ? { height: compact ? svgHeight + 'px' : '100%' } : undefined"
      role="group"
      :aria-label="roleName + '职业能力气泡总览'"
    />
    <div v-if="!selectedNodeId" class="career-bubble-map__hint" aria-hidden="true">
      <span class="career-bubble-map__hint-mark"></span>
      拖动气泡微调 · 悬停看关联
    </div>
  </div>
</template>

<style>
.career-bubble-map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 380px;
  overflow: auto;
  background:
    radial-gradient(ellipse at 48% 45%, rgba(255, 255, 255, .84), transparent 68%),
    linear-gradient(135deg, #f7f4ed 0%, #f1eee7 52%, #f8f5ef 100%);
  scrollbar-color: rgba(111, 98, 79, .28) transparent;
  scrollbar-width: thin;
}
.career-bubble-map__svg {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  min-height: 100%;
  overflow: visible;
  cursor: grab;
  touch-action: pan-y pinch-zoom;
}
.career-bubble-map__svg:active { cursor: grabbing; }
.career-bubble-map__domain-label {
  font-family: KaiTi, STKaiti, 'Noto Serif SC', serif;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: .10em;
  paint-order: stroke;
  stroke: rgba(247, 244, 237, .96);
  stroke-width: 4px;
  stroke-linejoin: round;
}
.career-bubble-map__domain-count {
  fill: rgba(57, 53, 47, .80);
  font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .06em;
  pointer-events: none;
}
.career-bubble-map__skill {
  outline: none;
  transition: opacity .18s ease;
}
.career-bubble-map__skill-body,
.career-bubble-map__skill-glow {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform .18s ease, opacity .18s ease;
}
.career-bubble-map__skill-glow { opacity: .26; }
.career-bubble-map__skill-label {
  fill: #fff;
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-weight: 700;
  letter-spacing: 0;
  paint-order: stroke;
  stroke: rgba(35, 29, 25, .42);
  stroke-width: 1.35px;
  stroke-linejoin: round;
  text-shadow: 0 1px 5px rgba(30, 23, 18, .3);
}
.career-bubble-map__skill:hover .career-bubble-map__skill-body,
.career-bubble-map__skill:focus-visible .career-bubble-map__skill-body,
.career-bubble-map__skill.is-selected .career-bubble-map__skill-body { transform: scale(1.09); }
.career-bubble-map__skill:hover .career-bubble-map__skill-glow,
.career-bubble-map__skill:focus-visible .career-bubble-map__skill-glow,
.career-bubble-map__skill.is-selected .career-bubble-map__skill-glow { opacity: .72; transform: scale(1.34); }
.career-bubble-map__skill:focus-visible .career-bubble-map__skill-body {
  stroke: rgba(255, 255, 255, .98);
  stroke-width: 2.2px;
}
.career-bubble-map__skill.is-muted { opacity: .58; }
.career-bubble-map__skill.is-related .career-bubble-map__skill-glow { opacity: .58; }
.career-bubble-map__board { transition: opacity .18s ease; }
.career-bubble-map__board .career-bubble-map__domain-wash { transition: stroke-opacity .18s ease, stroke-width .18s ease; }
.career-bubble-map__board.is-muted { opacity: .68; }
.career-bubble-map__hint {
  position: absolute;
  top: 56px;
  left: 18px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid rgba(124, 111, 92, .16);
  background: rgba(250, 248, 243, .82);
  color: rgba(61, 56, 48, .82);
  font-size: 11px;
  letter-spacing: .02em;
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
  .career-bubble-map__domain-label { font-size: 15px; }
  .career-bubble-map__hint { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .career-bubble-map__skill,
  .career-bubble-map__skill-body,
  .career-bubble-map__skill-glow,
  .career-bubble-map__board,
  .career-bubble-map__board .career-bubble-map__domain-wash { transition: none; }
}
</style>
