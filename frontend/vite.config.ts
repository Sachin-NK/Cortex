import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_API_URL || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          ws: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'monaco': ['@monaco-editor/react'],
            'xterm':  ['xterm', 'xterm-addon-fit', 'xterm-addon-web-links'],
            'charts': ['recharts'],
            'react':  ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  }
})
