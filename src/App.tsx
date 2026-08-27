import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { BottomNav } from './components/game/BottomNav'
import { TopHud } from './components/game/TopHud'
import { useGameStore } from './stores/gameStore'
import { getJobJourney, jobOfferExpiresAt } from './services/jobEngine'
import { fleetSlotCapacity } from './services/companyProgression'
import { hasResearch } from './services/research'
import { getTaxiModel } from './data/taxis'
import { jobOfferCapacity } from './services/earlyGameEngine'
import { getCity } from './data/cities'
import { moneyFormatterForCity } from './services/localization'
import { CurrencyProvider } from './components/game/CurrencyContext'
import { GameMap } from './map/GameMap'

const JOB_REFRESH_INTERVAL_MS = 10_000

const CitySetup = lazy(() => import('./screens/CitySetup').then(({ CitySetup: component }) => ({ default: component })))
const TaxiCallPopup = lazy(() => import('./components/game/TaxiCallPopup').then(({ TaxiCallPopup: component }) => ({ default: component })))
const SectionSheet = lazy(() => import('./components/game/SectionSheet').then(({ SectionSheet: component }) => ({ default: component })))
const FinancialDashboard = lazy(() => import('./components/game/FinancialDashboard').then(({ FinancialDashboard: component }) => ({ default: component })))
const HotelDashboard = lazy(() => import('./components/game/HotelDashboard').then(({ HotelDashboard: component }) => ({ default: component })))

