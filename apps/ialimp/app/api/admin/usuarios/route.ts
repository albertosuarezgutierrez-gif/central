import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Verifica que el PIN no esté en uso en la misma empresa (excluyendo el id dado)
async function pinDuplicado(empresa_id: string, pinHash: string, excludeId?: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM limpiadoras
    WHERE empresa_id = ${empresa_id}::uuid
      AND pin_hash = ${pinHash}
      ${excludeId ? Prisma.sql`AND id != ${excludeId}::uuid` : Prisma.sql``}
    LIMIT 1
  `)
  return rows.length > 0
}

export async function GET() {
  const empresa_id = await requireEmpresaId()
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre, telefono, activa, propiedades, color, created_at
    FROM limpiadoras
    WHERE empresa_id = ${empresa_id}::uuid
    ORDER BY nombre
  `)
  return NextResponse.json({ limpiadoras: rows })
}

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { nombre, pin, telefono, propiedades, color } = await req.json()

    if (!pin || pin.length < 4) {
      return NextResponse.json({ error: 'El PIN debe tener al menos 4 dígitos' }, { status: 400 })
    }

    const pinHash = await hashPin(pin)

    if (await pinDuplicado(empresa_id, pinHash)) {
      return NextResponse.json({ error: `El PIN ${pin} ya está en uso por otra limpiadora. Elige uno diferente.` }, { status: 409 })
    }

    await prisma.$queryRaw(Prisma.sql`
      INSERT INTO limpiadoras (empresa_id, nombre, pin_hash, telefono, propiedades, color)
      VALUES (${empresa_id}::uuid, ${nombre}, ${pinHash}, ${telefono || null}, ${propiedades || []}::text[], ${color || '#4f46e5'})
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id, activa, pin, nombre, propiedades, color } = await req.json()

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    if (pin) {
      if (pin.length < 4) {
        return NextResponse.json({ error: 'El PIN debe tener al menos 4 dígitos' }, { status: 400 })
      }
      const pinHash = await hashPin(pin)
      if (await pinDuplicado(empresa_id, pinHash, id)) {
        return NextResponse.json({ error: `El PIN ${pin} ya está en uso por otra limpiadora. Elige uno diferente.` }, { status: 409 })
      }
      await prisma.$executeRaw(Prisma.sql`
        UPDATE limpiadoras SET pin_hash = ${pinHash} WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
    }

    if (activa !== undefined) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE limpiadoras SET activa = ${activa} WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
    }
    if (nombre) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE limpiadoras SET nombre = ${nombre} WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
    }
    if (propiedades) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE limpiadoras SET propiedades = ${propiedades}::text[] WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
    }
    if (color) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE limpiadoras SET color = ${color} WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
