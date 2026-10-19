<!-- D3 多边形雷达图：双系列对比（个人能力 vs 岗位要求）、轴线 hover 高亮、详细能力浮窗 -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick, computed } from 'vue'
import * as d3 from 'd3'

export interface RadarDatum {
  axis: string
  value: number
  ref?: number
  level?: string
  desc?: string
  agentAnalysis?: string
}

const AXIS_COLORS = [
  '#E8634A', // 朱砂
  '#D4A855', // 御金
  '#5EB36B', // 翠绿
  '#4A90D9', // 蔚蓝
  '#9B6DD7', // 紫藤
  '#E89B5A', // 琥珀
  '#56B4C8', // 青瓷
]

const MY_COLOR = '#E8634A'
const REF_COLOR = '#4A90D9'

const props = withDefaults(defineProps<{
  data: RadarDatum[]
  ghostData?: RadarDatum[]
  width?: number
  height?: number
  margin?: number
  levels?: number
  showLegend?: boolean
  segmentColors?: string[]
}>(), {
  width: 340,
  height: 300,
  margin: 68,
  levels: 5,
  showLegend: true,
})

const wrapRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const tipVisible = ref(false)
const tipX = ref(0)
const tipY = ref(0)
const tipDatum = ref<RadarDatum | null>(null)
const tipColor = ref('#999')
let resizeObs: ResizeObserver | null = null

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v))
}

function getAxisColors(): string[] {
  return props.segmentColors?.length ? props.segmentColors : AXIS_COLORS
}

const hasRef = computed(() => props.data.some(d => d.ref != null))

const tipGapText = computed(() => {
  const d = tipDatum.value
  if (!d || d.ref == null) return ''
  const gap = d.ref - d.value
  if (gap > 15) return `该维度低于岗位要求 ${gap} 分，属于明显短板，建议优先投入时间补齐。`
  if (gap > 5) return `该维度与岗位要求存在 ${gap} 分差距，有一定提升空间，可制定针对性学习计划。`
  if (gap > 0) return `该维度接近岗位要求，仅差 ${gap} 分，稍加巩固即可达标。`
  if (gap === 0) return '该维度已达到岗位要求水平，保持当前状态即可。'
  return `该维度超出岗位要求 ${Math.abs(gap)} 分，是你的竞争优势，可在简历和面试中重点展示。`
})

const tipImproveSuggestion = computed(() => {
  const d = tipDatum.value
  if (!d) return ''
  const gap = d.ref != null ? d.ref - d.value : 0
  if (gap <= 0) return ''
  const MAP: Record<string, string> = {
    '专业技能': gap > 10 ? '系统学习岗位 JD 中的核心技术栈，完成 2 个以上实战项目' : '深化现有技能，阅读源码或完成专项竞赛',
    '证书资质': gap > 10 ? '报考软考中级/职业资格证书，建立证书背书体系' : '考取 1 个与岗位相关的认证（如 CDA/AWS/软考）',
    '创新能力': gap > 10 ? '参与 Hackathon 或开源项目，锻炼从 0 到 1 的产品/技术创新能力' : '在项目中主动提出技术改进建议并落地',
    '学习能力': gap > 10 ? '建立系统化学习体系：输出博客/笔记/读书清单，保持每周输出' : '坚持技术输出，月均 1 篇博客/分享',
    '抗压能力': gap > 10 ? '主动承担高压项目，锻炼多任务并行管理与时间规划能力' : '在实习或项目中尝试承担交付压力较高的模块',
    '沟通能力': gap > 10 ? '参与技术分享/演讲，锻炼向非技术人员解释复杂问题的能力' : '主动在团队中汇报进展，积累 PPT 与表达经验',
    '实习经验': gap > 10 ? '积极投递实习，目标至少完成 1 段 3 个月以上相关实习经历' : '在现有实习中主动争取核心模块负责机会',
  }
  return MAP[d.axis] ?? (gap > 10 ? '优先投入时间提升该维度，缩小与岗位要求的差距' : '持续积累该维度的实战经验')
})

