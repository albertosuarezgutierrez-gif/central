import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { enviarEmailNuevoLead } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nombre, restaurante, email, telefono, usuarios, fuente } = body

    if (!nombre || !restaurante || !email) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    // Guardar en BD
    const supabase = createServerClient()
    await supabase.from('leads_landing').insert({
      nombre,
      restaurante,
      email,
      telefono: telefono || null,
      usuarios: usuarios || null,
      fuente: fuente || 'landing',
      estado: 'nuevo'
    })

    // Notificaciones en paralelo
    const fecha = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
    const [tgResult, emailResult] = await Promise.allSettled([
      tgAlert([
        `🔥 NUEVO LEAD — landing`,
        ``,
        `👤 ${nombre}`,
        `🍽️ ${restaurante}`,
        `📧 ${email}`,
        `📱 ${telefono || '—'}`,
        `👥 Usuarios: ${usuarios || '—'}`,
        ``,
        `⏱️ ${fecha}`
      ].join('\n')),
      enviarEmailNuevoLead({ nombre, restaurante, email, telefono, usuarios })
    ])

    // Log explícito para depuración
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
