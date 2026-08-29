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
  { id: 'plymouth-roscoff', name: 'Plymouth–Roscoff', originName: 'Plymouth Ferry Port', destinationName: 'Port of Roscoff', durationMinutes: 330, coordinates: [[-4.153, 50.368], [-4.28, 50.05], [-4.3, 49.58], [-4.12, 49.1], [-3.969, 48.721]] },
  { id: 'cork-roscoff', name: 'Cork–Roscoff', originName: 'Ringaskiddy Ferry Port', destinationName: 'Port of Roscoff', durationMinutes: 840, coordinates: [[-8.323, 51.835], [-7.3, 51.25], [-6.2, 50.55], [-5.05, 49.65], [-3.969, 48.721]] },
  { id: 'hull-rotterdam', name: 'Hull–Rotterdam', originName: 'Port of Hull', destinationName: 'Rotterdam Europoort', durationMinutes: 660, coordinates: [[-.318, 53.741], [.65, 53.62], [1.75, 53.25], [2.9, 52.7], [4.13, 51.951]] },
  { id: 'harwich-hook', name: 'Harwich–Hook of Holland', originName: 'Harwich International Port', destinationName: 'Hook of Holland Ferry Terminal', durationMinutes: 405, coordinates: [[1.311, 51.947], [1.95, 51.95], [2.7, 51.98], [3.45, 52.0], [4.119, 51.98]] },
  { id: 'newcastle-ijmuiden', name: 'Newcastle–IJmuiden', originName: 'Port of Tyne', destinationName: 'IJmuiden Ferry Terminal', durationMinutes: 960, coordinates: [[-1.44, 55.007], [-.45, 54.75], [.85, 54.2], [2.35, 53.35], [3.55, 52.75], [4.579, 52.462]] },
  { id: 'portsmouth-bilbao', name: 'Portsmouth–Bilbao', originName: 'Portsmouth International Port', destinationName: 'Port of Bilbao', durationMinutes: 1440, coordinates: [[-1.087, 50.813], [-2.15, 49.8], [-3.45, 48.2], [-4.2, 46.3], [-3.85, 44.6], [-3.064, 43.354]] },
  { id: 'plymouth-santander', name: 'Plymouth–Santander', originName: 'Plymouth Ferry Port', destinationName: 'Port of Santander', durationMinutes: 1260, coordinates: [[-4.153, 50.368], [-4.5, 48.8], [-4.75, 46.8], [-4.45, 44.8], [-3.807, 43.456]] },
  { id: 'setubal-troia', name: 'Setúbal–Tróia', originName: 'Setúbal Ferry Terminal', destinationName: 'Tróia Ferry Terminal', durationMinutes: 25, coordinates: [[-8.896, 38.521], [-8.91, 38.5], [-8.901, 38.488]] },
  { id: 'cuxhaven-helgoland', name: 'Cuxhaven–Heligoland', originName: 'Port of Cuxhaven', destinationName: 'Heligoland South Harbour', durationMinutes: 150, coordinates: [[8.707, 53.868], [8.35, 54.0], [7.95, 54.08], [7.891, 54.174]] },
  // Mediterranean and Baltic passenger gateways
  { id: 'barcelona-palma', name: 'Barcelona–Palma', originName: 'Port of Barcelona', destinationName: 'Port of Palma', durationMinutes: 450, coordinates: [[2.171, 41.352], [2.45, 40.55], [2.63, 39.57]] },
  { id: 'genoa-olbia', name: 'Genoa–Olbia', originName: 'Port of Genoa', destinationName: 'Port of Olbia', durationMinutes: 660, coordinates: [[8.921, 44.407], [9.42, 42.7], [9.51, 40.92]] },
  { id: 'naples-palermo', name: 'Naples–Palermo', originName: 'Port of Naples', destinationName: 'Port of Palermo', durationMinutes: 630, coordinates: [[14.269, 40.84], [13.75, 39.5], [13.37, 38.13]] },
  { id: 'ancona-split', name: 'Ancona–Split', originName: 'Port of Ancona', destinationName: 'Port of Split', durationMinutes: 660, coordinates: [[13.507, 43.621], [14.65, 43.35], [16.44, 43.5]] },
  { id: 'athens-heraklion', name: 'Piraeus–Heraklion', originName: 'Port of Piraeus', destinationName: 'Heraklion Port', durationMinutes: 540, coordinates: [[23.638, 37.942], [24.7, 36.4], [25.145, 35.342]] },
  { id: 'helsinki-tallinn', name: 'Helsinki–Tallinn', originName: 'West Harbour Helsinki', destinationName: 'Port of Tallinn', durationMinutes: 120, coordinates: [[24.921, 60.153], [24.82, 59.75], [24.768, 59.445]] },
  { id: 'stockholm-turku', name: 'Stockholm–Turku', originName: 'Stockholm Varta Harbour', destinationName: 'Port of Turku', durationMinutes: 660, coordinates: [[18.104, 59.35], [19.6, 59.8], [21.8, 60.2], [22.214, 60.435]] },
  { id: 'kiel-oslo', name: 'Kiel–Oslo', originName: 'Kiel Ferry Terminal', destinationName: 'Oslo Ferry Terminal', durationMinutes: 1200, coordinates: [[10.145, 54.329], [9.8, 56.0], [10.2, 57.8], [10.72, 59.9]] },
  // North American coastal and island services
  { id: 'seattle-bainbridge', name: 'Seattle–Bainbridge', originName: 'Seattle Ferry Terminal', destinationName: 'Bainbridge Island Terminal', durationMinutes: 35, coordinates: [[-122.339, 47.602], [-122.43, 47.61], [-122.511, 47.623]] },
  { id: 'vancouver-victoria', name: 'Tsawwassen–Swartz Bay', originName: 'Tsawwassen Ferry Terminal', destinationName: 'Swartz Bay Terminal', durationMinutes: 95, coordinates: [[-123.131, 49.007], [-123.25, 48.75], [-123.41, 48.69]] },
  { id: 'port-angeles-victoria', name: 'Port Angeles–Victoria', originName: 'Port Angeles Ferry Terminal', destinationName: 'Victoria Inner Harbour', durationMinutes: 90, coordinates: [[-123.43, 48.12], [-123.38, 48.3], [-123.37, 48.42]] },
  { id: 'woods-hole-marthas-vineyard', name: 'Woods Hole–Vineyard Haven', originName: 'Woods Hole Terminal', destinationName: 'Vineyard Haven Terminal', durationMinutes: 45, coordinates: [[-70.671, 41.523], [-70.61, 41.49], [-70.601, 41.456]] },
  { id: 'fort-lauderdale-freeport', name: 'Fort Lauderdale–Freeport', originName: 'Port Everglades', destinationName: 'Freeport Harbour', durationMinutes: 180, coordinates: [[-80.116, 26.093], [-79.45, 26.2], [-78.772, 26.524]] },
  { id: 'cozumel-playa', name: 'Playa del Carmen–Cozumel', originName: 'Playa del Carmen Ferry Pier', destinationName: 'Cozumel Ferry Terminal', durationMinutes: 45, coordinates: [[-86.846, 20.621], [-86.91, 20.58], [-86.944, 20.511]] },
  // Asia-Pacific's busiest short-sea passenger links
  { id: 'hong-kong-macau', name: 'Hong Kong–Macau', originName: 'Hong Kong Macau Ferry Terminal', destinationName: 'Macau Outer Harbour', durationMinutes: 60, coordinates: [[114.151, 22.289], [113.85, 22.25], [113.559, 22.196]] },
  { id: 'busan-fukuoka', name: 'Busan–Fukuoka', originName: 'Busan Port International Terminal', destinationName: 'Hakata Port International Terminal', durationMinutes: 210, coordinates: [[129.045, 35.115], [129.7, 34.7], [130.401, 33.604]] },
  { id: 'tokyo-izu-oshima', name: 'Tokyo–Izu Oshima', originName: 'Takeshiba Ferry Terminal', destinationName: 'Motomachi Port', durationMinutes: 105, coordinates: [[139.763, 35.654], [139.55, 35.15], [139.353, 34.75]] },
  { id: 'osaka-beppu', name: 'Osaka–Beppu', originName: 'Osaka South Port Ferry Terminal', destinationName: 'Beppu International Port', durationMinutes: 720, coordinates: [[135.429, 34.619], [133.7, 34.0], [131.5, 33.4], [131.506, 33.303]] },
  { id: 'cebu-tagbilaran', name: 'Cebu–Tagbilaran', originName: 'Cebu Pier 1', destinationName: 'Tagbilaran City Port', durationMinutes: 120, coordinates: [[123.906, 10.292], [123.89, 9.95], [123.85, 9.65]] },
  { id: 'singapore-batam', name: 'Singapore–Batam', originName: 'HarbourFront Ferry Terminal', destinationName: 'Batam Centre Ferry Terminal', durationMinutes: 70, coordinates: [[103.82, 1.265], [103.95, 1.18], [104.055, 1.13]] },
  { id: 'penang-langkawi', name: 'Penang–Langkawi', originName: 'Swettenham Pier', destinationName: 'Kuah Jetty', durationMinutes: 180, coordinates: [[100.346, 5.419], [100.22, 5.9], [99.85, 6.31]] },
  { id: 'auckland-waiheke', name: 'Auckland–Waiheke', originName: 'Auckland Ferry Terminal', destinationName: 'Matiatia Ferry Terminal', durationMinutes: 40, coordinates: [[174.768, -36.842], [174.9, -36.81], [174.953, -36.78]] },
  { id: 'wellington-picton', name: 'Wellington–Picton', originName: 'Wellington Ferry Terminal', destinationName: 'Picton Ferry Terminal', durationMinutes: 210, coordinates: [[174.786, -41.261], [174.95, -41.05], [174.0, -40.9], [174.007, -41.29]] },
  { id: 'melbourne-devonport', name: 'Geelong–Devonport', originName: 'Spirit of Tasmania Geelong Terminal', destinationName: 'Devonport Ferry Terminal', durationMinutes: 600, coordinates: [[144.42, -38.1], [145.0, -39.5], [146.37, -41.17]] },
  // Africa and South America
  { id: 'tangier-tarifa', name: 'Tangier–Tarifa', originName: 'Tangier City Port', destinationName: 'Port of Tarifa', durationMinutes: 60, coordinates: [[-5.81, 35.79], [-5.72, 35.9], [-5.605, 36.01]] },
  { id: 'dar-es-salaam-zanzibar', name: 'Dar es Salaam–Zanzibar', originName: 'Dar es Salaam Ferry Terminal', destinationName: 'Zanzibar Ferry Terminal', durationMinutes: 120, coordinates: [[39.292, -6.818], [39.25, -6.5], [39.19, -6.16]] },
  { id: 'cape-town-robben-island', name: 'Cape Town–Robben Island', originName: 'Nelson Mandela Gateway', destinationName: 'Murray Bay Harbour', durationMinutes: 35, coordinates: [[18.423, -33.907], [18.39, -33.84], [18.37, -33.806]] },
  { id: 'buenos-aires-colonia', name: 'Buenos Aires–Colonia', originName: 'Buenos Aires Ferry Terminal', destinationName: 'Port of Colonia', durationMinutes: 75, coordinates: [[-58.368, -34.598], [-58.0, -34.55], [-57.843, -34.471]] },
  { id: 'buenos-aires-montevideo', name: 'Buenos Aires–Montevideo', originName: 'Buenos Aires Ferry Terminal', destinationName: 'Port of Montevideo', durationMinutes: 150, coordinates: [[-58.368, -34.598], [-57.4, -34.7], [-56.21, -34.9]] },
]
