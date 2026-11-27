import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Where the app lives. '/' by default; '/app/' when it runs at peakaiperformance.com/app.
  base: process.env.VITE_BASE || '/',
  // Client-facing settings (PUBLIC_SITE_URL, PUBLIC_INSTAGRAM_HANDLE) are read
  // from PUBLIC_* environment variables, as well as the usual VITE_* ones.
  envPrefix: ['VITE_', 'PUBLIC_'],
  // Shown in the sidebar so you can tell which build a site is serving.
  // Vercel sets VERCEL_GIT_COMMIT_SHA during builds.
  define: {
    __APP_BUILD__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7)),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
