import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { listarBandeja } from '@/lib/tarificador-bandeja'
import { leerPaginacion } from '@/lib/tarificador-bandeja-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/tarificador/bandeja[?limite=50][&desde=0]` — bandeja «Necesita tu atención»: trabajos del
 * tarificador RPA en `requiere_humano` o `error_definitivo`, con compañía, ramo, motivo legible, fecha y qué acciones
 * admiten. Bearer de operador; filtrado por correduría; solo lectura (no depende de `TARIFICADOR_RPA_ACTIVO`).
 * 200 `{ total, hayMas, items[] }` (lista blanca: sin mensaje técnico, URL, riesgo ni datos del cliente).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const { limite, desde } = leerPaginacion(q.get('limite'), q.get('desde'))
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await listarBandeja(correduria.id, limite, desde)
    return NextResponse.json(r, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/bandeja', e) }, { status: 503 })
  }
}
