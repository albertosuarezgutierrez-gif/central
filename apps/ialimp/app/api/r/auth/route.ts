import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'
import { rateLimitHit, rateLimitClear, clientIp } from '@/lib/rate-limit-db'
import { sha256Hex as hashPin } from '@central/core-identity'

async function crearSesionResponse(rep: any) {
  await prisma.$executeRaw(Prisma.sql`DELETE FROM repartidor_sessions WHERE repartidor_id = ${rep.id}::uuid`)
  const session = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO repartidor_sessions (repartidor_id, token)
    VALUES (${rep.id}::uuid, gen_random_uuid()::text)
    RETURNING token
  `)
  const res = NextResponse.json({
    ok: true,
    repartidor: { id: rep.id, nombre: rep.nombre, empresa_id: rep.empresa_id, color: rep.color || '#6366f1' },
  })
  res.cookies.set('repartidor_token', session[0].token, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/',
  })
  if (rep.empresa_id) {
    res.cookies.set('repartidor_empresa', String(rep.empresa_id), {
      httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 180, path: '/',
    })
  }
  return res
}

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = await rateLimitHit('r:' + ip)
  if (!rl.allowed) {
    const mins = Math.ceil((rl.retryAfter || 900) / 60)
    return NextResponse.json({ error: `Demasiados intentos. Espera ${mins} min.` }, { status: 429 })
  }

  const { pin } = await req.json()
  if (!pin || pin.length < 4) return NextResponse.json({ error: 'PIN inválido' }, { status: 400 })

  try {
    const pinHash = await hashPin(pin)
    const cookieStore = await cookies()
    const empresaCookie = cookieStore.get('repartidor_empresa')?.value || null
    const scope = empresaCookie ? Prisma.sql`AND empresa_id = ${empresaCookie}::uuid` : Prisma.empty

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, empresa_id, color
      FROM repartidores
      WHERE pin_hash = ${pinHash} AND activo = true AND empresa_id IS NOT NULL ${scope}
    `)
    if (rows.length === 0) return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })

    const empresas = new Set(rows.map(r => String(r.empresa_id)))
    if (empresas.size > 1) {
      return NextResponse.json({ error: 'Entra con tu enlace de acceso (ese PIN se usa en varias cuentas).' }, { status: 401 })
    }

    await rateLimitClear('r:' + ip)
    return crearSesionResponse(rows[0])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('repartidor_token')?.value
  if (!token) return NextResponse.json({ repartidor: null })

  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT r.id, r.nombre, r.color,
             e.marca_nombre, e.logo_url, e.color_primario, e.color_secundario, e.color_light
      FROM repartidor_sessions s
      JOIN repartidores r ON r.id = s.repartidor_id
      LEFT JOIN empresas e ON e.id = r.empresa_id
      WHERE s.token = ${token} AND s.expires_at > now() AND r.activo = true
      LIMIT 1
    `)
    return NextResponse.json({ repartidor: rows[0] || null })
  } catch {
    return NextResponse.json({ repartidor: null })
  }
}

export async function DELETE() {
  const cookieStore = await cookies()
  const token = cookieStore.get('repartidor_token')?.value
  if (token) await prisma.$executeRaw(Prisma.sql`DELETE FROM repartidor_sessions WHERE token = ${token}`)
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('repartidor_token')
  return res
}
