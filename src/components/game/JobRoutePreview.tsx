import { memo, useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { featureCollection, lineString, point } from '@turf/helpers'
import { mapboxAccessToken } from '../../config/mapbox'
import type { TaxiJob } from '../../models/game'
import { jobDestination, jobPickup } from '../../services/jobEngine'

interface JobRoutePreviewProps {
  job: TaxiJob
  onOpen: () => void
}

const fallbackStyle: mapboxgl.StyleSpecification = {
  version: 8,
  sources: {
    openStreetMap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'openStreetMap',
      type: 'raster',
      source: 'openStreetMap',
    },
  ],
}

function JobRoutePreviewView({ job, onOpen }: JobRoutePreviewProps) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mapContainer = container.current
    if (!mapContainer) return

    const pickup = jobPickup(job)
    const destination = jobDestination(job)
    const abortController = new AbortController()

    if (mapboxAccessToken) {
      mapboxgl.accessToken = mapboxAccessToken
    }

    const map = new mapboxgl.Map({
      container: mapContainer,
      style: mapboxAccessToken
        ? 'mapbox://styles/mapbox/dark-v11'
        : fallbackStyle,
      center: [
        (pickup[0] + destination[0]) / 2,
        (pickup[1] + destination[1]) / 2,
      ],
      zoom: 10,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    })

    // Keep the internal Mapbox canvas synchronized with
    // the actual job preview container dimensions.
    const resizeObserver = new ResizeObserver(() => {
      map.resize()
    })

    resizeObserver.observe(mapContainer)

    // The card/modal may still be completing its layout when
    // Mapbox is initially constructed.
    const firstResize = requestAnimationFrame(() => {
      map.resize()

      requestAnimationFrame(() => {
        map.resize()
      })
    })

    map.on('load', async () => {
      map.resize()

      let route: number[][] = [pickup, destination]

      if (mapboxAccessToken) {
        try {
          const stops = `${pickup.join(',')};${destination.join(',')}`

          const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${stops}?geometries=geojson&overview=full&access_token=${mapboxAccessToken}`,
            { signal: abortController.signal },
          )

          if (response.ok) {
            const result = await response.json() as {
              routes?: Array<{
                geometry: {
                  coordinates: number[][]
                }
              }>
            }

            route = result.routes?.[0]?.geometry.coordinates ?? route
          }
        } catch {
          // Keep direct-line fallback.
        }
      }

      if (!map.getStyle()) return

      map.addSource('preview-route', {
        type: 'geojson',
        data: lineString(route),
      })

      map.addLayer({
        id: 'preview-route-halo',
        type: 'line',
        source: 'preview-route',
        paint: {
          'line-color': '#062933',
          'line-width': 7,
          'line-opacity': 0.72,
        },
      })

      map.addLayer({
        id: 'preview-route',
        type: 'line',
        source: 'preview-route',
        paint: {
          'line-color': '#22dcc4',
          'line-width': 3,
        },
      })

      map.addSource('preview-stops', {
        type: 'geojson',
        data: featureCollection([
          point(pickup, { stop: 'pickup' }),
          point(destination, { stop: 'destination' }),
        ]),
      })

      map.addLayer({
        id: 'preview-stops',
        type: 'circle',
        source: 'preview-stops',
        paint: {
          'circle-radius': 5,
          'circle-color': [
            'match',
            ['get', 'stop'],
            'pickup',
            '#22dcc4',
            '#f5be48',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#eafffb',
        },
      })

      const bounds = route.reduce(
        (box, coordinate) =>
          box.extend(coordinate as [number, number]),
        new mapboxgl.LngLatBounds(
          route[0] as [number, number],
          route[0] as [number, number],
        ),
      )

      // Important: resize BEFORE calculating fitBounds.
      map.resize()

      map.fitBounds(bounds, {
        padding: 24,
        duration: 0,
        maxZoom: 13,
      })
    })

    return () => {
      cancelAnimationFrame(firstResize)
      resizeObserver.disconnect()
      abortController.abort()
      map.remove()
    }
  }, [job])

  return (
    <button
      type="button"
      className="job-route-preview"
      onClick={onOpen}
      aria-label={`View route from ${job.pickupLabel} to ${job.destinationLabel} on the map`}
    >
      <div
        ref={container}
        className="job-route-preview-map"
        aria-hidden="true"
      />

      <span className="job-route-preview-label">
        View route <b aria-hidden="true">↗</b>
      </span>
    </button>
  )
}

export const JobRoutePreview = memo(JobRoutePreviewView)