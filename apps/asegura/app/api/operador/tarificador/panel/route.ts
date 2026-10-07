import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { leerPanelTarificador } from '@/lib/tarificador-ops'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/tarificador/panel` — salud del tarificador RPA para `/correduria/tarificador` de
 * plataforma: éxito 7/30 días, tiempo medio, fallos por paso/mensaje, intervenciones de la IA (y su coste
 * estimado si consta), renovaciones de comunidades (cotizadas / en cola / faltan datos) con prima actual
 * vs Allianz, y alertas de cambio de tarifa (mismo riesgo normalizado, prima anual > 1 % o > 5 €).
 * Bearer de operador; filtrado por correduría; solo lectura (no depende de `TARIFICADOR_RPA_ACTIVO`).
 * Nunca salen el riesgo, la URL del portal, el HTML ni la captura.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await leerPanelTarificador(correduria.id)
    return NextResponse.json(r, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/panel', e) }, { status: 503 })
  }
}
