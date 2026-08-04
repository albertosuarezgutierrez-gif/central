// Subastas que Alberto marca como interesantes. Guarda un snapshot para que la
// ficha sobreviva a la poda del corpus.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireEmpresaId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

const ESTADOS = ['interesado', 'analizando', 'pujando', 'descartada', 'adjudicada', 'perdida']

async function cuenta(): Promise<string | null> {
  try {
    return await requireEmpresaId()
  } catch {
    return null
  }
}

export async function GET() {
  const cuentaId = await cuenta()
  if (!cuentaId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const seguidas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, dedupe_key, subasta, estado, notas, puja_maxima, fecha_fin, creado_en
    FROM subastas_seguidas WHERE cuenta_id = ${cuentaId}::uuid
    ORDER BY fecha_fin ASC NULLS LAST
  `)
  return NextResponse.json({ seguidas })
}

export async function POST(req: NextRequest) {
  const cuentaId = await cuenta()
  if (!cuentaId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { dedupe_key, subasta } = await req.json()
  if (!dedupe_key || !subasta) return NextResponse.json({ error: 'dedupe_key y subasta requeridos' }, { status: 400 })

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO subastas_seguidas (cuenta_id, dedupe_key, subasta, fecha_fin)
    VALUES (${cuentaId}::uuid, ${dedupe_key}, ${JSON.stringify(subasta)}::jsonb, ${subasta.fechaFin ?? null}::timestamptz)
    ON CONFLICT (cuenta_id, dedupe_key) DO UPDATE SET
      subasta = EXCLUDED.subasta, fecha_fin = EXCLUDED.fecha_fin, actualizado_en = now()
  `)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const cuentaId = await cuenta()
  if (!cuentaId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { dedupe_key, estado, notas, puja_maxima } = await req.json()
  if (!dedupe_key) return NextResponse.json({ error: 'dedupe_key requerido' }, { status: 400 })
  if (estado && !ESTADOS.includes(estado)) return NextResponse.json({ error: 'estado inválido' }, { status: 400 })

  await prisma.$executeRaw(Prisma.sql`
    UPDATE subastas_seguidas SET
      estado = COALESCE(${estado ?? null}, estado),
      notas = COALESCE(${notas ?? null}, notas),
      puja_maxima = COALESCE(${puja_maxima ?? null}, puja_maxima),
      actualizado_en = now()
    WHERE cuenta_id = ${cuentaId}::uuid AND dedupe_key = ${dedupe_key}
  `)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const cuentaId = await cuenta()
  if (!cuentaId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const key = new URL(req.url).searchParams.get('dedupe_key')
  if (!key) return NextResponse.json({ error: 'dedupe_key requerido' }, { status: 400 })

  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM subastas_seguidas WHERE cuenta_id = ${cuentaId}::uuid AND dedupe_key = ${key}
  `)
  return NextResponse.json({ ok: true })
}
