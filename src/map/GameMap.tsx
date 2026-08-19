import { memo, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { featureCollection, point } from '@turf/helpers'
import { getCity, irelandOverview } from '../data/cities'
import type { Coordinates, TaxiJob, Vehicle } from '../models/game'
import { getJobJourney } from '../services/jobEngine'

interface GameMapProps { cityId: string | null; vehicles: Vehicle[]; jobs: TaxiJob[]; onOpenJob: (jobId: string) => void }
const configuredToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined
const token = configuredToken && !configuredToken.includes('your_public_mapbox_token') ? configuredToken : undefined
const fallbackStyle: mapboxgl.StyleSpecification = { version: 8, sources: { openStreetMap: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'openStreetMap', type: 'raster', source: 'openStreetMap' }] }

const routePosition = (coordinates: number[][], progress: number): Coordinates => {
  const lengths = coordinates.slice(1).map((coordinate, index) => Math.hypot(coordinate[0] - coordinates[index][0], coordinate[1] - coordinates[index][1]))
  let target = progress * lengths.reduce((sum, length) => sum + length, 0)
  let segment = 0
  while (segment < lengths.length - 1 && target > lengths[segment]) target -= lengths[segment++]
  const start = coordinates[segment]
  const end = coordinates[segment + 1] ?? start
  const amount = lengths[segment] ? target / lengths[segment] : 1
  return [start[0] + (end[0] - start[0]) * amount, start[1] + (end[1] - start[1]) * amount]
}

const routeDistanceKm = (coordinates: number[][]) => coordinates.slice(1).reduce((total, coordinate, index) => {
  const previous = coordinates[index]
  const latitudeKm = (coordinate[1] - previous[1]) * 111.32
  const longitudeKm = (coordinate[0] - previous[0]) * 111.32 * Math.cos(((coordinate[1] + previous[1]) / 2) * Math.PI / 180)
  return total + Math.hypot(latitudeKm, longitudeKm)
}, 0)

