import { useEffect, useState } from 'react'
import { mapboxAccessToken } from '../config/mapbox'
import type { City, Coordinates } from '../models/game'

type ReversePlace = { name: string; region: string; regionCode: string; country: string; countryCode: string }
const slug = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export async function reversePlace([longitude, latitude]: Coordinates): Promise<ReversePlace> {
  if (mapboxAccessToken) {
    const response = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${longitude}&latitude=${latitude}&types=place,locality,region,country&access_token=${mapboxAccessToken}`)
    if (!response.ok) throw new Error('We could not identify that place. Try another point.')
    const data = await response.json() as { features?: Array<{ properties?: { feature_type?: string; name?: string; short_code?: string; context?: { place?: { name?: string }; region?: { name?: string; region_code?: string }; country?: { name?: string; country_code?: string } } } }> }
    const feature = data.features?.find((item) => ['place', 'locality'].includes(item.properties?.feature_type ?? '')) ?? data.features?.[0]
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
  const name = address.city ?? address.town ?? address.village ?? address.municipality
  if (!name || !address.country_code) throw new Error('Select a town or city on land.')
  const region = address.state ?? address.county ?? name
  return { name, region, regionCode: region, country: address.country ?? address.country_code.toUpperCase(), countryCode: address.country_code.toUpperCase() }
}


export function CitySetup({ onStart, coordinates }: { onStart: (city: City) => void; coordinates: Coordinates | null }) {
  const [selected, setSelected] = useState<City | null>(null)
  const [status, setStatus] = useState('Tap anywhere on the world map to place Station 1')
  useEffect(() => {
    if (!coordinates) return
    let cancelled = false
    setSelected(null)
    setStatus('Finding your starting city…')
    void reversePlace(coordinates).then((place) => {
      if (cancelled) return
      const city: City = {
        id: `custom-${slug(place.countryCode)}-${slug(place.regionCode)}-${slug(place.name)}-${Math.abs(Math.round(coordinates[0] * 1000))}`,
        name: place.name, countryCode: place.countryCode, countryName: place.country,
        regionCode: place.regionCode, regionName: place.region, coordinates, mapZoom: 12,
      }
      setSelected(city)
      setStatus(`${place.name} · ${place.region}, ${place.country}`)
    }).catch((error: unknown) => {
      if (!cancelled) setStatus(error instanceof Error ? error.message : 'Choose a town or city on land.')
    })
    return () => { cancelled = true }
  }, [coordinates])
  return <aside className="worldfront-start-overlay" style={{
    position: 'absolute', zIndex: 30, bottom: 'max(20px, env(safe-area-inset-bottom))',
    left: 16, right: 16, maxWidth: 480, marginInline: 'auto', padding: 20,
    borderRadius: 22, background: 'rgba(3, 27, 38, 0.94)', color: '#f4ffff',
    border: '1px solid rgba(67,221,181,.35)', boxShadow: '0 18px 60px #0008',
    backdropFilter: 'blur(16px)',
  }}>
    <small style={{ color: '#43ddb5', letterSpacing: 2, fontWeight: 700 }}>WELCOME TO WORLDFRONT</small>
    <h1 style={{ fontSize: 25, lineHeight: 1.15, margin: '10px 0' }}>Where will your empire begin?</h1>
    <p style={{ fontSize: 13, color: '#a6c1c4', margin: '0 0 12px' }}>Explore the actual game map and tap a city to establish your first station.</p>
    <div role="status" style={{ fontSize: 14, marginBottom: 12 }}>⌖ {status}</div>
    <div style={{ fontSize: 13, color: '#c9e4df', marginBottom: 14 }}>📜 Operating licence included · 🚕 Station 1 + Compact Taxi included</div>
    <button className="start-button" style={{ width: '100%' }} disabled={!selected} onClick={() => selected && onStart(selected)}>
      {selected ? `Start in ${selected.name}` : 'Select a city to continue'} <span>→</span>
    </button>
  </aside>
}
