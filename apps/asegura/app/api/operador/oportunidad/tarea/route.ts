import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { cerrarTarea, crearTarea } from '@/lib/oportunidad-seguimiento'

export const dynamic = 'force-dynamic'

/**
 * Tareas de seguimiento de una oportunidad (tabla heredada `gestiones`).
 *   POST  { oportunidadId, tipo, fechaLimite, observaciones, prioridad?, actor } → crea
 *   PATCH { tareaId, resultado?, actor }                                        → cierra
 * Sin fecha límite no hay tarea: una tarea sin fecha es una nota que nadie vuelve a mirar.
 */
export async function POST(req: Request) {
  return escribir(req, async (correduriaId, b) => {
    if (typeof b.oportunidadId !== 'string') return { ok: false, estado: 'invalido', motivo: 'falta oportunidadId', status: 422 }
    return crearTarea(correduriaId, b.oportunidadId, { tipo: b.tipo, prioridad: b.prioridad, observaciones: b.observaciones, fechaLimite: b.fechaLimite }, actorDe(b))
  })
}

export async function PATCH(req: Request) {
  return escribir(req, async (correduriaId, b) => {
    if (typeof b.tareaId !== 'string') return { ok: false, estado: 'invalido', motivo: 'falta tareaId', status: 422 }
    const resultado = typeof b.resultado === 'string' && b.resultado.trim() !== '' ? b.resultado.trim().slice(0, 500) : null
    return cerrarTarea(correduriaId, b.tareaId, resultado, actorDe(b))
  })
}

type Resultado = { ok: true; [k: string]: unknown } | { ok: false; estado: string; motivo: string; status: number }

async function escribir(req: Request, accion: (correduriaId: string, b: Record<string, unknown>) => Promise<Resultado>) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!b) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo JSON no válido' }, { status: 422 })
    const r = await accion(correduria.id, b)
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    const { ok: _ok, ...resto } = r
    void _ok
    return NextResponse.json({ estado: 'ok', ...resto })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/oportunidad/tarea', e) }, { status: 500 })
  }
}

function actorDe(b: Record<string, unknown>): string {
  return typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
}
