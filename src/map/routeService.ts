import { Coordinates } from '@/types/game';
export interface RouteService { getRoute(from: Coordinates, to: Coordinates): Promise<Coordinates[]>; }
export class LocalRouteService implements RouteService { async getRoute(from: Coordinates,to: Coordinates) { return Array.from({length:31},(_,i) => { const t=i/30; const curve=Math.sin(t*Math.PI)*.003; return [from[0]+(to[0]-from[0])*t+curve,from[1]+(to[1]-from[1])*t] as Coordinates; }); } }
export const routeService: RouteService = new LocalRouteService();
