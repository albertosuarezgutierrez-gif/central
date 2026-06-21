export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { Resend } from 'resend'

function serviceClient() {
  return createServerClient()
}
function getResend() { return new Resend(process.env.RESEND_API_KEY!) }

/**
 * POST /api/owner/contabilidad/invitar
 * Body: { email, nombre, nombre_asesoria? }
 * Invita a un contable a acceder al módulo de contabilidad del restaurante.
 * Si el contable ya existe → añade el restaurante a su lista.
 * Si es nuevo → crea cuenta con PIN aleatorio y envía email con acceso.
 */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const userSupa = createServerClient()

  const { email, nombre, nombre_asesoria } = await req.json()
  if (!email || !nombre) return NextResponse.json({ error: 'email y nombre requeridos' }, { status: 400 })

  const emailNorm = email.toLowerCase().trim()
  const supabase  = serviceClient()

  // Cargar nombre del restaurante
  const { data: rest } = await userSupa
    .from('restaurantes').select('nombre').eq('id', rid).single()
  const nombreRest = rest?.nombre ?? 'el restaurante'

  // ── ¿Ya existe el contable? ──────────────────────────────────────────────
  let { data: contable } = await supabase
    .from('contables').select('id, nombre, pin').eq('email', emailNorm).maybeSingle()

  let nuevoContable = false
  let pin = ''

  if (!contable) {
    // Crear nuevo contable con PIN aleatorio de 6 dígitos
    pin = String(Math.floor(100000 + Math.random() * 900000))
    const { data: nuevo, error } = await supabase
      .from('contables')
      .insert({ email: emailNorm, nombre, nombre_asesoria: nombre_asesoria ?? null, pin, activo: true })
      .select('id, nombre, pin').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    contable = nuevo
    nuevoContable = true
  } else {
    pin = contable.pin
  }

  // ── Vincular restaurante al contable ─────────────────────────────────────
  const { error: linkErr } = await supabase
    .from('contable_clientes')
    .upsert({
      contable_id:    contable.id,
      local_id: rid,
      permisos:       ['ver_resumen', 'ver_303', 'exportar', 'ver_asientos'],
      activo:         true,
      invitado_por:   session.id ?? null,
    }, { onConflict: 'contable_id,local_id' })
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })

  // Actualizar config_contabilidad con referencia al contable
  await userSupa
    .from('config_contabilidad')
    .upsert({
      local_id: rid, contable_id: contable.id,
      email_contable: emailNorm, nombre_contable: nombre,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'local_id' })

  // ── Enviar email ─────────────────────────────────────────────────────────
  const url = `https://www.iarest.es/asesoria`

  const htmlNuevo = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#14110E;color:#F6F1E7;border-radius:12px;padding:32px;">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#D9442B;margin-bottom:20px;">ia.rest</div>
      <h1 style="font-family:Georgia,serif;font-style:italic;font-size:20px;color:#F6F1E7;margin:0 0 12px;">Acceso al módulo de contabilidad</h1>
      <p style="font-size:14px;color:#D8CDB6;line-height:1.6;">Hola <strong>${nombre}</strong>, <strong>${nombreRest}</strong> te ha dado acceso a su contabilidad en ia.rest.</p>
      <p style="font-size:14px;color:#D8CDB6;">Desde el portal puedes consultar el P&L, calcular el IVA trimestral y exportar los asientos en A3, Sage, Holded o CSV.</p>
      <div style="background:#2A221A;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:12px;color:#8C7B69;margin-bottom:6px;">TUS CREDENCIALES</div>
        <div style="font-size:14px;color:#F6F1E7;margin-bottom:4px;">Email: <strong>${emailNorm}</strong></div>
        <div style="font-size:14px;color:#F6F1E7;">PIN: <strong style="font-size:20px;letter-spacing:4px;color:#D9442B;">${pin}</strong></div>
      </div>
      <a href="${url}" style="display:block;background:#D9442B;color:#fff;text-decoration:none;text-align:center;padding:12px;border-radius:8px;font-weight:700;font-size:14px;margin-bottom:16px;">Acceder al portal →</a>
      <p style="font-size:12px;color:#6B5F52;">Si tienes varios clientes en ia.rest, todos aparecerán en el mismo portal con tus mismas credenciales.</p>
    </div>`

  const htmlExistente = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#14110E;color:#F6F1E7;border-radius:12px;padding:32px;">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#D9442B;margin-bottom:20px;">ia.rest</div>
      <h1 style="font-family:Georgia,serif;font-style:italic;font-size:20px;color:#F6F1E7;margin:0 0 12px;">Nuevo cliente en tu portal</h1>
      <p style="font-size:14px;color:#D8CDB6;line-height:1.6;">Hola <strong>${nombre}</strong>, <strong>${nombreRest}</strong> ha sido añadido a tu portal de contabilidad en ia.rest.</p>
      <a href="${url}" style="display:block;background:#D9442B;color:#fff;text-decoration:none;text-align:center;padding:12px;border-radius:8px;font-weight:700;font-size:14px;margin-bottom:12px;">Ver portal →</a>
      <p style="font-size:12px;color:#6B5F52;">Accede con tu email y PIN habituales.</p>
    </div>`

  try {
    await getResend().emails.send({
      from: 'ia.rest <noreply@iarest.es>',
      to: emailNorm,
      subject: nuevoContable
        ? `Acceso al módulo de contabilidad de ${nombreRest} — ia.rest`
        : `Nuevo cliente: ${nombreRest} — ia.rest`,
      html: nuevoContable ? htmlNuevo : htmlExistente,
    })
  } catch (e) { console.error('[Email contable]', e) }

  return NextResponse.json({
    ok: true,
    contable_id:   contable.id,
    nuevo_contable: nuevoContable,
    email:         emailNorm,
    nombre,
  })
}
