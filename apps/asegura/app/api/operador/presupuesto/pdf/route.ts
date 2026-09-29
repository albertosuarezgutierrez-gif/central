import { NextResponse } from 'next/server'

import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { datosPdfPresupuesto } from '@/lib/presupuesto-pdf-datos'
import { nombreFicheroPresupuesto, pdfPresupuesto } from '@/lib/presupuesto-pdf'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/operador/presupuesto/pdf?id= — el presupuesto en PDF (solo lectura, gratis).
 * Lo descarga Alberto desde la ficha del cliente para mandarlo él; aquí no sale nada a nadie.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })

  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const datos = await datosPdfPresupuesto(correduria.id, id)
    if (!datos) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    const bytes = await pdfPresupuesto(datos)
    return new Response(Buffer.from(bytes), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${nombreFicheroPresupuesto(datos)}"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto/pdf', e) }, { status: 500 })
  }
}
