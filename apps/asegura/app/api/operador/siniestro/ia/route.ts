import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { auditado } from '@/lib/auditoria'
import { actorDe, cadena, correduriaPedida, respuestaFallo } from '@/lib/siniestro-hilo-puerto'
import { ejecutarIASiniestro } from '@/lib/siniestro-ia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 150

/**
 * IA del siniestro por el puerto de operador.
 *   POST { correduriaId, siniestroId, accion:'analizar'|'redactar', destinatario?:'compania'|'cliente', actor? }
 *     → { estado:'ok', ...Mensaje, mensaje }  (mismo formato que el POST del hilo; autor 'ia', tipo 'analisis'|'borrador')
 * Una sola llamada a `iaTexto()` (pasarela, tope mensual), sin reintentos. Citas «…» verificadas contra el texto de la
 * póliza: las que no aparecen se avisan en el propio texto y en `meta.citas`. 503 `ia_no_disponible` = no se guarda nada.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo no válido' }, { status: 422 })
  const siniestroId = cadena(b.siniestroId)
  if (!siniestroId) return NextResponse.json({ estado: 'invalido', motivo: 'falta siniestroId' }, { status: 400 })
  if (b.accion !== 'analizar' && b.accion !== 'redactar') return NextResponse.json({ estado: 'invalido', motivo: "accion tiene que ser 'analizar' o 'redactar'" }, { status: 422 })
  if (b.destinatario !== undefined && b.destinatario !== 'compania' && b.destinatario !== 'cliente') {
    return NextResponse.json({ estado: 'invalido', motivo: "destinatario tiene que ser 'compania' o 'cliente'" }, { status: 422 })
  }
  try {
    const c = await correduriaPedida(b.correduriaId)
    if (!c.ok) return c.res
    const r = await ejecutarIASiniestro(c.id, {
      siniestroId,
      accion: b.accion,
      destinatario: b.destinatario === 'cliente' ? 'cliente' : 'compania',
      actor: actorDe(req, b),
    })
    if (!r.ok) return respuestaFallo(r)
    return NextResponse.json({ estado: 'ok', ...r.mensaje, mensaje: r.mensaje })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/siniestro/ia', e) }, { status: 500 })
  }
})
