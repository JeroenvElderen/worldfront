import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { along, length, lineSlice, lineString } from '@turf/turf'
import { mapboxAccessToken } from './config/mapbox'

const pickup: [number, number] = [-6.2675, 53.3455]
const dropoff: [number, number] = [-6.2499, 53.4264]
const fallbackRoute: GeoJSON.LineString = {
  type: 'LineString',
  coordinates: [pickup, [-6.264, 53.350], [-6.260, 53.361], [-6.254, 53.375], [-6.251, 53.397], dropoff],
}

function marker(className: string, label: string) {
  const element = document.createElement('div')
  element.className = className
  element.setAttribute('aria-label', label)
  return element
}

export function DispatchMap({ progress }: { progress: number }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const driver = useRef<mapboxgl.Marker | null>(null)
  const pickupMarker = useRef<mapboxgl.Marker | null>(null)
  const dropoffMarker = useRef<mapboxgl.Marker | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [route, setRoute] = useState(fallbackRoute)

  useEffect(() => {
    if (!container.current || map.current) return
    mapboxgl.accessToken = mapboxAccessToken
    const instance = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-6.258, 53.382],
      zoom: 12.1,
      attributionControl: false,
    })
    map.current = instance
    instance.on('load', () => setLoaded(true))
    return () => { instance.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${pickup.join(',')};${dropoff.join(',')}?geometries=geojson&overview=full&access_token=${mapboxAccessToken}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { if (data.routes?.[0]?.geometry) setRoute(data.routes[0].geometry) })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!loaded || !map.current) return
    const data: GeoJSON.Feature<GeoJSON.LineString> = { type: 'Feature', properties: {}, geometry: route }
    const source = map.current.getSource('route') as mapboxgl.GeoJSONSource | undefined
    if (source) source.setData(data)
    else {
      map.current.addSource('route', { type: 'geojson', data })
      map.current.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7557e8', 'line-width': 4, 'line-opacity': .88 } })
    }

    if (!driver.current) driver.current = new mapboxgl.Marker({ element: marker('driver-marker', 'Driver') }).setLngLat(pickup).addTo(map.current)
    if (!pickupMarker.current) pickupMarker.current = new mapboxgl.Marker({ element: marker('map-marker pickup-marker', 'Pickup') }).setLngLat(pickup).addTo(map.current)
    if (!dropoffMarker.current) dropoffMarker.current = new mapboxgl.Marker({ element: marker('map-marker dropoff-marker', 'Dropoff') }).setLngLat(dropoff).addTo(map.current)

    const bounds = route.coordinates.reduce((box, coordinate) => box.extend(coordinate as [number, number]), new mapboxgl.LngLatBounds(pickup, pickup))
    map.current.fitBounds(bounds, { padding: { top: 70, right: 55, bottom: 130, left: 55 }, duration: 0 })
  }, [loaded, route])

  useEffect(() => {
    if (!loaded || !map.current || !driver.current || !pickupMarker.current) return
    const road = lineString(route.coordinates)
    const distance = length(road)
    const position = along(road, distance * progress / 100)
    const coordinates = position.geometry.coordinates as [number, number]
    driver.current.setLngLat(coordinates)
    pickupMarker.current.setLngLat(coordinates)

    const remaining = lineSlice(position, along(road, distance), road)
    const source = map.current.getSource('route') as mapboxgl.GeoJSONSource | undefined
    source?.setData(remaining)
  }, [loaded, progress, route])

  return <div ref={container} className="map" aria-label="Live driver route map" />
}
