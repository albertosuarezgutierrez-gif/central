import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { colaRetencion } from '@/lib/cartera-impagados'

export const dynamic = 'force-dynamic'

// GET /api/operador/impagados — la cola de retención: recibos devueltos, con
// cuánto queda para rescatar cada póliza (art. 15 LCS). Read-only.
//
// Lleva el TELÉFONO a propósito: el propósito entero de la lista es descolgar
// y llamar, y obligar a abrir otra pantalla para verlo la haría inútil. Va
// detrás del Bearer, como el resto del puerto.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    return NextResponse.json({ estado: 'ok', ...(await colaRetencion(correduria.id)) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/impagados', e) })
  }
}