export default function App() {
  const game = useGameStore()
  const [placingStation, setPlacingStation] = useState(false)
  const [placingTerritory, setPlacingTerritory] = useState(false)
  const [showExpansionMenu, setShowExpansionMenu] = useState(false)
  const purchasedTerritories = (game.territoryExpansions ?? []).filter((area) => area.source !== 'taxi-discovery').length
  const territoryExpansionCost = 5_000 * purchasedTerritories
  const stationPackageCost = Math.round(15_000 * (game.specialization === 'mobility' ? .9 : 1) * (hasResearch(game.completedResearch ?? [], 'prefab-depots') ? .8 : 1)) + getTaxiModel('toyota-corolla').price
  const researchFleetSlots = (hasResearch(game.completedResearch ?? [], 'autonomous-operations') ? 4 : 0) + (hasResearch(game.completedResearch ?? [], 'global-network') ? 4 : 0) + (hasResearch(game.completedResearch ?? [], 'regional-hubs') ? game.branches.length : 0)
  const stationFleetFull = game.vehicles.length >= fleetSlotCapacity(game.company?.level ?? 1, game.garageLevel ?? 0, game.branches) + researchFleetSlots
  const activeCity = getCity(game.activeCityId ?? game.startingCityId, game.customCities ?? [])
  const money = moneyFormatterForCity(activeCity)
  const territoryExpansionPrice = territoryExpansionCost === 0 ? 'Free' : money.format(territoryExpansionCost)
  const territoryProgressMessage = 'Completed taxi journeys retrace their route and expand your territory border; villages unlock instantly.'
  const stationBuildMessage = !game.company || game.company.level < 2
    ? 'Building a separate station becomes available at level 2'
    : stationFleetFull
      ? 'Add fleet capacity before building another station'
      : game.company.cash < stationPackageCost
        ? `Save ${money.format(stationPackageCost)} to build another station`
        : 'Tap +, then place a station to unlock another territory'

  const buildStation = game.buildStation
  const expandTerritory = game.expandTerritory
  const handleBuildStation = useCallback((coordinates: Parameters<typeof buildStation>[0]) => {
    buildStation(coordinates)
    setPlacingStation(false)
  }, [buildStation])
  const handleExpandTerritory = useCallback((coordinates: Parameters<typeof expandTerritory>[0]) => {
    expandTerritory(coordinates)
    setPlacingTerritory(false)
  }, [expandTerritory])

  const { company, addRandomJob, pauseGame, resumeGame, tickJobs, automation, jobs, runAutomation, hasHydrated } = game

  const availableOfferCapacity = jobOfferCapacity(game.vehicles, game.drivers)

  const offeredJobCount = game.jobs.filter(
    (job) => job.status === 'offered',
  ).length

  /**
   * Keep the fleet-scaled job marketplace stocked while taxis are operational.
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
        void addRandomJob().then(() => useGameStore.getState().runAutomation())
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

  /** Pause native mobile games while the app is in the background. */
  useEffect(() => {
    if (!company || !game.hasHydrated) return

    const handleVisibilityChange = () => {
      if (Capacitor.isNativePlatform() && document.visibilityState === 'hidden') {
        pauseGame()
        return
      }

      if (document.visibilityState === 'hidden') return

      // Clear the persisted pause marker, then settle every deadline that
      // elapsed while the native WebView was suspended.
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
  }, [company, game.hasHydrated, pauseGame, resumeGame, tickJobs])

  /**
   * Refresh the foreground marketplace every minute. Re-running these
   * idempotent actions removes expired offers, settles overdue journeys, and
   * fills every available offer slot so staffed taxis always have work waiting.
   * The same pass also makes lifecycle recovery self-healing when a mobile
   * WebView misses a timer while Android restores the activity.
   */
  useEffect(() => {
    if (!company || !game.hasHydrated) return

    const recover = () => {
      if (document.visibilityState === 'hidden') return
      tickJobs()
      void useGameStore.getState().addRandomJob().then(() => useGameStore.getState().runAutomation())
    }

    recover()
    const interval = window.setInterval(recover, JOB_REFRESH_INTERVAL_MS)
    window.addEventListener('online', recover)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', recover)
    }
  }, [company, game.hasHydrated, tickJobs])

  /** Let a hired branch manager dispatch qualifying calls for larger fleets. */
  useEffect(() => {
    if (!automation?.enabled || !company || !hasHydrated) return
    runAutomation()
  }, [company, automation, hasHydrated, jobs, runAutomation])

  if (!game.hasHydrated) {
    return (
      <div className="loading">
        TRAVEL EMPIRE
      </div>
    )
  }

  return (
    <CurrencyProvider city={activeCity}>
    <div className="game-shell">
      <GameMap
        cityId={game.activeCityId ?? game.startingCityId}
        customCities={game.customCities ?? []}
        branches={game.branches ?? []}
        territoryExpansions={game.territoryExpansions ?? []}
        vehicles={game.vehicles}
        jobs={game.jobs}
        focusedJobId={game.focusedJobId}
        placingStation={placingStation}
        placingTerritory={placingTerritory}
        onBuildStation={handleBuildStation}
        onExpandTerritory={handleExpandTerritory}
        onOpenJob={game.openJob}
        onSaveJobPickupRoute={game.saveJobPickupRoute}
      />

      {game.company ? (
        <>
          <TopHud company={game.company} />

          {game.activeSection === 'map' && !placingStation && !placingTerritory && <><aside className="territory-guide" aria-live="polite"><b>Village borders unlocked: {game.branches.length + purchasedTerritories}</b><small>{territoryProgressMessage}</small></aside>{showExpansionMenu && <aside className="expansion-menu"><b>Expand your network</b><button disabled={game.company.cash < territoryExpansionCost} onClick={() => { setPlacingTerritory(true); setShowExpansionMenu(false) }}><span>◎</span><div><strong>Unlock village territory</strong><small>Choose a village border · {territoryExpansionPrice}</small></div></button><button disabled={game.company.level < 2 || game.company.cash < stationPackageCost || stationFleetFull} onClick={() => { setPlacingStation(true); setShowExpansionMenu(false) }} title={stationBuildMessage}><span>＋</span><div><strong>Build a station</strong><small>Start a separate service area · {money.format(stationPackageCost)}</small></div></button></aside>}<button className="station-add-button" onClick={() => setShowExpansionMenu((open) => !open)} aria-label="Territory expansion options" aria-expanded={showExpansionMenu}>＋</button></>}
          {placingStation && <aside className="depot-placement-banner"><span>⌖</span><div><b>Place Station {game.branches.length + 1}</b><small>Tap the map to build a station with one taxi for {money.format(stationPackageCost)}.</small></div><button onClick={() => setPlacingStation(false)}>Cancel</button></aside>}
          {placingTerritory && <aside className="depot-placement-banner"><span>◎</span><div><b>Unlock a village territory</b><small>Tap a village on the map to purchase its organic border for {territoryExpansionPrice.toLocaleLowerCase()}. No station will be built.</small></div><button onClick={() => setPlacingTerritory(false)}>Cancel</button></aside>}

          {game.worldCondition && game.worldCondition.weather !== 'clear' && (
            <aside className="weather-chip" title={game.worldCondition.description}>
              <span>{game.worldCondition.weather === 'rain' ? '🌧️' : game.worldCondition.weather === 'snow' ? '🌨️' : game.worldCondition.weather === 'storm' ? '⛈️' : '🌡️'}</span>
              <b>{game.worldCondition.temperatureC}° · {game.worldCondition.weather}</b>
              {game.worldCondition.disruption !== 'none' && <small>{game.worldCondition.disruption.replace('-', ' ')}</small>}
            </aside>
          )}

          <Suspense fallback={null}>{game.activeSection === 'jobs' && (
            <TaxiCallPopup
              focusedJobId={game.focusedJobId}
              vehicles={game.vehicles}
              jobs={game.jobs}
              passengers={game.passengers}
              drivers={game.drivers}
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
                countryLicenses={game.countryLicenses ?? []}
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
                onOpenFleet={() => game.setSection('fleet')}
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
          )}</Suspense>

          <BottomNav
            active={game.activeSection}
            onChange={game.setSection}
            availableJobCount={offeredJobCount}
          />
        </>
      ) : (
        <Suspense fallback={<div className="loading">LOADING WORLD</div>}><CitySetup
          onStart={game.initializeCompany}
        /></Suspense>
      )}
    </div>
    </CurrencyProvider>
  )
}
