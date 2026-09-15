// Adaptador del proveedor APIVehículo (apivehiculo.com). Autenticación Bearer
// token confirmada por su propia web, pero la RUTA exacta del endpoint NO se ha
// podido verificar contra su documentación (dominio bloqueado desde esta sesión)
// — `APIVEHICULO_PATH` deja el patrón configurable sin tocar código el día que
// se confirme o cambie. Antes de dar esto por productivo, probar con una
// matrícula real y ajustar `mapearRespuesta` al JSON que devuelva de verdad.
import type { DatosVehiculo } from './tipos.ts'

const BASE_URL = process.env.APIVEHICULO_BASE_URL || 'https://api.apivehiculo.com'
const PATH = process.env.APIVEHICULO_PATH || '/v1/matricula/{matricula}'

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function mapearRespuesta(matricula: string, json: Record<string, unknown>): DatosVehiculo {
  return {
    matricula,
    marca: str(json.marca),
    modelo: str(json.modelo),
    version: str(json.version ?? json.versión),
    potenciaCv: num(json.potenciaCv ?? json.potencia_cv ?? json.potencia),
    cilindradaCc: num(json.cilindradaCc ?? json.cilindrada_cc ?? json.cilindrada),
    combustible: str(json.combustible),
    fechaMatriculacion: str(json.fechaMatriculacion ?? json.fecha_matriculacion),
    bruto: json,
  }
}

/** `null` si el proveedor no encuentra la matrícula (404). Lanza en cualquier otro fallo. */
export async function consultarApiVehiculo(matricula: string): Promise<DatosVehiculo | null> {
  const key = process.env.APIVEHICULO_API_KEY || ''
  if (!key) throw new Error('APIVEHICULO_API_KEY no configurada')
  const url = `${BASE_URL}${PATH.replace('{matricula}', encodeURIComponent(matricula))}`
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`APIVehículo HTTP ${r.status}`)
  return mapearRespuesta(matricula, await r.json())
}
