<!-- 组件：职业能力图谱工具栏叠加层；由 CareerAbilityShell.vue 引入使用，非路由直接渲染；角色：STUDENT -->
<script setup lang="ts">
import { inject, ref } from 'vue'
import { Icon } from '@iconify/vue'
import {
  GROUP_COLORS, GROUP_LABELS, RELATION_STYLES,
  type AbilityGroup,
} from '@/composables/useAbilityGraph'

defineOptions({ name: 'CareerAbilityGraph' })

const sg = inject<any>('shared-graph')
const showEdgeLabels = sg.showEdgeLabels
const refreshLayout = sg.refreshLayout
const layoutMode = sg.layoutMode
const toggleLayout = sg.toggleLayout
const toggleAllBoards = sg.toggleAllBoards
const collapsedBoards = sg.collapsedBoards
const openInspector = sg.openInspector
const legendOpen = ref(false)
</script>

<template>
  <div class="ag-overlay">
    <!-- 工具栏（右上角） -->
    <div class="ag-toolbar">
      <label class="ag-toolbar__toggle">
        <input type="checkbox" v-model="showEdgeLabels" />
        <span>显示连线标签</span>
      </label>
      <button class="ag-toolbar__text-btn" @click="toggleAllBoards" :title="collapsedBoards.size ? '展开全部技能' : '收起全部技能'">
        {{ collapsedBoards.size ? '展开全部' : '收起全部' }}
      </button>
      <button class="ag-toolbar__btn" @click="openInspector" title="查找节点" aria-label="查找节点">
        <Icon icon="lucide:search" :width="15" />
      </button>
      <button class="ag-toolbar__btn" @click="refreshLayout" title="重置视图" aria-label="重置图谱视图">
        <Icon icon="lucide:refresh-cw" :width="15" />
      </button>
      <button class="ag-toolbar__btn" @click="toggleLayout" :title="layoutMode === 'single' ? '双栏模式' : '图谱模式'">
        <Icon :icon="layoutMode === 'single' ? 'lucide:columns' : 'lucide:maximize'" :width="15" />
      </button>
    </div>
    <!-- 图例按需展开，避免压住左下角的板块与技能节点 -->
    <div class="ag-legend-wrap">
      <button class="ag-legend-toggle" :aria-expanded="legendOpen" @click="legendOpen = !legendOpen">
        <Icon icon="lucide:layers-3" :width="14" /> 图例
      </button>
    <div v-if="legendOpen" class="ag-legend">
      <div class="ag-legend__title">图例</div>
      <div class="ag-legend__section">
        <div class="ag-legend__subtitle">技能板块</div>
        <div v-for="g in (['professional', 'position', 'cognitive', 'general'] as AbilityGroup[])" :key="g" class="ag-legend__item">
          <span class="ag-legend__dot" :style="{ background: GROUP_COLORS[g] }"></span>
          <span>{{ GROUP_LABELS[g] }}</span>
        </div>
      </div>
      <div class="ag-legend__section">
        <div class="ag-legend__subtitle">关系线</div>
        <div v-for="(style, key) in RELATION_STYLES" :key="key" class="ag-legend__item">
          <span class="ag-legend__line" :style="{ borderTopColor: style.color, borderTopStyle: style.dash.length > 0 ? 'dashed' : 'solid' }"></span>
          <span>{{ style.label }}</span>
        </div>
      </div>
      <div class="ag-legend__hint">点击板块展开子技能；在节点详情中可收起</div>
    </div>
    </div>
  </div>
</template>

<style scoped>
/* ═══ Overlay 根（透明，铺满 Shell 图谱区） ═══ */
.ag-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  font-family: var(--font-title), sans-serif;
  color: var(--text-100, #111);
}

/* ═══ 工具栏（右上） ═══ */
.ag-toolbar {
  position: absolute; top: 14px; right: 18px; z-index: 20;
  display: flex; align-items: center; gap: 8px;
  background: rgba(255,255,255,0.9); backdrop-filter: blur(6px);
  border: 1px solid var(--bg-300, #CBCBC8);
  border-radius: var(--radius-md, 3px); padding: 6px 12px;
  pointer-events: auto;
}
.ag-toolbar__toggle {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--text-200, #666);
  cursor: pointer; user-select: none;
  padding-right: 8px; border-right: 1px solid var(--bg-300);
}
.ag-toolbar__toggle input { accent-color: var(--primary-100, #8B2500); cursor: pointer; }
.ag-toolbar__btn {
  display: grid; place-items: center; width: 30px; height: 30px;
  background: transparent; border: 1px solid transparent;
  color: var(--text-200); cursor: pointer;
  border-radius: var(--radius-sm, 2px); transition: all 0.15s;
}
.ag-toolbar__btn:hover { border-color: var(--primary-100); color: var(--primary-100); background: rgba(139,37,0,0.06); }
.ag-toolbar__text-btn {
  padding: 5px 7px; border: 0; background: transparent;
  color: var(--primary-100); font: inherit; font-size: 12px; cursor: pointer;
}
.ag-toolbar__text-btn:hover { text-decoration: underline; }

/* ═══ 图例（左下） ═══ */
.ag-legend-wrap {
  position: absolute; bottom: 18px; left: 18px; z-index: 20;
  pointer-events: auto;
}
.ag-legend-toggle {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 11px; border: 1px solid var(--bg-300);
  border-radius: var(--radius-sm); background: rgba(255,255,255,0.96);
  color: var(--text-200); font: inherit; font-size: 12px; cursor: pointer;
  box-shadow: var(--shadow-sm);
}
.ag-legend-toggle:hover { color: var(--primary-100); border-color: var(--primary-100); }
.ag-legend {
  position: absolute; bottom: 42px; left: 0;
  background: rgba(255,255,255,0.92); backdrop-filter: blur(6px);
  border: 1px solid var(--bg-300, #CBCBC8);
  border-radius: var(--radius-md, 3px); padding: 12px 16px; min-width: 160px;
  box-shadow: var(--shadow-md);
}
.ag-legend__title {
  font-size: 13px; font-weight: 600; color: var(--primary-100, #8B2500);
  letter-spacing: 0.08em; margin-bottom: 10px;
  padding-bottom: 6px; border-bottom: 1px solid var(--bg-300);
}
.ag-legend__section { margin-bottom: 8px; }
.ag-legend__subtitle { font-size: 11px; font-weight: 600; color: var(--text-200, #666); margin-bottom: 4px; }
.ag-legend__item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-200); padding: 2px 0; }
.ag-legend__dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.ag-legend__line { width: 24px; height: 0; flex-shrink: 0; border-top-width: 2px; }
.ag-legend__hint {
  font-size: 10px; color: var(--text-300, #999);
  margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--bg-300); line-height: 1.5;
}

@media (max-width: 767px) {
  .ag-legend-wrap { bottom: 10px; left: 10px; }
  .ag-legend { padding: 8px 12px; min-width: 130px; }
  .ag-toolbar { top: 8px; right: 10px; padding: 4px 8px; }
}
</style>
