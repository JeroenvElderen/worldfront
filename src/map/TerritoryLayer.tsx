import { FillLayer, LineLayer, ShapeSource } from "@rnmapbox/maps";
import type { FeatureCollection, MultiPolygon, Polygon } from "@/types/geojson";

import type { AdministrativeTerritory, TerritoryState } from "@/types/game";

const AI_COLORS: Record<string, string> = {
  "ai-amber": "#B9743C",
  "ai-teal": "#35847D",
  "ai-red": "#A94B55",
};

type Props = {
  territories: AdministrativeTerritory[];
  state: Record<string, TerritoryState>;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function TerritoryLayer({ territories, state, selectedId, onSelect }: Props) {
  const shape: FeatureCollection<Polygon | MultiPolygon> = {
    type: "FeatureCollection",
    features: territories.map((territory) => {
      const controllerId = state[territory.properties.id]?.controllerId ?? null;
      return {
        ...territory,
        properties: {
          ...territory.properties,
          fill: controllerId === "player" ? "#6F45A3" : AI_COLORS[controllerId ?? ""] ?? "#717780",
          selected: territory.properties.id === selectedId ? 1 : 0,
        },
      };
    }),
  };

  return (
    <ShapeSource
      id="administrative-territories"
      shape={shape}
      onPress={(event) => {
        const id = event.features[0]?.properties?.id;
        if (typeof id === "string") onSelect(id);
      }}
    >
      <FillLayer id="territory-fill" style={{ fillColor: ["get", "fill"], fillOpacity: 0.3 }} />
      <LineLayer
        id="territory-border"
        style={{
          lineColor: ["case", ["==", ["get", "selected"], 1], "#FFFFFF", "#AEB4BE"],
          lineOpacity: 0.9,
          lineWidth: ["case", ["==", ["get", "selected"], 1], 3.5, 1.2],
        }}
      />
    </ShapeSource>
  );
}
