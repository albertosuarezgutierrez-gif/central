import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { productividadCartera } from '@/lib/acuerdos-productividad'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/companias/productividad?anio=YYYY — producción por compañía
 * (recibos de CIMA de cartera viva, por fecha de efecto) y estado de cada
 * objetivo de los acuerdos (fase 2, 06/10/2026). Solo lectura. Spec §3:
 * docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
 *
 * Un objetivo sin clave, sin cotejar o con datos incompletos sale «pendiente»
 * con su motivo — nunca alcanzado por defecto.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) {
      console.error('[cartera] operador/companias/productividad → sin_correduria · la BD responde y `corredurias` está vacía')
      return NextResponse.json({ estado: 'error', causa: 'sin_correduria' })
    }
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
    const param = Number(new URL(req.url).searchParams.get('anio'))
    const anio = Number.isInteger(param) && param >= 2000 && param <= 2100 ? param : Number(hoy.slice(0, 4))
    return NextResponse.json(await productividadCartera(correduria.id, anio, hoy))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias/productividad', e) })
  }
}
