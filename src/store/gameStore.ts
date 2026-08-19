import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { CITIES } from '@/data/cities';
import { DUBLIN_LOCATIONS, PASSENGERS } from '@/data/locations';
import { VEHICLE_OFFERS } from '@/data/vehicles';
import { distanceKm, jobRewards, levelForXp } from '@/game/calculations';
import { routeService } from '@/map/routeService';
import { ActiveTrip, City, Company, TaxiJob, Vehicle } from '@/types/game';

const DUBLIN: [number,number] = [-6.2603,53.3498];
const tripDuration = (minutes: number) => Math.max(12000, Math.min(30000, minutes * 850));
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const initialCompany = (name: string): Company => ({name,cash:5000,level:1,xp:0,reputation:0,totalTrips:0,totalRevenue:0,currentCityId:'dublin'});
const starterTaxi = (): Vehicle => ({id:newId(),name:'Standard Taxi',type:'taxi',purchasePrice:3500,condition:100,fuel:100,capacity:4,status:'available',currentLocation:DUBLIN,earnings:0,totalDistance:0,fareMultiplier:1});

interface GameState {
  hasStarted: boolean; hydrated: boolean; company: Company | null; vehicles: Vehicle[]; jobs: TaxiJob[]; activeTrip: ActiveTrip | null; cities: City[];
  setHydrated(value:boolean):void; startGame(name:string):void; renameCompany(name:string):void; generateJobs():void; ignoreJob(id:string):void;
  acceptJob(id:string):Promise<boolean>; updateTrip(now:number):void; completeTrip():void; buyVehicle(offerIndex:number):boolean;
  addCash(amount:number):void; addXp(amount:number):void; resetGame():Promise<void>;
}
export const useGameStore = create<GameState>()(persist((set,get) => ({
  hasStarted:false, hydrated:false, company:null, vehicles:[], jobs:[], activeTrip:null, cities:CITIES,
  setHydrated: hydrated => set({hydrated}),
  startGame: name => set({hasStarted:true,company:initialCompany(name.trim() || 'Dublin Travel Co.'),vehicles:[starterTaxi()],cities:CITIES,jobs:generateJobBatch()}),
  renameCompany: name => set(s => s.company ? {company:{...s.company,name:name.trim() || s.company.name}} : {}),
  generateJobs: () => set({jobs:generateJobBatch()}),
  ignoreJob: id => set(s => ({jobs:s.jobs.filter(j => j.id !== id)})),
  acceptJob: async id => {
    const s=get(); if(s.activeTrip) return false; const job=s.jobs.find(j=>j.id===id); const vehicle=s.vehicles.find(v=>v.status==='available'&&v.capacity>=Number(job?.passengerCount)); if(!job||!vehicle) return false;
    const route=await routeService.getRoute(job.pickupCoordinates,job.destinationCoordinates);
    set(state=>({jobs:state.jobs.map(j=>j.id===id?{...j,status:'active'}:j),vehicles:state.vehicles.map(v=>v.id===vehicle.id?{...v,status:'on_trip',currentLocation:job.pickupCoordinates}:v),activeTrip:{jobId:id,vehicleId:vehicle.id,progress:0,route,startedAt:Date.now(),durationMs:tripDuration(job.estimatedDuration)}})); return true;
  },
  updateTrip: now => { const trip=get().activeTrip; if(!trip)return; const progress=Math.min(1,(now-trip.startedAt)/trip.durationMs); if(progress>=1){get().completeTrip();return;} const index=Math.min(trip.route.length-1,Math.floor(progress*(trip.route.length-1))); const location=trip.route[index]; if(!location)return; set(s=>({activeTrip:{...trip,progress},vehicles:s.vehicles.map(v=>v.id===trip.vehicleId?{...v,currentLocation:location}:v)})); },
  completeTrip: () => { const s=get(), trip=s.activeTrip; if(!trip||!s.company)return; const job=s.jobs.find(j=>j.id===trip.jobId); if(!job)return; const rewards=jobRewards(job); const vehicle=s.vehicles.find(v=>v.id===trip.vehicleId); const fare=Math.round(job.fare*(vehicle?.fareMultiplier ?? 1)); const xp=s.company.xp+rewards.xp;
    set({activeTrip:null,company:{...s.company,cash:s.company.cash+fare,xp,level:levelForXp(xp),reputation:Math.min(5,s.company.reputation+rewards.reputation),totalTrips:s.company.totalTrips+1,totalRevenue:s.company.totalRevenue+fare},jobs:s.jobs.filter(j=>j.id!==job.id),vehicles:s.vehicles.map(v=>v.id===trip.vehicleId?{...v,status:'available',currentLocation:job.destinationCoordinates,earnings:v.earnings+fare,totalDistance:v.totalDistance+job.distance,fuel:Math.max(0,v.fuel-rewards.fuel),condition:Math.max(0,v.condition-rewards.condition)}:v)}); },
  buyVehicle: index => {const s=get(),offer=VEHICLE_OFFERS[index];if(!offer||!s.company||s.company.cash<offer.purchasePrice)return false; const vehicle:Vehicle={...offer,id:newId(),condition:100,fuel:100,status:'available',currentLocation:DUBLIN,earnings:0,totalDistance:0};set({company:{...s.company,cash:s.company.cash-offer.purchasePrice},vehicles:[...s.vehicles,vehicle]});return true;},
  addCash: amount => set(s=>s.company?{company:{...s.company,cash:s.company.cash+amount}}:{}), addXp: amount=>set(s=>{if(!s.company)return {};const xp=s.company.xp+amount;return {company:{...s.company,xp,level:levelForXp(xp)}};}),
  resetGame: async()=>{await AsyncStorage.removeItem('travel-empire-save');set({hasStarted:false,company:null,vehicles:[],jobs:[],activeTrip:null,cities:CITIES});},
}),{name:'travel-empire-save',storage:createJSONStorage(()=>AsyncStorage),partialize:s=>({hasStarted:s.hasStarted,company:s.company,vehicles:s.vehicles,jobs:s.jobs,activeTrip:s.activeTrip,cities:s.cities}),onRehydrateStorage:()=>state=>state?.setHydrated(true)}));

function generateJobBatch():TaxiJob[]{ return Array.from({length:5},()=>{let a=Math.floor(Math.random()*DUBLIN_LOCATIONS.length),b=Math.floor(Math.random()*DUBLIN_LOCATIONS.length);while(b===a)b=Math.floor(Math.random()*DUBLIN_LOCATIONS.length);const from=DUBLIN_LOCATIONS[a]!,to=DUBLIN_LOCATIONS[b]!;const distance=distanceKm(from.coordinates,to.coordinates)*1.22;return{id:newId(),passengerName:PASSENGERS[Math.floor(Math.random()*PASSENGERS.length)]!,pickupLocation:from.name,destination:to.name,pickupCoordinates:from.coordinates,destinationCoordinates:to.coordinates,distance:Number(distance.toFixed(1)),estimatedDuration:Math.max(8,Math.round(distance*2.1+5)),fare:Math.round(5+distance*2.05+(from.airport||to.airport?8:0)),passengerCount:1+Math.floor(Math.random()*4),status:'available'};}); }
