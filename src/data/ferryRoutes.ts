import type { Coordinates } from '../models/game'

export interface CuratedFerryRoute {
  id: string
  name: string
  originName: string
  destinationName: string
  durationMinutes: number
  coordinates: Coordinates[]
}

// Real scheduled passenger corridors provide a dependable offline fallback.
// Intermediate points keep the line over the operating sea corridor rather
// than drawing a city-centre-to-city-centre chord.
export const curatedFerryRoutes: CuratedFerryRoute[] = [
  { id: 'dover-calais', name: 'Dover–Calais', originName: 'Port of Dover', destinationName: 'Port of Calais', durationMinutes: 90, coordinates: [[1.333, 51.126], [1.48, 51.095], [1.65, 51.035], [1.848, 50.966]] },
  { id: 'holyhead-dublin', name: 'Holyhead–Dublin', originName: 'Holyhead Port', destinationName: 'Dublin Port', durationMinutes: 195, coordinates: [[-4.631, 53.307], [-4.98, 53.33], [-5.4, 53.36], [-5.82, 53.36], [-6.196, 53.349]] },
  { id: 'fishguard-rosslare', name: 'Fishguard–Rosslare', originName: 'Fishguard Harbour', destinationName: 'Rosslare Europort', durationMinutes: 210, coordinates: [[-4.986, 52.013], [-5.3, 52.04], [-5.68, 52.11], [-6.05, 52.18], [-6.337, 52.251]] },
  { id: 'liverpool-belfast', name: 'Liverpool–Belfast', originName: 'Liverpool Birkenhead', destinationName: 'Belfast Harbour', durationMinutes: 480, coordinates: [[-3.016, 53.421], [-3.45, 53.7], [-4.15, 54.1], [-5.1, 54.45], [-5.88, 54.63]] },
  { id: 'porthsmouth-caen', name: 'Portsmouth–Caen', originName: 'Portsmouth International Port', destinationName: 'Ouistreham Ferry Terminal', durationMinutes: 345, coordinates: [[-1.087, 50.813], [-1.05, 50.48], [-.82, 50.05], [-.5, 49.65], [-.237, 49.291]] },
  { id: 'plymouth-roscoff', name: 'Plymouth–Roscoff', originName: 'Plymouth Ferry Port', destinationName: 'Port de Roscoff', durationMinutes: 330, coordinates: [[-4.153, 50.368], [-4.28, 50.05], [-4.3, 49.58], [-4.12, 49.1], [-3.969, 48.721]] },
  { id: 'cork-roscoff', name: 'Cork–Roscoff', originName: 'Ringaskiddy Ferry Port', destinationName: 'Port de Roscoff', durationMinutes: 840, coordinates: [[-8.323, 51.835], [-7.3, 51.25], [-6.2, 50.55], [-5.05, 49.65], [-3.969, 48.721]] },
  { id: 'hull-rotterdam', name: 'Hull–Rotterdam', originName: 'Port of Hull', destinationName: 'Rotterdam Europoort', durationMinutes: 660, coordinates: [[-.318, 53.741], [.65, 53.62], [1.75, 53.25], [2.9, 52.7], [4.13, 51.951]] },
  { id: 'harwich-hook', name: 'Harwich–Hook of Holland', originName: 'Harwich International Port', destinationName: 'Hoek van Holland', durationMinutes: 405, coordinates: [[1.311, 51.947], [1.95, 51.95], [2.7, 51.98], [3.45, 52.0], [4.119, 51.98]] },
  { id: 'newcastle-ijmuiden', name: 'Newcastle–IJmuiden', originName: 'Port of Tyne', destinationName: 'IJmuiden Ferry Terminal', durationMinutes: 960, coordinates: [[-1.44, 55.007], [-.45, 54.75], [.85, 54.2], [2.35, 53.35], [3.55, 52.75], [4.579, 52.462]] },
  { id: 'portsmouth-bilbao', name: 'Portsmouth–Bilbao', originName: 'Portsmouth International Port', destinationName: 'Port of Bilbao', durationMinutes: 1440, coordinates: [[-1.087, 50.813], [-2.15, 49.8], [-3.45, 48.2], [-4.2, 46.3], [-3.85, 44.6], [-3.064, 43.354]] },
  { id: 'plymouth-santander', name: 'Plymouth–Santander', originName: 'Plymouth Ferry Port', destinationName: 'Port of Santander', durationMinutes: 1260, coordinates: [[-4.153, 50.368], [-4.5, 48.8], [-4.75, 46.8], [-4.45, 44.8], [-3.807, 43.456]] },
  { id: 'setubal-troia', name: 'Setúbal–Tróia', originName: 'Setúbal Ferry Terminal', destinationName: 'Tróia Ferry Terminal', durationMinutes: 25, coordinates: [[-8.896, 38.521], [-8.91, 38.5], [-8.901, 38.488]] },
  { id: 'cuxhaven-helgoland', name: 'Cuxhaven–Helgoland', originName: 'Cuxhaven Alte Liebe', destinationName: 'Helgoland Südhafen', durationMinutes: 150, coordinates: [[8.707, 53.868], [8.35, 54.0], [7.95, 54.08], [7.891, 54.174]] },
]
