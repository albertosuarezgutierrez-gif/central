import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { prisma } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/codeoscopic/faltan-producto — telemetría (20/09/2026) de
 * cuántas veces el ReRate ha rechazado por un hueco de `product.options` (el
 * caso que resuelve el Product Form Library, ver `oferta/route.ts`),
 * desglosado por COMPAÑÍA. Sirve para decidir a qué compañía le falta
 * cobertura de verdad, en vez de suponerlo por la última vez que se vio.
 *
 * Lee `seguros.operational_events` (genérica, ya la usa la ingesta de CIMA y
 * el webhook de Codeoscopic) — **gratis**, no llama al vendor.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })

    const filas = await prisma.$queryRaw<{ compania: string | null; veces: bigint; ultima: Date }[]>`
      select coalesce(payload->>'compania', '(sin identificar)') as compania,
             count(*) as veces,
             max(occurred_at) as ultima
      from operational_events
      where event_name = 'codeoscopic_oferta_faltan_producto'
        and correduria_id = ${correduria.id}::uuid
      group by 1
      order by veces desc
    `
    return NextResponse.json({
      estado: 'ok',
      companias: filas.map((f) => ({ compania: f.compania, veces: Number(f.veces), ultima: f.ultima })),
    })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', motivo: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
