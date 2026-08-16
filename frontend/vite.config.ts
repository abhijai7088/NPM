import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5195,
    strictPort: true,
    proxy: {
      // Auth service runs on 8081 — must be listed before the generic /api rule
      '/api/v1/auth': { target: 'http://localhost:8081', changeOrigin: true },
      '/api/v1/audit': { target: 'http://localhost:8081', changeOrigin: true },
      // Everything else goes to the core service on 8083
      '/api': { target: 'http://localhost:8083', changeOrigin: true }
    }
  }
})
