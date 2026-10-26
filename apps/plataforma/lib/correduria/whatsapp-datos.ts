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
 * El WhatsApp listo para abrir. `url` = el enlace al formulario `/datos` recién emitido (o REEMITIDO: con uno vivo, asegura
 * le da token nuevo a la misma solicitud, 26/10/2026); `null` = la emisión FALLÓ de verdad → el mensaje lista los datos
 * mínimos del ramo y la pantalla lo dice (`avisoTrasWhatsapp`), nunca como si fuera bueno.
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

/**
 * El enlace de la respuesta de `POST /api/correduria/solicitud-datos` (con `reemitir`), o POR QUÉ no llegó (26/10/2026).
 * Con `reemitir` un 200 sin `url` ya no es «había uno vivo»: es un fallo, y se dice.
 */
export function enlaceDeRespuestaSolicitud(status: number, json: Record<string, unknown> | null): { url: string | null; motivo: string | null } {
  const url = (status === 201 || status === 200) && typeof json?.url === 'string' && /^https:\/\//.test(json.url) ? json.url : null
  if (url) return { url, motivo: null }
  if (status === 0) return { url: null, motivo: 'sin conexión' }
  const motivo = typeof json?.motivo === 'string' && json.motivo.trim() !== '' ? json.motivo.trim() : null
  if (status === 200 || status === 201) return { url: null, motivo: motivo ?? 'asegura no ha devuelto el enlace' }
  return { url: null, motivo: motivo ?? `HTTP ${status}` }
}

/** Lo que dice la pantalla tras abrir el WhatsApp. Sin enlace, lo dice CLARO: el mensaje no es el bueno. */
export function avisoTrasWhatsapp(d: { conEnlace: boolean; motivoSinEnlace: string | null; notaStatus: number }): string {
  const base = d.conEnlace
    ? 'Revisa el mensaje y envíalo tú.'
    : `No se pudo generar el enlace al formulario${d.motivoSinEnlace ? ` (${d.motivoSinEnlace})` : ''}: el mensaje va SIN enlace y solo lista los datos. Revísalo antes de enviarlo o vuelve a intentarlo.`
  return d.notaStatus === 200 ? base : `${base} No se ha anotado en el historial (HTTP ${d.notaStatus}).`
}
