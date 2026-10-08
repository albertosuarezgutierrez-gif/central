import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { leerUltimoRiesgo } from '@/lib/tarificador-lectura'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/tarificador/ultimo-riesgo?cliente_id=<uuid>&compania=allianz&ramo=comunidades` —
 * el riesgo del trabajo más reciente de ese cliente (cualquier estado) para PRE-RELLENAR el modal
 * «Precio Allianz (bot)». Bearer de operador; filtrado por correduría; solo lectura (no depende de
 * `TARIFICADOR_RPA_ACTIVO`). Lista blanca: nunca credenciales, html, captura ni error interno.
 * 200 `{ riesgo: {...}|null, trabajoId, creadoEn }` (sin trabajos → `riesgo: null`).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const clienteId = (q.get('cliente_id') ?? '').trim()
  if (!UUID.test(clienteId)) return NextResponse.json({ estado: 'error', mensaje: 'cliente_id no es un uuid' }, { status: 400 })
  const compania = (q.get('compania') ?? 'allianz').trim().toLowerCase()
  const ramo = (q.get('ramo') ?? 'comunidades').trim()
  if (ramo !== 'comunidades' || !/^[a-z0-9_-]{1,40}$/.test(compania)) {
    return NextResponse.json({ estado: 'error', mensaje: 'compania/ramo no válidos (solo comunidades)' }, { status: 400 })
  }
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await leerUltimoRiesgo(correduria.id, clienteId, compania, ramo)
    return NextResponse.json(r, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/ultimo-riesgo', e) }, { status: 503 })
  }
}
