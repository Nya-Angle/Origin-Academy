import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import pkg from './package.json' with { type: 'json' }
import { resolveDevVitePort } from './src/main/lib/dev-instance'

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
  resolve: {
    alias: [
      // 精确别名必须放在 `@` 前缀别名之前，否则 `@profer/shared` 会被误判为 `@` 别名
      { find: '@profer/shared', replacement: resolve(__dirname, '../../packages/shared/src/index.ts') },
      { find: '@/types', replacement: resolve(__dirname, 'src/types') },
      { find: '@', replacement: resolve(__dirname, 'src/renderer') },
    ],
  },
  server: {
    port: resolveDevVitePort(),
    strictPort: true,
    open: false,
  },
})
