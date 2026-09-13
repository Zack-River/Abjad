import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    publicDir: resolve(process.cwd(), 'public'),
    build: {
      target: 'esnext'
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), wasm()]
  }
})
