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

  return {
    // The public app hostname is served at `/`. QEdge's origin path must map
    // `/` to the GitHub Pages project directory `/cpa-xingtu/`.
    // The legacy github.io URL redirects before Vue starts, so it does not
    // need the project-path asset base anymore.
    base: '/',
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
        },
        '/health': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
