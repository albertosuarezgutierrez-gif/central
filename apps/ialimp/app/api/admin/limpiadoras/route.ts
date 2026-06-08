import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// GET — listar limpiadoras de la empresa
export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()
    const limpiadoras = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, nombre, telefono, color, activa
      FROM limpiadoras
      WHERE empresa_id = ${empresa_id}::uuid
      ORDER BY activa DESC, nombre
    `)
    return NextResponse.json({ limpiadoras })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — crear limpiadora
export async function POST(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { nombre, telefono, pin, color } = await req.json()

    if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
    if (!pin || pin.length < 4) return NextResponse.json({ error: 'PIN mínimo 4 dígitos' }, { status: 400 })

    const pinHash = await hashPin(pin)

    // Verificar PIN único en la empresa
    const existe = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id FROM limpiadoras
      WHERE empresa_id = ${empresa_id}::uuid AND pin_hash = ${pinHash}
      LIMIT 1
    `)
    if (existe.length > 0) return NextResponse.json({ error: 'PIN ya en uso en esta empresa' }, { status: 400 })

    const [nueva] = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO limpiadoras (empresa_id, nombre, telefono, pin_hash, color, activa)
      VALUES (${empresa_id}::uuid, ${nombre.trim()}, ${telefono || null}, ${pinHash}, ${color || '#6366f1'}, true)
      RETURNING id::text, nombre, telefono, color, activa
    `)

    return NextResponse.json({ ok: true, limpiadora: nueva })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — editar (nombre, telefono, color, activa, pin)
export async function PATCH(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id, nombre, telefono, color, activa, pin } = await req.json()

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    if (pin) {
      if (pin.length < 4) return NextResponse.json({ error: 'PIN mínimo 4 dígitos' }, { status: 400 })
      const pinHash = await hashPin(pin)
      const existe = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM limpiadoras
        WHERE empresa_id = ${empresa_id}::uuid AND pin_hash = ${pinHash} AND id != ${id}::uuid
        LIMIT 1
      `)
      if (existe.length > 0) return NextResponse.json({ error: 'PIN ya en uso' }, { status: 400 })
      await prisma.$executeRaw(Prisma.sql`
        UPDATE limpiadoras SET pin_hash = ${pinHash}
        WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
    }

    await prisma.$executeRaw(Prisma.sql`
      UPDATE limpiadoras
      SET nombre   = COALESCE(${nombre   ?? null}, nombre),
          telefono = COALESCE(${telefono ?? null}, telefono),
          color    = COALESCE(${color    ?? null}, color),
          activa   = COALESCE(${activa   ?? null}, activa)
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)

    // Al desactivar, cortar sus sesiones abiertas al instante (scope empresa).
    if (activa === false) {
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM limpiadora_sessions WHERE limpiadora_id = ${id}::uuid
          AND limpiadora_id IN (SELECT id FROM limpiadoras WHERE empresa_id = ${empresa_id}::uuid)
      `)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
