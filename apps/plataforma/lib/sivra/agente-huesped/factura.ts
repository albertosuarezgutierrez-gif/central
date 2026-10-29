// Petición de FACTURA del huésped (12/10/2026, dictado de Alberto).
//
// Caso real: un huésped pidió factura a nombre de su empresa y el agente contestó «se lo traslado al
// anfitrión». Mal por tres lados: (1) quien responde ES el dueño, no un intermediario; (2) para
// emitirla faltan datos fiscales; (3) el control de calidad la tomó por un hueco de la guía, y el
// aviso «lo que le respondas se guarda como hecho de este piso» habría guardado datos fiscales de UN
// huésped como hecho del piso, listos para ofrecérselos a OTRO (fuga de datos personales).
// Una factura es un trámite administrativo de ESTA reserva, no conocimiento del piso.

import { contieneDatoPersonal } from './reglas.ts'

// Palabras de factura en es/en/it/pt/fr. `\b` no sirve con tildes, de ahí el lookaround.
const FACTURA = /(?<![\p{L}])(factura[s]?|facturar|facturaci[oó]n|invoice[s]?|invoicing|vat\s*(?:invoice|number|id)|fattura[e]?|fatturare|fatura[s]?|faturar|facture[s]?|facturer|receipt\s+for\s+(?:my|our)\s+company|tax\s+invoice)(?![\p{L}])/iu
// Pide los papeles a nombre de una empresa: NIF/CIF/VAT/partita IVA/NIPC/TVA junto a «empresa».
const FISCAL = /(?<![\p{L}])(n\.?i\.?f\.?|c\.?i\.?f\.?|vat(?:\s*(?:id|number|no\.?))?|partita\s+iva|nipc|n[uú]mero\s+fiscal|tva|raz[oó]n\s+social)(?![\p{L}])/iu
const EMPRESA = /(?<![\p{L}])(empresa|compa[nñ]\W?[ií]a|sociedad|aut[oó]nomo|company|business|firm|azienda|societ[aà]|ditta|empresa|entreprise|soci[eé]t[eé])(?![\p{L}])/iu

// FALSO POSITIVO conocido: «¿la factura de la luz está incluida?» / «electricity bill» hablan de los
// suministros del piso, no piden una factura. Se quitan antes de buscar palabras de factura.
const SUMINISTROS = /(?<![\p{L}])(?:facturas?\s+(?:de|del)\s+(?:la\s+|el\s+|los\s+|las\s+)?(?:luz|agua|gas|electricidad|suministros?|internet|wifi|calefacci[oó]n)|(?:electricity|water|gas|utility|utilities|power|energy)\s+(?:bills?|invoices?)|(?:bills?|invoices?)\s+for\s+(?:the\s+)?(?:electricity|water|gas|utilities))(?![\p{L}])/giu

export function esPeticionFactura(texto: string | null | undefined): boolean {
  const t = (texto || '').replace(SUMINISTROS, ' ').trim()
  if (!t) return false
  if (FACTURA.test(t)) return true
  return FISCAL.test(t) && EMPRESA.test(t)
}

// DATOS FISCALES sueltos (el huésped manda en un mensaje APARTE solo sus datos): NIF/NIE/CIF españoles
// y VAT intracomunitario. Sin `\b` por si pegan «NIF:B2389…». Mayús/minús indiferente.
const NIF_ES = /(?<![\p{L}\d])(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])(?![\p{L}\d])/iu
// Prefijo de país UE + 8-12 alfanuméricos, con al menos 6 dígitos (evita palabras).
const VAT_UE = /(?<![\p{L}\d])(?:AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|GB|XI)(?=[0-9A-Z]{8,12}(?![\p{L}\d]))(?=(?:[0-9A-Z]*\d){6})[0-9A-Z]{8,12}/iu

export function contieneIdFiscal(texto: string | null | undefined): boolean {
  const t = texto || ''
  return NIF_ES.test(t) || VAT_UE.test(t)
}

// ¿Es un trámite fiscal (no un hueco de la guía)? Petición de factura, o un NIF/CIF/VAT suelto, o —si
// el hilo YA era de factura— cualquier dato personal (email/teléfono/IBAN) o fiscal en este mensaje.
// Un email suelto SIN hilo de factura NO basta («escríbeme a x@y.com» no es un trámite fiscal).
export function esTramiteFiscal(texto: string | null | undefined, previos?: Array<string | null | undefined>): boolean {
  if (esPeticionFactura(texto) || contieneIdFiscal(texto)) return true
  const hiloFactura = (previos || []).some(p => esPeticionFactura(p))
  return hiloFactura && contieneDatoPersonal(texto || '')
}

