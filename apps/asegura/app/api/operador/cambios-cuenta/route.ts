import { NextResponse } from 'next/server'

import { auditado } from '@/lib/auditoria'
import { colaCambiosCuenta, resolverCambioCuenta } from '@/lib/cambio-cuenta'
import { RESOLUCIONES_CAMBIO_CUENTA, type ResolucionCambioCuenta } from '@/lib/cambio-cuenta-reglas'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { operadorAutorizado } from '@/lib/operador'

export const dynamic = 'force-dynamic'

// GET  /api/operador/cambios-cuenta          → cola: pendientes + resueltas de los últimos 30 días
// POST /api/operador/cambios-cuenta { id, estado: 'hecha'|'descartada', actor }
//
// Las cuentas nuevas que piden los clientes desde el portal. La cola solo lleva MÁSCARAS; el IBAN
// completo se pide aparte (`/iban`) cuando Alberto va a teclearlo en la compañía.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    return NextResponse.json({ estado: 'ok', solicitudes: await colaCambiosCuenta(correduria.id) }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cambios-cuenta', e) }, { status: 503 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id.trim() : ''
  const actor = typeof cuerpo?.actor === 'string' ? cuerpo.actor.trim() : ''
  const estado = cuerpo?.estado
  if (!/^[0-9a-f-]{36}$/i.test(id) || actor === '' || !RESOLUCIONES_CAMBIO_CUENTA.includes(estado as ResolucionCambioCuenta)) {
    return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  }
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await resolverCambioCuenta(correduria.id, id, estado as ResolucionCambioCuenta, actor)
    return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : 404 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cambios-cuenta', e) }, { status: 503 })
  }
})
