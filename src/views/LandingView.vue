<!-- 页面：着陆页；路由：/（landing）；角色：PUBLIC -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { gsap } from '@/plugins/gsap'
import CareerStarMap from '@/components/career/CareerStarMap.vue'

const router    = useRouter()
const pageRef   = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const glowRef   = ref<HTMLElement | null>(null)
const mapRef    = ref<HTMLElement | null>(null)
const bgRef     = ref<HTMLElement | null>(null)
const titleRef  = ref<HTMLElement | null>(null)
const ctaRef    = ref<HTMLButtonElement | null>(null)
const activeDemoTab = ref<'chat' | 'portrait' | 'report'>('chat')
const demoInput = ref('')
const demoMessages = ref<Array<{ role: 'user' | 'ai'; content: string }>>([])

// 七维能力画像数据（演示数据，已脱敏）
const portraitDimensions = [
  { key: 'professional', label: '专业技能', score: 80, color: '#8b9cf6' },
  { key: 'certificate', label: '证书资质', score: 62, color: '#c9a227' },
  { key: 'innovation', label: '创新能力', score: 75, color: '#8b9cf6' },
  { key: 'learning', label: '学习能力', score: 88, color: '#28c840' },
  { key: 'stress', label: '抗压能力', score: 68, color: '#c9a227' },
  { key: 'communication', label: '沟通能力', score: 65, color: '#c9a227' },
  { key: 'internship', label: '实习经验', score: 42, color: '#f06482' },
]

// 模拟真实AI助手的回复（基于实际产品能力）
const DEMO_RESPONSES: Record<string, { content: string; thinking?: string }> = {
  '分析我的简历，看看适合什么岗位': {
    thinking: '正在解析简历结构 → 提取技能实体 → 推断目标岗位 → 计算匹配度',
    content: `**简历解析完成**（演示数据）

提取到以下关键信息：
- **院校**：某理工大学 · 计算机科学与技术
- **GPA**：3.85/5.0（专业前10%）
- **技能**：Python, PyTorch, LangChain, RAG, Agent
- **项目**：3个AI相关项目（LLM应用、知识图谱、多模态）

**岗位匹配结果**

| 岗位 | 匹配度 | 核心差距 |
|------|--------|----------|
| LLM工程师 | 82% | 缺少大规模部署经验 |
| AI应用工程师 | 76% | 需补充前端技能 |
| 算法工程师 | 70% | 论文发表偏少 |

**建议方向**：LLM工程师（匹配度最高，与你的AI项目经验最契合）

点击「画像」查看完整七维能力画像，或点击「报告」查看职业发展报告。`,
  },
  '我想知道我的能力差距在哪里': {
    thinking: '正在评估七维能力 → 对比目标岗位要求 → 计算差距指数',
    content: `**七维能力诊断**（演示数据）

| 维度 | 得分 | 等级 | 说明 |
|------|------|------|------|
| 专业技能 | 80 | 优秀 | AI/LLM方向技能扎实 |
| 证书资质 | 62 | 良好 | 学校背景中等 |
| 创新能力 | 75 | 良好 | 有项目创新点 |
| 学习能力 | 88 | 优秀 | GPA优秀 |
| 抗压能力 | 68 | 良好 | 有高强度交付经历 |
| 沟通能力 | 65 | 良好 | 需加强团队协作表达 |
| 实习经验 | 42 | 待提升 | **最大短板** |

**竞争力指数**：82/100
**简历完整度**：74/100

**核心差距**：实习经验不足（0个月），建议大三暑期找一份AI相关实习。`,
  },
  '帮我生成一份职业规划报告': {
    thinking: '正在整合画像数据 → 分析市场行情 → 生成发展路径',
    content: `**职业发展报告**（演示数据）

**一、现状分析**
大三在读，AI方向技能扎实（LLM/Agent/RAG），GPA优秀，但实习经验为0。当前竞争力82分，高于同龄平均（70分）。

**二、目标岗位画像**
- **岗位**：LLM工程师
- **薪资范围**：15-25K（一线城市）
- **核心要求**：Python/PyTorch/大模型应用/Agent开发
- **你的匹配度**：82%

**三、差距诊断**
| 差距项 | 当前 | 目标 | 行动 |
|--------|------|------|------|
| 实习经验 | 0月 | 6月+ | 大三暑期实习 |
| 项目深度 | 课程级 | 产品级 | 独立完成一个LLM应用上线 |
| 技术博客 | 0篇 | 5篇+ | 每月输出技术文章 |

**四、学习路径**
1. **短期（1-3月）**：完成一个RAG应用项目，写3篇技术博客
2. **中期（3-6月）**：找一份AI实习，积累工程经验
3. **长期（6-12月）**：秋招冲刺LLM工程师岗位

点击「画像」查看完整能力雷达图。`,
  },
  '帮我看看适合什么岗位': {
    thinking: '正在分析技能图谱 → 匹配岗位数据库 → 计算匹配度',
    content: `**岗位匹配推荐**（演示数据）

基于你的技能栈（Python/PyTorch/LangChain/Agent），推荐以下方向：

**TOP 3 匹配岗位**

1. **LLM工程师** — 匹配度 82%
   - 技能覆盖：Python ✓ PyTorch ✓ LangChain ✓ Agent ✓
   - 差距：大规模部署经验
   - 薪资：15-25K

2. **AI应用工程师** — 匹配度 76%
   - 技能覆盖：Python ✓ LangChain ✓ Agent ✓
   - 差距：前端技能（React/Vue）
   - 薪资：12-20K

3. **数据科学家** — 匹配度 70%
   - 技能覆盖：Python ✓ PyTorch ✓
   - 差距：统计学基础、业务分析能力
   - 薪资：15-25K

**建议**：优先投递LLM工程师岗位，你的AI项目经验是核心竞争力。`,
  },
}

function sendDemoMessage() {
  if (!demoInput.value.trim()) return
  const userMsg = demoInput.value.trim()
  demoMessages.value.push({ role: 'user', content: userMsg })
  demoInput.value = ''

  // 模拟AI思考+回复
  setTimeout(() => {
    const response = DEMO_RESPONSES[userMsg]
    if (response) {
      demoMessages.value.push({ role: 'ai', content: response.content })
    } else {
      demoMessages.value.push({
        role: 'ai',
        content: '感谢你的提问！这是一个演示Demo，实际使用时AI会根据你的真实简历和经历给出个性化分析。\n\n点击「免费使用」上传你的简历，获取真实的职业分析报告。',
      })
    }
  }, 600)
}

function useQuickPrompt(text: string) {
  demoMessages.value.push({ role: 'user', content: text })
  setTimeout(() => {
    const response = DEMO_RESPONSES[text]
    if (response) {
      demoMessages.value.push({ role: 'ai', content: response.content })
    } else {
      demoMessages.value.push({
        role: 'ai',
        content: '感谢你的提问！这是一个演示Demo，实际使用时AI会根据你的真实简历和经历给出个性化分析。\n\n点击「免费使用」上传你的简历，获取真实的职业分析报告。',
      })
    }
  }, 800)
}

let ctx:           ReturnType<typeof gsap.context> | null = null
let rafId:         number | null = null
let removeResize:  (() => void) | null = null
let revealObserver: IntersectionObserver | null = null

// ── Particle types ────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number; r: number; a: number; spd: number; tw: number; drift: number
  baseAlpha: number; color: string
  rgb: [number, number, number]
  bright: boolean; spike: boolean
  twAmp: number; twSpeed: number; twPhase: number
}

