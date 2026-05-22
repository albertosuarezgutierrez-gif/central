import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'

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

    // Notificación Telegram
    const fecha = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
    await tgAlert([
      `🔥 *NUEVO LEAD — landing*`,
      ``,
      `👤 *${nombre}*`,
      `🍽️ ${restaurante}`,
      `📧 ${email}`,
      `📱 ${telefono || '—'}`,
      `👥 Usuarios: ${usuarios || '—'}`,
      ``,
      `⏱️ ${fecha}`
    ].join('\n'))

    return NextResponse.json({ ok: true })

  } catch (err: any) {
    console.error('[leads/landing]', err.message)
    return NextResponse.json({ ok: true }) // siempre 200 al usuario
  }
}
