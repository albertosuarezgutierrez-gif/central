import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST — confirmación MANUAL del importe liquidado de un periodo.
//
// Es el camino de Mapfre: manda la liquidación en un PDF cifrado tras un enlace
// que caduca a los 90 días, así que el agente avisa y Alberto teclea el importe.
// Queda marcado `liq_origen='manual'` con su fecha: el libro nunca mezcla en
// silencio lo tecleado con lo que viene de CIMA.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as {
    companiaCodigo?: string
    compania?: string
    inicio?: string
    fin?: string
    bruto?: number
    retencion?: number
    remesa?: number
  } | null

  const fechaOk = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!body?.companiaCodigo || !fechaOk(body.inicio) || !fechaOk(body.fin) || typeof body.bruto !== 'number') {
    return NextResponse.json({ error: 'Faltan datos: companiaCodigo, inicio, fin y bruto' }, { status: 400 })
  }
  if (!Number.isFinite(body.bruto)) {
    return NextResponse.json({ error: 'Importe no válido' }, { status: 400 })
  }

  const retencion = typeof body.retencion === 'number' && Number.isFinite(body.retencion) ? body.retencion : null
  // Si no se teclea la remesa, se DERIVA de bruto − retención (la aritmética del
  // extracto). Sin retención no se deriva nada: se deja NULL, que es «no se sabe».
  const remesa =
    typeof body.remesa === 'number' && Number.isFinite(body.remesa)
      ? body.remesa
      : retencion != null
        ? Math.round((body.bruto - retencion) * 100) / 100
        : null

  await prisma.$executeRaw`
    INSERT INTO comisiones_devengo
      (cuenta_id, compania_codigo, compania, periodo_inicio, periodo_fin,
       liq_bruto, liq_retencion, liq_remesa, liq_origen, liq_confirmado_at, leido_ok, actualizado_at)
    VALUES (${session.id}::uuid, ${body.companiaCodigo}, ${body.compania ?? body.companiaCodigo},
            ${body.inicio}::date, ${body.fin}::date,
            ${body.bruto}, ${retencion}, ${remesa}, 'manual', now(), true, now())
    ON CONFLICT (cuenta_id, compania_codigo, periodo_inicio, periodo_fin) DO UPDATE SET
      liq_bruto = EXCLUDED.liq_bruto,
      liq_retencion = EXCLUDED.liq_retencion,
      liq_remesa = EXCLUDED.liq_remesa,
      liq_origen = 'manual',
      liq_confirmado_at = now(),
      leido_ok = true,
      actualizado_at = now()`

  return NextResponse.json({ ok: true })
}
