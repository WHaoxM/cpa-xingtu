import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Backend target for dev proxy — any host:port, not hard-locked to 5001
  const proxyTarget =
    env.VITE_API_PROXY_TARGET ||
    env.CPA_BACKEND_URL ||
    'http://127.0.0.1:5001'
  const backendDev = mode === 'backend-dev'
  const devStudentId = String(env.VITE_DEV_STUDENT_ID || '').trim()
  if (backendDev && !/^[A-Za-z0-9_-]{1,64}$/.test(devStudentId)) {
    throw new Error('backend-dev requires a valid VITE_DEV_STUDENT_ID')
  }

  return {
    // GitHub Pages: https://whaoxm.github.io/cpa-xingtu/
    base: mode === 'production' ? '/cpa-xingtu/' : '/',
    plugins: [
      vue(),
      vueDevTools(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: backendDev ? '127.0.0.1' : undefined,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          // Only the isolated loopback dev server grants its configured local
          // Principal; browser-provided identity headers are overwritten.
          ...(backendDev ? {
            configure(proxy) {
              proxy.on('proxyReq', request => request.setHeader('X-Dev-Student-Id', devStudentId))
            },
          } : {}),
        },
        '/health': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
