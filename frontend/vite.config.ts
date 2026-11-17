/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Changes on every build, so each deploy installs a fresh service worker and cache.
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
  server: {
    // Forward API calls to the local Spring Boot backend during development.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    // Unit tests only; the browser tests in e2e/ run with Playwright.
    include: ['src/**/*.test.ts'],
  },
})
