import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devApi } from './devApi'

export default defineConfig({
  plugins: [react(), devApi()],
  base: '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  ssr: {
    // Keep the embedded dev database out of Vite's SSR transform.
    external: ['@electric-sql/pglite', '@neondatabase/serverless'],
  },
})
