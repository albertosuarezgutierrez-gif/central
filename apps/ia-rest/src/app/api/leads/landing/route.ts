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

    // La landing principal (iarest.es/#contacto) sólo pide Nombre + Teléfono
    // (email opcional, sin campo "restaurante" → manda restaurante:"").
    // Antes se exigía nombre+restaurante+email y la home devolvía 400 SIEMPRE:
    // ni se guardaba el lead ni se avisaba por email/Telegram. Ahora exigimos
    // nombre y AL MENOS un medio de contacto (teléfono o email).
    const nombreFinal = typeof nombre === 'string' ? nombre.trim() : ''
    const telefonoFinal = typeof telefono === 'string' ? telefono.trim() : ''
    const emailFinal = typeof email === 'string' ? email.trim() : ''
    // leads_landing.restaurante y leads.restaurante son NOT NULL → fallback.
    const restauranteFinal = (typeof restaurante === 'string' && restaurante.trim()) || 'Sin especificar'

    if (!nombreFinal || (!telefonoFinal && !emailFinal)) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    // origen tiene prioridad sobre fuente (campo legacy)
    const origenFinal = origen || fuente || 'landing'
    const origenLabel = ETIQUETAS_ORIGEN[origenFinal] ?? `📌 ${origenFinal}`

    // Guardar en BD
    const supabase = createServerClient()
    await supabase.from('leads_landing').insert({
      nombre: nombreFinal,
      restaurante: restauranteFinal,
      email: emailFinal,            // columna NOT NULL → string vacío si no lo dieron
      telefono: telefonoFinal || null,
      usuarios: usuarios || null,
      fuente: origenFinal,
      estado: 'nuevo'
    })

    // Además, crear el lead en el CRM (tabla `leads`) para que aparezca en el Kanban
    // como lead CALIENTE (origen inbound_web). Si ya existe uno con ese email, no duplica.
    // En su propio try/catch: si falla, el formulario sigue respondiendo OK.
    try {
      // Dedup por email si lo hay; si no, por teléfono.
      let existente: { id: string } | null = null
      if (emailFinal) {
        const { data } = await supabase.from('leads').select('id').eq('email', emailFinal).limit(1).maybeSingle()
        existente = data
      } else if (telefonoFinal) {
        const { data } = await supabase.from('leads').select('id').eq('telefono', telefonoFinal).limit(1).maybeSingle()
        existente = data
      }
      if (!existente) {
        await supabase.from('leads').insert({
          nombre: nombreFinal,
          empresa: restauranteFinal,
          restaurante: restauranteFinal,
          email: emailFinal || null,
          telefono: telefonoFinal,
          ciudad: null,
          tipo: 'online',
          estado: 'nuevo',
          estado_pipeline: 'nuevo',
          origen: 'inbound_web',
          consent_rgpd: true,
          consent_at: new Date().toISOString(),
          notas: `Formulario web (${origenFinal})${usuarios ? ` · ${usuarios} usuarios` : ''}`,
          eventos: [{ tipo: '🌐', texto: `Llegó por formulario web (${origenFinal})`, fecha: new Date().toISOString().split('T')[0] }],
        })
      }
    } catch (e) {
      console.error('[leads/landing] no se pudo crear lead CRM:', e)
    }

    // Notificaciones en paralelo
    const fecha = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
    const tgMsg = [
      `🔥 NUEVO LEAD — ${origenLabel}`,
      ``,
      `👤 ${nombreFinal}`,
      `🍽️ ${restauranteFinal}`,
      `📧 ${emailFinal || '—'}`,
      `📱 ${telefonoFinal || '—'}`,
      `👥 Usuarios: ${usuarios || '—'}`,
      ``,
      `⏱️ ${fecha}`
    ].join('\n')

    const [tgResult, emailResult] = await Promise.allSettled([
      tgAlert(tgMsg.replace(/<[^>]*>/g, ''), 'info'),
      enviarEmailNuevoLead({ nombre: nombreFinal, restaurante: restauranteFinal, email: emailFinal, telefono: telefonoFinal, usuarios })
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
