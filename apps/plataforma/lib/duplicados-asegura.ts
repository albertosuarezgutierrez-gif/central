// Pólizas DUPLICADAS en la cartera viva de la correduría, desde la pantalla de
// Alberto: dos filas vivas con el mismo número en la misma compañía.
//
// Es el guardián de la conciliación Codeoscopic↔CIMA (docs/CORREDURIA-CRM-VISION.md
// §5): cuando emitamos por Codeoscopic y CIMA traiga la misma póliza sin
// casarla, aquí se ve antes de que la ficha pinte dos pólizas y el cliente
// cobre dos avisos. La agrupación la hace asegura (`polizasDuplicadas()` de
// `@central/module-seguros`) y la sirve por `GET /api/operador/duplicados`;
// esta app solo la lee y la pinta.
//
// Dos partes, como en `relaciones-asegura.ts`:
//   1. Lo PURO: `interpretarDuplicados` (test en
//      `test/regression-duplicados-asegura.test.ts`); lo importa el client
//      component `Duplicadas.tsx` (sin red ni env).
//   2. La RED: `duplicadosAsegura()`, solo desde la ruta API de plataforma.
//
// Regla de siempre: `grupos` solo existe en `ok`. Un `sin_configurar` o un
// `error` NUNCA se pintan como «sin duplicados»: se dice que no se ha podido
// comprobar, con el motivo.

import type { OrigenFicha } from '@central/module-seguros'
import { cabecerasPuerto } from './puerto-actor.ts'

/** Una ficha del grupo, como la pinta la pantalla. `null` = el puerto no lo dijo (no se inventa). */
export type FichaDuplicadaPantalla = {
  id: string
  clienteId: string
  /** De dónde viene la ficha. `null` = sin informar. */
  origen: OrigenFicha | null
  estado: string
  /** `false` = ficha del cliente descartada (`clientes.activo`); `null` = no se sabe. */
  clienteActivo: boolean | null
}

export type GrupoDuplicadoPantalla = {
  numero: string
  compania: string
  aseguradora: string | null
  polizas: FichaDuplicadaPantalla[]
  emitidaYCima: boolean
}

export type RespuestaDuplicados =
  | { estado: 'ok'; grupos: GrupoDuplicadoPantalla[] }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

// Copia local de `ORIGENES_FICHA`: este fichero lo importa un client component y
// el índice de `@central/module-seguros` arrastraría todo el paquete al bundle.
const ORIGENES: readonly OrigenFicha[] = ['cima', 'volcado', 'emitida', 'declarada', 'manual']

/**
 * El origen que dice el puerto. Un puerto viejo solo manda `confirmadaCima`:
 * `true` es CIMA; `false` NO se traduce a «emitida» (ahora también entran el
 * volcado y las altas a mano), se queda en `null` = sin informar.
 */
function leerOrigen(o: Record<string, unknown>): OrigenFicha | null {
  if (typeof o.origen === 'string' && (ORIGENES as readonly string[]).includes(o.origen)) return o.origen as OrigenFicha
  return o.confirmadaCima === true ? 'cima' : null
}

/** Una póliza dentro de un grupo, o `null` si no tiene forma. */
function leerPolizaGrupo(v: unknown): FichaDuplicadaPantalla | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = cadena(o.id)
  const clienteId = cadena(o.clienteId)
  if (id === null || clienteId === null) return null
  return {
    id,
    clienteId,
    origen: leerOrigen(o),
    estado: cadena(o.estado) ?? 'sin_informar',
    clienteActivo: typeof o.clienteActivo === 'boolean' ? o.clienteActivo : null,
  }
}

/**
 * Un grupo del puerto, o `null` si está mal formado. Un grupo con menos de dos
 * pólizas legibles no es un duplicado y se descarta. `emitidaYCima` se
 * recalcula aquí a partir de las pólizas (no se confía en el flag que llega:
 * si se perdiera una póliza por ilegible, el flag mentiría).
 */
export function leerGrupoDuplicado(v: unknown): GrupoDuplicadoPantalla | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const numero = cadena(o.numero)
  const compania = cadena(o.compania)
  if (numero === null || compania === null || !Array.isArray(o.polizas)) return null
  const polizas = o.polizas.map(leerPolizaGrupo).filter((p): p is NonNullable<typeof p> => p !== null)
  if (new Set(polizas.map((p) => p.id)).size < 2) return null
  return {
    numero,
    compania,
    aseguradora: cadena(o.aseguradora),
    polizas,
    emitidaYCima: polizas.some((p) => p.origen === 'cima') && polizas.some((p) => p.origen === 'emitida'),
  }
}

/**
 * La lista de grupos, o `null` si no llega o no es lista. Un grupo mal
 * formado se salta (no tumba el bloque); una LISTA que no es lista degrada a
 * `null` — jamás a `[]`, que diría «sin duplicados».
 */
export function leerGruposDuplicados(v: unknown): GrupoDuplicadoPantalla[] | null {
  if (!Array.isArray(v)) return null
  return v.map(leerGrupoDuplicado).filter((g): g is GrupoDuplicadoPantalla => g !== null)
}

