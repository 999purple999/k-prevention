/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// La PWA (manifest + service worker) è attiva solo nella build di produzione (Cloud Run,
// scope pulito su dominio radice). La demo statica su GitHub Pages ne fa a meno.
const isDemo = process.env.VITE_DEMO === '1';
const pwa = VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
  manifest: {
    name: 'k-prevention · copilota di liquidità',
    short_name: 'k-prevention',
    description: 'Simulatore Monte Carlo del flusso di cassa, cifrato end-to-end. Tieni allineati piano e realtà, non andare mai in bancarotta.',
    lang: 'it',
    theme_color: '#080b14',
    background_color: '#080b14',
    display: 'standalone',
    orientation: 'portrait-primary',
    start_url: '.',
    scope: '.',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api/],
    // Le API non si cachano mai: dati freschi e autenticati (incluso lo stream SSE).
    runtimeCaching: [{ urlPattern: /^\/api\//, handler: 'NetworkOnly' }],
  },
});

// The React SPA is built to /dist and served by the Express server in production.
// In development, Vite runs on :5173 and proxies /api calls to the Express server on :8080.
export default defineConfig({
  plugins: [react(), ...(isDemo ? [] : [pwa])],
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
