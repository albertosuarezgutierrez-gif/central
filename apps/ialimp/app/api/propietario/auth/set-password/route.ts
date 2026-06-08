import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { hashPassword, validatePasswordStrength, createPropietarioToken } from '@/lib/auth'
import { rateLimit, getIp, genHex, sha256Hex } from '@/lib/propietario-auth'

export async function POST(req: Request) {
  const ip = getIp(req)
  const rl = rateLimit('prop-setpw:' + ip)
  if (!rl.allowed) {
    const mins = Math.ceil((rl.retryAfter || 900) / 60)
    return NextResponse.json({ error: `Demasiados intentos. Espera ${mins} min.` }, { status: 429 })
  }

  try {
    const { token, password } = await req.json()
    if (!token || !password) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const pwErr = validatePasswordStrength(password)
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 })

    const hash = await sha256Hex(String(token))
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, cliente_id, empresa_id, email, used_at, expires_at
      FROM cliente_auth_tokens
      WHERE token_hash = ${hash}
      LIMIT 1
    `)
    if (!rows.length) return NextResponse.json({ error: 'Enlace no válido.' }, { status: 400 })
    const t = rows[0]
    if (t.used_at)                              return NextResponse.json({ error: 'Este enlace ya se ha usado. Solicita uno nuevo.' }, { status: 400 })
    if (new Date(t.expires_at) < new Date())    return NextResponse.json({ error: 'El enlace ha caducado. Solicita uno nuevo.' }, { status: 400 })

    const ph     = await hashPassword(password)
    const access = genHex(24)   // por si el cliente aún no tiene access_token interno

    let cli: any
    try {
      const upd = await prisma.$queryRaw<any[]>(Prisma.sql`
        UPDATE clientes SET
          password_hash             = ${ph},
          login_email               = ${String(t.email).toLowerCase()},
          login_email_verificado_at = now(),
          access_token              = COALESCE(access_token, ${access}),
          notif_activa              = true,
          ultimo_login_at           = now(),
          updated_at                = now()
        WHERE id = ${t.cliente_id}::uuid
        RETURNING id, empresa_id, login_email
      `)
      cli = upd[0]
    } catch (err: any) {
      // Choque por login_email duplicado (otro cliente ya usa ese email para entrar)
      if (String(err?.message || '').includes('clientes_login_email_uniq')) {
        return NextResponse.json({ error: 'Ese email ya está asociado a otra cuenta. Contacta con tu empresa de limpieza.' }, { status: 409 })
      }
      throw err
    }
    if (!cli) return NextResponse.json({ error: 'No se encontró tu cuenta.' }, { status: 404 })

    // Consumir este token e invalidar cualquier otro pendiente del mismo cliente.
    await prisma.$executeRaw(Prisma.sql`UPDATE cliente_auth_tokens SET used_at = now() WHERE id = ${t.id}::uuid`)
    await prisma.$executeRaw(Prisma.sql`
      UPDATE cliente_auth_tokens SET used_at = now()
      WHERE cliente_id = ${t.cliente_id}::uuid AND used_at IS NULL
    `)

    const { token: jwt, jti } = await createPropietarioToken(cli.id, cli.empresa_id, cli.login_email)
    await prisma.$executeRaw(Prisma.sql`UPDATE clientes SET session_jti = ${jti} WHERE id = ${cli.id}::uuid`)
    const store = await cookies()
    store.set('ialimp_prop', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
