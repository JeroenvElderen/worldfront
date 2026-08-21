export const BASE_JOB_DISTANCE_KM = 20
export const JOB_DISTANCE_PER_LEVEL_KM = 20
export const REPUTATION_PER_LEVEL = 50

/** Reputation is awarded in tenths; normalize additions to avoid float artifacts. */
export const addReputation = (reputation: number, amount: number) =>
  Math.max(0, Math.round((reputation + amount) * 10) / 10)

/** Every level has the same clear reputation target. */
export const reputationForLevel = (level: number) => {
  const completedLevels = Math.max(0, Math.floor(level) - 1)
  return completedLevels * REPUTATION_PER_LEVEL
}

export const levelForReputation = (reputation: number) =>
  Math.floor(Math.max(0, reputation) / REPUTATION_PER_LEVEL) + 1

export const maxJobDistanceForLevel = (level: number) =>
  BASE_JOB_DISTANCE_KM + (Math.max(1, Math.floor(level)) - 1) * JOB_DISTANCE_PER_LEVEL_KM

/** Keep the first jobs manageable while the player only has a starter-sized fleet. */
export const maxJobDistanceForFleet = (level: number, vehicleCount: number) => {
  const levelLimit = maxJobDistanceForLevel(level)
  if (levelLimit > BASE_JOB_DISTANCE_KM) return levelLimit
  return Math.min(levelLimit, 10 + Math.max(0, Math.floor(vehicleCount) - 1) * 5)
}

export const progressionForReputation = (reputation: number) => {
  const level = levelForReputation(reputation)
  const currentLevelReputation = reputationForLevel(level)
  const nextLevelReputation = reputationForLevel(level + 1)
  return {
    level,
    current: Math.max(0, reputation - currentLevelReputation),
    required: nextLevelReputation - currentLevelReputation,
    maxJobDistanceKm: maxJobDistanceForLevel(level),
  }
}
