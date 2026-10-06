import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { listarFichas, SinTablaFichasError } from '@/lib/tarificador-fichas'
import { MENSAJE_SIN_TABLA, limiteLista } from '@/lib/tarificador-fichas-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/tarificador/fichas[?ramo=comunidades][&limite=30][&antes_de=<iso>]` — fichas de producto
 * (condiciones del condicionado por compañía/ramo/producto/versión), más recientes primero, paginadas por
 * `updated_at`. Bearer de operador; filtrado por correduría; solo lectura. 503 `sin_tabla` si el SQL
 * 2026-10-07c no está aplicado.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const ramo = (q.get('ramo') ?? '').trim() || null
  if (ramo !== null && !/^[a-z_]{1,40}$/.test(ramo)) return NextResponse.json({ estado: 'error', mensaje: 'ramo inválido' }, { status: 400 })
  const antesDe = (q.get('antes_de') ?? '').trim() || null
  if (antesDe !== null && Number.isNaN(Date.parse(antesDe))) return NextResponse.json({ estado: 'error', mensaje: 'antes_de no es una fecha' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await listarFichas(correduria.id, { ramo, limite: limiteLista(q.get('limite'), 30, 100), antesDe })
    return NextResponse.json(r, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    if (e instanceof SinTablaFichasError) return NextResponse.json({ estado: 'sin_tabla', mensaje: MENSAJE_SIN_TABLA }, { status: 503 })
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/fichas', e) }, { status: 503 })
  }
}
