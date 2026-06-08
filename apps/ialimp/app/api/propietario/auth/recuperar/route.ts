import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import { verifyTurnstile } from '@/lib/turnstile'
import { rateLimit, getIp, genHex, sha256Hex } from '@/lib/propietario-auth'

// Recuperar contraseña del propietario.
// IMPORTANTE: el alta la hace el admin (Vanessa); el propietario NO se registra
// solo. Por eso este endpoint solo envía enlace a cuentas YA ACTIVADAS (las que
// ya tienen contraseña). Si el correo no existe o aún no fue activado por el
// admin, respondemos igual de genérico (anti-enumeración) y no enviamos nada.
const GENERIC = {
  ok: true,
  message: 'Si tu cuenta está activada, te hemos enviado un enlace para restablecer tu contraseña. Revisa tu bandeja (y la carpeta de spam).',
}

export async function POST(req: Request) {
  const ip = getIp(req)
  const rl = rateLimit('prop-recuperar:' + ip)
  if (!rl.allowed) {
    const mins = Math.ceil((rl.retryAfter || 900) / 60)
    return NextResponse.json({ error: `Demasiados intentos. Espera ${mins} min.` }, { status: 429 })
  }

  try {
    const { email, turnstileToken } = await req.json()
    if (!email) return NextResponse.json({ error: 'Falta el email' }, { status: 400 })

    if (!(await verifyTurnstile(turnstileToken, ip))) {
      return NextResponse.json({ error: 'Verificación anti-bot fallida. Recarga la página.' }, { status: 400 })
    }

    const norm = String(email).toLowerCase().trim()

    // Solo cuentas YA activadas por el admin: tienen login_email + password_hash.
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT c.id, c.empresa_id, c.nombre, e.nombre AS empresa_nombre
      FROM clientes c JOIN empresas e ON e.id = c.empresa_id
      WHERE c.activo = true
        AND c.password_hash IS NOT NULL
        AND lower(c.login_email) = ${norm}
      LIMIT 1
    `)

    if (!rows.length) return NextResponse.json(GENERIC)

    const c = rows[0]
    const raw  = genHex(32)
    const hash = await sha256Hex(raw)

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO cliente_auth_tokens (cliente_id, empresa_id, token_hash, purpose, email, expires_at)
      VALUES (${c.id}::uuid, ${c.empresa_id}::uuid, ${hash}, 'reset_password', ${norm}, now() + interval '1 hour')
    `)

    const origin = req.headers.get('origin') || new URL(req.url).origin
    const link = `${origin}/propietario/clave/${raw}`

    const transporter = getTransporter()
    if (transporter) {
      try {
        await transporter.sendMail({
          from: `"${c.empresa_nombre}" <${MAIL_FROM}>`,
          to: norm,
          subject: 'Restablece tu contraseña de acceso',
          html: `
            <div style="font-family:'Nunito',Arial,sans-serif;max-width:480px;margin:0 auto;background:#f1f5f9;padding:24px;border-radius:14px;color:#1e1b4b;">
              <div style="background:#4f46e5;color:#fff;padding:20px 24px;border-radius:12px;margin-bottom:20px;">
                <h1 style="margin:0;font-size:19px;">Restablecer contraseña</h1>
              </div>
              <p style="font-size:15px;line-height:1.6;color:#334155;">
                Hola ${String(c.nombre || '').split(' ')[0] || ''},<br><br>
                Pulsa el botón para elegir una nueva contraseña de acceso a tu portal.
              </p>
              <a href="${link}" style="display:block;background:#4f46e5;color:#fff;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:800;margin:18px 0;">
                Cambiar mi contraseña →
              </a>
              <p style="font-size:12px;color:#94a3b8;line-height:1.5;">
                Este enlace caduca en 1 hora y solo se puede usar una vez. Si no lo has solicitado, ignora este correo.
              </p>
            </div>`,
        })
      } catch (err: any) {
        console.error('[propietario/recuperar] email error:', err?.message)
      }
    } else {
      console.warn('[propietario/recuperar] sin transporte de correo configurado')
    }

    return NextResponse.json(GENERIC)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
