import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { insertarPropiedades } from '@/lib/sivra/inversion-correos'

const TIPOS_CASA = ['chalet', 'finca', 'parcela', 'casa', 'adosado', 'villa']

async function requireAuth() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return null
}

export async function GET(req: NextRequest) {
  const deny = await requireAuth(); if (deny) return deny

  const { searchParams } = new URL(req.url)
  const estado     = searchParams.get('estado')
  const tipo       = searchParams.get('tipo')
  const zona       = searchParams.get('zona')
  const piscina    = searchParams.get('piscina')
  const playa      = searchParams.get('playa')
  const rustica    = searchParams.get('rustica')
  const subasta    = searchParams.get('subasta')
  const bajada     = searchParams.get('bajada')
  const casas      = searchParams.get('casas')
  const min_score  = searchParams.get('min_score')
  const precio_max = searchParams.get('precio_max')
  const precio_min = searchParams.get('precio_min')
  const limit      = Math.min(parseInt(searchParams.get('limit') || '60'), 200)
  const offset     = Math.max(parseInt(searchParams.get('offset') || '0'), 0)

  try {
    const conditions: Prisma.Sql[] = [Prisma.sql`1=1`]
    if (estado && estado !== 'all')  conditions.push(Prisma.sql`estado = ${estado}`)
    if (tipo && tipo !== 'all')      conditions.push(Prisma.sql`tipo = ${tipo}`)
    if (zona && zona !== 'all')      conditions.push(Prisma.sql`zona ILIKE ${'%' + zona + '%'}`)
    if (piscina === 'true')          conditions.push(Prisma.sql`tiene_piscina = true`)
    if (playa === 'true')            conditions.push(Prisma.sql`cerca_playa = true`)
    if (rustica === 'true')          conditions.push(Prisma.sql`es_rustica = true`)
    if (subasta === 'true')          conditions.push(Prisma.sql`es_subasta = true`)
    if (bajada === 'true')           conditions.push(Prisma.sql`es_bajada_precio = true`)
    if (casas === 'true')            conditions.push(Prisma.sql`tipo = ANY(${TIPOS_CASA}::text[])`)
    if (min_score) {
      const s = parseInt(min_score); if (!isNaN(s)) conditions.push(Prisma.sql`puntuacion_chollo >= ${s}`)
    }
    if (precio_max) {
      const p = parseInt(precio_max); if (!isNaN(p)) conditions.push(Prisma.sql`precio <= ${p}`)
    }
    if (precio_min) {
      const p = parseInt(precio_min); if (!isNaN(p)) conditions.push(Prisma.sql`precio >= ${p}`)
    }

    const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`

    const [inmuebles, countResult] = await Promise.all([
      prisma.$queryRaw(Prisma.sql`
        SELECT * FROM inmuebles_busqueda
        ${where}
        ORDER BY es_bajada_precio DESC, puntuacion_chollo DESC, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS total FROM inmuebles_busqueda ${where}
      `),
    ])

    const total = countResult[0]?.total ?? 0

    const newIds = (inmuebles as any[]).filter(i => i.is_new).map(i => i.id)
    if (newIds.length > 0) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE inmuebles_busqueda SET is_new = false
        WHERE id = ANY(${newIds}::uuid[])
      `)
    }

    const config = await prisma.$queryRaw<{ key: string; value: string }[]>(Prisma.sql`
      SELECT key, value FROM inversion_config
    `)
    const ultima_fecha = config.find(c => c.key === 'ultima_fecha_email')?.value || null

    return NextResponse.json({ inmuebles, ultima_fecha, total, limit, offset })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const deny = await requireAuth(); if (deny) return deny

  const body = await req.json()
  const { id, estado, notas } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  try {
    if (estado !== undefined && notas !== undefined) {
      await prisma.$executeRaw(Prisma.sql`UPDATE inmuebles_busqueda SET estado=${estado}, notas=${notas} WHERE id=${id}::uuid`)
    } else if (estado !== undefined) {
      await prisma.$executeRaw(Prisma.sql`UPDATE inmuebles_busqueda SET estado=${estado} WHERE id=${id}::uuid`)
    } else if (notas !== undefined) {
      await prisma.$executeRaw(Prisma.sql`UPDATE inmuebles_busqueda SET notas=${notas} WHERE id=${id}::uuid`)
    } else {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const deny = await requireAuth(); if (deny) return deny

  const body = await req.json()
  if (body.action !== 'bulk_insert') return NextResponse.json({ error: 'unknown action' }, { status: 400 })

  const { propiedades, ultima_fecha } = body
  if (!Array.isArray(propiedades)) return NextResponse.json({ error: 'propiedades must be array' }, { status: 400 })

  try {
    const r = await insertarPropiedades(propiedades, ultima_fecha)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const deny = await requireAuth(); if (deny) return deny

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  try {
    await prisma.$executeRaw(Prisma.sql`DELETE FROM inmuebles_busqueda WHERE id=${id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
