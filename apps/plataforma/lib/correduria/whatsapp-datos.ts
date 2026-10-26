import { datosMinimosSolicitud, mensajeDatosTarificarWhatsapp, ramoSolicitud } from '@central/module-seguros'
import { enlaceWhatsappConMensaje } from '../telefono-wa.ts'

/**
 * «WhatsApp» de la tarjeta de Oportunidades (30/10/2026): pedir al lead o cliente lo necesario para tarificar.
 * Módulo PURO. No envía nada: devuelve el `wa.me` con el mensaje ya escrito, que Alberto abre, revisa y envía él.
 *
 * El texto lo redacta `mensajeDatosTarificarWhatsapp` (module-seguros, bajo `copy-regulado`); aquí no se compone copy.
 */
export type WhatsappDatos =
  | { ok: true; href: string; mensaje: string; conEnlace: boolean }
  | { ok: false; motivo: string }

/** Por qué NO se puede preparar el WhatsApp (el botón sale desactivado con este motivo; nunca un `wa.me` vacío). `null` = se puede. */
export function motivoSinWhatsapp(telefono: string | null | undefined, ramo: string | null): string | null {
  if (ramoSolicitud(ramo) === null) return 'Este ramo no tiene formulario de datos'
  if (!telefono || telefono.trim() === '') return 'Sin teléfono en la ficha'
  if (enlaceWhatsappConMensaje(telefono, 'x') === null) return 'Su teléfono no es un móvil'
  return null
}

/**
 * El WhatsApp listo para abrir. `url` = el enlace al formulario `/datos` recién emitido; `null` (no se pudo emitir, o ya
 * había uno vivo cuyo token no se puede repetir) → el mensaje lista los datos mínimos del ramo.
 */
export function prepararWhatsappDatos(d: { telefono: string | null | undefined; nombre: string | null | undefined; ramo: string | null; url: string | null }): WhatsappDatos {
  const motivo = motivoSinWhatsapp(d.telefono, d.ramo)
  if (motivo !== null) return { ok: false, motivo }
  const ramo = ramoSolicitud(d.ramo)!
  const url = d.url && /^https:\/\//.test(d.url) ? d.url : null
  const mensaje = mensajeDatosTarificarWhatsapp({ nombre: d.nombre ?? null, ramo, url, datosMinimos: datosMinimosSolicitud(ramo) })
  const href = enlaceWhatsappConMensaje(d.telefono!, mensaje)
  if (href === null) return { ok: false, motivo: 'Su teléfono no es un móvil' }
  return { ok: true, href, mensaje, conEnlace: url !== null }
}
