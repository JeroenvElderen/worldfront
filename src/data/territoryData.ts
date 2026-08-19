import type { FeatureCollection, MultiPolygon, Polygon } from "@/types/geojson";

import type { AdministrativeTerritory } from "@/types/game";

export type RawAdministrativeProperties = Record<string, unknown>;
export type RawAdministrativeCollection = FeatureCollection<
  Polygon | MultiPolygon,
  RawAdministrativeProperties
>;

export type TerritoryPropertyMapping = {
  id: string;
  name: string;
  country?: string;
  defaultCountry: string;
};

/** Normalises a country's source schema into Worldfront's global schema. */
export function loadAdministrativeTerritories(
  collection: RawAdministrativeCollection,
  mapping: TerritoryPropertyMapping,
): AdministrativeTerritory[] {
  return collection.features.map((feature, index) => {
    const id = feature.properties?.[mapping.id];
    const name = feature.properties?.[mapping.name];
    const country = mapping.country
      ? feature.properties?.[mapping.country]
      : mapping.defaultCountry;

    if ((typeof id !== "string" && typeof id !== "number") || typeof name !== "string") {
      throw new Error(`Invalid administrative feature at index ${index}`);
    }

    return {
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        id: String(id),
        name,
        country: typeof country === "string" ? country : mapping.defaultCountry,
      },
    };
  });
}
