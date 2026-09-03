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
 * Los dos alcances que son ACTUAR en nombre de otro, no mirar.
 *
 * 🚨 Solo se pueden anotar cuando la ficha que cede es una persona JURÍDICA: el
 * RGPD protege a las personas físicas, así que de una persona solo se delega
 * mirar; una sociedad no tiene datos personales y lo que hay ahí no es
 * consentimiento sino REPRESENTACIÓN mercantil, que se delega entera. Quien lo
 * decide de verdad es asegura (y el módulo puro que él consume); esto es la
 * lectura que necesita la pantalla para no ofrecer un botón que va a dar 422.
 */
export const APODERAMIENTO_PORTAL: readonly AlcancePortal[] = ['partes', 'documentos']

export function esApoderamientoPortal(a: AlcancePortal): boolean {
  return APODERAMIENTO_PORTAL.includes(a)
}

/** Qué es la ficha que cede. `null` = asegura no lo pudo leer, NO es «es una persona». */
export const TIPOS_OTORGANTE_PORTAL = ['fisica', 'juridica'] as const
export type TipoOtorgantePortal = (typeof TIPOS_OTORGANTE_PORTAL)[number]

/** Con qué título se representa a una sociedad. Se guarda cuál, y la pantalla lo dice. */
export const TITULOS_REPRESENTACION_PORTAL = ['administrador', 'apoderado', 'empleado_autorizado'] as const
export type TituloRepresentacionPortal = (typeof TITULOS_REPRESENTACION_PORTAL)[number]

/**
 * Cómo se dice cada título en pantalla. En femenino y masculino a la vez: la
 * ficha no dice el género de nadie, y suponerlo es inventarse un dato de una
 * persona real (el caso que motivó esto es «Pilar, administradora»).
 */
export const TITULO_TEXTO_PORTAL: Record<TituloRepresentacionPortal, string> = {
  administrador: 'administrador/a',
  apoderado: 'apoderado/a',
  empleado_autorizado: 'empleado/a autorizado/a',
}

/** Qué se anota con cada alcance, en el idioma de la pantalla de Alberto. */
export const ALCANCE_TEXTO_PORTAL: Record<AlcancePortal, string> = {
  ver: 'ver sus seguros (sin lo que paga)',
  ver_economico: 'ver sus seguros y lo que paga (prima y recibos)',
  partes: 'dar partes de siniestro en nombre de la sociedad',
  documentos: 'ver y subir la documentación de la sociedad',
}

/** `null` si no es uno de los tres títulos: un valor raro no se traduce ni se inventa. */
export function leerTituloRepresentacion(v: unknown): TituloRepresentacionPortal | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  return (TITULOS_REPRESENTACION_PORTAL as readonly string[]).includes(t)
    ? (t as TituloRepresentacionPortal)
    : null
}

/** «como administrador/a», o `null` si no consta (lo normal entre personas físicas). */
export function comoTitulo(t: string | null): string | null {
  const titulo = leerTituloRepresentacion(t)
  return titulo === null ? null : `como ${TITULO_TEXTO_PORTAL[titulo]}`
}

/**
 * Los alcances que se pueden anotar desde una ficha. `null` (no se pudo leer qué
 * es) cae en el lado restrictivo: solo lectura. Ofrecer un apoderamiento por un
 * hueco en la respuesta es exactamente lo que no puede pasar.
 */
export function alcancesAnotables(tipo: TipoOtorgantePortal | null): readonly AlcancePortal[] {
  return tipo === 'juridica' ? ALCANCES_PORTAL : ['ver', 'ver_economico']
}

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
  /**
   * Con qué título representa a la sociedad quien la recibió. `null` = **no
   * consta** — lo normal en una autorización de persona física, donde no se
   * representa a nadie. Un título que no esté en el vocabulario se lee como
   * `null`: no se pinta un poder que nadie sabría interpretar.
   */
  tituloRepresentacion: TituloRepresentacionPortal | null
  /** ISO del puerto (`Date` serializada). `fechaLarga()` la pinta en español. */
  caducaEn: string
  /** `portal` = lo concedió el cliente · `corredor` = lo anotó la correduría. */
  origen: string
}

/** Un vínculo de la ficha, con lo que la cartera sabe del relacionado. */
export type RelacionCartera = RelacionFicha & {
  nombre: string
  tipoCliente: string
  /**
   * Qué es LA FICHA que cede (no el relacionado): de eso depende si desde aquí se
   * puede anotar solo «deja mirar» (persona) o también un apoderamiento
   * (sociedad). `null` = asegura no lo mandó o no lo pudo leer — y entonces **no
   * se ofrece apoderamiento**, que NO es lo mismo que afirmar que es una persona.
   */
  tipoOtorgante: TipoOtorgantePortal | null
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
    tituloRepresentacion: leerTituloRepresentacion(o.tituloRepresentacion),
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
  // 🚨 Si hay APODERAMIENTO, decir «ve la tarjeta» sería quedarse corto en el
  // sitio más caro: ahí no mira, ACTÚA por la sociedad — y con `partes`, lo que
  // declare la obliga frente a la compañía. El título, cuando consta, va detrás:
  // un poder del que no se dice con qué título se ejerce es media anotación.
  const actos = a.alcances.filter(esApoderamientoPortal)
  const titulo = comoTitulo(a.tituloRepresentacion)
  const queHace =
    actos.length === 0
      ? nivel
      : `${nivel} y ACTÚA por la sociedad (${actos.map((x) => ALCANCE_TEXTO_PORTAL[x]).join(' · ')})${titulo ? `, ${titulo}` : ''}`
  switch (a.estado) {
    case 'vigente':
      return `${nombreOtro} ve los seguros de ${nombreFicha} — ${queHace}. En vigor hasta el ${fechaLarga(a.caducaEn)}.`
    case 'pendiente':
      return `Autorización anotada${a.origen === 'corredor' ? ' por la correduría' : ''}${titulo ? ` (${titulo})` : ''}, pendiente de que ${nombreOtro} la acepte en el portal: TODAVÍA NO VE NADA. Caduca el ${fechaLarga(a.caducaEn)}.`
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
    tipoOtorgante:
      o.tipoOtorgante === 'juridica' || o.tipoOtorgante === 'fisica'
        ? (o.tipoOtorgante as TipoOtorgantePortal)
        : null,
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
