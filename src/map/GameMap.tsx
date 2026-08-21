import { memo, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { featureCollection, lineString, point } from '@turf/helpers'
import { mapboxAccessToken } from '../config/mapbox'
import { getCity, irelandOverview } from '../data/cities'
import type { Coordinates, TaxiJob, Vehicle } from '../models/game'
import { getJobJourney } from '../services/jobEngine'
import { postalRouteProgress } from '../services/postalEngine'
import { rentalJourneyProgress } from '../services/rentalEngine'

interface GameMapProps { cityId: string | null; vehicles: Vehicle[]; jobs: TaxiJob[]; focusedJobId: string | null; onOpenJob: (jobId: string) => void }
const token = mapboxAccessToken
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
  if (coordinates.length < 2) return coordinates
  const lengths = coordinates.slice(1).map((coordinate, index) => Math.hypot(coordinate[0] - coordinates[index][0], coordinate[1] - coordinates[index][1]))
  let target = Math.max(0, Math.min(1, progress)) * lengths.reduce((sum, length) => sum + length, 0)
  let segment = 0
  while (segment < lengths.length - 1 && target > lengths[segment]) target -= lengths[segment++]
  const currentPosition = routePosition(coordinates, progress)
  return [currentPosition, ...coordinates.slice(segment + 1)]
}

const mapIcon = (kind: 'new-job' | 'active-job' | 'new-destination' | 'active-destination') => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')!
  context.fillStyle = kind.startsWith('active-') ? '#f59e0b' : '#ef4444'
  context.beginPath(); context.arc(32, 32, 29, 0, Math.PI * 2); context.fill()
  context.strokeStyle = '#fff'; context.lineWidth = 4; context.stroke()
  context.fillStyle = '#fff'
  if (kind.endsWith('-job')) {
    context.font = '900 43px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('!', 32, 34)
  } else {
    context.beginPath(); context.arc(32, 32, 15, 0, Math.PI * 2); context.fill()
  }
  return context.getImageData(0, 0, 64, 64)
}

// One-second movement steps keep the small taxi dots useful without continuously
// waking the CPU and GPU to render decorative intermediate positions.
const JOURNEY_UPDATE_INTERVAL_MS = 1_000
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
  }
}

const vehicleColor = {
  available: '#22c55e',
  pickingUp: '#f59e0b',
  carryingPassenger: '#ef4444',
  maintenance: '#64748b',
  postal: '#ec4899',
  rental: '#8b5cf6',
} as const

const VEHICLE_MARKER_RADIUS = 4
const VEHICLE_MARKER_STROKE_WIDTH = 1.5
const JOB_MARKER_SIZE = 0.65

