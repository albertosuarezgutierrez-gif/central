import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  // Solo campos conocidos; config se fusiona sobre la existente (jsonb ||).
  const { nombre, piso, smoobuApartmentId, config, activo } = body as {
    nombre?: string; piso?: string; smoobuApartmentId?: number | null;
    config?: Record<string, unknown>; activo?: boolean;
  }
  const configJson = config ? JSON.stringify(config) : null
  await prisma.$executeRaw`
    UPDATE domotica_dispositivos SET
      nombre = COALESCE(${nombre ?? null}, nombre),
      piso = COALESCE(${piso ?? null}, piso),
      smoobu_apartment_id = COALESCE(${smoobuApartmentId ?? null}::integer, smoobu_apartment_id),
      config = CASE WHEN ${configJson}::jsonb IS NULL THEN config ELSE config || ${configJson}::jsonb END,
      activo = COALESCE(${activo ?? null}::boolean, activo)
    WHERE id = ${id}::uuid`
  return NextResponse.json({ ok: true })
}
