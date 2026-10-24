<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { getCareerRelationGraph, type CareerRelationEdge, type CareerRelationGraph, type CareerRelationNode } from '@/api/careerRelations'

const props = withDefaults(defineProps<{ focusRole?: string; compact?: boolean }>(), {
  focusRole: '',
  compact: false,
})
const emit = defineEmits<{ 'select-role': [role: string] }>()

const graph = ref<CareerRelationGraph | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const search = ref('')
const minimumShared = ref(1)
const selectedNodeId = ref('')
const selectedEdgeId = ref('')
let requestEpoch = 0

const focusedNode = computed(() => graph.value?.nodes.find(node => node.label === props.focusRole) ?? null)
const filteredEdges = computed(() => {
  const value = graph.value
  if (!value) return []
  const q = search.value.trim().toLocaleLowerCase()
  return value.edges.filter(edge => {
    if (edge.shared_skill_count < minimumShared.value) return false
    if (props.compact && focusedNode.value && edge.source !== focusedNode.value.id && edge.target !== focusedNode.value.id) return false
    if (!q) return true
    const source = value.nodes.find(node => node.id === edge.source)
    const target = value.nodes.find(node => node.id === edge.target)
    return [source?.label, target?.label, ...edge.shared_skills.map(skill => skill.name)]
      .some(item => item?.toLocaleLowerCase().includes(q))
  })
})
const visibleNodes = computed(() => {
  const value = graph.value
  if (!value) return []
  const q = search.value.trim().toLocaleLowerCase()
  if (props.compact && props.focusRole && !focusedNode.value) return []
  let rows = props.compact && focusedNode.value
    ? value.nodes.filter(node => node.id === focusedNode.value!.id || filteredEdges.value.some(edge => edge.source === node.id || edge.target === node.id))
    : value.nodes
  if (q) {
    const matchingIds = new Set(filteredEdges.value.flatMap(edge => [edge.source, edge.target]))
    rows = rows.filter(node => node.label.toLocaleLowerCase().includes(q)
      || node.skills.some(skill => skill.name.toLocaleLowerCase().includes(q))
      || matchingIds.has(node.id))
  }
  return rows
})
const positions = computed(() => {
  const nodes = visibleNodes.value
  const columns = Math.max(2, Math.min(6, Math.ceil(Math.sqrt(Math.max(nodes.length, 1)))))
  const gapX = 900 / (columns + 1)
  const rows = Math.ceil(nodes.length / columns)
  const height = Math.max(props.compact ? 430 : 370, 100 + Math.max(1, rows) * 102)
  const result = new Map<string, { x: number; y: number }>()
  const focusId = focusedNode.value?.id
  nodes.forEach((node, index) => {
    if (props.compact && focusId && node.id === focusId) {
      result.set(node.id, { x: 450, y: 68 })
      return
    }
    const nonFocusIndex = props.compact && focusId ? index - (nodes.findIndex(item => item.id === focusId) < index ? 1 : 0) : index
    const col = nonFocusIndex % columns
    const row = Math.floor(nonFocusIndex / columns)
    result.set(node.id, {
      x: 450 - (columns - 1) * gapX / 2 + col * gapX,
      y: props.compact && focusId ? 190 + row * 102 : 72 + row * 102,
    })
  })
  return { map: result, height }
})
const drawnEdges = computed(() => filteredEdges.value.flatMap(edge => {
  const from = positions.value.map.get(edge.source)
  const to = positions.value.map.get(edge.target)
  return from && to ? [{ edge, from, to }] : []
}))
const selectedEdge = computed(() => graph.value?.edges.find(edge => edge.id === selectedEdgeId.value) ?? null)
const selectedNode = computed(() => graph.value?.nodes.find(node => node.id === selectedNodeId.value) ?? focusedNode.value)
const reasonText = computed(() => {
  if (props.compact && props.focusRole && graph.value?.node_count && !focusedNode.value) {
    return '当前选择方向没有对应的已发布职业资料，未生成个人路径或关系。'
  }
  if (graph.value?.status === 'ready') return '边表示两份已发布职业资料共享规范技能，不含晋升、匹配或适合度结论。'
  const reason = graph.value?.reason
  if (reason === 'relationship_projection_not_computed') return '当前职业资料已读取，关系尚未计算并写入数据库。'
  if (reason === 'no_active_pathways') return '当前没有已发布且带来源证据的职业资料。'
  if (reason === 'fewer_than_two_active_pathways') return '目前有职业资料，但少于两个，无法计算跨职业关联。'
  if (reason === 'no_shared_verified_skills') return '当前职业资料之间没有共享的已核验技能，因此没有可展示的关联边。'
  return '当前没有可展示的职业关联。'
})