function GameMapView({ cityId, vehicles, jobs, focusedJobId, onOpenJob }: GameMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const viewport = useRef<{ center: Coordinates; zoom: number } | null>(null)
  const pickupJobIds = useRef(new Set<string>())
  const pickupHandlers = useRef(new Map<string, { enter: () => void; leave: () => void; click: (event: mapboxgl.MapMouseEvent) => void }>())
  const liveJobIds = useRef(new Set<string>())
  const liveJobTimers = useRef(new Map<string, number>())
  const liveJobRunners = useRef(new Map<string, () => void>())
  const [mapRevision, setMapRevision] = useState(0)
  const [mapRecoveryRevision, setMapRecoveryRevision] = useState(0)
  // Job changes are applied to the existing WebGL map by the synchronization
  // effects below. In particular, accepting a call must never recreate the map.
  const fleetConfigurationKey = vehicles.map((vehicle) => `${vehicle.id}:${vehicle.modelId}:${(vehicle.exteriorAccessories ?? []).join(',')}:${vehicle.serviceTrip?.startedAt ?? ''}:${vehicle.postalRoute?.startedAt ?? ''}:${vehicle.rentalJourney?.startedAt ?? ''}`).join('|')

  useEffect(() => {
    if (!container.current) return
    const currentLiveJobIds = liveJobIds.current
    const currentLiveJobTimers = liveJobTimers.current
    const currentLiveJobRunners = liveJobRunners.current
    if (token) mapboxgl.accessToken = token
    const selected = getCity(cityId)
    const abortController = new AbortController()
    const animationTimers = new Set<number>()
    const animationRunners = new Set<() => void>()
    let usingFallbackStyle = !token
    let recoveryRequested = false
    const requestRecovery = () => {
      if (recoveryRequested) return
      recoveryRequested = true
      setMapRecoveryRevision((revision) => revision + 1)
    }
    const instance = new mapboxgl.Map({
      container: container.current,
      style: token ? 'mapbox://styles/mapbox/streets-v12' : fallbackStyle,
      center: viewport.current?.center ?? selected?.coordinates ?? irelandOverview.center,
      zoom: viewport.current?.zoom ?? selected?.mapZoom ?? irelandOverview.zoom,
      attributionControl: false,
      pitchWithRotate: false,
      // Avoid periodic network and render work when the already-cached map is
      // perfectly adequate for this mostly static management-game viewport.
      refreshExpiredTiles: false,
      fadeDuration: 0,
      maxTileCacheSize: 24,
    })
    map.current = instance
    pickupJobIds.current.clear()
    pickupHandlers.current.clear()
    currentLiveJobIds.clear()
    currentLiveJobTimers.forEach(window.clearTimeout)
    currentLiveJobTimers.clear()
    currentLiveJobRunners.clear()
    instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    const canvas = instance.getCanvas()
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      requestRecovery()
    }
    canvas.addEventListener('webglcontextlost', handleContextLost)
    instance.on('error', (event) => {
      if (map.current !== instance || usingFallbackStyle) return
      const message = event.error?.message?.toLowerCase() ?? ''
      // Authentication/style/tile failures must not leave a permanently black
      // canvas. OpenStreetMap raster tiles keep the game usable, while a lost
      // WebGL context is handled by rebuilding the entire map.
      if (message.includes('webgl') || message.includes('context lost')) {
        requestRecovery()
        return
      }
      usingFallbackStyle = true
      instance.setStyle(fallbackStyle)
    })
    instance.on('load', async () => {
      instance.addImage('new-job-marker', mapIcon('new-job'), { pixelRatio: 2 })
      instance.addImage('active-job-marker', mapIcon('active-job'), { pixelRatio: 2 })
      instance.addImage('new-destination-marker', mapIcon('new-destination'), { pixelRatio: 2 })
      instance.addImage('active-destination-marker', mapIcon('active-destination'), { pixelRatio: 2 })
      instance.addSource('company-base', { type: 'geojson', data: featureCollection(selected ? [point(selected.coordinates)] : []) })
      instance.addLayer({ id: 'base-halo', type: 'circle', source: 'company-base', paint: { 'circle-radius': 22, 'circle-color': '#22d3a7', 'circle-opacity': 0.22, 'circle-stroke-width': 1, 'circle-stroke-color': '#5eead4' } })
      instance.addLayer({ id: 'base', type: 'circle', source: 'company-base', paint: { 'circle-radius': 9, 'circle-color': '#0f766e', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } })

      for (const [index, vehicle] of vehicles.entries()) {
        const job = jobs.find((candidate) => candidate.status === 'accepted' && (candidate.assignedVehicleId === vehicle.id || (!candidate.assignedVehicleId && vehicle.status === 'on-job')))
        const start = vehicle.position ?? selected?.coordinates
        if (!start) continue
        if (vehicle.rentalJourney) {
          const rental = vehicle.rentalJourney
          const sourceId = `rental-${vehicle.id}`
          let roadCoordinates: number[][] = rental.waypoints
          if (token) {
            try {
              const waypoints = rental.waypoints.map((coordinate) => coordinate.join(',')).join(';')
              const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}?geometries=geojson&overview=full&access_token=${token}`, { signal: abortController.signal })
              if (response.ok) {
                const result = await response.json() as { routes?: Array<{ geometry: { coordinates: number[][] } }> }
                roadCoordinates = result.routes?.[0]?.geometry.coordinates ?? roadCoordinates
              }
            } catch (error) { if ((error as Error).name === 'AbortError') return }
          }
          instance.addSource(sourceId, { type: 'geojson', data: point(routePosition(roadCoordinates, rentalJourneyProgress(rental))) })
          instance.addLayer({ id: sourceId, type: 'circle', source: sourceId, paint: { 'circle-radius': VEHICLE_MARKER_RADIUS, 'circle-color': vehicleColor.rental, 'circle-stroke-width': VEHICLE_MARKER_STROKE_WIDTH, 'circle-stroke-color': '#ffffff' } })
          let rentalTimer: number | undefined
          const animateRental = () => {
            if (rentalTimer !== undefined) animationTimers.delete(rentalTimer)
            const progress = rentalJourneyProgress(rental)
            ;(instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined)?.setData(point(routePosition(roadCoordinates, progress)))
            if (progress < 1 && document.visibilityState !== 'hidden') { rentalTimer = window.setTimeout(animateRental, JOURNEY_UPDATE_INTERVAL_MS); animationTimers.add(rentalTimer) }
          }
          animationRunners.add(animateRental); animateRental(); continue
        }
        if (vehicle.postalRoute) {
          const postal = vehicle.postalRoute
          const sourceId = `taxi-${index}`
          const routeSourceId = `${sourceId}-postal-route`
          let roadCoordinates: number[][] = postal.stops.map((stop) => stop.coordinates)
          if (token) {
            try {
              const waypoints = postal.stops.map((stop) => stop.coordinates.join(',')).join(';')
              const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${waypoints}?continue_straight=true&geometries=geojson&overview=full&access_token=${token}`, { signal: abortController.signal })
              if (response.ok) {
                const result = await response.json() as { routes?: Array<{ geometry: { coordinates: number[][] } }> }
                roadCoordinates = result.routes?.[0]?.geometry.coordinates ?? roadCoordinates
              }
            } catch (error) { if ((error as Error).name === 'AbortError') return }
          }
          instance.addSource(routeSourceId, { type: 'geojson', data: lineString(roadCoordinates) })
          instance.addLayer({ id: routeSourceId, type: 'line', source: routeSourceId, paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [1.5, 1] } })
          postal.stops.slice(1, -1).forEach((stop, stopIndex) => {
            const stopId = `${sourceId}-post-stop-${stopIndex}`
            instance.addSource(stopId, { type: 'geojson', data: point(stop.coordinates) })
            instance.addLayer({ id: stopId, type: 'circle', source: stopId, paint: { 'circle-radius': 7, 'circle-color': '#fbbf24', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } })
            instance.addLayer({ id: `${stopId}-label`, type: 'symbol', source: stopId, layout: { 'text-field': `${stopIndex + 1}`, 'text-size': 9 }, paint: { 'text-color': '#422006' } })
          })
          instance.addSource(sourceId, { type: 'geojson', data: point(start) })
          instance.addLayer({ id: sourceId, type: 'circle', source: sourceId, paint: { 'circle-radius': VEHICLE_MARKER_RADIUS, 'circle-color': vehicleColor.postal, 'circle-stroke-width': VEHICLE_MARKER_STROKE_WIDTH, 'circle-stroke-color': '#ffffff' } })
          let postalTimer: number | undefined
          const animatePostal = () => {
            if (postalTimer !== undefined) animationTimers.delete(postalTimer)
            const progress = postalRouteProgress(postal)
            ;(instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined)?.setData(point(routePosition(roadCoordinates, progress)))
            ;(instance.getSource(routeSourceId) as mapboxgl.GeoJSONSource | undefined)?.setData(lineString(remainingRoute(roadCoordinates, progress)))
            if (progress < 1 && document.visibilityState !== 'hidden') { postalTimer = window.setTimeout(animatePostal, JOURNEY_UPDATE_INTERVAL_MS); animationTimers.add(postalTimer) }
          }
          animationRunners.add(animatePostal); animatePostal(); continue
        }
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
        if (job) {
          const routeSourceId = `${sourceId}-route`
          instance.addSource(routeSourceId, { type: 'geojson', data: lineString([...pickupRoute.coordinates, ...passengerRoute.coordinates.slice(1)]) })
          instance.addLayer({ id: routeSourceId, type: 'line', source: routeSourceId, paint: { 'line-color': '#0f766e', 'line-width': 2.5, 'line-opacity': 0.9 } })
        }
        instance.addSource(sourceId, { type: 'geojson', data: point(start) })
        instance.addLayer({ id: sourceId, type: 'circle', source: sourceId, paint: { 'circle-radius': VEHICLE_MARKER_RADIUS, 'circle-color': vehicle.type === 'post' ? vehicleColor.postal : job ? vehicleColor.pickingUp : vehicle.status === 'maintenance' ? vehicleColor.maintenance : vehicleColor.available, 'circle-stroke-width': VEHICLE_MARKER_STROKE_WIDTH, 'circle-stroke-color': '#ffffff' } })
        if (!job && vehicle.serviceTrip) {
          const service = vehicle.serviceTrip
          let serviceTimer: number | undefined
          const animateService = () => {
            if (serviceTimer !== undefined) animationTimers.delete(serviceTimer)
            const startedAt = new Date(service.startedAt).getTime()
            const arrivesAt = new Date(service.arrivesAt).getTime()
            const progress = Math.max(0, Math.min(1, (Date.now() - startedAt) / (arrivesAt - startedAt)))
            ;(instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined)?.setData(point(routePosition([service.from, service.destination], progress)))
            if (progress < 1 && document.visibilityState !== 'hidden') { serviceTimer = window.setTimeout(animateService, JOURNEY_UPDATE_INTERVAL_MS); animationTimers.add(serviceTimer) }
          }
          animationRunners.add(animateService); animateService(); continue
        }
        if (!job) continue
        liveJobIds.current.add(job.id)
        const journey = getJobJourney(job, vehicle)
        let animationTimer: number | undefined
        const scheduleAnimation = () => {
          if (animationTimer !== undefined) {
            window.clearTimeout(animationTimer)
            animationTimers.delete(animationTimer)
          }
          if (document.visibilityState === 'hidden') return
          animationTimer = window.setTimeout(animate, JOURNEY_UPDATE_INTERVAL_MS)
          animationTimers.add(animationTimer)
        }
        const animate = () => {
          if (animationTimer !== undefined) animationTimers.delete(animationTimer)
          const time = Date.now()
          const pickingUp = time < journey.pickupAt
          const elapsed = pickingUp
            ? Math.max(0, Math.min(1, (time - journey.acceptedAt) / (journey.pickupAt - journey.acceptedAt)))
            : Math.max(0, Math.min(1, (time - journey.pickupAt) / (journey.arrivesAt - journey.pickupAt)))
          const activeRoute = pickingUp ? pickupRoute : passengerRoute
          const fallbackSpeedKmh = job.durationMinutes > 0 ? job.distanceKm / (job.durationMinutes / 60) : 30
          const motion = routeMotion(activeRoute, elapsed, fallbackSpeedKmh, vehicle.topSpeedKmh ?? 130)
          const progress = motion.progress
          const currentPosition = routePosition(activeRoute.coordinates, progress)
          ;(instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined)?.setData(point(currentPosition))
          const remainingCoordinates = pickingUp
            ? [...remainingRoute(pickupRoute.coordinates, progress), ...passengerRoute.coordinates.slice(1)]
            : remainingRoute(passengerRoute.coordinates, progress)
          ;(instance.getSource(`${sourceId}-route`) as mapboxgl.GeoJSONSource | undefined)?.setData(lineString(remainingCoordinates))
          instance.setPaintProperty(sourceId, 'circle-color', pickingUp ? vehicleColor.pickingUp : vehicleColor.carryingPassenger)
          if (instance.getLayer(`pickup-${job.id}`)) instance.setLayoutProperty(`pickup-${job.id}`, 'visibility', pickingUp ? 'visible' : 'none')
          if (instance.getLayer(`pickup-${job.id}-label`)) instance.setLayoutProperty(`pickup-${job.id}-label`, 'visibility', pickingUp ? 'visible' : 'none')
          if (time < journey.arrivesAt) scheduleAnimation()
          else animationRunners.delete(animate)
        }
        animationRunners.add(animate)
        animate()
      }
      setMapRevision((revision) => revision + 1)
    })
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        animationTimers.forEach(window.clearTimeout)
        animationTimers.clear()
        currentLiveJobTimers.forEach(window.clearTimeout)
        currentLiveJobTimers.clear()
        instance.stop()
        return
      }
      instance.resize()
      instance.triggerRepaint()
      animationRunners.forEach((run) => run())
      currentLiveJobRunners.forEach((run) => run())
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handleVisibilityChange)
    window.addEventListener('online', handleVisibilityChange)
    return () => {
      const center = instance.getCenter()
      viewport.current = { center: [center.lng, center.lat], zoom: instance.getZoom() }
      abortController.abort()
      animationTimers.forEach(window.clearTimeout)
      currentLiveJobTimers.forEach(window.clearTimeout)
      currentLiveJobTimers.clear()
      currentLiveJobRunners.clear()
      currentLiveJobIds.clear()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handleVisibilityChange)
      window.removeEventListener('online', handleVisibilityChange)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      map.current = null
      instance.remove()
    }
    // Jobs are synchronized separately so accepting or completing one does not recreate the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, fleetConfigurationKey, mapRecoveryRevision])

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
        instance.off('click', `${sourceId}-label`, handlers.click)
      }
      for (const layerId of [`${sourceId}-label`, `destination-${jobId}-label`, `destination-${jobId}`]) if (instance.getLayer(layerId)) instance.removeLayer(layerId)
      if (instance.getLayer(sourceId)) instance.removeLayer(sourceId)
      if (instance.getSource(`destination-${jobId}`)) instance.removeSource(`destination-${jobId}`)
      if (instance.getSource(sourceId)) instance.removeSource(sourceId)
      pickupJobIds.current.delete(jobId)
      pickupHandlers.current.delete(jobId)
    }

    for (const job of visibleJobs) {
      const sourceId = `pickup-${job.id}`
      const markerImage = job.status === 'accepted' && job.assignedVehicleId
        ? 'active-job-marker'
        : 'new-job-marker'
      const destinationMarkerImage = job.status === 'accepted' && job.assignedVehicleId
        ? 'active-destination-marker'
        : 'new-destination-marker'
      if (pickupJobIds.current.has(job.id)) {
        // Job updates do not rebuild the map, so update the marker in place.
        if (instance.getLayer(sourceId)) instance.setLayoutProperty(sourceId, 'icon-image', markerImage)
        if (instance.getLayer(`${sourceId}-label`)) {
          instance.setLayoutProperty(`${sourceId}-label`, 'text-field', job.status === 'offered' ? `AVAILABLE · €${Math.round(job.fare)}` : 'PICKUP')
          instance.setPaintProperty(`${sourceId}-label`, 'text-color', job.status === 'offered' ? '#fef08a' : '#fff')
        }
        if (instance.getLayer(`destination-${job.id}`)) instance.setLayoutProperty(`destination-${job.id}`, 'icon-image', destinationMarkerImage)
        continue
      }
      instance.addSource(sourceId, { type: 'geojson', data: point(job.pickup, { title: job.pickupLabel }) })
      instance.addLayer({ id: sourceId, type: 'symbol', source: sourceId, layout: { 'icon-image': markerImage, 'icon-size': JOB_MARKER_SIZE, 'icon-allow-overlap': true } })
      instance.addLayer({ id: `${sourceId}-label`, type: 'symbol', source: sourceId, layout: { 'text-field': job.status === 'offered' ? `AVAILABLE · €${Math.round(job.fare)}` : 'PICKUP', 'text-size': 11, 'text-offset': [0, 1.8], 'text-anchor': 'top', 'text-allow-overlap': true }, paint: { 'text-color': job.status === 'offered' ? '#fef08a' : '#fff', 'text-halo-color': '#15252f', 'text-halo-width': 2 } })
      const destinationId = `destination-${job.id}`
      instance.addSource(destinationId, { type: 'geojson', data: point(job.destination, { title: job.destinationLabel }) })
      instance.addLayer({ id: destinationId, type: 'symbol', source: destinationId, layout: { 'icon-image': destinationMarkerImage, 'icon-size': JOB_MARKER_SIZE, 'icon-allow-overlap': true } })
      instance.addLayer({ id: `${destinationId}-label`, type: 'symbol', source: destinationId, layout: { 'text-field': 'DESTINATION', 'text-size': 10, 'text-offset': [0, 1.6], 'text-anchor': 'top' }, paint: { 'text-color': '#fff', 'text-halo-color': '#15252f', 'text-halo-width': 2 } })
      const handlers = {
        enter: () => { instance.getCanvas().style.cursor = 'pointer' },
        leave: () => { instance.getCanvas().style.cursor = '' },
        click: (event: mapboxgl.MapMouseEvent) => { event.originalEvent.stopPropagation(); onOpenJob(job.id) },
      }
      instance.on('mouseenter', sourceId, handlers.enter)
      instance.on('mouseleave', sourceId, handlers.leave)
      instance.on('click', sourceId, handlers.click)
      instance.on('click', `${sourceId}-label`, handlers.click)
      pickupHandlers.current.set(job.id, handlers)
      pickupJobIds.current.add(job.id)
    }

    // Start newly accepted journeys on the live map and replace the immediate
    // fallback with road geometry as soon as Directions responds.
    for (const job of jobs.filter((candidate) => candidate.status === 'accepted')) {
      const vehicleIndex = vehicles.findIndex((vehicle) => vehicle.id === job.assignedVehicleId)
      if (vehicleIndex < 0) continue
      const vehicle = vehicles[vehicleIndex]
      const start = vehicle.position ?? getCity(cityId)?.coordinates
      if (!start) continue
      const taxiSourceId = `taxi-${vehicleIndex}`
      if (instance.getLayer(taxiSourceId)) instance.setPaintProperty(taxiSourceId, 'circle-color', vehicleColor.pickingUp)
      if (liveJobIds.current.has(job.id)) continue

      liveJobIds.current.add(job.id)
      const journey = getJobJourney(job, vehicle)
      let pickupRoute: number[][] = [start, job.pickup]
      let passengerRoute: number[][] = [job.pickup, job.destination]
      const routeSourceId = `${taxiSourceId}-route`
      instance.addSource(routeSourceId, { type: 'geojson', data: lineString([...pickupRoute, job.destination]) })
      instance.addLayer({ id: routeSourceId, type: 'line', source: routeSourceId, paint: { 'line-color': '#0f766e', 'line-width': 2.5, 'line-opacity': 0.9 } })

      if (token) {
        const fetchRoute = async (from: Coordinates, to: Coordinates) => {
          const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from.join(',')};${to.join(',')}?continue_straight=true&geometries=geojson&overview=full&access_token=${token}`)
          if (!response.ok) throw new Error(`Directions request failed: ${response.status}`)
          const result = await response.json() as { routes?: Array<{ geometry: { coordinates: number[][] } }> }
          return result.routes?.[0]?.geometry.coordinates
        }
        void Promise.all([fetchRoute(start, job.pickup), fetchRoute(job.pickup, job.destination)])
          .then(([toPickup, toDestination]) => {
            if (!liveJobIds.current.has(job.id) || map.current !== instance) return
            pickupRoute = toPickup ?? pickupRoute
            passengerRoute = toDestination ?? passengerRoute
            ;(instance.getSource(routeSourceId) as mapboxgl.GeoJSONSource | undefined)
              ?.setData(lineString([...pickupRoute, ...passengerRoute.slice(1)]))
          })
          .catch(() => undefined)
      }

      const animate = () => {
        if (map.current !== instance || !instance.getSource(taxiSourceId)) return
        const timer = liveJobTimers.current.get(job.id)
        if (timer !== undefined) {
          window.clearTimeout(timer)
          liveJobTimers.current.delete(job.id)
        }
        const now = Date.now()
        const pickingUp = now < journey.pickupAt
        const from = pickingUp ? journey.acceptedAt : journey.pickupAt
        const to = pickingUp ? journey.pickupAt : journey.arrivesAt
        const route = pickingUp ? pickupRoute : passengerRoute
        const progress = Math.max(0, Math.min(1, (now - from) / (to - from)))
        const currentPosition = routePosition(route, progress)
        ;(instance.getSource(taxiSourceId) as mapboxgl.GeoJSONSource).setData(point(currentPosition))
        const remainingCoordinates = pickingUp
          ? [...remainingRoute(pickupRoute, progress), ...passengerRoute.slice(1)]
          : remainingRoute(passengerRoute, progress)
        ;(instance.getSource(routeSourceId) as mapboxgl.GeoJSONSource | undefined)?.setData(lineString(remainingCoordinates))
        instance.setPaintProperty(taxiSourceId, 'circle-color', pickingUp ? vehicleColor.pickingUp : vehicleColor.carryingPassenger)
        if (instance.getLayer(`pickup-${job.id}`)) instance.setLayoutProperty(`pickup-${job.id}`, 'visibility', pickingUp ? 'visible' : 'none')
        if (instance.getLayer(`pickup-${job.id}-label`)) instance.setLayoutProperty(`pickup-${job.id}-label`, 'visibility', pickingUp ? 'visible' : 'none')
        if (now < journey.arrivesAt && document.visibilityState !== 'hidden') {
          liveJobTimers.current.set(job.id, window.setTimeout(animate, JOURNEY_UPDATE_INTERVAL_MS))
        } else if (now >= journey.arrivesAt) {
          liveJobRunners.current.delete(job.id)
        }
      }

      // Move immediately on acceptance rather than waiting for the first tick.
      liveJobRunners.current.set(job.id, animate)
      animate()
    }

    // Leave the completed taxi dot at its destination without rebuilding the map.
    for (const job of jobs.filter((candidate) => candidate.status === 'complete')) {
      const vehicleIndex = vehicles.findIndex((vehicle) => vehicle.id === job.assignedVehicleId)
      if (vehicleIndex < 0) continue
      const taxiSource = instance.getSource(`taxi-${vehicleIndex}`) as mapboxgl.GeoJSONSource | undefined
      const timer = liveJobTimers.current.get(job.id)
      if (timer !== undefined) window.clearTimeout(timer)
      liveJobTimers.current.delete(job.id)
      liveJobRunners.current.delete(job.id)
      liveJobIds.current.delete(job.id)
      taxiSource?.setData(point(job.destination))
      if (instance.getLayer(`taxi-${vehicleIndex}`)) instance.setPaintProperty(`taxi-${vehicleIndex}`, 'circle-color', vehicleColor.available)
      const routeSourceId = `taxi-${vehicleIndex}-route`
      if (instance.getLayer(routeSourceId)) instance.removeLayer(routeSourceId)
      if (instance.getSource(routeSourceId)) instance.removeSource(routeSourceId)
    }
  }, [cityId, jobs, vehicles, mapRevision, onOpenJob])

  useEffect(() => {
    const instance = map.current
    if (!instance) return

    const sourceId = 'focused-job-route'

    const instanceIsUsable = () => {
      // The map-construction effect can dispose this captured Mapbox instance
      // before this effect's cleanup runs. Never touch a stale instance.
      if (map.current !== instance) return false

      try {
        return instance.isStyleLoaded()
      } catch {
        return false
      }
    }

    const removeFocusedRoute = () => {
      if (!instanceIsUsable()) return

      try {
        if (instance.getLayer(sourceId)) instance.removeLayer(sourceId)
        if (instance.getSource(sourceId)) instance.removeSource(sourceId)
      } catch {
        // React effect cleanup can race with Mapbox teardown.
        // At that point there is nothing left to remove.
      }
    }

    if (!instanceIsUsable()) return

    removeFocusedRoute()

    const job = jobs.find((candidate) => candidate.id === focusedJobId)
    if (!job) return

    // Accepted jobs already have a live route that is trimmed behind the taxi.
    // Do not overlay it with the complete preview route again.
    if (job.status === 'accepted') return

    const assignedVehicle = vehicles.find((vehicle) => vehicle.id === job.assignedVehicleId)
    const availableVehicle = vehicles
      .filter((vehicle) => vehicle.type === 'taxi' && vehicle.status === 'available' && vehicle.position)
      .sort((left, right) => {
        const leftDistance = Math.hypot(left.position![0] - job.pickup[0], left.position![1] - job.pickup[1])
        const rightDistance = Math.hypot(right.position![0] - job.pickup[0], right.position![1] - job.pickup[1])
        return leftDistance - rightDistance
      })[0]

    const start = assignedVehicle?.position ?? availableVehicle?.position ?? getCity(cityId)?.coordinates
    if (!start) return

    const abortController = new AbortController()

    const drawRoute = (coordinates: number[][]) => {
      if (abortController.signal.aborted || !instanceIsUsable()) return

      removeFocusedRoute()

      if (!instanceIsUsable()) return

      try {
        instance.addSource(sourceId, {
          type: 'geojson',
          data: lineString(coordinates),
        })

        instance.addLayer({
          id: sourceId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#38bdf8',
            'line-width': 2.5,
            'line-opacity': 0.95,
          },
        })

        const bounds = coordinates.reduce(
          (routeBounds, coordinate) => routeBounds.extend(coordinate as Coordinates),
          new mapboxgl.LngLatBounds(coordinates[0] as Coordinates, coordinates[0] as Coordinates),
        )
        instance.fitBounds(bounds, { padding: { top: 110, right: 45, bottom: 150, left: 45 }, maxZoom: 15, duration: 700 })
      } catch {
        // Ignore a draw that loses the race with map/style teardown.
      }
    }

    const loadRoute = async () => {
      if (!token) {
        drawRoute([start, job.pickup, job.destination])
        return
      }

      try {
        const waypoints = [start, job.pickup, job.destination]
          .map((coordinate) => coordinate.join(','))
          .join(';')

        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${waypoints}?continue_straight=true&geometries=geojson&overview=full&access_token=${token}`,
          { signal: abortController.signal },
        )

        if (!response.ok) {
          throw new Error(`Directions request failed: ${response.status}`)
        }

        const result = await response.json() as {
          routes?: Array<{ geometry: { coordinates: number[][] } }>
        }

        drawRoute(
          result.routes?.[0]?.geometry.coordinates ??
            [start, job.pickup, job.destination],
        )
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          drawRoute([start, job.pickup, job.destination])
        }
      }
    }

    void loadRoute()

    return () => {
      abortController.abort()
      removeFocusedRoute()
    }
  }, [cityId, focusedJobId, jobs, vehicles, mapRevision])

  return <div ref={container} className="absolute inset-0" aria-label="Interactive game map" />
}

export const GameMap = memo(GameMapView, (previous, next) =>
  previous.cityId === next.cityId &&
  previous.vehicles === next.vehicles &&
  previous.focusedJobId === next.focusedJobId &&
  previous.onOpenJob === next.onOpenJob &&
  previous.jobs === next.jobs
)
