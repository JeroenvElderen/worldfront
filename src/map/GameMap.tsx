import { useEffect, useRef } from 'react'
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

  useEffect(() => {
    if (!container.current || !token) return
    mapboxgl.accessToken = token
    const selected = getCity(cityId)
    const instance = new mapboxgl.Map({
      container: container.current, style: 'mapbox://styles/mapbox/streets-v12',
      center: selected?.coordinates ?? irelandOverview.center, zoom: selected?.mapZoom ?? irelandOverview.zoom,
      attributionControl: false, pitchWithRotate: false,
    })
    map.current = instance
    instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    instance.on('load', () => {
      instance.addSource('company-base', { type: 'geojson', data: featureCollection(selected ? [point(selected.coordinates)] : []) })
      instance.addLayer({ id: 'base-halo', type: 'circle', source: 'company-base', paint: { 'circle-radius': 22, 'circle-color': '#22d3a7', 'circle-opacity': 0.22, 'circle-stroke-width': 1, 'circle-stroke-color': '#5eead4' } })
      instance.addLayer({ id: 'base', type: 'circle', source: 'company-base', paint: { 'circle-radius': 9, 'circle-color': '#0f766e', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } })
      if (activeJob) {
        instance.addSource('active-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [activeJob.pickup, activeJob.destination] } } })
        instance.addLayer({ id: 'active-route', type: 'line', source: 'active-route', paint: { 'line-color': '#22d3a7', 'line-width': 5, 'line-opacity': 0.85, 'line-dasharray': [1.5, 1] } })
        const bounds = new mapboxgl.LngLatBounds(activeJob.pickup, activeJob.pickup).extend(activeJob.destination)
        instance.fitBounds(bounds, { padding: 90, maxZoom: 14 })
      }
    })
    return () => { instance.remove(); map.current = null }
  }, [cityId, activeJob])

  return <div ref={container} className="absolute inset-0" aria-label="Interactive game map">
    {!token && <div className="map-fallback"><div><span>MAP PREVIEW</span><p>Add your Mapbox public token to <code>.env</code> to load the world map.</p></div></div>}
  </div>
}
