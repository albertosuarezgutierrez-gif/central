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
