<!-- 页面：职业能力图谱 Shell；路由：student/career-ability；角色：STUDENT -->
<script setup lang="ts">
import { ref, computed, provide, onMounted, onBeforeUnmount, watch, nextTick, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import UserInfoBar from '@/components/UserInfoBar.vue'
import { useResumeStore } from '@/stores/resume'
import {
  getAbilityGraphData,
  GROUP_COLORS, GROUP_LABELS, RELATION_STYLES,
  type AbilityNode, type AbilityEdge,
} from '@/composables/useAbilityGraph'
import { useGraphGeneration, edgeId } from '@/composables/useGraphGeneration'
import type { LayoutMode } from '@/types'
import CareerAbilityG6Canvas from '@/components/career/CareerAbilityG6Canvas.vue'
import CareerAbilityBubbleMap from '@/components/career/CareerAbilityBubbleMap.vue'
import CareerAbilityGraph from './CareerAbilityGraph.vue'
import CareerAbilityDual from './CareerAbilityDual.vue'
import CareerAbilityWorkspace from './CareerAbilityWorkspace.vue'

defineOptions({ name: 'CareerAbilityShell' })

const route = useRoute()
const router = useRouter()
const resumeStore = useResumeStore()

/* 已掌握技能集合（供子组件高亮用） */
const masteredSkillNames = computed(() =>
  new Set(resumeStore.parsedSkills.map(s => s.name.toLowerCase()))
)

const roleName = computed(() => (route.query.role as string) || '前端开发')

function goBack() { router.back() }
function goToCareerAnalysis() { router.push({ name: 'student-career-analysis' }) }

/* ═══ 布局模式：同一路由内切换，不依赖子路由 ═══ */
const layoutMode = ref<LayoutMode>('split')
const graphDisplay = ref<'bubbles' | 'relations'>('bubbles')
const isSplit = computed(() => layoutMode.value === 'split')
const isWorkspace = computed(() => layoutMode.value === 'workspace')

function toggleLayout() {
  layoutMode.value = layoutMode.value === 'single' ? 'split' : 'single'
}

/* ═══ 图谱状态 ═══ */
const allNodes = shallowRef<AbilityNode[]>([])
const allEdges = shallowRef<AbilityEdge[]>([])
const collapsedBoards = ref<Set<string>>(new Set())
const showEdgeLabels = ref(false)
const graphCanvasRef = ref<InstanceType<typeof CareerAbilityG6Canvas> | null>(null)
const graphLoading = ref(true)
const graphEmpty = computed(() => !graphLoading.value && allNodes.value.length === 0)
const inspectorOpen = ref(false)
const nodeSearch = ref('')
const selectedNodeId = ref<string | null>(null)
const selectedNode = computed(() => allNodes.value.find(n => n.id === selectedNodeId.value) ?? null)
const searchResults = computed(() => {
  const query = nodeSearch.value.trim().toLocaleLowerCase()
  return allNodes.value.filter(n => query ? n.name.toLocaleLowerCase().includes(query) : n.level === 1).slice(0, 8)
})
const selectedRelations = computed(() => {
  if (!selectedNodeId.value) return []
  return allEdges.value.flatMap(edge => {
    if (edge.source !== selectedNodeId.value && edge.target !== selectedNodeId.value) return []
    const otherId = edge.source === selectedNodeId.value ? edge.target : edge.source
    const other = allNodes.value.find(n => n.id === otherId)
    return other ? [{ edge, other, outgoing: edge.source === selectedNodeId.value }] : []
  })
})
const gen = useGraphGeneration(allNodes, allEdges)

/* ═══ 数据加载 ═══ */
async function loadData() {
  gen.stop()
  graphLoading.value = true
  const data = await getAbilityGraphData(roleName.value)
  allNodes.value = data.nodes
  allEdges.value = data.edges
  selectedNodeId.value = null
  inspectorOpen.value = false
  nodeSearch.value = ''
  // 37 个节点无法在双栏内同时保持可读；先呈现岗位与四大板块，点击后钻取一个能力簇。
  collapsedBoards.value = new Set(data.nodes.filter(node => node.level === 1).map(node => node.id))
  graphLoading.value = false
  await nextTick()
  gen.start()
}

/* ═══ 可见节点/边（受渐进生成 + 折叠双重过滤） ═══ */
const visibleNodes = computed(() => {
  const c = collapsedBoards.value
  const revealed = gen.visibleNodeIds.value
  const done = gen.isDone.value
  return allNodes.value.filter(n => {
    if (!done && !revealed.has(n.id)) return false
    if (c.size > 0 && n.level > 1 && c.has(n.parentId || '')) return false
    return true
  })
})
const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(n => n.id)))
const visibleEdges = computed(() => {
  const ids = visibleNodeIds.value
  const revealedEdges = gen.visibleEdgeIds.value
  const done = gen.isDone.value
  return allEdges.value.filter(e => {
    if (!ids.has(e.source) || !ids.has(e.target)) return false
    if (!done && !revealedEdges.has(edgeId(e))) return false
    return true
  })
})