async function load() {
  const epoch = ++requestEpoch
  state.value = 'loading'
  error.value = ''
  try {
    const result = await getCareerRelationGraph()
    if (epoch !== requestEpoch) return
    graph.value = result
    state.value = 'ready'
    minimumShared.value = Math.min(minimumShared.value, Math.max(1, ...result.edges.map(edge => edge.shared_skill_count)))
    if (props.focusRole) selectedNodeId.value = result.nodes.find(node => node.label === props.focusRole)?.id ?? ''
  } catch (cause) {
    if (epoch !== requestEpoch) return
    error.value = cause instanceof Error ? cause.message : '职业关联资料暂不可用，请稍后重试。'
    state.value = 'error'
  }
}

function selectNode(node: CareerRelationNode) {
  selectedNodeId.value = node.id
  selectedEdgeId.value = ''
  emit('select-role', node.label)
}

function selectEdge(edge: CareerRelationEdge) {
  selectedEdgeId.value = edge.id
  selectedNodeId.value = ''
}

function nodeLabel(id: string) {
  return graph.value?.nodes.find(node => node.id === id)?.label ?? id
}

watch(() => props.focusRole, role => {
  selectedEdgeId.value = ''
  selectedNodeId.value = graph.value?.nodes.find(node => node.label === role)?.id ?? ''
})

onMounted(load)
</script>

