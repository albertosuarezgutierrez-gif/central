// Adaptador del proveedor APIVehículo (apivehiculo.com/docs). Confirmado
// contra su documentación oficial (OpenAPI) el 15/09/2026.
import type { DatosVehiculo } from './tipos.ts'

const BASE_URL = 'https://api.apivehiculo.com/v1'

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function mapearRespuesta(matricula: string, data: Record<string, unknown>): DatosVehiculo {
  return {
    matricula,
    marca: str(data.brand),
    modelo: str(data.model),
    version: str(data.version),
    potenciaCv: num(data.powerHP),
    potenciaKw: num(data.powerKW),
    cilindradaCc: num(data.displacementCcm),
    combustible: str(data.fuelType),
    fechaMatriculacion: str(data.firstRegistrationDate),
    vin: str(data.vin),
    transmision: str(data.transmissionType),
    numeroPlazas: num(data.passengerCount),
    numeroPuertas: num(data.doorCount),
    bruto: data,
  }
}

/** `null` si el proveedor no encuentra la matrícula (404). Lanza en cualquier otro fallo. */
export async function consultarApiVehiculo(matricula: string, pais: 'ES' | 'PT' = 'ES'): Promise<DatosVehiculo | null> {
  const key = process.env.APIVEHICULO_API_KEY || ''
  if (!key) throw new Error('APIVEHICULO_API_KEY no configurada')
  const q = new URLSearchParams({ plate: matricula, country: pais })
  const r = await fetch(`${BASE_URL}/vehicles/lookup?${q.toString()}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (r.status === 404) return null
  if (r.status === 429) throw new Error('APIVehículo: límite de consultas del plan alcanzado')
  if (!r.ok) throw new Error(`APIVehículo HTTP ${r.status}`)
  const json = (await r.json()) as { data: Record<string, unknown> }
  return mapearRespuesta(matricula, json.data)
}
