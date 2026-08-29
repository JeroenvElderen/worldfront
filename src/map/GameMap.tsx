import { memo, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { featureCollection, lineString, point } from "@turf/helpers";
import { mapboxAccessToken } from "../config/mapbox";
import { getCity, worldOverview } from "../data/cities";
import { taxiModels } from "../data/taxis";
import type {
  Branch,
  Coordinates,
  FerryRouteOption,
  Hotel,
  PurchasedHarbour,
  TaxiFerryCrossing,
  TaxiJob,
  TerritoryExpansion,
  TerritoryFeature,
  TrafficIncident,
  TransportAsset,
  TransportRoute,
  Vehicle,
  VehicleIncident,
} from "../models/game";
import {
  distanceKmBetween,
  getJobMotionJourney,
  getJobMotionTime,
  jobDestination,
  jobPickup,
} from "../services/jobEngine";
import { postalRouteProgress } from "../services/postalEngine";
import { rentalJourneyProgress } from "../services/rentalEngine";
import {
  lockedTerritoryMask,
  mergeVillageTerritories,
  realVillageTerritory,
  villageTerritory,
  VILLAGE_TERRITORY_RADIUS_KM,
} from "../services/territoryGeometry";
import { cancelMapFrame, scheduleMapFrame } from "../services/frameScheduler";
import {
  resolveRoadRoute,
  type RoadRouteDetails,
  type RouteSpeedLimit,
} from "../services/roadRoutes";
import { activeFerryServiceForCrossing } from "../services/ferryService";

interface GameMapProps {
  layoutKey: string;
  cityId: string | null;
  customCities: import("../models/game").City[];
  branches: Branch[];
  hotels: Hotel[];
  territoryExpansions: TerritoryExpansion[];
  exploredTerritory: TerritoryFeature | null;
  vehicles: Vehicle[];
  jobs: TaxiJob[];
  transportAssets: TransportAsset[];
  transportRoutes: TransportRoute[];
  globalFerryRoutes: FerryRouteOption[];
  purchasedHarbours: PurchasedHarbour[];
  trafficIncidents: TrafficIncident[];
  vehicleIncidents: VehicleIncident[];
  focusedJobId: string | null;
  placingStation: boolean;
  placingTerritory: boolean;
  placingHotel: boolean;
  onBuildStation: (coordinates: Coordinates) => void;
  onExpandTerritory: (coordinates: Coordinates) => void;
  onBuildHotel: (coordinates: Coordinates) => void;
  onBuyHarbour: (route: FerryRouteOption) => void;
  onOpenJob: (jobId: string) => void;
  onSaveJobPickupRoute: (
    jobId: string,
    coordinates: Coordinates[],
    ferryCrossings: TaxiFerryCrossing[],
    durationMinutes: number,
  ) => void;
  onSaveJobRoute: (
    jobId: string,
    coordinates: Coordinates[],
    ferryCrossings: TaxiFerryCrossing[],
  ) => void;
  onJobFerryCrossingComplete: (
    jobId: string,
    leg: "pickup" | "passenger",
    crossingIndex: number,
    delayMs: number,
  ) => void;
  onTaxiArrived: (jobId: string) => void;
}
const token = mapboxAccessToken;
const fallbackStyle: mapboxgl.StyleSpecification = {
  version: 8,
  sources: {
    openStreetMap: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "openStreetMap", type: "raster", source: "openStreetMap" }],
};

const routeLengthCache = new WeakMap<number[][], number[]>();
const routeLengths = (coordinates: number[][]) => {
  const cached = routeLengthCache.get(coordinates);
  if (cached) return cached;
  const lengths = coordinates
    .slice(1)
    .map((coordinate, index) =>
      distanceKmBetween(
        coordinates[index] as Coordinates,
        coordinate as Coordinates,
      ),
    );
  routeLengthCache.set(coordinates, lengths);
  return lengths;
};

const routePosition = (
  coordinates: number[][],
  progress: number,
): Coordinates => {
  const lengths = routeLengths(coordinates);
  let target = progress * lengths.reduce((sum, length) => sum + length, 0);
  let segment = 0;
  while (segment < lengths.length - 1 && target > lengths[segment])
    target -= lengths[segment++];
  const start = coordinates[segment];
  const end = coordinates[segment + 1] ?? start;
  const amount = lengths[segment] ? target / lengths[segment] : 1;
  return [
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount,
  ];
};

const remainingRoute = (coordinates: number[][], progress: number) => {
  if (coordinates.length < 2) return coordinates;
  const lengths = routeLengths(coordinates);
  let target =
    Math.max(0, Math.min(1, progress)) *
    lengths.reduce((sum, length) => sum + length, 0);
  let segment = 0;
  while (segment < lengths.length - 1 && target > lengths[segment])
    target -= lengths[segment++];
  const remaining = [
    routePosition(coordinates, progress),
    ...coordinates.slice(segment + 1),
  ];
  // GeoJSON LineStrings require two coordinates. Repeating the destination
  // makes the line naturally disappear when the vehicle reaches it.
  return remaining.length > 1 ? remaining : [remaining[0], remaining[0]];
};

const hasDetailedRoute = (
  coordinates: number[][] | undefined,
): coordinates is number[][] => Boolean(coordinates && coordinates.length > 2);

const passengerRouteNeedsRepair = (job: TaxiJob) =>
  !job.routeCoordinates ||
  job.routeCoordinates.length < 2 ||
  job.ferryCrossings === undefined ||
  (!job.routeResolved && !hasDetailedRoute(job.routeCoordinates));

// Keep moving markers synchronized with the browser's paint cycle. Calculating
// their position from the current time (rather than accumulating frame deltas)
// also lets a journey resume at the exact right point after a background pause.
type RouteDetails = Pick<
  RoadRouteDetails,
  "coordinates" | "speedLimits" | "ferryCrossings"
> & { durationMinutes?: number };

const speedLimitKmh = (limit: RouteSpeedLimit | undefined) => {
  if (!limit || "unknown" in limit || "none" in limit) return null;
  return Math.round(
    limit.unit === "mph" ? limit.speed * 1.609344 : limit.speed,
  );
};

const createRouteMotion = (
  route: RouteDetails,
  fallbackSpeedKmh: number,
  topSpeedKmh: number,
) => {
  const lengths = routeLengths(route.coordinates);
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  const cumulativeLengths = new Array<number>(lengths.length + 1).fill(0);
  for (let index = 0; index < lengths.length; index += 1) {
    cumulativeLengths[index + 1] = cumulativeLengths[index] + lengths[index];
  }
  const crossings = route.ferryCrossings
    .map((crossing, crossingIndex) => ({
      ...crossing,
      crossingIndex,
      startIndex: Math.max(0, Math.min(lengths.length, crossing.startIndex)),
      endIndex: Math.max(0, Math.min(lengths.length, crossing.endIndex)),
    }))
    .filter((crossing) => crossing.endIndex > crossing.startIndex)
    .sort((left, right) => left.startIndex - right.startIndex);
  const crossingByStart = new Map(
    crossings.map((crossing) => [crossing.startIndex, crossing]),
  );
  const phases: Array<{
    duration: number;
    fromDistance: number;
    toDistance: number;
    ferryState: "waiting" | "aboard" | null;
    ferryCrossingIndex: number | null;
  }> = [];
  let index = 0;
  while (index < lengths.length) {
    const crossing = crossingByStart.get(index);
    if (crossing) {
      // Vehicles remain at the terminal during the queue. Once boarded, their
      // marker moves with the ferry geometry until it reaches the far harbour.
      phases.push({
        duration: 4 / 60,
        fromDistance: cumulativeLengths[crossing.startIndex],
        toDistance: cumulativeLengths[crossing.startIndex],
        ferryState: "waiting",
        ferryCrossingIndex: crossing.crossingIndex,
      });
      phases.push({
        duration: Math.max(1, crossing.durationMinutes) / 60,
        fromDistance: cumulativeLengths[crossing.startIndex],
        toDistance: cumulativeLengths[crossing.endIndex],
        ferryState: "aboard",
        ferryCrossingIndex: crossing.crossingIndex,
      });
      index = crossing.endIndex;
      continue;
    }
    const speed = Math.min(
      topSpeedKmh,
      speedLimitKmh(route.speedLimits[index]) ?? fallbackSpeedKmh,
    );
    phases.push({
      duration: lengths[index] / Math.max(1, speed),
      fromDistance: cumulativeLengths[index],
      toDistance: cumulativeLengths[index + 1],
      ferryState: null,
      ferryCrossingIndex: null,
    });
    index += 1;
  }
  const totalDuration = phases.reduce((sum, phase) => sum + phase.duration, 0);
  const cumulativeDurations = new Array<number>(phases.length + 1).fill(0);
  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1)
    cumulativeDurations[phaseIndex + 1] =
      cumulativeDurations[phaseIndex] + phases[phaseIndex].duration;

  const ferryCrossingEndElapsed = new Map<number, number>();

  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
    const crossingIndex = phases[phaseIndex].ferryCrossingIndex;

    if (crossingIndex === null) continue;

    ferryCrossingEndElapsed.set(
      crossingIndex,
      totalDuration > 0
        ? cumulativeDurations[phaseIndex + 1] / totalDuration
        : 1,
    );
  }

  return (elapsed: number) => {
    if (elapsed >= 1 || !phases.length || !totalLength) {
      return {
        progress: 1,
        waitingForFerry: false,
        onFerry: false,
        ferryCrossingIndex: null,
        ferryCrossingEndElapsed: null,
      };
    }
    const target = Math.max(0, Math.min(1, elapsed)) * totalDuration;
    let low = 0;
    let high = Math.max(0, phases.length - 1);
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (cumulativeDurations[middle + 1] < target) low = middle + 1;
      else high = middle;
    }
    const phase = phases[low];
    const phaseElapsed = target - cumulativeDurations[low];
    const phaseProgress = phase.duration ? phaseElapsed / phase.duration : 1;
    return {
      progress:
        (phase.fromDistance +
          (phase.toDistance - phase.fromDistance) * phaseProgress) /
        totalLength,

      waitingForFerry: phase.ferryState === "waiting",

      onFerry: phase.ferryState === "aboard",

      ferryCrossingIndex: phase.ferryCrossingIndex,

      ferryCrossingEndElapsed:
        phase.ferryCrossingIndex === null
          ? null
          : (ferryCrossingEndElapsed.get(phase.ferryCrossingIndex) ?? null),
    };
  };
};

const resolveRoadRouteThrough = async (
  waypoints: Coordinates[],
  signal?: AbortSignal,
): Promise<RouteDetails | null> => {
  if (waypoints.length < 2) return null;
  const segments = await Promise.all(
    waypoints
      .slice(1)
      .map((destination, index) =>
        resolveRoadRoute(waypoints[index], destination, signal),
      ),
  );
  if (segments.some((segment) => !segment)) return null;

  const coordinates: Coordinates[] = [];
  const speedLimits: RouteSpeedLimit[] = [];
  const ferryCrossings: TaxiFerryCrossing[] = [];
  for (const segment of segments as RoadRouteDetails[]) {
    const offset = Math.max(0, coordinates.length - 1);
    coordinates.push(
      ...(coordinates.length
        ? segment.coordinates.slice(1)
        : segment.coordinates),
    );
    speedLimits.push(...segment.speedLimits);
    ferryCrossings.push(
      ...segment.ferryCrossings.map((crossing) => ({
        ...crossing,
        startIndex: crossing.startIndex + offset,
        endIndex: crossing.endIndex + offset,
      })),
    );
  }
  return { coordinates, speedLimits, ferryCrossings };
};

