import type { Coordinates } from "../models/game";

// High-frequency map animation positions are intentionally kept outside Zustand:
// writing on every frame would restart route effects and cause render loops.
const positions = new Map<string, { position: Coordinates; updatedAt: number }>();
const STORAGE_KEY = "worldfront-live-taxi-positions-v1";
let restored = false;
const restore = () => {
  if (restored || typeof window === "undefined") return;
  restored = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, { position: Coordinates; updatedAt: number }>;
    for (const [id, item] of Object.entries(data)) {
      if (Array.isArray(item?.position) && item.position.length === 2 &&
          item.position.every(Number.isFinite) && Number.isFinite(item.updatedAt) &&
          Date.now() - item.updatedAt < 24 * 60 * 60_000) positions.set(id, item);
    }
  } catch { /* Corrupt cache must never prevent game startup. */ }
};
export const recordTaxiPosition = (id: string, position: Coordinates) => {
  restore();
  if (!position.every(Number.isFinite)) return;
  positions.set(id, { position, updatedAt: Date.now() });
};
export const taxiPosition = (id: string, since?: number): Coordinates | undefined => {
  restore();
  const value = positions.get(id);
  return value && (!since || value.updatedAt >= since) ? value.position : undefined;
};
export const persistTaxiPositions = () => {
  restore();
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(positions))); }
  catch { /* Private browsing/quota failures are nonfatal. */ }
};
export const snapshotTaxiPositions = <T extends { id: string; type: string; position?: Coordinates }>(vehicles: T[]): T[] => {
  restore();
  return vehicles.map(vehicle => vehicle.type === "taxi" && positions.has(vehicle.id)
    ? { ...vehicle, position: positions.get(vehicle.id)!.position } : vehicle);
};
