import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { along, length, lineString } from '@turf/turf'
import { mapboxAccessToken } from './config/mapbox'

export type Coordinate = [number, number]
export type TripPhase = 'idle' | 'to-pickup' | 'with-passenger' | 'dropped-off' | 'staying' | 'roaming'
export type Job = { id: string; passenger: string; pickupName: string; dropoffName: string; pickup: Coordinate; dropoff: Coordinate; fare: number; eta: number }

type Props = {
  jobs: Job[]; selectedJob: Job | null; activeJob: Job | null; phase: TripPhase; station: Coordinate; placingStation: boolean
  onSelectJob: (job: Job) => void; onStationPlaced: (coordinate: Coordinate) => void; onPhaseChange: (phase: TripPhase) => void; onTripComplete: () => void
}

const marker = (className: string, label: string) => { const el = document.createElement('button'); el.className = className; el.title = label; el.setAttribute('aria-label', label); return el }
const straightRoute = (points: Coordinate[]): GeoJSON.LineString => ({ type: 'LineString', coordinates: points })

export function DispatchMap(props: Props) {
  const { jobs, selectedJob, activeJob, phase, station, placingStation, onSelectJob, onStationPlaced, onPhaseChange, onTripComplete } = props
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const jobMarkers = useRef<mapboxgl.Marker[]>([])
  const stationMarker = useRef<mapboxgl.Marker | null>(null)
  const driverMarker = useRef<mapboxgl.Marker | null>(null)
  const pickupMarker = useRef<mapboxgl.Marker | null>(null)
  const dropoffMarker = useRef<mapboxgl.Marker | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [route, setRoute] = useState<GeoJSON.LineString | null>(null)

  useEffect(() => {
    if (!container.current || map.current) return
    mapboxgl.accessToken = mapboxAccessToken
    const instance = new mapboxgl.Map({ container: container.current, style: 'mapbox://styles/mapbox/dark-v11', center: [-6.275, 53.36], zoom: 11.7, attributionControl: false })
    map.current = instance
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    instance.on('load', () => setLoaded(true))
    return () => { instance.remove(); map.current = null }
  }, [])

  useEffect(() => {
    if (!map.current) return
    map.current.getCanvas().style.cursor = placingStation ? 'crosshair' : ''
    const place = (event: mapboxgl.MapMouseEvent) => placingStation && onStationPlaced([event.lngLat.lng, event.lngLat.lat])
    map.current.on('click', place)
    return () => { map.current?.off('click', place) }
  }, [placingStation, onStationPlaced])

  useEffect(() => {
    if (!loaded || !map.current) return
    stationMarker.current?.remove()
    stationMarker.current = new mapboxgl.Marker({ element: marker('station-marker', 'Driver station') }).setLngLat(station).addTo(map.current)
  }, [loaded, station])

  useEffect(() => {
    if (!loaded || !map.current || activeJob) return
    jobMarkers.current.forEach((item) => item.remove())
    jobMarkers.current = jobs.map((job) => {
      const el = marker(`job-marker${selectedJob?.id === job.id ? ' selected' : ''}`, `Job at ${job.pickupName}`)
      el.addEventListener('click', (event) => { event.stopPropagation(); onSelectJob(job) })
      return new mapboxgl.Marker({ element: el }).setLngLat(job.pickup).addTo(map.current!)
    })
  }, [loaded, jobs, selectedJob, activeJob, onSelectJob])

  useEffect(() => {
    if (!loaded || !map.current || !activeJob) { setRoute(null); return }
    jobMarkers.current.forEach((item) => item.remove()); jobMarkers.current = []
    const points = [station, activeJob.pickup, activeJob.dropoff]
    const controller = new AbortController()
    fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${points.map((point) => point.join(',')).join(';')}?geometries=geojson&overview=full&access_token=${mapboxAccessToken}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setRoute(data.routes?.[0]?.geometry ?? straightRoute(points)))
      .catch(() => { if (!controller.signal.aborted) setRoute(straightRoute(points)) })
    return () => controller.abort()
  }, [loaded, activeJob, station])

  useEffect(() => {
    if (!loaded || !map.current || !route || !activeJob) return
    const feature: GeoJSON.Feature<GeoJSON.LineString> = { type: 'Feature', properties: {}, geometry: route }
    const existing = map.current.getSource('active-route') as mapboxgl.GeoJSONSource | undefined
    if (existing) existing.setData(feature)
    else { map.current.addSource('active-route', { type: 'geojson', data: feature }); map.current.addLayer({ id: 'active-route', type: 'line', source: 'active-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#10e3c7', 'line-width': 6, 'line-opacity': .95, 'line-blur': 1 } }) }
    driverMarker.current?.remove(); pickupMarker.current?.remove(); dropoffMarker.current?.remove()
    driverMarker.current = new mapboxgl.Marker({ element: marker('driver-marker', 'Assigned driver') }).setLngLat(station).addTo(map.current)
    pickupMarker.current = new mapboxgl.Marker({ element: marker('map-marker pickup-marker', 'Passenger pickup') }).setLngLat(activeJob.pickup).addTo(map.current)
    dropoffMarker.current = new mapboxgl.Marker({ element: marker('map-marker dropoff-marker', 'Passenger dropoff') }).setLngLat(activeJob.dropoff).addTo(map.current)
    const bounds = route.coordinates.reduce((box, coordinate) => box.extend(coordinate as Coordinate), new mapboxgl.LngLatBounds(station, station))
    map.current.fitBounds(bounds, { padding: { top: 110, right: 70, bottom: 120, left: window.innerWidth > 700 ? 470 : 60 }, duration: 800 })
  }, [loaded, route, activeJob, station])

  useEffect(() => {
    if (!route || !driverMarker.current || !activeJob || (phase !== 'to-pickup' && phase !== 'with-passenger')) return
    const road = lineString(route.coordinates)
    const total = length(road)
    const pickupPoint = lineString([station, activeJob.pickup])
    const approximatePickupRatio = Math.min(.7, length(pickupPoint) / Math.max(length(pickupPoint) + length(lineString([activeJob.pickup, activeJob.dropoff])), .001))
    const start = phase === 'to-pickup' ? 0 : approximatePickupRatio
    const end = phase === 'to-pickup' ? approximatePickupRatio : 1
    const started = performance.now()
    const duration = phase === 'to-pickup' ? 6000 : 9000
    let frame = 0
    const move = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      const coordinate = along(road, total * (start + (end - start) * progress)).geometry.coordinates as Coordinate
      driverMarker.current?.setLngLat(coordinate)
      if (phase === 'with-passenger') pickupMarker.current?.setLngLat(coordinate)
      if (progress < 1) frame = requestAnimationFrame(move)
      else if (phase === 'to-pickup') onPhaseChange('with-passenger')
      else onTripComplete()
    }
    frame = requestAnimationFrame(move)
    return () => cancelAnimationFrame(frame)
  }, [route, activeJob, phase, station, onPhaseChange, onTripComplete])

  return <div ref={container} className={`map${placingStation ? ' placing' : ''}`} aria-label="Live taxi dispatch map" />
}
