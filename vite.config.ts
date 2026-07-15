import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works on GitHub Pages, Vercel, or any subpath.
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    open: true,
  },
})
