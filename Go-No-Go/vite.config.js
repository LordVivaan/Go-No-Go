import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const d3TimeFormatMjs = path.resolve(
  import.meta.dirname,
  'node_modules/d3-time-format/dist/d3-time-format.mjs'
)
const d3TimeFormatMinMjs = path.resolve(
  import.meta.dirname,
  'node_modules/d3-time-format/dist/d3-time-format.min.mjs'
)
const useMinD3Fallback =
  fs.existsSync(d3TimeFormatMjs) &&
  fs.statSync(d3TimeFormatMjs).size === 0 &&
  fs.existsSync(d3TimeFormatMinMjs)

function sendNodeWebResponse(res, webResponse) {
  res.statusCode = webResponse.status
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  return webResponse.text().then((body) => {
    res.end(body)
  })
}

function localWeatherApiPlugin() {
  return {
    name: 'local-meteomatics-weather-api',
    configureServer(server) {
      server.middlewares.use('/api/weather', async (req, res, next) => {
        try {
          const { handleWeatherRequest } = await server.ssrLoadModule(
            '/src/server/meteomaticsWeatherHandler.ts',
          )
          const fullUrl = new URL(
            req.originalUrl || req.url || '/api/weather',
            'http://127.0.0.1',
          ).toString()
          const webReq = new Request(fullUrl, { method: req.method || 'GET' })
          const webRes = await handleWeatherRequest(webReq, {
            METEOMATICS_USERNAME: process.env.METEOMATICS_USERNAME,
            METEOMATICS_PASSWORD: process.env.METEOMATICS_PASSWORD,
          })
          await sendNodeWebResponse(res, webRes)
        } catch (err) {
          next(err)
        }
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/weather', (_req, res) => {
        res.statusCode = 503
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(
          JSON.stringify({
            ok: false,
            error: {
              code: 'WEATHER_CREDENTIALS_MISSING',
              message:
                'Static Vite preview does not execute Cloudflare Pages Functions. Run `wrangler pages dev dist` with local secrets for live /api/weather testing.',
            },
            retrievedAtUtc: new Date().toISOString(),
          }),
        )
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localWeatherApiPlugin()],
  resolve: useMinD3Fallback
    ? {
        alias: {
          'd3-time-format': d3TimeFormatMinMjs,
        },
      }
    : undefined,
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
    ],
  },
})
