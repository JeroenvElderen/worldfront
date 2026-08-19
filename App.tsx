import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import Mapbox, { Camera, MapView } from "@rnmapbox/maps";

import { TerritoryCard } from "@/components/TerritoryCard";
import { useGameStore } from "@/game/store";
import { FrontlineLayer } from "@/map/FrontlineLayer";
import { TerritoryLayer } from "@/map/TerritoryLayer";

const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (mapboxToken) Mapbox.setAccessToken(mapboxToken);

export default function App() {
  const game = useGameStore();
  const selected = game.selectedTerritoryId
    ? game.territoryState[game.selectedTerritoryId]
    : undefined;

  if (!mapboxToken) {
    return <SetupMessage title="MAP TOKEN REQUIRED">Add EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to `.env`, then restart the development build.</SetupMessage>;
  }

  return (
    <View style={styles.container}>
      <MapView style={StyleSheet.absoluteFill} styleURL={Mapbox.StyleURL.Dark} logoEnabled={false} scaleBarEnabled={false}>
        <Camera centerCoordinate={[-6.16, 53.23]} zoomLevel={9.4} />
        <TerritoryLayer territories={game.territories} state={game.territoryState} selectedId={game.selectedTerritoryId} onSelect={game.selectTerritory} />
        {game.frontline ? <FrontlineLayer geometry={game.frontline.geometry} deployed={game.frontline.deployedArmyId === game.army.id} /> : null}
      </MapView>
      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <Text style={styles.title}>WORLDFRONT</Text>
        {game.territories.length === 0 ? (
          <View style={styles.dataNotice}><Text style={styles.noticeTitle}>IRELAND DATA REQUIRED</Text><Text style={styles.noticeBody}>Add the authoritative council GeoJSON described in src/data/ireland/README.md.</Text></View>
        ) : selected ? <TerritoryCard territory={selected} frontline={game.frontline} army={game.army} onDeploy={game.deployArmy} /> : <View />}
      </SafeAreaView>
    </View>
  );
}

function SetupMessage({ title, children }: { title: string; children: string }) {
  return <SafeAreaView style={styles.setup}><Text style={styles.noticeTitle}>{title}</Text><Text style={styles.noticeBody}>{children}</Text></SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111114" },
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, justifyContent: "space-between" },
  title: { alignSelf: "flex-start", margin: 16, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, overflow: "hidden", color: "#FFFFFF", backgroundColor: "rgba(20,18,24,0.9)", fontSize: 13, fontWeight: "800", letterSpacing: 1.4 },
  setup: { flex: 1, justifyContent: "center", padding: 32, backgroundColor: "#111114" },
  dataNotice: { margin: 14, padding: 18, borderRadius: 18, backgroundColor: "rgba(20,18,24,0.96)" },
  noticeTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "800", letterSpacing: 0.7 },
  noticeBody: { marginTop: 8, color: "#BAB5C0", fontSize: 14, lineHeight: 21 },
});
