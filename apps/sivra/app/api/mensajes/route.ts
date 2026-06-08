import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const API_KEY = process.env.SMOOBU_API_KEY || ''

const PROP_NAME: Record<number, string> = {
  352007: 'House Sevillana',
  352418: 'Busto Reform',
  352928: 'Duplex Center',
  352943: 'Luxury Busto',
}
const PROP_ID: Record<number, string> = {
  352007: 'prop_house_sevillana',
  352418: 'prop_busto_reform',
  352928: 'prop_duplex_center',
  352943: 'prop_luxury_busto',
}

function strip(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ').trim()
}

function detectLang(text: string): string {
  if (/[áéíóúüñ¿¡]|hola|gracias/i.test(text)) return 'ES'
  if (/(bonjour|merci|est-ce|vous)/i.test(text)) return 'FR'
  if (/(guten|danke|bitte|ich)/i.test(text)) return 'DE'
  if (/(ciao|grazie|buongiorno)/i.test(text)) return 'IT'
  return 'EN'
}

function isAutoHost(subject: string): boolean {
  return /Booking Confirmation|Check-in|RECORDATORIO|Bienvenid|LLAVES|Mejorar|Ayuda|WHERE TO|Help us|Confirmaci|survey|📈|💃|⚠|🔑/i.test(subject)
}

type Classification = 'trivial' | 'info' | 'importante'

function classifyMessage(text: string, subject = ''): Classification {
  const t = (text + ' ' + subject).toLowerCase().trim()

  if (
    /ya (hemos|he|nos hemos) (salido|ido|marchado|dejado)|acabamos de dejar|disponible para (su )?limpieza|gracias por (su|tu|la) estancia|ha sido un placer|dejar(é|e) (una )?reseña|checked out|we.ve (left|checked out)|we have left|just left|all (done|good),? thanks|muchas gracias por todo|fue un placer|hasta la próxima|nos vemos|buen viaje|safe travels|thank you for everything/i
    .test(t)
  ) return 'trivial'

  if (
    /no (funciona|anda|hay|tenemos|abre|cierra)|problem[ae]|issue|broken|avería|averia|queja|complaint|emergencia|urgente|ayuda urgente|accidente|se ha roto|está roto|falta(n)?|no (encontramos|encontré|puedo entrar)|imposible|bloqueado|atascado|inundación|fuga|humo|incendio/i
    .test(t)
  ) return 'importante'

  if (
    /late.?check.?out|early.?check.?in|salida (tardía|tarde|después)|entrada (temprana|antes)|llegar antes de|salir después de las|cambiar (fecha|hora|reserva)|modificar reserva|cancelar|ampliar|extender (la )?estancia|noche extra|one more night/i
    .test(t)
  ) return 'importante'

  if (
    /wifi|wi-fi|internet|contraseña|password|clave|llave|key|llaves|code|código|caja (fuerte|keys)|lockbox|check.?in|llegada|arrival|check.?out|salida|departure|parking|garaje|plaza|aparcar|coche|normas|rules|toallas|towels|sábanas|sabanas|supermercado|supermarket|tienda|cómo (llegar|entrar|acceder)|dónde está|where is|how (do|can) (i|we)/i
    .test(t)
  ) return 'info'

  if (/^(hola|hello|hi|hey|bonjour|ciao|guten tag|buenos días|buenas tardes|buenas noches|good morning|good evening|good afternoon)[!.,\s]*$/.test(t)) {
    return 'info'
  }

  return 'importante'
}

export async function GET() {
  try {
    if (!API_KEY) throw new Error('SMOOBU_API_KEY not set')

    const res = await fetch('https://login.smoobu.com/api/threads?pageSize=100&page=1', {
      headers: { 'Api-Key': API_KEY }, cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Smoobu threads ${res.status}`)
    const data = await res.json()
    const rawThreads: any[] = data.threads || []

    const bookingIds = rawThreads.map((t: any) => String(t.booking?.id)).filter(Boolean)

    // ── Cargar incomes + status overrides en paralelo ──
    let dbRows: any[] = []
    let statusRows: any[] = []

    if (bookingIds.length > 0) {
      ;[dbRows, statusRows] = await Promise.all([
        prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT "reservationId", "checkIn", "checkOut", portal
          FROM incomes
          WHERE "reservationId" = ANY(${bookingIds}::text[])
        `),
        prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT booking_id, status
          FROM mensajes_status
          WHERE booking_id = ANY(${bookingIds}::text[])
        `),
      ])
    }

    const dbMap     = new Map(dbRows.map(r => [r.reservationId, r]))
    const statusMap = new Map(statusRows.map(r => [r.booking_id, r.status]))

    const threads = rawThreads.map((t: any) => {
      const msg = t.latest_message || {}
      const raw = msg.text_content || msg.message || ''
      const subject = msg.subject || ''
      const text = strip(raw)
      const db = dbMap.get(String(t.booking?.id))
      const classification = isAutoHost(subject) ? 'trivial' as Classification : classifyMessage(text, subject)

      // Status derivado de Smoobu (lógica original)
      let derivedStatus: 'pendiente' | 'respondido' | 'urgente'
      if (isAutoHost(subject) || classification === 'trivial') {
        derivedStatus = 'respondido'
      } else if (classification === 'importante') {
        derivedStatus = 'urgente'
      } else {
        derivedStatus = 'pendiente'
      }

      // ── Override: si el anfitrión cambió el estado manualmente, respetarlo ──
      const overrideStatus = statusMap.get(String(t.booking?.id))
      const status = (overrideStatus || derivedStatus) as 'pendiente' | 'respondido' | 'urgente'

      return {
        id: String(t.booking?.id),
        smoobuBookingId: t.booking?.id,
        smoobuReservationId: String(t.booking?.id),
        guestName: t.booking?.guest_name || 'Huésped',
        property: PROP_NAME[t.apartment?.id] || t.apartment?.name || 'Desconocido',
        propertyId: PROP_ID[t.apartment?.id] || 'all',
        checkIn:  db?.checkIn  ? new Date(db.checkIn).toISOString().slice(0,10)  : '',
        checkOut: db?.checkOut ? new Date(db.checkOut).toISOString().slice(0,10) : '',
        portal: db?.portal || 'OTRO',
        status,
        classification,
        lastMsg: (!isAutoHost(subject) && subject) ? subject : (text.slice(0, 150) || '—'),
        lastTs: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
        messages: [],
        lang: detectLang(raw),
      }
    })

    const badge = threads.filter(t => t.status === 'urgente' || t.status === 'pendiente').length

    return NextResponse.json({
      threads,
      total: data.total_threads || 0,
      unread: data.unread_messages || 0,
      badge,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
