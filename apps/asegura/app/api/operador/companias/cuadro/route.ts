import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { cuadroCartera } from '@/lib/cuadro-companias'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/companias/cuadro?anio=YYYY — cuadro de mando por compañía y año natural
 * (cartera, producción y retención, siniestralidad informativa y comisión de recibos), con el
 * año anterior para comparar (07/11/2026). Solo lectura, sin datos personales.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) {
      console.error('[cartera] operador/companias/cuadro → sin_correduria · la BD responde y `corredurias` está vacía')
      return NextResponse.json({ estado: 'error', causa: 'sin_correduria' })
    }
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
    const param = Number(new URL(req.url).searchParams.get('anio'))
    const actual = Number(hoy.slice(0, 4))
    const anio = Number.isInteger(param) && param >= 2000 && param <= actual ? param : actual
    return NextResponse.json(await cuadroCartera(correduria.id, anio, hoy))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias/cuadro', e) })
  }
}
