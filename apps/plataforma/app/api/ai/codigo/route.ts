import { NextResponse } from 'next/server'
import { verificarSecreto, registrarUso, dentroDePresupuesto } from '@/lib/ai-gateway'
import { acotarArchivos } from '@/lib/ia-director-codigo'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

/** Director de CÓDIGO — puerto HTTP. Dada una orden de desarrollo, ACOTA (a coste 0 tokens de
 *  contexto) qué archivo(s) tocar consultando `mapa_arquitectura` y ELIGE el modelo dentro del
 *  presupuesto (reutiliza el Director de modelos + telemetría ai_usos). NO edita: devuelve los
 *  archivos candidatos + el modelo. El orquestador entrega esos archivos ENTEROS al agente. */
export async function POST(req: Request) {
  if (!verificarSecreto(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const tarea = typeof body?.tarea === 'string' ? body.tarea : (typeof body?.prompt === 'string' ? body.prompt : '')
  const app = String(body?.app ?? 'codigo')
  const clienteRef = typeof body?.cliente === 'string' && body.cliente.trim() ? body.cliente.trim().slice(0, 120) : null
  if (!tarea.trim()) return NextResponse.json({ error: 'Falta tarea' }, { status: 400 })

  if (!(await dentroDePresupuesto())) {
    await registrarUso({ app, endpoint: 'codigo', proveedor: 'openrouter', modelo: null, ok: false, ms: 0, error: 'presupuesto mensual excedido', clienteRef })
    return NextResponse.json({ error: 'Límite mensual de IA alcanzado' }, { status: 429 })
  }

  const t0 = Date.now()
  try {
    const r = await acotarArchivos(tarea, { topN: Number(body?.topN) || 6, app, clienteRef })
    await registrarUso({
      app, endpoint: 'codigo', proveedor: 'openrouter',
      modelo: r.eleccion.decidido ?? r.eleccion.model, ok: true, ms: Date.now() - t0,
      tokens: r.tokensIndice, clienteRef,
      // Diagnóstico: si el acotado degradó (mapa caído/vacío), deja rastro del PORQUÉ en ai_usos.error
      // aunque la llamada del Director sí respondiera (ok:true).
      error: r.sinMapa ? `sinMapa: ${r.errorMapa ?? '(query devolvió 0 filas)'}` : undefined,
    })
    return NextResponse.json({
      archivos: r.archivos,
      modelo: r.eleccion.modo === 'activo' ? r.eleccion.model : r.eleccion.decidido ?? r.eleccion.model,
      fallbacks: r.eleccion.fallbacks,
      modo: r.eleccion.modo,
      sinMapa: r.sinMapa,
      stale: r.stale,
      sha: r.sha,
      tokensIndice: r.tokensIndice,
    })
  } catch {
    await registrarUso({ app, endpoint: 'codigo', proveedor: 'openrouter', modelo: null, ok: false, ms: Date.now() - t0, error: 'acotado no disponible', clienteRef })
    return NextResponse.json({ error: 'Director de código no disponible' }, { status: 502 })
  }
}
