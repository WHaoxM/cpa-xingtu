<script lang="ts">
// 导出颜色常量供 TalentPortrait.vue 同步使用
export const DEFAULT_FLOWER_COLORS: string[] = [
  '#E07055', // 珊瑚红  — 专业技能
  '#4EB0D4', // 晴空蓝  — 证书资质
  '#60C47A', // 翠绿    — 创新能力
  '#D4A83C', // 暖金    — 学习能力
  '#9070C8', // 紫罗兰  — 抗压能力
  '#D4704C', // 橙红    — 沟通能力
  '#3CBAB0', // 青碧    — 实习能力
]
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, nextTick, shallowRef } from 'vue'
import * as d3 from 'd3'
import { gsap } from '@/plugins/gsap'

// 与顶部 <script> 同步（避免自引用）
const DEFAULTS = ['#E07055', '#4EB0D4', '#60C47A', '#D4A83C', '#9070C8', '#D4704C', '#3CBAB0']

const props = defineProps<{
  data: Array<{ axis: string; value: number | null }>
  colors?: string[]
  zoom?: number
}>()

// ── Film Flowers 3 种花瓣路径（去掉有缺陷的 WIDE） ──
const TEARDROP = 'M0 0 C50 50 50 100 0 100 C-50 100 -50 50 0 0'
const DIAMOND  = 'M-35 0 C-25 25 25 25 35 0 C50 25 25 75 0 100 C-25 75 -50 25 -35 0'
const OVAL     = 'M0 0 C50 25 50 75 0 100 C-50 75 -50 25 0 0'

// ── 7 种花形定义 ──
// Bug 修复：沟通能力原为 WIDE scale=0.26（花瓣仅 10px，被花心圆遮住）
//          改为 TEARDROP n=8 scale=0.25 → 花瓣延伸 25px，正常可见
const FLOWER_DEFS = [
  { shape: TEARDROP, n: 5, scale: 0.36 }, // 0 专业技能 — 5瓣樱花
  { shape: OVAL,     n: 6, scale: 0.34 }, // 1 证书资质 — 6瓣圆润
  { shape: DIAMOND,  n: 5, scale: 0.34 }, // 2 创新能力 — 5瓣星形
  { shape: TEARDROP, n: 7, scale: 0.30 }, // 3 学习能力 — 7瓣密生
  { shape: OVAL,     n: 4, scale: 0.40 }, // 4 抗压能力 — 4瓣宽阔
  { shape: TEARDROP, n: 8, scale: 0.25 }, // 5 沟通能力 — 8瓣雏菊（已修复）
  { shape: DIAMOND,  n: 6, scale: 0.34 }, // 6 实习能力 — 6瓣尖星
] as const

const resolvedColors = computed(() =>
  props.colors?.length ? props.colors : DEFAULTS
)

interface Petal {
  rotateDeg: number
  shape: string
  filled: boolean
}
interface FlowerDatum {
  label: string
  line1: string
  line2: string
  score: number | null
  known: boolean
  color: string
  petalScale: number // 分数驱动：高分 → 大花瓣
  centerR: number   // 分数驱动：高分 → 大花心
  petals: Petal[]
}

const flowers = computed<FlowerDatum[]>(() =>
  props.data.map((d, i) => {
    const known = typeof d.value === 'number' && Number.isFinite(d.value)
    const score = known ? Math.max(0, Math.min(100, d.value!)) : null
    const def = FLOWER_DEFS[i % FLOWER_DEFS.length]!
    const filledCount = score === null ? 0 : Math.round(score * def.n / 100)
    // 尺寸系数：分=0 → ×0.50，分=100 → ×1.30
    const sizeF = score === null ? 0.9 : 0.50 + (score / 100) * 0.80
    return {
      label: d.axis,
      line1: d.axis.slice(0, 2),
      line2: d.axis.slice(2) || '',
      score,
      known,
      color: known ? resolvedColors.value[i % resolvedColors.value.length]! : '#84847F',
      petalScale: def.scale * sizeF,
      centerR: score === null ? 15 : 11 + Math.round((score / 100) * 7),
      petals: Array.from({ length: def.n }, (_, p) => ({
        rotateDeg: p * (360 / def.n),
        shape: def.shape,
        filled: p < filledCount,
      })),
    }
  })
)

