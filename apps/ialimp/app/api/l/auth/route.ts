import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'
import { rateLimitHit, rateLimitClear, clientIp } from '@/lib/rate-limit-db'
import { sha256Hex as hashPin } from '@central/core-identity'
// ────────────────────────────────────────────────────────────────────

// Crea la sesión de la limpiadora y devuelve la respuesta con cookies.
// Sesión ÚNICA: borra cualquier sesión previa de esa limpiadora (un asiento =
// un dispositivo a la vez). Además fija `limpiadora_empresa` (recuerda la empresa
// en el móvil → el PIN se acota a ella en futuros accesos).
async function crearSesionResponse(limp: any) {
  await prisma.$executeRaw(Prisma.sql`DELETE FROM limpiadora_sessions WHERE limpiadora_id = ${limp.id}::uuid`)
  const session = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO limpiadora_sessions (limpiadora_id) VALUES (${limp.id}::uuid) RETURNING token
  `)
  const res = NextResponse.json({ ok: true, limpiadora: {
    id: limp.id, nombre: limp.nombre, empresa_id: limp.empresa_id,
    propiedades: limp.propiedades || [], color: limp.color || '#6366f1',
  } })
  res.cookies.set('limpiadora_token', session[0].token, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/',
  })
  if (limp.empresa_id) {
    res.cookies.set('limpiadora_empresa', String(limp.empresa_id), {
      httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 180, path: '/',
    })
  }
  return res
}

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = await rateLimitHit('l:' + ip)
  if (!rl.allowed) {
    const mins = Math.ceil((rl.retryAfter || 900) / 60)
    return NextResponse.json(
      { error: `Demasiados intentos. Espera ${mins} min.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )
  }

  const { pin, token } = await req.json()
  if (!token && (!pin || pin.length < 4)) {
    return NextResponse.json({ error: 'PIN inválido' }, { status: 400 })
  }

  try {
    // ── Acceso por "enlace mágico" (token personal de la limpiadora) ──
    if (token) {
      const porToken = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id, nombre, empresa_id, propiedades, color
        FROM limpiadoras
        WHERE acceso_token = ${token} AND activa = true AND empresa_id IS NOT NULL
        LIMIT 1
      `)
      if (porToken.length === 0) {
        return NextResponse.json({ error: 'Enlace de acceso no válido' }, { status: 401 })
      }
      await rateLimitClear('l:' + ip)
      return crearSesionResponse(porToken[0])
    }

    // ── Acceso por PIN: acotado a la empresa del dispositivo si se conoce ──
    const pinHash = await hashPin(pin)
    const cookieStore = await cookies()
    const empresaCookie = cookieStore.get('limpiadora_empresa')?.value || null
    const scopeLimp = empresaCookie ? Prisma.sql`AND empresa_id = ${empresaCookie}::uuid` : Prisma.empty
    const scopeUsu  = empresaCookie ? Prisma.sql`AND ue.empresa_id = ${empresaCookie}::uuid` : Prisma.empty

    const limpRows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, empresa_id, propiedades, color
      FROM limpiadoras
      WHERE pin_hash = ${pinHash} AND activa = true AND empresa_id IS NOT NULL ${scopeLimp}
    `)
    const usuRows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ue.id, ue.nombre, ue.empresa_id, ue.limpiadora_id, l.propiedades, l.color
      FROM usuarios_empresa ue
      LEFT JOIN limpiadoras l ON l.id = ue.limpiadora_id
      WHERE ue.pin_hash = ${pinHash} AND ue.activo = true AND 'limpiadora' = ANY(ue.modulos) ${scopeUsu}
    `)

    const candidatos = [...limpRows, ...usuRows]
    if (candidatos.length === 0) {
      return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
    }
    // Anti cross-tenant: si el PIN casa en >1 empresa (solo posible sin contexto),
    // no se adivina: se exige el enlace de acceso.
    const empresas = new Set(candidatos.map(c => String(c.empresa_id)))
    if (empresas.size > 1) {
      return NextResponse.json(
        { error: 'Entra con tu enlace de acceso (ese PIN se usa en varias cuentas).' },
        { status: 401 }
      )
    }

    await rateLimitClear('l:' + ip)

    if (limpRows.length > 0) {
      return crearSesionResponse(limpRows[0])
    }
    // Usuario polivalente: usa la limpiadora vinculada
    const u = usuRows[0]
    await prisma.$executeRaw(Prisma.sql`UPDATE usuarios_empresa SET ultimo_acceso = now() WHERE id = ${u.id}::uuid`)
    return crearSesionResponse({
      id: u.limpiadora_id, nombre: u.nombre, empresa_id: u.empresa_id,
      propiedades: u.propiedades, color: u.color,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('limpiadora_token')?.value
  if (!token) return NextResponse.json({ limpiadora: null })

  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT l.id, l.nombre, l.propiedades, l.color,
             e.marca_nombre, e.logo_url, e.color_primario, e.color_secundario, e.color_light
      FROM limpiadora_sessions s
      JOIN limpiadoras l ON l.id = s.limpiadora_id
      LEFT JOIN empresas e ON e.id = l.empresa_id
      WHERE s.token = ${token} AND s.expires_at > now() AND l.activa = true
      LIMIT 1
    `)
    return NextResponse.json({ limpiadora: rows[0] || null })
  } catch {
    return NextResponse.json({ limpiadora: null })
  }
}

export async function DELETE() {
  const cookieStore = await cookies()
  const token = cookieStore.get('limpiadora_token')?.value
  if (token) {
    await prisma.$queryRaw(Prisma.sql`
      DELETE FROM limpiadora_sessions WHERE token = ${token}
    `)
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('limpiadora_token')
  return res
}
