import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const readBody = (request: IncomingMessage) => new Promise<string>((resolve, reject) => {
  let body = ''
  request.setEncoding('utf8')
  request.on('data', (chunk) => { body += chunk })
  request.on('end', () => resolve(body))
  request.on('error', reject)
})

const sendJson = (response: ServerResponse, status: number, body: unknown) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

const jobSchema = {
  type: 'object', additionalProperties: false, required: ['jobs'],
  properties: { jobs: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['passengerName', 'partySize', 'pickupLabel', 'pickup', 'destinationLabel', 'destination'],
    properties: {
      passengerName: { type: 'string' }, partySize: { type: 'integer', minimum: 1, maximum: 4 },
      pickupLabel: { type: 'string' }, pickup: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
      destinationLabel: { type: 'string' }, destination: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
    },
  } } },
}

function localAiJobsEndpoint(ollamaUrl: string, model: string): Plugin {
  return {
    name: 'local-ai-jobs-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/jobs', async (request, response) => {
        if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' })
        try {
          const jobRequest = JSON.parse(await readBody(request)) as Record<string, unknown>
          const result = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              prompt: `Generate realistic taxi jobs from this request. Follow the JSON schema exactly.\n${JSON.stringify(jobRequest)}`,
              stream: false,
              format: jobSchema,
              options: { temperature: 0.9 },
            }),
            signal: AbortSignal.timeout(90_000),
          })
          const data = await result.json() as { error?: string; response?: string }
          if (!result.ok) return sendJson(response, result.status, { error: data.error ?? 'Ollama request failed.' })
          if (!data.response) return sendJson(response, 502, { error: 'Ollama returned no job data.' })
          return sendJson(response, 200, JSON.parse(data.response))
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not generate jobs.'
          const hint = message.includes('fetch failed') ? 'Ollama is not running. Start Ollama, then run: ollama pull llama3.2' : message
          return sendJson(response, 500, { error: hint })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react(), localAiJobsEndpoint(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', env.OLLAMA_MODEL || 'llama3.2')], base: './' }
})
