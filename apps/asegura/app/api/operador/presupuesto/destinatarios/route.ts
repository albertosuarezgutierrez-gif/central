import { NextResponse } from 'next/server'

import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { leerDestinatarios } from '@/lib/destinatarios-presupuesto'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/operador/presupuesto/destinatarios?clienteId=<tomador> (21/10/2026)
 *   → `{ estado:'ok', destinatarios, emails }`: a quién se le puede mandar un presupuesto de ese tomador por correo
 *     (`tomador` · `tomador_no_se_sabe` · `tomador_baja` · `contactos` · `nadie`), con los no elegibles y su motivo.
 * Solo LEE. Es lo que pinta la pantalla; el envío lo vuelve a calcular (`envio-presupuesto.ts`), así que esto no autoriza
 * nada por sí solo. `emails` solo trae el de los ELEGIBLES. 404 = el tomador no existe en esta correduría.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const clienteId = new URL(req.url).searchParams.get('clienteId')?.trim() ?? ''
  if (!UUID.test(clienteId)) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const r = await leerDestinatarios(correduria.id, clienteId)
    if (!r) return NextResponse.json({ estado: 'error', motivo: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto/destinatarios', e) }, { status: 502 })
  }
}
