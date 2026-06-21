import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { rateLimitHit, clientIp } from '@/lib/rate-limit-db'

const APP_URL = process.env.NEXTAUTH_URL || 'https://app.ialimp.es'

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Endpoint público de leads' })
}

export async function POST(req: Request) {
  try {
    // Ruta pública (exenta en middleware): rate-limit por IP contra spam de CRM.
    const rl = await rateLimitHit('leads:' + clientIp(req), 10, 60)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Demasiados envíos, inténtalo más tarde' }, { status: 429 })
    }

    const body = await req.json()
    const { empresa_id, nombre, telefono, email, zona, tipo_servicio, m2, frecuencia, precio_estimado } = body

    if (!nombre?.trim()) {
      return NextResponse.json({ error: 'Nombre obligatorio' }, { status: 400 })
    }

    const emp_val = empresa_id ? Prisma.sql`${empresa_id}::uuid` : Prisma.sql`NULL`

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO leads (empresa_id, nombre, telefono, email, zona, tipo_servicio, m2, frecuencia, precio_estimado, origen)
      SELECT
        ${emp_val} AS empresa_id,
        ${nombre.trim()} AS nombre,
        ${telefono || null} AS telefono,
        ${email    || null} AS email,
        ${zona     || null} AS zona,
        ${tipo_servicio || null} AS tipo_servicio,
        ${m2  ? Number(m2)  : null} AS m2,
        ${frecuencia || null} AS frecuencia,
        ${precio_estimado ? Number(precio_estimado) : null} AS precio_estimado,
        'cotizador' AS origen
      RETURNING id
    `)

    const lead_id = result[0]?.id

    // Disparar agente-cotizador en background si hay empresa_id y precio
    if (empresa_id && lead_id && precio_estimado) {
      fetch(APP_URL + '/api/admin/ia/agente-cotizador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id, empresa_id })
      }).catch(() => { /* agente no crítico */ })
    }

    return NextResponse.json({ ok: true, id: lead_id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
