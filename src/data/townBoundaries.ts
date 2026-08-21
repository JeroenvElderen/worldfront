import { polygon } from '@turf/helpers'

/**
 * Simplified town settlement boundaries derived from OpenStreetMap administrative
 * and place boundaries. Keeping them in the bundle makes territory rules work
 * offline and gives gameplay a stable boundary even when Mapbox is unavailable.
 */
export const townBoundaries: Record<string, ReturnType<typeof polygon>> = {
  'ie-bray': { type: 'Feature', properties: { townId: 'ie-bray', name: 'Bray' }, geometry: { type: 'Polygon', coordinates: [[
    [-6.1506, 53.2268], [-6.1115, 53.2326], [-6.0831, 53.2164], [-6.0780, 53.1861],
    [-6.0990, 53.1697], [-6.1260, 53.1743], [-6.1518, 53.1950], [-6.1506, 53.2268],
  ]] } },
  'ie-greystones': { type: 'Feature', properties: { townId: 'ie-greystones', name: 'Greystones' }, geometry: { type: 'Polygon', coordinates: [[
    [-6.0990, 53.1697], [-6.0780, 53.1861], [-6.0521, 53.1764], [-6.0378, 53.1470],
    [-6.0451, 53.1124], [-6.0770, 53.1089], [-6.1014, 53.1315], [-6.0990, 53.1697],
  ]] } },
  'ie-wicklow': { type: 'Feature', properties: { townId: 'ie-wicklow', name: 'Wicklow' }, geometry: { type: 'Polygon', coordinates: [[
    [-6.0910, 53.0060], [-6.0550, 53.0130], [-6.0190, 52.9970], [-6.0180, 52.9630],
    [-6.0520, 52.9460], [-6.0870, 52.9640], [-6.0910, 53.0060],
  ]] } },
}
