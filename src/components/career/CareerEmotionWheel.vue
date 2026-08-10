<!-- 情绪轮组件：MILO风格旋转情绪选择器，适配职导星图配色 -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { gsap } from '@/plugins/gsap'

interface Emotion {
  id: string
  label: string
  angle: number
  color: string
}

const props = withDefaults(defineProps<{
  emotions?: Emotion[]
  size?: number
}>(), {
  size: 320,
})

const emit = defineEmits<{
  (e: 'select', emotion: Emotion): void
}>()

// 默认情绪列表（适配职导星图主题）
const defaultEmotions: Emotion[] = [
  { id: 'lost',     label: '迷茫',   angle: 0,    color: 'rgba(139,124,246,0.8)' },
  { id: 'anxious',  label: '焦虑',   angle: 45,   color: 'rgba(240,166,202,0.8)' },
  { id: 'curious',  label: '好奇',   angle: 90,   color: 'rgba(201,162,39,0.8)' },
  { id: 'excited',  label: '兴奋',   angle: 135,  color: 'rgba(139,124,246,0.8)' },
  { id: 'calm',     label: '平静',   angle: 180,  color: 'rgba(220,214,255,0.8)' },
  { id: 'confused', label: '困惑',   angle: 225,  color: 'rgba(240,166,202,0.8)' },
  { id: 'hopeful',  label: '期待',   angle: 270,  color: 'rgba(201,162,39,0.8)' },
  { id: 'confident',label: '自信',   angle: 315,  color: 'rgba(139,124,246,0.8)' },
]

const emotions = computed(() => props.emotions || defaultEmotions)
const selectedIndex = ref(3) // 默认选中"兴奋"
const wheelRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const startAngle = ref(0)
const currentRotation = ref(0)

const selectedEmotion = computed(() => emotions.value[selectedIndex.value])

// 计算每个情绪的位置
function getEmotionPosition(emotion: Emotion, index: number) {
  const angle = (emotion.angle + currentRotation.value) * (Math.PI / 180)
  const radius = props.size * 0.38
  const x = Math.cos(angle) * radius
  const y = Math.sin(angle) * radius
  return { x, y, angle: emotion.angle + currentRotation.value }
}

// 鼠标拖拽旋转
function onPointerDown(e: PointerEvent) {
  if (!wheelRef.value) return
  isDragging.value = true
  const rect = wheelRef.value.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  startAngle.value = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI)
  wheelRef.value.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value || !wheelRef.value) return
  const rect = wheelRef.value.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI)
  const delta = angle - startAngle.value
  currentRotation.value += delta
  startAngle.value = angle

  // 计算最近的情绪
  const normalizedRotation = ((currentRotation.value % 360) + 360) % 360
  const segmentAngle = 360 / emotions.value.length
  const newIndex = Math.round(normalizedRotation / segmentAngle) % emotions.value.length
  if (newIndex !== selectedIndex.value) {
    selectedIndex.value = newIndex
    emit('select', selectedEmotion.value)
  }
}

function onPointerUp() {
  isDragging.value = false
}

// 点击选择情绪
function selectEmotion(index: number) {
  selectedIndex.value = index
  const targetRotation = -emotions.value[index].angle
  gsap.to(currentRotation, {
    value: targetRotation,
    duration: 0.6,
    ease: 'power3.out',
  })
  emit('select', selectedEmotion.value)
}

// 中心水晶球动画
const ballRef = ref<HTMLElement | null>(null)
let ballAnimation: gsap.core.Tween | null = null

onMounted(() => {
  if (ballRef.value) {
    ballAnimation = gsap.to(ballRef.value, {
      scale: 1.02,
      duration: 2,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    })
  }
})

onBeforeUnmount(() => {
  ballAnimation?.kill()
})
</script>

