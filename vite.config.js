import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = '/Habits-Tracker-PWA/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-source.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Hábitos con Hucha',
        short_name: 'Hábitos',
        description: 'Sigue tus hábitos y llena tu hucha virtual',
        theme_color: '#14161A',
        background_color: '#14161A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        lang: 'es',
        icons: [
          { src: 'pwa-64x64.png',              sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png',             sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',             sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png',   sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    pool: 'forks',
  },
})
