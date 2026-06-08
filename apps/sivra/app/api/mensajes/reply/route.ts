import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { aiComplete } from "@/lib/ai-client"

const SMOOBU_PROP: Record<string, string> = {
  '352007': 'prop_house_sevillana',
  '352418': 'prop_busto_reform',
  '352928': 'prop_duplex_center',
  '352943': 'prop_luxury_busto',
}

const PARKING_SPOTS: Record<string, number> = {
  prop_house_sevillana: 1,
  prop_busto_reform: 0,
  prop_duplex_center: 0,
  prop_luxury_busto: 1,
  all: 0,
}

function extractEarlyTime(text: string): { type: 'early_checkout' | 'early_checkin_request', time: string } | null {
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

async function notifyCleaningSession(propertyId: string, checkoutDate: string, type: string, time: string) {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL || 'https://roi-intranet.vercel.app'}/api/limpiadoras/early-checkin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId, date: checkoutDate, type, time })
    })
    return res.ok
  } catch { return false }
}

function detectCategory(text: string): string | null {
  const t = text.toLowerCase()
  if (/wifi|wi-fi|wlan|internet|contraseña|password|clave/.test(t)) return "wifi"
  if (/llave|key|clé|schlüssel|chiave|lockbox|código|code|caja|puerta|abrir|entrar|acceso/.test(t)) return "acceso"
  if (/check.?in|llegada|arrival|hora de entrada|from what time|a qué hora llegar/.test(t)) return "checkin"
  if (/check.?out|salida|departure|hora de salida|dejar/.test(t)) return "checkout"
  if (/parking|aparcar|aparcamiento|coche|voiture|auto|car|garaje|garage|plaza/.test(t)) return "parking"
  if (/normas|rules|règles|regeln|regole|fumar|smoking|fiesta|party|silencio/.test(t)) return "normas"
  if (/emergencia|urgencia|problema|avería|contacto|teléfono|phone/.test(t)) return "contacto"
  if (/toallas|towels|sábanas|linen|ropa de cama/.test(t)) return "faq"
  if (/supermercado|supermarket|tienda|shop|compra|comida|mercado/.test(t)) return "faq"
  return null
}

function detectLang(text: string): "es" | "en" | "fr" | "de" | "it" {
  if (/[áéíóúüñ¿¡]|\bhola\b|\bgracias\b|\bcómo\b|\bdónde\b/i.test(text)) return "es"
  if (/\b(bonjour|merci|est-ce|vous|nous|comment|quand|où)\b/i.test(text)) return "fr"
  if (/\b(guten|danke|bitte|ich|wir|haben|sind|wie|wann|wo)\b/i.test(text)) return "de"
  if (/\b(ciao|grazie|prego|buongiorno|come|quando|dove)\b/i.test(text)) return "it"
  return "en"
}

async function getSmoobuGuestUrl(reservationId: string | null): Promise<string | null> {
  if (!reservationId) return null
  try {
    const res = await fetch(`https://login.smoobu.com/api/reservations/${reservationId}`, {
      headers: { "Api-Key": process.env.SMOOBU_API_KEY || "", "Cache-Control": "no-cache" }
    })
    if (!res.ok) return null
    const d = await res.json()
    return d["guest-app-url"] || null
  } catch { return null }
}

async function getNextCheckin(propertyId: string, fromDate: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "checkIn", "guestName" FROM incomes
      WHERE "propertyId" = ${propertyId} AND "checkIn" > ${fromDate}::date
      ORDER BY "checkIn" ASC LIMIT 1
    `)
    if (!rows.length) return null
    return new Date(rows[0].checkIn).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return null }
}

async function getPrevCheckout(propertyId: string, toDate: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "checkOut" FROM incomes
      WHERE "propertyId" = ${propertyId} AND "checkOut" < ${toDate}::date
      ORDER BY "checkOut" DESC LIMIT 1
    `)
    if (!rows.length) return null
    return new Date(rows[0].checkOut).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return null }
}

