import type { City, Coordinates, PassengerStory, TaxiJob, TrafficIncident } from '../models/game'
import { distanceKmBetween, jobDestination, jobPickup } from './jobEngine'

const stories: PassengerStory[] = [
  { kind: 'missed-flight', headline: 'Flight connection at risk', description: 'The passenger is racing to check-in. A punctual arrival earns extra trust.', priority: 'critical', fareMultiplier: 1.35, reputationBonus: 1.2 },
  { kind: 'medical-appointment', headline: 'Important hospital appointment', description: 'A calm, reliable journey matters more than speed for this passenger.', priority: 'urgent', fareMultiplier: 1.2, reputationBonus: 1 },
  { kind: 'vip', headline: 'Discreet VIP transfer', description: 'The passenger expects privacy, comfort and professional service.', priority: 'urgent', fareMultiplier: 1.5, reputationBonus: .8 },
  { kind: 'lost-property', headline: 'Returning lost property', description: 'The passenger left an important item behind and needs help recovering it.', priority: 'routine', fareMultiplier: 1.15, reputationBonus: 1.5 },
  { kind: 'difficult-passenger', headline: 'Customer flagged as demanding', description: 'Good service may win them over, but poor handling will hurt the rating.', priority: 'routine', fareMultiplier: 1.25, reputationBonus: .5 },
]

export const createPassengerStory = () => Math.random() < .38
  ? stories[Math.floor(Math.random() * stories.length)]
  : undefined

const incidentDetails = [
  { kind: 'crash' as const, title: 'Traffic collision', description: 'Emergency crews are restricting a traffic lane.', severity: 3 as const, delayMultiplier: 1.35 },
  { kind: 'roadworks' as const, title: 'Emergency roadworks', description: 'Temporary signals are causing queues.', severity: 2 as const, delayMultiplier: 1.22 },
  { kind: 'closure' as const, title: 'Road closure', description: 'Traffic is being diverted onto surrounding roads.', severity: 3 as const, delayMultiplier: 1.4 },
  { kind: 'event-congestion' as const, title: 'Event congestion', description: 'Heavy passenger and pedestrian traffic is slowing the area.', severity: 1 as const, delayMultiplier: 1.14 },
]

export const createTrafficIncident = (city: City, now = Date.now()): TrafficIncident => {
  const details = incidentDetails[Math.floor(Math.random() * incidentDetails.length)]
  const angle = Math.random() * Math.PI * 2
  const radius = 1.5 + Math.random() * 5
  const coordinates: Coordinates = [
    city.coordinates[0] + Math.cos(angle) * radius / (111.32 * Math.max(.2, Math.cos(city.coordinates[1] * Math.PI / 180))),
    city.coordinates[1] + Math.sin(angle) * radius / 110.574,
  ]
  return { id: crypto.randomUUID(), cityId: city.id, coordinates, ...details, occurredAt: new Date(now).toISOString(), expiresAt: new Date(now + (4 + Math.random() * 5) * 60_000).toISOString(), resolved: false }
}

const distanceToJob = (incident: TrafficIncident, job: TaxiJob) => Math.min(
  distanceKmBetween(incident.coordinates, jobPickup(job)),
  distanceKmBetween(incident.coordinates, jobDestination(job)),
  ...(job.routeCoordinates ?? []).map((coordinate) => distanceKmBetween(incident.coordinates, coordinate)),
)

export const trafficImpactForJob = (job: TaxiJob, incidents: TrafficIncident[]) => incidents
  .filter((incident) => !incident.resolved && incident.cityId === job.cityId && distanceToJob(incident, job) <= 2.5)
  .sort((left, right) => right.delayMultiplier - left.delayMultiplier)[0]
