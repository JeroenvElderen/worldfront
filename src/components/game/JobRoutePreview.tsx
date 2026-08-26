import { memo, useMemo } from 'react'
import type { TaxiJob } from '../../models/game'
import { jobDestination, jobPickup } from '../../services/jobEngine'

interface JobRoutePreviewProps {
  job: TaxiJob
  isRepeatJob: boolean
  onOpen: () => void
}

const PREVIEW_WIDTH = 320
const PREVIEW_HEIGHT = 150
const PREVIEW_PADDING = 22

/**
 * Job cards deliberately use a lightweight SVG overview rather than creating a
 * Mapbox map for every offer. Mobile WebViews only provide a small number of
 * WebGL contexts; the preview maps could evict the persistent game map's
 * context as cards were added or removed, leaving its canvas black.
 */
const previewGeometry = (job: TaxiJob) => {
  const pickup = jobPickup(job)
  const destination = jobDestination(job)
  const coordinates = job.routeCoordinates?.length && job.routeCoordinates.length > 1
    ? job.routeCoordinates
    : [pickup, destination]
  const latitudeScale = Math.max(.2, Math.cos(((pickup[1] + destination[1]) / 2) * Math.PI / 180))
  const projected = coordinates.map(([longitude, latitude]) => [longitude * latitudeScale, -latitude] as const)
  const xs = projected.map(([x]) => x)
  const ys = projected.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const availableWidth = PREVIEW_WIDTH - PREVIEW_PADDING * 2
  const availableHeight = PREVIEW_HEIGHT - PREVIEW_PADDING * 2
  const scale = Math.min(
    availableWidth / Math.max(maxX - minX, .00001),
    availableHeight / Math.max(maxY - minY, .00001),
  )
  const offsetX = (PREVIEW_WIDTH - (maxX - minX) * scale) / 2
  const offsetY = (PREVIEW_HEIGHT - (maxY - minY) * scale) / 2
  const points = projected.map(([x, y]) => [
    offsetX + (x - minX) * scale,
    offsetY + (y - minY) * scale,
  ] as const)

  return {
    path: points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
    start: points[0],
    end: points.at(-1)!,
  }
}

function JobRoutePreviewView({ job, isRepeatJob, onOpen }: JobRoutePreviewProps) {
  const geometry = useMemo(() => previewGeometry(job), [job])

  return (
    <button
      type="button"
      className="job-route-preview"
      onClick={onOpen}
      aria-label={`View route from ${job.pickupLabel} to ${job.destinationLabel} on the map`}
    >
      <svg
        className="job-route-preview-map"
        viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <pattern id={`route-grid-${job.id}`} width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" className="job-route-grid-line" />
          </pattern>
          <filter id={`route-glow-${job.id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="100%" height="100%" className="job-route-preview-background" />
        <rect width="100%" height="100%" fill={`url(#route-grid-${job.id})`} />
        <path d={geometry.path} className="job-route-preview-halo" />
        <path d={geometry.path} className="job-route-preview-path" filter={`url(#route-glow-${job.id})`} />
        <circle cx={geometry.start[0]} cy={geometry.start[1]} r="6" className="job-route-preview-stop pickup" />
        <circle cx={geometry.end[0]} cy={geometry.end[1]} r="6" className="job-route-preview-stop destination" />
      </svg>

      <span className="job-route-preview-label">
        View route <b aria-hidden="true">↗</b>
      </span>

      <span className={`job-repeat-badge ${isRepeatJob ? 'repeat' : 'new'}`}>
        {isRepeatJob ? 'Repeat job' : 'New job'}
      </span>
    </button>
  )
}

export const JobRoutePreview = memo(JobRoutePreviewView)
