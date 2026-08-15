import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verifySessionToken } from '@/lib/auth'
import { registrarActividad, type ActorTipo } from '@/lib/actividad'

// Receptor de la actividad que emite el middleware (fire-and-forget con
// Bearer CRON_SECRET — por eso pasa el gate del middleware sin cookie).
// Resuelve la identidad del actor a partir del actor ya decodificado (admin)
// o de los tokens de cookie (limpiadora/propietario) y la persiste en
// registro_actividad. Best-effort de punta a punta.

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const b = await req.json().catch(() => null)
  if (!b?.ruta || !b?.metodo) return NextResponse.json({ ok: false })

  let actor: { tipo: ActorTipo; id: string | null; empresa_id: string | null; nombre: string | null } | null =
    b.actor || null

  try {
    if (!actor && b.limpiadora_token) {
      const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT l.id, l.nombre, l.empresa_id
        FROM limpiadora_sessions s JOIN limpiadoras l ON l.id = s.limpiadora_id
        WHERE s.token = ${b.limpiadora_token} AND s.expires_at > now()
        LIMIT 1
      `)
      if (rows[0]) actor = { tipo: 'limpiadora', id: rows[0].id, empresa_id: rows[0].empresa_id, nombre: rows[0].nombre }
    }
    if (!actor && b.prop_token) {
      const p = await verifySessionToken(b.prop_token) as any
      if (p?.type === 'propietario' && p.cliente_id) {
        actor = { tipo: 'propietario', id: p.cliente_id, empresa_id: p.empresa_id || null, nombre: p.email || null }
      }
    }
  } catch {
    // sin identidad no se registra
  }
  if (!actor) return NextResponse.json({ ok: false })

  await registrarActividad({
    empresa_id: actor.empresa_id, actor_tipo: actor.tipo, actor_id: actor.id, actor_nombre: actor.nombre,
    accion: b.metodo === 'GET' ? 'pagina' : 'accion', metodo: b.metodo, ruta: b.ruta,
    ip: b.ip || null, user_agent: b.user_agent || null,
  })

  // Retención: purga ocasional (~1 de cada 200 escrituras) de filas > 90 días.
  if (Math.random() < 0.005) {
    try {
      await prisma.$executeRaw(Prisma.sql`DELETE FROM registro_actividad WHERE created_at < now() - interval '90 days'`)
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true })
}
