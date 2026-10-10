// Bandeja «Necesita tu atención» del tarificador RPA (08/10/2026): qué trabajos esperan a una persona y qué se puede
// hacer con ellos. PURO.
//
// La máquina de estados (`estados.ts`) NO se toca: ahí `requiere_humano` solo pasa a `cancelado` y un
// `error_definitivo` es terminal para el ORQUESTADOR. Aquí es una PERSONA la que decide, y por eso hay una tabla
// aparte: Reintentar = volver a `pendiente` (con los intentos a cero: es una decisión humana, no un reintento
// automático); Cancelar = cerrar el trabajo.
//
// 🚨 Un trabajo que el guard de emisión abortó (`tipo: 'emision'`) NO se reintenta desde la bandeja: repetirlo no lo
//    arregla y el bot volvería a entrar en un portal con nuestra credencial hacia un paso prohibido.

import { esEstadoTrabajo, esTipoError, type EstadoTrabajo } from './estados.ts'
import { PREFIJO_ELECCION_VERSION } from './vehiculo.ts'

/** Estados que aparecen en la bandeja: el bot ya no avanza solo. */
export const ESTADOS_BANDEJA: readonly EstadoTrabajo[] = ['requiere_humano', 'error_definitivo']

export type AccionBandeja = 'reintentar' | 'cancelar'
export const ACCIONES_BANDEJA: readonly AccionBandeja[] = ['reintentar', 'cancelar']
export const esAccionBandeja = (v: unknown): v is AccionBandeja => typeof v === 'string' && (ACCIONES_BANDEJA as readonly string[]).includes(v)

const DESDE: Record<AccionBandeja, readonly EstadoTrabajo[]> = {
  reintentar: ['requiere_humano', 'error_definitivo'],
  // Cancelar también cierra un reintentable que se ha quedado esperando; nunca un trabajo ya ok/cancelado ni uno vivo.
  cancelar: ['requiere_humano', 'error_definitivo', 'error_reintentable'],
}

const A: Record<AccionBandeja, EstadoTrabajo> = { reintentar: 'pendiente', cancelar: 'cancelado' }

export type DecisionBandeja = { ok: true; a: EstadoTrabajo } | { ok: false; motivo: string }

/**
 * ¿Se puede aplicar `accion` a un trabajo en `estado` (con error de tipo `tipoError`)? Estado desconocido → no.
 * `tipoError` y `modo` solo importan para reintentar (`emision` prohibido en los dos).
 */
export function decidirAccionBandeja(accion: unknown, estado: unknown, tipoError?: unknown, modo?: unknown): DecisionBandeja {
  if (!esAccionBandeja(accion)) return { ok: false, motivo: 'acción desconocida' }
  if (!esEstadoTrabajo(estado)) return { ok: false, motivo: 'estado desconocido' }
  if (!DESDE[accion].includes(estado)) return { ok: false, motivo: `no se puede ${accion} un trabajo en estado ${estado}` }
  if (accion === 'reintentar' && tipoError === 'emision') return { ok: false, motivo: 'un trabajo abortado por el guard de emisión no se reintenta' }
  // Un trabajo de EMISIÓN (10/10/2026) nunca se reintenta: tras el clic el estado en la compañía es incierto. Se pide otro.
  if (accion === 'reintentar' && modo === 'emision') return { ok: false, motivo: 'un trabajo de emisión no se reintenta: se pide una emisión nueva' }
  return { ok: true, a: A[accion] }
}

const MOTIVO_POR_TIPO: Record<string, string> = {
  captcha: 'El portal pide una persona (captcha o código de verificación). El bot no lo salta.',
  credenciales: 'El portal rechazó las credenciales o faltan. Revísalas antes de reintentar.',
  datos: 'Los datos del riesgo no encajan con lo que pide el portal. Corrige la oportunidad y vuelve a pedir el presupuesto.',
  portal: 'El portal no se comportó como esperaba el bot (pantalla distinta o campo que no aparece).',
  infra: 'Fallo técnico (red o máquina) que persistió tras el reintento automático.',
  emision: 'El bot se detuvo a propósito antes de un paso de emisión. No se reintenta.',
}

const PREFIJO_VERIFICACION = 'requiere_verificacion_humana:'

/**
 * Texto legible para la bandeja a partir del `error` jsonb del trabajo (`{tipo, mensaje, …}`, ya redactado). Si el
 * mensaje es el aviso de verificación humana se usa tal cual (ya viene redactado para una persona); si no, una frase
 * por tipo — nunca el mensaje técnico crudo (puede llevar selectores o rutas). Sin error → texto neutro.
 */
export function motivoLegible(error: unknown, estado?: unknown): string {
  const e = typeof error === 'object' && error !== null && !Array.isArray(error) ? (error as Record<string, unknown>) : null
  const mensaje = typeof e?.mensaje === 'string' ? e.mensaje : ''
  // Versión de vehículo ambigua (vehiculo.ts): el mensaje ya es para una persona (solo nombres de catálogo).
  if (mensaje.startsWith(PREFIJO_ELECCION_VERSION)) {
    return `Hay que elegir la versión del vehículo:${mensaje.slice(PREFIJO_ELECCION_VERSION.length)}`.trim().slice(0, 600)
  }
  if (mensaje.startsWith(PREFIJO_VERIFICACION)) {
    return mensaje.slice(PREFIJO_VERIFICACION.length).trim().slice(0, 300) || MOTIVO_POR_TIPO.captcha
  }
  const tipo = e?.tipo
  if (esTipoError(tipo)) return MOTIVO_POR_TIPO[tipo]
  return estado === 'requiere_humano' ? 'El bot necesita que una persona intervenga.' : 'El trabajo falló sin un motivo registrado.'
}
