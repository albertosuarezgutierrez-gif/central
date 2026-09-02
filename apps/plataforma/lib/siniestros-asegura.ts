// Siniestros de la correduría DESDE la ficha (docs/CORREDURIA-CRM-VISION.md
// §9, punto 6): leer, abrir, anotar seguimiento y cambiar el estado, desde la
// pantalla de Alberto en plataforma.
//
// La BD vive en `apps/asegura` (`seguros.siniestros`); esta app habla con su
// puerto (`/api/operador/siniestro`) con el secreto de operador. Dos partes,
// como en `relaciones-asegura.ts`:
//
//   1. Lo PURO: leer un siniestro tal y como lo manda asegura (en
//      `ficha.siniestros[]`, en `poliza.siniestros[]` y en las respuestas de
//      escritura) y las respuestas del puerto. Test en
//      `test/regression-siniestros-asegura.test.ts`; lo importan también los
//      client components (sin red ni env).
//   2. La RED: las llamadas al puerto, solo desde las rutas API de plataforma.
//
// Dos orígenes que NO son iguales (`@central/module-seguros`, `siniestros.ts`):
//   · `cima`: lo trae la ingesta; su estado lo fija la compañía y aquí solo se
//     anota el seguimiento (tramitador, perito, reserva, notas…).
//   · `gestionado_correduria`: lo abrió Alberto desde la ficha; el estado se
//     cambia a mano y la referencia de la compañía es la llave para que el
//     siguiente pull de CIMA lo case en vez de duplicarlo.
//
// Tolerancia a una asegura desplegada MÁS VIEJA que no mande los campos
// nuevos: `origen` ausente → `cima` (conservador: sin cambios de estado a
// mano), `confirmadoCima` ausente → `true`, `clienteId` ausente → `null`, el
// resto → `null`. Y la regla de siempre: `reserva: null` = «la compañía no lo
// informa», NUNCA 0; `siniestros: null` = «no se pudo leer», NUNCA `[]`.

import type { OrigenSiniestro } from '@central/module-seguros'