<template>
  <section class="career-relation" :class="{ 'career-relation--compact': compact }" aria-label="职业关联图谱">
    <header class="career-relation__header">
      <div>
        <p class="career-relation__eyebrow">CAREER RELATIONS</p>
        <h2>{{ compact ? '共享技能职业关联' : '职业关联图谱' }}</h2>
        <p class="career-relation__caption">关联仅表示已发布职业资料共享技能，不代表晋升顺序或个人匹配度。</p>
      </div>
      <button type="button" class="career-relation__retry" :disabled="state === 'loading'" @click="load">
        <Icon :icon="state === 'loading' ? 'lucide:loader-circle' : 'lucide:refresh-cw'" :class="{ spinning: state === 'loading' }" :width="14" />
        {{ state === 'loading' ? '读取中' : '重新读取' }}
      </button>
    </header>

    <div v-if="state === 'error'" class="career-relation__state" role="alert">
      <Icon icon="lucide:cloud-off" :width="22" />
      <strong>暂时无法读取职业关联</strong>
      <span>{{ error }}</span>
      <button type="button" @click="load">重试</button>
    </div>
    <div v-else-if="state === 'loading' && !graph" class="career-relation__state" role="status">
      <Icon icon="lucide:loader-circle" class="spinning" :width="22" />
      <strong>正在读取数据库中的职业资料与关系</strong>
    </div>
    <template v-else-if="graph">
      <div class="career-relation__meta" :class="`career-relation__meta--${graph.status}`" role="status">
        <span>{{ reasonText }}</span>
        <small>{{ graph.node_count }} 个职业 · {{ graph.edge_count }} 条关系 · {{ graph.algorithm_version }}</small>
      </div>
      <div class="career-relation__filters">
        <label class="career-relation__search"><Icon icon="lucide:search" :width="14" /><input v-model="search" type="search" placeholder="筛选职业或共享技能" aria-label="筛选职业或共享技能"></label>
        <label class="career-relation__minimum">至少共享
          <select v-model.number="minimumShared" :disabled="graph.edge_count === 0" aria-label="最少共享技能数">
            <option v-for="count in Math.max(1, ...graph.edges.map(edge => edge.shared_skill_count))" :key="count" :value="count">{{ count }} 项</option>
          </select>
        </label>
      </div>
      <div class="career-relation__body">
        <div class="career-relation__canvas" :class="{ 'career-relation__canvas--empty': !visibleNodes.length }">
          <svg v-if="visibleNodes.length" :viewBox="`0 0 900 ${positions.height}`" role="group" aria-label="职业共享技能关系图">
            <g v-for="item in drawnEdges" :key="item.edge.id" class="career-relation__edge-group"
              :class="{ 'is-selected': selectedEdgeId === item.edge.id }"
              role="button" tabindex="0"
              :aria-label="`${nodeLabel(item.edge.source)} 与 ${nodeLabel(item.edge.target)} 共享 ${item.edge.shared_skill_count} 项技能`"
              @click="selectEdge(item.edge)" @keydown.enter.prevent="selectEdge(item.edge)" @keydown.space.prevent="selectEdge(item.edge)">
              <line :x1="item.from.x" :y1="item.from.y" :x2="item.to.x" :y2="item.to.y"
                :stroke-width="1.2 + Math.min(4, item.edge.weight * 6)" />
              <title>{{ nodeLabel(item.edge.source) }} ↔ {{ nodeLabel(item.edge.target) }} · 共享 {{ item.edge.shared_skill_count }} 项技能</title>
            </g>
            <g v-for="node in visibleNodes" :key="node.id" class="career-relation__node"
              :class="{ 'is-selected': selectedNodeId === node.id, 'is-focused': focusedNode?.id === node.id }"
              :transform="`translate(${positions.map.get(node.id)?.x ?? 0},${positions.map.get(node.id)?.y ?? 0})`"
              role="button" tabindex="0" :aria-label="`${node.label}，${node.skill_count} 项有来源的技能`"
              @click="selectNode(node)" @keydown.enter.prevent="selectNode(node)" @keydown.space.prevent="selectNode(node)">
              <circle r="25" />
              <text y="4" text-anchor="middle">{{ node.label.length > 8 ? `${node.label.slice(0, 8)}…` : node.label }}</text>
              <text class="career-relation__node-count" y="43" text-anchor="middle">{{ node.skill_count }} 项技能</text>
              <title>{{ node.label }} · {{ node.skill_count }} 项有来源的技能</title>
            </g>
          </svg>
          <div v-else class="career-relation__no-nodes">当前筛选没有匹配职业。</div>
        </div>
        <aside class="career-relation__detail" aria-live="polite">
          <template v-if="selectedEdge">
            <p class="career-relation__detail-label">关系依据</p>
            <h3>{{ nodeLabel(selectedEdge.source) }} ↔ {{ nodeLabel(selectedEdge.target) }}</h3>
            <p class="career-relation__measure">{{ selectedEdge.shared_skill_count }} / {{ selectedEdge.union_skill_count }} 项技能相同 · Jaccard {{ selectedEdge.weight.toFixed(4) }}</p>
            <p class="career-relation__detail-copy">关联强度 = 两份当前职业资料的共享规范技能数 ÷ 技能并集数。权重不表示适合程度。</p>
            <ul class="career-relation__skills">
              <li v-for="skill in selectedEdge.shared_skills" :key="skill.skill_id">
                <strong>{{ skill.name }}</strong>
                <span>技能 ID {{ skill.skill_id }}</span>
                <a :href="skill.source_evidence.url" target="_blank" rel="noopener noreferrer">查看 {{ nodeLabel(selectedEdge.source) }} 的依据<Icon icon="lucide:external-link" :width="11" /></a>
                <a :href="skill.target_evidence.url" target="_blank" rel="noopener noreferrer">查看 {{ nodeLabel(selectedEdge.target) }} 的依据<Icon icon="lucide:external-link" :width="11" /></a>
              </li>
            </ul>
          </template>
          <template v-else-if="selectedNode">
            <p class="career-relation__detail-label">职业资料</p>
            <h3>{{ selectedNode.label }}</h3>
            <p class="career-relation__detail-copy">已发布修订 {{ selectedNode.revision }} · {{ selectedNode.skill_count }} 项带来源的技能</p>
            <ul class="career-relation__skills">
              <li v-for="skill in selectedNode.skills" :key="skill.skill_id">
                <strong>{{ skill.name }}</strong><span>技能 ID {{ skill.skill_id }}</span>
                <a :href="skill.evidence.url" target="_blank" rel="noopener noreferrer">查看来源<Icon icon="lucide:external-link" :width="11" /></a>
              </li>
            </ul>
          </template>
          <div v-else class="career-relation__detail-empty"><Icon icon="lucide:mouse-pointer-2" :width="18" /><span>选择一个职业或关系，查看其来源依据。</span></div>
        </aside>
      </div>
      <footer class="career-relation__footer">
        <span>来源：{{ graph.source_kind }}</span>
        <span>当前数据指纹 {{ graph.input_sha256.slice(0, 12) }}</span>
        <span v-if="graph.computed_at">计算于 {{ new Date(graph.computed_at).toLocaleString() }}</span>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.career-relation{position:relative;z-index:1;display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;width:100%;height:100%;color:#282622;font-family:inherit}
.career-relation__header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 12px 6px}
.career-relation__eyebrow{margin:0;color:#8d6f3c;font-size:9px;font-weight:700;letter-spacing:.16em}
.career-relation__header h2{margin:2px 0 3px;font:600 16px/1.2 Georgia,serif;color:#29251f}
.career-relation__caption{margin:0;color:#766f64;font-size:10px;line-height:1.4}
.career-relation__retry{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(115,96,62,.28);border-radius:999px;padding:6px 9px;background:#f8f5ed;color:#60533d;font-size:10px;white-space:nowrap;cursor:pointer}
.career-relation__retry:disabled{opacity:.65;cursor:wait}
.career-relation__meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 12px 6px;padding:6px 9px;border-left:2px solid #bd8d45;background:rgba(239,230,211,.62);font-size:10px;color:#655846}
.career-relation__meta small{color:#847867;white-space:nowrap;font-size:9px}
.career-relation__meta--pending{border-color:#9a7743}.career-relation__meta--empty{border-color:#8b8170}
.career-relation__filters{display:flex;align-items:center;gap:10px;padding:0 12px 8px;color:#756c5e;font-size:10px}
.career-relation__search{display:flex;align-items:center;gap:6px;min-width:0;flex:1;border:1px solid rgba(120,105,80,.24);border-radius:6px;padding:5px 8px;background:rgba(255,255,255,.55)}
.career-relation__search input{min-width:0;width:100%;border:0;outline:0;background:transparent;color:#3b352c;font:inherit}
.career-relation__minimum{display:flex;align-items:center;gap:5px;white-space:nowrap}
.career-relation__minimum select{max-width:62px;border:1px solid rgba(120,105,80,.24);border-radius:4px;padding:4px;background:#faf8f2;color:#51483b;font-size:10px}
.career-relation__body{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(160px,.8fr);flex:1;min-height:0;gap:8px;padding:0 10px}
.career-relation__canvas{min-width:0;min-height:0;overflow:auto;border:1px solid rgba(124,110,85,.14);border-radius:8px;background:radial-gradient(ellipse at 50% 0%,rgba(255,255,255,.85),rgba(245,241,231,.64) 70%)}
.career-relation__canvas svg{display:block;width:100%;min-width:480px;height:auto;min-height:100%}
.career-relation__edge-group{cursor:pointer;outline:none}.career-relation__edge-group line{stroke:#ba8c4c;stroke-opacity:.42;transition:stroke-opacity .15s,stroke-width .15s}.career-relation__edge-group:hover line,.career-relation__edge-group:focus line,.career-relation__edge-group.is-selected line{stroke:#a8492a;stroke-opacity:.9}
.career-relation__node{cursor:pointer;outline:none}.career-relation__node circle{fill:#f8f4e9;stroke:#bca77e;stroke-width:1.4;transition:fill .15s,stroke .15s,transform .15s}.career-relation__node:hover circle,.career-relation__node:focus circle{fill:#fffaf0;stroke:#9c6734;stroke-width:2}.career-relation__node.is-focused circle{fill:#f3e2c4;stroke:#ac6334;stroke-width:2}.career-relation__node.is-selected circle{fill:#bb4a2d;stroke:#92351e;stroke-width:2}.career-relation__node text{fill:#453a2b;font-size:10px;font-weight:650;pointer-events:none}.career-relation__node.is-selected text{fill:#fff}.career-relation__node .career-relation__node-count{fill:#877a65;font-size:9px;font-weight:500}.career-relation__node.is-selected .career-relation__node-count{fill:#e8d8c3}
.career-relation__detail{min-width:0;min-height:0;overflow:auto;padding:8px 9px;border:1px solid rgba(124,110,85,.15);border-radius:8px;background:rgba(250,248,241,.85)}
.career-relation__detail-label{margin:0 0 4px;color:#9b7442;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.career-relation__detail h3{margin:0 0 6px;font-size:13px;line-height:1.3;color:#332d24}.career-relation__measure{margin:0 0 7px;color:#925034;font-size:10px;font-weight:700}.career-relation__detail-copy{margin:0 0 8px;color:#756d61;font-size:10px;line-height:1.5}
.career-relation__skills{display:grid;gap:7px;margin:0;padding:0;list-style:none}.career-relation__skills li{display:grid;gap:3px;padding:6px 0;border-top:1px solid rgba(120,105,80,.15)}.career-relation__skills strong{color:#454033;font-size:10px}.career-relation__skills span{color:#918675;font-size:9px}.career-relation__skills a{display:inline-flex;align-items:center;gap:4px;color:#9a5638;font-size:9px;text-decoration:none}.career-relation__skills a:hover{text-decoration:underline}
.career-relation__detail-empty{display:flex;min-height:100%;flex-direction:column;align-items:center;justify-content:center;gap:7px;color:#948a7a;text-align:center;font-size:10px;line-height:1.5}.career-relation__no-nodes{display:grid;min-height:300px;place-items:center;color:#8d8373;font-size:11px}
.career-relation__state{display:flex;flex:1;min-height:220px;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px;color:#756c5e;text-align:center;font-size:11px}.career-relation__state strong{color:#4f473b}.career-relation__state button{border:1px solid #b79160;border-radius:999px;padding:6px 12px;background:#f8f3e8;color:#6f512b;cursor:pointer}
.career-relation__footer{display:flex;justify-content:space-between;gap:8px;padding:6px 12px;color:#978c79;font-size:8px;flex-wrap:wrap}.spinning{animation:career-relation-spin .9s linear infinite}@keyframes career-relation-spin{to{transform:rotate(360deg)}}
.career-relation--compact{min-height:390px}.career-relation--compact .career-relation__header{padding:12px 14px 8px}.career-relation--compact .career-relation__body{grid-template-columns:minmax(0,1.3fr) minmax(175px,.8fr);padding:0 12px 8px}.career-relation--compact .career-relation__canvas svg{min-width:420px}.career-relation--compact .career-relation__detail{max-height:430px}
@media(max-width:700px){.career-relation__header{padding:9px}.career-relation__header h2{font-size:14px}.career-relation__caption{max-width:44ch}.career-relation__body,.career-relation--compact .career-relation__body{grid-template-columns:1fr;grid-template-rows:minmax(260px,1fr) minmax(140px,.6fr)}.career-relation__meta{align-items:flex-start;flex-direction:column}.career-relation__meta small{white-space:normal}.career-relation__detail{max-height:190px}.career-relation__footer{font-size:8px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
</style>