// Motivo del aviso a Alberto. 🚨 NO debe casar con /no cubre|no se pudo verificar|no est[áa] en la gu[ií]a/:
// `tipoHueco` lo leería como hueco de la guía y se guardaría lo que responda como hecho del piso.
export const MOTIVO_FACTURA =
  'petición de factura: es un trámite de esta reserva (no un hueco de la guía), emítela tú con los datos fiscales del huésped'

// Regla de voz: quien responde ES el dueño/gestor. Va en el prompt del redactor.
export const REGLA_GESTIONES =
  'Si el huésped pide una cancelación, un cambio, un reembolso o cualquier gestión, acúsale recibo con empatía y dile en PRIMERA PERSONA que lo gestionas tú y que se lo confirmas («lo gestiono yo y te confirmo») — sin darla por hecha ni prometer plazos.'

export const REGLA_VOZ =
  'VOZ: escribes COMO el propio dueño/gestor del alojamiento, en primera persona. NUNCA hables del dueño ni del gestor como un tercero: nada de «el anfitrión», «el propietario», «la propiedad lo gestionará» ni «se lo traslado» / «lo paso a…». Di «lo gestiono yo», «te lo confirmo yo», «te lo envío».'

export const REGLA_FACTURA =
  'FACTURA: si el huésped pide factura (o la pide a nombre de una empresa), confirma que SÍ se la emitimos y pídele SOLO los datos que aún falten de esta lista: razón social (o nombre completo si es particular), NIF/CIF/VAT, dirección fiscal completa (calle y número, código postal, ciudad y país) y email de envío. NO le pidas lo que ya haya dado en la conversación. Cuando tengamos todos sus datos, la factura le llega sola por correo el día de salida: NO le prometas esa fecha mientras falte algún dato (dile que se la enviamos en cuanto los tengamos). No inventes importes ni números de factura.'

// Hay formulario (27/10/2026): el orquestador ha creado la solicitud y AÑADE el enlace al final del borrador. El modelo
// no escribe URLs (las inventaría): solo anuncia que va el enlace. Prevalece sobre «pídele los datos» de REGLA_FACTURA.
export const REGLA_FACTURA_ENLACE =
  'Para la factura HAY un formulario seguro: EN LUGAR de pedirle los datos uno a uno, dile que al final del mensaje le dejo un enlace donde rellenar sus datos de facturación, y que en cuanto lo haga se la preparo. NO escribas tú ningún enlace ni URL (se añade solo).'

// ── Estado de la solicitud tras leer el chat (29/10/2026) ──────────────────────────────────────────────────────────
// Los datos que el huésped da en el chat rellenan la solicitud (`lib/sivra/facturas/chat.ts`) y el cron de salida
// (`/api/cron/sivra-facturas-salida`) la emite y envía sola el día de salida. El texto al huésped no puede prometer más
// de lo que el sistema va a hacer: «la recibirás el día de salida» SOLO si la solicitud quedó completa y válida.

/** Mensajes del huésped que cuentan para la factura: desde su PRIMERA petición de factura (incluida). Lo anterior
 *  (p. ej. el DNI para el registro de viajeros) no se mezcla con los datos de facturación. Sin petición → []. */
export function textosDesdePeticion(textosHuesped: ReadonlyArray<string | null | undefined>): string[] {
  const t = textosHuesped.map((x) => (x || '').trim())
  const i = t.findIndex((x) => esPeticionFactura(x))
  return i < 0 ? [] : t.slice(i).filter(Boolean)
}

export type EstadoFacturaChat =
  | { completa: true; email: string; cc: string[]; yaSalio: boolean }
  | { completa: false; faltan: string[] }

/** Bloque del prompt del redactor según cómo quedó la solicitud. */
export function reglaFacturaEstado(e: EstadoFacturaChat, conEnlace: boolean): string {
  if (e.completa) {
    const copia = e.cc.length ? ` (con copia a ${e.cc.join(', ')})` : ''
    const cuando = e.yaSalio ? 'en las próximas 24 horas' : 'el día de su salida'
    return `FACTURA-ESTADO: ya tenemos TODOS sus datos de facturación: NO le pidas ninguno ni le pongas enlaces. Confírmale que recibirá la factura por correo en ${e.email}${copia} ${cuando}.`
  }
  const faltan = e.faltan.length ? e.faltan.join('; ') : 'los datos de facturación'
  return `FACTURA-ESTADO: de sus datos de facturación aún FALTAN: ${faltan}. Pídele SOLO eso${conEnlace ? ' (o que lo rellene en el enlace del final)' : ''} y NO le prometas fecha de envío hasta tenerlos.`
}
