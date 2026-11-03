import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { reabrirCierre } from '@/lib/cierre-mes-db'

export const dynamic = 'force-dynamic'

// POST /api/cierres-mes/reabrir — reapertura EXPLÍCITA de un mes cerrado de una unidad, con motivo.
// Mientras está `cerrado`, los endpoints de gastos de esa unidad y mes devuelven 409 (lib/cierre-mes-db.ts).
// Tras reabrir queda `reabierto` (con motivo, quién y cuándo) y se puede volver a cerrar con el botón del cron.
const Cuerpo = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  unidad: z.string().regex(/^(prop_[a-z0-9_]+|negocio:[A-Za-z0-9_-]+)$/),
  motivo: z.string().trim().min(5).max(500),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const p = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Datos inválidos: mes AAAA-MM, unidad y motivo (≥5 caracteres)' }, { status: 400 })

  const r = await reabrirCierre(session.id, p.data.mes, p.data.unidad, p.data.motivo, session.email ?? session.id)
  if (r === 'no_existe') return NextResponse.json({ error: 'Ese mes no tiene cierre para esa unidad' }, { status: 404 })
  if (r === 'no_cerrado') return NextResponse.json({ error: 'Ese mes no está cerrado' }, { status: 409 })
  return NextResponse.json({ ok: true, estado: 'reabierto' })
}
