import { useEffect } from 'react'
import { BottomNav } from './components/game/BottomNav'
import { SectionSheet } from './components/game/SectionSheet'
import { TopHud } from './components/game/TopHud'
import { MapErrorBoundary } from './components/game/MapErrorBoundary'
import { GameMap } from './map/GameMap'
import { CitySetup } from './screens/CitySetup'
import { useGameStore } from './stores/gameStore'
import { getJobJourney } from './services/jobEngine'

export default function App() {
  const game = useGameStore()
  const { company, addRandomJob, pruneUnreachableJobs, tickJobs } = game
  const availableVehicleCount = game.vehicles.filter((vehicle) => vehicle.status === 'available').length
  const offeredJobCount = game.jobs.filter((job) => job.status === 'offered').length
  useEffect(() => pruneUnreachableJobs(), [company, availableVehicleCount, offeredJobCount, pruneUnreachableJobs])
  useEffect(() => {
    if (!company) return
    const requestOfferForAvailableTaxi = () => {
      if (document.visibilityState === 'hidden') return
      const state = useGameStore.getState()
      const available = state.vehicles.filter((vehicle) => vehicle.status === 'available').length
      const offered = state.jobs.filter((job) => job.status === 'offered').length
      // Generate on demand instead of waking the app every 30 seconds. Keeping
      // at most one open offer per idle taxi prevents useless route requests.
      if (available > offered) void addRandomJob()
    }
    requestOfferForAvailableTaxi()
    document.addEventListener('visibilitychange', requestOfferForAvailableTaxi)
    return () => document.removeEventListener('visibilitychange', requestOfferForAvailableTaxi)
  }, [company, availableVehicleCount, offeredJobCount, addRandomJob])
  useEffect(() => {
    if (!company) return
    tickJobs()
    const state = useGameStore.getState()
    const nextArrival = state.jobs
      .filter((job) => job.status === 'accepted')
      .map((job) => {
        const vehicle = state.vehicles.find((candidate) => candidate.id === job.assignedVehicleId)
        return vehicle ? getJobJourney(job, vehicle).arrivesAt : Number.POSITIVE_INFINITY
      })
      .reduce((soonest, arrival) => Math.min(soonest, arrival), Number.POSITIVE_INFINITY)
    if (!Number.isFinite(nextArrival)) return
    const timeout = window.setTimeout(tickJobs, Math.max(0, nextArrival - Date.now()) + 50)
    return () => window.clearTimeout(timeout)
  }, [company, game.jobs, game.vehicles, tickJobs])
  useEffect(() => {
    if (!company) return
    const resumeGame = () => {
      if (document.visibilityState === 'hidden') return
      // Mobile WebViews suspend timers in the background. Settle overdue trips first
      // so their taxis are available before immediately requesting a new offer.
      tickJobs()
    }
    document.addEventListener('visibilitychange', resumeGame)
    window.addEventListener('pageshow', resumeGame)
    window.addEventListener('focus', resumeGame)
    return () => {
      document.removeEventListener('visibilitychange', resumeGame)
      window.removeEventListener('pageshow', resumeGame)
      window.removeEventListener('focus', resumeGame)
    }
  }, [company, tickJobs])
  if (!game.hasHydrated) return <div className="loading">TRAVEL EMPIRE</div>
  return <div className="game-shell">
    <MapErrorBoundary><GameMap cityId={game.startingCityId} vehicles={game.vehicles} jobs={game.jobs} onOpenJob={game.openJob} /></MapErrorBoundary>
    {game.company ? <>
      <TopHud company={game.company} />
      {game.activeSection !== 'map' && <SectionSheet section={game.activeSection} focusedJobId={game.focusedJobId} vehicles={game.vehicles} jobs={game.jobs} passengers={game.passengers} cash={game.company.cash} jobsLoading={game.jobsLoading} jobsError={game.jobsError} onClose={() => game.setSection('map')} onReset={game.resetGame} onRefreshJobs={game.refreshJobs} onAcceptJob={game.acceptJob} onDeclineJob={game.declineJob} onBuyTaxi={game.buyTaxi} onToggleAccessory={game.toggleExteriorAccessory} />}
      <BottomNav active={game.activeSection} onChange={game.setSection} />
    </> : <CitySetup onStart={game.initializeCompany} />}
  </div>
}
