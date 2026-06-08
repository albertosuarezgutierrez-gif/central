import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic   = 'force-dynamic'
export const maxDuration = 60

const SMOOBU_KEY  = process.env.SMOOBU_API_KEY  || ''
const GMAIL_USER  = process.env.GMAIL_USER       || ''
const GMAIL_PASS  = process.env.GMAIL_APP_PASSWORD || ''
const OWNER_EMAIL = GMAIL_USER

// ── Mailer (stub — nodemailer pending setup) ──────────────────────────────────
async function sendEmail(to: string, subject: string, text: string) {
  console.log('[email pending]', to, subject, text.slice(0, 80))
  // TODO: configure nodemailer transporter and uncomment:
  // await transporter.sendMail({ from: `"House Sevillana" <${GMAIL_USER}>`, to, subject, text, replyTo: GMAIL_USER })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function strip(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ').trim()
}

function isAutoHost(subject: string): boolean {
  return /Booking Confirmation|Check-in|RECORDATORIO|Bienvenid|LLAVES|Mejorar|Ayuda|WHERE TO|Help us|Confirmaci|survey|📈|💃|⚠|🔑/i.test(subject)
}

type Classification = 'trivial' | 'info' | 'importante'

function classifyMessage(text: string, subject = ''): Classification {
  const t = (text + ' ' + subject).toLowerCase().trim()
  if (/ya (hemos|he|nos hemos) (salido|ido|marchado|dejado)|acabamos de dejar|disponible para (su )?limpieza|gracias por (su|tu|la) estancia|ha sido un placer|dejar(é|e) (una )?reseña|checked out|we.ve (left|checked out)|we have left|just left|all (done|good),? thanks|muchas gracias por todo|fue un placer|hasta la próxima|buen viaje|safe travels|thank you for everything/i.test(t)) return 'trivial'
  if (/no (funciona|anda|hay|tenemos|abre|cierra)|problem[ae]|issue|broken|avería|queja|complaint|emergencia|urgente|ayuda urgente|accidente|se ha roto|está roto|falta(n)?|no (encontramos|encontré|puedo entrar)|imposible|bloqueado|inundación|fuga|humo|incendio/i.test(t)) return 'importante'
  if (/late.?check.?out|early.?check.?in|salida (tardía|tarde|después)|entrada (temprana|antes)|cambiar (fecha|hora|reserva)|modificar reserva|cancelar|ampliar|extender (la )?estancia|noche extra|one more night/i.test(t)) return 'importante'
  if (/wifi|wi-fi|internet|contraseña|password|clave|llave|key|llaves|code|código|lockbox|check.?in|llegada|arrival|check.?out|salida|parking|garaje|aparcar|normas|rules|toallas|towels|supermercado|cómo (llegar|entrar|acceder)|dónde está|where is|how (do|can) (i|we)/i.test(t)) return 'info'
  if (/^(hola|hello|hi|hey|bonjour|ciao|guten tag|buenos días|buenas tardes|buenas noches|good morning|good evening|good afternoon)[!.,\s]*$/.test(t)) return 'info'
  return 'importante'
}

// ── KB lookup ─────────────────────────────────────────────────────────────────
async function lookupKB(text: string, lang: string): Promise<string | null> {
  const t = text.toLowerCase()
  let category: string | null = null
  if (/wifi|wi-fi|internet|contraseña|password/.test(t))       category = 'wifi'
  else if (/llave|key|llaves|code|lockbox|acceso|entrar/.test(t)) category = 'acceso'
  else if (/check.?in|llegada|arrival|entrada/.test(t))          category = 'checkin'
  else if (/check.?out|salida|departure/.test(t))                category = 'checkout'
  else if (/parking|garaje|aparcar|coche/.test(t))               category = 'parking'
  else if (/normas|rules|ruido|silencio/.test(t))                category = 'normas'
  else if (/toallas|towels|sábanas|sabanas/.test(t))             category = 'toallas'
  else if (/supermercado|supermarket|compra|tienda/.test(t))     category = 'supermercado'
  if (!category) return null

  const rows = await prisma.$queryRaw<{ response: string; language: string }[]>(Prisma.sql`
    SELECT response, language FROM knowledge_base
    WHERE category = ${category}
    ORDER BY
      CASE language
        WHEN ${lang.toUpperCase()} THEN 0
        WHEN 'ES' THEN 1
        ELSE 2
      END
    LIMIT 1
  `)
  return rows[0]?.response || null
}

