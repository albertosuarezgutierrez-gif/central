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
