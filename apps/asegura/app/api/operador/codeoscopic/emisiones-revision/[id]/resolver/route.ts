import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { prismaAsegura } from '@/lib/asegura-db'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR } from '@/lib/actor'
import { decidirResolucion, limpiarNota, quienResuelve } from '@/lib/codeoscopic/emisiones-revision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * «Marcar revisada» (03/10/2026): cierra una fila de la cola de revisión. `POST { nota? }`.
 * Idempotente: si ya estaba cerrada, 200 `ya_resuelta` sin pisar quién ni cuándo la cerró.
 * No escribe en la cartera: solo apunta que una persona la miró (el descubrimiento no volverá a
 * encolar ese proyecto). `resuelta_por` sale de `x-actor` (nunca «descubrimiento», reservado).
 */
export const POST = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ estado: 'error', mensaje: 'id no válido' }, { status: 400 })
  }
  try {
    const correduria = await correduriaUnica().catch(() => null)
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const nota = limpiarNota(cuerpo?.nota)
    const por = quienResuelve(req.headers.get(CABECERA_ACTOR))
    const db = prismaAsegura()
    const actualizadas = await db.$executeRaw`
      update codeoscopic_emisiones_revision
      set resuelta_at = now(), resuelta_por = ${por},
          detalle = case when ${nota}::text is null then detalle
                         else concat_ws(' · ', detalle, 'Nota: ' || ${nota}::text) end
      where id = ${id}::uuid and correduria_id = ${correduria.id}::uuid and resuelta_at is null`
    let existe = actualizadas > 0
    if (!existe) {
      const [f] = await db.$queryRaw<{ id: string }[]>`
        select id::text as id from codeoscopic_emisiones_revision
        where id = ${id}::uuid and correduria_id = ${correduria.id}::uuid`
      existe = !!f
    }
    const r = decidirResolucion(id, actualizadas, existe)
    return NextResponse.json(r, { status: r.status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', mensaje: registrarErrorCartera('operador/codeoscopic/emisiones-revision/resolver', e) }, { status: 500 })
  }
})
