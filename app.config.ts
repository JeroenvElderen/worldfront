import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Travel Empire',
  slug: 'travel-empire',
  scheme: 'travelempire',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  plugins: [
    'expo-router',
    ['@rnmapbox/maps', { RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOADS_TOKEN }],
  ],
  android: {
    package: 'com.travelempire.game',
    permissions: ['android.permission.INTERNET'],
  },
  experiments: { typedRoutes: true },
};

export default config;
