import 'element-plus/dist/index.css'
import './assets/styles/main.css'
import './plugins/resumeIcons'
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

// Global ECharts registration for vue-echarts
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import {
  PieChart, BarChart, LineChart, RadarChart, GraphChart, SankeyChart
} from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DataZoomComponent, ToolboxComponent
} from 'echarts/components'

use([
  CanvasRenderer,
  PieChart, BarChart, LineChart, RadarChart, GraphChart, SankeyChart,
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DataZoomComponent, ToolboxComponent
])

import App from './App.vue'
import router from './router'
import pinia from './stores/pinia'
import { useThemeStore } from './stores/theme'
import { seedResumeStore } from '@/mock/resumeSeed'

seedResumeStore()

const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(ElementPlus)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

useThemeStore(pinia).initTheme()

app.mount('#app')
