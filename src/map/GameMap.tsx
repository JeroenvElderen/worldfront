import { memo, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { featureCollection, point } from '@turf/helpers'
import { getCity, irelandOverview } from '../data/cities'
import type { Coordinates, TaxiJob, Vehicle } from '../models/game'
import { getJobJourney } from '../services/jobEngine'
import { getTaxiModel } from '../data/taxis'

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

const remainingRoute = (coordinates: number[][], progress: number) => {
  if (coordinates.length < 2 || progress >= 1) {
    const end = routePosition(coordinates, 1)
    return [end, end]
  }
  const lengths = coordinates.slice(1).map((coordinate, index) => Math.hypot(coordinate[0] - coordinates[index][0], coordinate[1] - coordinates[index][1]))
  let target = Math.max(0, progress) * lengths.reduce((sum, length) => sum + length, 0)
  let segment = 0
  while (segment < lengths.length - 1 && target > lengths[segment]) target -= lengths[segment++]
  return [routePosition(coordinates, progress), ...coordinates.slice(segment + 1)]
}

const mapIcon = (kind: 'vehicle' | 'pickup' | 'destination', vehicle?: Vehicle) => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')!
  const model = vehicle ? getTaxiModel(vehicle.modelId ?? vehicle.powertrain ?? '') : undefined
  context.fillStyle = kind === 'vehicle' ? (model?.color ?? '#0f766e') : kind === 'pickup' ? '#f59e0b' : '#ef4444'
  context.beginPath(); context.arc(32, 32, 29, 0, Math.PI * 2); context.fill()
  context.strokeStyle = '#fff'; context.lineWidth = 4; context.stroke()
  context.fillStyle = '#fff'
  if (kind === 'vehicle') {
    context.fillRect(13, 29, 38, 15)
    context.beginPath(); context.moveTo(20, 29); context.lineTo(25, 20); context.lineTo(41, 20); context.lineTo(47, 29); context.fill()
    context.fillStyle = '#0f766e'; context.fillRect(27, 23, 12, 7)
    context.fillStyle = '#fff'; context.beginPath(); context.arc(21, 46, 5, 0, Math.PI * 2); context.arc(44, 46, 5, 0, Math.PI * 2); context.fill()
    context.fillStyle = '#fff'; context.font = '900 13px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(model?.marker ?? 'T', 33, 35)
    if (vehicle?.exteriorAccessories?.includes('roof-rack')) { context.strokeStyle = '#fff'; context.lineWidth = 2; context.strokeRect(23, 16, 20, 4) }
    if (vehicle?.exteriorAccessories?.includes('towbar')) { context.fillStyle = '#fff'; context.beginPath(); context.arc(55, 40, 3, 0, Math.PI * 2); context.fill() }
  } else if (kind === 'pickup') {
    context.font = '900 43px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('!', 32, 34)
  } else {
    context.beginPath(); context.arc(32, 32, 15, 0, Math.PI * 2); context.fill()
  }
  return context.getImageData(0, 0, 64, 64)
}

const jobColors = ['#38bdf8', '#f97316', '#a78bfa', '#22c55e', '#f43f5e', '#eab308']
type RouteSpeedLimit = { speed: number; unit: 'km/h' | 'mph' } | { unknown: true } | { none: true }
type RouteDetails = { coordinates: number[][]; speedLimits: RouteSpeedLimit[] }

const speedLimitKmh = (limit: RouteSpeedLimit | undefined) => {
  if (!limit || 'unknown' in limit || 'none' in limit) return null
  return Math.round(limit.unit === 'mph' ? limit.speed * 1.609344 : limit.speed)
}

const routeMotion = (route: RouteDetails, elapsed: number, fallbackSpeedKmh: number, topSpeedKmh: number) => {
  const lengths = route.coordinates.slice(1).map((coordinate, index) => Math.hypot(coordinate[0] - route.coordinates[index][0], coordinate[1] - route.coordinates[index][1]))
  const speeds = lengths.map((_, index) => Math.min(topSpeedKmh, speedLimitKmh(route.speedLimits[index]) ?? fallbackSpeedKmh))
  const durations = lengths.map((length, index) => length / Math.max(1, speeds[index]))
  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0)
  let remaining = Math.max(0, Math.min(1, elapsed)) * totalDuration
  let segment = 0
  while (segment < durations.length - 1 && remaining > durations[segment]) remaining -= durations[segment++]
  const segmentProgress = durations[segment] ? remaining / durations[segment] : 1
  const distanceBefore = lengths.slice(0, segment).reduce((sum, length) => sum + length, 0)
  const totalLength = lengths.reduce((sum, length) => sum + length, 0)
  return {
    progress: totalLength ? (distanceBefore + (lengths[segment] ?? 0) * segmentProgress) / totalLength : 1,
    speedKmh: elapsed >= 1 ? 0 : Math.round(speeds[segment] ?? 0),
  }
}

