import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarPolizaEmitida } from '@/lib/emision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/operador/poliza/emitida — acuña en la cartera una póliza YA EMITIDA
 * en Codeoscopic (spec 2026-09-02, D2). No emite nada ni gasta: registra.
 *
 *   { clienteId, proyecto: { projectIdCodeoscopic, producto, codigoDgs, numeroPoliza,
 *     primaAnual, emitidaEn, riesgo, fraccionamiento? }, actor }
 *
 * Cerrada tras `CODEOSCOPIC_EMISION_ACTIVA=true`: sin el flag responde 503
 * `emision_desactivada`. El flag solo se enciende cuando exista el envío real
 * (PR3) y su prueba de idempotencia; hasta entonces acuñar una «emitida» sería
 * inventar una póliza. Solo POST: no hay GET que un prefetch pueda disparar.
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (process.env.CODEOSCOPIC_EMISION_ACTIVA !== 'true') {
    return NextResponse.json({ estado: 'emision_desactivada', motivo: 'CODEOSCOPIC_EMISION_ACTIVA no está a true: no se acuñan pólizas emitidas.' }, { status: 503 })
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const proyecto = body?.proyecto as Record<string, unknown> | undefined
    if (!body || typeof body.clienteId !== 'string' || !proyecto || typeof proyecto !== 'object') {
      return NextResponse.json({ estado: 'invalido', motivo: 'faltan clienteId o proyecto' }, { status: 422 })
    }
    const r = await registrarPolizaEmitida(correduria.id, {
      clienteId: body.clienteId,
      actor: typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim().slice(0, 120) : 'plataforma',
      proyecto: {
        projectIdCodeoscopic: String(proyecto.projectIdCodeoscopic ?? ''),
        producto: String(proyecto.producto ?? ''),
        codigoDgs: String(proyecto.codigoDgs ?? ''),
        numeroPoliza: typeof proyecto.numeroPoliza === 'string' ? proyecto.numeroPoliza : null,
        primaAnual: typeof proyecto.primaAnual === 'number' ? proyecto.primaAnual : null,
        emitidaEn: typeof proyecto.emitidaEn === 'string' ? proyecto.emitidaEn : new Date().toISOString(),
        riesgo: typeof proyecto.riesgo === 'object' && proyecto.riesgo !== null && !Array.isArray(proyecto.riesgo) ? (proyecto.riesgo as Record<string, unknown>) : null,
        fraccionamiento: typeof proyecto.fraccionamiento === 'string' ? proyecto.fraccionamiento : null,
      },
    })
    if (!r.ok) {
      const { ok: _ok, status, ...resto } = r
      void _ok
      return NextResponse.json(resto, { status })
    }
    return NextResponse.json({ estado: 'ok', polizaId: r.polizaId, avisos: r.avisos }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/poliza/emitida', e) }, { status: 500 })
  }
}
