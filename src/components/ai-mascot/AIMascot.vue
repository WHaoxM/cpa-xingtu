<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import lottie from 'lottie-web'
import type { AnimationItem } from 'lottie-web'
import type { ReportRecord, AIAnalysisResult, TargetRole } from '@/types'
import { analyzeReports } from '@/api/aiAnalysis'
import { ElMessage } from 'element-plus'

import RobotIdleData from '@/assets/animations/robot-idle.json'

const route = useRoute()

const props = defineProps<{
  reportRecords: ReportRecord[]
  userId?: string
  targetRoles?: TargetRole[]
}>()

const emit = defineEmits<{
  'analysis-ready': [result: AIAnalysisResult]
}>()

// ─── 状态 ───────────────────────────────────────────────────────────────────
type MascotState = 'idle' | 'thinking' | 'done'
const state = ref<MascotState>('idle')
const bubbleVisible = ref(false)
const bubbleIsDone = ref(false)

// ─── 自适应方向（左半屏 → 气泡向右；右半屏 → 气泡向左） ────────────────────
const isOnLeft = computed(() => pos.value.x < bounds.value.w / 2)

// ─── 尺寸 ────────────────────────────────────────────────────────────────────
const W = 80
const H = 80
const ROOT_H = H + 52

// ─── 位置 & 拖拽（absolute，相对父容器） ─────────────────────────────────────
const rootEl = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
const bounds = ref({ w: 0, h: 0 })
const dragState = ref({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0, moved: false })

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max)
}

function updateBounds() {
  const parent = rootEl.value?.parentElement
  if (!parent) return
  bounds.value.w = parent.clientWidth
  bounds.value.h = parent.clientHeight
}

function initPos() {
  updateBounds()
  pos.value.x = Math.max(0, bounds.value.w - W - 16)
  pos.value.y = Math.max(0, bounds.value.h - ROOT_H - 16)
}

function clampPos() {
  const maxX = Math.max(0, bounds.value.w - W)
  const maxY = Math.max(0, bounds.value.h - ROOT_H)
  pos.value.x = clamp(pos.value.x, 0, maxX)
  pos.value.y = clamp(pos.value.y, 0, maxY)
}

function onPointerDown(e: PointerEvent) {
  if (state.value === 'thinking') return
  dragState.value = {
    dragging: true,
    startX: e.clientX,
    startY: e.clientY,
    originX: pos.value.x,
    originY: pos.value.y,
    moved: false,
  }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (!dragState.value.dragging) return
  const dx = e.clientX - dragState.value.startX
  const dy = e.clientY - dragState.value.startY
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragState.value.moved = true
  const maxX = Math.max(0, bounds.value.w - W)
  const maxY = Math.max(0, bounds.value.h - ROOT_H)
  pos.value.x = clamp(dragState.value.originX + dx, 0, maxX)
  pos.value.y = clamp(dragState.value.originY + dy, 0, maxY)
}

function onPointerUp() {
  if (!dragState.value.dragging) return
  dragState.value.dragging = false
  if (!dragState.value.moved) {
    handleClick()
  }
}

// ─── 提示气泡 ────────────────────────────────────────────────────────────────
const tipVisible  = ref(false)
const tipText     = ref('')
let tipTimer:     ReturnType<typeof setTimeout> | null = null
let tipHideTimer: ReturnType<typeof setTimeout> | null = null

const TIPS: Record<string, string[]> = {
  'student-my-reports':      ['点我分析你的学习报告！', '我能帮你找出能力短板~'],
  'student-skill-graph':     ['想解读你的技能分布？点我！', '发现你的技能成长轨迹~'],
  'student-career-analysis': ['想知道你匹配哪些岗位？点我试试'],
  'student-career-navigation':['我来帮你规划职业路径！'],
  'student-favorites':       ['找到心仪岗位了吗？点我帮你分析！'],
  'dashboard':               ['有学习问题？点我帮你分析！'],
}

const DEFAULT_TIPS: string[] = ['我是你的 AI 学习助手~', '点我可以分析你的学习数据！']

function getCurrentTips(): string[] {
  const name = String(route.name ?? '')
  return TIPS[name] ?? DEFAULT_TIPS
}

function showTip() {
  if (state.value === 'thinking' || bubbleVisible.value || tipVisible.value) return
  const tips = getCurrentTips()
  tipText.value = tips[Math.floor(Math.random() * tips.length)] ?? tips[0] ?? ''
  tipVisible.value = true
  tipHideTimer = setTimeout(() => { tipVisible.value = false }, 5000)
}

function dismissTip() {
  if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = null }
  tipVisible.value = false
}

function scheduleTip() {
  if (tipTimer) { clearTimeout(tipTimer); tipTimer = null }
  const delay = 12000 + Math.random() * 18000
  tipTimer = setTimeout(() => { showTip(); scheduleTip() }, delay)
}

// ─── Lottie 待机动画（始终循环播放） ─────────────────────────────────────────
const lottieContainer = ref<HTMLDivElement | null>(null)
let anim: AnimationItem | null = null

function initAnim() {
  if (!lottieContainer.value) return
  anim = lottie.loadAnimation({
    container: lottieContainer.value,
    animationData: RobotIdleData as object,
    renderer: 'svg',
    loop: true,
    autoplay: true,
  })
}

