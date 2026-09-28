import { NextResponse } from 'next/server'

import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { presupuestosEnSeguimiento } from '@/lib/presupuesto-seguimiento-servicio'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/presupuesto/seguimiento — los presupuestos ENVIADOS de los que toca avisar a
 * Alberto: `sin_abrir` (no consta que lo abriera en 48 h) o `sin_elegir` (lo abrió y en 72 h no ha
 * elegido), cada etapa UNA vez (lo avisado se apunta con PATCH `accion:'seguimiento_avisado'`), con
 * lo que el cliente ha mirado en el portal (`actividad`, `null` = no consta).
 *
 * 🚨 Un fallo de lectura es `{estado:'error', causa}`, NUNCA una lista vacía: «no hay nada que
 * seguir» sobre presupuestos que no se han podido leer es la afirmación que más cara sale.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const pendientes = await presupuestosEnSeguimiento(correduria.id)
    return NextResponse.json({ estado: 'ok', pendientes })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto/seguimiento', e) })
  }
}
