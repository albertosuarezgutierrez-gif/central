import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const { foto_url, notas_finales } = await req.json().catch(() => ({}))

    // 1. Marcar sesión como completada
    const sesiones = await prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE cleaning_sessions SET
        completed_at   = NOW(),
        foto_despues_url = COALESCE(${foto_url || null}, foto_despues_url)
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      RETURNING *
    `)

    if (!sesiones.length) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    const sesion = sesiones[0]

    // 2. Obtener datos del cliente + propiedad
    const datos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        c.nombre       AS cliente_nombre,
        c.notif_email,
        c.notif_whatsapp,
        c.notif_activa,
        c.access_token,
        e.nombre       AS empresa_nombre,
        p.nombre       AS propiedad_nombre
      FROM clientes     c
      JOIN empresas     e ON e.id = c.empresa_id
      LEFT JOIN propiedades p ON p.id = ${sesion.propiedad_id ? sesion.propiedad_id + '::uuid' : null}
      WHERE c.id = ${sesion.cliente_id}::uuid
    `)

    if (!datos.length || !datos[0].notif_activa) {
      return NextResponse.json({ ok: true, notificado: false })
    }

    const d       = datos[0]
    const hora    = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    const fecha   = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    const urlProp = `${process.env.NEXTAUTH_URL || 'https://app.ialimp.es'}/propietario/${d.access_token}`
    const propNombre = sesion.property_name || d.propiedad_nombre || 'su propiedad'

    // 3. Enviar email
    let emailEnviado = false
    const transporter = getTransporter()
    if (d.notif_email && transporter) {
      try {
        await transporter.sendMail({
          from:    `"${d.empresa_nombre}" <${MAIL_FROM}>`,
          to:      d.notif_email,
          subject: `✅ ${propNombre} está listo — ${hora}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:12px;">
              <div style="background:#4f46e5;color:white;padding:20px 24px;border-radius:10px;margin-bottom:20px;">
                <h1 style="margin:0;font-size:20px;">✅ ${propNombre} está listo</h1>
                <p style="margin:6px 0 0;opacity:0.8;font-size:14px;">${fecha} · ${hora}</p>
              </div>
              <p style="color:#475569;font-size:15px;line-height:1.6;">
                Hola ${d.cliente_nombre.split(' ')[0]},<br><br>
                La limpieza de <strong>${propNombre}</strong> ha sido completada.
                El piso está listo para recibir a tus próximos huéspedes.
              </p>
              ${foto_url ? `<img src="${foto_url}" style="width:100%;border-radius:8px;margin:16px 0;" />` : ''}
              <a href="${urlProp}" style="display:block;background:#4f46e5;color:white;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px;">
                Ver estado de mis propiedades →
              </a>
              <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px;">
                ${d.empresa_nombre} · Servicio de limpieza profesional
              </p>
            </div>
          `
        })
        emailEnviado = true
      } catch (err: any) {
        console.error('Email error:', err.message)
      }
    }

    // 4. Registrar notificación en BD
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO notificaciones (empresa_id, cliente_id, sesion_id, tipo, canal, destinatario, asunto, estado, enviado_at)
      VALUES (
        ${empresa_id}::uuid,
        ${sesion.cliente_id}::uuid,
        ${id}::uuid,
        'piso_listo',
        'email',
        ${d.notif_email || null},
        ${'✅ ' + propNombre + ' está listo — ' + hora},
        ${emailEnviado ? 'enviado' : 'pendiente'},
        ${emailEnviado ? new Date().toISOString() : null}::timestamptz
      )
    `)

    // 5. URL de WhatsApp (para botón en el frontend)
    const waText = encodeURIComponent(
      `✅ *${propNombre} está listo*
` +
      `🕐 ${hora} · ${fecha}

` +
      `La limpieza ha sido completada. El piso está listo para tus huéspedes.

` +
      `🔗 Ver mis propiedades: ${urlProp}`
    )
    const waUrl = d.notif_whatsapp
      ? `https://wa.me/${d.notif_whatsapp.replace('+','')}?text=${waText}`
      : null

    return NextResponse.json({
      ok: true,
      notificado: emailEnviado,
      email_enviado: emailEnviado,
      whatsapp_url: waUrl,
      propietario_url: urlProp,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
