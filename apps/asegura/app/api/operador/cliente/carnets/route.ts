import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { borrarCarnet, guardarCarnet, type ResultadoCarnet } from '@/lib/cartera-edicion'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Carnés de conducir de un cliente por el puerto de operador (plataforma → asegura).
 *
 *   POST   { clienteId, tipo, fecha }      → añade uno
 *   PATCH  { clienteId, id, tipo, fecha }  → corrige tipo y/o fecha de expedición
 *   DELETE { clienteId, id }               → lo quita
 *
 * Uno por tipo (409 si ya tiene ese tipo). La fecha va cifrada y el historial no la guarda.
 * Se leen con la ficha (`GET /api/operador/cliente`), no aquí.
 */
export const POST = auditado(async (req: Request) =>
  escribir(req, (correduriaId, b) =>
    guardarCarnet(correduriaId, cadena(b.clienteId) ?? '', { tipo: b.tipo, fecha: b.fecha, actor: cadena(b.actor) ?? 'plataforma' }),
  ),
)

export const PATCH = auditado(async (req: Request) =>
  escribir(req, (correduriaId, b) => {
    const id = cadena(b.id)
    if (!id) return Promise.resolve({ ok: false, estado: 'invalido', motivo: 'Falta el carné.', campo: 'id', status: 422 } as const)
    return guardarCarnet(correduriaId, cadena(b.clienteId) ?? '', { id, tipo: b.tipo, fecha: b.fecha, actor: cadena(b.actor) ?? 'plataforma' })
  }),
)

export const DELETE = auditado(async (req: Request) =>
  escribir(req, (correduriaId, b) => {
    const id = cadena(b.id)
    if (!id) return Promise.resolve({ ok: false, estado: 'invalido', motivo: 'Falta el carné.', campo: 'id', status: 422 } as const)
    return borrarCarnet(correduriaId, cadena(b.clienteId) ?? '', { id, actor: cadena(b.actor) ?? 'plataforma' })
  }),
)

async function escribir(req: Request, accion: (correduriaId: string, body: Record<string, unknown>) => Promise<ResultadoCarnet>) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body.clienteId !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta clienteId' }, { status: 422 })
    const r = await accion(correduria.id, body)
    if (!r.ok) {
      const { ok: _ok, status, ...resto } = r
      void _ok
      return NextResponse.json(resto, { status })
    }
    return NextResponse.json({ estado: 'ok', id: r.id })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/carnets', e) }, { status: 500 })
  }
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
