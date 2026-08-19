import type { Feature, MultiLineString, MultiPolygon, Polygon } from "@/types/geojson";

export type ControllerKind = "player" | "neutral" | "ai";

export type AdministrativeTerritoryProperties = {
  id: string;
  name: string;
  country: string;
};

export type AdministrativeTerritory = Feature<
  Polygon | MultiPolygon,
  AdministrativeTerritoryProperties
>;

export type TerritoryState = AdministrativeTerritoryProperties & {
  controllerId: string | null;
  originalControllerId: string | null;
};

// Kept separate from official boundaries so future combat can reshape control.
export type MilitaryControl = {
  territoryId: string;
  geometry: Polygon | MultiPolygon;
  controllerId: string | null;
};

export type Frontline = {
  id: string;
  playerTerritoryId: string;
  opposingTerritoryId: string;
  geometry: MultiLineString;
  lengthKm: number;
  deployedArmyId: string | null;
};

export type Army = {
  id: string;
  name: string;
  troops: number;
  supplyPercent: number;
  frontlineId: string | null;
};
