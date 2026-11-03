// lib/sivra/facturas/aviso-smoobu.ts — aviso al huésped por el hilo de Smoobu de que su factura ha salido por correo.
// PURO (sin red ni BD): las dependencias se inyectan para poder testearlo con `node --test`.
//
// Es un aviso TRANSACCIONAL ligado al ✅ de Alberto en esa factura (su ✅ autoriza el correo Y este aviso). No pasa por
// el agente de huéspedes ni cambia sus reglas: se manda por el mismo `enviarAlHuespedDetallado` (que lo anota en
// `mensajes_enviados`, así el agente no lo toma por una pregunta del huésped).
//
// Reglas:
//   · Solo tras el correo con éxito Y la transición a `enviada` en ESTE intento (UPDATE … AND estado = 'emitida' = 1
//     fila). Esa transición ocurre una vez por factura → un aviso por factura.
//   · Segunda barrera sin columna nueva: si `mensajes_enviados` ya tiene ESE texto exacto para la reserva (lleva el
//     número de factura), no se repite.
//   · Fail-open: si Smoobu falla, la factura sigue `enviada`; se le dice a Alberto el motivo. Sin reintentos.

import type { Receptor } from './receptor.ts'

export type ResultadoAvisoSmoobu =
  | { estado: 'enviado' }
  | { estado: 'ya_avisado' }
  | { estado: 'no_enviado'; motivo: string }

/** Particular → su nombre. Empresa → el nombre de la reserva (la persona que se alojó); sin él, el de la empresa. */
export function nombreSaludo(receptor: Pick<Receptor, 'tipo' | 'nombre'>, nombreReserva: string | null | undefined): string {
  const reserva = (nombreReserva ?? '').replace(/\s+/g, ' ').trim()
  if (receptor.tipo === 'empresa' && reserva) return reserva
  return receptor.nombre.replace(/\s+/g, ' ').trim()
}

export function textoAvisoFactura(d: { nombre: string; numero: string; email: string }): string {
  const hola = d.nombre ? `Hola ${d.nombre}` : 'Hola'
  const hi = d.nombre ? `Hi ${d.nombre}` : 'Hi'
  return [
    `${hola}, te hemos enviado la factura ${d.numero} a ${d.email}. Si no la ves, revisa la carpeta de spam. ¡Gracias por tu estancia!`,
    '',
    `${hi}, we have sent invoice ${d.numero} to ${d.email}. If you can't find it, please check your spam folder. Thanks for staying with us!`,
  ].join('\n')
}

export type DepsAviso = {
  /** ¿Ya consta ESTE texto enviado a esa reserva (`mensajes_enviados`)? */
  yaEnviado: (reservationId: string, texto: string) => Promise<boolean>
  /** `enviarAlHuespedDetallado` (o un doble en tests). */
  enviar: (reservationId: string, texto: string) => Promise<{ ok: true } | { ok: false; status: number; motivo: { texto: string } }>
}

/** Nunca lanza: cualquier fallo se devuelve como `no_enviado` (la factura ya está enviada; esto no la toca). */
export async function avisarFacturaEnSmoobu(
  d: { reservationId: string; nombre: string; numero: string; email: string },
  deps: DepsAviso,
): Promise<ResultadoAvisoSmoobu> {
  try {
    if (!d.reservationId) return { estado: 'no_enviado', motivo: 'la factura no tiene reserva de Smoobu' }
    const texto = textoAvisoFactura(d)
    if (await deps.yaEnviado(d.reservationId, texto)) return { estado: 'ya_avisado' }
    const r = await deps.enviar(d.reservationId, texto)
    return r.ok ? { estado: 'enviado' } : { estado: 'no_enviado', motivo: r.motivo.texto }
  } catch (e) {
    return { estado: 'no_enviado', motivo: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export type PasosEnvio = {
  enviarCorreo: () => Promise<void>
  /** UPDATE a `enviada` condicionado a `estado = 'emitida'`: devuelve las filas cambiadas. */
  marcarEnviada: () => Promise<number>
  avisar: () => Promise<ResultadoAvisoSmoobu>
}

export type ResultadoPasos =
  | { ok: true; aviso: ResultadoAvisoSmoobu }
  | { ok: false; motivo: string }

/**
 * Orden del camino de éxito: correo → `enviada` → aviso. Si el correo falla, ni se marca ni se avisa. Si la transición
 * no la hizo ESTE intento (0 filas), no se avisa (el aviso va ligado a la transición). Si `marcarEnviada` lanza, se
 * propaga (el reclamo queda colgado = «dudoso», como antes) y tampoco se avisa.
 */
export async function correoYAviso(p: PasosEnvio): Promise<ResultadoPasos> {
  try {
    await p.enviarCorreo()
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'fallo de envío' }
  }
  const n = await p.marcarEnviada()
  if (n !== 1) return { ok: true, aviso: { estado: 'no_enviado', motivo: 'la factura no pasó a enviada en este intento' } }
  try {
    return { ok: true, aviso: await p.avisar() }
  } catch (e) {
    return { ok: true, aviso: { estado: 'no_enviado', motivo: e instanceof Error ? e.message : 'error inesperado' } }
  }
}

/** Sufijo de la línea de Telegram para Alberto. */
export function lineaAviso(a: ResultadoAvisoSmoobu): string {
  switch (a.estado) {
    case 'enviado': return '📧 correo enviado · 💬 aviso en Smoobu enviado'
    case 'ya_avisado': return '📧 correo enviado · 💬 aviso en Smoobu ya constaba enviado'
    case 'no_enviado': return `📧 correo enviado · ⚠️ aviso en Smoobu no enviado: ${a.motivo}`
  }
}
