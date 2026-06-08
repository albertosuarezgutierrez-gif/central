import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// Marca de la empresa (white-label). Scope SIEMPRE por empresa_id de la sesión.
const HEX = /^#[0-9a-fA-F]{3,8}$/

export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT nombre, marca_nombre, logo_url, color_primario, color_secundario, color_light
      FROM empresas WHERE id = ${empresa_id}::uuid LIMIT 1
    `)
    return NextResponse.json({ branding: rows[0] || null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const b = await req.json()

    // marca_nombre (texto corto; '' o null = volver al nombre por defecto)
    if ('marca_nombre' in b) {
      const v = b.marca_nombre ? String(b.marca_nombre).trim().slice(0, 60) : null
      await prisma.$executeRaw(Prisma.sql`UPDATE empresas SET marca_nombre = ${v} WHERE id = ${empresa_id}::uuid`)
    }
    // logo_url (URL pública; null = sin logo)
    if ('logo_url' in b) {
      const v = b.logo_url ? String(b.logo_url).trim().slice(0, 500) : null
      await prisma.$executeRaw(Prisma.sql`UPDATE empresas SET logo_url = ${v} WHERE id = ${empresa_id}::uuid`)
    }
    // colores (validar hex; ignorar si no es válido)
    for (const col of ['color_primario', 'color_secundario', 'color_light'] as const) {
      if (col in b) {
        const v = String(b[col] || '').trim()
        if (!HEX.test(v)) return NextResponse.json({ error: `Color inválido en ${col}` }, { status: 400 })
        if (col === 'color_primario')   await prisma.$executeRaw(Prisma.sql`UPDATE empresas SET color_primario = ${v} WHERE id = ${empresa_id}::uuid`)
        if (col === 'color_secundario') await prisma.$executeRaw(Prisma.sql`UPDATE empresas SET color_secundario = ${v} WHERE id = ${empresa_id}::uuid`)
        if (col === 'color_light')      await prisma.$executeRaw(Prisma.sql`UPDATE empresas SET color_light = ${v} WHERE id = ${empresa_id}::uuid`)
      }
    }

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT nombre, marca_nombre, logo_url, color_primario, color_secundario, color_light
      FROM empresas WHERE id = ${empresa_id}::uuid LIMIT 1
    `)
    return NextResponse.json({ ok: true, branding: rows[0] || null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
