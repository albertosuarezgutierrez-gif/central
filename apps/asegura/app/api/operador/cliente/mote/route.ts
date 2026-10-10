import { NextResponse } from 'next/server'
import { z } from 'zod'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { guardarMote, leerMote, type ResultadoMote } from '@/lib/cliente-mote'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * MOTE de una ficha (solo para la agenda de Google de Alberto; `lib/cliente-mote.ts`, AISLADO).
 *   GET ?clienteId=<uuid>                  → { estado:'ok', mote }
 *   PUT { clienteId, mote|null, actor }    → guarda (vacío/null = quitar)
 * Fuera de la ficha (`GET /api/operador/cliente`) a propósito: el mote no viaja con los datos del cliente.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = z.string().uuid().safeParse(new URL(req.url).searchParams.get('clienteId'))
  if (!id.success) return NextResponse.json({ estado: 'invalido', motivo: 'clienteId no es un id' }, { status: 400 })
  return responder((c) => leerMote(c, id.data))
}

const Cuerpo = z.object({
  clienteId: z.string().uuid(),
  mote: z.string().max(200).nullable(),
  actor: z.string().trim().min(1).max(120),
}).strict()

export const PUT = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ estado: 'invalido', motivo: 'Cuerpo inválido: { clienteId, mote, actor }' }, { status: 400 })
  return responder((c) => guardarMote(c, b.data.clienteId, b.data.mote, b.data.actor))
})

async function responder(f: (correduriaId: string) => Promise<ResultadoMote>) {
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await f(correduria.id)
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', mote: r.mote })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/mote', e) }, { status: 500 })
  }
}
