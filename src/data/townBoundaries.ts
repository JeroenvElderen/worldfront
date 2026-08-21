import { polygon } from '@turf/helpers'

/**
 * Simplified county boundaries derived from Ireland's administrative borders.
 * Keeping them in the bundle makes territory rules work
 * offline and gives gameplay a stable boundary even when Mapbox is unavailable.
 */
export const townBoundaries: Record<string, ReturnType<typeof polygon>> = {
  'ie-wicklow': { type: 'Feature', properties: { townId: 'ie-wicklow', name: 'Wicklow' }, geometry: { type: 'Polygon', coordinates: [[
    [-6.70,53.22],[-6.58,53.35],[-6.40,53.30],[-6.27,53.24],[-6.08,53.20],[-6.03,53.08],[-6.05,52.80],[-6.22,52.68],[-6.48,52.63],[-6.70,52.75],[-6.82,52.91],[-6.70,53.22],
  ]] } },
  'ie-dublin': { type: 'Feature', properties: { townId: 'ie-dublin', name: 'Dublin' }, geometry: { type: 'Polygon', coordinates: [[
    [-6.58,53.35],[-6.47,53.63],[-6.25,53.63],[-6.08,53.50],[-6.04,53.29],[-6.08,53.20],[-6.27,53.24],[-6.40,53.30],[-6.58,53.35],
  ]] } },
  'ie-kildare': { type: 'Feature', properties: { townId: 'ie-kildare', name: 'Kildare' }, geometry: { type: 'Polygon', coordinates: [[
    [-7.16,53.40],[-7.08,53.56],[-6.70,53.52],[-6.47,53.63],[-6.58,53.35],[-6.70,53.22],[-6.82,52.91],[-7.03,52.93],[-7.16,53.40],
  ]] } },
  'ie-carlow': { type: 'Feature', properties: { townId: 'ie-carlow', name: 'Carlow' }, geometry: { type: 'Polygon', coordinates: [[
    [-7.03,52.93],[-6.82,52.91],[-6.70,52.75],[-6.48,52.63],[-6.50,52.48],[-6.73,52.44],[-6.99,52.54],[-7.10,52.75],[-7.03,52.93],
  ]] } },
  'ie-wexford': { type: 'Feature', properties: { townId: 'ie-wexford', name: 'Wexford' }, geometry: { type: 'Polygon', coordinates: [[
    [-6.48,52.63],[-6.22,52.68],[-6.05,52.80],[-6.03,52.55],[-6.14,52.22],[-6.35,52.17],[-6.66,52.17],[-6.73,52.44],[-6.50,52.48],[-6.48,52.63],
  ]] } },
}
