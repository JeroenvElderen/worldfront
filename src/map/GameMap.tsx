import { memo, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { featureCollection, lineString, point } from '@turf/helpers'
import { circle } from '@turf/turf'
import { mapboxAccessToken } from '../config/mapbox'
import { getCity, irelandOverview } from '../data/cities'
import type { Branch, Coordinates, DemandHotspot, TaxiJob, Vehicle } from '../models/game'
import { getJobJourney, jobDestination, jobPickup } from '../services/jobEngine'
import { postalRouteProgress } from '../services/postalEngine'
import { rentalJourneyProgress } from '../services/rentalEngine'
import { idleRoamPosition } from '../services/idleRoaming'

interface GameMapProps { cityId: string | null; customCities: import('../models/game').City[]; branches: Branch[]; serviceRadiusKm: number; vehicles: Vehicle[]; jobs: TaxiJob[]; demandHotspots: DemandHotspot[]; focusedJobId: string | null; placingStation: boolean; onBuildStation: (coordinates: Coordinates) => void; onOpenJob: (jobId: string) => void; onIdleRoamRoute: (vehicleId: string, startedAt: string, waypoints: Coordinates[]) => void }
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

const remainingRouteCoordinates = (coordinates: number[][], progress: number): number[][] => {
  const lengths = coordinates.slice(1).map((coordinate, index) => Math.hypot(coordinate[0] - coordinates[index][0], coordinate[1] - coordinates[index][1]))
  let target = Math.max(0, Math.min(1, progress)) * lengths.reduce((sum, length) => sum + length, 0)
  let segment = 0
  while (segment < lengths.length - 1 && target > lengths[segment]) target -= lengths[segment++]
  return [routePosition(coordinates, progress), ...coordinates.slice(segment + 1)]
}

// Keep moving markers synchronized with the browser's paint cycle. Calculating
// their position from the current time (rather than accumulating frame deltas)
// also lets a journey resume at the exact right point after a background pause.
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
  available: '#8b5cf6',
  pickingUp: '#8b5cf6',
  carryingPassenger: '#8b5cf6',
  maintenance: '#8b5cf6',
  postal: '#8b5cf6',
  rental: '#8b5cf6',
} as const

const VEHICLE_MARKER_RADIUS = 4
const VEHICLE_MARKER_STROKE_WIDTH = 1.5
// Android WebViews can throttle requestAnimationFrame when Mapbox has no
// camera animation in progress. Drive live taxi updates from a short timer so
// an accepted taxi keeps moving even while the map itself is otherwise idle.
const LIVE_JOURNEY_UPDATE_INTERVAL_MS = 100
// A fleet index is not a stable identity: buying or selling another vehicle can
// change which vehicle an existing indexed source represents. Key map sources by
// the persisted vehicle id so dispatch always animates the vehicle assigned to
// the job, including taxis added after the map was created.
const vehicleSourceId = (vehicleId: string) => `vehicle-${vehicleId}`
const missionColor = (jobId: string) => {
  const hash = [...jobId].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0)
  return `hsl(${hash % 360}, 100%, 60%)`
}
const jobRouteSourceId = (jobId: string) => `job-route-${jobId}`

const updateJobRoute = (instance: mapboxgl.Map, jobId: string, coordinates: number[][], progress: number, beforeLayerId: string) => {
  const sourceId = jobRouteSourceId(jobId)
  const data = lineString(remainingRouteCoordinates(coordinates, progress))
  const source = instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }
  instance.addSource(sourceId, { type: 'geojson', data })
  instance.addLayer({
    id: sourceId,
    type: 'line',
    source: sourceId,
    paint: {
      'line-color': missionColor(jobId),
      'line-width': 3,
      'line-opacity': .78,
    },
  }, instance.getLayer(beforeLayerId) ? beforeLayerId : undefined)
}

const removeJobRoute = (instance: mapboxgl.Map, jobId: string) => {
  const sourceId = jobRouteSourceId(jobId)
  if (instance.getLayer(sourceId)) instance.removeLayer(sourceId)
  if (instance.getSource(sourceId)) instance.removeSource(sourceId)
}

