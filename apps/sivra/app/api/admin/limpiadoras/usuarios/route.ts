import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET() {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre, telefono, activa, propiedades, color, created_at FROM limpiadoras ORDER BY nombre
  `)
  return NextResponse.json({ limpiadoras: rows })
}

export async function POST(req: Request) {
  const { nombre, pin, telefono, propiedades, color } = await req.json()
  const pinHash = await hashPin(pin)
  await prisma.$queryRaw(Prisma.sql`
    INSERT INTO limpiadoras (nombre, pin_hash, telefono, propiedades, color)
    VALUES (${nombre}, ${pinHash}, ${telefono || null}, ${propiedades || []}::text[], ${color || '#1B4332'})
  `)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  const { id, activa, pin, nombre, propiedades } = await req.json()
  if (pin) {
    const pinHash = await hashPin(pin)
    await prisma.$queryRaw(Prisma.sql`UPDATE limpiadoras SET pin_hash = ${pinHash} WHERE id = ${id}::uuid`)
  }
  if (activa !== undefined) {
    await prisma.$queryRaw(Prisma.sql`UPDATE limpiadoras SET activa = ${activa} WHERE id = ${id}::uuid`)
  }
  if (nombre) {
    await prisma.$queryRaw(Prisma.sql`UPDATE limpiadoras SET nombre = ${nombre} WHERE id = ${id}::uuid`)
  }
  if (propiedades) {
    await prisma.$queryRaw(Prisma.sql`UPDATE limpiadoras SET propiedades = ${propiedades}::text[] WHERE id = ${id}::uuid`)
  }
  return NextResponse.json({ ok: true })
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}