async function lookupKB(category: string, propertyId: string, lang: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, answer_es, answer_en, answer_fr, answer_de, answer_it
      FROM knowledge_base
      WHERE active = true AND category = ${category}
        AND (property_id = ${propertyId} OR property_id = 'all')
      ORDER BY (CASE WHEN property_id = ${propertyId} THEN 0 ELSE 1 END)
      LIMIT 1
    `)
    if (!rows.length) return null
    const r = rows[0]
    prisma.$executeRaw(Prisma.sql`UPDATE knowledge_base SET uses = uses + 1 WHERE id = ${r.id}`).catch(() => {})
    const ans = lang === "fr" ? r.answer_fr : lang === "de" ? r.answer_de : lang === "it" ? r.answer_it : lang === "en" ? r.answer_en : r.answer_es
    return ans || r.answer_es
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { guestName, property, propertyId, checkIn, checkOut, portal, messages, smoobuReservationId, hint } = body
  const lastMsg      = messages?.filter((m: any) => m.from === "guest").pop()?.text || ""
  const allGuestText = messages?.filter((m: any) => m.from === "guest").map((m: any) => m.text).join(' ') || lastMsg
  const lang         = detectLang(lastMsg)
  const category     = detectCategory(lastMsg)

  // ── DETECCIÓN SALIDA/LLEGADA ANTICIPADA ──
  const earlyTime = extractEarlyTime(lastMsg)
  if (earlyTime) {
    const cleaningDate = earlyTime.type === 'early_checkout' ? checkOut : checkIn
    notifyCleaningSession(propertyId || 'all', cleaningDate || '', earlyTime.type, earlyTime.time).catch(() => {})
  }

  // ── REGLA DE NEGOCIO: Late checkout ──
  if (!hint && /late.?check.?out|salida tarde|salida tardía|salir después|checkout tardío|after 11|después de las 11|tarde para (el )?checkout/i.test(allGuestText)) {
    const nextCheckin = await getNextCheckin(propertyId || 'all', checkOut || new Date().toISOString().slice(0,10))
    if (nextCheckin) {
      const reply = lang === 'es'
        ? `¡Hola ${guestName}! Lamentablemente no podemos ofrecer late check-out ya que tenemos nuevos huéspedes que llegan ese mismo día. El horario estándar de salida es a las 11:00h. ¡Muchas gracias por tu comprensión y esperamos verte de nuevo pronto!`
        : `Hi ${guestName}! Unfortunately we're unable to offer a late check-out as we have new guests arriving that same day. Standard check-out is at 11:00 AM. Thank you so much for understanding, and we hope to welcome you back soon!`
      return NextResponse.json({ reply, source: 'business_rule', category: 'late_checkout', context: `Próxima entrada: ${nextCheckin}` })
    } else {
      return NextResponse.json({ reply: null, source: 'business_rule', category: 'late_checkout', action: 'needs_decision', alert: `⚠️ ${guestName} pide late check-out en ${property}. No hay reserva ese día. Puedes concederlo.` })
    }
  }

  // ── REGLA DE NEGOCIO: Early checkin ──
  if (!hint && /early.?check.?in|entrada temprana|llegar antes|before 3|antes de las (15|3 pm)|early arrival/i.test(allGuestText)) {
    const prevCheckout = await getPrevCheckout(propertyId || 'all', checkIn || new Date().toISOString().slice(0,10))
    if (prevCheckout) {
      const reply = lang === 'es'
        ? `¡Hola ${guestName}! El check-in estándar es a las 15:00h. Tenemos huéspedes saliendo ese mismo día y necesitamos tiempo para dejar el apartamento impecable. En cuanto esté listo te avisamos. ¡Gracias por la comprensión!`
        : `Hi ${guestName}! Standard check-in is at 3:00 PM. We have guests checking out that same day and need time to prepare the apartment perfectly. We'll let you know as soon as it's ready. Thank you for your understanding!`
      return NextResponse.json({ reply, source: 'business_rule', category: 'early_checkin' })
    } else {
      return NextResponse.json({ reply: null, source: 'business_rule', category: 'early_checkin', action: 'needs_decision', alert: `⚠️ ${guestName} pide early check-in en ${property}. No hay reserva antes. Puedes concederlo.` })
    }
  }

  // ── REGLA DE NEGOCIO: Parking ──
  const parkingMatch     = allGuestText.match(/(\d+)\s*(plazas?|coches?|cars?|spots?|places?|vehículos?)/i)
  const parkingRequested = parkingMatch ? parseInt(parkingMatch[1]) : null
  const parkingAvailable = PARKING_SPOTS[propertyId || 'all'] ?? 0

  if (!hint && category === 'parking' && parkingRequested !== null && parkingRequested > parkingAvailable) {
    const nearbyParking = property.toLowerCase().includes('house') || property.toLowerCase().includes('sevillana')
      ? 'Parking Catedral (Calle Almirante Apodaca, 3 min a pie) o Parking San Francisco (5 min)'
      : 'Parking Plaza Nueva (4 min) o Parking Puerta de Jerez (5 min)'
    const reply = lang === 'es'
      ? `¡Hola ${guestName}! El apartamento dispone de ${parkingAvailable > 0 ? `${parkingAvailable} plaza${parkingAvailable > 1 ? 's' : ''} privada${parkingAvailable > 1 ? 's' : ''} incluida${parkingAvailable > 1 ? 's' : ''}` : 'plazas privadas'}. Para los vehículos adicionales, las opciones más cercanas son: ${nearbyParking}. ¡Estamos a tu disposición para cualquier otra consulta!`
      : `Hi ${guestName}! The apartment has ${parkingAvailable > 0 ? `${parkingAvailable} private parking spot${parkingAvailable > 1 ? 's' : ''} included` : 'no private parking'}. For additional vehicles, the nearest options are: ${nearbyParking}. Let us know if you need any other help!`
    return NextResponse.json({ reply, source: 'business_rule', category: 'parking' })
  }

  // ── 1. Knowledge base (RAG) — solo si no hay hint ──
  if (!hint && category && category !== "faq") {
    const kb = await lookupKB(category, propertyId || "all", lang)
    if (kb) return NextResponse.json({ reply: kb, source: "knowledge_base", category })
  }

  // ── 2. IA (NVIDIA NIM → Claude fallback) ──────────────────────────────────
  const guestUrl     = await getSmoobuGuestUrl(smoobuReservationId || null)
  const stayCategories = ["wifi","acceso","checkin","checkout","parking","normas","contacto"]
  const isStayQ      = category ? stayCategories.includes(category) : false
  const langName     = { es:"español", en:"English", fr:"français", de:"Deutsch", it:"italiano" }[lang] || "English"

  const hintInstruction = hint
    ? `\n\nINSTRUCCIÓN ESPECIAL DEL ANFITRIÓN: El anfitrión te da esta idea/respuesta base: "${hint}". Redacta un mensaje profesional, cálido y completo basándote en esta idea. Adapta el tono y el idioma al huésped.`
    : ""

  const system = `You are a professional, warm and concise customer service assistant for ${property}, a luxury short-term rental in Seville, Spain, managed by Alberto Suárez.\n\nGuest: ${guestName} | Property: ${property} | Check-in: ${checkIn} | Check-out: ${checkOut} | Platform: ${portal}\n${guestUrl ? `Guest guide URL: ${guestUrl}` : ""}\n\nKEY INFO: Check-in from 13:00, check-out by 11:00. WiFi: HouseSevillana / SevillanaGuest2026. Private parking: ${parkingAvailable} spot(s). Historic center near Cathedral. Full kitchen, A/C, washing machine. Emergency: +34 600 000 000.\n\nReply ONLY in ${langName}. Be warm and concise (3-4 sentences). Use guest's name.${guestUrl && isStayQ ? ` End your reply by sharing the guest's personal guide: ${guestUrl}` : ""}\nNever mention being an AI. If unsure of a detail, say you'll confirm shortly.${hintInstruction}`

  const history = (messages || []).slice(-6).map((m: any) => ({
    role: m.from === "guest" ? "user" as const : "assistant" as const, content: m.text
  }))

  const finalMessages = history.length
    ? history
    : [{ role: "user" as const, content: hint ? `${lastMsg}\n\n[Host hint: ${hint}]` : lastMsg }]

  try {
    const reply = await aiComplete(finalMessages, { system, maxTokens: 400 })
    return NextResponse.json({ reply, source: "ai", category, guestAppUrl: guestUrl || null, earlyTime: earlyTime || null, lang })
  } catch (err: any) {
    console.error("Mensajes reply error:", err)
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 })
  }
}