function draw() {
  const el = svgRef.value
  if (!el) return

  const W = el.clientWidth || props.width
  const H = el.clientHeight || props.height
  const radius = Math.max(24, Math.min(W, H) / 2 - props.margin)

  d3.select(el).selectAll('*').remove()

  const svg = d3.select(el)
    .attr('role', 'img')
    .attr('aria-label', '能力雷达图')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')

  /* ── 宣纸纤维纹理背景 ── */
  const defs = svg.append('defs')

  const feTurb = defs.append('filter').attr('id', 'paper-grain')
  feTurb.append('feTurbulence')
    .attr('type', 'fractalNoise')
    .attr('baseFrequency', '0.65')
    .attr('numOctaves', '4')
    .attr('seed', '2')
    .attr('result', 'noise')
  feTurb.append('feColorMatrix')
    .attr('in', 'noise')
    .attr('type', 'saturate')
    .attr('values', '0')
    .attr('result', 'mono')
  feTurb.append('feComponentTransfer')
    .attr('in', 'mono')
    .append('feFuncA').attr('type', 'linear').attr('slope', '0.08')

  svg.append('rect')
    .attr('width', W).attr('height', H)
    .attr('fill', 'rgba(245,240,230,0.3)')
    .attr('filter', 'url(#paper-grain)')

  const fiberPat = defs.append('pattern')
    .attr('id', 'fiber-pat')
    .attr('width', 20).attr('height', 20)
    .attr('patternUnits', 'userSpaceOnUse')
  const fiberData = [
    { x1: 2, y1: 0, x2: 18, y2: 3 },
    { x1: 0, y1: 12, x2: 14, y2: 15 },
  ]
  fiberData.forEach(d => {
    fiberPat.append('line')
      .attr('x1', d.x1).attr('y1', d.y1)
      .attr('x2', d.x2).attr('y2', d.y2)
      .attr('stroke', 'rgba(139,37,0,0.03)')
      .attr('stroke-width', 0.5)
  })

  svg.append('rect')
    .attr('width', W).attr('height', H)
    .attr('fill', 'url(#fiber-pat)')

  const radGrad = defs.append('radialGradient')
    .attr('id', 'radar-vignette').attr('cx', '50%').attr('cy', '50%').attr('r', '65%')
  radGrad.append('stop').attr('offset', '0%').attr('stop-color', 'transparent')
  radGrad.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(139,37,0,0.035)')
  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#radar-vignette)')

  const root = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`)

  const N = props.data.length
  if (!N) {
    root.append('text')
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--color-text-subtle, #9C8B78)')
      .attr('font-size', 12)
      .text('上传简历后生成')
    return
  }

  const axisColors = getAxisColors()
  const angleSlice = (Math.PI * 2) / N
  const rScale = d3.scaleLinear().domain([0, 100]).range([0, radius])

  /* ── 同心多边形网格环（外圈较深，内圈渐淡）── */
  const levels = props.levels
  for (let lvl = 1; lvl <= levels; lvl++) {
    const r = radius * (lvl / levels)
    const t = lvl / levels
    const ringPts = d3.range(N).map(i => {
      const a = angleSlice * i - Math.PI / 2
      return [r * Math.cos(a), r * Math.sin(a)] as [number, number]
    })
    root.append('polygon')
      .attr('points', ringPts.map(p => p.join(',')).join(' '))
      .attr('fill', lvl === levels ? 'rgba(190,42,0,0.025)' : 'none')
      .attr('stroke', `rgba(190,42,0,${(0.05 + t * 0.1).toFixed(3)})`)
      .attr('stroke-width', lvl === levels ? 1.2 : 0.6)

    if (lvl < levels) {
      const score = Math.round(100 * lvl / levels)
      root.append('text')
        .attr('x', 4)
        .attr('y', -r + 3)
        .attr('font-size', 8)
        .attr('fill', '#75685e')
        .text(String(score))
    }
  }

  /* ── 轴线（从圆心到外圈，用各维度颜色） ── */
  const axisLines: d3.Selection<SVGLineElement, unknown, null, undefined>[] = []
  props.data.forEach((_d, i) => {
    const a = angleSlice * i - Math.PI / 2
    const c = axisColors[i % axisColors.length] ?? '#999'
    const line = root.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', rScale(100) * Math.cos(a))
      .attr('y2', rScale(100) * Math.sin(a))
      .attr('stroke', c)
      .attr('stroke-opacity', 0.18)
      .attr('stroke-width', 1)
      .style('transition', 'stroke-opacity 150ms, stroke-width 150ms')
    axisLines.push(line)
  })

  /* ── 岗位要求多边形（虚线，蓝色系，先画在底层） ── */
  const hasRefData = props.data.some(d => d.ref != null)
  let refPolygon: d3.Selection<SVGPathElement, unknown, null, undefined> | null = null
  let refDots: d3.Selection<SVGCircleElement, unknown, null, undefined>[] = []

  if (hasRefData) {
    const refLineGen = d3.lineRadial<RadarDatum>()
      .angle((_d, i) => angleSlice * i)
      .radius(d => rScale(clamp100(d.ref ?? 0)))
      .curve(d3.curveLinearClosed)

    root.append('path')
      .datum(props.data)
      .attr('d', refLineGen as any)
      .attr('fill', REF_COLOR)
      .attr('fill-opacity', 0.18)
      .attr('stroke', REF_COLOR)
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '7,4')
      .attr('stroke-opacity', 1)

    refPolygon = root.select<SVGPathElement>('path:last-of-type')

    props.data.forEach((d, i) => {
      if (d.ref == null) return
      const a = angleSlice * i - Math.PI / 2
      const r = rScale(clamp100(d.ref))
      const dot = root.append('circle')
        .attr('cx', r * Math.cos(a))
        .attr('cy', r * Math.sin(a))
        .attr('r', 3.5)
        .attr('fill', REF_COLOR)
        .attr('fill-opacity', 1)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.2)
        .attr('stroke-opacity', 0.5)
        .style('transition', 'r 150ms, fill-opacity 150ms')
      refDots.push(dot)
    })
  }

  /* ── 个人能力多边形（实线，红色系） ── */
  const myLineGen = d3.lineRadial<RadarDatum>()
    .angle((_d, i) => angleSlice * i)
    .radius(d => rScale(clamp100(d.value)))
    .curve(d3.curveLinearClosed)

  root.append('path')
    .datum(props.data)
    .attr('d', myLineGen as any)
    .attr('fill', MY_COLOR)
    .attr('fill-opacity', 0.15)
    .attr('stroke', MY_COLOR)
    .attr('stroke-width', 2.2)
    .attr('stroke-opacity', 0.9)

  const myDots: d3.Selection<SVGCircleElement, unknown, null, undefined>[] = []
  props.data.forEach((d, i) => {
    const a = angleSlice * i - Math.PI / 2
    const r = rScale(clamp100(d.value))
    const dot = root.append('circle')
      .attr('cx', r * Math.cos(a))
      .attr('cy', r * Math.sin(a))
      .attr('r', 3.5)
      .attr('fill', MY_COLOR)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.2)
      .attr('stroke-opacity', 0.4)
      .style('transition', 'r 150ms, fill-opacity 150ms')
    myDots.push(dot)
  })

  /* ── 维度标签（最外层，用各维度颜色） ── */
  props.data.forEach((d, i) => {
    const c = axisColors[i % axisColors.length] ?? '#999'
    const a = angleSlice * i - Math.PI / 2
    const labelR = radius + 16
    const lx = labelR * Math.cos(a)
    const ly = labelR * Math.sin(a)
    root.append('text')
      .attr('x', lx).attr('y', ly)
      .attr('text-anchor', Math.abs(lx) < 5 ? 'middle' : lx > 0 ? 'start' : 'end')
      .attr('dominant-baseline', Math.abs(ly) < 5 ? 'middle' : ly > 0 ? 'hanging' : 'auto')
      .attr('font-size', 11)
      .attr('font-weight', '600')
      .attr('fill', c)
      .text(d.axis)
  })

  /* ── 分数标注（我的能力分数，贴近数据点） ── */
  props.data.forEach((d, i) => {
    const a = angleSlice * i - Math.PI / 2
    const val = clamp100(d.value)
    const labelR = rScale(val) + 10
    const lx = labelR * Math.cos(a)
    const ly = labelR * Math.sin(a)
    if (val > 5) {
      root.append('text')
        .attr('x', lx).attr('y', ly)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 9)
        .attr('font-weight', '700')
        .attr('fill', '#8d563f')
        .text(String(val))
    }
  })

  /* ── hover 扇区高亮层（预先插入，hover 时填充） ── */
  const arcGen = d3.arc<{ inner: number; outer: number; start: number; end: number }>()
    .innerRadius(dd => dd.inner)
    .outerRadius(dd => dd.outer)
    .startAngle(dd => dd.start + Math.PI / 2)
    .endAngle(dd => dd.end + Math.PI / 2)

  const sectorHighlights: d3.Selection<SVGPathElement, unknown, null, undefined>[] = []
  props.data.forEach((_d, i) => {
    const a0 = angleSlice * i - Math.PI / 2 - angleSlice / 2
    const a1 = a0 + angleSlice
    const c = axisColors[i % axisColors.length] ?? '#999'
    const hlArc = { inner: 0, outer: radius + 4, start: a0, end: a1 }
    const hl = root.append('path')
      .attr('d', arcGen(hlArc) ?? '')
      .attr('fill', c)
      .attr('fill-opacity', 0)
      .attr('stroke', 'none')
      .style('pointer-events', 'none')
      .style('transition', 'fill-opacity 200ms ease')
    sectorHighlights.push(hl)
  })

  /* ── hover 交互区（每个维度一个透明楔形区域） ── */
  props.data.forEach((d, i) => {
    const c = axisColors[i % axisColors.length] ?? '#999'
    const a0 = angleSlice * i - Math.PI / 2 - angleSlice / 2
    const a1 = a0 + angleSlice

    const hitArc = { inner: 0, outer: radius + 16, start: a0, end: a1 }
    root.append('path')
      .attr('d', arcGen(hitArc) ?? '')
      .attr('fill', 'transparent')
      .attr('stroke', 'none')
      .style('cursor', 'pointer')
      .on('mouseenter', (event: MouseEvent) => {
        /* 扇区高亮 */
        sectorHighlights[i]?.attr('fill-opacity', 0.08)
        /* 轴线加亮 */
        axisLines[i]?.attr('stroke-opacity', 0.7).attr('stroke-width', 2.5)
        /* 数据点放大 */
        myDots[i]?.attr('r', 7).attr('fill-opacity', 1)
        if (refDots[i]) refDots[i]!.attr('r', 6).attr('fill-opacity', 1)
        showTip(event, d, c)
      })
      .on('mousemove', (event: MouseEvent) => {
        moveTip(event)
      })
      .on('mouseleave', () => {
        sectorHighlights[i]?.attr('fill-opacity', 0)
        axisLines[i]?.attr('stroke-opacity', 0.18).attr('stroke-width', 1)
        myDots[i]?.attr('r', 3.5).attr('fill-opacity', 1)
        if (refDots[i]) refDots[i]!.attr('r', 3.5).attr('fill-opacity', 1)
        hideTip()
      })
  })

  /* ── 图例（按调用方配置显示） ── */
  if (props.showLegend) {
    const legendY = radius + 28
    const totalW = hasRefData ? 190 : 80
    const legend = root.append('g').attr('transform', `translate(${-totalW / 2},${legendY})`)

    legend.append('line').attr('x1', 0).attr('y1', 5).attr('x2', 18).attr('y2', 5)
      .attr('stroke', MY_COLOR).attr('stroke-width', 2.5)
    legend.append('circle').attr('cx', 9).attr('cy', 5).attr('r', 3).attr('fill', MY_COLOR)
    legend.append('text').attr('x', 24).attr('y', 5)
      .attr('dominant-baseline', 'middle').attr('font-size', 11).attr('font-weight', '600')
      .attr('fill', MY_COLOR).text('个人能力')

    if (hasRefData) {
      const x2 = 100
      legend.append('line').attr('x1', x2).attr('y1', 5).attr('x2', x2 + 18).attr('y2', 5)
        .attr('stroke', REF_COLOR).attr('stroke-width', 2.5).attr('stroke-dasharray', '7,4')
      legend.append('circle').attr('cx', x2 + 9).attr('cy', 5).attr('r', 3)
        .attr('fill', REF_COLOR)
      legend.append('text').attr('x', x2 + 24).attr('y', 5)
        .attr('dominant-baseline', 'middle').attr('font-size', 11).attr('font-weight', '600')
        .attr('fill', REF_COLOR).text('岗位要求')
    }
  }

  /* ── 入场动画：多边形从 0 半径展开 ── */
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const allPaths = root.selectAll<SVGPathElement, unknown>('path[d]')
      .filter(function () { return (this as SVGPathElement).getAttribute('fill') !== 'transparent' })
    const allCircles = root.selectAll<SVGCircleElement, unknown>('circle')

    allPaths.style('opacity', '0')
    allCircles.style('opacity', '0')

    allPaths.transition().duration(500).ease(d3.easeCubicOut)
      .style('opacity', '1')

    allCircles.transition().delay(300).duration(350).ease(d3.easeCubicOut)
      .style('opacity', '1')
  }
}

/* ── Tooltip 控制 ── */
function showTip(event: MouseEvent, d: RadarDatum, color: string) {
  tipDatum.value = d
  tipColor.value = color
  tipVisible.value = true
  moveTip(event)
}
function moveTip(event: MouseEvent) {
  const pad = 14
  const tipW = 280
  const tipH = 160
  let x = event.clientX + pad
  let y = event.clientY + pad
  if (x + tipW > window.innerWidth) x = event.clientX - tipW - pad
  if (y + tipH > window.innerHeight) y = event.clientY - tipH - pad
  tipX.value = x
  tipY.value = y
}
function hideTip() {
  tipVisible.value = false
}

onMounted(() => {
  nextTick(() => draw())
  resizeObs = new ResizeObserver(() => draw())
  if (svgRef.value?.parentElement) resizeObs.observe(svgRef.value.parentElement)
})

onUnmounted(() => {
  resizeObs?.disconnect()
  hideTip()
})

watch(() => [props.data, props.ghostData, props.levels, props.segmentColors, props.margin, props.showLegend], () => {
  draw()
}, { deep: true })
</script>

<template>
  <div ref="wrapRef" class="d3-radar-wrap">
    <svg ref="svgRef" class="d3-radar" :width="width" :height="height" />
    <Teleport to="body">
      <Transition name="radar-tip">
        <div
          v-if="tipVisible && tipDatum"
          class="d3-radar-tip"
          :style="{ left: tipX + 'px', top: tipY + 'px', '--seg-color': tipColor }"
        >
          <div class="d3-radar-tip__head">
            <span class="d3-radar-tip__axis">{{ tipDatum.axis }}</span>
            <span
              v-if="tipDatum.level"
              class="d3-radar-tip__level"
              :class="`d3-radar-tip__level--${tipDatum.level === '优秀' ? 'good' : tipDatum.level === '良好' ? 'mid' : 'low'}`"
            >{{ tipDatum.level }}</span>
          </div>
          <div class="d3-radar-tip__scores">
            <span>个人能力 <strong>{{ tipDatum.value }}</strong> 分</span>
            <template v-if="tipDatum.ref != null">
              <span class="d3-radar-tip__sep"></span>
              <span>岗位要求 <strong>{{ tipDatum.ref }}</strong> 分</span>
              <span class="d3-radar-tip__gap" :class="{ 'd3-radar-tip__gap--pos': tipDatum.value >= tipDatum.ref }">
                差距 {{ tipDatum.ref - tipDatum.value > 0 ? '-' : '+' }}{{ Math.abs(tipDatum.ref - tipDatum.value) }}
              </span>
            </template>
          </div>
          <p v-if="tipGapText" class="d3-radar-tip__gap-detail">{{ tipGapText }}</p>
          <p class="d3-radar-tip__desc">{{ tipDatum.agentAnalysis || tipDatum.desc || '暂无能力说明' }}</p>
          <div v-if="tipImproveSuggestion" class="d3-radar-tip__improve">
            <span class="d3-radar-tip__improve-label">提升建议</span>
            <span class="d3-radar-tip__improve-text">{{ tipImproveSuggestion }}</span>
          </div>
          <span class="d3-radar-tip__source">
            {{ tipDatum.agentAnalysis ? '-- AI 深度分析' : '-- 基于简历数据' }}
          </span>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.d3-radar-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}
.d3-radar {
  width: 100%;
  height: 100%;
  overflow: visible;
}
</style>

<style>
.d3-radar-tip {
  position: fixed;
  z-index: 99999;
  pointer-events: none;
  min-width: 200px;
  max-width: 300px;
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(14, 8, 3, 0.96);
  border: 1px solid rgba(212, 201, 181, 0.15);
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  font-family: var(--font-title), system-ui, sans-serif;
  color: rgba(220, 205, 185, 0.95);
}
.d3-radar-tip__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.d3-radar-tip__axis {
  font-size: 13px;
  font-weight: 700;
  color: var(--seg-color, #ccc);
}
.d3-radar-tip__level {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 8px;
  letter-spacing: 0.02em;
  font-weight: 600;
}
.d3-radar-tip__level--good {
  background: rgba(80,165,90,0.22);
  color: rgb(100,218,138);
  border: 1px solid rgba(80,165,90,0.48);
}
.d3-radar-tip__level--mid {
  background: rgba(196,150,30,0.18);
  color: rgb(238,200,85);
  border: 1px solid rgba(196,150,30,0.48);
}
.d3-radar-tip__level--low {
  background: rgba(200,60,38,0.15);
  color: rgb(242,108,78);
  border: 1px solid rgba(200,60,38,0.38);
}
.d3-radar-tip__scores {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 0;
  font-size: 11px;
  color: rgba(200, 185, 160, 0.85);
  margin-bottom: 8px;
}
.d3-radar-tip__scores strong {
  color: rgba(240, 225, 200, 1);
  font-weight: 700;
}
.d3-radar-tip__sep {
  display: inline-block;
  width: 1px;
  height: 10px;
  background: rgba(180,160,130,0.25);
  margin: 0 8px;
}
.d3-radar-tip__gap {
  margin-left: 8px;
  font-size: 10px;
  font-weight: 600;
  color: rgb(242,108,78);
}
.d3-radar-tip__gap--pos {
  color: rgb(100,218,138);
}
.d3-radar-tip__gap-detail {
  font-size: 11px;
  line-height: 1.6;
  color: rgba(220, 200, 170, 0.88);
  margin: 0 0 6px;
  padding: 5px 8px;
  background: rgba(190,42,0,0.06);
  border-left: 2px solid var(--seg-color, rgba(190,42,0,0.3));
  border-radius: 0 4px 4px 0;
}
.d3-radar-tip__desc {
  font-size: 11px;
  line-height: 1.65;
  color: rgba(210, 195, 170, 0.92);
  margin: 0 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.d3-radar-tip__improve {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 4px 0 6px;
  padding: 5px 8px;
  background: rgba(100, 160, 80, 0.07);
  border-left: 2px solid rgba(100, 200, 120, 0.35);
  border-radius: 0 4px 4px 0;
}
.d3-radar-tip__improve-label {
  flex-shrink: 0;
  font-size: 9.5px;
  font-weight: 700;
  color: rgba(130, 210, 140, 0.9);
  letter-spacing: 0.04em;
  padding-top: 1px;
}
.d3-radar-tip__improve-text {
  font-size: 10.5px;
  line-height: 1.55;
  color: rgba(195, 215, 185, 0.88);
}
.d3-radar-tip__source {
  display: block;
  font-size: 9px;
  color: rgba(160, 145, 120, 0.55);
  letter-spacing: 0.04em;
  font-style: italic;
}

.radar-tip-enter-active { transition: opacity 0.15s ease-out, transform 0.15s ease-out; }
.radar-tip-leave-active { transition: opacity 0.1s ease-in; }
.radar-tip-enter-from { opacity: 0; transform: translateY(4px); }
.radar-tip-leave-to { opacity: 0; }
</style>
