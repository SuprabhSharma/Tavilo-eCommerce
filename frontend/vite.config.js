import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [
    react({
      // Use Babel's React Fast Refresh only in dev; production gets
      // the lighter automatic JSX transform with no development overhead.
      babel: {
        plugins: mode === 'production' ? [] : [],
      },
    }),
  ],

  // ── Dev Server ────────────────────────────────────────────────────────────
  server: {
    port: 5173,
    host: true,
    // Security headers for the dev server — mirrors what nginx sends in production.
    // X-Frame-Options and frame-ancestors MUST be HTTP headers; <meta> is ignored.
    headers: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
    // Warm up the most-visited entry points so the first request is instant.
    warmup: {
      clientFiles: [
        './src/main.jsx',
        './src/App.jsx',
        './src/pages/Home.jsx',
        './src/pages/ProductListing.jsx',
        './src/components/ProductCard.jsx',
        './src/components/Layout.jsx',
      ],
    },
    proxy: {
      '/health': { target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true },
      '/ready':  { target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true },
      '/api':    { target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true },
      '/media':  { target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },

  // ── Build / Bundle ─────────────────────────────────────────────────────────
  build: {
    // Target modern browsers — removes legacy polyfill bloat.
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    // Inline assets < 4 kB as base64 (logos, tiny icons).
    assetsInlineLimit: 4096,
    // Raise the chunk size warning threshold to 600 kB before alerting.
    chunkSizeWarningLimit: 600,
    // Source maps only in staging/review; never ship to production.
    sourcemap: mode !== 'production',
    // Minify with esbuild (default) — fastest, no extra install needed.
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Fine-grained manual chunks so each vendor is cached independently.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // Core React runtime — changes least often; long-lived cache.
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react';
          }
          // Router — updated infrequently; independent cache.
          if (id.includes('react-router') || id.includes('@remix-run/router')) {
            return 'vendor-router';
          }
          // TanStack Query — independent cache bust.
          if (id.includes('@tanstack/')) {
            return 'vendor-query';
          }
          // Form library — only loaded on pages that use it.
          if (id.includes('react-hook-form')) {
            return 'vendor-forms';
          }
          // Icon library — largest single dependency; isolate it.
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }
          // Zustand + tiny deps — tiny, but keep separate from React core.
          if (id.includes('zustand')) {
            return 'vendor-state';
          }
          // Axios — HTTP client; cache separately.
          if (id.includes('axios')) {
            return 'vendor-axios';
          }
          // All remaining node_modules.
          return 'vendor-misc';
        },
        // Deterministic, content-addressed filenames for long-term CDN caching.
        entryFileNames:  'assets/[name]-[hash].js',
        chunkFileNames:  'assets/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash][extname]',
      },
    },
  },

  // ── Dependency Pre-bundling ───────────────────────────────────────────────
  optimizeDeps: {
    // Pre-bundle everything that is always loaded so the first HMR is instant.
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      '@tanstack/react-query',
      'axios',
      'zustand',
      'lucide-react',
      'react-hook-form',
    ],
  },
}))
