import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/beleg-scanner/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Beleg-Scanner',
        short_name: 'Belege',
        start_url: '/beleg-scanner/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0a84ff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.href.includes('opencv.js') || url.href.includes('tesseract') || url.href.includes('tessdata'),
            handler: 'CacheFirst',
            options: { cacheName: 'heavy-assets', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  test: { environment: 'jsdom', globals: true },
})
