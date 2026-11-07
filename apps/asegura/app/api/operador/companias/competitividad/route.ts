import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { competitividadCartera } from '@/lib/competitividad-companias'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/companias/competitividad?anio=YYYY — competitividad de PRECIO por compañía, ramo, nivel de cobertura
 * y año natural, sobre todas las tarificaciones guardadas (Avant2 y bots) (07/11/2026). Solo lectura, sin datos personales.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) {
      console.error('[cartera] operador/companias/competitividad → sin_correduria · la BD responde y `corredurias` está vacía')
      return NextResponse.json({ estado: 'error', causa: 'sin_correduria' })
    }
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
    const param = Number(new URL(req.url).searchParams.get('anio'))
    const actual = Number(hoy.slice(0, 4))
    const anio = Number.isInteger(param) && param >= 2000 && param <= actual ? param : actual
    return NextResponse.json(await competitividadCartera(correduria.id, anio, hoy))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias/competitividad', e) })
  }
}
