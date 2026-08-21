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
  { id: 'preventive-diagnostics', discipline: 'engineering', tier: 1, icon: '⌁', name: 'Preventive Diagnostics', description: 'Detect wear before it becomes an expensive workshop visit.', effect: '15% cheaper service', cost: 1, requires: [] },
  { id: 'modular-workshops', discipline: 'engineering', tier: 2, icon: '⚒', name: 'Modular Workshops', description: 'Standardized tools and components accelerate every repair.', effect: 'Additional 15% service saving', cost: 1, requires: ['preventive-diagnostics'] },
  { id: 'fleet-telemetry', discipline: 'engineering', tier: 3, icon: '⌁', name: 'Fleet Telemetry', description: 'Live health data extends useful vehicle life across the company.', effect: '+10% vehicle resale value', cost: 2, requires: ['modular-workshops'] },
  { id: 'eco-routing', discipline: 'sustainability', tier: 1, icon: '♧', name: 'Eco Routing', description: 'Smooth routes reduce fuel and charging waste on every shift.', effect: '12% cheaper energy', cost: 1, requires: [] },
  { id: 'rapid-charging', discipline: 'sustainability', tier: 2, icon: 'ϟ', name: 'Rapid Charging', description: 'High-output charging hardware improves electric fleet economics.', effect: 'Additional 12% energy saving', cost: 1, requires: ['eco-routing'] },
  { id: 'circular-fleet', discipline: 'sustainability', tier: 3, icon: '↻', name: 'Circular Fleet', description: 'Reuse batteries and parts to recover more value at end of life.', effect: '+10% vehicle resale value', cost: 2, requires: ['rapid-charging'] },
  { id: 'prefab-depots', discipline: 'expansion', tier: 1, icon: '▱', name: 'Modular Stations', description: 'Deploy standardized stations quickly at any point on the map.', effect: '20% cheaper station construction', cost: 1, requires: [] },
  { id: 'regional-hubs', discipline: 'expansion', tier: 2, icon: '⬡', name: 'Station Network', description: 'Shared standards give every station one additional fleet bay.', effect: '+1 fleet slot per station', cost: 1, requires: ['prefab-depots'] },
  { id: 'global-network', discipline: 'expansion', tier: 3, icon: '◎', name: 'Global Network', description: 'A unified operating standard enables a truly vast company.', effect: '+4 fleet slots', cost: 2, requires: ['regional-hubs'] },
]

export const researchSpent = (completed: ResearchId[]) => researchNodes.filter((node) => completed.includes(node.id)).reduce((sum, node) => sum + node.cost, 0)
export const researchPoints = (companyLevel: number, completed: ResearchId[]) => Math.max(0, companyLevel - researchSpent(completed))
export const hasResearch = (completed: ResearchId[], id: ResearchId) => completed.includes(id)
export const canResearch = (node: ResearchNode, completed: ResearchId[], companyLevel: number) => !completed.includes(node.id) && node.requires.every((id) => completed.includes(id)) && researchPoints(companyLevel, completed) >= node.cost
