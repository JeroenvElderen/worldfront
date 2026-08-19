import { useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Mapbox, {
  Camera,
  FillLayer,
  LineLayer,
  MapView,
  ShapeSource,
} from "@rnmapbox/maps";

const mapboxToken =
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

if (mapboxToken) {
  Mapbox.setAccessToken(mapboxToken);
}

const PLAYER_COLOR = "#5B3A72";
const ENEMY_COLOR = "#A94442";

type Territory = {
  type: "Feature";
  properties: {
    faction: "player" | "enemy";
  };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
};

const playerInitial: Territory = {
  type: "Feature",
  properties: {
    faction: "player",
  },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-6.34, 53.3],
        [-6.34, 53.4],
        [-6.24, 53.4],
        [-6.24, 53.3],
        [-6.34, 53.3],
      ],
    ],
  },
};

const enemyInitial: Territory = {
  type: "Feature",
  properties: {
    faction: "enemy",
  },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-6.24, 53.3],
        [-6.24, 53.4],
        [-6.14, 53.4],
        [-6.14, 53.3],
        [-6.24, 53.3],
      ],
    ],
  },
};

const playerAdvanced: Territory = {
  type: "Feature",
  properties: {
    faction: "player",
  },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-6.34, 53.3],
        [-6.34, 53.4],

        [-6.24, 53.4],
        [-6.22, 53.37],
        [-6.205, 53.34],
        [-6.24, 53.3],

        [-6.34, 53.3],
      ],
    ],
  },
};

const enemyAfterAdvance: Territory = {
  type: "Feature",
  properties: {
    faction: "enemy",
  },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-6.24, 53.4],
        [-6.14, 53.4],
        [-6.14, 53.3],
        [-6.24, 53.3],

        [-6.205, 53.34],
        [-6.22, 53.37],
        [-6.24, 53.4],
      ],
    ],
  },
};

export default function GameScreen() {
  const [advanced, setAdvanced] = useState(false);

  const playerTerritory = useMemo(
    () => (advanced ? playerAdvanced : playerInitial),
    [advanced]
  );

  const enemyTerritory = useMemo(
    () => (advanced ? enemyAfterAdvance : enemyInitial),
    [advanced]
  );

  if (!mapboxToken) {
    return (
      <SafeAreaView style={styles.setupContainer}>
        <Text style={styles.setupTitle}>MAP TOKEN REQUIRED</Text>
        <Text style={styles.setupBody}>
          Add EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to a .env file, then restart the development build.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={Mapbox.StyleURL.Dark}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
      >
        <Camera
          centerCoordinate={[-6.24, 53.35]}
          zoomLevel={10.5}
        />

        <ShapeSource
          id="player-territory"
          shape={playerTerritory}
        >
          <FillLayer
            id="player-fill"
            style={{
              fillColor: PLAYER_COLOR,
              fillOpacity: 0.42,
            }}
          />

          <LineLayer
            id="player-border"
            style={{
              lineColor: "#C8A8DE",
              lineWidth: 3,
            }}
          />
        </ShapeSource>

        <ShapeSource
          id="enemy-territory"
          shape={enemyTerritory}
        >
          <FillLayer
            id="enemy-fill"
            style={{
              fillColor: ENEMY_COLOR,
              fillOpacity: 0.4,
            }}
          />

          <LineLayer
            id="enemy-border"
            style={{
              lineColor: "#E8A6A4",
              lineWidth: 3,
            }}
          />
        </ShapeSource>
      </MapView>

      <SafeAreaView style={styles.overlay}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.country}>
              BRAY REPUBLIC
            </Text>

            <Text style={styles.status}>
              {advanced
                ? "Offensive successful"
                : "Northern Front"}
            </Text>
          </View>

          <Text style={styles.year}>2030</Text>
        </View>

        <View style={styles.bottomContainer}>
          <View style={styles.frontCard}>
            <View>
              <Text style={styles.frontTitle}>
                1ST ARMY
              </Text>

              <Text style={styles.armyDetails}>
                24,800 troops · 94% supply
              </Text>
            </View>

            <Pressable
              onPress={() =>
                setAdvanced((current) => !current)
              }
              style={styles.attackButton}
            >
              <Text style={styles.attackText}>
                {advanced ? "RESET" : "ADVANCE"}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111114",
  },

  setupContainer: {
    flex: 1,
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#111114",
  },

  setupTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1,
  },

  setupBody: {
    marginTop: 12,
    color: "#B8B4BD",
    fontSize: 16,
    lineHeight: 24,
  },
  
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    pointerEvents: "box-none",
  },

  topBar: {
    margin: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "rgba(24, 22, 27, 0.92)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  country: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 1,
  },

  status: {
    color: "#B8B4BD",
    marginTop: 3,
    fontSize: 12,
  },

  year: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },

  bottomContainer: {
    padding: 16,
  },

  frontCard: {
    backgroundColor: "rgba(24, 22, 27, 0.96)",
    borderRadius: 22,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  frontTitle: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },

  armyDetails: {
    color: "#A9A5AE",
    marginTop: 4,
    fontSize: 12,
  },

  attackButton: {
    backgroundColor: PLAYER_COLOR,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },

  attackText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.7,
  },
});