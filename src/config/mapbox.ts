import { mapboxTokenPrefix } from './mapboxTokenPrefix'
import { mapboxTokenSuffix } from './mapboxTokenSuffix'

const configuredToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim()

// Prefer the deployment-specific token. The split token remains as a legacy
// fallback for existing mobile builds that have not migrated their env file.
export const mapboxAccessToken = configuredToken || `${mapboxTokenPrefix}${mapboxTokenSuffix}`
