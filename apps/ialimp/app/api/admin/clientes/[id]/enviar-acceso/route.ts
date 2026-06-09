import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { sha256Hex } from '@iarest/core-identity'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'

// POST /api/admin/clientes/[id]/enviar-acceso
// Envía al cliente un email con el enlace a su intranet (portal del propietario).
// Body opcional: { email } para sobrescribir el destinatario.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const { email: emailOverride } = await req.json().catch(() => ({}))

    // 1. Cargar cliente (scope empresa). Si no tiene access_token, generarlo.
    //    El token se genera en Node (no con gen_random_bytes/pgcrypto, que no está
    //    disponible en esta BD) y el COALESCE evita pisar uno ya existente.
    const nuevoToken = randomBytes(24).toString('hex')
    const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE clientes SET
        access_token = COALESCE(access_token, ${nuevoToken}),
        notif_activa = true,
        updated_at   = now()
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      RETURNING nombre, access_token, notif_email, contacto_email, email_facturacion
    `)
    if (!filas.length) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    const c = filas[0]

    // Email de un contacto como respaldo (pagador o principal)
    const contactoPrincipal = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT email FROM cliente_contactos
      WHERE cliente_id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid AND email IS NOT NULL AND email <> ''
      ORDER BY es_pagador DESC, principal DESC, nombre NULLS LAST
      LIMIT 1
    `)

    const destinatario = (emailOverride || c.notif_email || c.contacto_email
      || contactoPrincipal[0]?.email || c.email_facturacion || '').trim()

    if (!destinatario) {
      return NextResponse.json({ error: 'El cliente no tiene email. Añade un email de contacto primero.' }, { status: 400 })
    }

    // 2. Nombre de la empresa (para la marca del email)
    const emp = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT nombre FROM empresas WHERE id = ${empresa_id}::uuid
    `)
    const empresaNombre = emp[0]?.nombre || 'IALIMP'

    const base = process.env.NEXTAUTH_URL || 'https://app.ialimp.es'
    const urlPortal = `${base}/propietario`
    const nombreCorto = (c.nombre || '').split(' ')[0] || c.nombre || ''
    const asunto = `Crea tu contraseña de acceso · ${empresaNombre}`

    // 2.b Token de un solo uso para que el propietario fije su contraseña.
    //     El admin es quien da el alta (el propietario no se registra solo).
    //     Hash SHA-256 igual que valida /api/propietario/auth/set-password.
    const rawToken  = randomBytes(32).toString('hex')
    const tokenHash = await sha256Hex(rawToken)
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO cliente_auth_tokens (cliente_id, empresa_id, token_hash, purpose, email, expires_at)
      VALUES (${id}::uuid, ${empresa_id}::uuid, ${tokenHash}, 'set_password', ${destinatario}, now() + interval '7 days')
    `)
    const urlClave = `${base}/propietario/clave/${rawToken}`

    // 3. Enviar email
    let enviado = false
    let errorMsg: string | null = null
    const transporter = getTransporter()
    if (transporter) {
      try {
        await transporter.sendMail({
          from:    `"${empresaNombre}" <${MAIL_FROM}>`,
          to:      destinatario,
          subject: asunto,
          html: `
            <div style="font-family:'Nunito',-apple-system,sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:12px;">
              <div style="background:#4f46e5;color:white;padding:20px 24px;border-radius:10px;margin-bottom:20px;">
                <h1 style="margin:0;font-size:20px;font-weight:800;">🔑 Tu acceso a la intranet</h1>
                <p style="margin:6px 0 0;opacity:0.85;font-size:14px;">${empresaNombre}</p>
              </div>
              <p style="color:#475569;font-size:15px;line-height:1.6;">
                Hola ${nombreCorto},<br><br>
                Te damos acceso a tu intranet privada, donde verás en tiempo real el estado de
                tus limpiezas, las fotos de cada servicio, tus facturas y documentos.<br><br>
                Solo tienes que <strong>crear tu contraseña</strong>. Después entrarás siempre desde
                <strong>${base.replace(/^https?:\/\//, '')}/propietario</strong> con tu email y tu contraseña.
              </p>
              <a href="${urlClave}" style="display:block;background:#4f46e5;color:white;text-align:center;padding:13px;border-radius:8px;text-decoration:none;font-weight:700;margin:18px 0;">
                Crear mi contraseña →
              </a>
              <p style="color:#94a3b8;font-size:12px;line-height:1.5;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                <span style="color:#6366f1;word-break:break-all;">${urlClave}</span>
              </p>
              <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:18px;border-top:1px solid #e2e8f0;padding-top:14px;">
                Este enlace es personal y caduca en 7 días: no lo compartas.<br>
                ${empresaNombre} · Servicio de limpieza profesional
              </p>
            </div>
          `
        })
        enviado = true
      } catch (err: any) {
        errorMsg = err.message
        console.error('Email acceso intranet error:', err.message)
      }
    } else {
      errorMsg = 'Email no configurado (faltan credenciales SMTP)'
    }

    // 4. Registrar en notificaciones
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO notificaciones (empresa_id, cliente_id, tipo, canal, destinatario, asunto, estado, error_msg, enviado_at)
      VALUES (
        ${empresa_id}::uuid,
        ${id}::uuid,
        'acceso_intranet',
        'email',
        ${destinatario},
        ${asunto},
        ${enviado ? 'enviado' : 'error'},
        ${errorMsg},
        ${enviado ? new Date().toISOString() : null}::timestamptz
      )
    `)

    if (!enviado) {
      return NextResponse.json({ error: errorMsg || 'No se pudo enviar el email' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, enviado: true, destinatario, url: urlPortal })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