// ─── 点击分析 ────────────────────────────────────────────────────────────────
async function handleClick() {
  if (state.value === 'thinking') return
  dismissTip()

  state.value = 'thinking'
  bubbleIsDone.value = false
  bubbleVisible.value = true

  try {
    const result = await analyzeReports(props.userId ?? 'unknown', props.reportRecords, props.targetRoles ?? [])
    bubbleIsDone.value = true
    state.value = 'done'
    await new Promise(r => setTimeout(r, 1000))
    bubbleVisible.value = false
    await new Promise(r => setTimeout(r, 250))
    emit('analysis-ready', result)
  } catch (error) {
    bubbleVisible.value = false
    const message = error instanceof Error ? error.message : '成长分析暂不可用，请稍后重试'
    ElMessage.error(message)
  }

  state.value = 'idle'
}

// ─── ResizeObserver ───────────────────────────────────────────────────────────
let resizeObs: ResizeObserver | null = null

// ─── 生命周期 ────────────────────────────────────────────────────────────────
onMounted(() => {
  initPos()
  const parent = rootEl.value?.parentElement
  if (parent) {
    resizeObs = new ResizeObserver(() => { updateBounds(); clampPos() })
    resizeObs.observe(parent)
  }
  setTimeout(() => { initAnim() }, 300)
  setTimeout(() => { showTip(); scheduleTip() }, 5000)
})

onBeforeUnmount(() => {
  anim?.destroy()
  anim = null
  resizeObs?.disconnect()
  if (tipTimer)     { clearTimeout(tipTimer);     tipTimer = null }
  if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = null }
})
</script>

<template>
  <div
    ref="rootEl"
    class="mascot-root"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <!-- 分析气泡 -->
    <Transition name="bubble">
      <div
        v-if="bubbleVisible"
        class="mascot-bubble"
        :class="isOnLeft ? 'bubble-left' : 'bubble-right'"
      >
        <template v-if="!bubbleIsDone">
          <span class="dot" />
          <span class="dot" />
          <span class="dot" />
        </template>
        <template v-else>
          <span class="bubble-bulb">💡</span>
        </template>
      </div>
    </Transition>

    <!-- 提示气泡 -->
    <Transition name="bubble">
      <div
        v-if="tipVisible"
        class="mascot-tip"
        :class="isOnLeft ? 'bubble-left' : 'bubble-right'"
        @click="dismissTip"
      >
        <span class="tip-text">{{ tipText }}</span>
        <div class="tip-bar" />
      </div>
    </Transition>

    <!-- Lottie 动画容器（替换原 SVG 机器人） -->
    <div
      ref="lottieContainer"
      class="mascot-lottie"
      :class="{ 'is-thinking': state === 'thinking', 'is-clickable': state === 'idle' }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.mascot-root {
  position: absolute;
  z-index: 100;
  width: 80px;
  height: 132px;
  user-select: none;
  touch-action: none;
  cursor: grab;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.mascot-root:active {
  cursor: grabbing;
}

.mascot-lottie {
  width: 80px;
  height: 80px;
  display: block;
  flex-shrink: 0;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.10));
  transition: filter 0.2s, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.mascot-lottie.is-clickable:hover {
  filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.18));
  transform: scale(1.08);
}

.mascot-lottie.is-thinking {
  cursor: wait;
}

/* ─── 气泡公共基础 ─────────────────────────────────────────────────────────── */
.mascot-bubble,
.mascot-tip {
  position: absolute;
  top: 48px;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  box-shadow: var(--shadow-md);
  white-space: nowrap;
  z-index: 10;
}

.mascot-bubble {
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  pointer-events: none;
}

.mascot-tip {
  padding: 8px 12px 4px;
  width: 150px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.5;
  font-size: 12px;
  cursor: pointer;
  pointer-events: auto;
  overflow: hidden;
}

/* ─── 方向：气泡在右侧（机器人在左半屏）────────────────────────────────────── */
.bubble-left {
  left: 100%;
  right: auto;
  border-radius: 4px 12px 12px 12px;
}

.bubble-left::after {
  content: '';
  position: absolute;
  top: 12px;
  left: -8px;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-right: 8px solid var(--color-surface);
}

/* ─── 方向：气泡在左侧（机器人在右半屏）────────────────────────────────────── */
.bubble-right {
  right: 100%;
  left: auto;
  border-radius: 12px 4px 12px 12px;
}

.bubble-right::after {
  content: '';
  position: absolute;
  top: 12px;
  right: -8px;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 8px solid var(--color-surface);
}

.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-500);
  animation: dot-bounce 1.2s ease-in-out infinite;
}

.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
  40%           { transform: translateY(-5px); opacity: 1; }
}

.bubble-bulb {
  font-size: 16px;
  line-height: 1;
  animation: bulb-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes bulb-pop {
  from { transform: scale(0.4); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}

/* ─── 提示气泡文字与倒计时条 ─────────────────────────────────────────────────── */
.tip-text {
  display: block;
  color: var(--color-text);
  padding-bottom: 6px;
  animation: fade-in 0.3s ease forwards;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.tip-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: var(--color-primary, #d4622a);
  border-radius: 0 0 0 0;
  animation: tip-countdown 5s linear forwards;
  transform-origin: left center;
}

@keyframes tip-countdown {
  from { width: 100%; }
  to   { width: 0%; }
}

/* 气泡过渡 */
.bubble-enter-active {
  transition: opacity 0.2s, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.bubble-leave-active {
  transition: opacity 0.18s ease-in, transform 0.18s ease-in;
}
.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: scale(0.8) translateY(4px);
}

@media (max-width: 768px) {
  .mascot-root {
    width: 64px;
    height: 116px;
  }
  .mascot-lottie {
    width: 64px;
    height: 64px;
  }
}
</style>
