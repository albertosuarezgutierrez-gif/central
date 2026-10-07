import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { anotarCambio, auditado } from '@/lib/auditoria'
import { cotejarAcuerdo } from '@/lib/acuerdo-cotejo'

export const dynamic = 'force-dynamic'

/**
 * POST /api/operador/companias/acuerdo/cotejar `{ acuerdoId }` — «Coincide con el
 * PDF»: sella `acuerdos_compania.revisado_at` (fase 2, 06/10/2026).
 *
 * Rastro: `auditado()` deja la fila en `auditoria` (actor, ruta, `acuerdoId`) y el
 * cambio `acuerdo.revisado_at` con su valor (está en `CAMPOS_CON_VALOR`: es una
 * fecha de negocio, no un dato de persona). NO escribe en `historial_interno`:
 * esa tabla es el historial de una FICHA de cliente (`cliente_id NOT NULL`) y un
 * acuerdo con una compañía no es de ningún cliente.
 */
const HTTP: Record<string, number> = { cotejado: 200, ya_cotejado: 200, no_encontrado: 404, invalido: 400, sin_configurar: 503, error: 500 }

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const r = await cotejarAcuerdo(correduria.id, body?.acuerdoId)
    if (r.estado === 'cotejado') {
      anotarCambio({ entidad: 'acuerdo', id: String(body?.acuerdoId), campo: 'revisado_at', antes: null, despues: r.revisadoAt })
    }
    return NextResponse.json(r, { status: HTTP[r.estado] ?? 500 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias/acuerdo/cotejar', e) }, { status: 500 })
  }
})