function GameMapView({ cityId, vehicles, jobs, onOpenJob }: GameMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const [routeCount, setRouteCount] = useState(0)
  const [liveSpeeds, setLiveSpeeds] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!container.current) return
    if (token) mapboxgl.accessToken = token
    const selected = getCity(cityId)
    const abortController = new AbortController()
    const animationFrames: number[] = []
    const instance = new mapboxgl.Map({ container: container.current, style: token ? 'mapbox://styles/mapbox/streets-v12' : fallbackStyle, center: selected?.coordinates ?? irelandOverview.center, zoom: selected?.mapZoom ?? irelandOverview.zoom, attributionControl: false, pitchWithRotate: false })
    instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    instance.on('load', async () => {
      instance.addSource('company-base', { type: 'geojson', data: featureCollection(selected ? [point(selected.coordinates)] : []) })
      instance.addLayer({ id: 'base-halo', type: 'circle', source: 'company-base', paint: { 'circle-radius': 22, 'circle-color': '#22d3a7', 'circle-opacity': 0.22, 'circle-stroke-width': 1, 'circle-stroke-color': '#5eead4' } })
      instance.addLayer({ id: 'base', type: 'circle', source: 'company-base', paint: { 'circle-radius': 9, 'circle-color': '#0f766e', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } })

      for (const job of jobs.filter((candidate) => candidate.status === 'offered' || candidate.status === 'accepted')) {
        const sourceId = `pickup-${job.id}`
        instance.addSource(sourceId, { type: 'geojson', data: point(job.pickup, { title: job.pickupLabel }) })
        instance.addLayer({ id: sourceId, type: 'circle', source: sourceId, paint: { 'circle-radius': 10, 'circle-color': '#fbbf24', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } })
        instance.addLayer({ id: `${sourceId}-label`, type: 'symbol', source: sourceId, layout: { 'text-field': '● PICKUP', 'text-size': 10, 'text-offset': [0, 1.8], 'text-anchor': 'top' }, paint: { 'text-color': '#fff', 'text-halo-color': '#15252f', 'text-halo-width': 2 } })
        instance.on('mouseenter', sourceId, () => { instance.getCanvas().style.cursor = 'pointer' })
        instance.on('mouseleave', sourceId, () => { instance.getCanvas().style.cursor = '' })
        instance.on('click', sourceId, (event) => { event.originalEvent.stopPropagation(); onOpenJob(job.id) })
      }

      for (const [index, vehicle] of vehicles.entries()) {
        const job = jobs.find((candidate) => candidate.status === 'accepted' && (candidate.assignedVehicleId === vehicle.id || (!candidate.assignedVehicleId && vehicle.status === 'on-job')))
        const start = vehicle.position ?? selected?.coordinates
        if (!start) continue
        let pickupCoordinates: number[][] = job ? [start, job.pickup] : [start]
        let passengerCoordinates: number[][] = job ? [job.pickup, job.destination] : [start]
        if (job && token) {
          try {
            const fetchRoute = async (from: Coordinates, to: Coordinates) => {
              const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from.join(',')};${to.join(',')}?alternatives=true&continue_straight=true&geometries=geojson&overview=full&access_token=${token}`, { signal: abortController.signal })
              if (!response.ok) throw new Error(`Directions request failed: ${response.status}`)
              const result = await response.json() as { routes?: Array<{ duration: number; geometry: { coordinates: number[][] } }> }
              return result.routes?.reduce((fastest, route) => route.duration < fastest.duration ? route : fastest)?.geometry.coordinates
            }
            pickupCoordinates = await fetchRoute(start, job.pickup) ?? pickupCoordinates
            passengerCoordinates = await fetchRoute(job.pickup, job.destination) ?? passengerCoordinates
          } catch (error) { if ((error as Error).name === 'AbortError') return }
        }
        const sourceId = `taxi-${index}`
        instance.addSource(sourceId, { type: 'geojson', data: point(start, { name: vehicle.name }) })
        instance.addLayer({ id: sourceId, type: 'circle', source: sourceId, paint: { 'circle-radius': 9, 'circle-color': job ? '#fbbf24' : '#22d3a7', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } })
        if (!job) continue
        const pickupRouteId = `pickup-route-${index}`
        const passengerRouteId = `passenger-route-${index}`
        instance.addSource(pickupRouteId, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pickupCoordinates } } })
        instance.addSource(passengerRouteId, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: passengerCoordinates } } })
        instance.addLayer({ id: pickupRouteId, type: 'line', source: pickupRouteId, paint: { 'line-color': '#f59e0b', 'line-width': 6, 'line-opacity': 0.9, 'line-dasharray': [1.5, 1] } }, sourceId)
        instance.addLayer({ id: passengerRouteId, type: 'line', source: passengerRouteId, paint: { 'line-color': '#38bdf8', 'line-width': 6, 'line-opacity': 0.25 } }, sourceId)
        const journey = getJobJourney(job, vehicle)
        const pickupSpeed = Math.round(routeDistanceKm(pickupCoordinates) / ((journey.pickupAt - journey.acceptedAt) / 3_600_000))
        const passengerSpeed = Math.round(routeDistanceKm(passengerCoordinates) / ((journey.arrivesAt - journey.pickupAt) / 3_600_000))
        let lastSpeedUpdate = 0
        const animate = (now: number) => {
          const time = Date.now()
          const pickingUp = time < journey.pickupAt
          const progress = pickingUp
            ? Math.max(0, Math.min(1, (time - journey.acceptedAt) / (journey.pickupAt - journey.acceptedAt)))
            : Math.max(0, Math.min(1, (time - journey.pickupAt) / (journey.arrivesAt - journey.pickupAt)))
          const activeCoordinates = pickingUp ? pickupCoordinates : passengerCoordinates
          ;(instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined)?.setData(point(routePosition(activeCoordinates, progress), { name: vehicle.name }))
          instance.setLayoutProperty(`pickup-${job.id}`, 'visibility', pickingUp ? 'visible' : 'none')
          instance.setLayoutProperty(`pickup-${job.id}-label`, 'visibility', pickingUp ? 'visible' : 'none')
          instance.setPaintProperty(pickupRouteId, 'line-opacity', pickingUp ? 0.9 : 0.15)
          instance.setPaintProperty(passengerRouteId, 'line-opacity', pickingUp ? 0.25 : 0.9)
          if (now - lastSpeedUpdate > 1000) {
            lastSpeedUpdate = now
            const speedKmh = time < journey.arrivesAt ? (pickingUp ? pickupSpeed : passengerSpeed) : 0
            setLiveSpeeds((current) => current[vehicle.id] === speedKmh ? current : { ...current, [vehicle.id]: speedKmh })
          }
          if (time < journey.arrivesAt) animationFrames.push(requestAnimationFrame(animate))
        }
        animationFrames.push(requestAnimationFrame(animate))
      }
      setRouteCount(jobs.filter((job) => job.status === 'accepted').length)
    })
    return () => { abortController.abort(); animationFrames.forEach(cancelAnimationFrame); instance.remove(); setLiveSpeeds({}) }
  }, [cityId, vehicles, jobs, onOpenJob])

  return <div ref={container} className="absolute inset-0" aria-label="Interactive game map">
    {routeCount > 0 && <div className="traffic-status">{token ? 'LIVE TRAFFIC' : 'REAL-TIME SPEED'} · {Object.values(liveSpeeds).filter(Boolean).map((speed) => `${speed} KM/H`).join(' · ') || 'ARRIVED'}</div>}
  </div>
}

export const GameMap = memo(GameMapView, (previous, next) =>
  previous.cityId === next.cityId &&
  previous.vehicles === next.vehicles &&
  previous.onOpenJob === next.onOpenJob &&
  previous.jobs === next.jobs
)
