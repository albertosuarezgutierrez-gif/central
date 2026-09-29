import { NextResponse } from 'next/server'

import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { garantiasFiltradas } from '@/lib/garantias-filtradas-servicio'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/presupuesto/garantias-filtradas — qué garantías marcan los clientes en el filtro
 * del portal (últimos 90 días, presupuestos distintos, por ramo). Un fallo de lectura es
 * `{estado:'error'}`, nunca `ramos: []`: «nadie filtra nada» sobre datos no leídos sería falso.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    return NextResponse.json({ estado: 'ok', ...(await garantiasFiltradas(correduria.id)) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto/garantias-filtradas', e) })
  }
}
