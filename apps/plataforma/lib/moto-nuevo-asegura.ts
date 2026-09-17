// El cliente del puerto de MOTO SIN PÓLIZA («oportunidad nueva») de asegura.
//
// Hermano de `auto-nuevo-asegura.ts`, mismo patrón campo por campo: la cartera
// viva tiene 1 sola póliza de moto (03/09/2026), así que «nueva» es
// prácticamente el único caso real de este ramo. `catalogoAsegura` se
// reutiliza (mismo puerto genérico de catálogos que auto/hogar), pidiendo
// `tipo` `marcas-moto`/`modelos-moto`/`versiones-moto` (ver `acciones.ts`).

import {
  interpretarRetarificacion,
  porFalloDeRed,
  leerConsumo,
  catalogoAsegura,
  TIMEOUT_COTIZAR_MS,
  type RespuestaRetarificar,
  type RespuestaCatalogo,
  type ConsumoPuerto,
  type Opcion,
  type Reparo,
  type Supuesto,
} from './retarificar-asegura.ts'
import { describirCausaAsegura, MOTIVOS_PUERTO, type MotivoPuerto } from './correduria-puerto.ts'

export type { RespuestaRetarificar, RespuestaCatalogo, ConsumoPuerto, Opcion, MotivoPuerto }
export type { Reparo, Supuesto, Precio, Fallo } from './retarificar-asegura.ts'
export { catalogoAsegura }

/** Disponibilidad del ramo de moto para esta organización (`GET /insurance-lines`). */
export type DisponibilidadMoto =
  | { estado: 'disponible'; id: string; nombre: string }
  | { estado: 'ausente'; ramos: string[] }
  | { estado: 'desconocido' }

/** Todo lo que hace falta para pintar la pantalla de moto sin póliza. */
export type PrecalificacionMotoNueva = {
  etiquetaCliente: string
  /** `null` = no revisado · `[]` = revisado y no falta nada. */
  faltan: Reparo[] | null
  supuestos: Supuesto[]
  /** Municipios del CP del cliente, ya resueltos por asegura (el CP no cruza el puerto). */
  municipios: Opcion[] | null
  municipiosMotivo: string | null
  estadoCivil: Opcion | null
  estadoCivilMotivo: string | null
  moto: DisponibilidadMoto
  consumo: ConsumoPuerto
  simulacion: boolean
}

export type RespuestaPrecalificacionMotoNueva =
  | { estado: 'sin_configurar'; mensaje: string }
  | { estado: 'error'; motivo: MotivoPuerto; mensaje: string }
  /** El cliente no es de esta correduría, o no se ha podido leer su ficha. */
  | { estado: 'no_encontrado'; mensaje: string }
  | { estado: 'ok'; pre: PrecalificacionMotoNueva }

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function leerOpciones(v: unknown): Opcion[] {
  if (!Array.isArray(v)) return []
  const out: Opcion[] = []
  for (const o of v) {
    if (typeof o !== 'object' || o === null) continue
    const x = o as Record<string, unknown>
    if ((typeof x.id !== 'string' && typeof x.id !== 'number') || typeof x.nombre !== 'string') continue
    out.push({ id: String(x.id), nombre: x.nombre })
  }
  return out
}

function leerOpcionesONulo(v: unknown): Opcion[] | null {
  return v === null || v === undefined ? null : leerOpciones(v)
}

function leerOpcion(v: unknown): Opcion | null {
  if (typeof v !== 'object' || v === null) return null
  const x = v as Record<string, unknown>
  if (typeof x.nombre !== 'string') return null
  if (typeof x.id !== 'string' && typeof x.id !== 'number') return null
  return { id: String(x.id), nombre: x.nombre }
}

function leerDisponibilidadMoto(v: unknown): DisponibilidadMoto {
  if (typeof v !== 'object' || v === null) return { estado: 'desconocido' }
  const x = v as Record<string, unknown>
  if (x.estado === 'disponible' && typeof x.id === 'string' && typeof x.nombre === 'string') {
    return { estado: 'disponible', id: x.id, nombre: x.nombre }
  }
  if (x.estado === 'ausente') {
    return { estado: 'ausente', ramos: Array.isArray(x.ramos) ? x.ramos.filter((r): r is string => typeof r === 'string') : [] }
  }
  return { estado: 'desconocido' }
}

