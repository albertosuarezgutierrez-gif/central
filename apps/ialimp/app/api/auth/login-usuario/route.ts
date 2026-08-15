import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verifyPassword, createUsuarioToken } from '@/lib/auth'
import { getModulosOff } from '@/lib/modulos-tenant'
import { rateLimitHit, rateLimitClear, clientIp } from '@/lib/rate-limit-db'
import { registrarActividad, uaDe } from '@/lib/actividad'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const rlKey = 'admin:' + clientIp(req)
    const rl = await rateLimitHit(rlKey)
    if (!rl.allowed) {
      return NextResponse.json({ error: `Demasiados intentos. Espera ${Math.ceil((rl.retryAfter || 900) / 60)} min.` }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })
    }

    const { email, password, forzar } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ue.*, e.nombre AS empresa_nombre, e.activa AS empresa_activa
      FROM usuarios_empresa ue
      JOIN empresas e ON e.id = ue.empresa_id
      WHERE ue.email = ${email.toLowerCase()} AND ue.activo = true LIMIT 1
    `)
    if (!rows.length) return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })

    const u = rows[0]
    if (!u.empresa_activa) return NextResponse.json({ error: 'Empresa desactivada' }, { status: 403 })

    const ok = await verifyPassword(password, u.password_hash)
    if (!ok) return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })

    await rateLimitClear(rlKey)

    // Sesión única: ya hay sesión abierta en otro dispositivo → avisar (no entrar)
    // salvo que se confirme "Entrar aquí y cerrar la otra" (forzar). Tras verificar
    // la contraseña, así que no filtra existencia de cuenta.
    if (u.sesion_activa && !forzar) {
      return NextResponse.json(
        { sesion_abierta: true, error: 'Ya hay una sesión abierta en otro dispositivo.' },
        { status: 409 }
      )
    }

    // Update last access
    await prisma.$executeRaw(Prisma.sql`
      UPDATE usuarios_empresa SET ultimo_acceso = now() WHERE id = ${u.id}::uuid
    `)

    const modulosOff = await getModulosOff(u.empresa_id)
    const { token, jti } = await createUsuarioToken(u.id, u.empresa_id, u.email, u.rol, u.modulos || [], modulosOff)
    await prisma.$executeRaw(Prisma.sql`UPDATE usuarios_empresa SET session_jti = ${jti}, sesion_activa = true WHERE id = ${u.id}::uuid`)
    await registrarActividad({
      empresa_id: u.empresa_id, actor_tipo: 'usuario', actor_id: u.id, actor_nombre: u.nombre || u.email,
      accion: forzar ? 'login_forzado' : 'login', ip: clientIp(req), user_agent: uaDe(req),
    })
    const cookieStore = await cookies()
    cookieStore.set('ialimp_session', token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30, path: '/', sameSite: 'lax'
    })

    return NextResponse.json({
      ok: true,
      usuario: { nombre: u.nombre, rol: u.rol, modulos: u.modulos || [] },
      empresa: u.empresa_nombre
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
