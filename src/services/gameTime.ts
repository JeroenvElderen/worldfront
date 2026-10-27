// Calendar speed is independent of taxi animation and real-time job deadlines.
// Persist a time anchor so changing speed never jumps the displayed date.
export type GameSpeed = 1 | 2 | 5 | 10;
const STORAGE_KEY = "worldfront-calendar-speed-v1";
type ClockSettings = { speed: GameSpeed; realAnchor: number; gameAnchor: number };
let cached: ClockSettings | null = null;
const readSettings = (): ClockSettings => {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ClockSettings;
      if ([1, 2, 5, 10].includes(parsed.speed) && Number.isFinite(parsed.realAnchor) && Number.isFinite(parsed.gameAnchor)) {
        cached = parsed;
        return parsed;
      }
    }
  } catch { /* local storage unavailable */ }
  cached = { speed: 1, realAnchor: Date.now(), gameAnchor: Date.now() };
  return cached;
};
export const getGameSpeed = (): GameSpeed => readSettings().speed;
export const setGameSpeed = (speed: GameSpeed) => {
  const current = readSettings();
  const now = Date.now();
  const gameNow = current.gameAnchor + (now - current.realAnchor) * current.speed;
  cached = { speed, realAnchor: now, gameAnchor: gameNow };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cached)); } catch { /* offline fallback */ }
  window.dispatchEvent(new Event("worldfront-game-speed-change"));
};
export const gameDateAt = (foundedAt: string, realNow = Date.now()) => {
  const settings = readSettings();
  const founded = new Date(foundedAt).getTime();
  // Keep the original founding date as the calendar origin; advance at the
  // selected speed from a stable anchor, without resetting on speed changes.
  const realStart = Number.isFinite(founded) ? founded : realNow;
  const offset = settings.gameAnchor - settings.realAnchor;
  const gameElapsed = Math.max(0, settings.gameAnchor - realStart + (realNow - settings.realAnchor) * settings.speed - offset);
  return new Date(realStart + gameElapsed);
};
export const nextMonthlyPaymentAt = (foundedAt: string, realNow = Date.now()) => {
  const gameNow = gameDateAt(foundedAt, realNow);
  const next = new Date(gameNow);
  next.setUTCDate(1);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return new Date(realNow + (next.getTime() - gameNow.getTime()) / getGameSpeed()).toISOString();
};
