import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { duplicadasCartera } from '@/lib/cartera-historial'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/duplicados — pólizas vivas con el mismo número en la misma
 * compañía. Es el guardián de la conciliación Codeoscopic↔CIMA (visión del
 * CRM §5): un grupo `emitidaYCima` es una emitida por nosotros que CIMA trajo
 * sin casar. `grupos: []` solo se emite si la consulta fue bien.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const grupos = await duplicadasCartera(correduria.id)
    if (grupos === null) return NextResponse.json({ estado: 'error', motivo: 'no se pudo leer la tabla de pólizas' })
    return NextResponse.json({ estado: 'ok', grupos })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/duplicados', e) })
  }
}
