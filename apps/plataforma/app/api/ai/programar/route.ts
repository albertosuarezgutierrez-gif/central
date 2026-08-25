import { NextResponse } from 'next/server'
import { verificarSecreto, registrarUso, dentroDePresupuesto, PROVEEDOR_PASARELA } from '@/lib/ai-gateway'
import { planificarTarea, type ArchivoContexto } from '@/lib/programador'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** PLANIFICADOR — Fase 2 del "caro planifica / barato ejecuta". Dada una orden + los archivos
 *  candidatos (con contenido, que el orquestador leyó tras el acotado de /api/ai/codigo), el modelo
 *  ALTO (categoría `plan`) devuelve un PLAN estructurado por archivo. NO edita ni ejecuta: el
 *  orquestador manda cada paso a /api/ai/ejecutar. Registra en ai_usos (endpoint='programar'). */
export async function POST(req: Request) {
  if (!verificarSecreto(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const tarea = typeof body?.tarea === 'string' ? body.tarea.trim() : (typeof body?.prompt === 'string' ? body.prompt.trim() : '')
  const app = String(body?.app ?? 'programar')
  const clienteRef = typeof body?.cliente === 'string' && body.cliente.trim() ? body.cliente.trim().slice(0, 120) : null
  const archivos: ArchivoContexto[] = Array.isArray(body?.archivos)
    ? body.archivos
        .filter((a: unknown): a is ArchivoContexto => !!a && typeof (a as ArchivoContexto).ruta === 'string')
        .slice(0, 20)
        .map((a: ArchivoContexto) => ({ ruta: a.ruta, resumen: a.resumen ?? null, contenido: typeof a.contenido === 'string' ? a.contenido : '' }))
    : []

  if (!tarea) return NextResponse.json({ error: 'Falta tarea' }, { status: 400 })
  if (!archivos.length) return NextResponse.json({ error: 'Faltan archivos (con contenido)' }, { status: 400 })

  if (!(await dentroDePresupuesto())) {
    await registrarUso({ app, endpoint: 'programar', proveedor: PROVEEDOR_PASARELA, modelo: null, ok: false, ms: 0, error: 'presupuesto mensual excedido', clienteRef })
    return NextResponse.json({ error: 'Límite mensual de IA alcanzado' }, { status: 429 })
  }

  try {
    const r = await planificarTarea(tarea, archivos, { app, clienteRef })
    return NextResponse.json({ plan: r.plan, modelo: r.modelo, ...(r.plan.length ? {} : { crudo: r.crudo, aviso: 'plan vacío: el planificador no devolvió JSON parseable (degrada al método clásico)' }) })
  } catch {
    return NextResponse.json({ error: 'Planificador no disponible' }, { status: 502 })
  }
}
