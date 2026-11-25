/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // "@/..." points to src/ (matches "paths" in tsconfig.app.json)
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: {
      // Proxy all requests starting with /api to the Python server
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  test: {
    // jsdom so hook and component tests have a DOM; pure-logic tests opt into node with "// @vitest-environment node"
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Israel time, like the users: date helpers are tested across the March/October clock changes
    env: { TZ: 'Asia/Jerusalem' },
    // npm run test:coverage; a baseline only, no thresholds yet
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/main.tsx', 'src/types/**'],
      reporter: ['text-summary', 'html'],
    },
  },
})
