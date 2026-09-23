import { cabecerasPuerto } from './puerto-actor.ts'
// Lectura del puerto `GET /api/operador/leads-web` de asegura: de los leads
// captados por la web pública de la correduría (`apps/asegura-web`), cuántos
// son hoy cartera viva. Es el prerrequisito que Alberto pidió antes de gastar
// en Ads («necesito saber que convierte antes de meterle presupuesto»).
//
// Mismo patrón que el resto de `/correduria` → «Datos»: puerto de asegura →
// este lector PURO y testeado → componente cliente con `onContador`. `null` en
// cualquier campo numérico es «no se ha podido leer», nunca 0 (regla NULL≠0).

export type LeadWebPendiente = {
  clienteId: string
  nombre: string
  createdAt: string
  diasDesdeAlta: number
  tieneTelefono: boolean
  tieneEmail: boolean
}

export type ConversionLeadsWeb =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  | {
      estado: 'ok'
      total: number
      convertidos: number
      tasaConversion: number | null
      pendientes: LeadWebPendiente[]
      primerLeadAt: string | null
      ultimoLeadAt: string | null
    }

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function booleano(v: unknown): boolean {
  return v === true
}

function leerPendientes(v: unknown): LeadWebPendiente[] {
  if (!Array.isArray(v)) return []
  const out: LeadWebPendiente[] = []
  for (const f of v) {
    if (typeof f !== 'object' || f === null) continue
    const o = f as Record<string, unknown>
    const clienteId = cadena(o.clienteId)
    const nombre = cadena(o.nombre)
    const createdAt = cadena(o.createdAt)
    const dias = entero(o.diasDesdeAlta)
    // Una fila sin id o sin fecha no se puede pintar de forma honesta: se
    // descarta la fila, no la lista entera (sigue contando en `total`).
    if (clienteId === null || nombre === null || createdAt === null || dias === null) continue
    out.push({
      clienteId,
      nombre,
      createdAt,
      diasDesdeAlta: dias,
      tieneTelefono: booleano(o.tieneTelefono),
      tieneEmail: booleano(o.tieneEmail),
    })
  }
  return out
}

/** Puro: interpreta la respuesta cruda del puerto. Nunca inventa un total ni una tasa. */
export function interpretarConversionLeadsWeb(status: number, json: unknown): ConversionLeadsWeb {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (r.estado !== 'ok') return { estado: 'error', motivo: 'respuesta_ilegible' }

  const total = entero(r.total)
  const convertidos = entero(r.convertidos)
  if (total === null || convertidos === null) return { estado: 'error', motivo: 'respuesta_ilegible' }

  return {
    estado: 'ok',
    total,
    convertidos,
    tasaConversion: numero(r.tasaConversion),
    pendientes: leerPendientes(r.pendientes),
    primerLeadAt: cadena(r.primerLeadAt),
    ultimoLeadAt: cadena(r.ultimoLeadAt),
  }
}

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export async function conversionLeadsWebAsegura(): Promise<ConversionLeadsWeb> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/leads-web`, {
      headers: { ...(await cabecerasPuerto(secret)) },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    const json = await res.json().catch(() => null)
    return interpretarConversionLeadsWeb(res.status, json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}
