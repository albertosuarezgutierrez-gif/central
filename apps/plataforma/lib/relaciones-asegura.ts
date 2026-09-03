// Relaciones entre clientes de la correduría (cónyuge, hijo, empresa…) y la
// AUTORIZACIÓN para ver los seguros del otro, desde la pantalla de Alberto.
//
// La BD vive en `apps/asegura` (`seguros.cliente_relaciones`); esta app habla
// con su puerto (`/api/operador/cliente/relaciones`) con el secreto de operador.
// Dos partes, como en `cliente-edicion-asegura.ts`:
//
//   1. Lo PURO: leer el bloque `relaciones` de la ficha y las respuestas del
//      puerto. Test en `test/regression-relaciones-asegura.test.ts`; lo importan
//      también los client components (sin red ni env).
//   2. La RED: las llamadas al puerto, solo desde las rutas API de plataforma.
//
// Semántica fijada por `@central/module-seguros` (`relaciones.ts`) y que la
// pantalla repite en sus textos:
//   · `tipo` se lee DESDE la ficha: «María Antonia · Cónyuge/Pareja de Hecho»
//     = María Antonia es cónyuge de la ficha.
//   · `autorizaVer` = LA FICHA autoriza al relacionado a ver los seguros de la
//     ficha. `puedeVer` = la ficha puede ver los del relacionado (lo decidió el
//     otro desde SU ficha). Direccional a propósito.
//   · 🚨 Desde el 03/09/2026 esos dos booleanos ya NO son el dato: son el
//     resumen de «¿lo ve HOY?» (autorización VIGENTE). El dato es
//     `autorizacion`, que distingue **no hay** (`null`) de **anotada y aún sin
//     aceptar** (`pendiente`, no ve nada) de **en vigor**. La pantalla dice los
//     tres; colapsarlos en «sí/no» es lo que había antes y lo que se quitó.
//
// Regla de siempre: `relaciones: null` = «no se pudo consultar», `[]` = «se miró
// y no hay ninguna anotada». Un `null` NUNCA se pinta como «no tiene familia».

import type { RelacionFicha } from '@central/module-seguros'

// 🚨 El vocabulario de la autorización vive en `@central/module-seguros-portal`
// (`src/autorizacion.ts`), que es la fuente. Se repite aquí como listas de
// lectura porque `apps/plataforma` no declara ese paquete y esta capa solo
// VALIDA lo que llega por el puerto: nada de esto decide accesos — lo que
// abre datos se decide en asegura y en el portal.
export const ALCANCES_PORTAL = ['ver', 'ver_economico', 'partes', 'documentos'] as const
export type AlcancePortal = (typeof ALCANCES_PORTAL)[number]
export const ESTADOS_AUTORIZACION_PORTAL = ['pendiente', 'vigente', 'caducada', 'revocada'] as const
export type EstadoAutorizacionPortal = (typeof ESTADOS_AUTORIZACION_PORTAL)[number]

/**
 * La autorización que gobierna un vínculo. 🚨 Tres estados, no dos:
 * `autorizacion: null` = **no hay ninguna anotada**; `pendiente` = la hay pero
 * el autorizado no la ha aceptado, así que **todavía no ve nada**; `vigente` =
 * ve. `caducada`/`revocada` = la hubo y ya no vale.
 *
 * Nunca significa «no se ha podido leer»: eso es `relaciones === null`, y la
 * pantalla lo dice con otras palabras.
 */
export type AutorizacionCartera = {
  estado: EstadoAutorizacionPortal
  alcances: AlcancePortal[]
  /** ISO del puerto (`Date` serializada). `fechaLarga()` la pinta en español. */
  caducaEn: string
  /** `portal` = lo concedió el cliente · `corredor` = lo anotó la correduría. */
  origen: string
}

/** Un vínculo de la ficha, con lo que la cartera sabe del relacionado. */
export type RelacionCartera = RelacionFicha & {
  nombre: string
  tipoCliente: string
  /** Pólizas vivas del relacionado. `null` = asegura no las contó (NO es 0). */
  polizasVivas: number | null
  /** La autorización de la ficha hacia el relacionado. `null` = no hay ninguna. */
  autorizacion: AutorizacionCartera | null
}

/**
 * Una autorización del puerto, o `null` si no viene o no tiene forma. Un
 * estado desconocido NO se inventa: se devuelve `null`, y entonces la pantalla
 * dice «sin autorización», que es lo conservador (nunca «ve»).
 */
export function leerAutorizacion(v: unknown): AutorizacionCartera | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.estado !== 'string' || !(ESTADOS_AUTORIZACION_PORTAL as readonly string[]).includes(o.estado)) return null
  const caducaEn = cadena(o.caducaEn)
  if (caducaEn === null || Number.isNaN(Date.parse(caducaEn))) return null
  const alcances = Array.isArray(o.alcances)
    ? o.alcances.filter((a): a is AlcancePortal => typeof a === 'string' && (ALCANCES_PORTAL as readonly string[]).includes(a))
    : []
  return {
    estado: o.estado as EstadoAutorizacionPortal,
    alcances,
    caducaEn,
    origen: cadena(o.origen) ?? 'sin_informar',
  }
}

