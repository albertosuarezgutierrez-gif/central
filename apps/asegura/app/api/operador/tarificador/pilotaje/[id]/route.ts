import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { hayPilotaje } from '@/lib/esquema-bd'
import { TOPES_PILOTAJE, leerComandoPilotaje } from '@/lib/tarificador-pilotaje-reglas'
import { configStorage, pasosParaOperador, ponerComando } from '@/lib/tarificador-pilotaje'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/tarificador/pilotaje/[id]?limite=3` — estado de una sesión pilotada: cabecera y los últimos pasos (inventario
 * saneado y redactado, comando, resultado) con la URL FIRMADA (10 min) de cada captura. Sin datos personales (sesión sintética).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!RE_UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const lim = Number(new URL(req.url).searchParams.get('limite') ?? '3')
  const limite = Number.isInteger(lim) && lim >= 1 && lim <= 50 ? lim : 3
  try {
    if (!(await hayPilotaje())) return NextResponse.json({ estado: 'error', mensaje: 'pilotaje_sin_esquema' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await pasosParaOperador(correduria.id, id, limite, configStorage(process.env))
    if (!r.sesion) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', ...r }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/pilotaje/[id]', e) }, { status: 503 })
  }
}

/**
 * `POST /api/operador/tarificador/pilotaje/[id]` `{ n, comando }` — pone el comando de la pantalla `n` mientras ESPERA (409 si ya
 * se recogió, es la final o no existe). Aquí solo se valida la FORMA; el worker lo revalida y lo ejecuta por el guard.
 */
export const POST = auditado(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!RE_UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as { n?: unknown; comando?: unknown } | null
  const n = typeof b?.n === 'number' && Number.isInteger(b.n) && b.n >= 1 && b.n <= TOPES_PILOTAJE.maxPasos ? b.n : null
  if (n === null) return NextResponse.json({ estado: 'error', errores: ['n tiene que ser un entero'] }, { status: 400 })
  const c = leerComandoPilotaje(b?.comando)
  if (!c.ok) return NextResponse.json({ estado: 'error', errores: c.errores }, { status: 400 })
  try {
    if (!(await hayPilotaje())) return NextResponse.json({ estado: 'error', mensaje: 'pilotaje_sin_esquema' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const ok = await ponerComando(correduria.id, id, n, c.c)
    if (!ok) return NextResponse.json({ estado: 'conflicto', motivo: 'la pantalla no espera comando (recogido, final, cerrada o inexistente)' }, { status: 409 })
    return NextResponse.json({ estado: 'ok', n })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/pilotaje/[id]', e) }, { status: 503 })
  }
})
