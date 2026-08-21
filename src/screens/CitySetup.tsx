import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { mapboxAccessToken } from '../config/mapbox'
import { cities } from '../data/cities'
import type { City, Coordinates } from '../models/game'

const fallbackStyle: mapboxgl.StyleSpecification = { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] }
type ReversePlace = { name: string; region: string; regionCode: string; country: string; countryCode: string }
const slug = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

async function reversePlace([longitude, latitude]: Coordinates): Promise<ReversePlace> {
  if (mapboxAccessToken) {
    const response = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${longitude}&latitude=${latitude}&types=district,place,locality,region,country&access_token=${mapboxAccessToken}`)
    if (!response.ok) throw new Error('We could not identify that place. Try another point.')
    const data = await response.json() as { features?: Array<{ properties?: { feature_type?: string; name?: string; short_code?: string; context?: { place?: { name?: string }; region?: { name?: string; region_code?: string }; country?: { name?: string; country_code?: string } } } }> }
    const feature = data.features?.find((item) => item.properties?.feature_type === 'district') ?? data.features?.find((item) => ['place', 'locality'].includes(item.properties?.feature_type ?? '')) ?? data.features?.[0]
    const context = feature?.properties?.context
    const name = feature?.properties?.name ?? context?.place?.name
    const countryCode = context?.country?.country_code?.toUpperCase()
    if (!name || !countryCode) throw new Error('Select a town or city on land.')
    return { name, region: context?.region?.name ?? name, regionCode: context?.region?.region_code ?? context?.region?.name ?? name, country: context?.country?.name ?? countryCode, countryCode }
  }
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`, { headers: { 'Accept-Language': 'en' } })
  if (!response.ok) throw new Error('We could not identify that place. Try another point.')
  const data = await response.json() as { address?: Record<string, string> }
  const address = data.address ?? {}
  const name = address.county ?? address.city ?? address.town ?? address.village ?? address.municipality
  if (!name || !address.country_code) throw new Error('Select a town or city on land.')
  const region = address.state ?? address.county ?? name
  return { name, region, regionCode: region, country: address.country ?? address.country_code.toUpperCase(), countryCode: address.country_code.toUpperCase() }
}

function SelectionMap({ onSelect }: { onSelect: (city: City | null) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Tap a county to choose your headquarters')
  useEffect(() => {
    if (!container.current) return
    if (mapboxAccessToken) mapboxgl.accessToken = mapboxAccessToken
    const map = new mapboxgl.Map({ container: container.current, style: mapboxAccessToken ? 'mapbox://styles/mapbox/streets-v12' : fallbackStyle, center: [0, 25], zoom: 1.7, attributionControl: false })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    let marker: mapboxgl.Marker | undefined
    map.on('click', async ({ lngLat }) => {
      const coordinates: Coordinates = [lngLat.lng, lngLat.lat]
      marker?.remove(); marker = new mapboxgl.Marker({ color: '#43ddb5' }).setLngLat(lngLat).addTo(map)
      setStatus('Finding this place…')
      try {
        const place = await reversePlace(coordinates)
        const countyName = place.name.toLowerCase().replace(/^county\s+/, '')
        const knownCounty = cities.find((county) => county.countryCode === place.countryCode && county.name.toLowerCase().replace(/^county\s+/, '') === countyName)
        const city: City = knownCounty ?? { id: `custom-${slug(place.countryCode)}-${slug(place.regionCode)}-${slug(place.name)}-${Math.abs(Math.round(lngLat.lng * 1000))}`, name: place.name.startsWith('County ') ? place.name : `County ${place.name}`, countryCode: place.countryCode, countryName: place.country, regionCode: place.regionCode, regionName: place.name, coordinates, mapZoom: 9.2 }
        onSelect(city); setStatus(`${city.name} · ${place.country}`)
      } catch (error) { onSelect(null); setStatus((error as Error).message) }
    })
    return () => { marker?.remove(); map.remove() }
  }, [onSelect])
  return <div className="place-picker"><div ref={container} className="place-picker-map"/><div className="place-picker-status">⌖ {status}</div></div>
}

export function CitySetup({ onStart }: { onStart: (city: City) => void }) {
  const [selected, setSelected] = useState<City | null>(null)
  return <div className="setup-backdrop"><main className="setup-sheet game-panel">
    <small className="eyebrow">CHOOSE YOUR FIRST COUNTY</small>
    <h1>Where will your<br/><em>empire begin?</em></h1>
    <p>Tap a county on the map. Jobs stay inside the counties you own, and neighbouring counties can be added as your company grows.</p>
    <SelectionMap onSelect={setSelected}/>
    <div className="license-preview"><span>📜</span><div><small>INCLUDED OPERATING LICENSE</small><strong>{selected ? `${selected.regionName}, ${selected.countryName}` : 'Select a place to continue'}</strong></div><b>{selected ? 'Included' : '—'}</b></div>
    <div className="starter"><span>🚕</span><div><small>YOUR STARTER VEHICLE</small><strong>Compact Taxi</strong></div><b>Included</b></div>
    <button className="start-button" disabled={!selected} onClick={() => selected && onStart(selected)}>Start in {selected?.name ?? 'your county'} <span>→</span></button>
  </main></div>
}
