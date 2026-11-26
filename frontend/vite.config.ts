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
        // Every mock goes back to its original implementation before each test, so a value one test sets can't leak
        mockReset: true,
        include: ['src/**/*.test.{ts,tsx}'],
        // Israel time, like the users: date helpers are tested across the March/October clock changes
        env: { TZ: 'Asia/Jerusalem' },
        // npm run test:coverage fails when coverage drops below these floors; raise them when coverage goes up
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/**/*.test.*', 'src/test/**', 'src/main.tsx', 'src/types/**'],
            reporter: ['text-summary', 'html'],
            thresholds: { lines: 64, statements: 63, functions: 54, branches: 54 },
        },
    },
})
