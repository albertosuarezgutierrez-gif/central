// Directorio de contacto por compañía aseguradora (`seguros.companias_dgs`),
// servido por asegura en `GET /api/operador/companias`. Mismo patrón de dos
// partes que `duplicados-asegura.ts`: lo PURO (interpretar la respuesta) y la
// RED (solo desde la ruta API de plataforma).
//
// Es una tabla de REFERENCIA, no de cliente: sin cartera_id, sin PII de
// terceros — el contacto es de un empleado de la aseguradora, no de un
// asegurado. Aun así se sirve por el puerto porque esta app no tiene grant
// sobre el schema `seguros` (solo `prisma_seguros`/`crm_seguros` lo tienen).

export type Compania = {
  codigoDgs: string
  nombreComun: string
  nombreCima: string | null
  enCima: boolean
  contactoNombre: string | null
  contactoCargo: string | null
  contactoEmail: string | null
  contactoTelefono: string | null
  claveMediador: string | null
  notas: string | null
}

export type RespuestaCompanias =
  | { estado: 'ok'; companias: Compania[] }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function leerCompania(v: unknown): Compania | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const codigoDgs = cadena(o.codigoDgs)
  const nombreComun = cadena(o.nombreComun)
  if (codigoDgs === null || nombreComun === null) return null
  return {
    codigoDgs,
    nombreComun,
    nombreCima: cadena(o.nombreCima),
    enCima: o.enCima === true,
    contactoNombre: cadena(o.contactoNombre),
    contactoCargo: cadena(o.contactoCargo),
    contactoEmail: cadena(o.contactoEmail),
    contactoTelefono: cadena(o.contactoTelefono),
    claveMediador: cadena(o.claveMediador),
    notas: cadena(o.notas),
  }
}

/** Lista de compañías, o `null` si no llega o no es lista — nunca `[]` por defecto. */
export function leerCompanias(v: unknown): Compania[] | null {
  if (!Array.isArray(v)) return null
  return v.map(leerCompania).filter((c): c is Compania => c !== null)
}

export function interpretarCompanias(status: number, json: unknown): RespuestaCompanias {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 200 && o.estado === 'ok') {
    const companias = leerCompanias(o.companias)
    if (companias === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    return { estado: 'ok', companias }
  }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

// ─── Red (solo desde la ruta API de plataforma) ──────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export type Reenvio = { status: number; json: unknown }

export async function companiasAsegura(): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/companias`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