const vehicleColor = {
  available: "#8b5cf6",
  pickingUp: "#8b5cf6",
  carryingPassenger: "#8b5cf6",
  waitingForFerry: "#f59e0b",
  onFerry: "#38bdf8",
  maintenance: "#8b5cf6",
  postal: "#8b5cf6",
  rental: "#8b5cf6",
} as const;

const EXCLUSIVE_VEHICLE_COLOR = "#f5be48";
const mapVehicleColor = (vehicle: Vehicle, standardColor: string) =>
  vehicle.type === "taxi" &&
  taxiModels.some(
    (model) => model.id === vehicle.modelId && model.collection === "exclusive",
  )
    ? EXCLUSIVE_VEHICLE_COLOR
    : standardColor;

const VEHICLE_MARKER_RADIUS = 4;
const VEHICLE_MARKER_STROKE_WIDTH = 1.5;
const ROUTE_GLOW_WIDTH = 10;
const ROUTE_GEOMETRY_UPDATE_INTERVAL_MS = 500;

const ensureFerryWaitLabel = (instance: mapboxgl.Map, sourceId: string) => {
  const layerId = `${sourceId}-ferry-wait`;
  if (instance.getLayer(layerId)) return;
  instance.addLayer({
    id: layerId,
    type: "symbol",
    source: sourceId,
    layout: {
      "text-field": ["get", "ferryStatus"],
      "text-size": 10,
      "text-offset": [0, 1.35],
      "text-anchor": "top",
    },
    paint: {
      "text-color": "#fbbf24",
      "text-halo-color": "#111827",
      "text-halo-width": 2,
    },
  });
};

type RouteMotionState = ReturnType<ReturnType<typeof createRouteMotion>>;

const positionVehicleOnOwnedFerry = (
  key: string,
  route: RouteDetails,
  motion: RouteMotionState,
  transportRoutes: TransportRoute[],
  transportAssets: TransportAsset[],
  boarded: Set<string>,
  completed: Set<string>,
  now: number,
) => {
  let crossingIndex = motion.ferryCrossingIndex;
  if (crossingIndex === null) {
    const lengths = routeLengths(route.coordinates);
    const totalLength = lengths.reduce((sum, length) => sum + length, 0);
    crossingIndex = route.ferryCrossings.findIndex((crossing, index) => {
      const startDistance = lengths
        .slice(0, crossing.startIndex)
        .reduce((sum, length) => sum + length, 0);
      return (
        !completed.has(`${key}:${index}`) &&
        totalLength > 0 &&
        motion.progress >= startDistance / totalLength
      );
    });
    if (crossingIndex < 0) crossingIndex = null;
  }
  if (crossingIndex === null) return null;

  const crossing = route.ferryCrossings[crossingIndex];
  const crossingKey = `${key}:${crossingIndex}`;
  if (!crossing) return null;
  if (completed.has(crossingKey)) {
    return motion.ferryCrossingIndex === crossingIndex
      ? {
          position: crossing.disembarkAt,
          state: null,
          crossingIndex,
          completedNow: false,
        }
      : null;
  }
  const service = activeFerryServiceForCrossing(
    crossing,
    transportRoutes,
    transportAssets,
  );

  if (!service?.asset.journey || !service.route.routeCoordinates?.length) {
    return {
      position: crossing.boardAt,
      state: "waiting" as const,
      crossingIndex,
      completedNow: false,
    };
  }

  const waitingHarbour =
    service.direction === "returning"
      ? service.route.destinationCoordinates
      : service.route.originCoordinates;

  const waitingPosition = waitingHarbour ?? crossing.boardAt;

  const journeyDirection = service.asset.journey.direction ?? "outbound";
  const startedAt = new Date(service.asset.journey.startedAt).getTime();
  const arrivesAt = new Date(service.asset.journey.arrivesAt).getTime();

  const progress = Math.max(
    0,
    Math.min(1, (now - startedAt) / Math.max(1, arrivesAt - startedAt)),
  );

  const isBoarded = boarded.has(crossingKey);

  // Once the ferry reaches the opposite harbour, release the road vehicle there.
  if (isBoarded && now >= arrivesAt) {
    boarded.delete(crossingKey);
    completed.add(crossingKey);

    return {
      position: crossing.disembarkAt,
      state: null,
      crossingIndex,
      completedNow: true,
    };
  }

  // Do not allow a taxi/coach to board a ferry that is already halfway across.
  // It stays at the harbour until the correct ferry leg begins.
  if (!isBoarded) {
    if (journeyDirection !== service.direction || progress > 0.08) {
      return {
        position: waitingPosition,
        state: "waiting" as const,
        crossingIndex,
        completedNow: false,
      };
    }

    boarded.add(crossingKey);
  }

  // Use exactly the same geometry and direction as the ferry marker.
  const ferryCoordinates =
    journeyDirection === "returning"
      ? [...service.route.routeCoordinates].reverse()
      : service.route.routeCoordinates;

  // While aboard, put the road vehicle at the ferry's current position.
  const ferryPosition =
    ferryCoordinates.length >= 2
      ? routePosition(ferryCoordinates, progress)
      : waitingPosition;

  return {
    position: ferryPosition,
    state: "aboard" as const,
    crossingIndex,
    completedNow: false,
  };
};

const ferryCrossingsComplete = (
  key: string,
  route: RouteDetails,
  completed: Set<string>,
) => route.ferryCrossings.every((_, index) => completed.has(`${key}:${index}`));

const keepMapFlatAndBuildingFree = (instance: mapboxgl.Map) => {
  instance.getStyle().layers?.forEach((layer) => {
    const id = layer.id.toLowerCase();
    if (layer.type === "fill-extrusion" || id.includes("building")) {
      instance.setLayoutProperty(layer.id, "visibility", "none");
    }
  });
};
// A fleet index is not a stable identity: buying or selling another vehicle can
// change which vehicle an existing indexed source represents. Key map sources by
// the persisted vehicle id so dispatch always animates the vehicle assigned to
// the job, including taxis added after the map was created.
const vehicleSourceId = (vehicleId: string) => `vehicle-${vehicleId}`;
const jobRouteSourceId = (jobId: string) => `job-route-${jobId}`;

const missionColor = (jobId: string) => {
  const hash = [...jobId].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );

  return `hsl(${hash % 360}, 100%, 60%)`;
};

