import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { featureCollection, point } from '@turf/helpers'
import { getCity, irelandOverview } from '../data/cities'
import type { TaxiJob } from '../models/game'

interface GameMapProps { cityId: string | null; activeJob?: TaxiJob }
const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined

export function GameMap({ cityId, activeJob }: GameMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [trafficEta, setTrafficEta] = useState<number | null>(null)

  useEffect(() => {
    if (!container.current || !token) return
    mapboxgl.accessToken = token
    const selected = getCity(cityId)
    const abortController = new AbortController()
    let animationFrame = 0
    const instance = new mapboxgl.Map({
      container: container.current, style: 'mapbox://styles/mapbox/streets-v12',
      center: selected?.coordinates ?? irelandOverview.center, zoom: selected?.mapZoom ?? irelandOverview.zoom,
      attributionControl: false, pitchWithRotate: false,
    })
    map.current = instance
    instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    instance.on('load', async () => {
      instance.addSource('company-base', { type: 'geojson', data: featureCollection(selected ? [point(selected.coordinates)] : []) })
      instance.addLayer({ id: 'base-halo', type: 'circle', source: 'company-base', paint: { 'circle-radius': 22, 'circle-color': '#22d3a7', 'circle-opacity': 0.22, 'circle-stroke-width': 1, 'circle-stroke-color': '#5eead4' } })
      instance.addLayer({ id: 'base', type: 'circle', source: 'company-base', paint: { 'circle-radius': 9, 'circle-color': '#0f766e', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } })
      if (activeJob) {
        let coordinates: number[][] = [activeJob.pickup, activeJob.destination]
        let durationSeconds = activeJob.durationMinutes * 60
        try {
          const points = [activeJob.pickup, activeJob.destination].map((coordinate) => coordinate.join(',')).join(';')
          const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${points}?alternatives=false&geometries=geojson&overview=full&steps=true&access_token=${token}`, { signal: abortController.signal })
          if (!response.ok) throw new Error(`Directions request failed: ${response.status}`)
          const result = await response.json() as { routes?: Array<{ duration: number; geometry: { coordinates: number[][] } }> }
          const route = result.routes?.[0]
          if (!route) throw new Error('No drivable route found')
          coordinates = route.geometry.coordinates
          durationSeconds = route.duration
          setTrafficEta(Math.max(1, Math.round(durationSeconds / 60)))
        } catch (error) {
          if ((error as Error).name === 'AbortError') return
          setTrafficEta(null)
        }
        if (!instance.getStyle()) return
        instance.addSource('active-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } } })
        instance.addLayer({ id: 'active-route', type: 'line', source: 'active-route', paint: { 'line-color': '#22d3a7', 'line-width': 5, 'line-opacity': 0.85, 'line-dasharray': [1.5, 1] } })
        instance.addSource('taxi-position', { type: 'geojson', data: point(coordinates[0]) })
        instance.addLayer({ id: 'taxi-position', type: 'circle', source: 'taxi-position', paint: { 'circle-radius': 8, 'circle-color': '#fbbf24', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } })
        const firstCoordinate = coordinates[0] as [number, number]
        const bounds = coordinates.reduce((routeBounds, coordinate) => routeBounds.extend(coordinate as [number, number]), new mapboxgl.LngLatBounds(firstCoordinate, firstCoordinate))
        instance.fitBounds(bounds, { padding: 90, maxZoom: 14 })

        const segmentLengths = coordinates.slice(1).map((coordinate, index) => Math.hypot(coordinate[0] - coordinates[index][0], coordinate[1] - coordinates[index][1]))
        const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0)
        const startedAt = performance.now()
        const animateTaxi = (now: number) => {
          let target = Math.min(1, (now - startedAt) / (durationSeconds * 1000)) * totalLength
          let segment = 0
          while (segment < segmentLengths.length - 1 && target > segmentLengths[segment]) target -= segmentLengths[segment++]
          const start = coordinates[segment]
          const end = coordinates[segment + 1] ?? start
          const progress = segmentLengths[segment] ? target / segmentLengths[segment] : 1
          const position: [number, number] = [start[0] + (end[0] - start[0]) * progress, start[1] + (end[1] - start[1]) * progress]
          const source = instance.getSource('taxi-position') as mapboxgl.GeoJSONSource | undefined
          source?.setData(point(position))
          if (now - startedAt < durationSeconds * 1000) animationFrame = requestAnimationFrame(animateTaxi)
        }
        animationFrame = requestAnimationFrame(animateTaxi)
      }
    })
    return () => { abortController.abort(); cancelAnimationFrame(animationFrame); instance.remove(); map.current = null }
  }, [cityId, activeJob])

  return <div ref={container} className="absolute inset-0" aria-label="Interactive game map">
    {activeJob && token && <div className="traffic-status">LIVE TRAFFIC · {trafficEta ? `${trafficEta} MIN` : 'ROUTING'}</div>}
    {!token && <div className="map-fallback"><div><span>MAP PREVIEW</span><p>Add your Mapbox public token to <code>.env</code> to load the world map.</p></div></div>}
  </div>
}
