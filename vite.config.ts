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

interface GroundedPlace { id: string; name: string; category: string; coordinates: [number, number] }

const MIN_JOB_DISTANCE_KM = 6

const distanceKmBetween = (from: [number, number], to: [number, number]) => {
  const latitudeKm = (to[1] - from[1]) * 111.32
  const longitudeKm = (to[0] - from[0]) * 111.32 * Math.cos(((from[1] + to[1]) / 2) * Math.PI / 180)
  return Math.hypot(latitudeKm, longitudeKm)
}

const placeCache = new Map<string, { expiresAt: number; places: GroundedPlace[] }>()

const groundedJobSchema = {
  type: 'object', additionalProperties: false, required: ['jobs'],
  properties: { jobs: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['passengerName', 'partySize', 'pickupPlaceId', 'destinationPlaceId'],
    properties: {
      passengerName: { type: 'string' }, partySize: { type: 'integer', minimum: 1, maximum: 4 },
      pickupPlaceId: { type: 'string' }, destinationPlaceId: { type: 'string' },
    },
  } } },
}

const overpassQuery = (latitude: number, longitude: number) => `[out:json][timeout:25];
(
  nwr(around:15000,${latitude},${longitude})[name][amenity];
  nwr(around:15000,${latitude},${longitude})[name][shop];
  nwr(around:15000,${latitude},${longitude})[name][tourism];
  nwr(around:15000,${latitude},${longitude})[name][leisure];
  nwr(around:15000,${latitude},${longitude})[name][railway~"station|halt"];
  nwr(around:15000,${latitude},${longitude})[name][public_transport];
);
out center;`

async function findRealPlaces(overpassUrl: string, city: Record<string, unknown>) {
  const center = city.center
  if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite)) {
    throw new Error('The city center must contain valid longitude and latitude coordinates.')
  }
  const cacheKey = `${center[0]},${center[1]}`
  const cached = placeCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.places

  const result = await fetch(overpassUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'TravelEmpire local game server' },
    body: new URLSearchParams({ data: overpassQuery(center[1] as number, center[0] as number) }),
    signal: AbortSignal.timeout(35_000),
  }).catch(() => { throw new Error('Could not load real places from OpenStreetMap.') })
  if (!result.ok) throw new Error(`OpenStreetMap place lookup returned ${result.status}.`)
  const data = await result.json() as { elements?: Array<{ type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> }> }
  const places = (data.elements ?? []).flatMap((element): GroundedPlace[] => {
    const latitude = element.lat ?? element.center?.lat
    const longitude = element.lon ?? element.center?.lon
    const name = element.tags?.name?.trim()
    const category = element.tags?.amenity ?? element.tags?.shop ?? element.tags?.tourism ?? element.tags?.leisure ?? element.tags?.railway ?? element.tags?.public_transport ?? 'place'
    return name && Number.isFinite(latitude) && Number.isFinite(longitude) && element.type && element.id
      ? [{ id: `${element.type[0]}${element.id}`, name, category, coordinates: [longitude!, latitude!] }]
      : []
  })
  const uniquePlaces = [...new Map(places.map((place) => [`${place.name.toLocaleLowerCase()}|${place.coordinates.join(',')}`, place])).values()]
    .sort((left, right) => {
      const distanceFromCenter = (place: GroundedPlace) => (place.coordinates[0] - (center[0] as number)) ** 2 + (place.coordinates[1] - (center[1] as number)) ** 2
      return distanceFromCenter(left) - distanceFromCenter(right)
    })
    .slice(0, 350)
  if (uniquePlaces.length < 2) throw new Error('OpenStreetMap did not return enough named places near this city.')
  placeCache.set(cacheKey, { expiresAt: Date.now() + 6 * 60 * 60 * 1000, places: uniquePlaces })
  return uniquePlaces
}

function localAiJobsEndpoint(ollamaUrl: string, model: string, overpassUrl: string): Plugin {
  return {
    name: 'local-ai-jobs-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/jobs', async (request, response) => {
        if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' })
        try {
          const jobRequest = JSON.parse(await readBody(request)) as Record<string, unknown>
          const city = jobRequest.city
          if (!city || typeof city !== 'object') return sendJson(response, 400, { error: 'A city is required.' })
          const places = await findRealPlaces(overpassUrl, city as Record<string, unknown>)
          const result = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              prompt: `Generate realistic, worthwhile taxi jobs from this request. Use ONLY pickupPlaceId and destinationPlaceId values from the supplied realPlaces list. Never invent, rename, or estimate a location. Every destination must be at least ${MIN_JOB_DISTANCE_KM} km from its pickup; use the supplied distanceFromCityKm values to favor places on different sides of the city instead of nearby pairs. Pick different IDs for each journey and prefer varied categories. Follow the JSON schema exactly.\n${JSON.stringify({ ...jobRequest, realPlaces: places.map(({ id, name, category, coordinates }) => ({ id, name, category, distanceFromCityKm: Math.round(distanceKmBetween((city as Record<string, unknown>).center as [number, number], coordinates) * 10) / 10 })) })}`,
              stream: false,
              format: groundedJobSchema,
              options: { temperature: 0.9 },
            }),
            signal: AbortSignal.timeout(90_000),
          })
          const data = await result.json() as { error?: string; response?: string }
          if (!result.ok) return sendJson(response, result.status, { error: data.error ?? 'Ollama request failed.' })
          if (!data.response) return sendJson(response, 502, { error: 'Ollama returned no job data.' })
          const generated = JSON.parse(data.response) as { jobs?: Array<{ passengerName?: unknown; partySize?: unknown; pickupPlaceId?: unknown; destinationPlaceId?: unknown }> }
          const placesById = new Map(places.map((place) => [place.id, place]))
          const jobs = (generated.jobs ?? []).flatMap((job) => {
            const pickup = typeof job.pickupPlaceId === 'string' ? placesById.get(job.pickupPlaceId) : undefined
            let destination = typeof job.destinationPlaceId === 'string' ? placesById.get(job.destinationPlaceId) : undefined
            if (!pickup || !destination || pickup.id === destination.id) return []
            if (distanceKmBetween(pickup.coordinates, destination.coordinates) < MIN_JOB_DISTANCE_KM) {
              destination = places
                .filter((place) => place.id !== pickup.id && distanceKmBetween(pickup.coordinates, place.coordinates) >= MIN_JOB_DISTANCE_KM)
                .sort((left, right) => distanceKmBetween(pickup.coordinates, right.coordinates) - distanceKmBetween(pickup.coordinates, left.coordinates))[0]
            }
            if (!destination) return []
            return [{ passengerName: job.passengerName, partySize: job.partySize, pickupLabel: pickup.name, pickup: pickup.coordinates, destinationLabel: destination.name, destination: destination.coordinates }]
          })
          if (!jobs.length) return sendJson(response, 502, { error: 'The AI did not select valid real-world places.' })
          return sendJson(response, 200, { jobs })
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
  return { plugins: [react(), localAiJobsEndpoint(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', env.OLLAMA_MODEL || 'llama3.2', env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter')], base: './' }
})
