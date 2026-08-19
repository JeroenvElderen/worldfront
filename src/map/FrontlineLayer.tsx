import { along, featureCollection, flatten, length, lineString } from "@turf/turf";
import { CircleLayer, LineLayer, ShapeSource } from "@rnmapbox/maps";
import type { Feature, LineString, MultiLineString } from "@/types/geojson";

type Props = {
  geometry: MultiLineString;
  deployed: boolean;
};

export function FrontlineLayer({ geometry, deployed }: Props) {
  const border: Feature<MultiLineString> = { type: "Feature", properties: {}, geometry };
  const markers = flatten(border).features.flatMap((segment) => {
    const line = segment as Feature<LineString>;
    const segmentLength = length(line, { units: "kilometers" });
    const count = Math.max(2, Math.min(8, Math.ceil(segmentLength / 5)));
    return Array.from({ length: count }, (_, index) =>
      along(lineString(line.geometry.coordinates), segmentLength * ((index + 0.5) / count), {
        units: "kilometers",
      }),
    );
  });

  return (
    <>
      <ShapeSource id="active-frontline" shape={border}>
        <LineLayer
          id="active-frontline-line"
          style={{ lineColor: "#F4E7FF", lineWidth: deployed ? 6 : 4, lineOpacity: 0.95 }}
        />
      </ShapeSource>
      {deployed ? (
        <ShapeSource id="army-frontline-markers" shape={featureCollection(markers)}>
          <CircleLayer
            id="army-frontline-strength"
            style={{ circleColor: "#251431", circleRadius: 4.5, circleStrokeColor: "#FFFFFF", circleStrokeWidth: 1.5 }}
          />
        </ShapeSource>
      ) : null}
    </>
  );
}
