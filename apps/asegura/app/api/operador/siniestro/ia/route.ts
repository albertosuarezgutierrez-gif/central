import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { auditado } from '@/lib/auditoria'
import { actorDe, cadena, correduriaPedida, respuestaFallo } from '@/lib/siniestro-hilo-puerto'
import { ejecutarIASiniestro } from '@/lib/siniestro-ia'
import { DESTINATARIOS_SINIESTRO_IA, type DestinatarioSiniestroIA } from '@/lib/siniestro-ia-prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

/**
 * IA del siniestro («gabinete de siniestros») por el puerto de operador.
 *   POST { correduriaId, siniestroId, accion:'analizar'|'redactar', destinatario?:'compania'|'compania_intranet'|'cliente', actor? }
 *     → { estado:'ok', ...Mensaje, mensaje }  (mismo formato que el POST del hilo; autor 'ia', tipo 'analisis'|'borrador')
 * analizar = índice de la póliza + ficha del caso (modelo barato, cacheados en meta por huella) + veredicto JSON
 * (`meta.veredicto`, `null` si no validó). redactar = una llamada. Cada paso: una llamada a `iaTexto()` sin reintentos.
 * Citas verificadas contra su fuente (`meta.citas`, `citaVerificada`). 503 `ia_no_disponible` = no se guarda nada.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo no válido' }, { status: 422 })
  const siniestroId = cadena(b.siniestroId)
  if (!siniestroId) return NextResponse.json({ estado: 'invalido', motivo: 'falta siniestroId' }, { status: 400 })
  if (b.accion !== 'analizar' && b.accion !== 'redactar') return NextResponse.json({ estado: 'invalido', motivo: "accion tiene que ser 'analizar' o 'redactar'" }, { status: 422 })
  if (b.destinatario !== undefined && b.destinatario !== null && !DESTINATARIOS_SINIESTRO_IA.includes(b.destinatario as DestinatarioSiniestroIA)) {
    return NextResponse.json({ estado: 'invalido', motivo: "destinatario tiene que ser 'compania', 'compania_intranet' o 'cliente'" }, { status: 422 })
  }
  try {
    const c = await correduriaPedida(b.correduriaId)
    if (!c.ok) return c.res
    const r = await ejecutarIASiniestro(c.id, {
      siniestroId,
      accion: b.accion,
      destinatario: DESTINATARIOS_SINIESTRO_IA.includes(b.destinatario as DestinatarioSiniestroIA) ? (b.destinatario as DestinatarioSiniestroIA) : 'compania',
      actor: actorDe(req, b),
    })
    if (!r.ok) return respuestaFallo(r)
    return NextResponse.json({ estado: 'ok', ...r.mensaje, mensaje: r.mensaje })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/siniestro/ia', e) }, { status: 500 })
  }
})
