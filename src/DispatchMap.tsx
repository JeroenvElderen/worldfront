import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { along, length, lineString } from '@turf/turf'
import { mapboxAccessToken } from './config/mapbox'

type MapRide = { id: number; initials: string; pickup: string; destination: string; pickupCoords: [number, number]; destinationCoords: [number, number] }
type Route = { geometry: GeoJSON.LineString; duration: number; distance: number }

const idleVehicles: [number, number][] = [[-6.276, 53.352], [-6.226, 53.351], [-6.286, 53.371]]

function vehicleElement(active = false) {
  const vehicle = document.createElement('div')
  vehicle.className = `vehicle-marker${active ? ' active' : ''}`
  vehicle.innerHTML = '<svg viewBox="0 0 40 24" aria-hidden="true"><path d="M7 17 9.8 8.5A3 3 0 0 1 12.6 6h14.8a3 3 0 0 1 2.8 2.5L33 17v2H7v-2Z"/><path d="M12 7h16l2 7H10l2-7Z"/><circle cx="12" cy="19" r="3"/><circle cx="28" cy="19" r="3"/><path d="M17 4h6v3h-6z"/></svg>'
  return vehicle
}

export function DispatchMap({ rides, selected, active, progress, onSelect }: { rides: MapRide[]; selected: MapRide | null; active: MapRide | null; progress: number; onSelect: (ride: MapRide) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<mapboxgl.Marker[]>([])
  const [loaded, setLoaded] = useState(false)
  const [route, setRoute] = useState<Route | null>(null)

  useEffect(() => {
    if (!container.current || map.current) return
    mapboxgl.accessToken = mapboxAccessToken
    map.current = new mapboxgl.Map({ container: container.current, style: 'mapbox://styles/mapbox/streets-v12', center: [-6.2603, 53.354], zoom: 12.4, attributionControl: true })
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.current.on('load', () => setLoaded(true))
    return () => { map.current?.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const ride = active ?? selected
    if (!ride) { setRoute(null); return }
    const controller = new AbortController()
    const coordinates = `${ride.pickupCoords.join(',')};${ride.destinationCoords.join(',')}`
    fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?geometries=geojson&overview=full&access_token=${mapboxAccessToken}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Route unavailable')))
      .then((data) => setRoute(data.routes?.[0] ?? null))
      .catch((error) => { if (error.name !== 'AbortError') setRoute(null) })
    return () => controller.abort()
  }, [active, selected])

  useEffect(() => {
    if (!loaded || !map.current) return
    const source = map.current.getSource('driving-route') as mapboxgl.GeoJSONSource | undefined
    const data: GeoJSON.Feature<GeoJSON.LineString> = { type: 'Feature', properties: {}, geometry: route?.geometry ?? { type: 'LineString', coordinates: [] } }
    if (!source) {
      map.current.addSource('driving-route', { type: 'geojson', data })
      map.current.addLayer({ id: 'route-casing', type: 'line', source: 'driving-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': .92 } })
      map.current.addLayer({ id: 'route-line', type: 'line', source: 'driving-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#6d4aff', 'line-width': 5 } })
    } else source.setData(data)
    if (route && route.geometry.coordinates.length) {
      const bounds = route.geometry.coordinates.reduce((box, coordinate) => box.extend(coordinate as [number, number]), new mapboxgl.LngLatBounds(route.geometry.coordinates[0] as [number, number], route.geometry.coordinates[0] as [number, number]))
      map.current.fitBounds(bounds, { padding: { top: 145, right: 390, bottom: 80, left: 80 }, maxZoom: 14, duration: 700 })
    }
  }, [loaded, route])

  useEffect(() => {
    if (!map.current) return
    markers.current.forEach((marker) => marker.remove())
    markers.current = []
    let driverPosition = idleVehicles[0]
    if (active && route?.geometry.coordinates.length) {
      const road = lineString(route.geometry.coordinates)
      driverPosition = along(road, length(road) * progress / 100).geometry.coordinates as [number, number]
    }
    idleVehicles.slice(active ? 1 : 0).forEach((position) => markers.current.push(new mapboxgl.Marker({ element: vehicleElement() }).setLngLat(position).addTo(map.current!)))
    markers.current.push(new mapboxgl.Marker({ element: vehicleElement(Boolean(active)) }).setLngLat(driverPosition).addTo(map.current))
    rides.forEach((ride) => {
      const pickup = document.createElement('button')
      pickup.className = `location-marker pickup-marker ${selected?.id === ride.id ? 'active' : ''}`
      pickup.innerHTML = '<span></span><b>Pickup</b>'
      pickup.setAttribute('aria-label', `Select pickup for ${ride.initials}`)
      pickup.onclick = () => onSelect(ride)
      // Once assigned, the passenger/pickup status travels with the vehicle.
      const pickupPosition = active?.id === ride.id ? driverPosition : ride.pickupCoords
      markers.current.push(new mapboxgl.Marker({ element: pickup, anchor: 'bottom', offset: active?.id === ride.id ? [0, -13] : [0, 0] }).setLngLat(pickupPosition).addTo(map.current!))
      if (selected?.id === ride.id || active?.id === ride.id) {
        const dropoff = document.createElement('div')
        dropoff.className = 'location-marker dropoff-marker'
        dropoff.innerHTML = '<span></span><b>Drop off</b>'
        markers.current.push(new mapboxgl.Marker({ element: dropoff, anchor: 'bottom' }).setLngLat(ride.destinationCoords).addTo(map.current!))
      }
    })
  }, [active, onSelect, progress, rides, route, selected?.id])

  const minutes = route ? Math.max(1, Math.round(route.duration / 60)) : null
  const kilometres = route ? (route.distance / 1000).toFixed(1) : null
  return <>
    <div ref={container} className="dispatch-map" aria-label="Live taxi dispatch map" />
    {(active ?? selected) && <div className="route-summary"><span className="route-arrow">↗</span><div><small>{active ? 'DRIVING NOW' : 'SELECTED ROUTE'}</small><strong>{active ? `${Math.max(1, Math.ceil((minutes ?? 0) * (1 - progress / 100)))} min remaining` : `${minutes ?? '—'} min drive`}</strong></div><b>{kilometres ?? '—'} km</b></div>}
  </>
}