/** Un siniestro tal y como lo sirve el puerto de asegura. */
export type SiniestroCartera = {
  id: string
  /** `null` = una versión de asegura que aún no lo manda. */
  clienteId: string | null
  polizaId: string
  estado: string
  /** Código EIAC si lo trajo CIMA («1107»), clave del catálogo si lo abrimos nosotros («lunas»). */
  tipo: string | null
  referencia: string | null
  /** `YYYY-MM-DD`. */
  fecha: string | null
  /** ISO con hora, si se sabe. */
  fechaHora: string | null
  /** `null` = no informada (las pone el corredor; CIMA no las manda). NUNCA 0. */
  reserva: number | null
  indemnizacion: number | null
  tramitador: string | null
  tramitadorTelefono: string | null
  tramitadorEmail: string | null
  perito: string | null
  peritoTelefono: string | null
  peritoEmail: string | null
  gravedad: string | null
  /** Descripción del hecho + notas de seguimiento fechadas «[dd/mm/aaaa] …». */
  comentario: string | null
  /** «Ciudad (CP)»; la dirección exacta va cifrada y no sale del puerto. */
  lugar: string | null
  origen: OrigenSiniestro
  /** Tiene `id_siniestro_entidad`: CIMA lo conoce (o ya le pusimos la referencia). */
  confirmadoCima: boolean
  abierto: boolean
  /** ISO. `null` = asegura no lo manda. */
  actualizado: string | null
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/** Número o `null`. Un `null` del puerto se QUEDA en null: «no informado» no es 0. */
function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Una fila del puerto → `SiniestroCartera`, o `null` si no tiene forma de siniestro. */
export function leerSiniestro(v: unknown): SiniestroCartera | null {
  if (typeof v !== 'object' || v === null) return null
  const s = v as Record<string, unknown>
  if (typeof s.id !== 'string' || s.id.trim() === '') return null
  return {
    id: s.id,
    clienteId: cadena(s.clienteId),
    polizaId: cadena(s.polizaId) ?? '',
    estado: cadena(s.estado) ?? 'sin_informar',
    tipo: cadena(s.tipo),
    referencia: cadena(s.referencia),
    fecha: cadena(s.fecha),
    fechaHora: cadena(s.fechaHora),
    reserva: numero(s.reserva),
    indemnizacion: numero(s.indemnizacion),
    tramitador: cadena(s.tramitador),
    tramitadorTelefono: cadena(s.tramitadorTelefono),
    tramitadorEmail: cadena(s.tramitadorEmail),
    perito: cadena(s.perito),
    peritoTelefono: cadena(s.peritoTelefono),
    peritoEmail: cadena(s.peritoEmail),
    gravedad: cadena(s.gravedad),
    comentario: cadena(s.comentario),
    lugar: cadena(s.lugar),
    // Sin el campo (asegura viejo) se asume CIMA: es el caso que NO permite
    // tocar el estado a mano, o sea el conservador.
    origen: s.origen === 'gestionado_correduria' ? 'gestionado_correduria' : 'cima',
    confirmadoCima: typeof s.confirmadoCima === 'boolean' ? s.confirmadoCima : true,
    abierto: s.abierto === true,
    actualizado: cadena(s.actualizado),
  }
}

/**
 * La lista de siniestros, o `null` si no llega o llega sin forma de lista.
 * Una fila rara se salta (no tumba el bloque); una LISTA que no es lista
 * degrada a `null` entero — jamás a `[]`, que diría «sin siniestros».
 */
export function leerSiniestros(v: unknown): SiniestroCartera[] | null {
  if (!Array.isArray(v)) return null
  return v.map(leerSiniestro).filter((s): s is SiniestroCartera => s !== null)
}

// ─── Ramo de la póliza → tipos de siniestro que encajan ──────────────────────
//
// `TIPOS_SINIESTRO` lleva ramo auto/hogar/general/salud/vida; las pólizas de
// la cartera llevan `tipo` auto/moto/hogar/vida/salud/decesos/
// responsabilidad_civil/comercio/comunidades/otros. Se ofrece el ramo que
// encaja MÁS `general` (RC, defensa jurídica, «otro»), que vale para todos.
// Si el tipo no se sabe mapear, se ofrecen todos: mejor elegir de más que no
// poder abrirlo.

const RAMOS_POR_TIPO_POLIZA: Record<string, readonly string[]> = {
  auto: ['auto', 'general'],
  moto: ['auto', 'general'],
  hogar: ['hogar', 'general'],
  comunidades: ['hogar', 'general'],
  salud: ['salud', 'general'],
  vida: ['vida', 'general'],
  decesos: ['vida', 'general'],
}

/** Los ramos de `TIPOS_SINIESTRO` a ofrecer para una póliza; `null` = todos. */
export function ramosSiniestroParaPoliza(tipoPoliza: string | null | undefined): readonly string[] | null {
  if (!tipoPoliza) return null
  return RAMOS_POR_TIPO_POLIZA[tipoPoliza] ?? null
}

// ─── Respuestas ──────────────────────────────────────────────────────────────

/**
 * Lo que devuelve el puerto en GET y en cualquier escritura (abrir, estado,
 * seguimiento). `error` es «no se pudo hacer»; `invalido`/`no_encontrado` son
 * «no se hizo por un motivo» y lo traen. En `ok`, `aviso` es el del art. 16
 * LCS (fuera de plazo, no bloquea) e `ignorados` los campos que no se
 * aplicaron por ser un siniestro de CIMA (p. ej. `referencia`).
 */
export type RespuestaSiniestro =
  | { estado: 'ok'; siniestro: SiniestroCartera; aviso: string | null; ignorados: string[] }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'no_encontrado'; motivo: string | null }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarSiniestro(status: number, json: unknown): RespuestaSiniestro {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado', motivo: cadena(o.motivo) }
  if (status === 422 || o.estado === 'invalido') return { estado: 'invalido', motivo: cadena(o.motivo) ?? 'datos no válidos' }
  if (status === 200 && o.estado === 'ok') {
    const siniestro = leerSiniestro(o.siniestro)
    // Un `ok` sin siniestro legible no se da por hecho.
    if (siniestro === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const ignorados = Array.isArray(o.ignorados) ? o.ignorados.filter((x): x is string => typeof x === 'string') : []
    return { estado: 'ok', siniestro, aviso: cadena(o.aviso), ignorados }
  }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

/** El motivo del puerto, en castellano de pantalla. Los que ya son frase se dejan. */
export function textoMotivoSiniestro(motivo: string): string {
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

/** `GET /api/operador/siniestro?id=` — un siniestro. */
export function siniestroAsegura(id: string): Promise<Reenvio> {
  return llamar(`/api/operador/siniestro?id=${encodeURIComponent(id)}`, { method: 'GET' })
}

/** `POST` — apertura `{polizaId, tipo, fechaHora, descripcion, lugar*?, seConsideraCulpable?, gravedad?, referencia?, actor}`. */
export function abrirSiniestroAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/siniestro', { method: 'POST', body: JSON.stringify(body) })
}

/** `PATCH` — `{siniestroId, estado, actor}` (cambio de estado) o `{siniestroId, …seguimiento, actor}`. */
export function seguirSiniestroAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/siniestro', { method: 'PATCH', body: JSON.stringify(body) })
}
