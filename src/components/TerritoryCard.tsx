import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Army, Frontline, TerritoryState } from "@/types/game";

type Props = {
  territory: TerritoryState;
  frontline: Frontline | null;
  army: Army;
  onDeploy: () => void;
};

function controllerLabel(controllerId: string | null) {
  if (controllerId === "player") return "Player territory";
  if (controllerId?.startsWith("ai-")) return "AI territory";
  return "Neutral territory";
}

export function TerritoryCard({ territory, frontline, army, onDeploy }: Props) {
  const deployed = frontline?.deployedArmyId === army.id;
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{territory.name.toLocaleUpperCase()}</Text>
      <Text style={styles.status}>{controllerLabel(territory.controllerId)}</Text>
      {frontline ? (
        <>
          <Text style={styles.shared}>Shared border: {frontline.lengthKm.toFixed(1)} km</Text>
          <Text style={styles.army}>{army.name} · {army.troops.toLocaleString()} troops · {army.supplyPercent}% supply</Text>
          <Pressable disabled={deployed} onPress={onDeploy} style={[styles.button, deployed && styles.buttonDisabled]}>
            <Text style={styles.buttonText}>{deployed ? "DEPLOYED" : "DEPLOY TO BORDER"}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { margin: 14, padding: 18, borderRadius: 18, backgroundColor: "rgba(20,18,24,0.96)" },
  name: { color: "#FFFFFF", fontSize: 17, fontWeight: "800", letterSpacing: 0.6 },
  status: { marginTop: 4, color: "#BAB5C0", fontSize: 13 },
  shared: { marginTop: 14, color: "#E6E0EA", fontSize: 13 },
  army: { marginTop: 6, color: "#9F99A7", fontSize: 12 },
  button: { alignSelf: "flex-start", marginTop: 14, paddingHorizontal: 17, paddingVertical: 11, borderRadius: 10, backgroundColor: "#6F45A3" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.7 },
});

