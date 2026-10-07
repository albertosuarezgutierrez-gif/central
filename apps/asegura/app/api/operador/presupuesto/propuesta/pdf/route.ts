import { NextResponse } from 'next/server'

import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { MENSAJE_SIN_TABLA_PROPUESTA, esSinTablaPropuesta, leerPropuesta } from '@/lib/propuesta-escenarios'
import { nombreFicheroPropuesta, pdfPropuestaEscenarios } from '@/lib/propuesta-escenarios-pdf'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/operador/presupuesto/propuesta/pdf?id= — la propuesta de escenarios en PDF (solo lectura, gratis).
 * Se puede re-descargar cuantas veces haga falta: se arma cada vez desde los presupuestos. Aquí no sale nada a nadie.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const v = await leerPropuesta(correduria.id, id)
    if (!v) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    const bytes = await pdfPropuestaEscenarios(v)
    return new Response(Buffer.from(bytes), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${nombreFicheroPropuesta(v)}"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (e) {
    if (esSinTablaPropuesta(e)) return NextResponse.json({ estado: 'error', motivo: 'sin_tabla', detalle: MENSAJE_SIN_TABLA_PROPUESTA }, { status: 503 })
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto/propuesta/pdf', e) }, { status: 500 })
  }
}
