import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/', // App served from root of app subdomain
  // shared/planos.json (nome dos planos) fica fora da pasta do front.
  server: { fs: { allow: ['..'] } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['pwa-192.svg', 'pwa-512.svg', 'pwa-192.png', 'pwa-512.png', 'apple-touch-icon-180.png'],
      manifest: {
        name: 'TactiPlan - Gestao de Treinos',
        short_name: 'TactiPlan',
        description: 'Plataforma profissional de gestao de treinos esportivos',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'apple-touch-icon-180.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'apple touch icon'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MiB — comporta exceljs (~2.7MB)
        // 26/11/2026: arquivos (/uploads), API e OTA NÃO são páginas do app — sem isto o SW devolvia o index.html ao
        // abrir um anexo numa aba nova e a pessoa caía na Início (Arquivos da semana, análise do adversário).
        navigateFallbackDenylist: [/^\/uploads\//, /^\/api\//, /^\/ota\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 86400 // 24 hours
              },
              networkTimeoutSeconds: 10
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 2592000 // 30 days
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
})