/** PURO: la respuesta HTTP → los cuatro estados. Sin red, testeable. */
export function interpretarPrecalificacionMotoNueva(status: number, json: unknown): RespuestaPrecalificacionMotoNueva {
  if (status === 401 || status === 403) {
    return { estado: 'error', motivo: 'secreto_rechazado', mensaje: MOTIVOS_PUERTO.secreto_rechazado }
  }
  if (typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
  }
  const r = json as Record<string, unknown>

  if (r.estado === 'sin_configurar') {
    return {
      estado: 'sin_configurar',
      mensaje: cadena(r.mensaje) ?? 'Codeoscopic no está configurado en central-asegura, así que no se puede precalificar.',
    }
  }
  if (status === 404) {
    return { estado: 'no_encontrado', mensaje: cadena(r.mensaje) ?? 'No se ha encontrado el cliente.' }
  }
  if (r.estado === 'error') {
    const detalle = describirCausaAsegura(typeof r.causa === 'string' ? r.causa : undefined)
    return {
      estado: 'error',
      motivo: 'asegura_error',
      mensaje: [cadena(r.mensaje), detalle].filter((s): s is string => !!s).join(' — ') || MOTIVOS_PUERTO.asegura_error,
    }
  }
  if (r.estado !== 'ok') {
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
  }

  return {
    estado: 'ok',
    pre: {
      etiquetaCliente: cadena(r.etiquetaCliente) ?? '',
      faltan: Array.isArray(r.faltan) ? (r.faltan as Reparo[]) : null,
      supuestos: Array.isArray(r.supuestos) ? (r.supuestos as Supuesto[]) : [],
      municipios: leerOpcionesONulo(r.municipios),
      municipiosMotivo: cadena(r.municipiosMotivo),
      estadoCivil: leerOpcion(r.estadoCivil),
      estadoCivilMotivo: cadena(r.estadoCivilMotivo),
      moto: leerDisponibilidadMoto(r.moto),
      consumo: leerConsumo(r.consumo),
      simulacion: r.simulacion === true,
    },
  }
}

// ─── Llamadas ────────────────────────────────────────────────────────────────

const TIMEOUT_PRECALIFICAR_MS = 25_000

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function pedir(path: string, init: RequestInit, timeoutMs: number): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${secret}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

/** La ficha de la persona para moto sin póliza. **Gratis.** */
export async function precalificarMotoNuevaAsegura(entrada: { clienteId: string }): Promise<RespuestaPrecalificacionMotoNueva> {
  try {
    const r = await pedir(
      `/api/operador/codeoscopic/precalificar-moto-nuevo?clienteId=${encodeURIComponent(entrada.clienteId)}`,
      { method: 'GET' },
      TIMEOUT_PRECALIFICAR_MS,
    )
    if (r === null) {
      return { estado: 'sin_configurar', mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).' }
    }
    return interpretarPrecalificacionMotoNueva(r.status, r.json)
  } catch (e) {
    return { estado: 'error', motivo: 'red', mensaje: `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)})` }
  }
}

/**
 * 🚨 **LA LLAMADA QUE CUESTA 0,50€ REALES.** Reutiliza `interpretarRetarificacion`
 * y `porFalloDeRed` de `retarificar-asegura.ts`: el puerto de asegura redacta la
 * respuesta de esta ruta con la MISMA función que la de retarificar una póliza,
 * así que el contrato es idéntico campo por campo.
 *
 * `confirmado: true` va SIEMPRE, y se manda desde aquí (el servidor) y no desde
 * el navegador — mismo cerrojo que las otras rutas de pago.
 *
 * 🚫 **No reintenta.** `POST /insurances` no es idempotente.
 */
export async function cotizarMotoNuevaAsegura(entrada: {
  clienteId: string
  solicitadoPor?: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
}): Promise<RespuestaRetarificar> {
  try {
    const r = await pedir(
      '/api/operador/codeoscopic/moto-nuevo',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clienteId: entrada.clienteId,
          // 🚨 El booleano exacto. No `'true'`, no `1`: el puerto compara con `===`.
          confirmado: true,
          solicitadoPor: entrada.solicitadoPor ?? 'plataforma',
          ...(entrada.resueltos ? { resueltos: entrada.resueltos } : {}),
          ...(entrada.correcciones ? { correcciones: entrada.correcciones } : {}),
        }),
      },
      TIMEOUT_COTIZAR_MS,
    )
    if (r === null) {
      return {
        estado: 'sin_configurar',
        mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET). No se ha llamado a Codeoscopic.',
      }
    }
    return interpretarRetarificacion(r.status, r.json)
  } catch (e) {
    return porFalloDeRed(e)
  }
}

// ─── Nota sobre los tipos duplicados ─────────────────────────────────────────
//
// `Opcion`/`Reparo`/`Supuesto` existen también en `apps/asegura/lib/codeoscopic/*`.
// Duplicados a propósito, mismo motivo que el resto del puerto (ver el final de
// `retarificar-asegura.ts`): las dos apps se hablan por HTTP y por nada más.
