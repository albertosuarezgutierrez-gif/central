import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { autorizarVer, borrarRelacion, crearRelacion, listarRelaciones, type ResultadoRelacion } from '@/lib/cartera-relaciones'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Relaciones entre clientes y autorización para ver los seguros del otro
 * (plataforma → asegura, Bearer).
 *
 *   GET    ?id=<clienteId>                                        → { estado:'ok', relaciones }
 *   POST   { clienteId, relacionadoId, tipo, observaciones?, actor } → crea el vínculo (dos sentidos)
 *   PATCH  { clienteId, relacionadoId, autoriza: boolean, alcance?, actor } → clienteId autoriza/revoca a relacionadoId
 *   DELETE { clienteId, relacionadoId, actor }                      → borra el vínculo entero
 *
 * `autoriza` se escribe SIEMPRE desde la ficha de quien autoriza: en la ficha
 * de María Antonia se decide si José ve los seguros de María Antonia, no al revés.
 *
 * 🚨 El PATCH ya no cambia un booleano: escribe una fila de `portal_autorizacion`
 * con `origen = 'corredor'` (la correduría ANOTA un consentimiento recibido por
 * teléfono o en papel; no autoriza por el cliente) y esa fila nace PENDIENTE —
 * no abre nada hasta que el autorizado la acepte en el portal.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'falta id' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const relaciones = await listarRelaciones(correduria.id, id)
    if (relaciones === null) return NextResponse.json({ estado: 'error', motivo: 'no se pudo leer la tabla' })
    return NextResponse.json({ estado: 'ok', relaciones })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/relaciones', e) })
  }
}

export async function POST(req: Request) {
  return escribir(req, (c, b) =>
    crearRelacion(c, cadena(b.clienteId) ?? '', { relacionadoId: cadena(b.relacionadoId) ?? '', tipo: b.tipo, observaciones: b.observaciones, actor: actorDe(b) }),
  )
}

export async function PATCH(req: Request) {
  return escribir(req, (c, b) =>
    autorizarVer(c, cadena(b.clienteId) ?? '', {
      relacionadoId: cadena(b.relacionadoId) ?? '',
      autoriza: b.autoriza === true,
      // Sin `alcance` se anota el más pequeño («ver»). Un alcance que no se puede
      // conceder NO se ignora en silencio: `autorizarVer` responde 422 con la razón.
      alcance: b.alcance,
      actor: actorDe(b),
    }),
  )
}

export async function DELETE(req: Request) {
  return escribir(req, (c, b) => borrarRelacion(c, cadena(b.clienteId) ?? '', { relacionadoId: cadena(b.relacionadoId) ?? '', actor: actorDe(b) }))
}

async function escribir(req: Request, accion: (correduriaId: string, body: Record<string, unknown>) => Promise<ResultadoRelacion>) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body.clienteId !== 'string' || typeof body.relacionadoId !== 'string') {
      return NextResponse.json({ estado: 'invalido', motivo: 'faltan clienteId y relacionadoId' }, { status: 422 })
    }
    const r = await accion(correduria.id, body)
    if (!r.ok) {
      const { ok: _ok, status, ...resto } = r
      void _ok
      return NextResponse.json(resto, { status })
    }
    return NextResponse.json({ estado: 'ok', relaciones: r.relaciones })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/relaciones', e) }, { status: 500 })
  }
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
function actorDe(b: Record<string, unknown>): string {
  return typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
}
