// Directorio de contacto por compañía aseguradora (`seguros.companias_dgs` +
// `seguros.compania_contactos`), servido por asegura en
// `GET /api/operador/companias`. Mismo patrón de dos partes que
// `duplicados-asegura.ts`: lo PURO (interpretar la respuesta) y la RED (solo
// desde la ruta API de plataforma).
//
// Desde el 13/09/2026 cada compañía trae VARIOS contactos (antes un contacto
// único plano): docs/superpowers/specs/2026-09-13-companias-contactos-multiples-design.md.
//
// Es una tabla de REFERENCIA, no de cliente: sin cartera_id, sin PII de
// terceros — el contacto es de un empleado de la aseguradora, no de un
// asegurado. Aun así se sirve por el puerto porque esta app no tiene grant
// sobre el schema `seguros` (solo `prisma_seguros`/`crm_seguros` lo tienen).

import { areaContacto, type AreaContacto } from '@central/module-seguros'

export type Contacto = {
  id: string
  nombre: string
  cargo: string | null
  area: AreaContacto | null
  email: string | null
  telefono: string | null
  notas: string | null
  orden: number
  ultimoContactoEn: string | null
}

export type Compania = {
  codigoDgs: string
  nombreComun: string
  nombreCima: string | null
  enCima: boolean
  claveMediador: string | null
  notas: string | null
  contactos: Contacto[]
}

export type RespuestaCompanias =
  | { estado: 'ok'; companias: Compania[] }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function entero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0
}

function leerContacto(v: unknown): Contacto | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = cadena(o.id)
  const nombre = cadena(o.nombre)
  if (id === null || nombre === null) return null
  return {
    id,
    nombre,
    cargo: cadena(o.cargo),
    area: areaContacto(o.area),
    email: cadena(o.email),
    telefono: cadena(o.telefono),
    notas: cadena(o.notas),
    orden: entero(o.orden),
    ultimoContactoEn: cadena(o.ultimoContactoEn),
  }
}

/** Lista de contactos, o `[]` si no hay array — un contacto individual mal formado se descarta, no tumba la lista. */
function leerContactos(v: unknown): Contacto[] {
  if (!Array.isArray(v)) return []
  return v.map(leerContacto).filter((c): c is Contacto => c !== null)
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
    claveMediador: cadena(o.claveMediador),
    notas: cadena(o.notas),
    contactos: leerContactos(o.contactos),
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

function cabeceras(): Record<string, string> | null {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  return secret ? { Authorization: `Bearer ${secret}` } : null
}

export type Reenvio = { status: number; json: unknown }

export async function companiasAsegura(): Promise<Reenvio> {
  const h = cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/companias`, {
      headers: h,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

/** Marca un contacto como recién contactado. Best-effort: el llamador no bloquea el WhatsApp/mail por esto. */
export async function marcarContactoAsegura(contactoId: string): Promise<Reenvio> {
  const h = cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/companias/contacto/${encodeURIComponent(contactoId)}`, {
      method: 'PATCH',
      headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify({ accion: 'contactado' }),
      signal: AbortSignal.timeout(10_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