/* ═══ G6 图谱事件：画布交互由开源组件处理，业务查询留在页面 ═══ */
function onGraphNodeClick(id: string) {
  const node = allNodes.value.find(n => n.id === id)
  if (!node) return
  selectedNodeId.value = id
  inspectorOpen.value = true
  if (node.level === 1) {
    collapsedBoards.value = new Set(allNodes.value.filter(item => item.level === 1 && item.id !== id).map(item => item.id))
  }
}
function selectNodeById(id: string) {
  const node = allNodes.value.find(n => n.id === id)
  if (!node) return
  selectedNodeId.value = id
  inspectorOpen.value = true
  nodeSearch.value = ''
  if (node.level === 1) {
    collapsedBoards.value = new Set(allNodes.value.filter(item => item.level === 1 && item.id !== id).map(item => item.id))
  } else if (node.parentId && node.level > 1) {
    collapsedBoards.value = new Set(allNodes.value.filter(item => item.level === 1 && item.id !== node.parentId).map(item => item.id))
  }
  nextTick(() => graphCanvasRef.value?.focusNode(id))
}
function closeInspector() {
  inspectorOpen.value = false
  selectedNodeId.value = null
}
function openInspector() {
  inspectorOpen.value = true
}
function refreshLayout() {
  graphCanvasRef.value?.resetView()
}
function toggleAllBoards() {
  const boardIds = allNodes.value.filter(n => n.level === 1).map(n => n.id)
  collapsedBoards.value = collapsedBoards.value.size ? new Set() : new Set(boardIds)
}
function toggleSelectedBoard() {
  const node = selectedNode.value
  if (!node || node.level !== 1) return
  const next = new Set(collapsedBoards.value)
  if (next.has(node.id)) next.delete(node.id)
  else next.add(node.id)
  collapsedBoards.value = next
}
/* ═══ Provide 共享状态给嵌入的子组件 ═══ */
provide('shared-graph', {
  allNodes, allEdges, visibleNodes, visibleEdges, roleName,
  showEdgeLabels, collapsedBoards,
  refreshLayout, toggleAllBoards, openInspector, layoutMode, toggleLayout,
  masteredSkillNames,
  graphLoading, graphEmpty,
  gen,
})

watch(layoutMode, () => {
  if (layoutMode.value === 'workspace') inspectorOpen.value = false
})

/* ═══ 生命周期 ═══ */
onMounted(async () => {
  await loadData()
})
onBeforeUnmount(() => {
  gen.stop()
})
watch(roleName, () => loadData())
</script>

