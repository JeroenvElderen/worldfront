import {
  booleanPointInPolygon,
  flatten,
  length,
  lineOverlap,
  point,
  polygonToLine,
} from "@turf/turf";
import type { Feature, LineString, MultiLineString } from "@/types/geojson";

import type { AdministrativeTerritory } from "@/types/game";

export const BRAY_COORDINATE: [number, number] = [-6.111, 53.202];

export function findTerritoryContainingCoordinate(
  territories: AdministrativeTerritory[],
  coordinate: [number, number],
) {
  const location = point(coordinate);
  return territories.find((territory) => booleanPointInPolygon(location, territory));
}

export function getSharedBorder(
  first: AdministrativeTerritory,
  second: AdministrativeTerritory,
): Feature<MultiLineString> | null {
  const firstLines = flatten(polygonToLine(first)).features;
  const secondLines = flatten(polygonToLine(second)).features;
  const coordinates = firstLines.flatMap((firstLine) =>
    secondLines.flatMap((secondLine) =>
      lineOverlap(firstLine, secondLine, { tolerance: 0.001 }).features.map(
        (segment) => segment.geometry.coordinates,
      ),
    ),
  );
  if (coordinates.length === 0) return null;

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "MultiLineString",
      coordinates,
    },
  };
}

export function getNeighbouringTerritories(
  territory: AdministrativeTerritory,
  allTerritories: AdministrativeTerritory[],
) {
  return allTerritories.filter((candidate) => {
    if (candidate.properties.id === territory.properties.id) return false;
    const shared = getSharedBorder(territory, candidate);
    return shared !== null && length(shared, { units: "kilometers" }) > 0.01;
  });
}

export function getBorderLengthKm(border: Feature<LineString | MultiLineString>) {
  return length(border, { units: "kilometers" });
}