export function interpretarDuplicados(status: number, json: unknown): RespuestaDuplicados {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 200 && o.estado === 'ok') {
    const grupos = leerGruposDuplicados(o.grupos)
    // Un `ok` sin lista legible no se convierte en «sin duplicados».
    if (grupos === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    return { estado: 'ok', grupos }
  }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

/** El motivo del puerto, en castellano de pantalla. Los que ya son frase se dejan. */
export function textoMotivoDuplicados(motivo: string): string {
  switch (motivo) {
    case 'secreto_rechazado':
      return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos)'
    case 'respuesta_ilegible':
      return 'la respuesta de asegura no tenía la forma esperada'
    case 'asegura_error':
      return 'asegura respondió, pero no pudo leer la cartera'
    case 'red':
      return 'no se pudo llegar a asegura (timeout, DNS o TLS)'
    default:
      return motivo
  }
}

/** Cuántas pólizas sobran: en cada grupo, todas menos una. */
export function polizasSobrantes(grupos: readonly GrupoDuplicadoPantalla[]): number {
  return grupos.reduce((s, g) => s + Math.max(0, g.polizas.length - 1), 0)
}

/** Cómo se enseña el origen de una ficha (para decidir si fusionar o marcar). */
export function textoOrigenFicha(o: OrigenFicha | null): string {
  switch (o) {
    case 'cima': return 'CIMA'
    case 'volcado': return 'volcado'
    case 'emitida': return 'emitida, sin CIMA'
    case 'declarada': return 'declarada por el cliente'
    case 'manual': return 'alta a mano'
    default: return 'origen sin informar'
  }
}

// ─── «No es duplicado» ───────────────────────────────────────────────────────
//
// Marca TODOS los pares del grupo en `seguros.poliza_no_duplicado` por el puerto
// (`POST /api/operador/duplicados/no-duplicado`). Quién lo decide lo pone el
// puerto con `x-actor` (la sesión), nunca el cuerpo.

export type ResultadoNoDuplicado =
  | { estado: 'ok'; pares: number; nuevos: number }
  | { estado: 'error'; motivo: string }

/**
 * La respuesta del puerto. SOLO un 200 con `estado: 'ok'` y `pares` numérico es
 * éxito: un 503 de tabla ausente, un 200 raro o un cuerpo ilegible son error, y
 * el grupo sigue en pantalla (nunca se quita por un éxito supuesto).
 */
export function interpretarNoDuplicado(status: number, json: unknown): ResultadoNoDuplicado {
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  // Un 403 `sin_usuario` es de la sesión, no del secreto: se dice como tal.
  if (status === 401 || (status === 403 && o.motivo !== 'sin_usuario')) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status === 200 && o.estado === 'ok' && typeof o.pares === 'number' && o.pares > 0) {
    return { estado: 'ok', pares: o.pares, nuevos: typeof o.nuevos === 'number' ? o.nuevos : 0 }
  }
  if (o.estado === 'sin_configurar') return { estado: 'error', motivo: 'sin_configurar' }
  return { estado: 'error', motivo: cadena(o.motivo) ?? cadena(o.causa) ?? cadena(o.error) ?? `HTTP ${status}` }
}

/** El motivo de un «no es duplicado» fallido, en castellano de pantalla. */
export function textoErrorNoDuplicado(motivo: string): string {
  switch (motivo) {
    case 'migracion_pendiente':
      return 'Falta aplicar la migración 0108 (tabla seguros.poliza_no_duplicado) en la base de datos: no se ha guardado nada.'
    case 'motivo_obligatorio':
      return 'Escribe por qué no es un duplicado.'
    case 'no_es_un_grupo':
      return 'Esas pólizas ya no forman un grupo (alguna se ha fusionado o cambiado). Recarga la página.'
    case 'poliza_desconocida':
      return 'Alguna póliza ya no existe o se ha fusionado. Recarga la página.'
    case 'ids_no_validos':
    case 'pocas_polizas':
    case 'demasiadas_polizas':
      return 'El grupo no se ha podido enviar tal cual. Recarga la página.'
    case 'sin_usuario':
      return 'asegura no ha recibido quién eres (sin sesión): no se ha guardado nada.'
    case 'sin_configurar':
      return 'Falta ASEGURA_OPERADOR_SECRET en este proyecto: no se ha guardado nada.'
    default:
      return `No se ha guardado: ${textoMotivoDuplicados(motivo)}.`
  }
}

// ─── Red (solo desde la ruta API de plataforma) ──────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export type Reenvio = { status: number; json: unknown }

/** `GET /api/operador/duplicados` — los grupos de pólizas duplicadas en la cartera viva. */
export async function duplicadosAsegura(): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/duplicados`, {
      headers: { ...(await cabecerasPuerto(secret)) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

/** `POST /api/operador/duplicados/no-duplicado` — marca los pares del grupo como «no duplicado». */
export async function marcarNoDuplicadoAsegura(ids: readonly string[], motivo: string): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/duplicados/no-duplicado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await cabecerasPuerto(secret)) },
      body: JSON.stringify({ ids, motivo }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
