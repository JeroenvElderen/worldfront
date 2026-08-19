import { Coordinates, TaxiJob } from '@/types/game';
const radians = (value: number) => value * Math.PI / 180;
export function distanceKm(a: Coordinates, b: Coordinates) { const R=6371; const dLat=radians(b[1]-a[1]); const dLon=radians(b[0]-a[0]); const x=Math.sin(dLat/2)**2+Math.cos(radians(a[1]))*Math.cos(radians(b[1]))*Math.sin(dLon/2)**2; return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); }
export function jobRewards(job: TaxiJob) { return { xp: Math.round(10 + job.distance * 1.4 + (job.pickupLocation.includes('Airport') || job.destination.includes('Airport') ? 8 : 0)), reputation: Math.min(.08, .025 + job.distance / 500), fuel: Math.max(1, job.distance * .65), condition: Math.max(.15, job.distance * .045) }; }
export function levelForXp(xp: number) { if (xp >= 500) return 4 + Math.floor((xp-500)/350); if (xp >= 250) return 3; if (xp >= 100) return 2; return 1; }
export const formatMoney = (amount: number) => new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(amount);
