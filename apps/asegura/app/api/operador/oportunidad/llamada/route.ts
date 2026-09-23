import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarLlamada } from '@/lib/oportunidad-seguimiento'

export const dynamic = 'force-dynamic'

/**
 * Resultado de una llamada del modo llamada (pieza 1-3 de ASegura OS).
 *   POST { oportunidadId, resultado, nota?, volverEl?, motivo?, actor }
 * Registro de la llamada + cambio de estado + siguiente tarea, en una sola
 * transacción (reglas en `planLlamada` de `@central/module-seguros`).
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!b) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo JSON no válido' }, { status: 422 })
    if (typeof b.oportunidadId !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta oportunidadId' }, { status: 422 })
    const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
    const r = await registrarLlamada(
      correduria.id,
      b.oportunidadId,
      { resultado: b.resultado, nota: b.nota, volverEl: b.volverEl, motivo: b.motivo },
      actor,
    )
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', resultado: r.resultado, siguienteTareaId: r.siguienteTareaId })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/oportunidad/llamada', e) }, { status: 500 })
  }
}
