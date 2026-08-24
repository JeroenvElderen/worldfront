import type { Coordinates, IdleRoam, Vehicle } from '../models/game'

export const IDLE_ROAM_DURATION_MS = 45_000

const interpolate = (from: Coordinates, to: Coordinates, amount: number): Coordinates => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
]

export function idleRoamPosition(roam: IdleRoam, now = Date.now()): Coordinates {
  const progress = Math.max(0, Math.min(1, (now - new Date(roam.startedAt).getTime()) / (new Date(roam.arrivesAt).getTime() - new Date(roam.startedAt).getTime())))
  if (roam.waypoints.length < 2) return roam.waypoints[0] ?? [0, 0]
  const lengths = roam.waypoints.slice(1).map((waypoint, index) => Math.hypot(
    waypoint[0] - roam.waypoints[index][0],
    waypoint[1] - roam.waypoints[index][1],
  ))
  let distance = progress * lengths.reduce((sum, length) => sum + length, 0)
  let segment = 0
  while (segment < lengths.length - 1 && distance > lengths[segment]) distance -= lengths[segment++]
  return interpolate(roam.waypoints[segment], roam.waypoints[segment + 1], lengths[segment] ? distance / lengths[segment] : 1)
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
