export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { Resend } from 'resend'

function sc() { return createServerClient() }
function getResend() { return new Resend(process.env.RESEND_API_KEY!) }

/**
 * POST /api/owner/almacen/invitar-gestor
 * Body: { email, nombre, nombre_empresa?, modulos?: string[] }
 * Si la persona ya tiene cuenta en contables → añade 'almacen' a sus módulos.
 * Si es nueva → crea cuenta con modulos: ['almacen'] y envía PIN por email.
 * También puede darse acceso a ambos módulos (contabilidad + almacén).
 */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const userSupa = createServerClient()
  const { email, nombre, nombre_empresa, modulos: modulosSolicitados = ['almacen'] } = await req.json()
  if (!email || !nombre) return NextResponse.json({ error: 'email y nombre requeridos' }, { status: 400 })

  const emailNorm = email.toLowerCase().trim()
  const supabase  = sc()

  const { data: rest } = await userSupa.from('restaurantes').select('nombre').eq('id', rid).single()
  const nombreRest = rest?.nombre ?? 'el restaurante'

  // ¿Ya existe?
  let { data: contable } = await supabase.from('contables').select('id, nombre, pin, modulos').eq('email', emailNorm).maybeSingle()

  let nuevoContable = false
  let pin = ''
  let modulosFinales: string[]

  if (!contable) {
    pin = String(Math.floor(100000 + Math.random() * 900000))
    modulosFinales = modulosSolicitados
    const { data: nuevo, error } = await supabase
      .from('contables')
      .insert({ email: emailNorm, nombre, nombre_asesoria: nombre_empresa ?? null, pin, activo: true, modulos: modulosFinales })
      .select('id, pin, modulos').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    contable = { id: nuevo.id, nombre, pin: nuevo.pin, modulos: nuevo.modulos }
    nuevoContable = true
  } else {
    pin = contable.pin
    const actuales: string[] = contable.modulos ?? ['contabilidad']
    modulosFinales = [...new Set([...actuales, ...modulosSolicitados])]
    await supabase.from('contables').update({ modulos: modulosFinales }).eq('id', contable.id)
  }

  // Vincular restaurante
  await supabase.from('contable_clientes').upsert({
    contable_id:    contable.id,
    local_id: rid,
    permisos:       ['ver_stock', 'ver_pedidos', 'crear_pedido'],
    modulos:        modulosFinales,
    activo:         true,
    invitado_por:   session.id ?? null,
  }, { onConflict: 'contable_id,local_id' })

  const tieneAlmacen = modulosFinales.includes('almacen')
  const tieneContab  = modulosFinales.includes('contabilidad')
  const descripcion  = tieneAlmacen && tieneContab ? 'almacén y contabilidad' : tieneAlmacen ? 'almacén' : 'contabilidad'

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#14110E;color:#F6F1E7;border-radius:12px;padding:32px;">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#D9442B;margin-bottom:20px;">ia.rest</div>
      <h1 style="font-family:Georgia,serif;font-style:italic;font-size:20px;margin:0 0 12px;">Acceso a ${descripcion} de ${nombreRest}</h1>
      <p style="font-size:14px;color:#D8CDB6;line-height:1.6;">Hola <strong>${nombre}</strong>, tienes acceso al módulo de <strong>${descripcion}</strong>.</p>
      <div style="background:#2A221A;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:12px;color:#8C7B69;margin-bottom:6px;">CREDENCIALES</div>
        <div style="font-size:14px;margin-bottom:4px;">Email: <strong>${emailNorm}</strong></div>
        <div style="font-size:14px;">PIN: <strong style="font-size:20px;letter-spacing:4px;color:#D9442B;">${pin}</strong></div>
      </div>
      ${tieneAlmacen ? `<a href="https://www.iarest.es/almacen-central" style="display:block;background:#3F7D44;color:#fff;text-decoration:none;text-align:center;padding:11px;border-radius:8px;font-weight:700;font-size:13px;margin-bottom:8px;">Acceder al portal de almacén →</a>` : ''}
      ${tieneContab  ? `<a href="https://www.iarest.es/asesoria" style="display:block;background:#1E3A5F;color:#fff;text-decoration:none;text-align:center;padding:11px;border-radius:8px;font-weight:700;font-size:13px;margin-bottom:8px;">Acceder al portal de contabilidad →</a>` : ''}
      <p style="font-size:11px;color:#6B5F52;margin-top:12px;">Si tienes varios restaurantes en ia.rest, todos aparecerán con las mismas credenciales.</p>
    </div>`

  try {
    await getResend().emails.send({
      from: 'ia.rest <noreply@iarest.es>',
      to: emailNorm,
      subject: `Acceso a ${descripcion} de ${nombreRest} — ia.rest`,
      html,
    })
  } catch (e) { console.error('[Email gestor almacen]', e) }

  return NextResponse.json({ ok: true, contable_id: contable.id, nuevo_contable: nuevoContable, modulos: modulosFinales, email: emailNorm })
}
