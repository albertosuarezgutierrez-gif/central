// Prospectos del mailing en frío (panel superadmin). GLOBAL de IALIMP, sin empresa_id.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'
import { isSuperadmin } from '@/lib/tenant'

// GET /api/superadmin/mailing/prospectos?q=&estado=&baja=
// Lista ordenada por "calor" (clics/aperturas) para llamar primero a los más interesados.
export async function GET(req: NextRequest) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const sp = req.nextUrl.searchParams
    const q = (sp.get('q') || '').trim()
    const estado = (sp.get('estado') || '').trim()
    const incluirBaja = sp.get('baja') === '1'

    const filtros: Prisma.Sql[] = []
    if (q) filtros.push(Prisma.sql`(p.empresa_nombre ILIKE ${'%' + q + '%'} OR p.email ILIKE ${'%' + q + '%'} OR p.telefono ILIKE ${'%' + q + '%'})`)
    if (estado) filtros.push(Prisma.sql`p.estado = ${estado}`)
    if (!incluirBaja) filtros.push(Prisma.sql`p.baja = false`)
    const where = filtros.length ? Prisma.sql`WHERE ${Prisma.join(filtros, ' AND ')}` : Prisma.empty

    const prospectos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT p.*,
        COALESCE(ev.aperturas, 0) AS aperturas,
        COALESCE(ev.clicks, 0)    AS clicks,
        ev.ultimo_enviado_at, ev.ultimo_click_at
      FROM mailing_prospectos p
      LEFT JOIN LATERAL (
        SELECT SUM(aperturas)::int AS aperturas, SUM(clicks)::int AS clicks,
               MAX(enviado_at) AS ultimo_enviado_at, MAX(click_at) AS ultimo_click_at
        FROM mailing_envios WHERE prospecto_id = p.id
      ) ev ON true
      ${where}
      ORDER BY COALESCE(ev.clicks,0) DESC, COALESCE(ev.aperturas,0) DESC, p.created_at DESC
      LIMIT 500
    `)

    const stats = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT estado, COUNT(*)::int AS n FROM mailing_prospectos GROUP BY estado
    `)
    // Recordatorios de seguimiento vencidos ("para hoy").
    const seguimiento = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, empresa_nombre, telefono, email, seguimiento_proximo_at
      FROM mailing_prospectos
      WHERE seguimiento_proximo_at IS NOT NULL AND seguimiento_proximo_at <= now() AND baja = false
      ORDER BY seguimiento_proximo_at ASC LIMIT 50
    `)

    return NextResponse.json(serialize({ prospectos, stats, seguimiento }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/superadmin/mailing/prospectos
// Body: { prospectos: [{empresa_nombre,email,telefono,ciudad,web,notas}], origen? }
// Import idempotente por lower(email). Devuelve { insertados, duplicados }.
export async function POST(req: NextRequest) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const body = await req.json()
    const filas: any[] = Array.isArray(body?.prospectos) ? body.prospectos : []
    const origen = body?.origen === 'landing' ? 'landing' : 'csv'
    if (!filas.length) return NextResponse.json({ error: 'Sin prospectos' }, { status: 400 })

    // Normalizar. Se aceptan filas SIN email (entran como "solo teléfono", para llamar).
    const norm = filas
      .map(f => {
        const email = String(f.email || '').trim().toLowerCase()
        return {
          empresa_nombre: String(f.empresa_nombre || '').trim(),
          email: /.+@.+\..+/.test(email) ? email : null,
          telefono: f.telefono ? String(f.telefono).trim() : null,
          ciudad: f.ciudad ? String(f.ciudad).trim() : 'Sevilla',
          web: f.web ? String(f.web).trim() : null,
          notas: f.notas ? String(f.notas).trim() : null,
        }
      })
      .filter(f => f.empresa_nombre && (f.email || f.telefono || f.web))

    // Dedupe dentro del lote: por email si lo hay, si no por nombre.
    const vistos = new Set<string>()
    const limpias = norm.filter(f => {
      const k = f.email || 'n:' + f.empresa_nombre.toLowerCase()
      return vistos.has(k) ? false : (vistos.add(k), true)
    })
    if (!limpias.length) return NextResponse.json({ error: 'Ninguna fila válida (empresa + email/teléfono/web)' }, { status: 400 })

    // Inserción por fila: con email → dedupe por lower(email); sin email → por nombre.
    let insertados = 0
    for (const f of limpias) {
      try {
        const r = f.email
          ? await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
              INSERT INTO mailing_prospectos (empresa_nombre, email, telefono, ciudad, web, notas, origen)
              VALUES (${f.empresa_nombre}, ${f.email}, ${f.telefono}, ${f.ciudad}, ${f.web}, ${f.notas}, ${origen})
              ON CONFLICT (lower(email)) DO NOTHING RETURNING id`)
          : await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
              INSERT INTO mailing_prospectos (empresa_nombre, email, telefono, ciudad, web, notas, origen)
              SELECT ${f.empresa_nombre}, NULL, ${f.telefono}, ${f.ciudad}, ${f.web}, ${f.notas}, ${origen}
              WHERE NOT EXISTS (SELECT 1 FROM mailing_prospectos WHERE lower(empresa_nombre) = lower(${f.empresa_nombre}))
              RETURNING id`)
        if (r.length) insertados++
      } catch { /* fila duplicada/errónea: ignorar */ }
    }
    return NextResponse.json({ insertados, duplicados: limpias.length - insertados, total: filas.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
