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
  /** `tomadorJuridica`: el tomador es empresa EXPLÍCITA (lo dice asegura; si no lo manda, `false`: no se inventa una empresa). */
  | { estado: 'contactos'; elegibles: ContactoParaEnviar[]; noElegibles: ContactoDescartado[]; tomadorJuridica: boolean }
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
  return elegibles.length > 0 ? { estado: 'contactos', elegibles, noElegibles, tomadorJuridica: o.tomadorJuridica === true } : { estado: 'nadie', noElegibles }
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

/**
 * La pregunta antes de mandar a un contacto: nada sale sin el OK de Alberto, y le dice A QUIÉN, COMO QUÉ y QUÉ PUEDE hacer
 * (verlo, no aceptarlo). `rotacion` = el aviso de `avisoRotacion` (el enlace que ya tenga el TOMADOR deja de valer) o
 * `null` si no tenía ninguno. PURO.
 */
export function confirmarCorreoContacto(c: ContactoParaEnviar, o: { tomadorJuridica: boolean; rotacion: string | null }): string {
  const como = o.tomadorJuridica ? 'como persona de contacto de la empresa' : 'como persona autorizada por el tomador'
  const rotacion = o.rotacion ? ` ${o.rotacion.replace(/\s*¿Seguir\?\s*$/, '').replace(/^El cliente/, 'El tomador')}` : ''
  return `Se le manda a ${etiquetaContacto(c)} (${c.email}) el aviso con el enlace y un código para VER este presupuesto, ${como} (no como tomador): no podrá aceptarlo ni firmarlo.${rotacion} ¿Enviar?`
}

// ─── WhatsApp a una persona de contacto (21/10/2026, idea 4) ──────────────────────────────────────────────────────────
// El teléfono del tomador suele ser una centralita: por WhatsApp Alberto puede elegir entre el TOMADOR y un contacto que
// cumpla la MISMA regla (`destinatariosPresupuesto` con `canal:'whatsapp'`: dueño/administrador/representante de una
// empresa, o autorizado a ver sus pólizas, con móvil válido). 🚨 Aquí NO llega ningún teléfono: el número del elegido solo
// sale en el `wa.me` de la respuesta del envío, después de que asegura revalide. El contacto solo VE (marca en asegura).

export type ContactoWhatsapp = { clienteId: string; nombre: string | null; relacion: string; via: ViaDestino }
export type MovilTomador = 'con_movil' | 'sin_movil' | 'no_se_sabe'
export type LecturaDestinatariosWhatsapp = { elegibles: ContactoWhatsapp[]; noElegibles: ContactoDescartado[]; tomadorJuridica: boolean; movilTomador: MovilTomador }

/**
 * `GET …/destinatarios?canal=whatsapp` → lo que pinta el selector del WhatsApp. `null` = no se pudo leer (y entonces solo
 * se ofrece el tomador, lo de siempre: «no se pudo mirar» nunca es «no hay contactos»). Un teléfono que viniera en la
 * respuesta se IGNORA (no se lee ningún campo de número). PURO.
 */
export function leerDestinatariosWhatsapp(status: number, j: unknown): LecturaDestinatariosWhatsapp | null {
  const o = obj(j)
  const d = obj(o?.destinatarios)
  if (status !== 200 || o?.estado !== 'ok' || !d || (d.estado !== 'contactos' && d.estado !== 'nadie') || !Array.isArray(d.noElegibles)) return null
  const noElegibles = d.noElegibles.map(leerDescartado).filter((x): x is ContactoDescartado => x !== null)
  const elegibles: ContactoWhatsapp[] = []
  if (d.estado === 'contactos' && Array.isArray(d.elegibles)) {
    for (const e of d.elegibles) {
      const x = obj(e)
      const clienteId = texto(x?.clienteId)
      if (!x || !clienteId || (x.via !== 'representacion' && x.via !== 'autorizacion')) continue
      elegibles.push({ clienteId, nombre: texto(x.nombre), relacion: texto(x.relacion) ?? '—', via: x.via })
    }
  }
  const m = o.movilTomador
  const movilTomador: MovilTomador = m === 'con_movil' || m === 'sin_movil' ? m : 'no_se_sabe'
  return { elegibles, noElegibles, tomadorJuridica: o.tomadorJuridica === true, movilTomador }
}

/** La opción del TOMADOR en el selector del WhatsApp: dice si su chat se abrirá con número. */
export function etiquetaTomadorWhatsapp(m: MovilTomador | null): string {
  if (m === 'con_movil') return 'El tomador (al móvil de su ficha)'
  if (m === 'sin_movil') return 'El tomador (sin móvil válido: eliges tú el chat)'
  return 'El tomador'
}

/**
 * La pregunta antes de abrir el WhatsApp a un contacto: A QUIÉN, COMO QUÉ y QUÉ PUEDE hacer (verlo, no aceptarlo), y que
 * lo manda Alberto. `rotacion` = el aviso de `avisoRotacion` (el enlace que ya tenga el TOMADOR deja de valer). PURO.
 */
export function confirmarWhatsappContacto(c: ContactoWhatsapp, o: { tomadorJuridica: boolean; rotacion: string | null }): string {
  const como = o.tomadorJuridica ? 'como persona de contacto de la empresa' : 'como persona autorizada por el tomador'
  // Neutro: el enlace vivo puede ser del tomador o de otra persona de contacto; no se da por hecho de quién.
  const rotacion = o.rotacion ? ' El enlace enviado antes (a quien fuera) deja de valer.' : ''
  return `Se abre WhatsApp con el chat de ${etiquetaContacto(c)} (el móvil de su ficha) y un mensaje con el enlace y un código para VER este presupuesto, ${como} (no como tomador): no podrá aceptarlo ni firmarlo. Lo mandas tú.${rotacion} ¿Seguir?`
}
