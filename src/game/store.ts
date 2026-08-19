import { create } from "zustand";

import { irelandAdministrativeTerritories } from "@/data/ireland";
import { INITIAL_ARMY } from "@/game/armies";
import {
  BRAY_COORDINATE,
  findTerritoryContainingCoordinate,
  getBorderLengthKm,
  getNeighbouringTerritories,
  getSharedBorder,
} from "@/game/territories";
import type { Army, Frontline, MilitaryControl, TerritoryState } from "@/types/game";

const PLAYER_ID = "player";
const AI_IDS = ["ai-amber", "ai-teal", "ai-red"];
const territories = irelandAdministrativeTerritories;
const start = findTerritoryContainingCoordinate(territories, BRAY_COORDINATE);
const neighbours = start ? getNeighbouringTerritories(start, territories) : [];

const initialTerritoryState: Record<string, TerritoryState> = Object.fromEntries(
  territories.map((territory) => {
    const neighbourIndex = neighbours.findIndex(
      (item) => item.properties.id === territory.properties.id,
    );
    const controllerId = territory.properties.id === start?.properties.id
      ? PLAYER_ID
      : neighbourIndex >= 0
        ? AI_IDS[neighbourIndex % AI_IDS.length]
        : null;
    return [territory.properties.id, { ...territory.properties, controllerId, originalControllerId: controllerId }];
  }),
);

type GameStore = {
  territories: typeof territories;
  territoryState: Record<string, TerritoryState>;
  militaryControl: MilitaryControl[];
  selectedTerritoryId: string | null;
  frontline: Frontline | null;
  army: Army;
  selectTerritory: (id: string | null) => void;
  deployArmy: () => void;
};

export const useGameStore = create<GameStore>((set, get) => ({
  territories,
  territoryState: initialTerritoryState,
  // This initially mirrors ownership conceptually; official geometry is never mutated.
  militaryControl: territories.map((territory) => ({
    territoryId: territory.properties.id,
    geometry: territory.geometry,
    controllerId: initialTerritoryState[territory.properties.id]?.controllerId ?? null,
  })),
  selectedTerritoryId: null,
  frontline: null,
  army: INITIAL_ARMY,
  selectTerritory: (id) => {
    const state = get();
    const selected = state.territories.find((item) => item.properties.id === id);
    const player = state.territories.find(
      (item) => state.territoryState[item.properties.id]?.controllerId === PLAYER_ID,
    );
    const shared = selected && player && id !== player.properties.id
      ? getSharedBorder(player, selected)
      : null;
    const isEnemy = id ? state.territoryState[id]?.controllerId?.startsWith("ai-") : false;
    set({
      selectedTerritoryId: id,
      frontline: shared && isEnemy ? {
        id: `${player!.properties.id}:${selected!.properties.id}`,
        playerTerritoryId: player!.properties.id,
        opposingTerritoryId: selected!.properties.id,
        geometry: shared.geometry,
        lengthKm: getBorderLengthKm(shared),
        deployedArmyId: state.army.frontlineId === `${player!.properties.id}:${selected!.properties.id}`
          ? state.army.id
          : null,
      } : null,
    });
  },
  deployArmy: () => set((state) => {
    if (!state.frontline) return state;
    return {
      army: { ...state.army, frontlineId: state.frontline.id },
      frontline: { ...state.frontline, deployedArmyId: state.army.id },
    };
  }),
}));

export { PLAYER_ID };
