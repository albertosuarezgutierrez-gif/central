// Estado del EMAIL de una ficha y qué hacer con un rebote/queja (07/11/2026). PURO: sin BD ni red, lo lee
// `node --test` (`email-estado.test.ts`).
//
// Rebote ≠ baja (decisión de Alberto, 07/11/2026):
//  - BAJA (`email_opt_out_at`) = la persona NO QUIERE: enlace de baja, One-Click, lo pidió, o lo marcó como spam.
//    No se limpia nunca sola.
//  - REBOTE (`email_rebotado_at`) = la DIRECCIÓN no vale: rebote duro o supresión de Resend. Se limpia sola si la
//    dirección de la ficha cambia (trigger del SQL `2026-11-07_email_rebotado.sql`).
//  - QUEJA de spam (`email.complained`) sigue siendo BAJA: el correo LLEGÓ (la dirección vale) y la persona dijo
//    «no lo quiero». Tratarla como dirección mala la desbloquearía al cambiar el email, y a quien se queja no se le
//    vuelve a escribir por ninguna dirección (además, Gmail/Yahoo exigen dejar de enviar tras una queja).
// Las dos cosas bloquean igual todo envío automático.
//
// Tres estados (regla del repo): `null` = no se ha podido mirar; `sin_comprobar` = se miró y no hay prueba ni de
// que valga ni de que no. Nunca se afirma «válido» sin un evento que lo pruebe.

import { esCanalCorreduria, esTelefonoComodin } from '@central/module-seguros'

export type EstadoEmail = 'sin_comprobar' | 'entregado' | 'abierto' | 'entro_portal' | 'rebotado' | 'baja'

export const ETIQUETA_ESTADO_EMAIL: Record<EstadoEmail, string> = {
  sin_comprobar: 'Email sin comprobar',
  entregado: 'Email entregado',
  abierto: 'Email abierto',
  entro_portal: 'Entró al portal',
  rebotado: 'Email rebotado',
  baja: 'Baja de correo',
}

export type EventoEstado = { tipo: string; en: string | Date }

export type EntradaEstadoEmail = {
  optOutAt: Date | string | null
  rebotadoAt: Date | string | null
  /**
   * Eventos de Resend de los correos enviados A LA DIRECCIÓN ACTUAL de la ficha (los de una dirección vieja no
   * dicen nada de la nueva). `null` = no se pudieron leer; `[]` = leídos y no hay ninguno.
   */
  eventos: readonly EventoEstado[] | null
  /** ¿Entró al portal alguna vez (vínculo propio, no el del corredor)? `null` = no se pudo mirar. */
  entroPortal: boolean | null
}

const NEGATIVOS = new Set(['email.bounced', 'email.suppressed'])
const POSITIVOS = new Set(['email.delivered', 'email.opened', 'email.clicked'])
const LECTURA = new Set(['email.opened', 'email.clicked'])

const ms = (v: string | Date) => (v instanceof Date ? v.getTime() : new Date(v).getTime())

/**
 * El estado del email, de más a menos grave: baja › rebotado › entró al portal › abierto › entregado ›
 * sin comprobar. `null` = faltó una lectura y no hay marca que lo decida: no se afirma nada.
 */
export function estadoEmail(e: EntradaEstadoEmail): EstadoEmail | null {
  if (e.optOutAt) return 'baja'
  if (e.rebotadoAt) return 'rebotado'
  const ev = e.eventos ?? []
  // Una queja prueba la entrega, pero es un «no quiero»: aunque la baja no se escribiera (webhook caído), no
  // se pinta como email bueno.
  if (ev.some((x) => x.tipo === 'email.complained')) return 'baja'
  // El último rebote manda sobre lo anterior; un positivo POSTERIOR (la dirección volvió a aceptar) lo supera.
  const ultimoRebote = Math.max(-Infinity, ...ev.filter((x) => NEGATIVOS.has(x.tipo)).map((x) => ms(x.en)))
  const despues = ev.filter((x) => POSITIVOS.has(x.tipo) && ms(x.en) > ultimoRebote)
  if (ultimoRebote > -Infinity && despues.length === 0) return 'rebotado'
  if (e.entroPortal === true) return 'entro_portal'
  if (despues.some((x) => LECTURA.has(x.tipo))) return 'abierto'
  if (despues.length > 0) return 'entregado'
  if (e.eventos === null || e.entroPortal === null) return null
  return 'sin_comprobar'
}

export type AccionEvento = { accion: 'marcar_rebote'; motivo: string } | { accion: 'baja' } | null

const SUBTIPO = /^[A-Za-z][A-Za-z ]{0,30}$/

