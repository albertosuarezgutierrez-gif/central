// El cliente del puerto de VIDA SIN PÓLIZA («oportunidad nueva») de asegura.
//
// Hermano de `moto-nuevo-asegura.ts`, mismo patrón campo por campo: la cartera
// viva tiene 0 pólizas de vida (03/09/2026), así que «nueva» es el ÚNICO caso
// real de este ramo. `catalogoAsegura` se reutiliza (mismo puerto genérico de
// catálogos que auto/hogar/moto).
//
// 🚧 **El `risk` que se manda al vendor NO está verificado contra el
// fabricante** (ver `apps/asegura/lib/codeoscopic/peticion-vida.ts`): se
// construyó a propósito de Alberto («hazlo con lo que tengas», 07/09/2026) con
// lo poco que documenta el portal. El primer intento real puede fallar y
// devolver un mensaje que nombre un campo distinto — la pantalla lo enseña
// entero, y se corrige en `peticion-vida.ts`, no reintentando a ciegas.

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

/** Disponibilidad del ramo de vida para esta organización (`GET /insurance-lines`). */
export type DisponibilidadVida =
  | { estado: 'disponible'; id: string; nombre: string }
  | { estado: 'ausente'; ramos: string[] }
  | { estado: 'desconocido' }

/** Todo lo que hace falta para pintar la pantalla de vida sin póliza. */
export type PrecalificacionVidaNueva = {
  etiquetaCliente: string
  /** `null` = no revisado · `[]` = revisado y no falta nada. */
  faltan: Reparo[] | null
  supuestos: Supuesto[]
  estadoCivil: Opcion | null
  estadoCivilMotivo: string | null
  vida: DisponibilidadVida
  consumo: ConsumoPuerto
  simulacion: boolean
}

export type RespuestaPrecalificacionVidaNueva =
  | { estado: 'sin_configurar'; mensaje: string }
  | { estado: 'error'; motivo: MotivoPuerto; mensaje: string }
  | { estado: 'no_encontrado'; mensaje: string }
  | { estado: 'ok'; pre: PrecalificacionVidaNueva }

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function leerOpcion(v: unknown): Opcion | null {
  if (typeof v !== 'object' || v === null) return null
  const x = v as Record<string, unknown>
  if (typeof x.nombre !== 'string') return null
  if (typeof x.id !== 'string' && typeof x.id !== 'number') return null
  return { id: String(x.id), nombre: x.nombre }
}

function leerDisponibilidadVida(v: unknown): DisponibilidadVida {
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
export function interpretarPrecalificacionVidaNueva(status: number, json: unknown): RespuestaPrecalificacionVidaNueva {
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
      estadoCivil: leerOpcion(r.estadoCivil),
      estadoCivilMotivo: cadena(r.estadoCivilMotivo),
      vida: leerDisponibilidadVida(r.vida),
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

/** La ficha de la persona para vida sin póliza. **Gratis.** */
export async function precalificarVidaNuevaAsegura(entrada: { clienteId: string }): Promise<RespuestaPrecalificacionVidaNueva> {
  try {
    const r = await pedir(
      `/api/operador/codeoscopic/precalificar-vida-nuevo?clienteId=${encodeURIComponent(entrada.clienteId)}`,
      { method: 'GET' },
      TIMEOUT_PRECALIFICAR_MS,
    )
    if (r === null) {
      return { estado: 'sin_configurar', mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).' }
    }
    return interpretarPrecalificacionVidaNueva(r.status, r.json)
  } catch (e) {
    return { estado: 'error', motivo: 'red', mensaje: `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)})` }
  }
}

/**
 * 🚨 **LA LLAMADA QUE CUESTA 0,50€ REALES.** `confirmado: true` va SIEMPRE, y se
 * manda desde aquí (el servidor), no desde el navegador. 🚫 No reintenta.
 */
export async function cotizarVidaNuevaAsegura(entrada: {
  clienteId: string
  solicitadoPor?: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
}): Promise<RespuestaRetarificar> {
  try {
    const r = await pedir(
      '/api/operador/codeoscopic/vida-nuevo',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clienteId: entrada.clienteId,
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
