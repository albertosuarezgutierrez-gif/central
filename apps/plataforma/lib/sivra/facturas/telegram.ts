// lib/sivra/facturas/telegram.ts — botones de Telegram de la factura al huésped. PURO (sin red ni BD).
//
// Prefijo de callback PROPIO: `fhu` (factura huésped). Lo enruta `app/api/sivra/mensajes/telegram-webhook/route.ts`.
//   · fhu_emi:<uuid>  ✅ Enviar (asigna número, PDF, correo al huésped con CC). ÚNICA vía de emisión: nada sale sin él.
//   · fhu_cor:<uuid>  ✏️ Corregir (solo mensajes anteriores al 29/10/2026; hoy ✏️ Modificar es un enlace a plataforma).
//   · fhu_env:<uuid>  🔁 Reintentar el envío del correo de una factura YA emitida (nunca vuelve a numerar).
// Emitir sale a un TERCERO (el huésped) y crea un documento fiscal: solo la PERSONA autorizada
// (from.id = TELEGRAM_CHAT_ID), igual que `cas_emitir`, `clp_*` y `csg_*`. El chat solo no basta (en un grupo
// cualquiera podría pulsar). `callback_data` ≤ 64 bytes: «fhu_emi:» + uuid = 44.

import { escapeHtml, type Boton } from '@central/core-telegram'
import { eur } from '../../dinero.ts'
import { lineasDireccion, type Receptor } from './receptor.ts'

export const PREFIJO_FACTURA_HUESPED = 'fhu'
export type AccionFactura = 'emi' | 'cor' | 'env'

export type DecisionBotonFactura =
  | { ok: true; accion: AccionFactura; facturaId: string; quien: string }
  | { ok: false; toast: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function decidirBotonFactura(
  cb: { from?: { id?: number | string } },
  action: string,
  args: readonly string[],
  chatPermitido: string | undefined,
): DecisionBotonFactura {
  if (!chatPermitido || String(cb.from?.id ?? '') !== String(chatPermitido)) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if (action !== 'emi' && action !== 'cor' && action !== 'env') return { ok: false, toast: 'Acción desconocida' }
  if (args.length !== 1 || !UUID.test(args[0] ?? '')) return { ok: false, toast: 'Factura no encontrada' }
  return { ok: true, accion: action, facturaId: args[0], quien: String(cb.from?.id) }
}

/**
 * ¿El ✅ pulsado es el del mensaje VIGENTE del borrador? El ✅ emite lo que hay en BD: solo vale si el mensaje que vio
 * Alberto es el último que se le mandó con esos datos (al regenerar el borrador, `telegram_message_id` pasa a NULL y
 * luego al del mensaje nuevo). Sin dato por cualquiera de los lados → NO (fail-closed).
 */
export function mensajeVigente(guardado: bigint | number | null | undefined, pulsado: number | null | undefined): boolean {
  if (guardado === null || guardado === undefined || pulsado === null || pulsado === undefined) return false
  if (!Number.isSafeInteger(pulsado)) return false
  return BigInt(guardado) === BigInt(pulsado)
}

/** ✏️ Modificar: la pantalla de facturas con la reserva ya buscada en «Nueva factura a mano» (corregir = volver a
 *  guardar los datos de esa misma reserva; al guardar llega un borrador nuevo y el ✅ viejo deja de valer). */
export function urlModificar(base: string, reservationId: string): string {
  return `${base.replace(/\/+$/, '')}/sivra/facturas?reserva=${encodeURIComponent(reservationId)}`
}

/** Botones del borrador: ✅ Enviar (callback `fhu_emi`: emite y envía con CC) y ✏️ Modificar (enlace, no emite). */
export function botonesPropuesta(facturaId: string, modificar: string): Boton[][] {
  return [[
    { texto: '✅ Enviar', callback: `${PREFIJO_FACTURA_HUESPED}_emi:${facturaId}` },
    { texto: '✏️ Modificar', url: modificar },
  ]]
}

export function botonReintento(facturaId: string): { texto: string; callback: string }[][] {
  return [[{ texto: '🔁 Reintentar envío', callback: `${PREFIJO_FACTURA_HUESPED}_env:${facturaId}` }]]
}

export type ResumenPropuesta = {
  piso: string
  reservationId: string
  estanciaDesde: string | null
  estanciaHasta: string | null
  receptor: Receptor
  total: number
  base: number | null
  cuota: number | null
  tipoIva: number | null
  /** `null` = la serie está lista. Texto = por qué el ✅ NO emitirá todavía (fail-closed). */
  bloqueo: string | null
  /** Correos en copia del envío (`receptor_cc`). `[]` = sin copia. */
  cc?: string[]
  /** Número que tendría si se emite ahora (siguiente de la serie). `null` = serie sin configurar. */
  numeroPrevisto?: string | null
}

const f = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—')

/** Texto HTML del aviso a Alberto. Todo lo que viene del huésped va escapado. */
export function textoPropuesta(r: ResumenPropuesta): string {
  const x = (s: string) => escapeHtml(s)
  const lin = [
    '🧾 <b>Factura de huésped lista para revisar</b>',
    `${x(r.piso)} · reserva ${x(r.reservationId)} · ${f(r.estanciaDesde)} → ${f(r.estanciaHasta)}`,
    '',
    `<b>${x(r.receptor.nombre)}</b> (${r.receptor.tipo}) · ${r.receptor.pais === 'ES' ? 'NIF' : 'Id. fiscal'} ${x(r.receptor.nif)}`,
    x(lineasDireccion(r.receptor).join(', ')),
    `✉️ ${x(r.receptor.email)}${r.cc?.length ? ` · CC ${x(r.cc.join(', '))}` : ''}`,
    ...(r.numeroPrevisto ? [`Nº que tendría: <b>${x(r.numeroPrevisto)}</b> (si no se emite otra antes)`] : []),
    '',
    r.base !== null && r.cuota !== null && r.tipoIva !== null
      ? `Base ${eur(r.base)} + IVA ${r.tipoIva} % ${eur(r.cuota)} = <b>${eur(r.total)}</b>`
      : `Total <b>${eur(r.total)}</b> (IVA incluido; base y cuota al configurar el IVA)`,
  ]
  if (r.bloqueo) lin.push('', `⛔ <b>${x(r.bloqueo)}</b> — el ✅ no emitirá hasta que esté configurado.`)
  else lin.push('', 'Nada sale sin tu botón: ✅ Enviar asigna el número, la emite (inmutable) y la envía por correo al huésped (con CC). ✏️ Modificar abre la reserva en plataforma para corregir.')
  return lin.join('\n')
}