// ── Already replied tracking ──────────────────────────────────────────────────
async function isProcessed(msgId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT id FROM update_logs WHERE message LIKE ${'auto-reply:' + msgId + '%'} LIMIT 1
  `)
  return rows.length > 0
}

async function markProcessed(msgId: string, type: string) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO update_logs (message, type, "createdAt")
    VALUES (${`auto-reply:${msgId}:${type}`}, 'auto_reply', NOW())
  `)
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export async function GET() {
  if (!SMOOBU_KEY) {
    return NextResponse.json({ error: 'Missing SMOOBU_API_KEY' }, { status: 500 })
  }

  const results = { trivial: 0, auto_replied: 0, alerted: 0, errors: 0, skipped: 0 }

  try {
    const res = await fetch('https://login.smoobu.com/api/threads?pageSize=50&page=1', {
      headers: { 'Api-Key': SMOOBU_KEY }, cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Smoobu threads ${res.status}`)
    const data = await res.json()
    const threads: any[] = data.threads || []

    for (const thread of threads) {
      try {
        const msg     = thread.latest_message || {}
        const subject = msg.subject || ''
        const raw     = msg.text_content || msg.message || ''
        const text    = strip(raw)
        const msgId   = String(msg.id || '')
        const bookingId = String(thread.booking?.id || '')

        if (!msgId || !bookingId) continue
        if (await isProcessed(msgId)) { results.skipped++; continue }
        if (isAutoHost(subject)) {
          await markProcessed(msgId, 'trivial_auto')
          results.trivial++
          continue
        }
        if (msg.type !== 1) {
          await markProcessed(msgId, 'skip_host')
          results.skipped++
          continue
        }

        const classification = classifyMessage(text, subject)
        const lang = (() => {
          if (/[áéíóúüñ¿¡]|\bhola\b|\bgracias\b/i.test(text)) return 'ES'
          if (/\b(bonjour|merci|est-ce|vous)\b/i.test(text)) return 'FR'
          if (/\b(guten|danke|bitte|ich)\b/i.test(text)) return 'DE'
          if (/\b(ciao|grazie|buongiorno)\b/i.test(text)) return 'IT'
          return 'EN'
        })()

        const resv = await fetch(`https://login.smoobu.com/api/reservations/${bookingId}`, {
          headers: { 'Api-Key': SMOOBU_KEY }, cache: 'no-store',
        })
        if (!resv.ok) { results.errors++; continue }
        const reservation = await resv.json()
        const guestEmail  = reservation.email || ''
        const guestName   = reservation['guest-name'] || 'Huésped'
        const reference   = reservation.reference_id || bookingId
        const propName    = thread.apartment?.name || 'Apartamento'

        if (classification === 'trivial') {
          await markProcessed(msgId, 'trivial')
          results.trivial++
          continue
        }

        if (classification === 'info') {
          const kbAnswer = await lookupKB(text, lang)
          if (kbAnswer && guestEmail) {
            const emailSubject = `Re: Reserva ${reference} - ${propName}`
            const greeting = lang === 'ES' ? `Hola ${guestName},\n\n` :
                             lang === 'FR' ? `Bonjour ${guestName},\n\n` :
                             lang === 'DE' ? `Hallo ${guestName},\n\n` :
                             lang === 'IT' ? `Ciao ${guestName},\n\n` :
                                            `Hi ${guestName},\n\n`
            const signature = lang === 'ES' ? '\n\nSaludos,\nHouse Sevillana' :
                              lang === 'FR' ? '\n\nCordialement,\nHouse Sevillana' :
                                             '\n\nBest regards,\nHouse Sevillana'
            await sendEmail(guestEmail, emailSubject, greeting + kbAnswer + signature)
            await markProcessed(msgId, 'auto_replied_kb')
            results.auto_replied++
            continue
          }
        }

        const alertSubject = classification === 'importante'
          ? `🔴 Mensaje urgente — ${guestName} · ${propName}`
          : `💬 Mensaje sin respuesta KB — ${guestName} · ${propName}`

        const alertBody = [
          `Huésped: ${guestName}`,
          `Propiedad: ${propName}`,
          `Reserva: ${reference}`,
          `Clasificación: ${classification}`,
          ``,
          `─── Mensaje ───`,
          subject ? `Asunto: ${subject}` : '',
          text,
          ``,
          `─── Responder ───`,
          `Para: ${guestEmail}`,
          `Asunto: Re: Reserva ${reference} - ${propName}`,
          ``,
          `Ver en intranet: https://housesevillana.vercel.app/mensajes`,
        ].filter(Boolean).join('\n')

        if (OWNER_EMAIL) await sendEmail(OWNER_EMAIL, alertSubject, alertBody)
        await markProcessed(msgId, `alerted_${classification}`)
        results.alerted++

      } catch (e: any) {
        console.error('Thread error:', e.message)
        results.errors++
      }
    }

    return NextResponse.json({ ok: true, results, processed: threads.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results }, { status: 500 })
  }
}