function GameMapView({
  layoutKey,
  cityId,
  customCities,
  branches,
  hotels,
  territoryExpansions,
  exploredTerritory,
  vehicles,
  jobs,
  transportAssets,
  transportRoutes,
  globalFerryRoutes,
  purchasedHarbours,
  trafficIncidents,
  vehicleIncidents,
  focusedJobId,
  placingStation,
  placingTerritory,
  placingHotel,
  onBuildStation,
  onExpandTerritory,
  onBuildHotel,
  onBuyHarbour,
  onOpenJob,
  onSaveJobPickupRoute,
  onSaveJobRoute,
  onJobFerryCrossingComplete,
  onTaxiArrived,
}: GameMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const pickupJobIds = useRef(new Set<string>());
  const pickupHandlers = useRef(
    new Map<
      string,
      {
        enter: () => void;
        leave: () => void;
        click: (event: mapboxgl.MapMouseEvent) => void;
      }
    >(),
  );
  const liveJobIds = useRef(new Set<string>());
  const liveJobTimers = useRef(new Map<string, number>());
  const liveJobRunners = useRef(new Map<string, () => void>());
  const arrivedJobIds = useRef(new Set<string>());
  const incidentMarkers = useRef<mapboxgl.Marker[]>([]);
  const harbourMarkers = useRef<mapboxgl.Marker[]>([]);
  const hotelMarkers = useRef<mapboxgl.Marker[]>([]);
  const ferryMarkers = useRef(new Map<string, mapboxgl.Marker>());
  const boardedFerryCrossings = useRef(new Set<string>());
  const completedFerryCrossings = useRef(new Set<string>());
  const transportAssetsRef = useRef(transportAssets);
  const transportRoutesRef = useRef(transportRoutes);
  transportAssetsRef.current = transportAssets;
  transportRoutesRef.current = transportRoutes;
  const [mapRevision, setMapRevision] = useState(0);
  const [containerReady, setContainerReady] = useState(false);
  // Null is a resolved fallback too. Remember it so a location with no mapped
  // boundary does not trigger another reverse-geocode request after each trip.
  const [realTerritories, setRealTerritories] = useState<
    Record<string, TerritoryFeature | null>
  >({});
  const realTerritoriesRef = useRef(realTerritories);
  realTerritoriesRef.current = realTerritories;
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    incidentMarkers.current.forEach((marker) => marker.remove());
    const activeTraffic = trafficIncidents.filter(
      (incident) => !incident.resolved && incident.cityId === cityId,
    );
    const activeVehicles = vehicleIncidents
      .filter((incident) => !incident.resolved)
      .flatMap((incident) => {
        const coordinates =
          incident.coordinates ??
          vehicles.find((vehicle) => vehicle.id === incident.vehicleId)
            ?.position;
        return coordinates ? [{ ...incident, coordinates }] : [];
      });
    incidentMarkers.current = [
      ...activeTraffic.map((incident) =>
        new mapboxgl.Marker({
          color: incident.severity === 3 ? "#ef4444" : "#f59e0b",
          scale: 0.72,
        })
          .setLngLat(incident.coordinates)
          .setPopup(
            new mapboxgl.Popup({ offset: 18 }).setText(
              `${incident.title}: ${incident.description}`,
            ),
          )
          .addTo(instance),
      ),
      ...activeVehicles.map((incident) =>
        new mapboxgl.Marker({ color: "#ef4444", scale: 0.82 })
          .setLngLat(incident.coordinates)
          .setPopup(
            new mapboxgl.Popup({ offset: 18 }).setText(incident.description),
          )
          .addTo(instance),
      ),
    ];
    return () => {
      incidentMarkers.current.forEach((marker) => marker.remove());
      incidentMarkers.current = [];
    };
  }, [cityId, mapRevision, trafficIncidents, vehicleIncidents, vehicles]);
  // Mapbox reads the container dimensions during construction. In Android
  // WebViews the first passive effect can run before the viewport has completed
  // its initial layout, so wait for a genuinely drawable box.
  useEffect(() => {
    const element = container.current;
    if (!element) return;

    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setContainerReady(true);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const frame = window.requestAnimationFrame(measure);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const centers = [
      ...branches.flatMap((station) => {
        const coordinates =
          station.coordinates ??
          getCity(station.cityId, customCities)?.coordinates;
        return coordinates ? [{ id: station.id, coordinates }] : [];
      }),
      ...territoryExpansions
        .filter((area) => area.source !== "taxi-discovery")
        .map(({ id, coordinates }) => ({ id, coordinates })),
    ];
    // Taxi discoveries update territoryExpansions after every completed trip,
    // but they do not change village boundaries. Avoid re-requesting every
    // already-resolved boundary during that hot transition.
    const unresolvedCenters = centers.filter(
      ({ id }) => !(id in realTerritoriesRef.current),
    );
    if (!unresolvedCenters.length)
      return () => {
        active = false;
      };
    void Promise.all(
      unresolvedCenters.map(async ({ id, coordinates }) => {
        const boundary = await realVillageTerritory(id, coordinates);
        return [id, boundary] as const;
      }),
    )
      .then((boundaries) => {
        if (active)
          setRealTerritories((current) => ({
            ...current,
            ...Object.fromEntries(boundaries),
          }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [branches, customCities, territoryExpansions]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    instance
      .getCanvas()
      .classList.toggle(
        "placing-depot",
        placingStation || placingTerritory || placingHotel,
      );
    const handlePlacement = (event: mapboxgl.MapMouseEvent) => {
      const coordinates: Coordinates = [event.lngLat.lng, event.lngLat.lat];
      if (placingStation) onBuildStation(coordinates);
      else if (placingTerritory) onExpandTerritory(coordinates);
      else if (placingHotel) onBuildHotel(coordinates);
    };
    instance.on("click", handlePlacement);
    return () => {
      instance.off("click", handlePlacement);
      instance.getCanvas().classList.remove("placing-depot");
    };
  }, [
    placingStation,
    placingTerritory,
    placingHotel,
    onBuildStation,
    onExpandTerritory,
    onBuildHotel,
  ]);

  useEffect(() => {
    if (!containerReady || !container.current || map.current) return;
    const currentLiveJobIds = liveJobIds.current;
    const currentLiveJobTimers = liveJobTimers.current;
    const currentLiveJobRunners = liveJobRunners.current;
    if (token) mapboxgl.accessToken = token;
    const selected = getCity(cityId, customCities);
    const abortController = new AbortController();
    const animationTimers = new Set<number>();
    const animationRunners = new Set<() => void>();
    const instance = new mapboxgl.Map({
      container: container.current,
      // Prefer the configured Mapbox basemap; installations without a token
      // still retain the existing OpenStreetMap raster fallback.
      style: token ? "mapbox://styles/mapbox/streets-v12" : fallbackStyle,
      center: selected?.coordinates ?? worldOverview.center,
      zoom: selected?.mapZoom ?? worldOverview.zoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
      maxPitch: 0,
      // Avoid periodic network and render work when the already-cached map is
      // perfectly adequate for this mostly static management-game viewport.
      refreshExpiredTiles: false,
      fadeDuration: 0,
      maxTileCacheSize: 24,
    });
    map.current = instance;
    const resizeObserver = new ResizeObserver(() => {
      instance.resize();
      instance.triggerRepaint();
    });
    resizeObserver.observe(container.current);
    pickupJobIds.current.clear();
    pickupHandlers.current.clear();
    currentLiveJobIds.clear();
    currentLiveJobTimers.forEach(cancelMapFrame);
    currentLiveJobTimers.clear();
    currentLiveJobRunners.clear();
    instance.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    instance.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    const canvas = instance.getCanvas();
    const handleContextLost = (event: Event) => {
      event.preventDefault();
    };
    const handleContextRestored = () => {
      instance.resize();
      instance.triggerRepaint();
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    const handleMapError = (event: mapboxgl.ErrorEvent) => {
      if (import.meta.env.DEV)
        console.error("[GameMap] Mapbox error", event.error);
    };
    const handleStyleLoad = () => {
      if (import.meta.env.DEV) console.debug("[GameMap] Mapbox style loaded");
    };
    const handleLoad = async () => {
      if (import.meta.env.DEV) console.debug("[GameMap] Mapbox map loaded");
      try {
        keepMapFlatAndBuildingFree(instance);
        instance.addSource("company-base", {
          type: "geojson",
          data: featureCollection(
            selected ? [point(selected.coordinates)] : [],
          ),
        });
        instance.addLayer({
          id: "base-halo",
          type: "circle",
          source: "company-base",
          paint: {
            "circle-radius": 22,
            "circle-color": "#22d3a7",
            "circle-opacity": 0.22,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#5eead4",
          },
        });
        instance.addLayer({
          id: "base",
          type: "circle",
          source: "company-base",
          paint: {
            "circle-radius": 9,
            "circle-color": "#0f766e",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });

        for (const vehicle of vehicles) {
          const job = jobs.find(
            (candidate) =>
              candidate.status === "accepted" &&
              (candidate.assignedVehicleId === vehicle.id ||
                (!candidate.assignedVehicleId && vehicle.status === "on-job")),
          );
          const start = vehicle.position ?? selected?.coordinates;
          if (!start) continue;
          if (vehicle.rentalJourney) {
            const rental = vehicle.rentalJourney;
            const sourceId = vehicleSourceId(vehicle.id);
            let routeReady = false;
            let roadRoute: RouteDetails = {
              coordinates: [start, start],
              speedLimits: [],
              ferryCrossings: [],
            };
            let roadMotion = createRouteMotion(
              roadRoute,
              40,
              vehicle.topSpeedKmh ?? 130,
            );
            if (token) {
              void resolveRoadRouteThrough(
                rental.waypoints,
                abortController.signal,
              )
                .then((resolved) => {
                  if (!resolved || abortController.signal.aborted) return;
                  roadRoute = resolved;
                  roadMotion = createRouteMotion(
                    roadRoute,
                    40,
                    vehicle.topSpeedKmh ?? 130,
                  );
                  routeReady = true;
                })
                .catch(() => undefined);
            }
            instance.addSource(sourceId, {
              type: "geojson",
              data: point(start),
            });
            instance.addLayer({
              id: sourceId,
              type: "circle",
              source: sourceId,
              paint: {
                "circle-radius": VEHICLE_MARKER_RADIUS,
                "circle-color": vehicleColor.rental,
                "circle-stroke-width": VEHICLE_MARKER_STROKE_WIDTH,
                "circle-stroke-color": "#ffffff",
              },
            });
            ensureFerryWaitLabel(instance, sourceId);
            let rentalTimer: number | undefined;
            let lastFerryState: "waiting" | "aboard" | null | undefined;
            const animateRental = () => {
              if (rentalTimer !== undefined) {
                cancelMapFrame(rentalTimer);
                animationTimers.delete(rentalTimer);
              }
              const progress = rentalJourneyProgress(rental);
              const motion = routeReady
                ? roadMotion(progress)
                : {
                    progress: 0,
                    waitingForFerry: false,
                    onFerry: false,
                    ferryCrossingIndex: null,
                    ferryCrossingEndElapsed: null,
                  };
              let ferryState: "waiting" | "aboard" | null =
                motion.waitingForFerry
                  ? "waiting"
                  : motion.onFerry
                    ? "aboard"
                    : null;
              let currentPosition = routePosition(
                roadRoute.coordinates,
                motion.progress,
              );
              const ferryPosition = positionVehicleOnOwnedFerry(
                `${vehicle.id}:rental:${rental.startedAt}`,
                roadRoute,
                motion,
                transportRoutesRef.current,
                transportAssetsRef.current,
                boardedFerryCrossings.current,
                completedFerryCrossings.current,
                Date.now(),
              );
              if (ferryPosition) {
                currentPosition = ferryPosition.position;
                ferryState = ferryPosition.state;
              }
              (
                instance.getSource(sourceId) as
                  | mapboxgl.GeoJSONSource
                  | undefined
              )?.setData(
                point(currentPosition, {
                  ferryStatus:
                    ferryState === "waiting"
                      ? "Waiting for ferry"
                      : ferryState === "aboard"
                        ? "On ferry"
                        : "",
                }),
              );
              if (ferryState !== lastFerryState) {
                instance.setPaintProperty(
                  sourceId,
                  "circle-color",
                  ferryState === "waiting"
                    ? vehicleColor.waitingForFerry
                    : ferryState === "aboard"
                      ? vehicleColor.onFerry
                      : vehicleColor.rental,
                );
                lastFerryState = ferryState;
              }
              instance.triggerRepaint();
              if (progress < 1 && document.visibilityState !== "hidden") {
                rentalTimer = scheduleMapFrame(animateRental);
                animationTimers.add(rentalTimer);
              }
            };
            animationRunners.add(animateRental);
            animateRental();
            continue;
          }
          if (vehicle.postalRoute) {
            const postal = vehicle.postalRoute;
            const sourceId = vehicleSourceId(vehicle.id);
            const postalWaypoints = postal.stops.map(
              (stop) => stop.coordinates,
            );
            let routeReady = false;
            let roadRoute: RouteDetails = {
              coordinates: [start, start],
              speedLimits: [],
              ferryCrossings: [],
            };
            let roadMotion = createRouteMotion(
              roadRoute,
              35,
              vehicle.topSpeedKmh ?? 110,
            );
            if (token) {
              void resolveRoadRouteThrough(
                postalWaypoints,
                abortController.signal,
              )
                .then((resolved) => {
                  if (!resolved || abortController.signal.aborted) return;
                  roadRoute = resolved;
                  roadMotion = createRouteMotion(
                    roadRoute,
                    35,
                    vehicle.topSpeedKmh ?? 110,
                  );
                  routeReady = true;
                })
                .catch(() => undefined);
            }
            postal.stops.slice(1, -1).forEach((stop, stopIndex) => {
              const stopId = `${sourceId}-post-stop-${stopIndex}`;
              instance.addSource(stopId, {
                type: "geojson",
                data: point(stop.coordinates),
              });
              instance.addLayer({
                id: stopId,
                type: "circle",
                source: stopId,
                paint: {
                  "circle-radius": 7,
                  "circle-color": "#fbbf24",
                  "circle-stroke-width": 2,
                  "circle-stroke-color": "#fff",
                },
              });
              instance.addLayer({
                id: `${stopId}-label`,
                type: "symbol",
                source: stopId,
                layout: { "text-field": `${stopIndex + 1}`, "text-size": 9 },
                paint: { "text-color": "#422006" },
              });
            });
            instance.addSource(sourceId, {
              type: "geojson",
              data: point(start),
            });
            instance.addLayer({
              id: sourceId,
              type: "circle",
              source: sourceId,
              paint: {
                "circle-radius": VEHICLE_MARKER_RADIUS,
                "circle-color": vehicleColor.postal,
                "circle-stroke-width": VEHICLE_MARKER_STROKE_WIDTH,
                "circle-stroke-color": "#ffffff",
              },
            });
            ensureFerryWaitLabel(instance, sourceId);
            let postalTimer: number | undefined;
            let lastFerryState: "waiting" | "aboard" | null | undefined;
            const animatePostal = () => {
              if (postalTimer !== undefined) {
                cancelMapFrame(postalTimer);
                animationTimers.delete(postalTimer);
              }
              const progress = postalRouteProgress(postal);
              const motion = routeReady
                ? roadMotion(progress)
                : {
                    progress: 0,
                    waitingForFerry: false,
                    onFerry: false,
                    ferryCrossingIndex: null,
                    ferryCrossingEndElapsed: null,
                  };
              let ferryState: "waiting" | "aboard" | null =
                motion.waitingForFerry
                  ? "waiting"
                  : motion.onFerry
                    ? "aboard"
                    : null;
              let currentPosition = routePosition(
                roadRoute.coordinates,
                motion.progress,
              );
              const ferryPosition = positionVehicleOnOwnedFerry(
                `${vehicle.id}:postal:${postal.startedAt}`,
                roadRoute,
                motion,
                transportRoutesRef.current,
                transportAssetsRef.current,
                boardedFerryCrossings.current,
                completedFerryCrossings.current,
                Date.now(),
              );
              if (ferryPosition) {
                currentPosition = ferryPosition.position;
                ferryState = ferryPosition.state;
              }
              (
                instance.getSource(sourceId) as
                  | mapboxgl.GeoJSONSource
                  | undefined
              )?.setData(
                point(currentPosition, {
                  ferryStatus:
                    ferryState === "waiting"
                      ? "Waiting for ferry"
                      : ferryState === "aboard"
                        ? "On ferry"
                        : "",
                }),
              );
              if (ferryState !== lastFerryState) {
                instance.setPaintProperty(
                  sourceId,
                  "circle-color",
                  ferryState === "waiting"
                    ? vehicleColor.waitingForFerry
                    : ferryState === "aboard"
                      ? vehicleColor.onFerry
                      : vehicleColor.postal,
                );
                lastFerryState = ferryState;
              }
              instance.triggerRepaint();
              if (progress < 1 && document.visibilityState !== "hidden") {
                postalTimer = scheduleMapFrame(animatePostal);
                animationTimers.add(postalTimer);
              }
            };
            animationRunners.add(animatePostal);
            animatePostal();
            continue;
          }
          let journey = job ? getJobMotionJourney(job, vehicle) : null;
          let pickupRouteReady =
            !job ||
            Boolean(
              job.pickupRouteCoordinates?.length &&
              job.pickupRouteCoordinates.length >= 2 &&
              (!token || job.pickupFerryCrossings !== undefined),
            );
          let pickupRoute: RouteDetails = {
            coordinates:
              job?.pickupRouteCoordinates ?? (job ? [start, start] : [start]),
            speedLimits: [],
            ferryCrossings: job?.pickupFerryCrossings ?? [],
          };
          let passengerRoute: RouteDetails = {
            coordinates:
              job?.routeCoordinates ??
              (job ? [jobPickup(job), jobDestination(job)] : [start]),
            speedLimits: [],
            ferryCrossings: job?.ferryCrossings ?? [],
          };
          const fallbackSpeedKmh =
            job && job.durationMinutes > 0
              ? job.distanceKm / (job.durationMinutes / 60)
              : 30;
          let pickupMotion = createRouteMotion(
            pickupRoute,
            fallbackSpeedKmh,
            vehicle.topSpeedKmh ?? 130,
          );
          let passengerMotion = createRouteMotion(
            passengerRoute,
            fallbackSpeedKmh,
            vehicle.topSpeedKmh ?? 130,
          );
          if (job && token) {
            const fetchRoute = async (from: Coordinates, to: Coordinates) => {
              const route = await resolveRoadRoute(
                from,
                to,
                abortController.signal,
              );
              if (route) return route;
              throw new Error(
                "No road route was returned for the pickup journey.",
              );
            };
            // The passenger route was resolved and persisted when the offer was
            // generated. Only the vehicle-to-pickup leg requires a request.
            void fetchRoute(start, jobPickup(job))
              .then((toPickup) => {
                if (abortController.signal.aborted || map.current !== instance)
                  return;
                if (!toPickup) return;
                pickupRoute = toPickup;
                pickupRouteReady = true;
                pickupMotion = createRouteMotion(
                  pickupRoute,
                  fallbackSpeedKmh,
                  vehicle.topSpeedKmh ?? 130,
                );
                if (
                  !job.pickupRouteCoordinates ||
                  job.pickupFerryCrossings === undefined
                ) {
                  const routeStartedAt = new Date().toISOString();
                  journey = getJobMotionJourney(
                    {
                      ...job,
                      acceptedAt: routeStartedAt,
                      pickupRouteCoordinates:
                        toPickup.coordinates as Coordinates[],
                    },
                    vehicle,
                  );
                  onSaveJobPickupRoute(
                    job.id,
                    toPickup.coordinates.map(([longitude, latitude]) => [
                      longitude,
                      latitude,
                    ]),
                    toPickup.ferryCrossings,
                    toPickup.durationMinutes ??
                      Math.max(
                        1,
                        (distanceKmBetween(start, jobPickup(job)) /
                          Math.max(1, fallbackSpeedKmh)) *
                          60,
                      ),
                  );
                }
              })
              .catch(() => undefined);
            if (passengerRouteNeedsRepair(job)) {
              void fetchRoute(jobPickup(job), jobDestination(job))
                .then((resolvedRoute) => {
                  if (
                    abortController.signal.aborted ||
                    map.current !== instance
                  )
                    return;
                  passengerRoute = resolvedRoute;
                  passengerMotion = createRouteMotion(
                    passengerRoute,
                    fallbackSpeedKmh,
                    vehicle.topSpeedKmh ?? 130,
                  );
                  (
                    instance.getSource(jobRouteSourceId(job.id)) as
                      | mapboxgl.GeoJSONSource
                      | undefined
                  )?.setData(lineString(passengerRoute.coordinates));
                  onSaveJobRoute(
                    job.id,
                    resolvedRoute.coordinates.map(([longitude, latitude]) => [
                      longitude,
                      latitude,
                    ]),
                    resolvedRoute.ferryCrossings,
                  );
                })
                .catch(() => undefined);
            }
          }
          // Directions may still be loading when the live-map effect starts a
          // newly accepted job using its immediate straight-line fallback. Let
          // that runner retain ownership instead of replacing its moving marker
          // when these load-time requests eventually finish.
          if (job && liveJobIds.current.has(job.id)) continue;
          const sourceId = vehicleSourceId(vehicle.id);
          if (!instance.getSource(sourceId)) {
            instance.addSource(sourceId, {
              type: "geojson",
              data: point(start),
            });
            instance.addLayer({
              id: sourceId,
              type: "circle",
              source: sourceId,
              paint: {
                "circle-radius": VEHICLE_MARKER_RADIUS,
                "circle-color": mapVehicleColor(
                  vehicle,
                  vehicle.type === "post"
                    ? vehicleColor.postal
                    : job
                      ? vehicleColor.pickingUp
                      : vehicle.status === "maintenance"
                        ? vehicleColor.maintenance
                        : vehicleColor.available,
                ),
                "circle-stroke-width": VEHICLE_MARKER_STROKE_WIDTH,
                "circle-stroke-color": "#ffffff",
              },
            });
          }
          if (!job) continue;
          ensureFerryWaitLabel(instance, sourceId);

          liveJobIds.current.add(job.id);

          const routeSourceId = jobRouteSourceId(job.id);

          instance.addSource(routeSourceId, {
            type: "geojson",
            data: lineString([
              ...pickupRoute.coordinates,
              ...passengerRoute.coordinates.slice(1),
            ]),
          });

          if (!journey) continue;
          let animationTimer: number | undefined;
          let lastRouteUpdateAt = 0;
          let lastPickingUp: boolean | null = null;
          let lastFerryState: "waiting" | "aboard" | null | undefined;
          let localFerryDelayMs = 0;

          let frozenFerryMotionTime: number | null = null;
          const scheduleAnimation = () => {
            if (animationTimer !== undefined) {
              cancelMapFrame(animationTimer);
              animationTimers.delete(animationTimer);
            }
            if (document.visibilityState === "hidden") return;
            animationTimer = scheduleMapFrame(animate);
            animationTimers.add(animationTimer);
          };
          const animate = () => {
            if (animationTimer !== undefined) {
              cancelMapFrame(animationTimer);
              animationTimers.delete(animationTimer);
            }
            const now = Date.now();

            const liveMotionTime =
              getJobMotionTime(job, now) - localFerryDelayMs;

            const time = frozenFerryMotionTime ?? liveMotionTime;
            if (!pickupRouteReady) {
              (
                instance.getSource(sourceId) as
                  | mapboxgl.GeoJSONSource
                  | undefined
              )?.setData(point(start));
              (
                instance.getSource(routeSourceId) as
                  | mapboxgl.GeoJSONSource
                  | undefined
              )?.setData(lineString(passengerRoute.coordinates));
              scheduleAnimation();
              return;
            }
            const currentJourney = journey!;
            const pickupFerryKey = `${vehicle.id}:job:${job.id}:pickup`;
            job.completedPickupFerryCrossings?.forEach((index) =>
              completedFerryCrossings.current.add(`${pickupFerryKey}:${index}`),
            );
            const pickingUp =
              time < currentJourney.pickupAt ||
              !ferryCrossingsComplete(
                pickupFerryKey,
                pickupRoute,
                completedFerryCrossings.current,
              );
            const elapsed = pickingUp
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    (time - currentJourney.departsAt) /
                      (currentJourney.pickupAt - currentJourney.departsAt),
                  ),
                )
              : Math.max(
                  0,
                  Math.min(
                    1,
                    (time - currentJourney.pickupAt) /
                      (currentJourney.arrivesAt - currentJourney.pickupAt),
                  ),
                );
            const activeRoute = pickingUp ? pickupRoute : passengerRoute;
            const motion = pickingUp
              ? pickupMotion(elapsed)
              : passengerMotion(elapsed);
            const { progress } = motion;
            let currentPosition = routePosition(
              activeRoute.coordinates,
              progress,
            );
            let ferryState: "waiting" | "aboard" | null = motion.waitingForFerry
              ? "waiting"
              : motion.onFerry
                ? "aboard"
                : null;
            const ferryLeg = pickingUp ? "pickup" : "passenger";
            const ferryKey = `${vehicle.id}:job:${job.id}:${ferryLeg}`;
            const persistedCrossings = pickingUp
              ? job.completedPickupFerryCrossings
              : job.completedFerryCrossings;
            persistedCrossings?.forEach((index) =>
              completedFerryCrossings.current.add(`${ferryKey}:${index}`),
            );
            const ferryPosition = positionVehicleOnOwnedFerry(
              ferryKey,
              activeRoute,
              motion,
              transportRoutesRef.current,
              transportAssetsRef.current,
              boardedFerryCrossings.current,
              completedFerryCrossings.current,
              now,
            );
            if (ferryPosition) {
              currentPosition = ferryPosition.position;

              ferryState = ferryPosition.state;

              // The ferry now owns physical movement.
              // Freeze normal taxi road time.
              if (
                (ferryState === "waiting" || ferryState === "aboard") &&
                frozenFerryMotionTime === null
              ) {
                frozenFerryMotionTime = time;
              }

              if (ferryPosition.completedNow) {
                const ferryEndElapsed =
                  motion.ferryCrossingEndElapsed ?? elapsed;

                const legFrom = pickingUp
                  ? currentJourney.departsAt
                  : currentJourney.pickupAt;

                const legTo = pickingUp
                  ? currentJourney.pickupAt
                  : currentJourney.arrivesAt;

                // The exact point in the taxi's normal
                // timeline where this ferry segment ends.
                const desiredMotionTime =
                  legFrom + (legTo - legFrom) * ferryEndElapsed;

                const unfrozenMotionTime =
                  getJobMotionTime(job, now) - localFerryDelayMs;

                // Can be positive OR negative.
                // This keeps the road clock exactly aligned
                // with the real ferry arrival.
                const addedDelayMs = unfrozenMotionTime - desiredMotionTime;

                // Apply immediately before Zustand rerenders.
                localFerryDelayMs += addedDelayMs;

                frozenFerryMotionTime = null;

                onJobFerryCrossingComplete(
                  job.id,
                  ferryLeg,
                  ferryPosition.crossingIndex,
                  addedDelayMs,
                );
              }
            }
            (
              instance.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
            )?.setData(
              point(currentPosition, {
                ferryStatus:
                  ferryState === "waiting"
                    ? "Waiting for ferry"
                    : ferryState === "aboard"
                      ? "On ferry"
                      : "",
              }),
            );
            if (
              now - lastRouteUpdateAt >= ROUTE_GEOMETRY_UPDATE_INTERVAL_MS ||
              time >= currentJourney.arrivesAt
            ) {
              const routeAhead = pickingUp
                ? [
                    ...remainingRoute(pickupRoute.coordinates, progress),
                    ...passengerRoute.coordinates.slice(1),
                  ]
                : remainingRoute(passengerRoute.coordinates, progress);
              (
                instance.getSource(routeSourceId) as
                  | mapboxgl.GeoJSONSource
                  | undefined
              )?.setData(lineString(routeAhead));
              lastRouteUpdateAt = now;
            }
            if (pickingUp !== lastPickingUp || ferryState !== lastFerryState) {
              instance.setPaintProperty(
                sourceId,
                "circle-color",
                mapVehicleColor(
                  vehicle,
                  ferryState === "waiting"
                    ? vehicleColor.waitingForFerry
                    : ferryState === "aboard"
                      ? vehicleColor.onFerry
                      : pickingUp
                        ? vehicleColor.pickingUp
                        : vehicleColor.carryingPassenger,
                ),
              );
              if (instance.getLayer(`pickup-${job.id}`))
                instance.setLayoutProperty(
                  `pickup-${job.id}`,
                  "visibility",
                  pickingUp ? "visible" : "none",
                );
              lastPickingUp = pickingUp;
              lastFerryState = ferryState;
            }
            const passengerFerryKey = `${vehicle.id}:job:${job.id}:passenger`;
            const passengerFerriesComplete = ferryCrossingsComplete(
              passengerFerryKey,
              passengerRoute,
              completedFerryCrossings.current,
            );
            if (time < currentJourney.arrivesAt || !passengerFerriesComplete) {
              scheduleAnimation();
            } else {
              animationRunners.delete(animate);

              if (!arrivedJobIds.current.has(job.id)) {
                arrivedJobIds.current.add(job.id);

                console.debug("[taxi] arrived; settling job and territory", {
                  jobId: job.id,
                  routeCoordinates: passengerRoute.coordinates.length,
                });

                onTaxiArrived(job.id);
              }
            }
          };
          animationRunners.add(animate);
          animate();
        }
        setMapRevision((revision) => revision + 1);
      } catch (error) {
        // One malformed journey must not silently abort all remaining setup.
        console.error("[GameMap] Map load setup failed", error);
      }
    };
    instance.on("error", handleMapError);
    instance.on("style.load", handleStyleLoad);
    instance.on("load", handleLoad);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        animationTimers.forEach(cancelMapFrame);
        animationTimers.clear();
        currentLiveJobTimers.forEach(cancelMapFrame);
        currentLiveJobTimers.clear();
        instance.stop();
        return;
      }
      instance.resize();
      instance.triggerRepaint();
      animationRunners.forEach((run) => run());
      currentLiveJobRunners.forEach((run) => run());
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    window.addEventListener("online", handleVisibilityChange);
    return () => {
      abortController.abort();
      animationTimers.forEach(cancelMapFrame);
      currentLiveJobTimers.forEach(cancelMapFrame);
      currentLiveJobTimers.clear();
      currentLiveJobRunners.clear();
      currentLiveJobIds.clear();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
      window.removeEventListener("online", handleVisibilityChange);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      instance.off("error", handleMapError);
      instance.off("style.load", handleStyleLoad);
      instance.off("load", handleLoad);
      map.current = null;
      instance.remove();
    };
    // Construct Mapbox exactly once. Cities, jobs, and fleet state are synchronized
    // into this instance below instead of tearing down the WebGL map and reloading tiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerReady]);

  // Sheets and dashboards are layered over the persistent map. Re-measure on
  // every view transition so returning to Map/Dispatch cannot expose a stale
  // Android WebView canvas, without recreating the Mapbox instance.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    const frame = window.requestAnimationFrame(() => {
      if (map.current !== instance) return;

      instance.resize();
      instance.triggerRepaint();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [layoutKey]);

  useEffect(() => {
    const instance = map.current;
    const selected = getCity(cityId, customCities);
    if (!instance || !selected) return;

    instance.easeTo({
      center: selected.coordinates,
      zoom: selected.mapZoom,
      duration: 650,
    });
    const updateBase = () => {
      const source = instance.getSource("company-base") as
        | mapboxgl.GeoJSONSource
        | undefined;
      source?.setData(featureCollection([point(selected.coordinates)]));
    };
    if (instance.isStyleLoaded()) updateBase();
    else instance.once("load", updateBase);
    return () => {
      instance.off("load", updateBase);
    };
  }, [cityId, customCities, mapRevision]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const updateDepots = () => {
      const stationCoordinates = branches.flatMap((station) => {
        const coordinates =
          station.coordinates ??
          getCity(station.cityId, customCities)?.coordinates;
        return coordinates ? [{ station, coordinates }] : [];
      });
      const features = stationCoordinates.map(({ station, coordinates }) =>
        point(coordinates, { name: station.name }),
      );
      const data = featureCollection(features);
      const ownedTerritories = [
        ...stationCoordinates.map(
          ({ station, coordinates }) =>
            realTerritories[station.id] ??
            villageTerritory(
              station.id,
              coordinates,
              VILLAGE_TERRITORY_RADIUS_KM,
            ),
        ),
        ...territoryExpansions
          .filter((expansion) => expansion.source !== "taxi-discovery")
          .map(
            (expansion) =>
              realTerritories[expansion.id] ??
              villageTerritory(
                expansion.id,
                expansion.coordinates,
                VILLAGE_TERRITORY_RADIUS_KM,
              ),
          ),
      ];
      // Taxi exploration is already buffered, simplified, and compacted by the
      // territory engine when a trip completes. Rendering performs one union
      // with village coverage and never replays historical routes.
      const unlockedTerritory = mergeVillageTerritories([
        ...ownedTerritories,
        ...(exploredTerritory ? [exploredTerritory] : []),
      ]);
      const coverageData = featureCollection(
        unlockedTerritory ? [unlockedTerritory] : [],
      );
      const lockedData = featureCollection([
        lockedTerritoryMask(unlockedTerritory),
      ]);
      const source = instance.getSource("depot-network") as
        | mapboxgl.GeoJSONSource
        | undefined;
      const coverageSource = instance.getSource("service-coverage") as
        | mapboxgl.GeoJSONSource
        | undefined;
      const lockedSource = instance.getSource("locked-territory") as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (source && coverageSource && lockedSource) {
        source.setData(data);
        coverageSource.setData(coverageData);
        lockedSource.setData(lockedData);

        instance.triggerRepaint();
        return;
      }
      instance.addSource("locked-territory", {
        type: "geojson",
        data: lockedData,
      });
      instance.addLayer({
        id: "locked-territory-fill",
        type: "fill",
        source: "locked-territory",
        paint: { "fill-color": "#ef7777", "fill-opacity": 0.24 },
      });
      instance.addSource("service-coverage", {
        type: "geojson",
        data: coverageData,
      });
      // Owned and explored land is revealed by the transparent hole in the
      // locked-territory mask; keep only its border instead of tinting the map.
      instance.addLayer({
        id: "service-coverage-fill",
        type: "fill",
        source: "service-coverage",
        paint: { "fill-color": "#19cdb3", "fill-opacity": 0 },
      });
      instance.addLayer({
        id: "service-coverage-line",
        type: "line",
        source: "service-coverage",
        paint: {
          "line-color": "#5eead4",
          "line-width": 2,
          "line-opacity": 0.85,
        },
      });
      instance.addSource("depot-network", { type: "geojson", data });
      instance.addLayer({
        id: "depot-network-halo",
        type: "circle",
        source: "depot-network",
        paint: {
          "circle-radius": 13,
          "circle-color": "#f59e0b",
          "circle-opacity": 0.18,
        },
      });
      instance.addLayer({
        id: "depot-network",
        type: "circle",
        source: "depot-network",
        paint: {
          "circle-radius": 6,
          "circle-color": "#fbbf24",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
      instance.addLayer({
        id: "depot-network-label",
        type: "symbol",
        source: "depot-network",
        minzoom: 8,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 10,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#10201f",
          "text-halo-width": 2,
        },
      });
      instance.triggerRepaint();
    };
    let cancelled = false;
    let applied = false;

    const applyTerritoryUpdate = () => {
      if (cancelled || applied || map.current !== instance) return;

      try {
        if (!instance.isStyleLoaded()) return;

        updateDepots();
        applied = true;

        instance.off("styledata", applyTerritoryUpdate);
        instance.off("idle", applyTerritoryUpdate);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("[GameMap] Territory update delayed", error);
        }
      }
    };

    applyTerritoryUpdate();

    if (!applied) {
      instance.on("styledata", applyTerritoryUpdate);
      instance.on("idle", applyTerritoryUpdate);
    }

    return () => {
      cancelled = true;
      instance.off("styledata", applyTerritoryUpdate);
      instance.off("idle", applyTerritoryUpdate);
    };
  }, [
    branches,
    customCities,
    territoryExpansions,
    exploredTerritory,
    mapRevision,
    realTerritories,
  ]);

  // The offline passenger-terminal catalogue is always visible at world scale.
  // A marker popup is the harbour marketplace, so players never have to hunt
  // through a separate list to purchase the place they are looking at.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    harbourMarkers.current.forEach((marker) => marker.remove());
    const seen = new Set<string>();
    const markers: mapboxgl.Marker[] = [];
    const ownedIds = new Set(purchasedHarbours.map((harbour) => harbour.id));
    const territoryCenters = [
      ...branches.flatMap((branch) => branch.coordinates ? [branch.coordinates] : []),
      ...territoryExpansions.filter((area) => area.source !== "taxi-discovery").map((area) => area.coordinates),
    ];
    const addHarbour = (route: FerryRouteOption) => {
      const { originCoordinates: coordinates, originName: name } = route;
      const key = coordinates.map((part) => part.toFixed(4)).join(",");
      if (seen.has(key)) return;
      seen.add(key);
      const id = `harbour:${key}`;
      const owned = ownedIds.has(id);
      const available = territoryCenters.some((center) => distanceKmBetween(center, coordinates) <= 8);
      const element = document.createElement("div");
      element.className = `harbour-map-marker${owned ? " owned" : ""}${available ? " available" : " locked"}`;
      element.textContent = "⚓";
      element.setAttribute("aria-label", name);
      const popupContent = document.createElement("div");
      popupContent.className = "harbour-popup";
      const title = document.createElement("strong");
      title.textContent = name;
      const status = document.createElement("small");
      status.textContent = owned ? "Harbour owned" : available ? "Inside your owned territory" : "Unlock this territory to purchase";
      const button = document.createElement("button");
      button.type = "button";
      button.disabled = owned || !available;
      button.textContent = owned ? "Purchased" : available ? "Buy harbour · €5,000" : "Territory locked";
      button.addEventListener("click", () => onBuyHarbour(route));
      popupContent.append(title, status, button);
      markers.push(
        new mapboxgl.Marker({ element, anchor: "center" })
          .setLngLat(coordinates)
          .setPopup(new mapboxgl.Popup({ offset: 16, className: "harbour-map-popup" }).setDOMContent(popupContent))
          .addTo(instance),
      );
    };
    globalFerryRoutes.forEach(addHarbour);
    harbourMarkers.current = markers;
    return () => {
      markers.forEach((marker) => marker.remove());
      if (harbourMarkers.current === markers) harbourMarkers.current = [];
    };
  }, [branches, globalFerryRoutes, mapRevision, onBuyHarbour, purchasedHarbours, territoryExpansions]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    hotelMarkers.current.forEach((marker) => marker.remove());
    const markers = hotels.flatMap((hotel) => {
      const coordinates =
        hotel.coordinates ?? getCity(hotel.cityId, customCities)?.coordinates;
      if (!coordinates) return [];
      const element = document.createElement("div");
      element.className = "hotel-map-marker";
      element.textContent = "🏨";
      element.setAttribute("aria-label", hotel.name);
      return [
        new mapboxgl.Marker({ element, anchor: "bottom" })
          .setLngLat(coordinates)
          .setPopup(
            new mapboxgl.Popup({ offset: 18 }).setText(
              `${hotel.name} · Level ${hotel.level} · ${hotel.rooms} rooms`,
            ),
          )
          .addTo(instance),
      ];
    });
    hotelMarkers.current = markers;
    return () => {
      markers.forEach((marker) => marker.remove());
      if (hotelMarkers.current === markers) hotelMarkers.current = [];
    };
  }, [hotels, customCities, mapRevision]);

  useEffect(() => {
    const instance = map.current;
    if (!instance?.isStyleLoaded()) return;
    const selected = getCity(cityId, customCities);

    // Fleet purchases no longer require a map reconstruction. Add any new
    // vehicle source and layer directly to the live style.
    vehicles.forEach((vehicle) => {
      const sourceId = vehicleSourceId(vehicle.id);

      if (!instance.getSource(sourceId)) {
        const position = vehicle.position ?? selected?.coordinates;
        if (!position) return;

        instance.addSource(sourceId, {
          type: "geojson",
          data: point(position),
        });

        instance.addLayer({
          id: sourceId,
          type: "circle",
          source: sourceId,
          paint: {
            "circle-radius": VEHICLE_MARKER_RADIUS,
            "circle-color": mapVehicleColor(
              vehicle,
              vehicle.type === "post"
                ? vehicleColor.postal
                : vehicle.type === "rental"
                  ? vehicleColor.rental
                  : vehicle.status === "maintenance"
                    ? vehicleColor.maintenance
                    : vehicleColor.available,
            ),
            "circle-stroke-width": VEHICLE_MARKER_STROKE_WIDTH,
            "circle-stroke-color": "#ffffff",
          },
        });
      }
    });

    // Keep accepted calls and the offer currently being previewed legible
    // without cluttering the map with every dispatch-board offer.
    const visibleJobs = jobs.filter(
      (job) => job.status === "accepted" || job.id === focusedJobId,
    );
    const visibleIds = new Set(visibleJobs.map((job) => job.id));

    for (const jobId of pickupJobIds.current) {
      if (visibleIds.has(jobId)) continue;
      const sourceId = `pickup-${jobId}`;
      const handlers = pickupHandlers.current.get(jobId);
      if (handlers) {
        instance.off("mouseenter", sourceId, handlers.enter);
        instance.off("mouseleave", sourceId, handlers.leave);
        instance.off("click", sourceId, handlers.click);
      }
      if (instance.getLayer(`destination-${jobId}`))
        instance.removeLayer(`destination-${jobId}`);
      if (instance.getLayer(sourceId)) instance.removeLayer(sourceId);
      if (instance.getSource(`destination-${jobId}`))
        instance.removeSource(`destination-${jobId}`);
      if (instance.getSource(sourceId)) instance.removeSource(sourceId);
      pickupJobIds.current.delete(jobId);
      pickupHandlers.current.delete(jobId);
    }

    for (const job of visibleJobs) {
      const sourceId = `pickup-${job.id}`;
      const color = missionColor(job.id);
      if (pickupJobIds.current.has(job.id)) {
        continue;
      }
      instance.addSource(sourceId, {
        type: "geojson",
        data: point(jobPickup(job), { title: job.pickupLabel }),
      });
      instance.addLayer({
        id: sourceId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": VEHICLE_MARKER_RADIUS,
          "circle-color": color,
          "circle-stroke-width": VEHICLE_MARKER_STROKE_WIDTH,
          "circle-stroke-color": "#ffffff",
        },
      });
      const destinationId = `destination-${job.id}`;
      instance.addSource(destinationId, {
        type: "geojson",
        data: point(jobDestination(job), { title: job.destinationLabel }),
      });
      instance.addLayer({
        id: destinationId,
        type: "circle",
        source: destinationId,
        paint: {
          "circle-radius": VEHICLE_MARKER_RADIUS,
          "circle-color": color,
          "circle-stroke-width": VEHICLE_MARKER_STROKE_WIDTH,
          "circle-stroke-color": "#ffffff",
        },
      });
      const handlers = {
        enter: () => {
          instance.getCanvas().style.cursor = "pointer";
        },
        leave: () => {
          instance.getCanvas().style.cursor = "";
        },
        click: (event: mapboxgl.MapMouseEvent) => {
          event.originalEvent.stopPropagation();
          onOpenJob(job.id);
        },
      };
      instance.on("mouseenter", sourceId, handlers.enter);
      instance.on("mouseleave", sourceId, handlers.leave);
      instance.on("click", sourceId, handlers.click);
      pickupHandlers.current.set(job.id, handlers);
      pickupJobIds.current.add(job.id);
    }

    // Start newly accepted journeys on the live map and replace the immediate
    // fallback with road geometry as soon as Directions responds.
    for (const job of jobs.filter(
      (candidate) => candidate.status === "accepted",
    )) {
      const vehicle = vehicles.find(
        (candidate) => candidate.id === job.assignedVehicleId,
      );
      if (!vehicle) continue;
      const start =
        vehicle.position ?? getCity(cityId, customCities)?.coordinates;
      if (!start) continue;
      const taxiSourceId = vehicleSourceId(vehicle.id);

      // Already running: don't touch its Mapbox route again.
      if (liveJobIds.current.has(job.id)) continue;

      const routeSourceId = jobRouteSourceId(job.id);

      instance.addSource(routeSourceId, {
        type: "geojson",
        data: lineString([
          start,
          ...(job.routeCoordinates ?? [jobPickup(job), jobDestination(job)]),
        ]),
      });

      if (instance.getLayer(taxiSourceId)) {
        ensureFerryWaitLabel(instance, taxiSourceId);
        instance.setPaintProperty(
          taxiSourceId,
          "circle-color",
          mapVehicleColor(vehicle, vehicleColor.pickingUp),
        );
      }

      const passengerSourceId = `pickup-${job.id}`;

      if (
        instance.getLayer(passengerSourceId) &&
        instance.getLayer(taxiSourceId)
      ) {
        instance.setPaintProperty(
          passengerSourceId,
          "circle-radius",
          VEHICLE_MARKER_RADIUS + 3,
        );

        instance.setPaintProperty(passengerSourceId, "circle-opacity", 0.45);

        instance.setPaintProperty(passengerSourceId, "circle-stroke-width", 0);

        instance.moveLayer(passengerSourceId, taxiSourceId);
      }

      liveJobIds.current.add(job.id);
      let journey = getJobMotionJourney(job, vehicle);
      let pickupRouteReady = Boolean(
        job.pickupRouteCoordinates?.length &&
        job.pickupRouteCoordinates.length >= 2 &&
        (!token || job.pickupFerryCrossings !== undefined),
      );
      let pickupRoute: RouteDetails = {
        coordinates: job.pickupRouteCoordinates ?? [start, start],
        speedLimits: [],
        ferryCrossings: job.pickupFerryCrossings ?? [],
      };
      let passengerRoute: RouteDetails = {
        coordinates: job.routeCoordinates ?? [
          jobPickup(job),
          jobDestination(job),
        ],
        speedLimits: [],
        ferryCrossings: job.ferryCrossings ?? [],
      };
      const fallbackSpeedKmh =
        job.durationMinutes > 0
          ? job.distanceKm / (job.durationMinutes / 60)
          : 30;
      let pickupMotion = createRouteMotion(
        pickupRoute,
        fallbackSpeedKmh,
        vehicle.topSpeedKmh ?? 130,
      );
      let passengerMotion = createRouteMotion(
        passengerRoute,
        fallbackSpeedKmh,
        vehicle.topSpeedKmh ?? 130,
      );
      let lastRouteUpdateAt = 0;
      let lastPickingUp: boolean | null = null;
      let lastFerryState: "waiting" | "aboard" | null | undefined;
      let localFerryDelayMs = 0;

      let frozenFerryMotionTime: number | null = null;
      if (token) {
        const fetchRoute = async (from: Coordinates, to: Coordinates) => {
          const route = await resolveRoadRoute(from, to);
          if (route) return route;
          throw new Error("No road route was returned for the pickup journey.");
        };
        const applyPickupRoute = (toPickup: RouteDetails) => {
          if (!liveJobIds.current.has(job.id) || map.current !== instance)
            return;
          pickupRoute = toPickup;
          pickupRouteReady = true;
          pickupMotion = createRouteMotion(
            pickupRoute,
            fallbackSpeedKmh,
            vehicle.topSpeedKmh ?? 130,
          );
          if (
            !job.pickupRouteCoordinates ||
            job.pickupFerryCrossings === undefined
          ) {
            const routeStartedAt = new Date().toISOString();
            journey = getJobMotionJourney(
              {
                ...job,
                acceptedAt: routeStartedAt,
                pickupRouteCoordinates: toPickup.coordinates as Coordinates[],
              },
              vehicle,
            );
            onSaveJobPickupRoute(
              job.id,
              toPickup.coordinates.map(([longitude, latitude]) => [
                longitude,
                latitude,
              ]),
              toPickup.ferryCrossings,
              toPickup.durationMinutes ??
                Math.max(
                  1,
                  (distanceKmBetween(start, jobPickup(job)) /
                    Math.max(1, fallbackSpeedKmh)) *
                    60,
                ),
            );
          }
        };
        const requestPickupRoute = () => {
          void fetchRoute(start, jobPickup(job))
            .then(applyPickupRoute)
            .catch((error) => {
              if (import.meta.env.DEV)
                console.warn(
                  "[taxi] pickup road route unavailable; retrying",
                  error,
                );
              window.setTimeout(() => {
                if (!pickupRouteReady && liveJobIds.current.has(job.id))
                  requestPickupRoute();
              }, 2_000);
            });
        };
        requestPickupRoute();
        if (passengerRouteNeedsRepair(job)) {
          void fetchRoute(jobPickup(job), jobDestination(job))
            .then((resolvedRoute) => {
              if (!liveJobIds.current.has(job.id) || map.current !== instance)
                return;
              passengerRoute = resolvedRoute;
              passengerMotion = createRouteMotion(
                passengerRoute,
                fallbackSpeedKmh,
                vehicle.topSpeedKmh ?? 130,
              );
              (
                instance.getSource(routeSourceId) as
                  | mapboxgl.GeoJSONSource
                  | undefined
              )?.setData(lineString(passengerRoute.coordinates));
              onSaveJobRoute(
                job.id,
                resolvedRoute.coordinates.map(([longitude, latitude]) => [
                  longitude,
                  latitude,
                ]),
                resolvedRoute.ferryCrossings,
              );
            })
            .catch((error) => {
              if (import.meta.env.DEV)
                console.warn("[taxi] passenger road route unavailable", error);
            });
        }
      }

      const animate = () => {
        if (map.current !== instance || !instance.getSource(taxiSourceId))
          return;
        const timer = liveJobTimers.current.get(job.id);
        if (timer !== undefined) {
          cancelMapFrame(timer);
          liveJobTimers.current.delete(job.id);
        }
        const now = Date.now();

        const liveMotionTime = getJobMotionTime(job, now) - localFerryDelayMs;

        const time = frozenFerryMotionTime ?? liveMotionTime;

        if (!pickupRouteReady) {
          (instance.getSource(taxiSourceId) as mapboxgl.GeoJSONSource).setData(
            point(start),
          );
          (
            instance.getSource(routeSourceId) as
              | mapboxgl.GeoJSONSource
              | undefined
          )?.setData(lineString(passengerRoute.coordinates));
          if (document.visibilityState !== "hidden")
            liveJobTimers.current.set(job.id, scheduleMapFrame(animate));
          return;
        }
        const pickupFerryKey = `${vehicle.id}:job:${job.id}:pickup`;
        job.completedPickupFerryCrossings?.forEach((index) =>
          completedFerryCrossings.current.add(`${pickupFerryKey}:${index}`),
        );
        const pickingUp =
          time < journey.pickupAt ||
          !ferryCrossingsComplete(
            pickupFerryKey,
            pickupRoute,
            completedFerryCrossings.current,
          );
        const from = pickingUp ? journey.departsAt : journey.pickupAt;
        const to = pickingUp ? journey.pickupAt : journey.arrivesAt;
        const route = pickingUp ? pickupRoute : passengerRoute;
        const elapsed = Math.max(0, Math.min(1, (time - from) / (to - from)));
        const motion = pickingUp
          ? pickupMotion(elapsed)
          : passengerMotion(elapsed);
        const { progress } = motion;
        let currentPosition = routePosition(route.coordinates, progress);
        let ferryState: "waiting" | "aboard" | null = motion.waitingForFerry
          ? "waiting"
          : motion.onFerry
            ? "aboard"
            : null;
        const ferryLeg = pickingUp ? "pickup" : "passenger";
        const ferryKey = `${vehicle.id}:job:${job.id}:${ferryLeg}`;
        const persistedCrossings = pickingUp
          ? job.completedPickupFerryCrossings
          : job.completedFerryCrossings;
        persistedCrossings?.forEach((index) =>
          completedFerryCrossings.current.add(`${ferryKey}:${index}`),
        );
        const ferryPosition = positionVehicleOnOwnedFerry(
          ferryKey,
          route,
          motion,
          transportRoutesRef.current,
          transportAssetsRef.current,
          boardedFerryCrossings.current,
          completedFerryCrossings.current,
          now,
        );
        if (ferryPosition) {
          currentPosition = ferryPosition.position;

          ferryState = ferryPosition.state;

          if (
            (ferryState === "waiting" || ferryState === "aboard") &&
            frozenFerryMotionTime === null
          ) {
            frozenFerryMotionTime = time;
          }

          if (ferryPosition.completedNow) {
            const ferryEndElapsed = motion.ferryCrossingEndElapsed ?? elapsed;

            const desiredMotionTime = from + (to - from) * ferryEndElapsed;

            const unfrozenMotionTime =
              getJobMotionTime(job, now) - localFerryDelayMs;

            const addedDelayMs = unfrozenMotionTime - desiredMotionTime;

            localFerryDelayMs += addedDelayMs;

            frozenFerryMotionTime = null;

            onJobFerryCrossingComplete(
              job.id,
              ferryLeg,
              ferryPosition.crossingIndex,
              addedDelayMs,
            );
          }
        }
        (instance.getSource(taxiSourceId) as mapboxgl.GeoJSONSource).setData(
          point(currentPosition, {
            ferryStatus:
              ferryState === "waiting"
                ? "Waiting for ferry"
                : ferryState === "aboard"
                  ? "On ferry"
                  : "",
          }),
        );
        if (
          now - lastRouteUpdateAt >= ROUTE_GEOMETRY_UPDATE_INTERVAL_MS ||
          time >= journey.arrivesAt
        ) {
          const routeAhead = pickingUp
            ? [
                ...remainingRoute(pickupRoute.coordinates, progress),
                ...passengerRoute.coordinates.slice(1),
              ]
            : remainingRoute(passengerRoute.coordinates, progress);
          (
            instance.getSource(routeSourceId) as
              | mapboxgl.GeoJSONSource
              | undefined
          )?.setData(lineString(routeAhead));
          lastRouteUpdateAt = now;
        }
        if (pickingUp !== lastPickingUp || ferryState !== lastFerryState) {
          instance.setPaintProperty(
            taxiSourceId,
            "circle-color",
            mapVehicleColor(
              vehicle,
              ferryState === "waiting"
                ? vehicleColor.waitingForFerry
                : ferryState === "aboard"
                  ? vehicleColor.onFerry
                  : pickingUp
                    ? vehicleColor.pickingUp
                    : vehicleColor.carryingPassenger,
            ),
          );
          lastPickingUp = pickingUp;
          lastFerryState = ferryState;
        }
        const passengerSource = instance.getSource(passengerSourceId) as
          | mapboxgl.GeoJSONSource
          | undefined;
        // The halo waits at pickup, then rides with the passenger's vehicle.
        passengerSource?.setData(
          point(pickingUp ? jobPickup(job) : currentPosition, {
            title: job.pickupLabel,
          }),
        );
        const passengerFerryKey = `${vehicle.id}:job:${job.id}:passenger`;
        const passengerFerriesComplete = ferryCrossingsComplete(
          passengerFerryKey,
          passengerRoute,
          completedFerryCrossings.current,
        );
        if (
          (time < journey.arrivesAt || !passengerFerriesComplete) &&
          document.visibilityState !== "hidden"
        ) {
          liveJobTimers.current.set(job.id, scheduleMapFrame(animate));
        } else if (time >= journey.arrivesAt && passengerFerriesComplete) {
          liveJobRunners.current.delete(job.id);
          if (!arrivedJobIds.current.has(job.id)) {
            arrivedJobIds.current.add(job.id);
            console.debug("[taxi] arrived; settling job and territory", {
              jobId: job.id,
              routeCoordinates: passengerRoute.coordinates.length,
            });
            onTaxiArrived(job.id);
          }
        }
      };

      // Start the runner now so it can hold the marker through the dispatch
      // pause, then pull away without waiting for a separate game tick.
      liveJobRunners.current.set(job.id, animate);
      animate();
    }

    // Leave the completed taxi dot at its destination without rebuilding the map.
    for (const job of jobs.filter(
      (candidate) => candidate.status === "complete",
    )) {
      const vehicle = vehicles.find(
        (candidate) => candidate.id === job.assignedVehicleId,
      );
      if (!vehicle) continue;
      const sourceId = vehicleSourceId(vehicle.id);
      const taxiSource = instance.getSource(sourceId) as
        | mapboxgl.GeoJSONSource
        | undefined;
      const timer = liveJobTimers.current.get(job.id);
      if (timer !== undefined) cancelMapFrame(timer);
      liveJobTimers.current.delete(job.id);
      liveJobRunners.current.delete(job.id);
      liveJobIds.current.delete(job.id);
      taxiSource?.setData(point(jobDestination(job)));
      if (instance.getLayer(sourceId))
        instance.setPaintProperty(
          sourceId,
          "circle-color",
          mapVehicleColor(vehicle, vehicleColor.available),
        );
      const routeSourceId = jobRouteSourceId(job.id);

      if (instance.getLayer(`${routeSourceId}-glow`)) {
        instance.removeLayer(`${routeSourceId}-glow`);
      }

      if (instance.getLayer(routeSourceId)) {
        instance.removeLayer(routeSourceId);
      }

      if (instance.getSource(routeSourceId)) {
        instance.removeSource(routeSourceId);
      }
    }
  }, [
    cityId,
    customCities,
    focusedJobId,
    jobs,
    vehicles,
    mapRevision,
    onOpenJob,
    onSaveJobPickupRoute,
    onSaveJobRoute,
    onJobFerryCrossingComplete,
    onTaxiArrived,
  ]);

  // Recovery trips can begin long after Mapbox was constructed. Animate them
  // in their own synchronized effect so a newly tired driver drives away
  // immediately instead of having the marker jump when tickJobs settles it.
  useEffect(() => {
    const instance = map.current;
    if (!instance?.isStyleLoaded()) return;
    const abortController = new AbortController();
    const timers = new Set<number>();

    vehicles
      .filter((vehicle) => vehicle.serviceTrip)
      .forEach((vehicle) => {
        const service = vehicle.serviceTrip!;
        const vehicleId = vehicleSourceId(vehicle.id);
        let routeReady = false;
        let roadRoute: RouteDetails = {
          coordinates: [service.from, service.from],
          speedLimits: [],
          ferryCrossings: [],
        };
        let roadMotion = createRouteMotion(
          roadRoute,
          45,
          vehicle.topSpeedKmh ?? 130,
        );
        ensureFerryWaitLabel(instance, vehicleId);

        if (token)
          void resolveRoadRoute(
            service.from,
            service.destination,
            abortController.signal,
          )
            .then((resolved) => {
              if (!resolved || abortController.signal.aborted) return;
              roadRoute = resolved;
              roadMotion = createRouteMotion(
                roadRoute,
                45,
                vehicle.topSpeedKmh ?? 130,
              );
              routeReady = true;
            })
            .catch(() => undefined);

        let timer: number | undefined;
        let lastFerryState: "waiting" | "aboard" | null | undefined;
        const animate = () => {
          if (timer !== undefined) timers.delete(timer);
          const startedAt = new Date(service.startedAt).getTime();
          const arrivesAt = new Date(service.arrivesAt).getTime();
          const progress = Math.max(
            0,
            Math.min(
              1,
              (Date.now() - startedAt) / Math.max(1, arrivesAt - startedAt),
            ),
          );
          const motion = routeReady
            ? roadMotion(progress)
            : {
                progress: 0,
                waitingForFerry: false,
                onFerry: false,
                ferryCrossingIndex: null,
                ferryCrossingEndElapsed: null,
              };
          let ferryState: "waiting" | "aboard" | null = motion.waitingForFerry
            ? "waiting"
            : motion.onFerry
              ? "aboard"
              : null;
          let currentPosition = routePosition(
            roadRoute.coordinates,
            motion.progress,
          );
          const ferryPosition = positionVehicleOnOwnedFerry(
            `${vehicle.id}:service:${service.startedAt}`,
            roadRoute,
            motion,
            transportRoutesRef.current,
            transportAssetsRef.current,
            boardedFerryCrossings.current,
            completedFerryCrossings.current,
            Date.now(),
          );
          if (ferryPosition) {
            currentPosition = ferryPosition.position;
            ferryState = ferryPosition.state;
          }
          (
            instance.getSource(vehicleId) as mapboxgl.GeoJSONSource | undefined
          )?.setData(
            point(currentPosition, {
              ferryStatus:
                ferryState === "waiting"
                  ? "Waiting for ferry"
                  : ferryState === "aboard"
                    ? "On ferry"
                    : "",
            }),
          );
          if (ferryState !== lastFerryState && instance.getLayer(vehicleId)) {
            instance.setPaintProperty(
              vehicleId,
              "circle-color",
              mapVehicleColor(
                vehicle,
                ferryState === "waiting"
                  ? vehicleColor.waitingForFerry
                  : ferryState === "aboard"
                    ? vehicleColor.onFerry
                    : vehicleColor.maintenance,
              ),
            );
            lastFerryState = ferryState;
          }
          instance.triggerRepaint();
          if (progress < 1 && document.visibilityState !== "hidden") {
            timer = scheduleMapFrame(animate);
            timers.add(timer);
          }
        };
        animate();
      });

    return () => {
      abortController.abort();
      timers.forEach(cancelMapFrame);
    };
  }, [vehicles, mapRevision]);

  // Boat markers are DOM markers kept across state transitions. Cancelling and
  // restarting their animation never removes them, so a shuttle changing
  // direction cannot blink out. Live route lines are intentionally omitted.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const timers = new Set<number>();
    const ferryAssets = transportAssets.filter(
      (asset) => asset.mode === "ferry",
    );
    const currentIds = new Set(ferryAssets.map((asset) => asset.id));

    ferryMarkers.current.forEach((marker, assetId) => {
      if (currentIds.has(assetId)) return;
      marker.remove();
      ferryMarkers.current.delete(assetId);
    });

    ferryAssets.forEach((asset) => {
      let marker = ferryMarkers.current.get(asset.id);
      let isNewMarker = false;
      if (!marker) {
        const element = document.createElement("div");
        element.className = "ferry-map-marker";
        element.textContent = "⛴";
        element.setAttribute("aria-label", asset.name);
        marker = new mapboxgl.Marker({ element, anchor: "center" }).setPopup(
          new mapboxgl.Popup({ offset: 18 }).setText(asset.name),
        );
        ferryMarkers.current.set(asset.id, marker);
        isNewMarker = true;
      }

      const journey = asset.journey;
      const route = journey
        ? transportRoutes.find((candidate) => candidate.id === journey.routeId)
        : undefined;
      const cityPosition = getCity(asset.cityId, customCities)?.coordinates;
      if (
        !journey ||
        !route?.routeCoordinates ||
        route.routeCoordinates.length < 2
      ) {
        const harbourPosition = route?.originCoordinates ?? cityPosition;
        if (harbourPosition) {
          marker.setLngLat(harbourPosition);
          if (isNewMarker) marker.addTo(instance);
        }
        return;
      }

      const coordinates =
        journey.direction === "returning"
          ? [...route.routeCoordinates].reverse()
          : route.routeCoordinates;
      const startedAt = new Date(journey.startedAt).getTime();
      const arrivesAt = new Date(journey.arrivesAt).getTime();
      const initialProgress = Math.max(
        0,
        Math.min(
          1,
          (Date.now() - startedAt) / Math.max(1, arrivesAt - startedAt),
        ),
      );
      marker.setLngLat(routePosition(coordinates, initialProgress));
      if (isNewMarker) marker.addTo(instance);
      let timer: number | undefined;
      const animate = () => {
        if (timer !== undefined) timers.delete(timer);
        const progress = Math.max(
          0,
          Math.min(
            1,
            (Date.now() - startedAt) / Math.max(1, arrivesAt - startedAt),
          ),
        );
        marker!.setLngLat(routePosition(coordinates, progress));
        if (progress < 1 && document.visibilityState !== "hidden") {
          timer = scheduleMapFrame(animate);
          timers.add(timer);
        }
      };
      animate();
    });

    return () => {
      timers.forEach(cancelMapFrame);
    };
  }, [transportAssets, transportRoutes, customCities, mapRevision]);

  useEffect(
    () => () => {
      ferryMarkers.current.forEach((marker) => marker.remove());
      ferryMarkers.current.clear();
      boardedFerryCrossings.current.clear();
      completedFerryCrossings.current.clear();
    },
    [],
  );

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    const sourceId = "focused-job-route";

    const instanceIsUsable = () => {
      // The map-construction effect can dispose this captured Mapbox instance
      // before this effect's cleanup runs. Never touch a stale instance.
      if (map.current !== instance) return false;

      try {
        return instance.isStyleLoaded();
      } catch {
        return false;
      }
    };

    const removeFocusedRoute = () => {
      if (!instanceIsUsable()) return;

      try {
        if (instance.getLayer(sourceId)) instance.removeLayer(sourceId);
        if (instance.getLayer(`${sourceId}-glow`))
          instance.removeLayer(`${sourceId}-glow`);
        if (instance.getSource(sourceId)) instance.removeSource(sourceId);
      } catch {
        // React effect cleanup can race with Mapbox teardown.
        // At that point there is nothing left to remove.
      }
    };

    if (!instanceIsUsable()) return;

    removeFocusedRoute();

    const job = jobs.find((candidate) => candidate.id === focusedJobId);
    if (!job) return;

    // Accepted jobs already have a live route that is trimmed behind the taxi.
    // Do not overlay it with the complete preview route again.
    if (job.status === "accepted") return;

    const assignedVehicle = vehicles.find(
      (vehicle) => vehicle.id === job.assignedVehicleId,
    );
    const availableVehicle = vehicles
      .filter(
        (vehicle) =>
          vehicle.type === "taxi" &&
          vehicle.status === "available" &&
          vehicle.position,
      )
      .sort((left, right) => {
        const leftDistance = Math.hypot(
          left.position![0] - job.pickup[0],
          left.position![1] - job.pickup[1],
        );
        const rightDistance = Math.hypot(
          right.position![0] - job.pickup[0],
          right.position![1] - job.pickup[1],
        );
        return leftDistance - rightDistance;
      })[0];

    const start =
      assignedVehicle?.position ??
      availableVehicle?.position ??
      getCity(cityId, customCities)?.coordinates;
    if (!start) return;

    const abortController = new AbortController();

    const drawRoute = (coordinates: number[][]) => {
      if (abortController.signal.aborted || !instanceIsUsable()) return;

      removeFocusedRoute();

      if (!instanceIsUsable()) return;

      try {
        instance.addSource(sourceId, {
          type: "geojson",
          data: lineString(coordinates),
        });

        instance.addLayer({
          id: `${sourceId}-glow`,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": missionColor(job.id),
            "line-width": ROUTE_GLOW_WIDTH,
            "line-opacity": 0.2,
            "line-blur": 4,
          },
        });

        instance.addLayer({
          id: sourceId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": missionColor(job.id),
            "line-width": 2.5,
            "line-opacity": 0.95,
          },
        });

        const bounds = coordinates.reduce(
          (routeBounds, coordinate) =>
            routeBounds.extend(coordinate as Coordinates),
          new mapboxgl.LngLatBounds(
            coordinates[0] as Coordinates,
            coordinates[0] as Coordinates,
          ),
        );
        instance.fitBounds(bounds, {
          padding: { top: 110, right: 45, bottom: 150, left: 45 },
          maxZoom: 15,
          pitch: 8,
          bearing: 0,
          duration: 900,
        });
      } catch {
        // Ignore a draw that loses the race with map/style teardown.
      }
    };

    const loadRoute = async () => {
      if (!token) {
        const passengerCoordinates = job.routeCoordinates ?? [
          jobPickup(job),
          jobDestination(job),
        ];
        drawRoute([start, ...passengerCoordinates]);
        return;
      }

      try {
        const fetchRoute = async (from: Coordinates, to: Coordinates) => {
          const route = await resolveRoadRoute(
            from,
            to,
            abortController.signal,
          );
          if (route) return route;
          throw new Error("No detailed road route was returned.");
        };

        const [pickupRoute, passengerRoute] = await Promise.all([
          job.pickupRouteCoordinates?.length &&
          job.pickupRouteCoordinates.length >= 2
            ? Promise.resolve({
                coordinates: job.pickupRouteCoordinates,
                ferryCrossings: job.pickupFerryCrossings ?? [],
              })
            : fetchRoute(start, jobPickup(job)),
          passengerRouteNeedsRepair(job)
            ? fetchRoute(jobPickup(job), jobDestination(job))
            : Promise.resolve({
                coordinates: job.routeCoordinates!,
                ferryCrossings: job.ferryCrossings ?? [],
              }),
        ]);
        if (passengerRouteNeedsRepair(job))
          onSaveJobRoute(
            job.id,
            passengerRoute.coordinates.map(([longitude, latitude]) => [
              longitude,
              latitude,
            ]),
            passengerRoute.ferryCrossings,
          );
        drawRoute([
          ...pickupRoute.coordinates,
          ...passengerRoute.coordinates.slice(1),
        ]);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          const passengerCoordinates = job.routeCoordinates ?? [
            jobPickup(job),
            jobDestination(job),
          ];
          drawRoute([start, ...passengerCoordinates]);
        }
      }
    };

    void loadRoute();

    return () => {
      abortController.abort();
      removeFocusedRoute();
    };
  }, [
    cityId,
    customCities,
    focusedJobId,
    jobs,
    vehicles,
    mapRevision,
    onSaveJobRoute,
  ]);

  return (
    <div
      ref={container}
      className="game-map"
      aria-label="Interactive game map"
    />
  );
}

