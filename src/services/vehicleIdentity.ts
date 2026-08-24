import { postVehicleModels } from '../data/postVehicles'
import { taxiModels } from '../data/taxis'
import type { Vehicle } from '../models/game'

const hash = (value: string) => [...value].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 2166136261)

/** Creates a readable fictional fleet registration, while remaining stable for old saves. */
export const licensePlateForVehicle = (vehicle: Pick<Vehicle, 'id' | 'licensePlate'>) => {
  if (vehicle.licensePlate) return vehicle.licensePlate
  const value = hash(vehicle.id)
  const letters = String.fromCharCode(65 + value % 26, 65 + Math.floor(value / 26) % 26)
  return `TE-${letters} ${String(value % 10_000).padStart(4, '0')}`
}

export const vehicleMakeAndModel = (vehicle: Pick<Vehicle, 'modelId' | 'name' | 'type'>) => {
  const model = vehicle.type === 'post'
    ? postVehicleModels.find((candidate) => candidate.id === vehicle.modelId)
    : taxiModels.find((candidate) => candidate.id === vehicle.modelId)
  return model ? `${model.brand} ${model.name}` : vehicle.name
}