import type { JobCategory, TaxiJob, VehicleUpgrade } from '../models/game'

export type OperationPriority = 'Routine' | 'Priority' | 'Time critical'

interface OperationTemplate {
  title: string
  icon: string
  priority: OperationPriority
  service: string
  requirements: string[]
}

const templates: Record<JobCategory, OperationTemplate> = {
  standard: { title: 'Local passenger transfer', icon: '🚕', priority: 'Routine', service: 'Local mobility', requirements: ['Staffed taxi'] },
  airport: { title: 'Airport connection', icon: '✈️', priority: 'Time critical', service: 'Airport operations', requirements: ['Staffed taxi', 'Luggage capacity'] },
  family: { title: 'Family group transfer', icon: '👨‍👩‍👧', priority: 'Priority', service: 'Group travel', requirements: ['Staffed taxi', 'Enough seats'] },
  executive: { title: 'Executive itinerary', icon: '💼', priority: 'Priority', service: 'Premium travel', requirements: ['Staffed taxi', 'Premium seats'] },
  accessible: { title: 'Assisted passenger transfer', icon: '♿', priority: 'Priority', service: 'Accessible mobility', requirements: ['Staffed taxi', 'Passenger assistance'] },
  'late-night': { title: 'Night travel request', icon: '🌙', priority: 'Priority', service: 'Night operations', requirements: ['Staffed taxi', 'Available driver'] },
  'long-distance': { title: 'Regional passenger connection', icon: '🛣️', priority: 'Routine', service: 'Regional travel', requirements: ['Staffed taxi', 'Journey range'] },
  courier: { title: 'Priority travel courier', icon: '📦', priority: 'Time critical', service: 'Travel logistics', requirements: ['Staffed taxi', 'Secure load space'] },
  'pet-friendly': { title: 'Passenger and pet transfer', icon: '🐾', priority: 'Routine', service: 'Special assistance', requirements: ['Staffed taxi', 'Pet-friendly vehicle'] },
}

const upgradeRequirement: Partial<Record<VehicleUpgrade, string>> = {
  'premium-seats': 'Premium seats',
  'range-pack': 'Journey range',
}

/** Adds a travel-operations briefing to existing taxi work without changing dispatch or map behaviour. */
export function travelOperationFor(job: TaxiJob) {
  const template = templates[job.category ?? 'standard']
  const requirements = [...template.requirements]
  const requiredUpgrade = job.requiredUpgrade && upgradeRequirement[job.requiredUpgrade]
  if (requiredUpgrade && !requirements.includes(requiredUpgrade)) requirements.push(requiredUpgrade)

  return {
    ...template,
    requirements,
    reference: `TE-${job.id.replaceAll('-', '').slice(0, 6).toUpperCase()}`,
  }
}
