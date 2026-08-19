import { City } from '@/types/game';
export const CITIES: City[] = [
  ['dublin','Dublin','Ireland',[-6.2603,53.3498],0,true,82], ['cork','Cork','Ireland',[-8.4756,51.8985],25000,false,63],
  ['galway','Galway','Ireland',[-9.0568,53.2707],30000,false,70], ['belfast','Belfast','United Kingdom',[-5.9301,54.5973],45000,false,68],
  ['london','London','United Kingdom',[-0.1276,51.5072],150000,false,95], ['amsterdam','Amsterdam','Netherlands',[4.9041,52.3676],180000,false,94],
  ['paris','Paris','France',[2.3522,48.8566],220000,false,98], ['barcelona','Barcelona','Spain',[2.1734,41.3851],200000,false,96],
  ['athens','Athens','Greece',[23.7275,37.9838],175000,false,88],
].map(([id,name,country,coordinates,unlockPrice,unlocked,tourismDemand]) => ({ id, name, country, coordinates, unlockPrice, unlocked, tourismDemand } as City));
