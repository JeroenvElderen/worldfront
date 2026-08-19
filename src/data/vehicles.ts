import { Vehicle } from '@/types/game';
export type VehicleOffer = Omit<Vehicle, 'id' | 'status' | 'currentLocation' | 'earnings' | 'totalDistance' | 'condition' | 'fuel'>;
export const VEHICLE_OFFERS: VehicleOffer[] = [
 { name:'Standard Taxi', type:'taxi', purchasePrice:3500, capacity:4, fareMultiplier:1 },
 { name:'Premium Sedan', type:'premium', purchasePrice:12000, capacity:4, fareMultiplier:1.35 },
 { name:'Minivan', type:'minivan', purchasePrice:18000, capacity:6, fareMultiplier:1.2 },
];
