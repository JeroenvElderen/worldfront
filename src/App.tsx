import { useEffect, useState } from 'react'
import { BottomNav } from './components/game/BottomNav'
import { SectionSheet } from './components/game/SectionSheet'
import { TopHud } from './components/game/TopHud'
import { TaxiCallPopup } from './components/game/TaxiCallPopup'
import { FinancialDashboard } from './components/game/FinancialDashboard'
import { HotelDashboard } from './components/game/HotelDashboard'
import { GameMap } from './map/GameMap'
import { CitySetup } from './screens/CitySetup'
import { useGameStore } from './stores/gameStore'
import { getJobJourney, jobOfferExpiresAt } from './services/jobEngine'
import { fleetSlotCapacity, maxJobDistanceForFleet } from './services/companyProgression'
import { hasResearch } from './services/research'
import { getTaxiModel } from './data/taxis'
import { jobOfferCapacity } from './services/earlyGameEngine'
import { getCity } from './data/cities'
import type { DemandHotspot } from './models/game'
import { getDemandHotspots } from './services/jobOfferService'

export default function App() {
  const game = useGameStore()
  const [placingStation, setPlacingStation] = useState(false)
  const [demandHotspots, setDemandHotspots] = useState<DemandHotspot[]>([])
  const [showDemand, setShowDemand] = useState(true)
  const taxiCount = game.vehicles.filter((vehicle) => vehicle.type === 'taxi').length
  const serviceRadiusKm = maxJobDistanceForFleet(game.company?.level ?? 1, taxiCount) * (hasResearch(game.completedResearch ?? [], 'predictive-demand') ? 1.25 : 1)
  const stationPackageCost = Math.round(15_000 * (game.specialization === 'mobility' ? .9 : 1) * (hasResearch(game.completedResearch ?? [], 'prefab-depots') ? .8 : 1)) + getTaxiModel('toyota-corolla').price
  const researchFleetSlots = (hasResearch(game.completedResearch ?? [], 'autonomous-operations') ? 4 : 0) + (hasResearch(game.completedResearch ?? [], 'global-network') ? 4 : 0) + (hasResearch(game.completedResearch ?? [], 'regional-hubs') ? game.branches.length : 0)
  const stationFleetFull = game.vehicles.length >= fleetSlotCapacity(game.company?.level ?? 1, game.garageLevel ?? 0, game.branches) + researchFleetSlots

  const { company, addRandomJob, resumeGame, tickJobs, automation, jobs, acceptJob, hasHydrated } = game

  const availableOfferCapacity = jobOfferCapacity(game.vehicles, game.drivers)

  const offeredJobCount = game.jobs.filter(
    (job) => job.status === 'offered',
  ).length

  /** Refresh demand once per accelerated game hour and whenever the active city changes. */
  useEffect(() => {
    const foundedAt = company?.foundedAt
    if (!foundedAt || !game.hasHydrated) return
    const city = getCity(game.activeCityId ?? game.startingCityId, game.customCities)
    if (!city) return
    const controller = new AbortController()
    const refresh = () => {
      void getDemandHotspots(city, serviceRadiusKm, foundedAt, controller.signal)
        .then(setDemandHotspots)
        .catch((error: unknown) => { if ((error as Error).name !== 'AbortError') setDemandHotspots([]) })
    }
    refresh()
    const interval = window.setInterval(refresh, 60_000)
    return () => { controller.abort(); window.clearInterval(interval) }
  }, [company?.foundedAt, game.activeCityId, game.startingCityId, game.customCities, game.hasHydrated, serviceRadiusKm])

  /**
   * Generate job offers when taxis are available.
   */
  useEffect(() => {
    if (!company || !game.hasHydrated) return

    const requestOfferForAvailableTaxi = () => {
      if (document.visibilityState === 'hidden') return

      const state = useGameStore.getState()

      const availableOffers = jobOfferCapacity(state.vehicles, state.drivers)

      const offered = state.jobs.filter(
        (job) => job.status === 'offered',
      ).length

      // Smart roof signs attract an additional request for their taxi.
      if (availableOffers > offered) {
        void addRandomJob()
      }
    }

    requestOfferForAvailableTaxi()

    document.addEventListener(
      'visibilitychange',
      requestOfferForAvailableTaxi,
    )

    return () => {
      document.removeEventListener(
        'visibilitychange',
        requestOfferForAvailableTaxi,
      )
    }
  }, [
    company,
    availableOfferCapacity,
    offeredJobCount,
    addRandomJob,
    game.hasHydrated,
  ])

  /**
   * Schedule tickJobs for the next game event.
   *
   * IMPORTANT:
   * Do not call tickJobs() directly at the beginning of this effect.
   * tickJobs modifies jobs/vehicles/etc, which are dependencies of this
   * effect and caused the Maximum update depth exceeded loop.
   */
  useEffect(() => {
    if (!company || !game.hasHydrated) return

    const state = useGameStore.getState()

    const nextJobEvent = state.jobs
      .filter(
        (job) =>
          job.status === 'accepted' ||
          job.status === 'offered',
      )
      .map((job) => {
        if (job.status === 'offered') {
          return jobOfferExpiresAt(job)
        }

        const vehicle = state.vehicles.find(
          (candidate) =>
            candidate.id === job.assignedVehicleId,
        )

        return vehicle
          ? getJobJourney(job, vehicle).arrivesAt
          : Number.POSITIVE_INFINITY
      })
      .concat(
        state.vehicles.flatMap((vehicle) =>
          vehicle.postalRoute
            ? [new Date(vehicle.postalRoute.arrivesAt).getTime()]
            : vehicle.serviceTrip
            ? [
                new Date(
                  vehicle.serviceTrip.arrivesAt,
                ).getTime(),
              ]
            : vehicle.scheduledJourney
            ? [new Date(vehicle.scheduledJourney.arrivesAt).getTime()]
            : vehicle.rentalJourney
            ? [new Date(vehicle.rentalJourney.arrivesAt).getTime()]
            : [],
        ),
      )
      .concat(
        (state.transportAssets ?? []).flatMap((asset) => asset.journey ? [new Date(asset.journey.arrivesAt).getTime()] : []),
      )
      .concat(
        state.activeEvent
          ? [
              new Date(
                state.activeEvent.expiresAt,
              ).getTime(),
            ]
          : [new Date(state.nextEventAt).getTime()],
      )
      .concat([
        new Date(
          state.nextOperatingPaymentAt,
        ).getTime(),

        ...(state.loans ?? []).map((loan) =>
          new Date(loan.nextPaymentAt).getTime(),
        ),
        ...state.drivers.flatMap((driver) => driver.missedShiftUntil ? [new Date(driver.missedShiftUntil).getTime()] : []),
      ])
      .reduce(
        (soonest, event) =>
          Math.min(soonest, event),
        Number.POSITIVE_INFINITY,
      )

    if (!Number.isFinite(nextJobEvent)) return

    const delay =
      Math.max(0, nextJobEvent - Date.now()) + 50

    const timeout = window.setTimeout(() => {
      tickJobs()
    }, delay)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [
    company,
    game.jobs,
    game.vehicles,
    game.transportAssets,
    game.activeEvent,
    game.nextEventAt,
    game.nextOperatingPaymentAt,
    game.loans,
    game.drivers,
    game.hasHydrated,
    tickJobs,
  ])

  /**
   * Settle wall-clock deadlines whenever the app returns to the foreground.
   *
   * Mobile operating systems suspend WebView timers in the background, so the
   * simulation cannot depend on an interval continuing to fire. Game journeys
   * use absolute timestamps instead: on resume, one tick catches up everything
   * that elapsed while the app was suspended or closed.
   */
  useEffect(() => {
    if (!company || !game.hasHydrated) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') return

      // Clear pause markers left by older saves, then settle every deadline
      // that elapsed while the native WebView was suspended.
      resumeGame()
      tickJobs()
    }

    // A force-closed WebView starts visible. Resume a persisted pause as soon
    // as its save hydrates rather than waiting for a lifecycle event.
    handleVisibilityChange()

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    window.addEventListener(
      'pageshow',
      handleVisibilityChange,
    )

    window.addEventListener(
      'focus',
      handleVisibilityChange,
    )

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )

      window.removeEventListener(
        'pageshow',
        handleVisibilityChange,
      )

      window.removeEventListener(
        'focus',
        handleVisibilityChange,
      )
    }
  }, [company, game.hasHydrated, resumeGame, tickJobs])

  /**
   * A small foreground watchdog makes lifecycle recovery self-healing. Mobile
   * WebViews can occasionally miss a timer or visibility event while Android
   * restores the activity; re-running these idempotent actions repairs overdue
   * journeys and replenishes offers without requiring a restart.
   */
  useEffect(() => {
    if (!company || !game.hasHydrated) return

    const recover = () => {
      if (document.visibilityState === 'hidden') return
      tickJobs()
      void useGameStore.getState().addRandomJob()
    }

    recover()
    const interval = window.setInterval(recover, 15_000)
    window.addEventListener('online', recover)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', recover)
    }
  }, [company, game.hasHydrated, tickJobs])

  /** Let a hired branch manager dispatch qualifying calls for larger fleets. */
  useEffect(() => {
    if (!automation?.enabled || !company || !hasHydrated) return
    const offer = jobs.find((job) => job.status === 'offered' && job.fare >= automation.minFare)
    if (offer) acceptJob(offer.id)
  }, [company, automation, hasHydrated, jobs, acceptJob])

  if (!game.hasHydrated) {
    return (
      <div className="loading">
        TRAVEL EMPIRE
      </div>
    )
  }

  return (
    <div className="game-shell">
      <GameMap
        cityId={game.activeCityId ?? game.startingCityId}
        customCities={game.customCities ?? []}
        branches={game.branches ?? []}
        serviceRadiusKm={serviceRadiusKm}
        vehicles={game.vehicles}
        jobs={game.jobs}
        demandHotspots={showDemand ? demandHotspots : []}
        focusedJobId={game.focusedJobId}
        placingStation={placingStation}
        onBuildStation={(coordinates) => { game.buildStation(coordinates); setPlacingStation(false) }}
        onOpenJob={game.openJob}
      />

      {game.company ? (
        <>
          <TopHud company={game.company} />

          {game.activeSection === 'map' && <button className={`demand-toggle ${showDemand ? 'active' : ''}`} onClick={() => setShowDemand((visible) => !visible)} aria-pressed={showDemand}>
            <span>◉</span><b>DEMAND</b><small>{showDemand ? `${demandHotspots.filter((hotspot) => hotspot.level === 'surging' || hotspot.level === 'busy').length} hotspots` : 'hidden'}</small>
          </button>}

          {game.activeSection === 'map' && !placingStation && <button className="station-add-button" disabled={game.company.level < 2 || game.company.cash < stationPackageCost || stationFleetFull} onClick={() => setPlacingStation(true)} aria-label="Build next station">＋</button>}
          {placingStation && <aside className="depot-placement-banner"><span>⌖</span><div><b>Place Station {game.branches.length + 1}</b><small>Tap the map to build a station with one taxi for {new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stationPackageCost)}.</small></div><button onClick={() => setPlacingStation(false)}>Cancel</button></aside>}

          {game.activeEvent && (
            <aside className="event-banner">
              <b>
                ⚡ {game.activeEvent.name}
              </b>

              <span>
                {game.activeEvent.description}
                {' · '}
                Fares ×
                {game.activeEvent.fareMultiplier.toFixed(2)}
              </span>
            </aside>
          )}
          {game.worldCondition && game.worldCondition.weather !== 'clear' && (
            <aside className="weather-chip" title={game.worldCondition.description}>
              <span>{game.worldCondition.weather === 'rain' ? '🌧️' : game.worldCondition.weather === 'snow' ? '🌨️' : game.worldCondition.weather === 'storm' ? '⛈️' : '🌡️'}</span>
              <b>{game.worldCondition.temperatureC}° · {game.worldCondition.weather}</b>
              {game.worldCondition.disruption !== 'none' && <small>{game.worldCondition.disruption.replace('-', ' ')}</small>}
            </aside>
          )}

          {game.activeSection === 'jobs' && (
            <TaxiCallPopup
              focusedJobId={game.focusedJobId}
              vehicles={game.vehicles}
              jobs={game.jobs}
              passengers={game.passengers}
              onAccept={game.acceptJob}
              onDecline={game.declineJob}
              onViewMap={game.showJobOnMap}
              onClose={() =>
                game.setSection('map')
              }
            />
          )}

          {game.activeSection !== 'map' &&
            game.activeSection !== 'jobs' &&
            game.activeSection !== 'hotels' &&
            game.activeSection !== 'finance' && (
              <SectionSheet
                section={game.activeSection}
                vehicles={game.vehicles}
                garageLevel={game.garageLevel ?? 0}
                drivers={game.drivers}
                driverCandidates={game.driverCandidates}
                goals={game.goals}
                jobs={game.jobs}
                loans={game.loans}
                company={game.company}
                activeCityId={game.activeCityId ?? game.startingCityId!}
                branches={game.branches ?? []}
                customCities={game.customCities ?? []}
                agencies={game.agencies ?? []}
                tours={game.tours ?? []}
                coachRoutes={game.coachRoutes ?? []}
                countryLicenses={game.countryLicenses ?? ['IE']}
                transportAssets={game.transportAssets ?? []}
                transportRoutes={game.transportRoutes ?? []}
                contracts={game.contracts ?? []}
                specialization={game.specialization}
                completedResearch={game.completedResearch ?? []}
                automation={game.automation}
                cash={game.company.cash}
                onClose={() =>
                  game.setSection('map')
                }
                onReset={game.resetGame}
                onBuyTaxi={game.buyTaxi}
                onLeaseTaxi={game.leaseTaxi}
                onFinanceTaxi={game.financeTaxi}
                onUpgradeGarage={game.upgradeGarage}
                onBuyPostVehicle={game.buyPostVehicle}
                onStartPostalRoute={game.startPostalRoute}
                onBuyRentalCar={game.buyRentalCar}
                onStartRental={game.startRental}
                onBuyCountryLicense={game.buyCountryLicense}
                onBuildStation={() => { game.setSection('map'); setPlacingStation(true) }}
                onSwitchStation={game.switchStation}
                onUnlockResearch={game.unlockResearch}
                onUpgradeDepotFacility={game.upgradeDepotFacility}
                onOpenAgency={game.openAgency}
                onCreateTour={game.createTour}
                onDispatchTour={game.dispatchTour}
                onBuyTourBus={game.buyTourBus}
                onBuyCoach={game.buyCoach}
                onCreateCoachRoute={game.createCoachRoute}
                onDispatchCoach={game.dispatchCoach}
                onBuyTransportAsset={game.buyTransportAsset}
                onCreateTransportRoute={game.createTransportRoute}
                onDispatchTransport={game.dispatchTransport}
                onSetAutomation={game.setAutomation}
                onAcceptContract={game.acceptContract}
                onChooseSpecialization={game.chooseSpecialization}
                onTakeLoan={game.takeLoan}
                onSellVehicle={game.sellVehicle}
                onSetDriverShift={
                  game.setDriverShift
                }
                onHireDriver={game.hireDriver}
                onRefreshCandidates={game.refreshDriverCandidates}
                onServiceVehicle={game.serviceVehicle}
                onInstallUpgrade={game.installUpgrade}
                onSetRefuelStrategy={game.setRefuelStrategy}
                onRefuelVehicle={game.refuelVehicle}
                onClaimGoal={game.claimGoal}
                onToggleAccessory={
                  game.toggleExteriorAccessory
                }
                competitors={game.competitors ?? []}
                difficulty={game.difficulty}
                worldCondition={game.worldCondition}
                incidents={game.incidents ?? []}
                brandStrategy={game.brandStrategy}
                onSetDifficulty={game.setDifficulty}
                onSetBrandStrategy={game.setBrandStrategy}
                onLaunchMarketing={game.launchMarketing}
                onPartnerCompetitor={game.partnerCompetitor}
                onAcquireCompetitor={game.acquireCompetitor}
                onTrainDriver={game.trainDriver}
                onResolveIncident={game.resolveIncident}
                onSetRouteTimetable={game.setRouteTimetable}
              />
            )}

          {game.activeSection === 'finance' && (
            <FinancialDashboard
              cash={game.company.cash}
              debt={game.loans.reduce((sum, loan) => sum + loan.balance, 0)}
              transactions={game.financialTransactions ?? []}
              vehicles={game.vehicles}
              onClose={() => game.setSection('map')}
            />
          )}

          {game.activeSection === 'hotels' && (
            <HotelDashboard
              company={game.company}
              activeCityId={game.activeCityId ?? game.startingCityId!}
              customCities={game.customCities ?? []}
              hotels={game.hotels ?? []}
              economies={game.cityEconomies ?? []}
              onBuy={game.buyHotel}
              onUpgrade={game.upgradeHotel}
              onCollect={game.collectHotelRevenue}
              onClose={() => game.setSection('map')}
            />
          )}

          <BottomNav
            active={game.activeSection}
            onChange={game.setSection}
            availableJobCount={offeredJobCount}
          />
        </>
      ) : (
        <CitySetup
          onStart={game.initializeCompany}
        />
      )}
    </div>
  )
}
