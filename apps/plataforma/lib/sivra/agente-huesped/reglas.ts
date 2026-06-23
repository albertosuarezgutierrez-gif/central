// lib/sivra/agente-huesped/reglas.ts — reglas deterministas puras (extraídas de reply/route.ts).
// Sin imports externos para ser testeables con `node --test` sin dependencias.

export const PARKING_SPOTS: Record<string, number> = {
  prop_house_sevillana: 1,
  prop_busto_reform: 0,
  prop_duplex_center: 0,
  prop_luxury_busto: 1,
  all: 0,
}

export function extractEarlyTime(text: string): { type: 'early_checkout' | 'early_checkin_request', time: string } | null {
  const t = text.toLowerCase()
  const checkoutPatterns = [
    /(?:salgo|salimos|saldremos|we.?(?:check|leave)|checkout|check.?out|leaving|departing|leaving|we.?leave).*?(?:a las?|at|@)\s*(\d{1,2})(?::(\d{2}))?/i,
    /(?:a las?|at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(?:salgo|salimos|saldremos|we.?leave|check.?out)/i,
  ]
  const checkinPatterns = [
    /(?:llego|llegamos|arrivo|arrive|arriving|check.?in|coming).*?(?:a las?|at|@)\s*(\d{1,2})(?::(\d{2}))?/i,
    /(?:a las?|at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(?:llego|llegamos|arrive|check.?in)/i,
    /(?:puedo|podemos|can i|can we).*?(?:llegar|entrar|check.?in|arrive).*?(?:a las?|at|@)\s*(\d{1,2})(?::(\d{2}))?/i,
  ]
  for (const p of checkoutPatterns) {
    const m = t.match(p)
    if (m) { const h = parseInt(m[1]); const min = m[2] ? m[2].padStart(2,'0') : '00'; if (h >= 6 && h < 12) return { type: 'early_checkout', time: `${h.toString().padStart(2,'0')}:${min}` } }
  }
  for (const p of checkinPatterns) {
    const m = t.match(p)
    if (m) { const h = parseInt(m[1]); const min = m[2] ? m[2].padStart(2,'0') : '00'; if (h >= 8 && h < 15) return { type: 'early_checkin_request', time: `${h.toString().padStart(2,'0')}:${min}` } }
  }
  return null
}

export function detectCategory(text: string): string | null {
  const t = text.toLowerCase()
  if (/wifi|wi-fi|wlan|internet|contraseña|password|clave/.test(t)) return 'wifi'
  if (/llave|key|clé|schlüssel|chiave|lockbox|código|code|caja|puerta|abrir|entrar|acceso/.test(t)) return 'acceso'
  if (/check.?in|llegada|arrival|hora de entrada|from what time|a qué hora llegar/.test(t)) return 'checkin'
  if (/check.?out|salida|departure|hora de salida|dejar/.test(t)) return 'checkout'
  if (/parking|aparcar|aparcamiento|coche|voiture|auto|car|garaje|garage|plaza/.test(t)) return 'parking'
  if (/normas|rules|règles|regeln|regole|fumar|smoking|fiesta|party|silencio/.test(t)) return 'normas'
  if (/emergencia|urgencia|problema|avería|contacto|teléfono|phone/.test(t)) return 'contacto'
  if (/toallas|towels|sábanas|linen|ropa de cama/.test(t)) return 'faq'
  if (/supermercado|supermarket|tienda|shop|compra|comida|mercado/.test(t)) return 'faq'
  return null
}

export function detectLang(text: string): 'es' | 'en' | 'fr' | 'de' | 'it' {
  if (/[áéíóúüñ¿¡]|\bhola\b|\bgracias\b|\bcómo\b|\bdónde\b/i.test(text)) return 'es'
  if (/\b(bonjour|merci|est-ce|vous|nous|comment|quand|où)\b/i.test(text)) return 'fr'
  if (/\b(guten|danke|bitte|ich|wir|haben|sind|wie|wann|wo)\b/i.test(text)) return 'de'
  if (/\b(ciao|grazie|prego|buongiorno|come|quando|dove)\b/i.test(text)) return 'it'
  return 'en'
}
