import { cabecerasPuerto } from './puerto-actor.ts'
// Lectura del puerto `GET /api/operador/presupuesto/garantias-filtradas` de asegura: qué garantías
// marcan los clientes en el filtro del portal (29/09/2026). Lector PURO y testeado + fetch.
// Un fallo es `error`, nunca `ramos: []`: «nadie filtra nada» sobre datos no leídos sería falso.

export type GarantiaFiltrada = { clave: string; etiqueta: string; presupuestos: number }
export type RamoFiltrado = { ramo: string; presupuestos: number; garantias: GarantiaFiltrada[] }
export type GarantiasFiltradas =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  | { estado: 'ok'; presupuestosConActividad: number; ramos: RamoFiltrado[] }

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

export function interpretarGarantiasFiltradas(status: number, json: unknown): GarantiasFiltradas {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (!json || typeof json !== 'object') return { estado: 'error', motivo: 'respuesta_ilegible' }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (r.estado !== 'ok') return { estado: 'error', motivo: 'respuesta_ilegible' }
  const total = entero(r.presupuestosConActividad)
  if (total === null || !Array.isArray(r.ramos)) return { estado: 'error', motivo: 'respuesta_ilegible' }
  const ramos: RamoFiltrado[] = []
  for (const x of r.ramos) {
    const o = (x ?? {}) as Record<string, unknown>
    const ramo = texto(o.ramo)
    const n = entero(o.presupuestos)
    if (ramo === null || n === null || !Array.isArray(o.garantias)) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const garantias: GarantiaFiltrada[] = []
    for (const g of o.garantias) {
      const gg = (g ?? {}) as Record<string, unknown>
      const clave = texto(gg.clave)
      const etiqueta = texto(gg.etiqueta)
      const p = entero(gg.presupuestos)
      if (clave === null || etiqueta === null || p === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
      garantias.push({ clave, etiqueta, presupuestos: p })
    }
    ramos.push({ ramo, presupuestos: n, garantias })
  }
  return { estado: 'ok', presupuestosConActividad: total, ramos }
}

export async function garantiasFiltradasAsegura(): Promise<GarantiasFiltradas> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/presupuesto/garantias-filtradas`, {
      headers: { ...(await cabecerasPuerto(secret)) },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    const json = await res.json().catch(() => null)
    return interpretarGarantiasFiltradas(res.status, json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}
