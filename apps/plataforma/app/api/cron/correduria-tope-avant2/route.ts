// ────────────────────────────────────────────────────────────────────────────
// Tope de gasto de Avant2 en EUROS (decisión de Alberto, 29/09/2026): el mensajero.
//
// asegura anota en `seguros.codeoscopic_tope_evento` el aviso de 60 € y cada bloqueo (70 €, y
// los niveles siguientes tras ampliar). Este cron, cada 5 min, los lee por el puerto, los manda
// por Telegram —el bloqueo con el botón «Autorizar +30 €» (`cas_tope:…`)— y los marca.
//
// 🚨 Un evento solo se marca si el Telegram SALIÓ: si no, se reintenta en la pasada siguiente.
// 🚨 «No se ha podido mirar» (puerto caído) → latido en rojo, nunca «nada pendiente».
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { tgSend, tgSendButtons } from '@/lib/telegram'
import { avisoEnviado, avisoPermitido } from '@/lib/telegram/avisos'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { leerTopeAvant2, marcarTopeNotificado } from '@/lib/correduria/tope-avant2'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'correduria_tope_avant2'

function eur(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + '€'
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const l = await leerTopeAvant2()
  if (l.estado === 'sin_datos') {
    await registrarLatido(AGENTE, false, `NO se ha podido mirar el gasto de Avant2: ${l.causa}`)
    return NextResponse.json({ ok: false, estado: 'sin_datos', causa: l.causa })
  }

  const enviados: string[] = []
  const silenciados: string[] = []
  const fallidos: string[] = []
  // `tgAviso` devuelve `null` tanto si está silenciado como si el envío falla; aquí hay que
  // distinguirlo (silenciado = el botón de desbloqueo no llega), así que se separa como en
  // `correduria-eventos`: primero el interruptor, luego el envío.
  // ⚠️ Id LITERAL en las dos llamadas: `lib/telegram/catalogo.test.ts` lee el fuente.
  const permitido = l.pendientes.length === 0 || (await avisoPermitido('correduria.tope-avant2'))
  for (const p of l.pendientes) {
    if (!permitido) { silenciados.push(p.id); continue }
    const id = p.boton
      ? await tgSendButtons(p.texto, [[p.boton]]).catch(() => null)
      : await tgSend(p.texto, { html: true }).catch(() => null)
    if (id === null) { fallidos.push(p.id); continue }
    enviados.push(p.id)
    await avisoEnviado('correduria.tope-avant2')
  }
  // Silenciado = no salió: se queda pendiente (si se reactiva el aviso, llega el botón).
  const marcado = enviados.length === 0 || (await marcarTopeNotificado(enviados))

  const resumen = `${eur(l.gastadoCents)} de ${eur(l.topeCents)} este mes`
  const problemas = [
    fallidos.length ? `${fallidos.length} aviso(s) NO salieron por Telegram (se reintenta)` : null,
    silenciados.length ? `${silenciados.length} aviso(s) SILENCIADOS en /telegram: el botón de desbloqueo no te llega` : null,
    !marcado ? 'enviados pero sin marcar en asegura (pueden repetirse)' : null,
  ].filter(Boolean)
  const ok = problemas.length === 0
  await registrarLatido(
    AGENTE,
    ok,
    `comprobado: ${resumen}; ${enviados.length} aviso(s) enviado(s)${problemas.length ? `; ⚠️ ${problemas.join('; ')}` : ''}`,
  )
  return NextResponse.json({ ok, gastadoCents: l.gastadoCents, topeCents: l.topeCents, enviados: enviados.length, silenciados: silenciados.length, fallidos: fallidos.length })
}
