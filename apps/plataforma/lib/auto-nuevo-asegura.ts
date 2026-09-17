// El cliente del puerto de AUTO SIN PÓLIZA («oportunidad nueva») de asegura.
//
// Hermano de `hogar-nuevo-asegura.ts`, misma disciplina de dinero (`pedir()`
// con Bearer, interpretadores PUROS, `gastoDesconocido` para no confundir un
// timeout con «no se ha gastado»). La llamada que COTIZA
// (`cotizarAutoNuevaAsegura`) reutiliza la interpretación de
// `retarificar-asegura.ts` a propósito: el puerto redacta la respuesta de las
// TRES rutas de pago —retarificar una póliza, hogar sin póliza y auto sin
// póliza— con la MISMA función (`respuestaRetarificacion()` de asegura), así
// que el contrato es idéntico campo por campo.
//
// Lo propio de aquí es la PRECALIFICACIÓN: a diferencia de una póliza
// existente, aquí NO hay ficha de la que sacar matrícula/marca/modelo — el
// vehículo entero se elige en el catálogo del vendor (gratis, reutilizando
// `catalogoAsegura` de `retarificar-asegura.ts`) y la matrícula la teclea el
// corredor. `GET /api/operador/codeoscopic/precalificar-auto-nuevo` arma la
// ficha de la PERSONA (municipios, estado civil, huecos, consumo) para que
// plataforma no reimplemente esa lógica.

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

/** Todo lo que hace falta para pintar la pantalla de auto sin póliza. */
export type PrecalificacionAutoNueva = {
  etiquetaCliente: string
  /** `null` = no revisado · `[]` = revisado y no falta nada. */
  faltan: Reparo[] | null
  supuestos: Supuesto[]
  /** Municipios del CP del cliente, ya resueltos por asegura (el CP no cruza el puerto). */
  municipios: Opcion[] | null
  municipiosMotivo: string | null
  estadoCivil: Opcion | null
  estadoCivilMotivo: string | null
  consumo: ConsumoPuerto
  simulacion: boolean
}

export type RespuestaPrecalificacionAutoNueva =
  | { estado: 'sin_configurar'; mensaje: string }
  | { estado: 'error'; motivo: MotivoPuerto; mensaje: string }
  /** El cliente no es de esta correduría, o no se ha podido leer su ficha. */
  | { estado: 'no_encontrado'; mensaje: string }
  | { estado: 'ok'; pre: PrecalificacionAutoNueva }

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

/** PURO: la respuesta HTTP → los cuatro estados. Sin red, testeable. */
export function interpretarPrecalificacionAutoNueva(status: number, json: unknown): RespuestaPrecalificacionAutoNueva {
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

/** La ficha de la persona para auto sin póliza. **Gratis.** */
export async function precalificarAutoNuevaAsegura(entrada: { clienteId: string }): Promise<RespuestaPrecalificacionAutoNueva> {
  try {
    const r = await pedir(
      `/api/operador/codeoscopic/precalificar-auto-nuevo?clienteId=${encodeURIComponent(entrada.clienteId)}`,
      { method: 'GET' },
      TIMEOUT_PRECALIFICAR_MS,
    )
    if (r === null) {
      return { estado: 'sin_configurar', mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).' }
    }
    return interpretarPrecalificacionAutoNueva(r.status, r.json)
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
 * el navegador — mismo cerrojo que las otras dos rutas de pago.
 *
 * 🚫 **No reintenta.** `POST /insurances` no es idempotente.
 */
export async function cotizarAutoNuevaAsegura(entrada: {
  clienteId: string
  solicitadoPor?: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
}): Promise<RespuestaRetarificar> {
  try {
    const r = await pedir(
      '/api/operador/codeoscopic/auto-nuevo',
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
