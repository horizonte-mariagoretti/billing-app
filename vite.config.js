import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

/* global process */
const target = process.env.BUILD_TARGET ?? 'electron'
const isWeb = target === 'web'

const plugins = [react()]
if (!isWeb) {
  plugins.push(
    electron([
      {
        entry: 'electron/main.js',
        vite: {
          build: {
            rollupOptions: {
              external: ['better-sqlite3', 'electron'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.js',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    renderer(),
  )
}

export default defineConfig(({ command }) => ({
  plugins,
  // Only apply the GitHub Pages subpath for production web builds.
  // Dev (and Electron build) keep root base so localhost works without
  // requiring the user to type the long URL.
  base: isWeb && command === 'build' ? '/billing-app/' : '/',
  assetsInclude: ['**/*.wasm'],
}))
