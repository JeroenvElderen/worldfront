import { useEffect } from 'react'
import { BottomNav } from './components/game/BottomNav'
import { SectionSheet } from './components/game/SectionSheet'
import { TopHud } from './components/game/TopHud'
import { TaxiCallPopup } from './components/game/TaxiCallPopup'
import { GameMap } from './map/GameMap'
import { CitySetup } from './screens/CitySetup'
import { useGameStore } from './stores/gameStore'
import { getJobJourney, JOB_REQUEST_INTERVAL_MS } from './services/jobEngine'

export default function App() {
  const game = useGameStore()
  const { company, refreshJobs, addRandomJob, tickJobs } = game
  useEffect(() => {
    if (!company) return
    // Hydrated saves with no offers should not wait for the first interval.
    const savedJobs = useGameStore.getState().jobs
    if (!savedJobs.some((job) => job.status === 'offered' || job.status === 'accepted')) refreshJobs()
    let timeout: number | undefined
    const scheduleOffer = () => {
      window.clearTimeout(timeout)
      if (document.visibilityState !== 'hidden') timeout = window.setTimeout(async () => {
        await addRandomJob()
        scheduleOffer()
      }, JOB_REQUEST_INTERVAL_MS)
    }
    const resumeOffers = () => {
      if (document.visibilityState === 'visible') scheduleOffer()
      else window.clearTimeout(timeout)
    }
    scheduleOffer()
    document.addEventListener('visibilitychange', resumeOffers)
    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('visibilitychange', resumeOffers)
    }
  }, [company, refreshJobs, addRandomJob])
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
    <GameMap cityId={game.startingCityId} vehicles={game.vehicles} jobs={game.jobs} onOpenJob={game.openJob} />
    {game.company ? <>
      <TopHud company={game.company} />
      {game.activeSection === 'map' && <TaxiCallPopup focusedJobId={game.focusedJobId} vehicles={game.vehicles} jobs={game.jobs} passengers={game.passengers} onAccept={game.acceptJob} onDecline={game.declineJob} />}
      {game.activeSection !== 'map' && <SectionSheet section={game.activeSection} vehicles={game.vehicles} cash={game.company.cash} onClose={() => game.setSection('map')} onReset={game.resetGame} onBuyTaxi={game.buyTaxi} onToggleAccessory={game.toggleExteriorAccessory} />}
      <BottomNav active={game.activeSection} onChange={game.setSection} />
    </> : <CitySetup onStart={game.initializeCompany} />}
  </div>
}
