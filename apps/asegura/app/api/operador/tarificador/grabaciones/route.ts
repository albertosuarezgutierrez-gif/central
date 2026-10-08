import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { crearGrabacion, listarGrabaciones } from '@/lib/tarificador-grabaciones'
import { leerAltaGrabacion } from '@/lib/tarificador-grabaciones-reglas'
import { SIN_CORREDURIA, errorGrabaciones, quienEscribe } from '@/lib/tarificador-grabaciones-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/tarificador/grabaciones` — las grabaciones del GRABADOR del tarificador RPA (pantallas de
 * un presupuesto ficticio hecho a mano en el portal de una compañía nueva), con cuántas pantallas tienen,
 * cuántas están analizadas y si el mapa está validado. Bearer de operador; filtrado por correduría.
 * Sin el SQL aplicado → 503 `tabla_sin_crear` con el mensaje de qué falta.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    return NextResponse.json({ estado: 'ok', grabaciones: await listarGrabaciones(correduria.id) }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return errorGrabaciones('operador/tarificador/grabaciones', e)
  }
}

/** `POST /api/operador/tarificador/grabaciones` `{ compania, ramo, producto?, nota? }` → 201 `{ id }`. */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const r = leerAltaGrabacion(await req.json().catch(() => null))
  if (!r.ok) return NextResponse.json({ estado: 'error', mensaje: r.mensaje }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    const id = await crearGrabacion(correduria.id, r.alta, quienEscribe(req))
    return NextResponse.json({ estado: 'ok', id }, { status: 201 })
  } catch (e) {
    return errorGrabaciones('operador/tarificador/grabaciones', e)
  }
})