/**
 * Qué hace la ficha con un evento de Resend. Rebote TRANSITORIO (`tipoRebote: Transient`: buzón lleno, servidor
 * caído) no marca nada: la dirección puede valer. El motivo nunca lleva el mensaje del servidor remoto (suele
 * incluir la dirección), solo el subtipo, que es un vocabulario cerrado de Resend.
 */
export function accionPorEvento(tipo: string, detalle: Record<string, string> = {}): AccionEvento {
  if (tipo === 'email.complained') return { accion: 'baja' }
  if (tipo === 'email.suppressed') return { accion: 'marcar_rebote', motivo: 'suprimido' }
  if (tipo !== 'email.bounced') return null
  if ((detalle.tipoRebote ?? '').trim().toLowerCase() === 'transient') return null
  const sub = (detalle.subtipoRebote ?? '').trim()
  return { accion: 'marcar_rebote', motivo: SUBTIPO.test(sub) ? `rebote:${sub}`.slice(0, 60) : 'rebote' }
}

/**
 * ¿El rebote es de una dirección que la ficha TIENE hoy? Si la dirección ya no está (se cambió o se borró), marcar
 * la ficha bloquearía la buena. Sin hash del destino no se puede comprobar: se marca (conservador con la
 * reputación del dominio; la marca se limpia en cuanto cambie la dirección).
 */
export function reboteEsDeLaFicha(hashDestino: string | null, hashesFicha: readonly (string | null)[]): boolean {
  if (!hashDestino) return true
  return hashesFicha.some((h) => h === hashDestino)
}

/**
 * ¿Bloqueado para envíos automáticos? Baja y rebote bloquean igual. `emailRebotadoAt` es OBLIGATORIO en el tipo
 * a propósito: quien olvide leerlo en su `select` no compila (un campo opcional dejaría pasar el olvido).
 */
export function emailBloqueado(c: { emailOptOutAt: Date | null; emailRebotadoAt: Date | null }): boolean {
  return c.emailOptOutAt != null || c.emailRebotadoAt != null
}

// ─── Contactabilidad (07/11/2026, Alberto: «un rebote NO da de baja: puede tener el móvil bien») ────────────────
// DERIVADA, nunca guardada ni escrita como baja: es una señal para que Alberto busque otro contacto.
//  - `ilocalizable` = el email no sirve (rebotado, o no hay ninguno) Y no hay teléfono utilizable.
//  - Tres estados en el teléfono: «vacío» solo si se LEYÓ y no hay nada utilizable; si no se pudo leer (cifrado que
//    no abre, lista sin cargar), `null` = pendiente, y entonces no se afirma ilocalizable.
//  - La BAJA no es un problema de contacto (es su decisión): sin teléfono, `no_aplica`, no `ilocalizable` (buscarle
//    otro correo sería saltarse su «no»).

export type EstadoTelefono = 'utilizable' | 'vacio'
export type Contactabilidad = 'localizable' | 'ilocalizable' | 'pendiente' | 'no_aplica'

export const ETIQUETA_CONTACTABILIDAD: Record<Contactabilidad, string> = {
  localizable: 'Localizable',
  ilocalizable: 'Ilocalizable: email malo y sin teléfono',
  pendiente: 'Contacto sin comprobar',
  no_aplica: 'Baja de correo',
}

/** Un teléfono que se puede marcar: 9+ dígitos, ni comodín («000000000») ni el de la correduría. */
export function telefonoUtilizable(v: string | null | undefined): boolean {
  if (typeof v !== 'string') return false
  const d = v.replace(/\D/g, '')
  return d.length >= 9 && !esTelefonoComodin(v) && !esCanalCorreduria(v)
}

/**
 * Estado de los teléfonos de la ficha. Cada valor: el texto DESCIFRADO, `''`/`null` = campo vacío, o `undefined` =
 * guardado pero ilegible / no se pudo leer. Uno utilizable basta; si alguno no se pudo leer, `null` (pendiente).
 */
export function estadoTelefonos(valores: readonly (string | null | undefined)[] | null): EstadoTelefono | null {
  if (valores === null) return null
  if (valores.some((v) => telefonoUtilizable(v))) return 'utilizable'
  if (valores.some((v) => v === undefined)) return null
  return 'vacio'
}

/**
 * `email`: el estado de `estadoEmail()`, o `'sin_email'` (se leyó y no hay ninguna dirección), o `null` (no se sabe).
 */
export function contactabilidad(email: EstadoEmail | 'sin_email' | null, telefono: EstadoTelefono | null): Contactabilidad {
  if (telefono === 'utilizable') return 'localizable'
  if (email === 'entregado' || email === 'abierto' || email === 'entro_portal' || email === 'sin_comprobar') return 'localizable'
  if (email === 'baja') return telefono === 'vacio' ? 'no_aplica' : 'pendiente'
  if ((email === 'rebotado' || email === 'sin_email') && telefono === 'vacio') return 'ilocalizable'
  return 'pendiente'
}
