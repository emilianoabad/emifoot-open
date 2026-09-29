import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { siteConfig, siteMetadata } from './build/site.ts'

export default defineConfig(({ mode, isSsrBuild }) => {
  const site = siteConfig({ ...loadEnv(mode, process.cwd(), ''), ...process.env })
  return {
    base: site.base,
    plugins: [react(), siteMetadata(site)],
    build: {
      copyPublicDir: !isSsrBuild,
      rollupOptions: {
        input: { app: resolve('index.html'), invite: resolve('invite/index.html') },
      },
    },
    ssr: { noExternal: ['ws', 'zod'] },
    server: {
      proxy: { [`${site.base}ws`]: { target: 'http://127.0.0.1:8789', ws: true, rewrite: () => '/ws' } },
    },
    test: {
      maxWorkers: 2,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'build/**/*.test.ts'],
      coverage: {
        reporter: ['text', 'json-summary'],
        include: ['src/game/**/*.ts', 'src/persistence/**/*.ts'],
      },
    },
  }
})
