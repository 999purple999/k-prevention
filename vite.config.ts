/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React SPA is built to /dist and served by the Express server in production.
// In development, Vite runs on :5173 and proxies /api calls to the Express server on :8080.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'server/**/*.test.js'],
    testTimeout: 20_000,
    server: {
      // node:sqlite è un builtin (Node ≥ 22.5) più recente della lista di Vite:
      // va esternalizzato esplicitamente, altrimenti Vitest tenta di risolverlo.
      deps: { external: ['node:sqlite', /node:sqlite/] },
    },
  },
});
