import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { auditado } from '@/lib/auditoria'
import { cerrarSiniestroConResultado } from '@/lib/siniestro-hilo'
import { actorDe, cadena, correduriaPedida, respuestaFallo } from '@/lib/siniestro-hilo-puerto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cierre del siniestro con resultado, por el puerto de operador.
 *
 *   PATCH { correduriaId, siniestroId, resultado ('ganado'|'perdido'|'parcial'), motivo, actor? } → { estado:'ok', ok:true }
 *
 * No cambia `estado` (en uno de CIMA lo fija la compañía) ni `comentario`. Re-cerrar sobrescribe y queda en
 * `historial_interno` (sin el motivo). 400 falta un id · 403 otra correduría · 404 · 422 · 503 `sin_migracion`.
 */
export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo no válido' }, { status: 422 })
  const siniestroId = cadena(b.siniestroId)
  if (!siniestroId) return NextResponse.json({ estado: 'invalido', motivo: 'falta siniestroId' }, { status: 400 })
  try {
    const c = await correduriaPedida(b.correduriaId)
    if (!c.ok) return c.res
    const r = await cerrarSiniestroConResultado(c.id, { siniestroId, resultado: b.resultado, motivo: b.motivo, actor: actorDe(req, b) })
    if (!r.ok) return respuestaFallo(r)
    return NextResponse.json({ estado: 'ok', ok: true })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/siniestro/cierre', e) }, { status: 500 })
  }
})
