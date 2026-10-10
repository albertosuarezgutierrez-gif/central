import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { ejecutarRenovacionesTarificador } from '@/lib/tarificador-ops'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/tarificador-renovaciones — renovaciones de COMUNIDADES por el bot de Allianz (07/10/2026).
 * Tres pasadas en días laborables (`vercel.json`); cada una encola COMO MUCHO una cotización.
 *
 * Cerrojos: `CRON_SECRET` por Bearer (`isCronAuthorized`, vía `requireSecret`) ·
 * `TARIFICADOR_RENOVACIONES_ACTIVO=1` (apagado por defecto: no hace nada) · `TARIFICADOR_RPA_ACTIVO=1`
 * (si no, solo cuenta) · tope diario `TARIFICADOR_RENOVACIONES_MAX_DIA` (3 por defecto, techo 10) ·
 * y los de `encolarTrabajo` (integración `rpa_autorizada`). Allianz no está avisada del acceso
 * automatizado: volumen bajo y espaciado. Solo se encola con un riesgo COMPLETO ya cotizado; lo demás
 * sale como «faltan datos». TARIFICAR ≠ EMITIR. No envía nada a nadie.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const r = await ejecutarRenovacionesTarificador()
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/tarificador-renovaciones', e) }, { status: 503 })
  }
}
