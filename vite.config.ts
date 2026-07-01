import { defineConfig } from 'vite'

export default defineConfig({
  base: '/beleg-scanner/',
  test: { environment: 'jsdom', globals: true },
})
