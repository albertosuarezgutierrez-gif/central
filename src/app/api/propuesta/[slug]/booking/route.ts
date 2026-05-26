export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { sendEmail } from '@/lib/email'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = createServerClient()

  const { nombre, email, fecha, hora, lugar, notas } = await req.json()

  if (!nombre || !fecha || !hora || !lugar) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  // Buscar lead por propuesta_slug (dinámico) o por slug estático conocido
  const staticSlugs: Record<string, string> = {
    'ovejas-negras': 'Ovejas Negras',
    'sloppy-joes': "Sloppy Joe's",
    'catering-jj': 'Catering Joaquín Jaén',
    'catering-jj-haciendas': 'Catering Joaquín Jaén',
    'catering-jj-restauracion': 'Catering Joaquín Jaén',
    'catering-jj-catering': 'Catering Joaquín Jaén',
    'eventos-catering': 'Eventos & Catering',
    'bombonera-group': 'Bombonera Group',
  }
  let lead: { id: string; empresa: string | null; restaurante: string | null; nombre: string | null; email: string | null; eventos: unknown[] } | null = null

  const { data: bySlug } = await supabase
    .from('leads')
    .select('id, empresa, restaurante, nombre, email, eventos')
    .eq('propuesta_slug', slug)
    .maybeSingle()

  if (bySlug) {
    lead = bySlug
  } else if (staticSlugs[slug]) {
    // Propuesta estática — buscar por empresa/nombre
    const { data: byName } = await supabase
      .from('leads')
      .select('id, empresa, restaurante, nombre, email, eventos')
      .ilike('empresa', `%${staticSlugs[slug].split(' ')[0]}%`)
      .maybeSingle()
    if (byName) {
      // Asociar slug al lead para futuras visitas
      await supabase.from('leads').update({ propuesta_slug: slug }).eq('id', byName.id)
      lead = byName
    }
  }

  const empresa = lead ? (lead.empresa || lead.restaurante || lead.nombre) : (staticSlugs[slug] || slug)
  const fechaHora = `${fecha}T${hora}:00`

  // Actualizar lead si existe en BD
  if (lead) {
    const eventos = Array.isArray(lead.eventos) ? lead.eventos : []
    await supabase.from('leads').update({
      reunion_fecha: fechaHora,
      reunion_lugar: lugar,
      reunion_notas: notas || null,
      reunion_confirmada: false,
      estado_pipeline: 'reunion_agendada',
      estado: 'demo',
      eventos: [...eventos, {
        tipo: '📅',
        texto: `Reunión solicitada: ${fecha} ${hora}h en ${lugar}. Contacto: ${nombre} (${email || 'sin email'})`,
        fecha: new Date().toISOString().split('T')[0]
      }]
    }).eq('id', lead.id)
  }

  // Notificar a Alberto por Telegram
  await tgAlert(
    `📅 Reunión solicitada!\n\n<b>${empresa}</b>\n👤 ${nombre}${email ? ` · ${email}` : ''}\n📍 ${lugar}\n🕐 ${fecha} a las ${hora}h${notas ? `\n📝 ${notas}` : ''}\n\n<a href="https://www.iarest.es/super">Confirmar en /super →</a>`,
    'info'
  )
  // Email confirmación al lead (si tiene email)
  const emailDestino = email || lead?.email
  if (emailDestino) {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:32px 20px;background:#f6f1e7;font-family:sans-serif">
  <div style="max-width:520px;margin:0 auto">
    <div style="margin-bottom:20px">
      <span style="font-family:serif;font-size:22px;font-weight:600;color:#14110e">ia.rest</span>
    </div>
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #d8cdb6">
      <p style="font-family:serif;font-size:22px;font-weight:500;color:#14110e;margin:0 0 16px">Reunión confirmada ✓</p>
      <p style="font-size:15px;color:#1a1714;line-height:1.6;margin:0 0 20px">Hola ${nombre},<br><br>
      Perfecto, he recibido tu solicitud. Te confirmo la visita en cuanto lo tenga en el calendario.</p>
      <div style="background:#f6f1e7;border-radius:8px;padding:16px;margin:0 0 20px">
        <div style="font-size:13px;color:#6b5f52;margin-bottom:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">Detalles de la visita</div>
        <div style="font-size:14px;color:#1a1714;line-height:1.8">
          📍 <b>${lugar}</b><br>
          🕐 <b>${fecha} a las ${hora}h</b>${notas ? `<br>📝 ${notas}` : ''}
        </div>
      </div>
      <p style="font-size:14px;color:#6b5f52;margin:0">Si necesitas cambiar algo, escríbeme directamente.<br><br>
      Alberto · ia.rest</p>
    </div>
    <div style="margin-top:16px;font-size:12px;color:#9c8e7e;text-align:center">
      <a href="https://www.iarest.es" style="color:#d9442b;text-decoration:none">www.iarest.es</a> · hola@iarest.es
    </div>
  </div>
</body>
</html>`

    await sendEmail({
      to: emailDestino,
      subject: `Reunión ia.rest — ${fecha} · ${lugar}`,
      html,
      replyTo: 'hola@iarest.es',
    }).catch(e => console.error('[booking] Email error:', e))
  }

  return NextResponse.json({ ok: true })
}

// Trackear visita a la propuesta
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = createServerClient()

  const staticSlugsMap: Record<string, string> = {
    'ovejas-negras': 'Ovejas Negras',
    'sloppy-joes': "Sloppy Joe's",
    'catering-jj': 'Catering Joaquín Jaén',
    'catering-jj-haciendas': 'Catering Joaquín Jaén',
    'catering-jj-restauracion': 'Catering Joaquín Jaén',
    'catering-jj-catering': 'Catering Joaquín Jaén',
    'eventos-catering': 'Eventos & Catering',
    'bombonera-group': 'Bombonera Group',
  }

  // Buscar lead por slug (directo o fallback por empresa)
  let lead: { id: string; empresa: string | null; restaurante: string | null; nombre: string | null; propuesta_vista_at: string | null } | null = null
  const { data: bySlugP } = await supabase
    .from('leads')
    .select('id, empresa, restaurante, nombre, propuesta_vista_at')
    .eq('propuesta_slug', slug)
    .maybeSingle()
  if (bySlugP) {
    lead = bySlugP
  } else if (staticSlugsMap[slug]) {
    const { data: byNameP } = await supabase
      .from('leads')
      .select('id, empresa, restaurante, nombre, propuesta_vista_at')
      .ilike('empresa', `%${staticSlugsMap[slug].split(' ')[0]}%`)
      .maybeSingle()
    if (byNameP) {
      await supabase.from('leads').update({ propuesta_slug: slug }).eq('id', byNameP.id)
      lead = byNameP
    }
  }

  const esPrimeraVisita = lead && !lead.propuesta_vista_at

  if (lead) {
    await supabase
      .from('leads')
      .update({ propuesta_vista_at: new Date().toISOString() })
      .eq('id', lead.id)
  }

  // Telegram en cada visita
  const empresa = lead ? (lead.empresa || lead.restaurante || lead.nombre || slug) : slug
  const label = esPrimeraVisita ? '👁 Propuesta abierta por primera vez' : '👁 Propuesta visitada de nuevo'
  await tgAlert(
    `${label}\n\n<b>${empresa}</b>\n🔗 /propuesta/${slug}\n\n<a href="https://www.iarest.es/super">Ver en CRM →</a>`,
    'info'
  )

  return NextResponse.json({ ok: true })
}
