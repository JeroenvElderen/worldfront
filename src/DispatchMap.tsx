import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { mapboxAccessToken } from './config/mapbox'

type MapRide = { id: number; initials: string; pickupCoords: [number, number]; destinationCoords: [number, number] }

export function DispatchMap({ rides, selected, active, progress, onSelect }: { rides: MapRide[]; selected: MapRide | null; active: MapRide | null; progress: number; onSelect: (ride: MapRide) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<mapboxgl.Marker[]>([])

  useEffect(() => {
    if (!container.current || map.current) return
    mapboxgl.accessToken = mapboxAccessToken
    map.current = new mapboxgl.Map({ container: container.current, style: 'mapbox://styles/mapbox/light-v11', center: [-6.2603, 53.354], zoom: 12.4, attributionControl: true })
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    return () => { map.current?.remove(); map.current = null }
  }, [])

  useEffect(() => {
    if (!map.current) return
    markers.current.forEach((marker) => marker.remove())
    markers.current = []
    const driver = document.createElement('div')
    driver.className = 'taxi-marker'
    const driverPosition: [number, number] = active
      ? [active.pickupCoords[0] + (active.destinationCoords[0] - active.pickupCoords[0]) * progress / 100, active.pickupCoords[1] + (active.destinationCoords[1] - active.pickupCoords[1]) * progress / 100]
      : [-6.276, 53.352]
    markers.current.push(new mapboxgl.Marker({ element: driver }).setLngLat(driverPosition).addTo(map.current))
    rides.forEach((ride) => {
      const pin = document.createElement('button')
      pin.className = `pickup-marker ${selected?.id === ride.id ? 'active' : ''}`
      pin.textContent = ride.initials
      pin.setAttribute('aria-label', `Select ride ${ride.initials}`)
      pin.onclick = () => onSelect(ride)
      markers.current.push(new mapboxgl.Marker({ element: pin }).setLngLat(ride.pickupCoords).addTo(map.current!))
    })
  }, [active, onSelect, progress, rides, selected?.id])

  return <div ref={container} className="dispatch-map" aria-label="Live taxi dispatch map" />
}