// ── D3 力仿真（物理花簇布局 + 持续微颤） ──
const CX = 165
const CY = 155

interface SimNode extends d3.SimulationNodeDatum { id: number }

// shallowRef：仿真 tick 高频替换整个数组，浅响应性能更优
const nodePositions = shallowRef<Array<{ x: number; y: number }>>(
  []
)

let simulation: d3.Simulation<SimNode, undefined> | null = null
const svgRef = ref<SVGSVGElement | null>(null)
let gsapCtx: ReturnType<typeof gsap.context> | null = null

onMounted(async () => {
  await nextTick()

  const flowerList = flowers.value
  if (!flowerList.length) return
  // 最高分花朵：作为引力中心锚定在 SVG 中央
  const maxIdx = flowerList.reduce(
    (mi, f, i) => (f.score ?? -1) > (flowerList[mi]!.score ?? -1) ? i : mi, 0
  )
  // 双层碰撞半径
  // hard：花心+4px，保证花心绝对不重叠
  // soft： 18-32px，允许花瓣大量交叠
  const hardRadii = flowerList.map(f => f.centerR + 4)
  const softRadii = flowerList.map(f => f.score === null ? 25 : 18 + (f.score / 100) * 14)

  // 按实际维度数量排布；真实四维画像和演示七维画像共用同一组件。
  const nodes: SimNode[] = [
    { id: 0, x: CX, y: CY },
    ...Array.from({ length: flowerList.length - 1 }, (_, k) => {
      const deg = k * 360 / (flowerList.length - 1)
      const a = (deg * Math.PI) / 180
      return { id: k + 1, x: CX + Math.cos(a) * 55, y: CY + Math.sin(a) * 55 }
    }),
  ]

  // 各朵花独立频率与相位（7朵节奏各异，互不同步）
  const freqs  = nodes.map((_, i) => 0.40 + i * 0.05)
  const phases = nodes.map((_, i) => i * ((Math.PI * 2) / nodes.length))

  simulation = d3
    .forceSimulation(nodes)
    // 双层碰撞：硬层保证花心不重叠，软层允许花瓣大量交叠
    .force('collide-hard', d3.forceCollide<SimNode>(n => hardRadii[n.id] ?? 18).strength(0.95))
    .force('collide-soft', d3.forceCollide<SimNode>(n => softRadii[n.id] ?? 24).strength(0.22))
    // 最高分花朵强锚定在中心
    .force('anchorX', d3.forceX<SimNode>(CX).strength(n => n.id === maxIdx ? 0.35 : 0))
    .force('anchorY', d3.forceY<SimNode>(CY).strength(n => n.id === maxIdx ? 0.35 : 0))
    // 引力聚拢：纯径向吸引，无切向分量，不产生绕圈轨道
    .force('gravity', () => {
      const mx = nodes[maxIdx]?.x ?? CX
      const my = nodes[maxIdx]?.y ?? CY
      nodes.forEach((n) => {
        if (n.id === maxIdx) return
        const dx = mx - (n.x ?? CX)
        const dy = my - (n.y ?? CY)
        const r = Math.sqrt(dx * dx + dy * dy)
        if (r < 1) return
        const s = Math.min(75 / r, 0.22)
        n.vx = (n.vx ?? 0) + (dx / r) * s
        n.vy = (n.vy ?? 0) + (dy / r) * s
      })
    })
    // 共享风力 + 个体湍流：所有花感受同一阵风方向，加上个体细微浮动差异
    .force('wind', () => {
      const t = Date.now() / 1000
      // 主风：缓慢旋转风向（周期 ≈63s）+ 阵风系数
      const wAngle = t * 0.10
      const gust   = 0.75 + 0.25 * Math.abs(Math.sin(t * 0.28))
      const wx = Math.cos(wAngle) * 0.055 * gust  // 水平分量偏强
      const wy = Math.sin(wAngle) * 0.020 * gust  // 垂直分量较弱
      nodes.forEach((n, i) => {
        // 共同风 + 个体湍流叠加
        n.vx = (n.vx ?? 0) + wx + Math.sin(t * freqs[i]! + phases[i]!) * 0.022
        n.vy = (n.vy ?? 0) + wy + Math.cos(t * freqs[i]! * 1.3 + phases[i]!) * 0.022
      })
    })
    .alphaDecay(0.006)
    .alphaTarget(0.07)
    .on('tick', () => {
      nodePositions.value = nodes.map(n => ({ x: n.x ?? CX, y: n.y ?? CY }))
    })

  // GSAP 入场：各花依次从 scale=0 绽放
  if (svgRef.value) {
    gsapCtx = gsap.context(() => {
      gsap.from('.dfc-flower', {
        scale: 0,
        opacity: 0,
        duration: 0.55,
        stagger: 0.09,
        ease: 'back.out(1.4)',
        clearProps: 'opacity',
      })
    }, svgRef.value)
  }
})

