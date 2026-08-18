import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022'
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}']
  }
})
