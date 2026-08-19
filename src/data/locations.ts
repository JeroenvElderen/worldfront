import { Coordinates } from '@/types/game';
export interface GameLocation { name: string; coordinates: Coordinates; airport?: boolean; }
export const DUBLIN_LOCATIONS: GameLocation[] = [
  { name:'Dublin Airport', coordinates:[-6.2499,53.4264], airport:true }, { name:'Temple Bar', coordinates:[-6.2675,53.3455] },
  { name:'Heuston Station', coordinates:[-6.2927,53.3464] }, { name:'Connolly Station', coordinates:[-6.2467,53.3509] },
  { name:"St Stephen's Green", coordinates:[-6.2591,53.3382] }, { name:'Dublin Port', coordinates:[-6.2084,53.3498] },
  { name:'Ballsbridge', coordinates:[-6.2305,53.3284] }, { name:'Ranelagh', coordinates:[-6.2553,53.3254] },
  { name:'Dundrum', coordinates:[-6.2454,53.2898] }, { name:'Howth', coordinates:[-6.0653,53.3889] }, { name:'Bray', coordinates:[-6.0983,53.2028] },
];
export const PASSENGERS = ['Aoife Murphy','Cian Kelly','Sophie Byrne','Liam Walsh','Niamh Ryan','Jack Doyle','Maya Patel','Noah Smith'];
