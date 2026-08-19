import { getCity } from '../data/cities'
import type {
  Company,
  Coordinates,
  Passenger,
  TaxiJob,
  Vehicle,
} from '../models/game'

const locations = [
  ['Central Station', 0.012, 0.006],
  ['Riverside Hotel', -0.015, 0.008],
  ['Market Square', 0.009, -0.011],
  ['City Hospital', -0.008, -0.014],
  ['Airport Terminal', 0.035, 0.025],
  ['Old Town', -0.019, 0.002],
] as const

const passengerNames = [
  'Aisling Murphy',
  'Conor Byrne',
  'Sophie Kelly',
  'Liam Walsh',
  'Niamh Ryan',
  'Jack Doyle',
]

export const JOB_REQUEST_INTERVAL_MS = 30_000
export const MAX_JOB_OFFERS = 6

const offset = (
  origin: Coordinates,
  longitude: number,
  latitude: number
): Coordinates => [
  origin[0] + longitude,
  origin[1] + latitude,
]

const distance = (a: Coordinates, b: Coordinates) => {
  const latitudeKm = (b[1] - a[1]) * 111
  const longitudeKm =
    (b[0] - a[0]) *
    111 *
    Math.cos((a[1] * Math.PI) / 180)

  return Math.max(
    1,
    Math.round(Math.hypot(latitudeKm, longitudeKm) * 10) / 10
  )
}

export function createJobOffers(
  cityId: string,
  id: () => string = () => crypto.randomUUID()
): {
  jobs: TaxiJob[]
  passengers: Passenger[]
} {
  const city = getCity(cityId)

  if (!city) {
    return {
      jobs: [],
      passengers: [],
    }
  }

  const passengers = passengerNames
    .slice(0, 4)
    .map((name, index) => ({
      id: id(),
      name,
      partySize: (index % 3) + 1,
    }))

  const jobs = passengers.map((passenger, index) => {
    const pickupPlace = locations[index]
    const destinationPlace = locations[index + 2]

    const pickup = offset(
      city.coordinates,
      pickupPlace[1],
      pickupPlace[2]
    )

    const destination = offset(
      city.coordinates,
      destinationPlace[1],
      destinationPlace[2]
    )

    const distanceKm = distance(pickup, destination)

    return {
      id: id(),
      cityId,
      pickup,
      destination,
      pickupLabel: pickupPlace[0],
      destinationLabel: destinationPlace[0],
      passengerIds: [passenger.id],
      fare: Math.round(
        5 +
          distanceKm * 2.4 +
          passenger.partySize * 1.5
      ),
      distanceKm,
      durationMinutes: Math.max(
        5,
        Math.round(distanceKm * 3.2)
      ),
      status: 'offered' as const,
    }
  })

  return {
    jobs,
    passengers,
  }
}

export function createRandomJobOffer(
  cityId: string,
  id: () => string = () => crypto.randomUUID(),
  random: () => number = () => Math.random()
): {
  job: TaxiJob
  passenger: Passenger
} | null {
  const city = getCity(cityId)

  if (!city) {
    return null
  }

  const pickupIndex = Math.floor(
    random() * locations.length
  )

  let destinationIndex = Math.floor(
    random() * (locations.length - 1)
  )

  if (destinationIndex >= pickupIndex) {
    destinationIndex += 1
  }

  const pickupPlace = locations[pickupIndex]
  const destinationPlace = locations[destinationIndex]

  const pickup = offset(
    city.coordinates,
    pickupPlace[1],
    pickupPlace[2]
  )

  const destination = offset(
    city.coordinates,
    destinationPlace[1],
    destinationPlace[2]
  )

  const distanceKm = distance(
    pickup,
    destination
  )

  const passenger: Passenger = {
    id: id(),
    name:
      passengerNames[
        Math.floor(random() * passengerNames.length)
      ],
    partySize: Math.floor(random() * 3) + 1,
  }

  return {
    passenger,
    job: {
      id: id(),
      cityId,
      pickup,
      destination,
      pickupLabel: pickupPlace[0],
      destinationLabel: destinationPlace[0],
      passengerIds: [passenger.id],
      fare: Math.round(
        5 +
          distanceKm * 2.4 +
          passenger.partySize * 1.5
      ),
      distanceKm,
      durationMinutes: Math.max(
        5,
        Math.round(distanceKm * 3.2)
      ),
      status: 'offered',
    },
  }
}

export function acceptJobState(
  jobs: TaxiJob[],
  vehicles: Vehicle[],
  jobId: string
) {
  if (
    jobs.some(
      (job) => job.status === 'accepted'
    )
  ) {
    return null
  }

  const vehicle = vehicles.find(
    (candidate) =>
      candidate.status === 'available'
  )

  const job = jobs.find(
    (candidate) =>
      candidate.id === jobId &&
      candidate.status === 'offered'
  )

  if (!vehicle || !job) {
    return null
  }

  return {
    jobs: jobs.map((candidate) =>
      candidate.id === jobId
        ? {
            ...candidate,
            status: 'accepted' as const,
          }
        : candidate
    ),

    vehicles: vehicles.map((candidate) =>
      candidate.id === vehicle.id
        ? {
            ...candidate,
            status: 'on-job' as const,
          }
        : candidate
    ),
  }
}

export function completeJobState(
  company: Company,
  jobs: TaxiJob[],
  vehicles: Vehicle[],
  jobId: string
) {
  const job = jobs.find(
    (candidate) =>
      candidate.id === jobId &&
      candidate.status === 'accepted'
  )

  if (!job) {
    return null
  }

  return {
    company: {
      ...company,
      cash: company.cash + job.fare,
      reputation:
        company.reputation + 1,
    },

    jobs: jobs.map((candidate) =>
      candidate.id === jobId
        ? {
            ...candidate,
            status: 'complete' as const,
          }
        : candidate
    ),

    vehicles: vehicles.map((candidate) =>
      candidate.status === 'on-job'
        ? {
            ...candidate,
            status: 'available' as const,
          }
        : candidate
    ),
  }
}