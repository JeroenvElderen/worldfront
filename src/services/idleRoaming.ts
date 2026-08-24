import type { Coordinates, IdleRoam, Vehicle } from '../models/game'

export const IDLE_ROAM_DURATION_MS = 45_000

const interpolate = (from: Coordinates, to: Coordinates, amount: number): Coordinates => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
]

export function idleRoamPosition(roam: IdleRoam, now = Date.now()): Coordinates {
  const progress = Math.max(0, Math.min(1, (now - new Date(roam.startedAt).getTime()) / (new Date(roam.arrivesAt).getTime() - new Date(roam.startedAt).getTime())))
  const segmentProgress = progress * Math.max(1, roam.waypoints.length - 1)
  const segment = Math.min(roam.waypoints.length - 2, Math.floor(segmentProgress))
  return interpolate(roam.waypoints[segment], roam.waypoints[segment + 1], segmentProgress - segment)
}

/** Creates a short city patrol so staffed, available taxis keep circulating. */
export function createIdleRoam(vehicle: Vehicle, cityCenter: Coordinates, now = Date.now(), random = Math.random): IdleRoam {
  const start = vehicle.position ?? cityCenter
  const waypoints: Coordinates[] = [start]
  for (let index = 0; index < 3; index += 1) {
    const angle = random() * Math.PI * 2
    const radius = 0.0025 + random() * 0.004
    waypoints.push([start[0] + Math.cos(angle) * radius, start[1] + Math.sin(angle) * radius * .65])
  }
  return { waypoints, startedAt: new Date(now).toISOString(), arrivesAt: new Date(now + IDLE_ROAM_DURATION_MS).toISOString() }
}
