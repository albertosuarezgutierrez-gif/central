// lib/correo/keywords.ts — Capa DETERMINISTA del triaje (0 tokens), previa a la IA.
//
// Mismo patrón que /finanzas (lib/subcategoria-keywords.ts): los remitentes/asuntos INEQUÍVOCOS
// se clasifican por regla, sin depender de que la pasarela de IA responda. Rescata los correos que
// antes caían a 'dudoso' cuando la IA se saturaba (p.ej. recibos de Stripe, mensajes de Booking,
// pólizas de Occident) — visto en producción: ~27% de los correos acababan en 'dudoso' con
// confianza 0, muchos de ellos contabilidad/huéspedes/correduría claros o puro marketing.
//
// PRINCIPIO: solo reglas de ALTA PRECISIÓN. Ante la duda, devolver null y dejar decidir a la IA.
// Puro (sin `@/` ni prisma) → testeable con `node --test` (keywords.test.ts).

export interface KeywordMatch {
  categoria: string
  motivo: string
}

const norm = (s: string) => (s || '').toLowerCase().trim()
const dominioDe = (from: string) => {
  const at = from.indexOf('@')
  return at >= 0 ? from.slice(at + 1) : ''
}
const enDominio = (dom: string, base: string) => dom === base || dom.endsWith('.' + base)
/** Sin acentos: las compañías escriben «anulacion» y «anulación» el mismo día. */
const sinTildes = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// ── 🚨 Recibos de aseguradora: la regla que va PRIMERA ──────────────────────
// `mediadores@occidentinforma.com` manda el mismo día un siniestro, un comunicado comercial y
// «Recibos devueltos de banco». Por dominio los tres caen en `correduria` (digest de las 22:30);
// el tercero es el único que caduca —art. 15 LCS: al mes se suspende la cobertura— y encima es
// la ÚNICA fuente para las compañías cuyos recibos CIMA no actualiza (medido 03/09/2026). Por eso
// se mira ANTES que el dominio y con dos condiciones a la vez: remitente de aseguradora Y asunto
// de recibo. Un «Recibo de su pago a IONOS» de PayPal no pasa la primera; un «Nueva oferta de
// Salud» de Mapfre no pasa la segunda.
const ASEGURADORAS = [
  'occidentinforma.com', 'comunicacionesoccident.com', 'newsoccident.com', 'occident.com',
  'mapfre.com', 'allianz.es', 'reale.es', 'generali.com', 'tugenerali.es', 'fidelidade.pt',
  'zurich.es', 'axa.es', 'catalanaoccidente.com', 'libertyseguros.es', 'plusultra.es', 'caser.es',
]
// Solo lo que habla de un recibo que no ha entrado. `anulad|anulacion` cubre «pólizas anuladas
// por impago» y «recibos próximos a la anulación», que es el aviso que llega ANTES de que caiga
// la cobertura y por tanto el más útil de todos.
const ASUNTO_RECIBO = /\brecibos?\b|\bimpago\b|devuelt|anulacion|\banulad|\bdomiciliacion\b/i

function esReciboAseguradora(from: string, subject: string): boolean {
  const dom = dominioDe(from)
  if (!dom || !ASEGURADORAS.some(d => enDominio(dom, d))) return false
  return ASUNTO_RECIBO.test(sinTildes(subject || ''))
}

// Dominio del remitente → categoría (procesadores de pago, plataformas de reserva, aseguradoras,
// emisores de marketing masivo conocidos). El match cubre subdominios (info.homeexchange.com).
const DOMINIOS: { categoria: string; dominios: string[] }[] = [
  { categoria: 'contabilidad', dominios: ['stripe.com', 'paypal.es', 'paypal.com', 'interactivebrokers.com'] },
  { categoria: 'huespedes', dominios: ['guest.booking.com', 'smoobu.com', 'homeexchange.com'] },
  { categoria: 'correduria', dominios: ['occidentinforma.com'] },
  // Marketing masivo de alta precisión (archivar es seguro): boletines/promos conocidos.
  { categoria: 'ruido', dominios: ['endesaclientes.com', 'club.cortefiel.com', 'sevillafc.es', 'pedrobuerbaum.com'] },
]

// Prefijo del remitente (parte local) → categoría, para dominios compartidos (allianz.es sirve
// tanto marketing como a mediadores; solo 'mediadores@' es correduría).
const REMITENTE: { categoria: string; empieza: string[] }[] = [
  { categoria: 'correduria', empieza: ['mediadores@', 'comunicacion.mediadores@'] },
]

// Marcadores INEQUÍVOCOS en el asunto (frases transaccionales), como red de seguridad si el dominio
// no está en la lista. Conservador: nada ambiguo.
const ASUNTO: { categoria: string; re: RegExp }[] = [
  { categoria: 'contabilidad', re: /\b(your\s+)?(receipt|invoice|credit\s+note|refund)\b|recibo de (su )?pago|justificante de pago/i },
]

/**
 * Clasifica un correo por reglas deterministas de alta precisión. Devuelve null si ninguna aplica
 * (entonces decide la IA). NUNCA usa 'seguridad-sospechosa' ni 'personal-importante': esos exigen
 * el juicio de la IA y no se infieren por dominio.
 */
export function clasificarPorKeyword(from: string, subject: string): KeywordMatch | null {
  const f = norm(from)
  const dom = dominioDe(f)
  // Antes que el dominio: si no, `occidentinforma.com` se lo llevaría a `correduria` y el aviso
  // llegaría en el digest de la noche.
  if (esReciboAseguradora(f, subject)) {
    return { categoria: 'correduria-recibo', motivo: `recibo de aseguradora (${dom})` }
  }
  if (dom) {
    for (const { categoria, dominios } of DOMINIOS) {
      if (dominios.some(d => enDominio(dom, d))) return { categoria, motivo: `dominio ${dom}` }
    }
  }
  for (const { categoria, empieza } of REMITENTE) {
    if (empieza.some(p => f.startsWith(p))) return { categoria, motivo: `remitente ${f}` }
  }
  const s = subject || ''
  for (const { categoria, re } of ASUNTO) {
    if (re.test(s)) return { categoria, motivo: 'asunto transaccional' }
  }
  return null
}
