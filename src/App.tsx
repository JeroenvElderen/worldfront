import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { BottomNav } from './components/game/BottomNav'
import { SectionSheet } from './components/game/SectionSheet'
import { TopHud } from './components/game/TopHud'
import { TaxiCallPopup } from './components/game/TaxiCallPopup'
import { FinancialDashboard } from './components/game/FinancialDashboard'
import { GameMap } from './map/GameMap'
import { CitySetup } from './screens/CitySetup'
import { useGameStore } from './stores/gameStore'
import { getJobJourney, jobOfferExpiresAt } from './services/jobEngine'

export default function App() {
  const game = useGameStore()

  const { company, addRandomJob, pauseGame, resumeGame, tickJobs, automation, jobs, acceptJob, hasHydrated } = game

  const availableVehicleCount = game.vehicles.filter(
    (vehicle) => vehicle.type === 'taxi' && vehicle.status === 'available' && vehicle.driverId,
  ).length

  const offeredJobCount = game.jobs.filter(
    (job) => job.status === 'offered',
  ).length

  /**
   * Generate job offers when taxis are available.
   */
  useEffect(() => {
    if (!company || !game.hasHydrated) return

    const requestOfferForAvailableTaxi = () => {
      if (document.visibilityState === 'hidden') return

      const state = useGameStore.getState()

      const available = state.vehicles.filter(
        (vehicle) => vehicle.type === 'taxi' && vehicle.status === 'available' && vehicle.driverId,
      ).length

      const offered = state.jobs.filter(
        (job) => job.status === 'offered',
      ).length

      // Keep at most one open offer per available taxi.
      if (available > offered) {
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
    availableVehicleCount,
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
        vehicles={game.vehicles}
        jobs={game.jobs}
        focusedJobId={game.focusedJobId}
        onOpenJob={game.openJob}
      />

      {game.company ? (
        <>
          <TopHud company={game.company} />

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
                ownedCityIds={game.ownedCityIds ?? game.branches.map((branch) => branch.cityId)}
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
                automation={game.automation}
                cash={game.company.cash}
                onClose={() =>
                  game.setSection('map')
                }
                onReset={game.resetGame}
                onBuyTaxi={game.buyTaxi}
                onLeaseTaxi={game.leaseTaxi}
                onUpgradeGarage={game.upgradeGarage}
                onBuyPostVehicle={game.buyPostVehicle}
                onStartPostalRoute={game.startPostalRoute}
                onBuyRentalCar={game.buyRentalCar}
                onStartRental={game.startRental}
                onBuyCountryLicense={game.buyCountryLicense}
                onBuyCity={game.buyCity}
                onBuildDepot={game.buildDepot}
                onUpgradeDepotFacility={game.upgradeDepotFacility}
                onSwitchCity={game.switchCity}
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
