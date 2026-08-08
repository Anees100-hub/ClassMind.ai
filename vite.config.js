import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Node.js Express backend (port 5003)
      '/api': {
        target: 'http://127.0.0.1:5003',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://127.0.0.1:5003',
        changeOrigin: true,
        secure: false,
      },
      // Python FastAPI face recognition microservice (port 8000)
      // React calls /python-api/... → proxied to http://localhost:8000/api/...
      '/python-api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/python-api/, '/api'),
      },
    },
  },
})
