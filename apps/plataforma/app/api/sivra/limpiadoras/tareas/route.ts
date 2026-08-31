import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { PROPS_CALENDARIO_IDS } from '@/lib/sivra/constantes'

export const dynamic = 'force-dynamic'

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

// CRUD de tareas sueltas de limpieza (pestaña «Tareas» del panel de Alberto).
// La limpieza NO usa estas rutas: solo lista/marca desde /api/sivra/limpieza-intranet/*.

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const from = RE_FECHA.test(sp.get('from') || '') ? sp.get('from')! : new Date().toISOString().slice(0, 10)
  const to = RE_FECHA.test(sp.get('to') || '') ? sp.get('to')!
    : new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)

  const tareas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, fecha, property_id, texto, hecha, hecha_at, creado_at
    FROM limpieza_tareas
    WHERE fecha BETWEEN ${from}::date AND ${to}::date
    ORDER BY fecha ASC, creado_at ASC
  `)
  return NextResponse.json({ tareas })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { fecha, property_id, texto } = await req.json().catch(() => ({}))
  if (!RE_FECHA.test(fecha || '') || typeof texto !== 'string' || !texto.trim()) {
    return NextResponse.json({ error: 'Falta fecha o texto' }, { status: 400 })
  }
  const prop = property_id && PROPS_CALENDARIO_IDS.includes(property_id) ? property_id : null

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO limpieza_tareas (fecha, property_id, texto)
    VALUES (${fecha}::date, ${prop}, ${texto.trim()})
    RETURNING id, fecha, property_id, texto, hecha
  `)
  return NextResponse.json({ tarea: rows[0] })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, fecha, property_id, texto, hecha } = await req.json().catch(() => ({}))
  if (typeof id !== 'string') return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  if (RE_FECHA.test(fecha || ''))
    await prisma.$executeRaw(Prisma.sql`UPDATE limpieza_tareas SET fecha = ${fecha}::date WHERE id = ${id}::uuid`)
  if (property_id !== undefined) {
    const prop = property_id && PROPS_CALENDARIO_IDS.includes(property_id) ? property_id : null
    await prisma.$executeRaw(Prisma.sql`UPDATE limpieza_tareas SET property_id = ${prop} WHERE id = ${id}::uuid`)
  }
  if (typeof texto === 'string' && texto.trim())
    await prisma.$executeRaw(Prisma.sql`UPDATE limpieza_tareas SET texto = ${texto.trim()} WHERE id = ${id}::uuid`)
  if (typeof hecha === 'boolean')
    await prisma.$executeRaw(Prisma.sql`
      UPDATE limpieza_tareas SET hecha = ${hecha}, hecha_at = ${hecha ? new Date() : null}::timestamptz WHERE id = ${id}::uuid`)

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (typeof id !== 'string') return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  await prisma.$executeRaw(Prisma.sql`DELETE FROM limpieza_tareas WHERE id = ${id}::uuid`)
  return NextResponse.json({ ok: true })
}
