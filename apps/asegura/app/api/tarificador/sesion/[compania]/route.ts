import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { correduriaUnica } from '@/lib/cartera'
import { borrarSesion, guardarSesion, leerSesion } from '@/lib/tarificador-sesion'
import { clasificarErrorBd, codigoErrorParaLog, cuerpoExcedeTope, leerCompania, leerCuerpoConTope, leerGuardado } from '@/lib/tarificador-sesion-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET|PUT|DELETE /api/tarificador/sesion/[compania]` — almacén de la sesión MANUAL sellada del worker
 * (services/tarificador-rpa/src/sesion-manual.ts → `almacenHttp`). Bearer `TARIFICADOR_WORKER_SECRET`, igual que
 * las rutas hermanas del worker. Asegura guarda el token OPACO (no tiene la clave) con su `caduca_en`.
 *   GET    → 200 `{ token }` · 404 si no hay o caducó (la caducada se borra).
 *   PUT    `{ token, caducaEn }` → upsert. 400 forma/caducidad, 413 tamaño.
 *   DELETE → 200 siempre (idempotente).
 * Sin el SQL aplicado → 503 `sesion_sin_activar`. Un 5xx NO es «no hay sesión» para el worker (es `infra`).
 *
 * Sin `auditado()`: no es el puerto de operador (como /resultado). El token no se loguea nunca, ni el mensaje de
 * un error de BD (un CHECK violado de Postgres lleva la fila entera): solo su código.
 */
type Ctx = { params: Promise<{ compania: string }> }
const NO_CACHE = { 'cache-control': 'private, no-store' }
const SIN_CORREDURIA = () => NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })

function errorBd(op: string, compania: string, e: unknown): NextResponse {
  const c = clasificarErrorBd(e)
  console.error('[tarificador] sesion', op, compania, c.estado, codigoErrorParaLog(e))
  return NextResponse.json({ estado: c.estado, ...(c.mensaje ? { mensaje: c.mensaje } : {}) }, { status: c.status })
}

export async function GET(req: Request, ctx: Ctx) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const c = leerCompania((await ctx.params).compania)
  if (!c.ok) return NextResponse.json({ estado: 'error', motivo: c.motivo }, { status: c.status })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    const token = await leerSesion(correduria.id, c.valor)
    if (token === null) return NextResponse.json({ estado: 'sin_sesion' }, { status: 404, headers: NO_CACHE })
    return NextResponse.json({ estado: 'ok', token }, { headers: NO_CACHE })
  } catch (e) {
    return errorBd('leer', c.valor, e)
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const c = leerCompania((await ctx.params).compania)
  if (!c.ok) return NextResponse.json({ estado: 'error', motivo: c.motivo }, { status: c.status })
  if (cuerpoExcedeTope(req.headers.get('content-length'))) return NextResponse.json({ estado: 'error', motivo: 'cuerpo_grande' }, { status: 413 })
  const texto = await leerCuerpoConTope(req.body)
  if (texto === null) return NextResponse.json({ estado: 'error', motivo: 'cuerpo_grande' }, { status: 413 })
  const g = leerGuardado(texto, Date.now())
  if (!g.ok) return NextResponse.json({ estado: 'error', motivo: g.motivo }, { status: g.status })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    await guardarSesion(correduria.id, c.valor, g.valor.token, g.valor.caducaEn)
    return NextResponse.json({ estado: 'ok', caducaEn: g.valor.caducaEn.toISOString() }, { headers: NO_CACHE })
  } catch (e) {
    return errorBd('guardar', c.valor, e)
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const c = leerCompania((await ctx.params).compania)
  if (!c.ok) return NextResponse.json({ estado: 'error', motivo: c.motivo }, { status: c.status })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    const borradas = await borrarSesion(correduria.id, c.valor)
    return NextResponse.json({ estado: 'ok', borradas }, { headers: NO_CACHE })
  } catch (e) {
    return errorBd('borrar', c.valor, e)
  }
}