function GameMapView({ cityId, customCities, branches, serviceRadiusKm, vehicles, jobs, demandHotspots, focusedJobId, placingStation, onBuildStation, onOpenJob, onIdleRoamRoute }: GameMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const pickupJobIds = useRef(new Set<string>())
  const pickupHandlers = useRef(new Map<string, { enter: () => void; leave: () => void; click: (event: mapboxgl.MapMouseEvent) => void }>())
  const liveJobIds = useRef(new Set<string>())
  const liveJobTimers = useRef(new Map<string, number>())
  const liveJobRunners = useRef(new Map<string, () => void>())
  const requestedIdleRoutes = useRef(new Set<string>())
  const [mapRevision, setMapRevision] = useState(0)

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    instance.getCanvas().classList.toggle('placing-depot', placingStation)
    const handlePlacement = (event: mapboxgl.MapMouseEvent) => {
      if (!placingStation) return
      onBuildStation([event.lngLat.lng, event.lngLat.lat])
    }
    instance.on('click', handlePlacement)
    return () => { instance.off('click', handlePlacement); instance.getCanvas().classList.remove('placing-depot') }
  }, [placingStation, onBuildStation])

  useEffect(() => {
    if (!container.current) return
    const currentLiveJobIds = liveJobIds.current
    const currentLiveJobTimers = liveJobTimers.current
    const currentLiveJobRunners = liveJobRunners.current
    if (token) mapboxgl.accessToken = token
    const selected = getCity(cityId, customCities)
    const abortController = new AbortController()
    const animationTimers = new Set<number>()
    const animationRunners = new Set<() => void>()
    let usingFallbackStyle = !token
    const instance = new mapboxgl.Map({
      container: container.current,
      style: token ? 'mapbox://styles/mapbox/streets-v12' : fallbackStyle,
      center: selected?.coordinates ?? irelandOverview.center,
      zoom: selected?.mapZoom ?? irelandOverview.zoom,
      pitch: 48,
      bearing: -12,
      attributionControl: false,
      pitchWithRotate: true,
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
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right')
    const canvas = instance.getCanvas()
    const handleContextLost = (event: Event) => {
      event.preventDefault()
    }
    const handleContextRestored = () => { instance.resize(); instance.triggerRepaint() }
    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)
    instance.on('error', (event) => {
      if (map.current !== instance || usingFallbackStyle) return
      const message = event.error?.message?.toLowerCase() ?? ''
      // Only replace the whole style when the style itself cannot load. A
      // transient tile, image, or Directions error must not clear a working
      // map (which is especially noticeable while a job is being accepted).
      if (message.includes('webgl') || message.includes('context lost')) {
        return
      }
      const styleCannotLoad = message.includes('unauthorized') ||
        message.includes('access token') ||
        message.includes('style') && (message.includes('404') || message.includes('not found') || message.includes('failed to load'))
      if (!styleCannotLoad) return
      usingFallbackStyle = true
      instance.setStyle(fallbackStyle)
    })
    instance.on('load', async () => {
      if (token) {
        instance.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 })
        instance.setTerrain({ source: 'mapbox-dem', exaggeration: 1.15 })
        if (instance.getSource('composite')) instance.addLayer({
          id: '3d-buildings', type: 'fill-extrusion', source: 'composite', 'source-layer': 'building', minzoom: 14,
          filter: ['==', ['get', 'extrude'], 'true'],
          paint: { 'fill-extrusion-color': '#b8c7c3', 'fill-extrusion-height': ['coalesce', ['get', 'height'], 5], 'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0], 'fill-extrusion-opacity': .72 },
        })
      }
      instance.addSource('company-base', { type: 'geojson', data: featureCollection(selected ? [point(selected.coordinates)] : []) })
      instance.addLayer({ id: 'base-halo', type: 'circle', source: 'company-base', paint: { 'circle-radius': 22, 'circle-color': '#22d3a7', 'circle-opacity': 0.22, 'circle-stroke-width': 1, 'circle-stroke-color': '#5eead4' } })
      instance.addLayer({ id: 'base', type: 'circle', source: 'company-base', paint: { 'circle-radius': 9, 'circle-color': '#0f766e', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } })

      for (const vehicle of vehicles) {
        const job = jobs.find((candidate) => candidate.status === 'accepted' && (candidate.assignedVehicleId === vehicle.id || (!candidate.assignedVehicleId && vehicle.status === 'on-job')))
        const start = vehicle.position ?? selected?.coordinates
        if (!start) continue
        if (vehicle.rentalJourney) {
          const rental = vehicle.rentalJourney
          const sourceId = vehicleSourceId(vehicle.id)
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
            if (rentalTimer !== undefined) {
              window.cancelAnimationFrame(rentalTimer)
              animationTimers.delete(rentalTimer)
            }
            const progress = rentalJourneyProgress(rental)
            ;(instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined)?.setData(point(routePosition(roadCoordinates, progress)))
            if (progress < 1 && document.visibilityState !== 'hidden') { rentalTimer = window.requestAnimationFrame(animateRental); animationTimers.add(rentalTimer) }
          }
          animationRunners.add(animateRental); animateRental(); continue
        }
        if (vehicle.postalRoute) {
          const postal = vehicle.postalRoute
          const sourceId = vehicleSourceId(vehicle.id)
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
            if (postalTimer !== undefined) {
              window.cancelAnimationFrame(postalTimer)
              animationTimers.delete(postalTimer)
            }
            const progress = postalRouteProgress(postal)
            ;(instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined)?.setData(point(routePosition(roadCoordinates, progress)))
            if (progress < 1 && document.visibilityState !== 'hidden') { postalTimer = window.requestAnimationFrame(animatePostal); animationTimers.add(postalTimer) }
          }
          animationRunners.add(animatePostal); animatePostal(); continue
        }
        let pickupRoute: RouteDetails = { coordinates: job ? [start, jobPickup(job)] : [start], speedLimits: [] }
        let passengerRoute: RouteDetails = { coordinates: job ? [jobPickup(job), jobDestination(job)] : [start], speedLimits: [] }
        if (job && token) {
          const fetchRoute = async (from: Coordinates, to: Coordinates) => {
            const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from.join(',')};${to.join(',')}?alternatives=true&annotations=maxspeed&continue_straight=true&geometries=geojson&overview=full&access_token=${token}`, { signal: abortController.signal })
            if (!response.ok) throw new Error(`Directions request failed: ${response.status}`)
            const result = await response.json() as { routes?: Array<{ duration: number; geometry: { coordinates: number[][] }; legs: Array<{ annotation?: { maxspeed?: RouteSpeedLimit[] } }> }> }
            const route = result.routes?.reduce((fastest, candidate) => candidate.duration < fastest.duration ? candidate : fastest)
            return route && { coordinates: route.geometry.coordinates, speedLimits: route.legs.flatMap((leg) => leg.annotation?.maxspeed ?? []) }
          }
          // A slow or unavailable Directions response must never delay the
          // vehicle marker. Start on fallback geometry and upgrade the active
          // route whenever both road routes arrive.
          void Promise.all([
            fetchRoute(start, jobPickup(job)),
            fetchRoute(jobPickup(job), jobDestination(job)),
          ]).then(([toPickup, toDestination]) => {
            if (abortController.signal.aborted || map.current !== instance) return
            pickupRoute = toPickup ?? pickupRoute
            passengerRoute = toDestination ?? passengerRoute
          }).catch(() => undefined)
        }
        // Directions may still be loading when the live-map effect starts a
        // newly accepted job using its immediate straight-line fallback. Let
        // that runner retain ownership instead of replacing its moving marker
        // when these load-time requests eventually finish.
        if (job && liveJobIds.current.has(job.id)) continue
        const sourceId = vehicleSourceId(vehicle.id)
        if (!instance.getSource(sourceId)) {
          instance.addSource(sourceId, { type: 'geojson', data: point(start) })
          instance.addLayer({ id: sourceId, type: 'circle', source: sourceId, paint: { 'circle-radius': VEHICLE_MARKER_RADIUS, 'circle-color': vehicle.type === 'post' ? vehicleColor.postal : job ? vehicleColor.pickingUp : vehicle.status === 'maintenance' ? vehicleColor.maintenance : vehicleColor.available, 'circle-stroke-width': VEHICLE_MARKER_STROKE_WIDTH, 'circle-stroke-color': '#ffffff' } })
        }
        if (!job && vehicle.serviceTrip) {
          const service = vehicle.serviceTrip
          let serviceTimer: number | undefined
          const animateService = () => {
            if (serviceTimer !== undefined) {
              window.cancelAnimationFrame(serviceTimer)
              animationTimers.delete(serviceTimer)
            }
            const startedAt = new Date(service.startedAt).getTime()
            const arrivesAt = new Date(service.arrivesAt).getTime()
            const progress = Math.max(0, Math.min(1, (Date.now() - startedAt) / (arrivesAt - startedAt)))
            ;(instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined)?.setData(point(routePosition([service.from, service.destination], progress)))
            if (progress < 1 && document.visibilityState !== 'hidden') { serviceTimer = window.requestAnimationFrame(animateService); animationTimers.add(serviceTimer) }
          }
          animationRunners.add(animateService); animateService(); continue
        }
        if (!job) continue
        liveJobIds.current.add(job.id)
        const journey = getJobJourney(job, vehicle)
        let animationTimer: number | undefined
        const scheduleAnimation = () => {
          if (animationTimer !== undefined) {
            window.cancelAnimationFrame(animationTimer)
            animationTimers.delete(animationTimer)
          }
          if (document.visibilityState === 'hidden') return
          animationTimer = window.requestAnimationFrame(animate)
          animationTimers.add(animationTimer)
        }
        const animate = () => {
          if (animationTimer !== undefined) {
            window.cancelAnimationFrame(animationTimer)
            animationTimers.delete(animationTimer)
          }
          const time = Date.now()
          const pickingUp = time < journey.pickupAt
          const elapsed = pickingUp
            ? Math.max(0, Math.min(1, (time - journey.departsAt) / (journey.pickupAt - journey.departsAt)))
            : Math.max(0, Math.min(1, (time - journey.pickupAt) / (journey.arrivesAt - journey.pickupAt)))
          const activeRoute = pickingUp ? pickupRoute : passengerRoute
          const fallbackSpeedKmh = job.durationMinutes > 0 ? job.distanceKm / (job.durationMinutes / 60) : 30
          const motion = routeMotion(activeRoute, elapsed, fallbackSpeedKmh, vehicle.topSpeedKmh ?? 130)
          const progress = motion.progress
          const currentPosition = routePosition(activeRoute.coordinates, progress)
          updateJobRoute(instance, job.id, activeRoute.coordinates, progress, sourceId)
          ;(instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined)?.setData(point(currentPosition))
          instance.setPaintProperty(sourceId, 'circle-color', pickingUp ? vehicleColor.pickingUp : vehicleColor.carryingPassenger)
          if (instance.getLayer(`pickup-${job.id}`)) instance.setLayoutProperty(`pickup-${job.id}`, 'visibility', pickingUp ? 'visible' : 'none')
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
        animationTimers.forEach(window.cancelAnimationFrame)
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
    window.addEventListener('focus', handleVisibilityChange)
    window.addEventListener('online', handleVisibilityChange)
    return () => {
      abortController.abort()
      animationTimers.forEach(window.cancelAnimationFrame)
      currentLiveJobTimers.forEach(window.clearTimeout)
      currentLiveJobTimers.clear()
      currentLiveJobRunners.clear()
      currentLiveJobIds.clear()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
      window.removeEventListener('online', handleVisibilityChange)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      map.current = null
      instance.remove()
    }
    // Construct Mapbox exactly once. Cities, jobs, and fleet state are synchronized
    // into this instance below instead of tearing down the WebGL map and reloading tiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const instance = map.current
    const selected = getCity(cityId, customCities)
    if (!instance || !selected) return

    instance.easeTo({ center: selected.coordinates, zoom: selected.mapZoom, duration: 650 })
    const updateBase = () => {
      const source = instance.getSource('company-base') as mapboxgl.GeoJSONSource | undefined
      source?.setData(featureCollection([point(selected.coordinates)]))
    }
    if (instance.isStyleLoaded()) updateBase()
    else instance.once('load', updateBase)
    return () => { instance.off('load', updateBase) }
  }, [cityId, customCities, mapRevision])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const updateDepots = () => {
      const stationCoordinates = branches.flatMap((station) => {
        const coordinates = station.coordinates ?? getCity(station.cityId, customCities)?.coordinates
        return coordinates ? [{ station, coordinates }] : []
      })
      const features = stationCoordinates.map(({ station, coordinates }) => point(coordinates, { name: station.name }))
      const data = featureCollection(features)
      const coverageData = featureCollection(stationCoordinates.map(({ coordinates }) => circle(coordinates, serviceRadiusKm, { steps: 64, units: 'kilometers' })))
      const source = instance.getSource('depot-network') as mapboxgl.GeoJSONSource | undefined
      const coverageSource = instance.getSource('service-coverage') as mapboxgl.GeoJSONSource | undefined
      if (source && coverageSource) { source.setData(data); coverageSource.setData(coverageData); return }
      instance.addSource('service-coverage', { type: 'geojson', data: coverageData })
      instance.addLayer({ id: 'service-coverage-fill', type: 'fill', source: 'service-coverage', paint: { 'fill-color': '#22d3a7', 'fill-opacity': .08 } })
      instance.addLayer({ id: 'service-coverage-line', type: 'line', source: 'service-coverage', paint: { 'line-color': '#5eead4', 'line-width': 1.5, 'line-opacity': .65, 'line-dasharray': [3, 2] } })
      instance.addSource('depot-network', { type: 'geojson', data })
      instance.addLayer({ id: 'depot-network-halo', type: 'circle', source: 'depot-network', paint: { 'circle-radius': 13, 'circle-color': '#f59e0b', 'circle-opacity': .18 } })
      instance.addLayer({ id: 'depot-network', type: 'circle', source: 'depot-network', paint: { 'circle-radius': 6, 'circle-color': '#fbbf24', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } })
      instance.addLayer({ id: 'depot-network-label', type: 'symbol', source: 'depot-network', minzoom: 8, layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-allow-overlap': false }, paint: { 'text-color': '#ffffff', 'text-halo-color': '#10201f', 'text-halo-width': 2 } })
    }
    if (instance.isStyleLoaded()) updateDepots()
    else instance.once('load', updateDepots)
    return () => { instance.off('load', updateDepots) }
  }, [branches, customCities, mapRevision, serviceRadiusKm])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const updateDemand = () => {
      const data = featureCollection(demandHotspots.map((hotspot) => point(hotspot.coordinates, {
        name: hotspot.name,
        score: hotspot.score,
        reason: hotspot.reason,
      })))
      const source = instance.getSource('demand-hotspots') as mapboxgl.GeoJSONSource | undefined
      if (source) { source.setData(data); return }
      instance.addSource('demand-hotspots', { type: 'geojson', data })
      instance.addLayer({
        id: 'demand-hotspot-glow', type: 'circle', source: 'demand-hotspots',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'score'], 45, 14, 100, 38],
          'circle-color': ['interpolate', ['linear'], ['get', 'score'], 45, '#38bdf8', 70, '#fbbf24', 88, '#fb7185'],
          'circle-opacity': .18,
          'circle-blur': .65,
        },
      })
      instance.addLayer({
        id: 'demand-hotspot-core', type: 'circle', source: 'demand-hotspots',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'score'], 45, 3, 100, 8],
          'circle-color': ['interpolate', ['linear'], ['get', 'score'], 45, '#38bdf8', 70, '#fbbf24', 88, '#fb7185'],
          'circle-stroke-color': 'rgba(255,255,255,.75)', 'circle-stroke-width': 1,
        },
      })
      instance.addLayer({
        id: 'demand-hotspot-label', type: 'symbol', source: 'demand-hotspots', minzoom: 11,
        layout: { 'text-field': ['concat', ['get', 'name'], '\n', ['get', 'reason']], 'text-size': 9, 'text-offset': [0, 1.35], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': '#fff', 'text-halo-color': '#071821', 'text-halo-width': 2 },
      })
    }
    if (instance.isStyleLoaded()) updateDemand()
    else instance.once('load', updateDemand)
    return () => { instance.off('load', updateDemand) }
  }, [demandHotspots, mapRevision])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    if (token) {
      for (const vehicle of vehicles) {
        const roam = vehicle.idleRoam
        if (!roam || vehicle.status !== 'available') continue
        const routeKey = `${vehicle.id}:${roam.startedAt}`
        if (requestedIdleRoutes.current.has(routeKey)) continue
        requestedIdleRoutes.current.add(routeKey)
        const waypoints = roam.waypoints.map((coordinate) => coordinate.join(',')).join(';')
        void fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}?continue_straight=true&geometries=geojson&overview=full&access_token=${token}`)
          .then(async (response) => response.ok ? response.json() as Promise<{ routes?: Array<{ geometry: { coordinates: Coordinates[] } }> }> : undefined)
          .then((result) => {
            const roadWaypoints = result?.routes?.[0]?.geometry.coordinates
            if (roadWaypoints && roadWaypoints.length > 1) onIdleRoamRoute(vehicle.id, roam.startedAt, roadWaypoints)
          })
          .catch(() => undefined)
      }
    }
    const updateRoamingVehicles = () => {
      for (const vehicle of vehicles) {
        if (!vehicle.idleRoam || vehicle.status !== 'available') continue
        const source = instance.getSource(vehicleSourceId(vehicle.id)) as mapboxgl.GeoJSONSource | undefined
        source?.setData(point(idleRoamPosition(vehicle.idleRoam)))
      }
    }
    updateRoamingVehicles()
    const interval = window.setInterval(updateRoamingVehicles, 500)
    return () => window.clearInterval(interval)
  }, [vehicles, mapRevision, onIdleRoamRoute])

  useEffect(() => {
    const instance = map.current
    if (!instance?.isStyleLoaded()) return
    // Closing the calls sheet changes the map viewport on mobile. Resize before
    // adding the accepted route so Mapbox never presents a stale/black frame.
    window.requestAnimationFrame(() => {
      if (map.current !== instance) return
      instance.resize()
      instance.triggerRepaint()
    })
    const selected = getCity(cityId, customCities)

    // Fleet purchases no longer require a map reconstruction. Add any new
    // vehicle source and layer directly to the live style.
    vehicles.forEach((vehicle) => {
      const sourceId = vehicleSourceId(vehicle.id)
      if (instance.getSource(sourceId)) return
      const position = vehicle.position ?? selected?.coordinates
      if (!position) return
      instance.addSource(sourceId, { type: 'geojson', data: point(position) })
      instance.addLayer({
        id: sourceId,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': VEHICLE_MARKER_RADIUS,
          'circle-color': vehicle.type === 'post' ? vehicleColor.postal : vehicle.type === 'rental' ? vehicleColor.rental : vehicle.status === 'maintenance' ? vehicleColor.maintenance : vehicleColor.available,
          'circle-stroke-width': VEHICLE_MARKER_STROKE_WIDTH,
          'circle-stroke-color': '#ffffff',
        },
      })
    })
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
      if (instance.getLayer(`destination-${jobId}`)) instance.removeLayer(`destination-${jobId}`)
      if (instance.getLayer(sourceId)) instance.removeLayer(sourceId)
      if (instance.getSource(`destination-${jobId}`)) instance.removeSource(`destination-${jobId}`)
      if (instance.getSource(sourceId)) instance.removeSource(sourceId)
      pickupJobIds.current.delete(jobId)
      pickupHandlers.current.delete(jobId)
    }

    for (const job of visibleJobs) {
      const sourceId = `pickup-${job.id}`
      const color = missionColor(job.id)
      if (pickupJobIds.current.has(job.id)) {
        continue
      }
      instance.addSource(sourceId, { type: 'geojson', data: point(job.pickup, { title: job.pickupLabel }) })
      instance.addLayer({ id: sourceId, type: 'circle', source: sourceId, paint: { 'circle-radius': VEHICLE_MARKER_RADIUS, 'circle-color': color, 'circle-stroke-width': VEHICLE_MARKER_STROKE_WIDTH, 'circle-stroke-color': '#ffffff' } })
      const destinationId = `destination-${job.id}`
      instance.addSource(destinationId, { type: 'geojson', data: point(job.destination, { title: job.destinationLabel }) })
      instance.addLayer({ id: destinationId, type: 'circle', source: destinationId, paint: { 'circle-radius': VEHICLE_MARKER_RADIUS, 'circle-color': color, 'circle-stroke-width': VEHICLE_MARKER_STROKE_WIDTH, 'circle-stroke-color': '#ffffff' } })
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

    // Start newly accepted journeys on the live map and replace the immediate
    // fallback with road geometry as soon as Directions responds.
    for (const job of jobs.filter((candidate) => candidate.status === 'accepted')) {
      const vehicle = vehicles.find((candidate) => candidate.id === job.assignedVehicleId)
      if (!vehicle) continue
      const start = vehicle.position ?? getCity(cityId, customCities)?.coordinates
      if (!start) continue
      const taxiSourceId = vehicleSourceId(vehicle.id)
      if (instance.getLayer(taxiSourceId)) instance.setPaintProperty(taxiSourceId, 'circle-color', vehicleColor.pickingUp)
      const passengerSourceId = `pickup-${job.id}`
      if (instance.getLayer(passengerSourceId) && instance.getLayer(taxiSourceId)) {
        // Once assigned, the pickup dot becomes a passenger halo. Keep it
        // underneath the purple vehicle dot so the vehicle marker stays clear.
        instance.setPaintProperty(passengerSourceId, 'circle-radius', VEHICLE_MARKER_RADIUS + 3)
        instance.setPaintProperty(passengerSourceId, 'circle-opacity', .45)
        instance.setPaintProperty(passengerSourceId, 'circle-stroke-width', 0)
        instance.moveLayer(passengerSourceId, taxiSourceId)
      }
      if (liveJobIds.current.has(job.id)) continue

      liveJobIds.current.add(job.id)
      const journey = getJobJourney(job, vehicle)
      let pickupRoute: RouteDetails = { coordinates: [start, jobPickup(job)], speedLimits: [] }
      let passengerRoute: RouteDetails = { coordinates: [jobPickup(job), jobDestination(job)], speedLimits: [] }
      if (token) {
        const fetchRoute = async (from: Coordinates, to: Coordinates) => {
          const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from.join(',')};${to.join(',')}?annotations=maxspeed&continue_straight=true&geometries=geojson&overview=full&access_token=${token}`)
          if (!response.ok) throw new Error(`Directions request failed: ${response.status}`)
          const result = await response.json() as { routes?: Array<{ geometry: { coordinates: number[][] }; legs: Array<{ annotation?: { maxspeed?: RouteSpeedLimit[] } }> }> }
          const route = result.routes?.[0]
          return route && { coordinates: route.geometry.coordinates, speedLimits: route.legs.flatMap((leg) => leg.annotation?.maxspeed ?? []) }
        }
        void Promise.all([fetchRoute(start, jobPickup(job)), fetchRoute(jobPickup(job), jobDestination(job))])
          .then(([toPickup, toDestination]) => {
            if (!liveJobIds.current.has(job.id) || map.current !== instance) return
            pickupRoute = toPickup ?? pickupRoute
            passengerRoute = toDestination ?? passengerRoute
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
        const from = pickingUp ? journey.departsAt : journey.pickupAt
        const to = pickingUp ? journey.pickupAt : journey.arrivesAt
        const route = pickingUp ? pickupRoute : passengerRoute
        const elapsed = Math.max(0, Math.min(1, (now - from) / (to - from)))
        const fallbackSpeedKmh = job.durationMinutes > 0 ? job.distanceKm / (job.durationMinutes / 60) : 30
        const progress = routeMotion(route, elapsed, fallbackSpeedKmh, vehicle.topSpeedKmh ?? 130).progress
        const currentPosition = routePosition(route.coordinates, progress)
        updateJobRoute(instance, job.id, route.coordinates, progress, taxiSourceId)
        ;(instance.getSource(taxiSourceId) as mapboxgl.GeoJSONSource).setData(point(currentPosition))
        instance.setPaintProperty(taxiSourceId, 'circle-color', pickingUp ? vehicleColor.pickingUp : vehicleColor.carryingPassenger)
        const passengerSource = instance.getSource(passengerSourceId) as mapboxgl.GeoJSONSource | undefined
        // The halo waits at pickup, then rides with the passenger's vehicle.
        passengerSource?.setData(point(pickingUp ? job.pickup : currentPosition, { title: job.pickupLabel }))
        // setData normally schedules a render, but explicitly waking Mapbox is
        // necessary on some idle Android WebViews.
        instance.triggerRepaint()
        if (now < journey.arrivesAt && document.visibilityState !== 'hidden') {
          liveJobTimers.current.set(job.id, window.setTimeout(animate, LIVE_JOURNEY_UPDATE_INTERVAL_MS))
        } else if (now >= journey.arrivesAt) {
          liveJobRunners.current.delete(job.id)
        }
      }

      // Start the runner now so it can hold the marker through the dispatch
      // pause, then pull away without waiting for a separate game tick.
      liveJobRunners.current.set(job.id, animate)
      animate()
    }

    // Leave the completed taxi dot at its destination without rebuilding the map.
    for (const job of jobs.filter((candidate) => candidate.status === 'complete')) {
      const vehicle = vehicles.find((candidate) => candidate.id === job.assignedVehicleId)
      if (!vehicle) continue
      const sourceId = vehicleSourceId(vehicle.id)
      const taxiSource = instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
      const timer = liveJobTimers.current.get(job.id)
      if (timer !== undefined) window.clearTimeout(timer)
      liveJobTimers.current.delete(job.id)
      liveJobRunners.current.delete(job.id)
      liveJobIds.current.delete(job.id)
      removeJobRoute(instance, job.id)
      taxiSource?.setData(point(jobDestination(job)))
      if (instance.getLayer(sourceId)) instance.setPaintProperty(sourceId, 'circle-color', vehicleColor.available)
    }
  }, [cityId, customCities, jobs, vehicles, mapRevision, onOpenJob])

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

    const start = assignedVehicle?.position ?? availableVehicle?.position ?? getCity(cityId, customCities)?.coordinates
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
        drawRoute([start, jobPickup(job), jobDestination(job)])
        return
      }

      try {
        const waypoints = [start, jobPickup(job), jobDestination(job)]
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
            [start, jobPickup(job), jobDestination(job)],
        )
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          drawRoute([start, jobPickup(job), jobDestination(job)])
        }
      }
    }

    void loadRoute()

    return () => {
      abortController.abort()
      removeFocusedRoute()
    }
  }, [cityId, customCities, focusedJobId, jobs, vehicles, mapRevision])

  return <div ref={container} className="absolute inset-0" aria-label="Interactive game map" />
}

export const GameMap = memo(GameMapView, (previous, next) =>
  previous.cityId === next.cityId &&
  previous.customCities === next.customCities &&
  previous.vehicles === next.vehicles &&
  previous.demandHotspots === next.demandHotspots &&
  previous.focusedJobId === next.focusedJobId &&
  previous.onIdleRoamRoute === next.onIdleRoamRoute &&
  previous.onOpenJob === next.onOpenJob &&
  previous.jobs === next.jobs
)
