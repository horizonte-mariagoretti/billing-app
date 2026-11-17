import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves the app under /billing-app/; dev uses the root.
  base: command === 'build' ? '/billing-app/' : '/',
  assetsInclude: ['**/*.wasm'],
}))
