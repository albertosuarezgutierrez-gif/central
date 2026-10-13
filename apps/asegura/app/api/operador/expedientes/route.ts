import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { expedientesDeTrabajo } from '@/lib/expedientes'

export const dynamic = 'force-dynamic'

/**
 * GET — «Mis expedientes» (13/10/2026): las oportunidades de trabajo de Alberto en TODOS los clientes
 * (abiertas, esperando al cliente y aparcadas con su vuelta), con clase, estado visible, próxima
 * acción, prima, notas y, si es rescate, su recibo y su plazo. Excluye el volcado del CRM anterior sin
 * tocar. Respuesta:
 *   { estado:'ok', hoy, expedientes:[…], recuento:{abierta,esperando_cliente,aparcada}, truncado, descartadas }
 * Lista vacía con `ok` = no hay; `sin_configurar`/`error` = no se ha podido mirar (nunca «0 abiertas»).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await expedientesDeTrabajo(correduria.id)
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/expedientes', e) }, { status: 500 })
  }
}