// ── Canvas: Milo风格星尘（Canvas 2D降级方案 + 鼠标排斥） ────────────────
function initCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const c = canvas.getContext('2d')
  if (!c) return

  const dpr = window.devicePixelRatio || 1
  let W = 0, H = 0

  // ── 鼠标状态（Milo WebGL方案的指数衰减排斥） ──
  const pointerTarget: [number, number] = [0.5, 0.5]   // 目标位置（归一化 0~1）
  const pointerSmooth: [number, number] = [0.5, 0.5]   // 平滑跟随
  let pointerActive = 0              // 0 或 1，平滑过渡
  let pointerActiveTarget = 0

  const onMouseMove = (e: MouseEvent) => {
    // 归一化坐标，与canvas坐标系一致（Y轴不翻转）
    pointerTarget[0] = e.clientX / window.innerWidth
    pointerTarget[1] = e.clientY / window.innerHeight
    pointerActiveTarget = 1
  }
  const onMouseLeave = () => { pointerActiveTarget = 0 }
  // 根因：canvas有pointer-events:none，事件绑到document上
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseleave', onMouseLeave)

  // ── 粒子生成（Milo Canvas 2D 降级参数） ──
  let ps: Particle[] = []

  // ── 真实星空调色板：以蓝白为主、少量暖色，模拟真实夜空色温 ──
  const STAR_PALETTE = [
    '#ffffff', '#ffffff', '#ffffff', '#ffffff', // 多数纯白
    '#dfe6ff', '#cdddff',                       // 蓝白
    '#fff3d6', '#ffe6c2',                       // 暖色（稀少）
  ]

  function toRgb(hex: string): [number, number, number] {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]
  }

  function createParticles() {
    const wCss = W / dpr
    const hCss = H / dpr
    // 细腻星空：粒子更多、更小，按面积自适应密度（上限保护性能）
    const count = Math.min(9000, Math.max(900, Math.floor((wCss * hCss) / 340)))

    ps = Array.from({ length: count }, () => {
      const roll = Math.random()
      let r: number, baseAlpha: number, bright = false, spike = false
      if (roll < 0.045) {
        // 明亮的稀有恒星：带柔光晕 + 偶发衍射星芒
        r = (1.0 + Math.random() * 1.7) * dpr
        baseAlpha = 0.85 + Math.random() * 0.15
        bright = true
        spike = Math.random() < 0.5
      } else if (roll < 0.4) {
        // 中等亮度星
        r = (0.5 + Math.random() * 0.7) * dpr
        baseAlpha = 0.4 + Math.random() * 0.4
      } else {
        // 大量细小星尘：构成"细腻"的纹理主体
        r = (0.22 + Math.random() * 0.42) * dpr
        baseAlpha = 0.12 + Math.random() * 0.45
      }
      const color = STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)] as string
      return {
        x:   Math.random() * W,
        y:   Math.random() * H,
        r,
        a:   Math.random() * Math.PI * 2,
        spd: 0.3 + Math.random() * 1.0,
        tw:  Math.random() * Math.PI * 2,
        drift: (Math.random() - 0.5) * 0.03 * dpr,
        baseAlpha,
        color,
        rgb: toRgb(color),
        bright,
        spike,
        twAmp: 0.25 + Math.random() * 0.5,
        twSpeed: 0.4 + Math.random() * 1.6,
        twPhase: Math.random() * Math.PI * 2,
      }
    })
  }

  const resize = () => {
    // 根因：absolute+inset:0的canvas在flex容器内clientWidth可能不等于视口宽度
    // 直接用window.innerWidth/innerHeight确保canvas覆盖全屏
    const w = window.innerWidth
    const h = window.innerHeight
    W = canvas.width = w * dpr
    H = canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    createParticles()
  }
  resize()
  window.addEventListener('resize', resize)

  removeResize = () => {
    window.removeEventListener('resize', resize)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseleave', onMouseLeave)
  }

  // ── 渲染循环 ──
  const cv: HTMLCanvasElement = canvas
  const c2d: CanvasRenderingContext2D = c

  function tick(t: number) {
    rafId = requestAnimationFrame(tick)

    // 平滑插值鼠标位置（每帧25%插值，减少延迟）
    pointerSmooth[0] += (pointerTarget[0] - pointerSmooth[0]) * 0.25
    pointerSmooth[1] += (pointerTarget[1] - pointerSmooth[1]) * 0.25
    pointerActive += (pointerActiveTarget - pointerActive) * 0.25

    c2d.clearRect(0, 0, W, H)

    // ── 鼠标光晕（Milo corb-halo 风格） ──
    if (pointerActive > 0.01) {
      const mx = pointerSmooth[0] * W
      const my = pointerSmooth[1] * H
      const glowRadius = 320 * dpr
      const grd = c2d.createRadialGradient(mx, my, 0, mx, my, glowRadius)
      grd.addColorStop(0, `rgba(139,124,246,${(0.06 * pointerActive).toFixed(4)})`)
      grd.addColorStop(0.3, `rgba(255,255,255,${(0.025 * pointerActive).toFixed(4)})`)
      grd.addColorStop(1, 'transparent')
      c2d.fillStyle = grd
      c2d.fillRect(0, 0, W, H)
    }

    const timeS = t / 1000
    for (const p of ps) {
      // ── 有机闪烁：每颗星独立相位/速度/幅度，避免整齐划一 ──
      const twinkle = 0.55 + 0.45 * Math.sin(p.twPhase + timeS * p.twSpeed * p.spd)

      // 鼠标排斥（指数衰减持久方案）
      const px = p.x / W
      const py = p.y / H
      const dx = px - pointerSmooth[0]
      const dy = py - pointerSmooth[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      let offsetX = 0, offsetY = 0
      let alphaBoost = 0

      if (pointerActive > 0.01 && dist > 0.001) {
        // MILO: exp(-distance * 8.0) * repulsionStrength * 0.055
        const repulsion = Math.exp(-dist * 8.0) * pointerActive * 0.055
        offsetX = (dx / dist) * repulsion * W
        offsetY = (dy / dist) * repulsion * H
        // 近鼠标时亮度提升
        alphaBoost = Math.exp(-dist * 6.0) * pointerActive * 0.35
      }

      // 极缓慢漂移，营造"活的天空"而非闪烁噪音
      p.y -= p.drift
      p.x += p.drift * 0.6

      // 边界包裹
      if (p.y < -4 * dpr) p.y = H + 4 * dpr
      if (p.y > H + 4 * dpr) p.y = -4 * dpr
      if (p.x < -4 * dpr) p.x = W + 4 * dpr
      if (p.x > W + 4 * dpr) p.x = -4 * dpr

      const drawX = p.x + offsetX
      const drawY = p.y + offsetY
      const alpha = Math.min(1, p.baseAlpha * twinkle + alphaBoost)
      if (alpha <= 0.01) continue

      const [cr, cg, cb] = p.rgb

      // 明亮恒星：先画柔和光晕，再画衍射星芒（最亮者）
      if (p.bright) {
        const haloR = p.r * 3.6
        const hg = c2d.createRadialGradient(drawX, drawY, 0, drawX, drawY, haloR)
        hg.addColorStop(0, `rgba(${cr},${cg},${cb},${(alpha * 0.45).toFixed(3)})`)
        hg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
        c2d.fillStyle = hg
        c2d.beginPath(); c2d.arc(drawX, drawY, haloR, 0, Math.PI * 2); c2d.fill()

        if (p.spike) {
          const len = p.r * 5
          c2d.strokeStyle = `rgba(${cr},${cg},${cb},${(alpha * 0.55).toFixed(3)})`
          c2d.lineWidth = Math.max(0.6, p.r * 0.32)
          c2d.beginPath()
          c2d.moveTo(drawX - len, drawY); c2d.lineTo(drawX + len, drawY)
          c2d.moveTo(drawX, drawY - len); c2d.lineTo(drawX, drawY + len)
          c2d.stroke()
        }
      }

      // 星核
      c2d.beginPath()
      c2d.arc(drawX, drawY, p.r, 0, Math.PI * 2)
      c2d.fillStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`
      c2d.fill()
    }
  }
  rafId = requestAnimationFrame(tick)
}

// ── Mouse parallax + glow ─────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QFn = (...args: any[]) => any
let glowX: QFn | null = null
let glowY: QFn | null = null
let mapX:  QFn | null = null
let mapY:  QFn | null = null
let bgX:   QFn | null = null
let bgY:   QFn | null = null

function onMouse(e: MouseEvent) {
  const nx = e.clientX / window.innerWidth  - 0.5
  const ny = e.clientY / window.innerHeight - 0.5
  glowX?.(e.clientX - 180); glowY?.(e.clientY - 180)
  mapX?.(nx * -28);          mapY?.(ny * -28)
  bgX?.(nx * -14);           bgY?.(ny * -14)
  // 更新 CSS 变量驱动鼠标散开层
  pageRef.value?.style.setProperty('--mouse-x', `${e.clientX}px`)
  pageRef.value?.style.setProperty('--mouse-y', `${e.clientY}px`)
}

function initParallax() {
  if (!glowRef.value || !mapRef.value || !bgRef.value) return
  gsap.set(glowRef.value, { x: -180, y: -180 })
  glowX = gsap.quickTo(glowRef.value, 'x', { duration: 0.5,  ease: 'power3.out' })
  glowY = gsap.quickTo(glowRef.value, 'y', { duration: 0.5,  ease: 'power3.out' })
  mapX  = gsap.quickTo(mapRef.value,  'x', { duration: 0.9,  ease: 'power2.out' })
  mapY  = gsap.quickTo(mapRef.value,  'y', { duration: 0.9,  ease: 'power2.out' })
  bgX   = gsap.quickTo(bgRef.value,   'x', { duration: 1.5,  ease: 'power1.out' })
  bgY   = gsap.quickTo(bgRef.value,   'y', { duration: 1.5,  ease: 'power1.out' })
  window.addEventListener('mousemove', onMouse)
}

// ── CTA magnetic button ───────────────────────────────────────────────────
function initCta() {
  const btn = ctaRef.value
  if (!btn) return
  const move = (e: MouseEvent) => {
    const r = btn.getBoundingClientRect()
    gsap.to(btn, {
      x: (e.clientX - r.left - r.width  / 2) * 0.28,
      y: (e.clientY - r.top  - r.height / 2) * 0.28,
      duration: 0.3, ease: 'power2.out', overwrite: 'auto',
    })
  }
  const leave = () => gsap.to(btn, { x: 0, y: 0, duration: 0.55, ease: 'elastic.out(1,0.4)', overwrite: 'auto' })
  btn.addEventListener('mousemove', move)
  btn.addEventListener('mouseleave', leave)
}

// ── Entry timeline ────────────────────────────────────────────────────────
function initEntry() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (titleRef.value) titleRef.value.textContent = '职导星图'
    return
  }
  ctx = gsap.context(() => {
    const tl = gsap.timeline({ delay: 0.08 })
    tl.from('.ld-nebula',   { opacity: 0, duration: 1.8, ease: 'power2.out'  }, 0)
      .from(canvasRef.value, { autoAlpha: 0, duration: 1.4, ease: 'power2.out' }, 0)
      .from(mapRef.value, {
        autoAlpha: 0, scale: 0.86, filter: 'blur(12px)',
        duration: 1.6, ease: 'power3.out', clearProps: 'filter',
      }, 0.2)
      .from('.ld-pulse-ring', { autoAlpha: 0, scale: 0.2, duration: 1.4, ease: 'power3.out' }, 0.5)
      .from('.ld-corner',     { autoAlpha: 0, stagger: 0.12, duration: 0.6, ease: 'power2.out' }, 1.4)
      .from('.ld-sep', { scaleX: 0, duration: 0.75, ease: 'power2.inOut', transformOrigin: 'left center' }, 1.65)
      .to(titleRef.value,    { duration: 0.9, text: { value: '职导星图', delimiter: '' }, ease: 'none' }, 1.85)
      .from('.ld-sub',       { autoAlpha: 0, y: 8, duration: 0.5, ease: 'power2.out' }, 2.5)
      .from(ctaRef.value,    { autoAlpha: 0, y: 10, duration: 0.5, ease: 'power3.out' }, 2.65)
  }, pageRef.value ?? undefined)
}

function goToLogin() { router.push('/login') }

onMounted(async () => {
  // 根因修复：等待DOM布局完成后再初始化canvas
  // onMounted时DOM已挂载但布局可能未完成，clientWidth可能为0
  await nextTick()
  requestAnimationFrame(() => {
    initCanvas()
    initParallax()
    initCta()
    initEntry()
    // 滚动入场动画
    revealObserver = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); revealObserver?.unobserve(e.target) } }),
      { threshold: 0.15 },
    )
    document.querySelectorAll('.ld-reveal').forEach(el => revealObserver!.observe(el))
  })
})

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  removeResize?.()
  window.removeEventListener('mousemove', onMouse)
  revealObserver?.disconnect()
  ctx?.revert()
})
</script>

<template>
  <div ref="pageRef" class="ld-page">

    <!-- ══════════ 导航栏（透明） ══════════ -->
    <nav class="ld-nav">
      <div class="ld-nav__inner">
        <div class="ld-nav__brand">
          <img class="ld-nav__logo" src="/AstroLogo.png" alt="AstroGraph" width="28" height="28">
          <span class="ld-nav__name">职导星图</span>
        </div>
        <div class="ld-nav__links">
          <a href="#pain-points" class="ld-nav__link">痛点</a>
          <a href="#solution" class="ld-nav__link">怎么用</a>
          <a href="#demo" class="ld-nav__link">体验</a>
        </div>
        <div class="ld-nav__actions">
          <button class="ld-nav__btn ld-nav__btn--ghost" @click="goToLogin">登录</button>
          <button class="ld-nav__btn ld-nav__btn--primary" @click="goToLogin">免费使用</button>
        </div>
      </div>
    </nav>

    <!-- ══════════ Hero：星图全屏背景 + 叠加文案 ══════════ -->
    <div class="ld-hero-viewport">
      <div class="ld-mouse-zone" aria-hidden="true" />
      <div class="ld-canvas-fallback" aria-hidden="true" />
      <canvas ref="canvasRef" class="ld-canvas" aria-hidden="true" />
      <div ref="bgRef" class="ld-bg-layer">
        <div class="ld-nebula ld-nebula--a" />
        <div class="ld-nebula ld-nebula--b" />
        <div class="ld-nebula ld-nebula--c" />
      </div>
      <div class="ld-vignette" aria-hidden="true" />
      <div ref="glowRef" class="ld-glow" aria-hidden="true" />
      <span class="ld-corner ld-corner--tl">职业导航平台</span>
      <span class="ld-corner ld-corner--tr">2026</span>
      <div ref="mapRef" class="ld-map-wrap">
        <div class="ld-pulse-ring" aria-hidden="true" />
        <CareerStarMap theme="dark" class="ld-starmap" />
      </div>

      <footer class="ld-footer">
        <span class="ld-badge">大学生 · 全周期生涯规划</span>
        <h1 ref="titleRef" class="ld-title"></h1>
        <p class="ld-sub">从大一到大四，AI 帮你找到属于自己的职业路径</p>
        <p class="ld-value-prop">上传简历，AI 分析你的能力全景，告诉你现在该补什么、未来该走哪条路。</p>
        <div class="ld-tags">
          <span class="ld-tag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
            简历智能解析
          </span>
          <span class="ld-tag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            能力差距诊断
          </span>
          <span class="ld-tag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
            个性化学习路径
          </span>
          <span class="ld-tag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            一键生成职业报告
          </span>
        </div>
        <button ref="ctaRef" class="ld-cta" @click="goToLogin">
          <span>上传简历，开始分析</span>
          <Icon icon="lucide:arrow-right" class="ld-cta__arrow" />
        </button>
      </footer>
    </div>

    <!-- ══════════ 叙事区（极光背景层） ══════════ -->
    <div class="ld-stage">
    <!-- ══════════ 痛点区 ══════════ -->
    <section id="pain-points" class="ld-section">
      <div class="ld-section__inner">
        <span class="ld-eyebrow">你是不是也这样</span>
        <h2 class="ld-section__title">大学四年，别让迷茫偷走你的时间</h2>
        <p class="ld-section__sub">每个年级都有不同的焦虑，但大多数规划工具只帮你做了一件事——制造更多焦虑。</p>
        <div class="ld-pain-grid">
          <div class="ld-card ld-reveal">
            <div class="ld-card__stage">大一</div>
            <div class="ld-card__icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></div>
            <h3 class="ld-card__title">不知道该选什么方向</h3>
            <p class="ld-card__desc">转专业？考研？出国？实习？信息太多反而不知道该做什么，大一就这样过去了。</p>
          </div>
          <div class="ld-card ld-reveal">
            <div class="ld-card__stage">大二大三</div>
            <div class="ld-card__icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg></div>
            <h3 class="ld-card__title">简历写了但不知道写什么</h3>
            <p class="ld-card__desc">实习经历少、项目没亮点、技能点罗列了一堆，但不知道哪些才是HR真正看重的。</p>
          </div>
          <div class="ld-card ld-reveal">
            <div class="ld-card__stage">大四</div>
            <div class="ld-card__icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
            <h3 class="ld-card__title">海投简历没有回音</h3>
            <p class="ld-card__desc">投了50份简历只收到3个面试，不知道是简历问题还是方向问题，越投越没信心。</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ══════════ 方案区 ══════════ -->
    <section id="solution" class="ld-section">
      <div class="ld-section__inner">
        <span class="ld-eyebrow">怎么帮你</span>
        <h2 class="ld-section__title">AI 帮你看清自己，找到方向</h2>
        <p class="ld-section__sub">不是又一个规划模板，而是基于你真实情况的智能分析。</p>
        <div class="ld-steps">
          <div class="ld-step ld-reveal">
            <div class="ld-step__icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
            </div>
            <span class="ld-step__num">01</span>
            <h3 class="ld-step__title">上传你的简历</h3>
            <p class="ld-step__desc">PDF 或粘贴文本，30秒完成。不需要手动填表，AI 自动提取你的经历和技能。</p>
          </div>
          <div class="ld-step ld-reveal">
            <div class="ld-step__icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            </div>
            <span class="ld-step__num">02</span>
            <h3 class="ld-step__title">AI 诊断差距</h3>
            <p class="ld-step__desc">四维能力画像 + 人岗匹配，告诉你现在缺什么、该补什么、哪些技能最有竞争力。</p>
          </div>
          <div class="ld-step ld-reveal">
            <div class="ld-step__icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
            </div>
            <span class="ld-step__num">03</span>
            <h3 class="ld-step__title">生成你的专属报告</h3>
            <p class="ld-step__desc">职业方向 + 学习路径 + 课程推荐，一键导出 PDF，可保存可回看可分享。</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ══════════ 体验演示 ══════════ -->
    <section id="demo" class="ld-section ld-demo-section">
      <div class="ld-section__inner">
        <span class="ld-eyebrow">体验演示</span>
        <h2 class="ld-section__title">看看 AI 如何帮你导航</h2>
        <p class="ld-section__sub">模拟真实使用场景，感受智能职业分析。</p>
        <div class="ld-demo-window ld-reveal">
          <div class="ld-demo-chrome">
            <div class="ld-demo-dots">
              <span class="ld-demo-dot ld-demo-dot--red"></span>
              <span class="ld-demo-dot ld-demo-dot--yellow"></span>
              <span class="ld-demo-dot ld-demo-dot--green"></span>
            </div>
            <span class="ld-demo-title">职导星图 · AI 分析</span>
            <div class="ld-demo-tabs">
              <button class="ld-demo-tab" :class="{ 'ld-demo-tab--active': activeDemoTab === 'chat' }" @click="activeDemoTab = 'chat'">对话</button>
              <button class="ld-demo-tab" :class="{ 'ld-demo-tab--active': activeDemoTab === 'portrait' }" @click="activeDemoTab = 'portrait'">画像</button>
              <button class="ld-demo-tab" :class="{ 'ld-demo-tab--active': activeDemoTab === 'report' }" @click="activeDemoTab = 'report'">报告</button>
            </div>
          </div>
          <div class="ld-demo-content">
            <!-- 对话Tab（欢迎界面） -->
            <div v-show="activeDemoTab === 'chat'" class="ld-demo-chat">
              <div v-if="demoMessages.length === 0" class="ld-demo-welcome">
                <!-- 星球吉祥物（ReTurn风格） -->
                <div class="ld-demo-mascot">
                  <svg viewBox="0 0 120 120" fill="none">
                    <circle cx="60" cy="60" r="50" fill="url(#mg)"/>
                    <ellipse cx="45" cy="42" rx="16" ry="12" fill="rgba(255,255,255,0.2)" transform="rotate(-20 45 42)"/>
                    <ellipse cx="45" cy="58" rx="4.5" ry="5.5" fill="#1a1a2e"/>
                    <ellipse cx="75" cy="58" rx="4.5" ry="5.5" fill="#1a1a2e"/>
                    <circle cx="43" cy="56" r="1.8" fill="rgba(255,255,255,0.8)"/>
                    <circle cx="73" cy="56" r="1.8" fill="rgba(255,255,255,0.8)"/>
                    <path d="M52 72 Q60 78 68 72" stroke="#1a1a2e" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                    <ellipse cx="35" cy="66" rx="7" ry="4.5" fill="rgba(240,166,202,0.35)"/>
                    <ellipse cx="85" cy="66" rx="7" ry="4.5" fill="rgba(240,166,202,0.35)"/>
                    <defs><radialGradient id="mg" cx="40%" cy="35%" r="60%"><stop offset="0%" stop-color="#8b9cf6"/><stop offset="100%" stop-color="#5a6cb8"/></radialGradient></defs>
                  </svg>
                </div>
                <h3 class="ld-demo-welcome__title">Welcome back!</h3>
                <p class="ld-demo-welcome__role">学生 · 计算机科学</p>
                <div class="ld-demo-status">
                  <span class="ld-demo-status__dot"></span>
                  <span>AI 助手在线</span>
                </div>
                <div class="ld-demo-welcome__actions">
                  <button class="ld-demo-action ld-demo-action--primary" @click="useQuickPrompt('分析我的简历，看看适合什么岗位')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
                    上传简历分析
                  </button>
                  <button class="ld-demo-action" @click="useQuickPrompt('我想知道我的能力差距在哪里')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
                    生成职业报告
                  </button>
                  <button class="ld-demo-action" @click="useQuickPrompt('帮我看看适合什么岗位')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    搜索岗位
                  </button>
                </div>
              </div>
              <div v-else class="ld-demo-messages">
                <div v-for="(msg, i) in demoMessages" :key="i" class="ld-demo-message" :class="msg.role === 'user' ? 'ld-demo-message--user' : 'ld-demo-message--ai'">
                  <span class="ld-demo-avatar" :class="msg.role === 'user' ? 'ld-demo-avatar--user' : 'ld-demo-avatar--ai'">
                    <template v-if="msg.role === 'user'">你</template>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  </span>
                  <div class="ld-demo-bubble" v-html="msg.content.replace(/\n/g, '<br>')"></div>
                </div>
              </div>
            </div>
            <!-- 画像Tab（七维能力画像） -->
            <div v-show="activeDemoTab === 'portrait'" class="ld-demo-portrait">
              <div class="ld-demo-portrait__header">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>七维能力画像</span>
              </div>
                <div class="ld-demo-portrait__student">
                <span class="ld-demo-portrait__name">演示用户</span>
                <span class="ld-demo-portrait__info">某理工大学 · 计算机科学 · 大三</span>
              </div>
              <div class="ld-demo-radar-chart">
                <div class="ld-demo-radar__item" v-for="dim in portraitDimensions" :key="dim.key">
                  <span class="ld-demo-radar__label">{{ dim.label }}</span>
                  <div class="ld-demo-radar__bar">
                    <div class="ld-demo-radar__fill" :style="{ width: dim.score + '%', background: dim.color }"></div>
                  </div>
                  <span class="ld-demo-radar__value" :style="{ color: dim.color }">{{ dim.score }}</span>
                </div>
              </div>
                <div class="ld-demo-portrait__summary">
                <div class="ld-demo-portrait__scores">
                  <div class="ld-demo-portrait__score-item">
                    <span class="ld-demo-portrait__score-label">竞争力指数</span>
                    <span class="ld-demo-portrait__score-value ld-demo-portrait__score-value--highlight">82</span>
                  </div>
                  <div class="ld-demo-portrait__score-item">
                    <span class="ld-demo-portrait__score-label">简历完整度</span>
                    <span class="ld-demo-portrait__score-value">74</span>
                  </div>
                </div>
                <p class="ld-demo-portrait__agent-summary">AI分析：LLM方向技能扎实，GPA优秀，最大短板是实习经验（0个月）。建议大三暑期找一份AI相关实习。</p>
              </div>
            </div>
            <!-- 报告Tab（职业发展报告） -->
            <div v-show="activeDemoTab === 'report'" class="ld-demo-report">
              <div class="ld-demo-report__header">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
                <span>职业发展报告 · 2026</span>
              </div>
              <div class="ld-demo-report__content">
                <div class="ld-demo-report__section">
                  <h4>目标岗位</h4>
                  <div class="ld-demo-report__job-card">
                    <div class="ld-demo-report__job-title">LLM工程师</div>
                    <div class="ld-demo-report__job-meta">
                      <span class="ld-demo-report__match">匹配度 82%</span>
                      <span class="ld-demo-report__salary">薪资 15-25K</span>
                    </div>
                    <div class="ld-demo-report__job-skills">
                      <span>Python</span><span>PyTorch</span><span>LangChain</span><span>Agent</span>
                    </div>
                  </div>
                </div>
                <div class="ld-demo-report__section">
                  <h4>差距诊断</h4>
                  <div class="ld-demo-report__gap-list">
                    <div class="ld-demo-report__gap-item">
                      <span class="ld-demo-report__gap-label">实习经验</span>
                      <span class="ld-demo-report__gap-current">0月</span>
                      <span class="ld-demo-report__gap-arrow">→</span>
                      <span class="ld-demo-report__gap-target">6月+</span>
                    </div>
                    <div class="ld-demo-report__gap-item">
                      <span class="ld-demo-report__gap-label">项目深度</span>
                      <span class="ld-demo-report__gap-current">课程级</span>
                      <span class="ld-demo-report__gap-arrow">→</span>
                      <span class="ld-demo-report__gap-target">产品级</span>
                    </div>
                    <div class="ld-demo-report__gap-item">
                      <span class="ld-demo-report__gap-label">技术博客</span>
                      <span class="ld-demo-report__gap-current">0篇</span>
                      <span class="ld-demo-report__gap-arrow">→</span>
                      <span class="ld-demo-report__gap-target">5篇+</span>
                    </div>
                  </div>
                </div>
                <div class="ld-demo-report__section">
                  <h4>行动路径</h4>
                  <div class="ld-demo-report__path">
                    <div class="ld-demo-report__path-item ld-demo-report__path-item--active">
                      <span class="ld-demo-report__path-time">1-3月</span>
                      <span class="ld-demo-report__path-action">完成RAG项目 + 写3篇博客</span>
                    </div>
                    <div class="ld-demo-report__path-item">
                      <span class="ld-demo-report__path-time">3-6月</span>
                      <span class="ld-demo-report__path-action">找AI实习 + 积累工程经验</span>
                    </div>
                    <div class="ld-demo-report__path-item">
                      <span class="ld-demo-report__path-time">6-12月</span>
                      <span class="ld-demo-report__path-action">秋招冲刺LLM工程师</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="ld-demo-composer">
              <div class="ld-demo-modes">
                <button class="ld-demo-mode ld-demo-mode--active">Ask</button>
                <button class="ld-demo-mode">Agent</button>
                <button class="ld-demo-mode">Experts</button>
              </div>
              <div class="ld-demo-input">
                <input
                  v-model="demoInput"
                  type="text"
                  placeholder="输入你的职业困惑..."
                  @keyup.enter="sendDemoMessage"
                />
                <button class="ld-demo-send" @click="sendDemoMessage">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══════════ 信任信号 ══════════ -->
    <section class="ld-section ld-trust-section">
      <div class="ld-section__inner">
        <div class="ld-trust-grid">
          <div class="ld-trust-item ld-reveal">
            <div class="ld-trust-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span class="ld-trust-text">数据本地处理</span>
          </div>
          <div class="ld-trust-item ld-reveal">
            <div class="ld-trust-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <span class="ld-trust-text">隐私安全保障</span>
          </div>
          <div class="ld-trust-item ld-reveal">
            <div class="ld-trust-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <span class="ld-trust-text">AI 智能分析</span>
          </div>
          <div class="ld-trust-item ld-reveal">
            <div class="ld-trust-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <span class="ld-trust-text">多智能体协作</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ══════════ 尾部 CTA ══════════ -->
    <section class="ld-section ld-cta-section">
      <div class="ld-section__inner ld-cta-inner">
        <h2 class="ld-cta-title">你的职业星图，正在等你开启</h2>
        <p class="ld-cta-sub">找到你在职业星空中的坐标</p>
        <button class="ld-cta ld-cta--hero" @click="goToLogin">
          <span>进入星图</span>
          <Icon icon="lucide:arrow-right" class="ld-cta__arrow" />
        </button>
      </div>
    </section>
    </div><!-- /.ld-stage -->

  </div>
</template>

<style scoped>
/* ── 导航栏（透明） ──────────────────────────────────────────────────────── */
.ld-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: 16px 32px;
  background: rgba(6,6,15,0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.ld-nav__inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ld-nav__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ld-nav__logo {
  color: rgba(255,255,255,0.9);
}
.ld-nav__name {
  font-family: 'LXGW WenKai', 'Noto Serif SC', serif;
  font-size: 18px;
  font-weight: 500;
  color: rgba(255,255,255,0.95);
  letter-spacing: 0.05em;
}
.ld-nav__links {
  display: flex;
  gap: 32px;
}
.ld-nav__link {
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 14px;
  color: rgba(255,255,255,0.7);
  text-decoration: none;
  transition: color 0.2s ease;
}
.ld-nav__link:hover {
  color: rgba(255,255,255,0.95);
}
.ld-nav__actions {
  display: flex;
  gap: 12px;
}
.ld-nav__btn {
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 14px;
  padding: 8px 18px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.ld-nav__btn--ghost {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.8);
}
.ld-nav__btn--ghost:hover {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.25);
}
.ld-nav__btn--primary {
  background: rgba(139,124,246,0.2);
  border: 1px solid rgba(139,124,246,0.4);
  color: rgba(139,124,246,0.95);
}
.ld-nav__btn--primary:hover {
  background: rgba(139,124,246,0.3);
  border-color: rgba(139,124,246,0.6);
}

/* ── 页面 ────────────────────────────────────────────────────────────────── */
html {
  scroll-behavior: smooth;
}
.ld-page {
  position: relative;
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  background: #06060f;
  background-image: radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 40px 40px;
}

/* ── Hero 视口（100vh 星图背景） ── */
.ld-hero-viewport {
  position: relative;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── 粒子画布 ──────────────────────────────────────────────────────────────── */
.ld-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  will-change: opacity;
}

/* Phase 5: 静态降级（MILO风格fallback，细腻星点） */
.ld-canvas-fallback {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(circle at 20% 30%, rgba(255,255,255,0.7) 0 0.8px, transparent 1.8px) 0 0/38px 42px,
    radial-gradient(circle at 70% 65%, rgba(220,225,236,0.55) 0 0.7px, transparent 1.6px) 0 0/57px 64px,
    radial-gradient(circle at 45% 15%, rgba(196,205,232,0.4) 0 0.6px, transparent 1.4px) 0 0/83px 91px,
    radial-gradient(circle at 85% 80%, rgba(255,242,214,0.4) 0 0.6px, transparent 1.4px) 0 0/101px 110px;
  opacity: 1;
  transition: opacity 0.5s ease-out;
}

.ld-canvas-fallback.is-hidden {
  opacity: 0;
}

/* ── 视差背景层 ────────────────────────────────────────────────────────────── */
.ld-bg-layer {
  position: absolute;
  inset: -60px;
  z-index: 0;
  pointer-events: none;
}

/* ── 星云渐变 ──────────────────────────────────────────────────────────────── */
.ld-nebula {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ld-nebula--a {
  background: radial-gradient(ellipse 70% 60% at 50% 48%, rgba(201,162,39,0.03) 0%, transparent 65%);
  animation: ld-aurora-drift 26s ease-in-out infinite alternate;
}

.ld-nebula--b {
  background: radial-gradient(ellipse 90% 70% at 50% 50%, rgba(255,255,255,0.008) 0%, transparent 60%);
  animation: ld-blob-float 22s ease-in-out infinite alternate-reverse;
}

.ld-nebula--c {
  background: radial-gradient(ellipse 60% 50% at 75% 0%, rgba(139,124,246,0.02) 0%, transparent 60%);
  animation: ld-aurora-drift 26s ease-in-out infinite alternate;
  animation-delay: -13s;
}

@keyframes ld-aurora-drift {
  0%   { opacity: 0.65; transform: translateY(-2%) rotate(-1deg) scale(1); }
  50%  { opacity: 0.85; transform: translateY(1%) rotate(0.5deg) scale(1.02); }
  100% { opacity: 0.75; transform: translateY(3%) rotate(1deg) scale(1.03); }
}

@keyframes ld-blob-float {
  0%   { transform: translate(0, 0) scale(1); }
  50%  { transform: translate(2%, -3%) scale(1.06); }
  100% { transform: translate(4%, -5%) scale(1.12); }
}

/* ── 暗角遮罩 ──────────────────────────────────────────────────────────────── */
.ld-vignette {
  position: absolute;
  inset: 0;
  z-index: 3;
  background: radial-gradient(ellipse 88% 88% at 50% 48%, transparent 40%, rgba(0,0,0,0.4) 100%);
  pointer-events: none;
}

/* ── 鼠标光晕（增强版 - DeepSeek风格） ─────────────────────────────────── */
.ld-glow {
  position: fixed;
  top: 0;
  left: 0;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(139, 124, 246, 0.06) 0%,
    rgba(255, 255, 255, 0.02) 35%,
    transparent 62%
  );
  pointer-events: none;
  z-index: 4;
  will-change: transform;
  opacity: 0.6;
}

/* ── 鼠标散开层（覆盖整个页面的粒子交互区） ────────────────────────────── */
.ld-mouse-zone {
  position: fixed;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  background: radial-gradient(
    circle 200px at var(--mouse-x, 50%) var(--mouse-y, 50%),
    rgba(139, 124, 246, 0.04) 0%,
    transparent 55%
  );
  transition: background 0.4s ease;
}

/* ── 角落标注 ──────────────────────────────────────────────────────────────── */
.ld-corner {
  position: absolute;
  z-index: 10;
  font-family: 'LXGW WenKai', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.5);
  pointer-events: none;
  user-select: none;
}

.ld-corner--tl { top: 20px; left: 28px; }
.ld-corner--tr { top: 20px; right: 28px; }

/* ── 星图主体 ──────────────────────────────────────────────────────────────── */
.ld-map-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  z-index: 2;
  will-change: transform;
  pointer-events: none;
}

/* ── 激活脉冲环 ────────────────────────────────────────────────────────────── */
.ld-pulse-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 240px;
  height: 240px;
  margin: -120px 0 0 -120px;
  border-radius: 50%;
  border: 1px solid rgba(139,124,246,0.15);
  box-shadow: 0 0 20px rgba(139,124,246,0.08), inset 0 0 12px rgba(139,124,246,0.04);
  pointer-events: none;
  z-index: 6;
  animation: ld-pulse 5s ease-in-out infinite;
}

@keyframes ld-pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(139,124,246,0.08), inset 0 0 12px rgba(139,124,246,0.04); }
  50%       { box-shadow: 0 0 32px rgba(139,124,246,0.14), inset 0 0 20px rgba(139,124,246,0.06); }
}

.ld-starmap {
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 10;
  opacity: 0.95;
  pointer-events: auto;
}

/* 星图节点：星球化设计 */
.ld-starmap :deep(.rp-star-node) {
  filter: drop-shadow(0 0 8px currentColor);
  transition: transform 0.3s ease, filter 0.3s ease;
}

.ld-starmap :deep(.rp-star-node:hover) {
  transform: scale(1.25);
  filter: drop-shadow(0 0 16px currentColor) drop-shadow(0 0 32px currentColor);
}

/* 星图标签：白色+阴影确保可读 */
.ld-starmap :deep(.rp-star-label) {
  fill: rgba(255, 255, 255, 0.95) !important;
  text-shadow: 0 0 8px rgba(0,0,0,1), 0 0 16px rgba(0,0,0,0.8);
  font-size: 10px !important;
  font-weight: 500;
}

/* 星图连线：适中透明度 */
.ld-starmap :deep(.rp-star-link) {
  stroke-opacity: 0.35 !important;
  stroke-width: 1.2 !important;
}

/* 星图环：适中透明度 */
.ld-starmap :deep(.rp-ring) {
  stroke-opacity: 0.35 !important;
}

/* 情绪标签：适中可见 */
.ld-starmap :deep(.rp-emotion-label) {
  opacity: 0.65;
  font-size: 8px !important;
}



/* ── 分割线 ────────────────────────────────────────────────────────────────── */
.ld-sep {
  flex-shrink: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 0;
  z-index: 6;
  animation: ld-breathe 4s ease-in-out infinite;
}

@keyframes ld-breathe {
  0%, 100% { opacity: 0.55; }
  50%       { opacity: 1; }
}

/* ── 底部 Hero 文案叠加层 ────────────────────────────────────────────────── */
.ld-footer {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  z-index: 10;
  padding: 48px clamp(24px, 5vw, 72px) 40px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  background: linear-gradient(to top, rgba(6,6,15,0.95) 0%, rgba(6,6,15,0.7) 55%, transparent 100%);
}

/* ── Hero 徽章 ── */
.ld-badge {
  display: inline-block;
  padding: 8px 20px;
  background: rgba(190,42,0,0.15);
  border: 1px solid rgba(190,42,0,0.25);
  border-radius: 20px;
  font-family: 'LXGW WenKai', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: rgba(201,162,39,0.9);
  letter-spacing: 0.1em;
}

/* ── 主标题 ────────────────────────────────────────────────────────────────── */
.ld-title {
  margin: 0;
  font-family: 'LXGW WenKai', 'Noto Serif SC', 'Songti SC', 'STSong', Georgia, serif;
  font-size: clamp(28px, 3.5vw, 48px);
  font-weight: 400;
  letter-spacing: 0.25em;
  line-height: 1;
  color: rgba(255, 255, 255, 0.95);
  min-height: 1.2em;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.88) 0%,
    rgba(201,162,39,0.55) 46%,
    rgba(255,255,255,0.88) 54%,
    rgba(255,255,255,0.88) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: ld-title-shimmer 10s ease-in-out infinite;
}

@keyframes ld-title-shimmer {
  0%, 100% { background-position: 100% 0; }
  50% { background-position: 0% 0; }
}

/* ── 副标题 ────────────────────────────────────────────────────────────────── */
.ld-sub {
  margin: 0;
  font-family: 'LXGW WenKai', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', -apple-system, sans-serif;
  font-size: 16px;
  font-weight: 300;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.75);
  background: linear-gradient(90deg, rgba(255,255,255,0.58), rgba(201,162,39,0.38), rgba(255,255,255,0.58));
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: ld-title-shimmer 12s ease-in-out infinite;
}

/* ── 价值主张 ── */
.ld-value-prop {
  margin: 12px 0 0;
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.55);
  max-width: 420px;
  line-height: 1.7;
}

/* ── CTA 按钮 ──────────────────────────────────────────────────────────────── */
.ld-cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 32px;
  background: rgba(190, 42, 0, 0.18);
  color: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(201, 162, 39, 0.55);
  border-radius: 2px;
  font-family: 'LXGW WenKai', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 0.12em;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
  will-change: transform;
  box-shadow: 0 0 12px rgba(190, 42, 0, 0.08);
}

.ld-cta::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(190,42,0,0.0) 0%, rgba(201,162,39,0.2) 50%, rgba(190,42,0,0.0) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.ld-cta:hover::before {
  opacity: 1;
}

.ld-cta:hover {
  color: rgba(255, 255, 255, 0.98);
  border-color: rgba(201,162,39,0.7);
  background: rgba(190, 42, 0, 0.2);
  box-shadow: 0 0 18px rgba(190, 42, 0, 0.16), 0 0 36px rgba(201, 162, 39, 0.06);
}

.ld-cta__arrow {
  font-size: 13px;
  transition: transform 0.2s ease;
}

.ld-cta:hover .ld-cta__arrow {
  transform: translateX(4px);
  color: rgba(201,162,39,0.9);
}

/* ── Hero 标签组 ── */
.ld-tags { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0 28px; }
.ld-tag {
  display: inline-flex; align-items: center;
  padding: 10px 18px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px;
  font-family: 'LXGW WenKai', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 14px; color: rgba(255,255,255,0.8); letter-spacing: 0.04em;
}

/* ── 极光渐变背景（Milo风格多层） ── */
.ld-stage {
  position: relative;
}
.ld-stage::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 50% at 75% 0%, rgba(139,124,246,0.08) 0%, transparent 60%),
    radial-gradient(ellipse 60% 50% at 15% 100%, rgba(240,166,202,0.05) 0%, transparent 55%);
  pointer-events: none;
  z-index: 0;
}

/* ── 叙事区块（通用） ── */
.ld-section { position: relative; z-index: 10; padding: 100px clamp(20px, 5vw, 72px); }
.ld-section__inner { max-width: 1000px; margin: 0 auto; }
.ld-eyebrow {
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 13px;
  letter-spacing: 0.2em;
  color: rgba(201,162,39,0.8);
  margin-bottom: 16px;
  display: block;
}
.ld-section__title {
  font-family: 'LXGW WenKai', 'Noto Serif SC', serif;
  font-size: clamp(26px, 3.5vw, 38px);
  font-weight: 400;
  color: rgba(255,255,255,0.95);
  margin: 0 0 16px;
  letter-spacing: 0.02em;
  line-height: 1.3;
}
.ld-section__sub {
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 16px;
  color: rgba(255,255,255,0.55);
  margin: 0 0 48px;
  max-width: 520px;
  line-height: 1.8;
}

/* ── 痛点卡片（参考ReTurn的shadcn风格） ── */
.ld-pain-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.ld-card {
  background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 32px 28px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  transition: transform 0.4s cubic-bezier(.22,1,.36,1), border-color 0.3s ease, box-shadow 0.4s ease;
  box-shadow: 0 4px 24px rgba(0,0,0,0.2);
}
.ld-card:hover {
  border-color: rgba(201,162,39,0.3);
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(201,162,39,0.1);
}
.ld-card__stage {
  display: inline-block;
  padding: 4px 12px;
  background: rgba(139,124,246,0.15);
  border: 1px solid rgba(139,124,246,0.25);
  border-radius: 6px;
  font-family: 'LXGW WenKai', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: rgba(139,124,246,0.9);
  letter-spacing: 0.05em;
  margin-bottom: 16px;
}
.ld-card__icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(201,162,39,0.1);
  border: 1px solid rgba(201,162,39,0.2);
  border-radius: 12px;
  margin-bottom: 20px;
  color: rgba(201,162,39,0.9);
}
.ld-card__title {
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 18px;
  font-weight: 500;
  color: rgba(255,255,255,0.95);
  margin: 0 0 12px;
  letter-spacing: 0.02em;
}
.ld-card__desc {
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 15px;
  color: rgba(255,255,255,0.6);
  line-height: 1.8;
  margin: 0;
}

/* ── 方案步骤 ── */
.ld-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
.ld-step {
  text-align: center;
  padding: 32px 24px;
  background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 16px;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}
.ld-step:hover {
  border-color: rgba(139,124,246,0.2);
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.ld-step__icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(139,124,246,0.1);
  border: 1px solid rgba(139,124,246,0.2);
  border-radius: 14px;
  margin: 0 auto 20px;
  color: rgba(139,124,246,0.9);
}
.ld-step__num {
  font-family: 'LXGW WenKai', monospace;
  font-size: 14px;
  font-weight: 400;
  color: rgba(139,124,246,0.6);
  letter-spacing: 0.1em;
  display: block;
  margin-bottom: 12px;
}
.ld-step__title {
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 18px;
  font-weight: 500;
  color: rgba(255,255,255,0.95);
  margin: 0 0 12px;
}
.ld-step__desc {
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 15px;
  color: rgba(255,255,255,0.6);
  line-height: 1.8;
  margin: 0;
}
.ld-step-sep { display: none; }

/* ── 尾部 CTA ── */
.ld-cta-section { padding-bottom: 120px; }
.ld-cta-inner { text-align: center; max-width: 600px; }
.ld-cta-title {
  font-family: 'LXGW WenKai', 'Noto Serif SC', serif;
  font-size: clamp(24px, 3.5vw, 36px);
  font-weight: 400;
  color: rgba(255,255,255,0.95);
  margin: 0 0 12px;
  letter-spacing: 0.05em;
}
.ld-cta-sub {
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 16px;
  color: rgba(255,255,255,0.6);
  margin: 0 0 32px;
}
.ld-cta--hero { margin: 0 auto; }

/* ── 演示窗口（精致版） ── */
.ld-demo-section { padding: 100px clamp(20px, 5vw, 72px); }
.ld-demo-window {
  background: linear-gradient(180deg, #141420 0%, #1a1a2e 100%);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  overflow: hidden;
  box-shadow:
    0 24px 80px rgba(0,0,0,0.5),
    0 0 0 1px rgba(255,255,255,0.05),
    inset 0 1px 0 rgba(255,255,255,0.06);
  max-width: 720px;
  margin: 0 auto;
}
.ld-demo-chrome {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  background: rgba(0,0,0,0.2);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.ld-demo-dots {
  display: flex;
  gap: 7px;
}
.ld-demo-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  transition: transform 0.2s ease;
}
.ld-demo-dot:hover { transform: scale(1.15); }
.ld-demo-dot--red { background: #ff5f57; box-shadow: 0 0 6px rgba(255,95,87,0.4); }
.ld-demo-dot--yellow { background: #ffbd2e; box-shadow: 0 0 6px rgba(255,189,46,0.4); }
.ld-demo-dot--green { background: #28c840; box-shadow: 0 0 6px rgba(40,200,64,0.4); }
.ld-demo-title {
  font-family: 'LXGW WenKai', sans-serif;
  font-size: 13px;
  color: rgba(255,255,255,0.55);
  flex: 1;
  letter-spacing: 0.02em;
}
.ld-demo-tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: rgba(255,255,255,0.04);
  border-radius: 8px;
}
.ld-demo-tab {
  padding: 7px 16px;
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.5);
  font-family: 'LXGW WenKai', sans-serif;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.ld-demo-tab:hover {
  color: rgba(255,255,255,0.7);
}
.ld-demo-tab--active {
  background: rgba(139,124,246,0.2);
  color: rgba(139,124,246,0.95);
  box-shadow: 0 1px 4px rgba(139,124,246,0.2);
}
.ld-demo-content {
  padding: 32px;
  min-height: 420px;
  display: flex;
  flex-direction: column;
}
.ld-demo-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.ld-demo-message {
  display: flex;
  gap: 12px;
  max-width: 85%;
}
.ld-demo-message--user {
  align-self: flex-end;
  flex-direction: row-reverse;
}
.ld-demo-message--ai {
  align-self: flex-start;
}
.ld-demo-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}
.ld-demo-avatar--user {
  background: rgba(201,162,39,0.2);
  color: rgba(201,162,39,0.9);
}
.ld-demo-avatar--ai {
  background: rgba(139,124,246,0.2);
  color: rgba(139,124,246,0.9);
}
.ld-demo-bubble {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 16px 20px;
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 14px;
  color: rgba(255,255,255,0.88);
  line-height: 1.75;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.ld-demo-message--user .ld-demo-bubble {
  background: linear-gradient(135deg, rgba(139,124,246,0.15) 0%, rgba(139,124,246,0.1) 100%);
  border-color: rgba(139,124,246,0.25);
}
.ld-demo-bubble p { margin: 0 0 8px; }
.ld-demo-bubble p:last-child { margin: 0; }
.ld-demo-bubble ul {
  margin: 8px 0;
  padding-left: 20px;
}
.ld-demo-bubble li {
  margin: 4px 0;
}
.ld-demo-hint {
  font-size: 13px;
  color: rgba(139,124,246,0.7);
  font-style: italic;
}
.ld-demo-verdict {
  background: rgba(201,162,39,0.1);
  border: 1px solid rgba(201,162,39,0.2);
  border-radius: 8px;
  padding: 10px 14px;
  margin: 12px 0 !important;
}
.ld-demo-radar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0;
}
.ld-demo-radar__item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ld-demo-radar__label {
  font-size: 12px;
  color: rgba(255,255,255,0.6);
  width: 70px;
  flex-shrink: 0;
}
.ld-demo-radar__bar {
  flex: 1;
  height: 6px;
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
  overflow: hidden;
}
.ld-demo-radar__fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(139,124,246,0.6), rgba(139,124,246,0.9));
  border-radius: 3px;
}
.ld-demo-radar__value {
  font-size: 12px;
  font-weight: 500;
  color: rgba(139,124,246,0.9);
  width: 28px;
  text-align: right;
}
.ld-demo-composer {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.ld-demo-modes {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}
.ld-demo-mode {
  padding: 5px 12px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: rgba(255,255,255,0.5);
  font-family: 'LXGW WenKai', sans-serif;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.ld-demo-mode--active {
  background: rgba(139,124,246,0.15);
  border-color: rgba(139,124,246,0.3);
  color: rgba(139,124,246,0.9);
}
.ld-demo-input {
  display: flex;
  gap: 8px;
}
.ld-demo-input input {
  flex: 1;
  padding: 12px 16px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: rgba(255,255,255,0.8);
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 14px;
}
.ld-demo-input input::placeholder {
  color: rgba(255,255,255,0.3);
}
.ld-demo-send {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(139,124,246,0.2);
  border: 1px solid rgba(139,124,246,0.3);
  border-radius: 8px;
  color: rgba(139,124,246,0.9);
  cursor: pointer;
  transition: all 0.2s ease;
}
/* 欢迎界面（ReTurn风格 · 精致版） */
.ld-demo-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 24px 48px;
  text-align: center;
}
.ld-demo-mascot {
  width: 110px;
  height: 110px;
  margin-bottom: 28px;
  animation: mascot-float 5s ease-in-out infinite;
  filter: drop-shadow(0 8px 24px rgba(139,124,246,0.25));
}
.ld-demo-mascot svg {
  width: 100%;
  height: 100%;
}
@keyframes mascot-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.ld-demo-welcome__title {
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 28px;
  font-weight: 500;
  color: rgba(255,255,255,0.95);
  margin: 0 0 8px;
  letter-spacing: 0.02em;
}
.ld-demo-welcome__role {
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 14px;
  color: rgba(255,255,255,0.4);
  margin: 0 0 18px;
  letter-spacing: 0.03em;
}
.ld-demo-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 13px;
  color: rgba(255,255,255,0.45);
  margin-bottom: 32px;
  padding: 6px 14px;
  background: rgba(40,200,64,0.08);
  border: 1px solid rgba(40,200,64,0.15);
  border-radius: 20px;
}
.ld-demo-status__dot {
  width: 8px;
  height: 8px;
  background: #28c840;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(40,200,64,0.5);
  animation: status-pulse 2s ease-in-out infinite;
}
@keyframes status-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(40,200,64,0.5); }
  50% { opacity: 0.6; box-shadow: 0 0 4px rgba(40,200,64,0.3); }
}
.ld-demo-welcome__actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}
.ld-demo-action {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 22px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  color: rgba(255,255,255,0.85);
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.ld-demo-action:hover {
  background: rgba(139,124,246,0.1);
  border-color: rgba(139,124,246,0.25);
  color: rgba(139,124,246,0.95);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(139,124,246,0.15);
}
.ld-demo-action:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.ld-demo-action--primary {
  background: linear-gradient(135deg, rgba(139,124,246,0.2) 0%, rgba(139,124,246,0.15) 100%);
  border-color: rgba(139,124,246,0.3);
  color: rgba(139,124,246,0.95);
  box-shadow: 0 2px 12px rgba(139,124,246,0.2);
}
.ld-demo-action--primary:hover {
  background: linear-gradient(135deg, rgba(139,124,246,0.3) 0%, rgba(139,124,246,0.2) 100%);
  border-color: rgba(139,124,246,0.45);
  box-shadow: 0 4px 20px rgba(139,124,246,0.3);
}
.ld-demo-messages {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 0;
}
/* 画像Tab（七维能力画像） */
.ld-demo-portrait__header,
.ld-demo-report__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 14px;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  font-family: 'LXGW WenKai', sans-serif;
  font-size: 15px;
  font-weight: 500;
  color: rgba(255,255,255,0.9);
}
.ld-demo-portrait__student {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}
.ld-demo-portrait__name {
  font-family: 'LXGW WenKai', sans-serif;
  font-size: 18px;
  font-weight: 500;
  color: rgba(255,255,255,0.95);
}
.ld-demo-portrait__info {
  font-family: 'LXGW WenKai', sans-serif;
  font-size: 12px;
  color: rgba(255,255,255,0.45);
}
.ld-demo-portrait__summary {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.ld-demo-portrait__scores {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
}
.ld-demo-portrait__score-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.ld-demo-portrait__score-label {
  font-family: 'LXGW WenKai', sans-serif;
  font-size: 12px;
  color: rgba(255,255,255,0.5);
}
.ld-demo-portrait__score-value {
  font-family: 'LXGW WenKai', sans-serif;
  font-size: 22px;
  font-weight: 500;
  color: rgba(255,255,255,0.8);
}
.ld-demo-portrait__score-value--highlight {
  color: rgba(139,124,246,0.95);
}
.ld-demo-portrait__agent-summary {
  font-family: 'LXGW WenKai', sans-serif;
  font-size: 13px;
  color: rgba(255,255,255,0.6);
  line-height: 1.7;
  margin: 0;
  padding: 12px;
  background: rgba(139,124,246,0.06);
  border: 1px solid rgba(139,124,246,0.12);
  border-radius: 8px;
}
/* 报告Tab */
.ld-demo-report__content {
  font-family: 'LXGW WenKai', sans-serif;
  font-size: 13px;
  color: rgba(255,255,255,0.75);
  line-height: 1.8;
}
.ld-demo-report__section {
  margin-bottom: 16px;
}
.ld-demo-report__section h4 {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255,255,255,0.9);
  margin: 0 0 8px;
}
.ld-demo-report__section ul,
.ld-demo-report__section ol {
  margin: 8px 0;
  padding-left: 20px;
}
.ld-demo-report__section li {
  margin: 4px 0;
}
/* 报告 - 岗位卡片 */
.ld-demo-report__job-card {
  background: rgba(139,124,246,0.08);
  border: 1px solid rgba(139,124,246,0.2);
  border-radius: 10px;
  padding: 14px;
  margin-top: 8px;
}
.ld-demo-report__job-title {
  font-size: 16px;
  font-weight: 500;
  color: rgba(255,255,255,0.95);
  margin-bottom: 8px;
}
.ld-demo-report__job-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
}
.ld-demo-report__match {
  font-size: 13px;
  color: rgba(139,124,246,0.9);
  font-weight: 500;
}
.ld-demo-report__salary {
  font-size: 13px;
  color: rgba(201,162,39,0.8);
}
.ld-demo-report__job-skills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ld-demo-report__job-skills span {
  padding: 3px 10px;
  background: rgba(139,124,246,0.12);
  border: 1px solid rgba(139,124,246,0.2);
  border-radius: 4px;
  font-size: 11px;
  color: rgba(139,124,246,0.8);
}
/* 报告 - 差距列表 */
.ld-demo-report__gap-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.ld-demo-report__gap-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(255,255,255,0.03);
  border-radius: 6px;
}
.ld-demo-report__gap-label {
  font-size: 13px;
  color: rgba(255,255,255,0.6);
  width: 70px;
}
.ld-demo-report__gap-current {
  font-size: 13px;
  color: rgba(255,100,100,0.8);
}
.ld-demo-report__gap-arrow {
  color: rgba(255,255,255,0.3);
}
.ld-demo-report__gap-target {
  font-size: 13px;
  color: rgba(40,200,64,0.8);
}
/* 报告 - 行动路径 */
.ld-demo-report__path {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.ld-demo-report__path-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  transition: all 0.2s ease;
}
.ld-demo-report__path-item--active {
  background: rgba(139,124,246,0.08);
  border-color: rgba(139,124,246,0.2);
}
.ld-demo-report__path-time {
  font-size: 12px;
  font-weight: 500;
  color: rgba(139,124,246,0.9);
  min-width: 50px;
}
.ld-demo-report__path-action {
  font-size: 13px;
  color: rgba(255,255,255,0.75);
}

/* ── 信任信号 ── */
.ld-trust-section { padding: 60px clamp(20px, 5vw, 72px); }
.ld-trust-grid {
  display: flex;
  justify-content: center;
  gap: 48px;
  flex-wrap: wrap;
}
.ld-trust-item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ld-trust-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  color: rgba(201,162,39,0.7);
}
.ld-trust-text {
  font-family: 'LXGW WenKai', 'PingFang SC', sans-serif;
  font-size: 14px;
  color: rgba(255,255,255,0.6);
  letter-spacing: 0.02em;
}

/* ── Spring入场动画（CSS，滚动触发） ── */
.ld-reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.7s cubic-bezier(.22,1,.36,1), transform 0.7s cubic-bezier(.22,1,.36,1);
}
.ld-reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}
.ld-reveal:nth-child(2) { transition-delay: 0.08s; }
.ld-reveal:nth-child(3) { transition-delay: 0.16s; }

/* ── 响应式 ────────────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .ld-footer { padding: 36px 20px 32px; }
  .ld-title { letter-spacing: 0.3em; }
  .ld-pain-grid { grid-template-columns: 1fr; }
  .ld-steps { flex-direction: column; gap: 32px; }
  .ld-step { padding: 0; }
  .ld-step-sep { width: 100%; height: 1px; margin: 0; }
}

@media (max-width: 480px) {
  .ld-footer { padding: 28px 16px 24px; }
  .ld-title { font-size: clamp(18px, 5vw, 24px); letter-spacing: 0.25em; }
  .ld-cta { width: 100%; justify-content: center; }
  .ld-section { padding: 56px 16px; }
}

/* ── prefers-reduced-motion ────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .ld-nebula,
  .ld-sep,
  .ld-pulse-ring,
  .ld-starmap { animation: none !important; }
  .ld-cta,
  .ld-cta__arrow { transition: none; }
  .ld-canvas-fallback { animation: none !important; }
}

/* ── 移动端粒子优化 ────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .ld-nebula--a,
  .ld-nebula--b,
  .ld-nebula--c {
    animation-duration: 36s;
  }
  .ld-starmap {
    animation-duration: 36s;
  }
}
</style>
