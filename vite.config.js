import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  build: { sourcemap: false },
  esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : {},
}))
