import type { ResearchId } from '../models/game'

export type ResearchDiscipline = 'operations' | 'engineering' | 'sustainability' | 'expansion'
export interface ResearchNode { id: ResearchId; discipline: ResearchDiscipline; tier: number; icon: string; name: string; description: string; effect: string; cost: number; requires: ResearchId[] }

export const researchDisciplines: Record<ResearchDiscipline, { name: string; icon: string; color: string }> = {
  operations: { name: 'Operations AI', icon: '◉', color: '#38bdf8' },
  engineering: { name: 'Fleet Engineering', icon: '⚙', color: '#a78bfa' },
  sustainability: { name: 'Clean Mobility', icon: '◇', color: '#34d399' },
  expansion: { name: 'Infrastructure', icon: '⌂', color: '#f59e0b' },
}

export const researchNodes: ResearchNode[] = [
  { id: 'smart-dispatch', discipline: 'operations', tier: 1, icon: '⌁', name: 'Smart Dispatch', description: 'Match each request with the most profitable available vehicle.', effect: '+8% taxi fares', cost: 1, requires: [] },
  { id: 'predictive-demand', discipline: 'operations', tier: 2, icon: '◌', name: 'Predictive Demand', description: 'Forecast hotspots from local travel patterns before demand arrives.', effect: '+25% job range', cost: 1, requires: ['smart-dispatch'] },
  { id: 'autonomous-operations', discipline: 'operations', tier: 3, icon: '✦', name: 'Autonomous Operations', description: 'A mature control center keeps a larger network moving.', effect: '+4 fleet slots', cost: 2, requires: ['predictive-demand'] },
  { id: 'network-orchestration', discipline: 'operations', tier: 4, icon: '⌘', name: 'Network Orchestration', description: 'Coordinate every station as one responsive system.', effect: '+10% dispatch efficiency', cost: 2, requires: ['autonomous-operations'] },
  { id: 'demand-twin', discipline: 'operations', tier: 5, icon: '◈', name: 'Demand Digital Twin', description: 'Simulate an entire city before the first call arrives.', effect: '+15% peak demand', cost: 3, requires: ['network-orchestration'] },
  { id: 'quantum-routing', discipline: 'operations', tier: 6, icon: '⌬', name: 'Quantum Routing', description: 'Evaluate millions of fleet movements at once.', effect: '+20% network throughput', cost: 3, requires: ['demand-twin'] },
  { id: 'sentient-dispatch', discipline: 'operations', tier: 7, icon: '◉', name: 'Sentient Dispatch', description: 'A self-improving control layer anticipates the whole world.', effect: 'Ultimate operations mastery', cost: 4, requires: ['quantum-routing'] },
  { id: 'preventive-diagnostics', discipline: 'engineering', tier: 1, icon: '⌁', name: 'Preventive Diagnostics', description: 'Detect wear before it becomes an expensive workshop visit.', effect: '15% cheaper service', cost: 1, requires: [] },
  { id: 'modular-workshops', discipline: 'engineering', tier: 2, icon: '⚒', name: 'Modular Workshops', description: 'Standardized tools and components accelerate every repair.', effect: 'Additional 15% service saving', cost: 1, requires: ['preventive-diagnostics'] },
  { id: 'fleet-telemetry', discipline: 'engineering', tier: 3, icon: '⌁', name: 'Fleet Telemetry', description: 'Live health data extends useful vehicle life across the company.', effect: '+10% vehicle resale value', cost: 2, requires: ['modular-workshops'] },
  { id: 'performance-lab', discipline: 'engineering', tier: 4, icon: '⌁', name: 'Performance Lab', description: 'Develop high-output drivetrains and specialist driver training.', effect: 'Opens exclusive vehicle research', cost: 2, requires: ['fleet-telemetry'] },
  { id: 'exclusive-fleet', discipline: 'engineering', tier: 5, icon: '◆', name: 'Exclusive Fleet', description: 'Secure limited Audi RS6, BMW M5 and AMG allocations.', effect: 'Unlocks exclusive cars · 2× trip speed', cost: 3, requires: ['performance-lab'] },
  { id: 'carbon-chassis', discipline: 'engineering', tier: 6, icon: '⬡', name: 'Carbon Chassis', description: 'Lightweight structures redefine fleet durability.', effect: 'Performance fleet mastery', cost: 3, requires: ['exclusive-fleet'] },
  { id: 'apex-engineering', discipline: 'engineering', tier: 7, icon: '♛', name: 'Apex Engineering', description: 'Build the most advanced road fleet on the planet.', effect: 'Ultimate engineering mastery', cost: 4, requires: ['carbon-chassis'] },
  { id: 'eco-routing', discipline: 'sustainability', tier: 1, icon: '♧', name: 'Eco Routing', description: 'Smooth routes reduce fuel and charging waste on every shift.', effect: '12% cheaper energy', cost: 1, requires: [] },
  { id: 'rapid-charging', discipline: 'sustainability', tier: 2, icon: 'ϟ', name: 'Rapid Charging', description: 'High-output charging hardware improves electric fleet economics.', effect: 'Additional 12% energy saving', cost: 1, requires: ['eco-routing'] },
  { id: 'circular-fleet', discipline: 'sustainability', tier: 3, icon: '↻', name: 'Circular Fleet', description: 'Reuse batteries and parts to recover more value at end of life.', effect: '+10% vehicle resale value', cost: 2, requires: ['rapid-charging'] },
  { id: 'battery-reclamation', discipline: 'sustainability', tier: 4, icon: '▣', name: 'Battery Reclamation', description: 'Recover rare materials from every retired power pack.', effect: 'Lower fleet lifecycle impact', cost: 2, requires: ['circular-fleet'] },
  { id: 'solar-depots', discipline: 'sustainability', tier: 5, icon: '☼', name: 'Solar Depots', description: 'Turn stations into clean local power plants.', effect: 'Cleaner station energy', cost: 3, requires: ['battery-reclamation'] },
  { id: 'hydrogen-grid', discipline: 'sustainability', tier: 6, icon: 'H', name: 'Hydrogen Grid', description: 'Connect long-distance clean-energy corridors.', effect: 'Continental clean mobility', cost: 3, requires: ['solar-depots'] },
  { id: 'zero-impact-network', discipline: 'sustainability', tier: 7, icon: '∞', name: 'Zero-impact Network', description: 'Close every material and energy loop.', effect: 'Ultimate sustainability mastery', cost: 4, requires: ['hydrogen-grid'] },
  { id: 'prefab-depots', discipline: 'expansion', tier: 1, icon: '▱', name: 'Modular Stations', description: 'Deploy standardized stations quickly at any point on the map.', effect: '20% cheaper station construction', cost: 1, requires: [] },
  { id: 'regional-hubs', discipline: 'expansion', tier: 2, icon: '⬡', name: 'Station Network', description: 'Shared standards give every station one additional fleet bay.', effect: '+1 fleet slot per station', cost: 1, requires: ['prefab-depots'] },
  { id: 'global-network', discipline: 'expansion', tier: 3, icon: '◎', name: 'Global Network', description: 'A unified operating standard enables a truly vast company.', effect: '+4 fleet slots', cost: 2, requires: ['regional-hubs'] },
  { id: 'mega-depots', discipline: 'expansion', tier: 4, icon: '▦', name: 'Mega Depots', description: 'Consolidate regional fleets into dense mobility campuses.', effect: 'Larger regional presence', cost: 2, requires: ['global-network'] },
  { id: 'continental-corridors', discipline: 'expansion', tier: 5, icon: '⇄', name: 'Continental Corridors', description: 'Link national networks with seamless infrastructure.', effect: 'Continental expansion mastery', cost: 3, requires: ['mega-depots'] },
  { id: 'orbital-logistics', discipline: 'expansion', tier: 6, icon: '◌', name: 'Orbital Logistics', description: 'Coordinate global assets from a space-based network.', effect: 'Worldwide network intelligence', cost: 3, requires: ['continental-corridors'] },
  { id: 'planetary-network', discipline: 'expansion', tier: 7, icon: '⊕', name: 'Planetary Network', description: 'Operate one uninterrupted mobility fabric around the world.', effect: 'Ultimate infrastructure mastery', cost: 4, requires: ['orbital-logistics'] },
]

export const researchSpent = (completed: ResearchId[]) => researchNodes.filter((node) => completed.includes(node.id)).reduce((sum, node) => sum + node.cost, 0)
export const researchPoints = (companyLevel: number, completed: ResearchId[]) => Math.max(0, companyLevel - researchSpent(completed))
export const hasResearch = (completed: ResearchId[], id: ResearchId) => completed.includes(id)
export const canResearch = (node: ResearchNode, completed: ResearchId[], companyLevel: number) => !completed.includes(node.id) && node.requires.every((id) => completed.includes(id)) && researchPoints(companyLevel, completed) >= node.cost