export const GameMap = memo(
  GameMapView,
  (previous, next) =>
    previous.layoutKey === next.layoutKey &&
    previous.cityId === next.cityId &&
    previous.customCities === next.customCities &&
    previous.branches === next.branches &&
    previous.hotels === next.hotels &&
    previous.territoryExpansions === next.territoryExpansions &&
    previous.exploredTerritory === next.exploredTerritory &&
    previous.vehicles === next.vehicles &&
    previous.transportAssets === next.transportAssets &&
    previous.transportRoutes === next.transportRoutes &&
    previous.globalFerryRoutes === next.globalFerryRoutes &&
    previous.purchasedHarbours === next.purchasedHarbours &&
    previous.placingStation === next.placingStation &&
    previous.placingTerritory === next.placingTerritory &&
    previous.placingHotel === next.placingHotel &&
    previous.onBuildStation === next.onBuildStation &&
    previous.onExpandTerritory === next.onExpandTerritory &&
    previous.onBuildHotel === next.onBuildHotel &&
    previous.onBuyHarbour === next.onBuyHarbour &&
    previous.focusedJobId === next.focusedJobId &&
    previous.onOpenJob === next.onOpenJob &&
    previous.onSaveJobPickupRoute === next.onSaveJobPickupRoute &&
    previous.onSaveJobRoute === next.onSaveJobRoute &&
    previous.onJobFerryCrossingComplete === next.onJobFerryCrossingComplete &&
    previous.onTaxiArrived === next.onTaxiArrived &&
    previous.jobs === next.jobs,
);
