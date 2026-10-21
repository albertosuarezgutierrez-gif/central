/**
 * «Mis carnés» — la parte PURA que necesita la PANTALLA (sin Zod ni nada de servidor, para no llevarlo al
 * bundle del navegador). La validación de entrada y la lectura del puente están en `carnets-escritura.ts`.
 *
 * 🚨 `sin_puente` (503: el puente no está configurado) ≠ `error` (502: no contestó o falló). Ninguno culpa a
 * la persona.
 */
import { MENSAJE_SOLO_CONSULTA } from './mensajes-ficha.ts'
import type { TitularCarnets } from './carnets-titulares'

export type ResultadoEscrituraCarnet =
  | { estado: 'ok'; id: string }
  /** El dato no vale (tipo, fecha). `motivo` viene de la regla compartida y se puede enseñar. */
  | { estado: 'invalido'; motivo: string; campo?: string }
  /** Ya tiene un carné de ese tipo en ese titular. */
  | { estado: 'duplicado' }
  /** El carné o el titular no son suyos, o ya no existen. */
  | { estado: 'no_encontrado' }
  /** La ficha es suya pero su vínculo es de solo consulta (403 del puente). */
  | { estado: 'sin_permiso' }
  /** Su acceso no está enlazado con ninguna ficha. */
  | { estado: 'sin_ficha' }
  /** El puente no está configurado en este despliegue (503). NO es «falló el envío». */
  | { estado: 'sin_puente' }
  /** El puente no respondió o falló (502). */
  | { estado: 'error'; causa: string }

/**
 * Los titulares en los que se puede escribir: los que traen su ficha (`fichaId`). Un titular sin ficha
 * (respuesta del puente anterior) se enseña pero no se toca: sin ficha no hay a quién decirle «es tuyo».
 */
export function titularesEscribibles(titulares: readonly TitularCarnets[]): TitularCarnets[] {
  return titulares.filter((t) => t.fichaId.trim() !== '')
}

/** El selector de titular solo aparece con MÁS de uno en el que se pueda escribir. */
export function necesitaSelectorTitular(titulares: readonly TitularCarnets[]): boolean {
  return titularesEscribibles(titulares).length > 1
}

/** Lo que se le dice a la persona cuando no sale. Nunca la culpa de lo que no es suyo. */
export function textoAvisoCarnet(r: Exclude<ResultadoEscrituraCarnet, { estado: 'ok' }>): string {
  switch (r.estado) {
    case 'invalido':
      return `Revisa el carné: ${r.motivo.replace(/\.$/, '')}. No se ha guardado.`
    case 'duplicado':
      return 'Ya tienes un carné de ese tipo guardado: cambia su fecha en vez de añadir otro.'
    case 'no_encontrado':
      return 'No hemos encontrado ese carné. Puede que ya lo hayas cambiado desde otra pestaña: recarga la página.'
    case 'sin_permiso':
      return MENSAJE_SOLO_CONSULTA
    case 'sin_ficha':
      return 'Tu acceso todavía no está enlazado con tu ficha, así que no podemos guardar carnés. Escríbenos y lo enlazamos.'
    case 'sin_puente':
      return 'Ahora mismo no podemos guardar carnés. No se ha cambiado nada; vuelve a intentarlo más tarde.'
    default:
      return 'No hemos podido guardarlo por un problema nuestro. No se ha cambiado nada: inténtalo de nuevo en un momento.'
  }
}

/** `aaaa-mm-dd` → `dd/mm/aaaa`; cualquier otra cosa, tal cual (nunca se inventa una fecha). */
export function fechaCarnetEs(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

// ─── Fechas de la tarjeta (21/10/2026) ───────────────────────────────────────

/** Lo que se dice cuando hay carné pero no se puede calcular su caducidad. No hay pantalla donde completarlo. */
export const TEXTO_FALTA_NACIMIENTO =
  'Nos falta tu fecha de nacimiento para calcular la caducidad. Tú no puedes cambiarla desde el portal: escríbenos con una copia de tu DNI y la completamos.'

type FechasCarnet = { fechaCaducidad: string | null; fechaExpedicion?: string | null }

/**
 * «Expedido el dd/mm/aaaa · Caduca el dd/mm/aaaa». Cada mitad solo si se conoce: una fecha que no consta no se
 * inventa ni se sustituye por otra. Sin ninguna de las dos → `null` (la tarjeta no pinta línea).
 */
export function textoFechasCarnet(c: FechasCarnet): string | null {
  const partes: string[] = []
  const exp = c.fechaExpedicion?.trim()
  if (exp) partes.push(`Expedido el ${fechaCarnetEs(exp)}`)
  if (c.fechaCaducidad !== null) partes.push(`Caduca el ${fechaCarnetEs(c.fechaCaducidad)}`)
  return partes.length > 0 ? partes.join(' · ') : null
}

/** Hay carné pero no caducidad calculable: falta el nacimiento (el puente no distingue otra causa). */
export function faltaNacimiento(c: FechasCarnet): boolean {
  return c.fechaCaducidad === null
}

/** Qué fecha se ofrece al pulsar «Cambiar»: la caducidad (anverso) salvo que no conste y sí la expedición. */
export function modoInicialCambio(c: FechasCarnet): 'caducidad' | 'expedicion' {
  return c.fechaCaducidad === null && (c.fechaExpedicion?.trim() ?? '') !== '' ? 'expedicion' : 'caducidad'
}

/** Valor PRECARGADO del campo de fecha (`aaaa-mm-dd`) según el modo elegido; `''` si esa fecha no consta. */
export function fechaPrecargada(c: FechasCarnet | null, cual: 'caducidad' | 'expedicion'): string {
  if (c === null) return ''
  const v = cual === 'caducidad' ? c.fechaCaducidad : (c.fechaExpedicion ?? null)
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : ''
}

/** Lee el interruptor de `GET /api/push/preferencias`: `null` = no se sabe (nunca se pinta «encendido» a ciegas). */
export function leerInterruptorCarnet(j: unknown): boolean | null {
  if (typeof j !== 'object' || j === null) return null
  const p = (j as { preferencias?: unknown }).preferencias
  if (typeof p !== 'object' || p === null) return null
  const v = (p as Record<string, unknown>)['vencimiento_carnet']
  return typeof v === 'boolean' ? v : null
}