<template>
  <div
    ref="wheelRef"
    class="emotion-wheel"
    :style="{ width: `${size}px`, height: `${size}px` }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <!-- 外圈装饰 -->
    <div class="wheel-ring wheel-ring--outer" />
    <div class="wheel-ring wheel-ring--inner" />

    <!-- 情绪标签 -->
    <div
      v-for="(emotion, index) in emotions"
      :key="emotion.id"
      class="emotion-label"
      :class="{ 'is-selected': index === selectedIndex }"
      :style="{
        transform: `translate(${getEmotionPosition(emotion, index).x}px, ${getEmotionPosition(emotion, index).y}px)`,
        color: emotion.color,
      }"
      @click.stop="selectEmotion(index)"
    >
      {{ emotion.label }}
    </div>

    <!-- 中心水晶球 -->
    <div ref="ballRef" class="crystal-ball">
      <div class="crystal-ball__glow" />
      <div class="crystal-ball__surface">
        <div class="crystal-ball__face">
          <div class="crystal-ball__eyes">
            <span class="crystal-ball__eye crystal-ball__eye--left" />
            <span class="crystal-ball__eye crystal-ball__eye--right" />
          </div>
          <div class="crystal-ball__mouth" />
        </div>
      </div>
    </div>

    <!-- 当前选中情绪显示 -->
    <div class="selected-emotion">
      <div class="selected-emotion__label">{{ selectedEmotion.label }}</div>
      <div class="selected-emotion__hint">沿圆环旋转，或点击任意情绪直接切换</div>
    </div>
  </div>
</template>

<style scoped>
.emotion-wheel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.emotion-wheel:active {
  cursor: grabbing;
}

/* 外圈装饰 */
.wheel-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

.wheel-ring--outer {
  width: 100%;
  height: 100%;
  animation: pulse-ring 4s ease-in-out infinite;
}

.wheel-ring--inner {
  width: 76%;
  height: 76%;
  border-color: rgba(139, 124, 246, 0.12);
}

@keyframes pulse-ring {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.02); }
}

/* 情绪标签 */
.emotion-label {
  position: absolute;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  padding: 6px 12px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.emotion-label:hover {
  background: rgba(139, 124, 246, 0.15);
  transform: translate(var(--x), var(--y)) scale(1.1) !important;
}

.emotion-label.is-selected {
  background: rgba(139, 124, 246, 0.2);
  border: 1px solid rgba(139, 124, 246, 0.3);
  box-shadow: 0 0 20px rgba(139, 124, 246, 0.2);
}

/* 中心水晶球 */
.crystal-ball {
  position: absolute;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 30% 30%,
    rgba(220, 214, 255, 0.9) 0%,
    rgba(139, 124, 246, 0.4) 40%,
    rgba(19, 19, 26, 0.8) 100%
  );
  box-shadow:
    0 0 40px rgba(139, 124, 246, 0.3),
    inset 0 0 30px rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.crystal-ball__glow {
  position: absolute;
  width: 180%;
  height: 180%;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(139, 124, 246, 0.15) 0%,
    transparent 70%
  );
  animation: glow-pulse 3s ease-in-out infinite;
}

@keyframes glow-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
}

.crystal-ball__surface {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(
    circle at 30% 30%,
    rgba(255, 255, 255, 0.15) 0%,
    transparent 50%
  );
  display: flex;
  align-items: center;
  justify-content: center;
}

.crystal-ball__face {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.crystal-ball__eyes {
  display: flex;
  gap: 16px;
}

.crystal-ball__eye {
  width: 8px;
  height: 4px;
  background: rgba(19, 19, 26, 0.8);
  border-radius: 4px;
  transform: translateY(-2px);
}

.crystal-ball__mouth {
  width: 12px;
  height: 6px;
  border: 2px solid rgba(19, 19, 26, 0.6);
  border-top: none;
  border-radius: 0 0 12px 12px;
}

/* 当前选中情绪显示 */
.selected-emotion {
  position: absolute;
  bottom: -80px;
  text-align: center;
  color: rgba(255, 255, 255, 0.9);
}

.selected-emotion__label {
  font-size: 24px;
  font-weight: 300;
  letter-spacing: 0.15em;
  margin-bottom: 8px;
}

.selected-emotion__hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.05em;
}

/* 响应式 */
@media (max-width: 768px) {
  .emotion-label {
    font-size: 12px;
    padding: 4px 10px;
  }

  .crystal-ball {
    width: 100px;
    height: 100px;
  }

  .selected-emotion__label {
    font-size: 20px;
  }
}
</style>
