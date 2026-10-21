// «Enviar al cliente» (21/10/2026): lo PURO del bloque (con test). El texto, el token y el código NO se generan aquí: los
// genera asegura (`envio-presupuesto.ts` + `mensajePresupuestoWhatsapp`) con `accion:'avisar', canal:'whatsapp_enlace'`,
// que también anota `enlace_generado`. Nada sale sin el clic de Alberto: copiar y WhatsApp solo le dan el texto/chat.

import type { ContactoFicha } from '@/lib/ficha-asegura'
import { TEXTO_NO_ELEGIBLE, type MotivoNoElegible, type ViaDestino } from '@central/module-seguros'

/** ¿El tomador tiene correo? Tres estados: `null` = no se ha podido comprobar (ficha ilegible), nunca «no tiene». */
export function correoDelTomador(contacto: Pick<ContactoFicha, 'email' | 'emailIlegible'> | null | undefined): 'con_email' | 'sin_email' | 'no_se_sabe' {
  if (!contacto) return 'no_se_sabe'
  if (contacto.emailIlegible) return 'no_se_sabe'
  return contacto.email && contacto.email.trim() !== '' ? 'con_email' : 'sin_email'
}

/** La respuesta de `avisar` por `whatsapp_enlace` → lo que el bloque necesita. `null` = no vino un enlace. PURO. */
export function leerEnlaceAviso(status: number, j: unknown): { mensaje: string; whatsapp: string; enlace: string; conTelefono: boolean } | null {
  const o = typeof j === 'object' && j !== null ? (j as Record<string, unknown>) : null
  if (status !== 200 || o?.estado !== 'enlace') return null
  if (typeof o.mensaje !== 'string' || typeof o.whatsapp !== 'string' || typeof o.enlace !== 'string') return null
  if (!/^https:\/\/wa\.me\//.test(o.whatsapp)) return null
  return { mensaje: o.mensaje, whatsapp: o.whatsapp, enlace: o.enlace, conTelefono: typeof o.telefono === 'string' && o.telefono !== '' }
}

export const CONFIRMAR_CORREO = 'Se le manda por correo el aviso con el enlace (sin precios: los ve al entrar con su código). ¿Enviar?'

// ─── Persona de contacto (21/10/2026, regla de Alberto) ─────────────────────────────────────────────────────────────
// Si el tomador no tiene correo, el presupuesto puede ir a su dueño, administrador o representante, o a quien el tomador
// autoriza a ver sus pólizas, con correo. La REGLA vive en `@central/module-seguros` (`destinatarios-presupuesto.ts`) y
// la aplica asegura, que además la VUELVE a comprobar al enviar: esta lectura solo pinta el selector.

export type ContactoParaEnviar = { clienteId: string; nombre: string | null; relacion: string; via: ViaDestino; email: string }
export type ContactoDescartado = { clienteId: string; nombre: string | null; relacion: string; motivo: MotivoNoElegible }
export type LecturaDestinatarios =
  | { estado: 'tomador' | 'tomador_no_se_sabe' | 'tomador_baja' }
  | { estado: 'contactos'; elegibles: ContactoParaEnviar[]; noElegibles: ContactoDescartado[] }
  | { estado: 'nadie'; noElegibles: ContactoDescartado[] }

const MOTIVOS = Object.keys(TEXTO_NO_ELEGIBLE) as MotivoNoElegible[]
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

function leerDescartado(v: unknown): ContactoDescartado | null {
  const o = obj(v)
  const clienteId = texto(o?.clienteId)
  const motivo = o?.motivo
  if (!o || !clienteId || typeof motivo !== 'string' || !(MOTIVOS as string[]).includes(motivo)) return null
  return { clienteId, nombre: texto(o.nombre), relacion: texto(o.relacion) ?? '—', motivo: motivo as MotivoNoElegible }
}

/**
 * La respuesta de `GET /api/correduria/presupuesto/destinatarios` → lo que pinta el bloque. `null` = no se pudo leer
 * (y entonces NO se ofrece a nadie: «no se pudo mirar» nunca es «no hay contactos»). Un elegible sin correo en la
 * respuesta se descarta: sin dirección a la vista, Alberto no elige a ciegas. PURO.
 */
export function leerDestinatarios(status: number, j: unknown): LecturaDestinatarios | null {
  const o = obj(j)
  const d = obj(o?.destinatarios)
  if (status !== 200 || o?.estado !== 'ok' || !d) return null
  if (d.estado === 'tomador' || d.estado === 'tomador_no_se_sabe' || d.estado === 'tomador_baja') return { estado: d.estado }
  if (!Array.isArray(d.noElegibles)) return null
  const noElegibles = d.noElegibles.map(leerDescartado).filter((x): x is ContactoDescartado => x !== null)
  if (d.estado === 'nadie') return { estado: 'nadie', noElegibles }
  if (d.estado !== 'contactos' || !Array.isArray(d.elegibles)) return null
  const emails = obj(o.emails) ?? {}
  const elegibles: ContactoParaEnviar[] = []
  for (const e of d.elegibles) {
    const x = obj(e)
    const clienteId = texto(x?.clienteId)
    const email = clienteId ? texto(emails[clienteId]) : null
    if (!x || !clienteId || !email || (x.via !== 'representacion' && x.via !== 'autorizacion')) continue
    elegibles.push({ clienteId, nombre: texto(x.nombre), relacion: texto(x.relacion) ?? '—', via: x.via, email })
  }
  return elegibles.length > 0 ? { estado: 'contactos', elegibles, noElegibles } : { estado: 'nadie', noElegibles }
}

/** «Victor Pérez (Dueño)» — o «(autorizado a ver sus pólizas)» si entra por la autorización. */
export function etiquetaContacto(c: Pick<ContactoParaEnviar, 'nombre' | 'relacion' | 'via'>): string {
  const quien = c.nombre ?? 'Sin nombre'
  return c.via === 'representacion' ? `${quien} (${c.relacion})` : `${quien} (autorizado/a a ver sus pólizas)`
}

/** «Berta López (Accionista): no es dueño, administrador ni representante…» */
export function etiquetaDescartado(c: ContactoDescartado): string {
  return `${c.nombre ?? 'Sin nombre'} (${c.relacion}): ${TEXTO_NO_ELEGIBLE[c.motivo]}`
}

/** La cabecera del bloque cuando el tomador no tiene correo. */
export function cabeceraDestinatarios(l: LecturaDestinatarios | null): string {
  if (l === null) return 'El tomador no tiene correo, y no se han podido leer sus personas de contacto: por correo no se ofrece.'
  if (l.estado === 'contactos') return `El tomador no tiene correo; personas de contacto con correo: ${l.elegibles.map(etiquetaContacto).join(', ')}.`
  if (l.estado === 'nadie') return 'El tomador no tiene correo, y ninguna persona de contacto puede recibirlo (dueño, administrador o representante, o autorizada a ver sus pólizas, con correo).'
  if (l.estado === 'tomador_baja') return 'El tomador se dio de baja de correo: no se le escribe, tampoco a sus contactos.'
  if (l.estado === 'tomador_no_se_sabe') return 'No se ha podido leer el correo del tomador: no se ofrece escribir a sus contactos.'
  return 'El tomador tiene correo: el presupuesto va a él.'
}

/** La pregunta antes de mandar a un contacto: nada sale sin el OK de Alberto, y le dice A QUIÉN y COMO QUÉ. */
export function confirmarCorreoContacto(c: ContactoParaEnviar): string {
  return `Se le manda a ${etiquetaContacto(c)} (${c.email}) el aviso con el enlace y un código que abre SOLO este presupuesto, como persona de contacto de la empresa (no como tomador). ¿Enviar?`
}
