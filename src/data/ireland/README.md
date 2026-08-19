# Ireland administrative boundaries

Place an authoritative GeoJSON export at:

`src/data/ireland/ireland.local-authorities.geojson`

The file must be a WGS84 (`EPSG:4326`) `FeatureCollection` of `Polygon` or
`MultiPolygon` local-authority/council boundaries. Every feature must contain:

- `id`: stable unique string or number
- `name`: official territory name
- `country`: `Ireland` (optional when the loader's default is used)

Do not simplify boundaries so aggressively that shared vertices diverge. Once
the licensed/authoritative file is present, import it here and pass it through
`loadAdministrativeTerritories` from `../territoryData`. GeoJSON is not checked
in until its provenance and redistribution licence have been confirmed.