<template>
  <div class="shell-page">
    <!-- ═══ 顶栏 ═══ -->
    <header class="shell-header">
      <div class="shell-header__left">
        <button class="shell-back" @click="goBack" title="返回">
          <Icon icon="lucide:arrow-left" :width="16" />
          <span>返回</span>
        </button>
        <div class="shell-brand">
          <span class="shell-brand__title">职业能力复合图谱 · {{ roleName }}</span>
        </div>
      </div>

      <div class="shell-layout-toggle">
        <button
          class="shell-toggle-btn"
          :class="{ 'shell-toggle-btn--active': layoutMode === 'single' }"
          @click="layoutMode = 'single'"
        >
          <Icon icon="lucide:maximize" :width="14" />
          <span>图谱</span>
        </button>
        <button
          class="shell-toggle-btn"
          :class="{ 'shell-toggle-btn--active': layoutMode === 'split' }"
          @click="layoutMode = 'split'"
        >
          <Icon icon="lucide:columns" :width="14" />
          <span>双栏</span>
        </button>
        <button
          class="shell-toggle-btn"
          :class="{ 'shell-toggle-btn--active': isWorkspace }"
          @click="layoutMode = 'workspace'"
        >
          <Icon icon="lucide:layout-dashboard" :width="14" />
          <span>工作台</span>
        </button>
      </div>

      <div class="shell-header__right">
        <span class="shell-scroll-label">卷2/3</span>
        <UserInfoBar />
      </div>
    </header>

    <!-- ═══ 内容区：图谱始终可见 + 右侧面板滑入/滑出 ═══ -->
    <div class="shell-body" :class="'shell-body--' + layoutMode">
      <!-- 图区域始终挂载，布局切换时由 ResizeObserver 同步画布尺寸 -->
      <div class="shell-graph">
        <div v-if="!graphLoading && !graphEmpty" class="shell-map-mode" role="group" aria-label="图谱呈现方式">
          <button
            type="button"
            :class="{ 'shell-map-mode__button--active': graphDisplay === 'bubbles' }"
            :aria-pressed="graphDisplay === 'bubbles'"
            @click="graphDisplay = 'bubbles'"
          >
            <Icon icon="lucide:circle-dot" :width="14" />
            <span>气泡总览</span>
          </button>
          <button
            type="button"
            :class="{ 'shell-map-mode__button--active': graphDisplay === 'relations' }"
            :aria-pressed="graphDisplay === 'relations'"
            @click="graphDisplay = 'relations'"
          >
            <Icon icon="lucide:git-branch" :width="14" />
            <span>关系网络</span>
          </button>
        </div>
        <button
          v-if="!graphLoading && !graphEmpty && graphDisplay === 'bubbles'"
          type="button"
          class="shell-bubble-search"
          title="查找技能"
          aria-label="查找技能"
          @click="openInspector"
        >
          <Icon icon="lucide:search" :width="15" />
        </button>
        <CareerAbilityBubbleMap
          v-if="!graphLoading && !graphEmpty && graphDisplay === 'bubbles'"
          class="shell-chart"
          :nodes="allNodes"
          :edges="allEdges"
          :selected-node-id="selectedNodeId"
          :role-name="roleName"
          @node-click="selectNodeById"
          @canvas-click="closeInspector"
        />
        <CareerAbilityG6Canvas
          v-else-if="!graphLoading && !graphEmpty && graphDisplay === 'relations'"
          ref="graphCanvasRef"
          class="shell-chart"
          :nodes="visibleNodes"
          :edges="visibleEdges"
          :selected-node-id="selectedNodeId"
          :show-edge-labels="showEdgeLabels"
          :role-name="roleName"
          @node-click="onGraphNodeClick"
          @canvas-click="closeInspector"
        />
        <!-- 图谱叠加层：工具栏 + 图例 -->
        <CareerAbilityGraph v-if="!graphEmpty && !graphLoading && graphDisplay === 'relations'" />
        <div v-if="graphLoading" class="shell-graph-state" role="status">正在读取能力图谱…</div>
        <div v-else-if="graphEmpty" class="shell-graph-state shell-graph-state--empty" role="status">
          <div class="shell-graph-state__eyebrow">职业能力复合图谱</div>
          <Icon icon="lucide:workflow" :width="30" />
          <h2>该岗位暂无图谱数据</h2>
          <p>当前岗位尚未收录技能节点与关系。你可以返回职业分析，查看其它已收录岗位。</p>
          <button @click="goToCareerAnalysis">返回职业分析</button>
        </div>
        <div v-else-if="selectedNode" class="shell-focus" role="status" aria-live="polite">
          <span class="shell-focus__dot" :style="{ background: GROUP_COLORS[selectedNode.group] }"></span>
          <span>聚焦 <strong>{{ selectedNode.name }}</strong><small> · {{ selectedRelations.length }} 条直接关系</small></span>
          <button @click="closeInspector" aria-label="清除图谱聚焦" title="清除聚焦"><Icon icon="lucide:x" :width="14" /></button>
        </div>
        <div v-else-if="graphDisplay === 'relations'" class="shell-graph-guide">点击板块展开技能 · 拖动节点探索 · 滚轮缩放</div>
      </div>
      <!-- 右侧面板（始终挂载，CSS 控制宽度与可见性） -->
      <div class="shell-panel">
        <CareerAbilityDual />
      </div>
      <!-- 工作台（始终挂载，CSS 控制可见性） -->
      <div class="shell-workspace">
        <CareerAbilityWorkspace />
      </div>
      <aside v-if="inspectorOpen && !isWorkspace && !graphEmpty" class="node-inspector" aria-label="图谱节点查询">
        <div class="node-inspector__head">
          <div>
            <span class="node-inspector__eyebrow">职业能力 · 节点查询</span>
            <h2>{{ selectedNode ? selectedNode.name : '查找图谱节点' }}</h2>
          </div>
          <button class="node-inspector__close" @click="closeInspector" aria-label="关闭节点详情">
            <Icon icon="lucide:x" :width="18" />
          </button>
        </div>
        <div class="node-inspector__body">
          <label class="node-inspector__search">
            <Icon icon="lucide:search" :width="16" />
            <input v-model="nodeSearch" placeholder="搜索当前图谱中的技能" aria-label="搜索图谱节点" />
          </label>
          <div v-if="nodeSearch || !selectedNode" class="node-inspector__results">
            <div class="node-inspector__section-title">{{ nodeSearch ? '匹配节点' : '技能板块' }}</div>
            <button v-for="item in searchResults" :key="item.id" @click="selectNodeById(item.id)">
              <span class="node-inspector__dot" :style="{ background: GROUP_COLORS[item.group] }"></span>
              <span>{{ item.name }}</span>
              <Icon icon="lucide:arrow-up-right" :width="14" />
            </button>
            <p v-if="!searchResults.length">当前图谱中没有匹配的节点。</p>
          </div>
          <template v-if="selectedNode">
            <div class="node-inspector__meta">
              <span class="node-inspector__tag" :style="{ color: GROUP_COLORS[selectedNode.group] }">{{ GROUP_LABELS[selectedNode.group] }}</span>
              <span>所属岗位：{{ roleName }}</span>
            </div>
            <button v-if="selectedNode.level === 1" class="node-inspector__board-toggle" @click="toggleSelectedBoard">
              <Icon :icon="collapsedBoards.has(selectedNode.id) ? 'lucide:chevrons-down' : 'lucide:chevrons-up'" :width="15" />
              {{ collapsedBoards.has(selectedNode.id) ? '展开该板块技能' : '收起该板块技能' }}
            </button>
            <div v-if="selectedNode.heat != null" class="node-inspector__heat">
              <div><span>节点热度</span><strong>{{ selectedNode.heat }}</strong></div>
              <div class="node-inspector__heat-track"><span :style="{ width: `${Math.max(0, Math.min(100, selectedNode.heat))}%`, background: GROUP_COLORS[selectedNode.group] }"></span></div>
            </div>
            <section class="node-inspector__relations">
              <h3>当前图谱中的关系 <span>{{ selectedRelations.length }}</span></h3>
              <button v-for="(item, index) in selectedRelations" :key="`${item.edge.source}-${item.edge.target}-${index}`" @click="selectNodeById(item.other.id)">
                <span class="node-inspector__relation-kind">{{ RELATION_STYLES[item.edge.relation].label }}</span>
                <span class="node-inspector__relation-name">{{ item.outgoing ? '→' : '←' }} {{ item.other.name }}<small v-if="item.edge.label">{{ item.edge.label }}</small></span>
                <Icon icon="lucide:chevron-right" :width="14" />
              </button>
              <p v-if="!selectedRelations.length">当前图谱暂无关联关系。</p>
            </section>
            <p class="node-inspector__source">仅展示当前图谱已有的节点字段和关系，不推断未提供的说明。</p>
          </template>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ═══ Shell 根 ═══ */
