export type Position = number[];
export type Polygon = { type: "Polygon"; coordinates: Position[][] };
export type MultiPolygon = { type: "MultiPolygon"; coordinates: Position[][][] };
export type LineString = { type: "LineString"; coordinates: Position[] };
export type MultiLineString = { type: "MultiLineString"; coordinates: Position[][] };
export type Point = { type: "Point"; coordinates: Position };

export type Feature<G, P = Record<string, unknown>> = {
  type: "Feature";
  geometry: G;
  properties: P;
};

export type FeatureCollection<G, P = Record<string, unknown>> = {
  type: "FeatureCollection";
  features: Array<Feature<G, P>>;
};
