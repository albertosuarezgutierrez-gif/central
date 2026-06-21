import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { syncPropertyIcal } from '@/lib/ical-sync'

// El propietario gestiona el/los enlace(s) iCal (Booking/Airbnb/VRBO…) de SUS
// propiedades desde el portal. Ruta pública por token (exenta en middleware),
// siempre con scope cliente_id + empresa_id.

async function clienteFromToken(token: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, empresa_id::text, nombre
    FROM clientes WHERE access_token = ${token} LIMIT 1
  `)
  return rows[0] || null
}

// GET — propiedades del propietario con sus iCal configurados
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const cliente = await clienteFromToken(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 404 })

    const propiedades = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, nombre, direccion, COALESCE(ical_urls, '{}')::text[] AS ical_urls
      FROM propiedades
      WHERE cliente_id = ${cliente.id}::uuid AND activa = true
      ORDER BY nombre ASC
    `)
    return NextResponse.json({ propiedades })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT — guardar los iCal de UNA propiedad y probar la sincronización al momento
export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const cliente = await clienteFromToken(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 404 })

    const body = await req.json()
    const propiedad_id = body.propiedad_id
    if (!propiedad_id) return NextResponse.json({ error: 'Falta la propiedad' }, { status: 400 })

    // Limpiar: sólo URLs http(s) no vacías
    const urls: string[] = Array.isArray(body.ical_urls)
      ? body.ical_urls.map((u: any) => String(u || '').trim()).filter((u: string) => /^https?:\/\//i.test(u))
      : []

    // La propiedad debe pertenecer a este propietario (scope cliente + empresa)
    const propRows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, empresa_id::text, cliente_id::text, nombre,
             limpiadora_principal_id::text
      FROM propiedades
      WHERE id = ${propiedad_id}::uuid
        AND cliente_id = ${cliente.id}::uuid
        AND empresa_id = ${cliente.empresa_id}::uuid
        AND activa = true
      LIMIT 1
    `)
    if (!propRows.length) return NextResponse.json({ error: 'Propiedad no válida' }, { status: 403 })

    await prisma.$executeRaw(Prisma.sql`
      UPDATE propiedades SET ical_urls = ${urls}::text[]
      WHERE id = ${propiedad_id}::uuid AND cliente_id = ${cliente.id}::uuid
    `)

    // Probar ya mismo: descarga + parseo + alta de reservas (y aviso si hay urgentes hoy)
    const prop = { ...propRows[0], ical_urls: urls }
    const { synced, urgentes, errors } = await syncPropertyIcal(prop)

    return NextResponse.json({
      ok: errors.length === 0,
      ical_urls: urls,
      synced,
      urgentes,
      errors,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
