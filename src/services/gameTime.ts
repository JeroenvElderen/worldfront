// Run the calendar at 2x real time: one in-game minute passes every 30 seconds.
// This keeps days meaningful while ensuring the player does not have to wait a
// full real-world month for recurring payments and other calendar events.
export const REAL_MS_PER_GAME_MINUTE = 30_000

export const gameDateAt = (foundedAt: string, realNow = Date.now()) => {
  const realStart = new Date(foundedAt).getTime()
  const elapsedRealMs = Math.max(0, realNow - realStart)
  return new Date(realStart + elapsedRealMs * (60_000 / REAL_MS_PER_GAME_MINUTE))
}

export const nextMonthlyPaymentAt = (foundedAt: string, realNow = Date.now()) => {
  const gameNow = gameDateAt(foundedAt, realNow)
  const nextMonth = new Date(gameNow)
  nextMonth.setUTCDate(1)
  nextMonth.setUTCHours(0, 0, 0, 0)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)

  const remainingGameMs = nextMonth.getTime() - gameNow.getTime()
  return new Date(realNow + remainingGameMs * (REAL_MS_PER_GAME_MINUTE / 60_000)).toISOString()
}
