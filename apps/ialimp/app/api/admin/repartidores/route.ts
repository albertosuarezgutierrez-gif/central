import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { sha256Hex as hashPin } from '@central/core-identity'

export async function GET() {
  const empresa_id = await requireEmpresaId()
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, nombre, telefono, color, activo,
           LEFT(pin_hash,8) AS pin_hint
    FROM repartidores
    WHERE empresa_id = ${empresa_id}::uuid
    ORDER BY nombre
  `)
  return NextResponse.json({ repartidores: rows })
}

export async function POST(req: Request) {
  const empresa_id = await requireEmpresaId()
  const { nombre, telefono, pin, color } = await req.json()
  if (!nombre || !pin) return NextResponse.json({ error: 'Nombre y PIN obligatorios' }, { status: 400 })
  if (pin.length < 4) return NextResponse.json({ error: 'El PIN debe tener mínimo 4 dígitos' }, { status: 400 })

  const pinHash = await hashPin(pin)
  const row = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO repartidores (empresa_id, nombre, telefono, pin_hash, color)
    VALUES (${empresa_id}::uuid, ${nombre}, ${telefono||null}, ${pinHash}, ${color||'#16a34a'})
    RETURNING id::text, nombre, color, activo
  `)
  return NextResponse.json({ repartidor: row[0] }, { status: 201 })
}

export async function PATCH(req: Request) {
  const empresa_id = await requireEmpresaId()
  const { id, nombre, telefono, pin, color, activo } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const pinHash = pin ? await hashPin(pin) : null
  await prisma.$executeRaw(Prisma.sql`
    UPDATE repartidores SET
      nombre    = COALESCE(${nombre||null}, nombre),
      telefono  = COALESCE(${telefono||null}, telefono),
      pin_hash  = COALESCE(${pinHash}, pin_hash),
      color     = COALESCE(${color||null}, color),
      activo    = COALESCE(${activo??null}, activo),
      updated_at = now()
    WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const empresa_id = await requireEmpresaId()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  await prisma.$executeRaw(Prisma.sql`
    UPDATE repartidores SET activo = false, updated_at = now()
    WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ ok: true })
}
