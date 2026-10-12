// Petición de FACTURA del huésped (12/10/2026, dictado de Alberto).
//
// Caso real: un huésped pidió factura a nombre de su empresa y el agente contestó «se lo traslado al
// anfitrión». Mal por tres lados: (1) quien responde ES el dueño, no un intermediario; (2) para
// emitirla faltan datos fiscales; (3) el control de calidad la tomó por un hueco de la guía, y el
// aviso «lo que le respondas se guarda como hecho de este piso» habría guardado datos fiscales de UN
// huésped como hecho del piso, listos para ofrecérselos a OTRO (fuga de datos personales).
// Una factura es un trámite administrativo de ESTA reserva, no conocimiento del piso.

// Palabras de factura en es/en/it/pt/fr. `\b` no sirve con tildes, de ahí el lookaround.
const FACTURA = /(?<![\p{L}])(factura[s]?|facturar|facturaci[oó]n|invoice[s]?|invoicing|vat\s*(?:invoice|number|id)|fattura[e]?|fatturare|fatura[s]?|faturar|facture[s]?|facturer|receipt\s+for\s+(?:my|our)\s+company|tax\s+invoice)(?![\p{L}])/iu
// Pide los papeles a nombre de una empresa: NIF/CIF/VAT/partita IVA/NIPC/TVA junto a «empresa».
const FISCAL = /(?<![\p{L}])(n\.?i\.?f\.?|c\.?i\.?f\.?|vat(?:\s*(?:id|number|no\.?))?|partita\s+iva|nipc|n[uú]mero\s+fiscal|tva|raz[oó]n\s+social)(?![\p{L}])/iu
const EMPRESA = /(?<![\p{L}])(empresa|compa[nñ]\W?[ií]a|sociedad|aut[oó]nomo|company|business|firm|azienda|societ[aà]|ditta|empresa|entreprise|soci[eé]t[eé])(?![\p{L}])/iu

export function esPeticionFactura(texto: string | null | undefined): boolean {
  const t = (texto || '').trim()
  if (!t) return false
  if (FACTURA.test(t)) return true
  return FISCAL.test(t) && EMPRESA.test(t)
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
  'FACTURA: si el huésped pide factura (o la pide a nombre de una empresa), confirma que SÍ se la emitimos y pídele SOLO los datos que aún falten de esta lista: razón social (o nombre completo si es particular), NIF/CIF/VAT, dirección fiscal completa (calle y número, código postal, ciudad y país) y email de envío. NO le pidas lo que ya haya dado en la conversación. Dile que se la enviamos el día de salida. No inventes importes ni números de factura.'
