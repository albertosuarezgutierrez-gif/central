import { NextResponse } from 'next/server'

import { auditado } from '@/lib/auditoria'
import { ibanDeSolicitud } from '@/lib/cambio-cuenta'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { operadorAutorizado } from '@/lib/operador'

export const dynamic = 'force-dynamic'

// POST /api/operador/cambios-cuenta/iban { id } → { estado: 'ok', iban }
//
// El IBAN COMPLETO de una solicitud pendiente, para teclearlo en la compañía. Es POST (y `auditado`)
// a propósito: cada consulta deja fila en la auditoría del puerto con quién la hizo. Nunca en caché.
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await ibanDeSolicitud(correduria.id, id)
    const status = r.estado === 'ok' ? 200 : r.estado === 'no_encontrada' ? 404 : 503
    return NextResponse.json(r, { status, headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cambios-cuenta/iban', e) }, { status: 503 })
  }
})
