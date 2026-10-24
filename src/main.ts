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

const CHUNK_RECOVERY_QUERY = '__cpa_chunk_recovery'

// A deployment can remove hashed chunks while an already-open tab still has
// the previous app loaded. Retry once through a fresh document URL; the query
// marker both busts the HTML cache and prevents an endless reload loop.
window.addEventListener('vite:preloadError', (event) => {
  const retryUrl = new URL(window.location.href)
  if (retryUrl.searchParams.has(CHUNK_RECOVERY_QUERY)) return

  event.preventDefault()
  retryUrl.searchParams.set(CHUNK_RECOVERY_QUERY, String(Date.now()))
  window.location.replace(retryUrl.toString())
})

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

void router.isReady().then(() => {
  const route = router.currentRoute.value
  if (route.query[CHUNK_RECOVERY_QUERY] === undefined) return

  const query = { ...route.query }
  delete query[CHUNK_RECOVERY_QUERY]
  void router.replace({ path: route.path, query, hash: route.hash })
})