/** Una fecha ISO en castellano de pantalla: «12 de marzo de 2027». */
export function fechaLarga(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Qué se enseña de una autorización, en una frase. Vive aquí (puro, con test)
 * y no en el JSX: es el titular que Alberto lee para decidir, y el sitio donde
 * «pendiente» se convertiría en «ve» por descuido.
 */
export function explicarEstadoAutorizacion(a: AutorizacionCartera | null, nombreOtro: string, nombreFicha: string): string {
  if (a === null) return `${nombreOtro} no ve los seguros de ${nombreFicha}: no hay ninguna autorización.`
  const nivel = a.alcances.includes('ver_economico') ? 've también lo económico (prima y recibos)' : 've la tarjeta de la póliza'
  switch (a.estado) {
    case 'vigente':
      return `${nombreOtro} ve los seguros de ${nombreFicha} — ${nivel}. En vigor hasta el ${fechaLarga(a.caducaEn)}.`
    case 'pendiente':
      return `Autorización anotada${a.origen === 'corredor' ? ' por la correduría' : ''}, pendiente de que ${nombreOtro} la acepte en el portal: TODAVÍA NO VE NADA. Caduca el ${fechaLarga(a.caducaEn)}.`
    case 'caducada':
      return `La autorización caducó el ${fechaLarga(a.caducaEn)}: ${nombreOtro} ya no ve los seguros de ${nombreFicha}.`
    case 'revocada':
      return `Autorización revocada: ${nombreOtro} no ve los seguros de ${nombreFicha}.`
  }
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function enteroONull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

/** Una fila del puerto → `RelacionCartera`, o `null` si no tiene forma de relación. */
export function leerRelacion(v: unknown): RelacionCartera | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.relacionadoId !== 'string' || o.relacionadoId.trim() === '') return null
  if (typeof o.tipo !== 'string' || o.tipo.trim() === '') return null
  if (typeof o.autorizaVer !== 'boolean' || typeof o.puedeVer !== 'boolean') return null
  return {
    idIda: cadena(o.idIda),
    idVuelta: cadena(o.idVuelta),
    relacionadoId: o.relacionadoId,
    tipo: o.tipo,
    autorizaVer: o.autorizaVer,
    puedeVer: o.puedeVer,
    observaciones: cadena(o.observaciones),
    nombre: cadena(o.nombre) ?? 'sin nombre',
    tipoCliente: cadena(o.tipoCliente) ?? 'sin_informar',
    polizasVivas: enteroONull(o.polizasVivas),
    autorizacion: leerAutorizacion(o.autorizacion),
  }
}

/**
 * El bloque de relaciones, o `null` si no llega o llega sin forma de lista.
 * Una fila rara se salta (no tumba el bloque); una LISTA que no es lista
 * degrada a `null` entero — jamás a `[]`, que diría «no tiene relaciones».
 */
export function leerRelaciones(v: unknown): RelacionCartera[] | null {
  if (!Array.isArray(v)) return null
  return v.map(leerRelacion).filter((r): r is RelacionCartera => r !== null)
}

// ─── Respuestas ──────────────────────────────────────────────────────────────

/**
 * Lo que devuelve el puerto en GET y en cualquier escritura (alta, autorizar,
 * quitar). `error` es «no se pudo hacer»; `invalido`/`conflicto`/`no_encontrado`
 * son «no se hizo por un motivo» y lo traen. `conflicto` = ya estaban
 * relacionados.
 */
export type RespuestaRelaciones =
  | { estado: 'ok'; relaciones: RelacionCartera[] }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'conflicto'; motivo: string }
  | { estado: 'no_encontrado'; motivo: string | null }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarRelaciones(status: number, json: unknown): RespuestaRelaciones {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado', motivo: cadena(o.motivo) }
  if (status === 409 || o.estado === 'conflicto') return { estado: 'conflicto', motivo: cadena(o.motivo) ?? 'ya están relacionados' }
  if (status === 422 || o.estado === 'invalido') return { estado: 'invalido', motivo: cadena(o.motivo) ?? 'datos no válidos' }
  if (status === 200 && o.estado === 'ok') {
    const relaciones = leerRelaciones(o.relaciones)
    // Un `ok` sin lista legible no se convierte en «sin relaciones».
    if (relaciones === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    return { estado: 'ok', relaciones }
  }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

/** El motivo del puerto, en castellano de pantalla. Los que ya son frase se dejan. */
export function textoMotivoRelaciones(motivo: string): string {
  switch (motivo) {
    case 'secreto_rechazado':
      return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).'
    case 'respuesta_ilegible':
      return 'la respuesta de asegura no tenía la forma esperada.'
    case 'asegura_error':
      return 'asegura respondió, pero no pudo escribir en su base de datos.'
    case 'red':
      return 'no se pudo llegar a asegura (timeout, DNS o TLS).'
    default:
      return motivo
  }
}

// ─── Red (solo desde las rutas API de plataforma) ────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

function cabeceras(): Record<string, string> | null {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  return secret ? { Authorization: `Bearer ${secret}` } : null
}

export type Reenvio = { status: number; json: unknown }

async function llamar(path: string, init: RequestInit): Promise<Reenvio> {
  const h = cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}${path}`, {
      ...init,
      headers: { ...h, ...(init.body ? { 'content-type': 'application/json' } : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

/** `GET /api/operador/cliente/relaciones?id=` — las relaciones de una ficha. */
export function relacionesAsegura(clienteId: string): Promise<Reenvio> {
  return llamar(`/api/operador/cliente/relaciones?id=${encodeURIComponent(clienteId)}`, { method: 'GET' })
}

/** `POST` — alta de un vínculo `{clienteId, relacionadoId, tipo, observaciones?, actor}`. */
export function crearRelacionAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente/relaciones', { method: 'POST', body: JSON.stringify(body) })
}

/** `PATCH` — `{clienteId, relacionadoId, autoriza, actor}`: la ficha autoriza/revoca al relacionado. */
export function autorizarRelacionAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente/relaciones', { method: 'PATCH', body: JSON.stringify(body) })
}

/** `DELETE` — `{clienteId, relacionadoId, actor}`: quita el vínculo (los dos sentidos). */
export function borrarRelacionAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente/relaciones', { method: 'DELETE', body: JSON.stringify(body) })
}
