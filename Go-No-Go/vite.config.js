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

function readNodeRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function localEvaluationApiPlugin() {
  return {
    name: 'local-openai-mission-evaluator-api',
    configureServer(server) {
      server.middlewares.use('/api/evaluate-mission', async (req, res, next) => {
        try {
          const { handleEvaluateMissionRequest } = await server.ssrLoadModule(
            '/src/server/missionEvaluator.ts',
          )
          const fullUrl = new URL(
            req.originalUrl || req.url || '/api/evaluate-mission',
            'http://127.0.0.1',
          ).toString()
          const method = req.method || 'GET'
          const hasBody = method !== 'GET' && method !== 'HEAD'
          const bodyBuffer = hasBody ? await readNodeRequestBody(req) : undefined
          const headers = new Headers()
          if (req.headers['content-type']) {
            headers.set('content-type', String(req.headers['content-type']))
          }
          const webReq = new Request(fullUrl, {
            method,
            headers,
            body: bodyBuffer && bodyBuffer.length > 0 ? bodyBuffer : undefined,
          })
          const webRes = await handleEvaluateMissionRequest(webReq, {
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            OPENAI_MODEL: process.env.OPENAI_MODEL,
          })
          await sendNodeWebResponse(res, webRes)
        } catch (err) {
          next(err)
        }
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/evaluate-mission', (_req, res) => {
        res.statusCode = 503
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(
          JSON.stringify({
            ok: false,
            code: 'EVALUATION_CREDENTIALS_MISSING',
            error:
              'Static Vite preview does not execute Cloudflare Pages Functions. Run `wrangler pages dev dist` with local secrets for live /api/evaluate-mission testing.',
          }),
        )
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localWeatherApiPlugin(), localEvaluationApiPlugin()],
  resolve: useMinD3Fallback
    ? {
        alias: {
          'd3-time-format': d3TimeFormatMinMjs,
        },
      }
    : undefined,
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/node_modules/three/')) {
            return 'vendor-three'
          }
          if (
            id.includes('/node_modules/@react-three/') ||
            id.includes('/node_modules/three-stdlib/') ||
            id.includes('/node_modules/maath/') ||
            id.includes('/node_modules/camera-controls/')
          ) {
            return 'vendor-r3f'
          }
          if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/d3-')) {
            return 'vendor-charts'
          }
          if (id.includes('/node_modules/@supabase/')) {
            return 'vendor-supabase'
          }
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router/') ||
            id.includes('/node_modules/zustand/') ||
            id.includes('/node_modules/lucide-react/')
          ) {
            return 'vendor-ui'
          }
          return undefined
        },
      },
    },
  },
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