.shell-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-100, #F5F5F3);
  color: var(--text-100, #111);
  font-family: var(--font-title), sans-serif;
  overflow: hidden;
}

/* ═══ 顶栏 ═══ */
.shell-header {
  position: relative;
  z-index: 10;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 10px 24px;
  background: var(--bg-200, #EDEDEB);
  border-bottom: 1px solid var(--bg-300, #CBCBC8);
  flex-shrink: 0;
}
.shell-header__left { display: flex; align-items: center; gap: 14px; justify-self: start; }
.shell-header__right { display: flex; align-items: center; gap: 16px; justify-self: end; }

.shell-back {
  display: inline-flex; align-items: center; gap: 4px;
  background: transparent; border: 1px solid var(--bg-300);
  color: var(--primary-100, #8B2500); padding: 5px 12px; font-family: inherit; font-size: 13px;
  cursor: pointer; transition: all 0.2s ease; border-radius: var(--radius-sm, 2px);
}
.shell-back:hover { border-color: var(--primary-100); background: rgba(139,37,0,0.06); }

.shell-brand { display: flex; align-items: center; }
.shell-brand__title {
  font-size: 15px; font-weight: 600; letter-spacing: 0.06em; color: var(--text-100);
  white-space: nowrap;
}

/* ═══ 布局切换按钮组 ═══ */
.shell-layout-toggle {
  justify-self: center;
  display: flex; align-items: center; gap: 0;
  background: var(--bg-100, #F5F5F3);
  border: 1px solid var(--bg-300, #CBCBC8);
  border-radius: var(--radius-md, 3px);
  overflow: hidden;
}
.shell-toggle-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 22px; font-size: 13px; font-weight: 600;
  font-family: inherit; letter-spacing: 0.08em;
  background: transparent; border: none; cursor: pointer;
  color: var(--text-200, #666);
  transition: all 0.2s ease;
}
.shell-toggle-btn + .shell-toggle-btn { border-left: 1px solid var(--bg-300, #CBCBC8); }
.shell-toggle-btn:hover { color: var(--primary-100, #8B2500); background: rgba(139,37,0,0.04); }
.shell-toggle-btn--active {
  color: var(--primary-100, #8B2500);
  background: var(--bg-200, #EDEDEB);
  box-shadow: inset 0 -2px 0 var(--primary-100, #8B2500);
}

.shell-scroll-label {
  font-size: 16px; font-weight: 600; color: var(--primary-100);
  letter-spacing: 0.08em; font-variant-numeric: tabular-nums;
}


/* ═══ 内容区 ═══ */
.shell-body {
  flex: 1; min-height: 0;
  display: flex;
  position: relative;
  overflow: hidden;
}

/* 图谱容器始终挂载；切换布局时直接定宽，避免逐帧重排 G6 画布。 */
.shell-graph {
  position: relative;
  flex-shrink: 0;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  background: radial-gradient(circle at 50% 50%, #fff 0%, var(--bg-100, #F5F5F3) 80%);
}
.shell-chart { width: 100%; height: 100%; }
.shell-map-mode {
  position: absolute;
  top: 13px;
  left: 18px;
  z-index: 12;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px;
  border: 1px solid rgba(118, 105, 86, .22);
  background: rgba(250, 248, 243, .86);
  box-shadow: 0 5px 18px rgba(71, 58, 39, .08);
  backdrop-filter: blur(10px);
}
.shell-map-mode button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 11px;
  border: 0;
  background: transparent;
  color: #70685d;
  font: inherit;
  font-size: 11px;
  letter-spacing: .04em;
  cursor: pointer;
  transition: color .18s ease, background .18s ease, box-shadow .18s ease;
}
.shell-map-mode button:hover { color: #9b3b20; }
.shell-map-mode button:focus-visible { outline: 2px solid #9b3b20; outline-offset: 2px; }
.shell-map-mode .shell-map-mode__button--active {
  background: rgba(255, 255, 255, .82);
  color: #9b3b20;
  box-shadow: 0 1px 5px rgba(61, 48, 29, .12);
}
.shell-map-mode .shell-map-mode__button--active svg { filter: drop-shadow(0 0 4px rgba(190, 42, 0, .32)); }
.shell-bubble-search {
  position: absolute;
  top: 13px;
  right: 18px;
  z-index: 12;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(118, 105, 86, .22);
  background: rgba(250, 248, 243, .86);
  color: #766b5d;
  box-shadow: 0 5px 18px rgba(71, 58, 39, .08);
  backdrop-filter: blur(10px);
  cursor: pointer;
  transition: color .18s ease, border-color .18s ease, transform .18s ease;
}
.shell-bubble-search:hover { color: #9b3b20; border-color: rgba(155, 59, 32, .44); transform: translateY(-1px); }
.shell-bubble-search:focus-visible { outline: 2px solid #9b3b20; outline-offset: 2px; }
.shell-graph-state {
  position: absolute; inset: 0; z-index: 6;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-200); font-size: 13px;
}
.shell-graph-state--empty {
  flex-direction: column; gap: 12px; text-align: center;
  padding: 30px; color: var(--text-200);
}
.shell-graph-state--empty > svg { color: var(--primary-100); }
.shell-graph-state__eyebrow {
  color: var(--primary-100); font-size: 11px; font-weight: 700;
  letter-spacing: .16em;
}
.shell-graph-state h2 { margin: 0; color: var(--text-100); font-size: 19px; }
.shell-graph-state p { max-width: 340px; margin: 0; line-height: 1.7; }
.shell-graph-state button {
  margin-top: 8px; padding: 9px 18px;
  border: 1px solid var(--primary-100); border-radius: var(--radius-sm);
  background: var(--primary-100); color: #fff; font: inherit; cursor: pointer;
}
.shell-graph-state button:hover { background: var(--primary-300); }
.shell-graph-guide {
  position: absolute; right: 20px; bottom: 20px; z-index: 5;
  color: var(--text-300); font-size: 11px; pointer-events: none;
}
.shell-focus {
  position: absolute; left: 20px; top: 60px; z-index: 6;
  display: flex; align-items: center; gap: 9px; max-width: calc(100% - 40px);
  padding: 9px 10px 9px 12px; border: 1px solid var(--color-border);
  background: var(--color-surface); box-shadow: 0 7px 20px rgba(26,26,26,.1);
  color: var(--color-text-muted); font-size: 12px;
}
.shell-focus__dot { width: 9px; height: 9px; flex: none; border-radius: 50%; }
.shell-focus strong { color: var(--color-text); font-size: 13px; }
.shell-focus small { color: var(--color-text-muted); font-size: 11px; }
.shell-focus button {
  display: grid; place-items: center; width: 24px; height: 24px; margin-left: 6px;
  border: 0; background: var(--color-background); color: var(--color-text-muted); cursor: pointer;
}
.shell-focus button:hover { color: var(--color-primary); }

/* 节点查询与关系浏览：覆盖右侧分析栏，不压缩图谱布局。 */
.node-inspector {
  position: absolute; top: 0; right: 0; bottom: 0; z-index: 30;
  display: flex; flex-direction: column;
  width: min(380px, 47%); min-width: 320px;
  background: var(--color-surface, #fff);
  border-left: 1px solid var(--color-border);
  box-shadow: -14px 0 36px rgba(26,26,26,.11);
  animation: inspector-enter .22s ease-out;
}
@keyframes inspector-enter { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
.node-inspector__head {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
  padding: 24px 24px 20px; border-bottom: 1px solid var(--color-border);
}
.node-inspector__eyebrow { color: var(--color-primary); font-size: 11px; font-weight: 700; letter-spacing: .12em; }
.node-inspector__head h2 { margin: 8px 0 0; font-size: 22px; line-height: 1.35; color: var(--color-text); }
.node-inspector__close {
  display: grid; place-items: center; flex: none; width: 32px; height: 32px;
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  background: #fff; color: var(--color-text-muted); cursor: pointer;
}
.node-inspector__close:hover { color: var(--color-primary); border-color: var(--color-primary); }
.node-inspector__body { flex: 1; min-height: 0; overflow: auto; padding: 22px 24px 28px; }
.node-inspector__search {
  display: flex; align-items: center; gap: 9px; padding: 10px 12px;
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  color: var(--color-text-muted); background: var(--color-background);
}
.node-inspector__search:focus-within { border-color: var(--color-primary); }
.node-inspector__search input {
  width: 100%; border: 0; outline: none; background: transparent;
  color: var(--color-text); font: inherit; font-size: 13px;
}
.node-inspector__search input::placeholder { color: var(--color-text-subtle); }
.node-inspector__results { margin-top: 16px; }
.node-inspector__section-title { margin-bottom: 8px; color: var(--color-text-subtle); font-size: 11px; font-weight: 700; letter-spacing: .08em; }
.node-inspector__results button,
.node-inspector__relations button {
  display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px;
  padding: 9px 7px; border: 0; border-bottom: 1px solid var(--color-border);
  background: transparent; color: var(--color-text); text-align: left;
  font: inherit; font-size: 13px; cursor: pointer;
}
.node-inspector__results button:hover,
.node-inspector__relations button:hover { background: var(--color-background); }
.node-inspector__results button > svg,
.node-inspector__relations button > svg { margin-left: auto; color: var(--color-text-subtle); flex: none; }
.node-inspector__dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.node-inspector__meta { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin-top: 20px; color: var(--color-text-muted); font-size: 12px; }
.node-inspector__tag { padding: 4px 8px; border: 1px solid currentColor; border-radius: var(--radius-sm); font-weight: 700; }
.node-inspector__board-toggle {
  display: inline-flex; align-items: center; gap: 7px; margin-top: 18px;
  padding: 7px 10px; border: 1px solid var(--color-border);
  background: var(--color-background); color: var(--color-text-muted); font: inherit; font-size: 12px; cursor: pointer;
}
.node-inspector__board-toggle:hover { border-color: var(--color-primary); color: var(--color-primary); }
.node-inspector__heat { margin: 22px 0; }
.node-inspector__heat > div:first-child { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; color: var(--color-text-muted); }
.node-inspector__heat strong { color: var(--color-text); font-size: 20px; }
.node-inspector__heat-track { height: 5px; margin-top: 8px; border-radius: 99px; background: var(--color-background); overflow: hidden; }
.node-inspector__heat-track span { display: block; height: 100%; border-radius: inherit; }
.node-inspector__relations { margin-top: 24px; }
.node-inspector__relations h3 { margin: 0 0 8px; font-size: 14px; color: var(--color-text); }
.node-inspector__relations h3 span { margin-left: 4px; color: var(--color-text-subtle); font-weight: 400; }
.node-inspector__relation-kind { flex: none; color: var(--color-primary); font-size: 11px; font-weight: 700; }
.node-inspector__relation-name { min-width: 0; }
.node-inspector__relation-name small { display: block; margin-top: 3px; color: var(--color-text-muted); font-size: 11px; }
.node-inspector__results p,
.node-inspector__relations p { color: var(--color-text-muted); font-size: 12px; line-height: 1.6; }
.node-inspector__source { margin-top: 24px; color: var(--color-text-subtle); font-size: 11px; line-height: 1.6; }

/* 右侧面板（始终挂载，从右侧滑入/滑出） */
.shell-panel {
  position: relative;
  flex-shrink: 0;
  width: 0;
  min-width: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    width 0.45s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.35s ease 0.1s;
}

/* ── single 模式：图谱 100%，面板隐藏 ── */
.shell-body--single .shell-graph { width: 100%; }
.shell-body--single .shell-panel { width: 0; opacity: 0; }

/* ── split 模式：图谱是主任务，分析面板保留可读宽度 ── */
.shell-body--split .shell-graph { width: 62%; }
.shell-body--split .shell-panel {
  width: 38%;
  height: 100%;
  opacity: 1;
  overflow: hidden;
  border-left: 1px solid var(--bg-300, #CBCBC8);
}

/* 工作台容器（始终挂载，宽度平滑过渡） */
.shell-workspace {
  position: relative;
  flex-shrink: 0;
  width: 0;
  min-width: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    width 0.45s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.35s ease 0.1s;
}

/* ── workspace 模式：图谱和面板隐藏，工作台 100% ── */
.shell-body--workspace .shell-graph { width: 0; }
.shell-body--workspace .shell-panel { width: 0; opacity: 0; }
.shell-body--workspace .shell-workspace {
  width: 100%;
  height: 100%;
  opacity: 1;
  overflow: hidden;
}

/* ═══ 响应式 ═══ */
@media (max-width: 1023px) {
  .shell-brand__title { font-size: 12px; letter-spacing: 0.06em; }
  .shell-header { padding: 8px 14px; }
}
@media (max-width: 767px) {
  .shell-brand__title { display: none; }
  .shell-scroll-label { display: none; }
  .shell-header {
    display: flex;
    justify-content: space-between;
    gap: 7px;
    padding: 7px 9px;
  }
  .shell-header__left { gap: 0; }
  .shell-back { padding: 5px 7px; font-size: 11px; }
  .shell-header__right { gap: 5px; }
  .shell-layout-toggle { flex: 1; min-width: 0; }
  .shell-toggle-btn { flex: 1; justify-content: center; gap: 3px; padding: 7px 5px; font-size: 10px; letter-spacing: 0; white-space: nowrap; }
  .shell-body { flex-direction: column; }
  .shell-body--split .shell-graph { width: 100%; height: 68%; min-height: 0; }
  .shell-body--split .shell-panel {
    width: 100%;
    height: 32%;
    flex: 0 0 32%;
    opacity: 1;
    border-left: 0;
    border-top: 1px solid var(--bg-300, #CBCBC8);
  }
  .shell-body--single .shell-graph { width: 100%; height: 100%; }
  .shell-body--single .shell-panel { width: 0; height: 0; }
  .shell-body--workspace .shell-graph,
  .shell-body--workspace .shell-panel { width: 0; height: 0; }
  .shell-body--workspace .shell-workspace { height: 100%; }
  .node-inspector { width: 100%; min-width: 0; }
  .shell-map-mode { top: 8px; left: 10px; }
  .shell-map-mode button { min-height: 28px; padding: 0 8px; font-size: 10px; }
  .shell-bubble-search { top: 7px; right: 10px; width: 31px; height: 31px; }
  .shell-focus { left: 10px; top: 48px; }
}
@media (prefers-reduced-motion: reduce) {
  .node-inspector { animation: none; }
}
</style>