onUnmounted(() => {
  simulation?.stop()
  gsapCtx?.revert()
})
</script>

<template>
  <div class="dfc-wrap">
    <svg
      ref="svgRef"
      class="dfc-svg"
      width="100%"
      height="100%"
      viewBox="0 0 330 310"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <!-- 文字投影滤镜 -->
        <filter id="dfc-txt-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.8" stdDeviation="1.2"
            flood-color="rgba(0,0,0,0.70)" flood-opacity="1" />
        </filter>

        <!--
          复合花瓣滤镜（两步合一）：
          步骤1 — 低频噪声叠乘产生颜料深浅分布（非 AI 光晕，是物理颜料纹理）
          步骤2 — 高频噪声微位移让花瓣轮廓有机，摆脱完美几何感
        -->
        <filter id="dfc-organic" color-interpolation-filters="sRGB"
          x="-15%" y="-15%" width="130%" height="130%">
          <!-- 步骤 1：颜料质感 -->
          <feTurbulence type="fractalNoise" baseFrequency="0.09 0.05" numOctaves="3"
            seed="5" result="pigment-raw"/>
          <feColorMatrix type="saturate" values="0" in="pigment-raw" result="gray-p"/>
          <!-- 将噪声偏移到 [0.72, 1.0] 区间，叠乘后花瓣最多暗 28%，模拟颜料浓淡 -->
          <feColorMatrix type="matrix" in="gray-p"
            values="0.28 0 0 0 0.72  0 0.28 0 0 0.72  0 0 0.28 0 0.72  0 0 0 1 0"
            result="pigment"/>
          <feBlend in="SourceGraphic" in2="pigment" mode="multiply" result="textured"/>
          <feComposite in="textured" in2="SourceGraphic" operator="in" result="pg"/>
          <!-- 步骤 2：边缘有机微位移 -->
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="4"
            seed="11" result="edge-noise"/>
          <feDisplacementMap in="pg" in2="edge-noise" scale="0.7"
            xChannelSelector="R" yChannelSelector="G"/>
        </filter>

        <!-- 花瓣渐变：基部透光(0.42) → 中段饱满(0.88) → 尖端收淡(0.55) -->
        <linearGradient
          v-for="(fl, gi) in flowers"
          :key="'grad-' + gi"
          :id="`dfc-grad-${gi}`"
          x1="0.5" y1="0" x2="0.5" y2="1"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0%"   :stop-color="fl.color" stop-opacity="0.42"/>
          <stop offset="42%"  :stop-color="fl.color" stop-opacity="0.88"/>
          <stop offset="100%" :stop-color="fl.color" stop-opacity="0.55"/>
        </linearGradient>
      </defs>

      <!--
        外层 <g> 由力仿真驱动坐标，
        内层 <g class="dfc-flower"> 是 GSAP/hover 的缩放目标
      -->
      <g :transform="`translate(${CX} ${CY}) scale(${props.zoom ?? 1}) translate(${-CX} ${-CY})`">
        <g
          v-for="(flower, i) in flowers"
          :key="flower.label"
          :transform="`translate(${nodePositions[i]?.x ?? CX}, ${nodePositions[i]?.y ?? CY})`"
        >
          <title>{{ flower.label }}：{{ flower.known ? `${flower.score} 分` : '待核对' }}</title>
          <g class="dfc-flower" filter="url(#dfc-organic)">

          <!-- ① 花瓣（Film Flowers 路径，旋转放射排列） -->
          <g
            v-for="(petal, p) in flower.petals"
            :key="'pg' + p"
            :transform="`rotate(${petal.rotateDeg})`"
          >
            <!-- 主花瓣：渐变填充 + 尺寸随分数变化 -->
            <path
              v-if="petal.filled"
              :d="petal.shape"
              :transform="`scale(${flower.petalScale})`"
              :fill="`url(#dfc-grad-${i})`"
              :stroke="flower.color"
              stroke-width="1.5"
              stroke-opacity="0.85"
              stroke-linejoin="round"
            />
            <!-- 中脉高光：压缩至 28%宽，白色右光强化主脉立体感 -->
            <path
              v-if="petal.filled"
              :d="petal.shape"
              :transform="`scale(${flower.petalScale * 0.28}, ${flower.petalScale})`"
              fill="white"
              fill-opacity="0.22"
            />
            <path
              v-else
              :d="petal.shape"
              :transform="`scale(${flower.petalScale})`"
              fill="none"
              :stroke="flower.color"
              stroke-width="1.2"
              stroke-opacity="0.38"
              stroke-linejoin="round"
            />
          </g>

          <!-- ② 花心底圆（半径随分数变化） -->
          <circle :r="flower.centerR" :fill="flower.color" :fill-opacity="flower.known ? 0.32 : 0.72" />
          <circle :r="flower.centerR" fill="none" :stroke="flower.color" stroke-width="1.3" stroke-opacity="0.58" />

          <!-- ③ 维度名称（默认显示，hover 淡出） -->
          <text
            class="dfc-name"
            text-anchor="middle"
            fill="rgba(255,255,255,0.95)"
            font-size="10"
            font-weight="700"
            filter="url(#dfc-txt-shadow)"
          >
            <tspan x="0" dy="-5">{{ flower.line1 }}</tspan>
            <tspan x="0" dy="12">{{ flower.line2 }}</tspan>
          </text>

          <!-- ④ 得分（hover 淡入） -->
          <text
            class="dfc-score"
            text-anchor="middle"
            dominant-baseline="central"
            fill="rgba(255,255,255,0.97)"
            :font-size="flower.known ? 15 : 10"
            font-weight="700"
            filter="url(#dfc-txt-shadow)"
          >{{ flower.known ? flower.score : '待核对' }}</text>

          </g>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.dfc-wrap {
  width: 100%;
  height: 100%;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dfc-svg {
  overflow: visible;
  max-width: 100%;
  max-height: 100%;
}

/* hover 缩放（transform-box: fill-box 使缩放以花朵中心为原点） */
.dfc-flower {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  cursor: pointer;
}
.dfc-flower:hover {
  transform: scale(1.12);
}

/* 花心名字：默认显示，hover 淡出 */
.dfc-name {
  transition: opacity 0.22s ease;
  pointer-events: none;
}
.dfc-flower:hover .dfc-name {
  opacity: 0;
}

/* 花心得分：默认隐藏，hover 淡入 */
.dfc-score {
  opacity: 0;
  transition: opacity 0.22s ease;
  pointer-events: none;
}
.dfc-flower:hover .dfc-score {
  opacity: 1;
}
</style>