function GameMapView({ cityId, vehicles, jobs, onOpenJob }: GameMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const viewport = useRef<{ center: Coordinates; zoom: number } | null>(null)
  const pickupJobIds = useRef(new Set<string>())
  const pickupHandlers = useRef(new Map<string, { enter: () => void; leave: () => void; click: (event: mapboxgl.MapMouseEvent) => void }>())
  const [mapRevision, setMapRevision] = useState(0)
  const acceptedJobsKey = jobs.filter((job) => job.status === 'accepted').map((job) => `${job.id}:${job.acceptedAt ?? ''}`).join('|')

  useEffect(() => {
    if (!container.current) return
    if (token) mapboxgl.accessToken = token
    const selected = getCity(cityId)
    const abortController = new AbortController()
    const animationFrames: number[] = []
    const instance = new mapboxgl.Map({ container: container.current, style: token ? 'mapbox://styles/mapbox/streets-v12' : fallbackStyle, center: viewport.current?.center ?? selected?.coordinates ?? irelandOverview.center, zoom: viewport.current?.zoom ?? selected?.mapZoom ?? irelandOverview.zoom, attributionControl: false, pitchWithRotate: false })
    map.current = instance
    pickupJobIds.current.clear()
    pickupHandlers.current.clear()
    instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    instance.on('load', async () => {
      instance.addImage('pickup-marker', mapIcon('pickup'), { pixelRatio: 2 })
      instance.addImage('destination-marker', mapIcon('destination'), { pixelRatio: 2 })
      instance.addSource('company-base', { type: 'geojson', data: featureCollection(selected ? [point(selected.coordinates)] : []) })
      instance.addLayer({ id: 'base-halo', type: 'circle', source: 'company-base', paint: { 'circle-radius': 22, 'circle-color': '#22d3a7', 'circle-opacity': 0.22, 'circle-stroke-width': 1, 'circle-stroke-color': '#5eead4' } })
      instance.addLayer({ id: 'base', type: 'circle', source: 'company-base', paint: { 'circle-radius': 9, 'circle-color': '#0f766e', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } })

      for (const [index, vehicle] of vehicles.entries()) {
        const vehicleImageId = `vehicle-marker-${index}`
        instance.addImage(vehicleImageId, mapIcon('vehicle', vehicle), { pixelRatio: 2 })
        const job = jobs.find((candidate) => candidate.status === 'accepted' && (candidate.assignedVehicleId === vehicle.id || (!candidate.assignedVehicleId && vehicle.status === 'on-job')))
        const start = vehicle.position ?? selected?.coordinates
        if (!start) continue
        let pickupRoute: RouteDetails = { coordinates: job ? [start, job.pickup] : [start], speedLimits: [] }
        let passengerRoute: RouteDetails = { coordinates: job ? [job.pickup, job.destination] : [start], speedLimits: [] }
        if (job && token) {
          try {
            const fetchRoute = async (from: Coordinates, to: Coordinates) => {
              const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from.join(',')};${to.join(',')}?alternatives=true&annotations=maxspeed&continue_straight=true&geometries=geojson&overview=full&access_token=${token}`, { signal: abortController.signal })
              if (!response.ok) throw new Error(`Directions request failed: ${response.status}`)
              const result = await response.json() as { routes?: Array<{ duration: number; geometry: { coordinates: number[][] }; legs: Array<{ annotation?: { maxspeed?: RouteSpeedLimit[] } }> }> }
              const route = result.routes?.reduce((fastest, candidate) => candidate.duration < fastest.duration ? candidate : fastest)
              return route && { coordinates: route.geometry.coordinates, speedLimits: route.legs.flatMap((leg) => leg.annotation?.maxspeed ?? []) }
            }
            pickupRoute = await fetchRoute(start, job.pickup) ?? pickupRoute
            passengerRoute = await fetchRoute(job.pickup, job.destination) ?? passengerRoute
          } catch (error) { if ((error as Error).name === 'AbortError') return }
        }
        const sourceId = `taxi-${index}`
        instance.addSource(sourceId, { type: 'geojson', data: point(start, { speedLabel: '0 km/h' }) })
        instance.addLayer({ id: sourceId, type: 'symbol', source: sourceId, layout: { 'icon-image': vehicleImageId, 'icon-size': 1, 'icon-allow-overlap': true, 'text-field': ['get', 'speedLabel'], 'text-size': 11, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-offset': [0, 2.25], 'text-anchor': 'top', 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff', 'text-halo-color': '#10252d', 'text-halo-width': 2 } })
        if (!job) continue
        const color = jobColors[jobs.filter((candidate) => candidate.status === 'accepted').findIndex((candidate) => candidate.id === job.id) % jobColors.length]
        const pickupRouteId = `pickup-route-${index}`
        const passengerRouteId = `passenger-route-${index}`
        instance.addSource(pickupRouteId, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pickupRoute.coordinates } } })
        instance.addSource(passengerRouteId, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: passengerRoute.coordinates } } })
        instance.addLayer({ id: pickupRouteId, type: 'line', source: pickupRouteId, paint: { 'line-color': color, 'line-width': 6, 'line-opacity': 0.9, 'line-dasharray': [1.5, 1] } }, sourceId)
        instance.addLayer({ id: passengerRouteId, type: 'line', source: passengerRouteId, paint: { 'line-color': color, 'line-width': 6, 'line-opacity': 0.25 } }, sourceId)
        const journey = getJobJourney(job, vehicle)
        const animate = () => {
          const time = Date.now()
          const pickingUp = time < journey.pickupAt
          const elapsed = pickingUp
            ? Math.max(0, Math.min(1, (time - journey.acceptedAt) / (journey.pickupAt - journey.acceptedAt)))
            : Math.max(0, Math.min(1, (time - journey.pickupAt) / (journey.arrivesAt - journey.pickupAt)))
          const activeRoute = pickingUp ? pickupRoute : passengerRoute
          const fallbackSpeedKmh = job.durationMinutes > 0 ? job.distanceKm / (job.durationMinutes / 60) : 30
          const motion = routeMotion(activeRoute, elapsed, fallbackSpeedKmh, vehicle.topSpeedKmh ?? 130)
          const progress = motion.progress
          ;(instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined)?.setData(point(routePosition(activeRoute.coordinates, progress), { speedLabel: `${motion.speedKmh} km/h` }))
          const activeRouteId = pickingUp ? pickupRouteId : passengerRouteId
          ;(instance.getSource(activeRouteId) as mapboxgl.GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: remainingRoute(activeRoute.coordinates, progress) } })
          if (!pickingUp) {
            ;(instance.getSource(pickupRouteId) as mapboxgl.GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: remainingRoute(pickupRoute.coordinates, 1) } })
          }
          instance.setLayoutProperty(`pickup-${job.id}`, 'visibility', pickingUp ? 'visible' : 'none')
          instance.setLayoutProperty(`pickup-${job.id}-label`, 'visibility', pickingUp ? 'visible' : 'none')
          instance.setPaintProperty(pickupRouteId, 'line-opacity', pickingUp ? 0.9 : 0.15)
          instance.setPaintProperty(passengerRouteId, 'line-opacity', pickingUp ? 0.25 : 0.9)
          if (time < journey.arrivesAt) animationFrames.push(requestAnimationFrame(animate))
        }
        animationFrames.push(requestAnimationFrame(animate))
      }
      setMapRevision((revision) => revision + 1)
    })
    return () => { const center = instance.getCenter(); viewport.current = { center: [center.lng, center.lat], zoom: instance.getZoom() }; abortController.abort(); animationFrames.forEach(cancelAnimationFrame); map.current = null; instance.remove() }
    // Offered jobs are synchronized separately so background arrivals do not recreate the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, vehicles, acceptedJobsKey])

  useEffect(() => {
    const instance = map.current
    if (!instance?.isStyleLoaded()) return
    const visibleJobs = jobs.filter((job) => job.status === 'offered' || job.status === 'accepted')
    const visibleIds = new Set(visibleJobs.map((job) => job.id))

    for (const jobId of pickupJobIds.current) {
      if (visibleIds.has(jobId)) continue
      const sourceId = `pickup-${jobId}`
      const handlers = pickupHandlers.current.get(jobId)
      if (handlers) {
        instance.off('mouseenter', sourceId, handlers.enter)
        instance.off('mouseleave', sourceId, handlers.leave)
        instance.off('click', sourceId, handlers.click)
      }
      for (const layerId of [`${sourceId}-label`, `offer-route-${jobId}`, `destination-${jobId}-label`, `destination-${jobId}`]) if (instance.getLayer(layerId)) instance.removeLayer(layerId)
      if (instance.getLayer(sourceId)) instance.removeLayer(sourceId)
      for (const extraSourceId of [`offer-route-${jobId}`, `destination-${jobId}`]) if (instance.getSource(extraSourceId)) instance.removeSource(extraSourceId)
      if (instance.getSource(sourceId)) instance.removeSource(sourceId)
      pickupJobIds.current.delete(jobId)
      pickupHandlers.current.delete(jobId)
    }

    for (const job of visibleJobs) {
      if (pickupJobIds.current.has(job.id)) continue
      const sourceId = `pickup-${job.id}`
      instance.addSource(sourceId, { type: 'geojson', data: point(job.pickup, { title: job.pickupLabel }) })
      instance.addLayer({ id: sourceId, type: 'symbol', source: sourceId, layout: { 'icon-image': 'pickup-marker', 'icon-size': 1, 'icon-allow-overlap': true } })
      instance.addLayer({ id: `${sourceId}-label`, type: 'symbol', source: sourceId, layout: { 'text-field': 'PICKUP', 'text-size': 10, 'text-offset': [0, 1.8], 'text-anchor': 'top' }, paint: { 'text-color': '#fff', 'text-halo-color': '#15252f', 'text-halo-width': 2 } })
      const destinationId = `destination-${job.id}`
      instance.addSource(destinationId, { type: 'geojson', data: point(job.destination, { title: job.destinationLabel }) })
      instance.addLayer({ id: destinationId, type: 'symbol', source: destinationId, layout: { 'icon-image': 'destination-marker', 'icon-size': 0.8, 'icon-allow-overlap': true } })
      instance.addLayer({ id: `${destinationId}-label`, type: 'symbol', source: destinationId, layout: { 'text-field': 'DESTINATION', 'text-size': 10, 'text-offset': [0, 1.6], 'text-anchor': 'top' }, paint: { 'text-color': '#fff', 'text-halo-color': '#15252f', 'text-halo-width': 2 } })
      const routeId = `offer-route-${job.id}`
      instance.addSource(routeId, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [job.pickup, job.destination] } } })
      instance.addLayer({ id: routeId, type: 'line', source: routeId, paint: { 'line-color': '#f59e0b', 'line-width': 5, 'line-opacity': 0.75, 'line-dasharray': [2, 1] } }, sourceId)
      if (token && job.status === 'offered') fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${job.pickup.join(',')};${job.destination.join(',')}?geometries=geojson&overview=full&access_token=${token}`)
        .then((response) => response.ok ? response.json() : null)
        .then((result: { routes?: Array<{ geometry: { coordinates: number[][] } }> } | null) => {
          const source = instance.getSource(routeId) as mapboxgl.GeoJSONSource | undefined
          const coordinates = result?.routes?.[0]?.geometry.coordinates
          if (source && coordinates) source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })
        }).catch(() => undefined)
      const handlers = {
        enter: () => { instance.getCanvas().style.cursor = 'pointer' },
        leave: () => { instance.getCanvas().style.cursor = '' },
        click: (event: mapboxgl.MapMouseEvent) => { event.originalEvent.stopPropagation(); onOpenJob(job.id) },
      }
      instance.on('mouseenter', sourceId, handlers.enter)
      instance.on('mouseleave', sourceId, handlers.leave)
      instance.on('click', sourceId, handlers.click)
      pickupHandlers.current.set(job.id, handlers)
      pickupJobIds.current.add(job.id)
    }
  }, [jobs, mapRevision, onOpenJob])

  return <div ref={container} className="absolute inset-0" aria-label="Interactive game map" />
}

export const GameMap = memo(GameMapView, (previous, next) =>
  previous.cityId === next.cityId &&
  previous.vehicles === next.vehicles &&
  previous.onOpenJob === next.onOpenJob &&
  previous.jobs === next.jobs
)
