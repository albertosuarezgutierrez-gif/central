import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { enviarEmailNuevoLead } from '@/lib/email'

const ETIQUETAS_ORIGEN: Record<string, string> = {
  'landing':              '🌐 Landing principal',
  'landing-principal':    '🌐 Landing principal',
  'landing-hosteleria':   '🍺 Landing Hostelería',
  'landing-catering':     '🍱 Landing Catering',
  'landing-espacios':     '🏛️ Landing Espacios',
  'landing_espacios':     '🏛️ Landing Espacios',
  'eventos-catering':     '🎪 Eventos / Catering',
  'sloppy-joes':          '📋 Propuesta Sloppy Joe\'s',
  'ovejas-negras':        '📋 Propuesta Ovejas Negras',
  'catering-jj':          '📋 Propuesta Catering JJ',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nombre, restaurante, email, telefono, usuarios, fuente, origen } = body

    if (!nombre || !restaurante || !email) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    // origen tiene prioridad sobre fuente (campo legacy)
    const origenFinal = origen || fuente || 'landing'
    const origenLabel = ETIQUETAS_ORIGEN[origenFinal] ?? `📌 ${origenFinal}`

    // Guardar en BD
    const supabase = createServerClient()
    await supabase.from('leads_landing').insert({
      nombre,
      restaurante,
      email,
      telefono: telefono || null,
      usuarios: usuarios || null,
      fuente: origenFinal,
      estado: 'nuevo'
    })

    // Notificaciones en paralelo
    const fecha = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
    const tgMsg = [
      `🔥 NUEVO LEAD — ${origenLabel}`,
      ``,
      `👤 ${nombre}`,
      `🍽️ ${restaurante}`,
      `📧 ${email}`,
      `📱 ${telefono || '—'}`,
      `👥 Usuarios: ${usuarios || '—'}`,
      ``,
      `⏱️ ${fecha}`
    ].join('\n')

    const token   = process.env.TELEGRAM_BOT_TOKEN
    const chat_id = process.env.TELEGRAM_CHAT_ID

    const [tgResult, emailResult] = await Promise.allSettled([
      token && chat_id
        ? fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: tgMsg, parse_mode: 'HTML' }),
          }).then(r => r.json())
        : Promise.resolve({ ok: false, error: 'No TG config' }),
      enviarEmailNuevoLead({ nombre, restaurante, email, telefono, usuarios })
    ])

    if (tgResult.status === 'rejected') {
      console.error('[leads/landing] Telegram error:', tgResult.reason)
    }
    if (emailResult.status === 'rejected') {
      console.error('[leads/landing] Email error:', emailResult.reason)
    } else {
      const emailData = emailResult.value as any
      if (emailData?.error) {
        console.error('[leads/landing] Resend error:', JSON.stringify(emailData.error))
      } else {
        console.log('[leads/landing] Email enviado OK, id:', emailData?.data?.id || emailData?.id)
      }
    }

    return NextResponse.json({ ok: true })

  } catch (err: any) {
    console.error('[leads/landing] catch:', err.message)
    return NextResponse.json({ ok: true }) // siempre 200 al usuario
  }
}
