// ────────────────────────────────────────────────────────────────────────────
// Detector de cambios de la cartera (Fase 2 de ASegura OS, pieza 2-a).
//
// Tras cada pull de CIMA (05:30 y 11:30 UTC) pide a asegura que compare la foto de la cartera viva
// con la anterior y guarde los eventos nuevos. De todo lo detectado, solo las PÉRDIDAS SIN
// EXPLICAR (baja, anula al vencimiento o desaparecida, sin sustitución registrada) se avisan por
// Telegram; el resto queda en `seguros.evento` para los flujos de la Fase 2.
//
// 🚨 «No se ha podido mirar» NUNCA es «no ha pasado nada»: si el puerto falla, latido en rojo y
// sin aviso. Y la primera pasada solo ancla la foto: no manda «110 pólizas nuevas».
// Si el Telegram no sale, los eventos ya están guardados y siguen en «Hoy»: el latido lo dice.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { tgSend } from '@/lib/telegram'
import { avisoPermitido, avisoEnviado } from '@/lib/telegram/avisos'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { urlFichaCliente } from '@/lib/leads-web'
import { detectarEventos, mensajeFugas } from '@/lib/fugas-cartera'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'correduria_eventos'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const r = await detectarEventos()
  if (r.estado === 'sin_datos') {
    await registrarLatido(AGENTE, false, `NO se ha podido mirar la cartera: ${r.causa}`)
    return NextResponse.json({ ok: false, estado: 'sin_datos', causa: r.causa })
  }

  const d = r.dato
  const resumen = (Object.entries(d.porTipo).map(([t, n]) => `${t} ${n}`).join(', ') || 'ninguno') +
    (d.retencionesAbiertas ? `; ${d.retencionesAbiertas} retención(es) abierta(s)` : '') +
    (d.retencionesCerradas ? `; ${d.retencionesCerradas} retención(es) cerrada(s) por innecesaria(s)` : '') +
    (d.aprobacionesNuevas ? `; ${d.aprobacionesNuevas} correo(s) propuesto(s) esperando tu OK` : '')
  // Una retención que tocaba abrir y falló es una llamada que no aparece en «Hoy»: el latido lo dice.
  const fallo = (d.retencionesFallidas ? `⚠️ ${d.retencionesFallidas} retención(es) NO se pudieron abrir (ver logs de asegura); ` : '') +
    (d.aprobacionesFallidas ? `⚠️ ${d.aprobacionesFallidas} aviso(s) de recibo devuelto NO se pudieron proponer y no se reintentan (ver logs de asegura); ` : '')
  if (d.primeraVez) {
    await registrarLatido(AGENTE, true, `primera pasada: foto anclada (${d.polizasEnFoto} pólizas vivas), sin eventos`)
    return NextResponse.json({ ok: true, estado: 'anclado', polizas: d.polizasEnFoto })
  }
  if (d.fugasNuevas.length === 0) {
    await registrarLatido(AGENTE, !fallo, `${fallo}comprobado: ${d.nuevos} evento(s) nuevo(s) (${resumen}), ninguna pérdida sin explicar`)
    return NextResponse.json({ ok: true, estado: 'sin_fugas', nuevos: d.nuevos, porTipo: d.porTipo })
  }

  // ⚠️ Id LITERAL en las dos llamadas: `lib/telegram/catalogo.test.ts` lee el fuente.
  const permitido = await avisoPermitido('correduria.fuga-cartera')
  let salio = false
  if (permitido) {
    const id = await tgSend(mensajeFugas(d.fugasNuevas, (c) => urlFichaCliente(c), d.retencionesAbiertas)).catch(() => null)
    salio = id !== null
    if (salio) await avisoEnviado('correduria.fuga-cartera')
  }
  const ok = (salio || !permitido) && !fallo
  const detalle = `${fallo}${d.nuevos} evento(s) nuevo(s) (${resumen}); ${d.fugasNuevas.length} pérdida(s) sin explicar ` +
    (salio ? 'avisada(s)' : permitido ? 'SIN avisar (el Telegram no salió; siguen en «Hoy»)' : '(aviso silenciado en /telegram)')
  await registrarLatido(AGENTE, ok, detalle)
  return NextResponse.json({ ok, estado: 'fugas', fugas: d.fugasNuevas.length, avisado: salio, silenciado: !permitido })
}
