// /api/cron/psd2-sync — re-sincroniza a diario las conexiones PSD2 vinculadas (saldos
// y movimientos nuevos por Enable Banking) y, a continuación, auto-categoriza con IA los
// movimientos nuevos (marcando "por revisar" los dudosos). Auth: Bearer CRON_SECRET (o ?secret=).
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { disponible } from '@/lib/enablebanking'
import { sincronizarTodas } from '@/lib/psd2'
import { partirAvisos } from '@/lib/psd2-semaforo'
import { categorizarPendientesTodas } from '@/lib/categorizar'
import { escapeHtml, tgAvisoAlerta } from '@/lib/telegram'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!disponible()) return NextResponse.json({ ok: true, nota: 'Enable Banking sin configurar' })

  // ?since=YYYY-MM-DD permite importar histórico puntualmente (p. ej. ?since=2026-01-01).
  // Sin el parámetro se usan los últimos 89 días (sync normal diario).
  const since = req.nextUrl.searchParams.get('since') ?? undefined
  const sync = await sincronizarTodas(since).catch(e => ({ conexiones: 0, insertados: 0, avisos: [`sincronizarTodas falló — ${String(e).slice(0, 160)}`] }))

  // Dos clases de aviso, dos tratos — el MISMO corte que usa el semáforo de /banca
  // (lib/psd2-semaforo.ts). Que el cron gritase «el banco no está entregando movimientos» por
  // una nota ℹ️ («rechazó la ventana de 89 días», con el feed entregando a diario) contradecía
  // al panel, que la pintaba en verde con razón: el aviso alarmaba y el panel tranquilizaba
  // sobre el MISMO hecho (21/08/2026).
  const { criticos, notas } = partirAvisos(sync.avisos)

  if (criticos.length) {
    // Un crítico es el banco dejando de entregar datos (consentimiento degradado, API caída):
    // si se calla, la banca se congela «en verde» durante días (pasó 11→16/08/2026). Máx. 1
    // Telegram/día (el cron es diario); el 200 se mantiene para no confundir al dispatcher.
    // Las notas viajan como contexto, no como motivo.
    const cuerpo = [...criticos, ...notas].map(a => `• ${escapeHtml(a)}`).join('\n')
    await tgAvisoAlerta('sistema.psd2-sync', `⚠️ <b>PSD2 sync</b> — el banco no está entregando movimientos:\n${cuerpo}`, 'aviso').catch(() => {})
  }
  // Una nota ℹ️ SOLA no manda Telegram, ni siquiera la primera vez: describe una limitación
  // permanente del banco («Kutxabank solo sirve 30 días de ventana») sobre la que no hay nada
  // que hacer, y un aviso sin acción es ruido — más aún cuando el propio texto dice «no hay que
  // hacer nada» (dictado de Alberto, 26/08/2026). Su sitio es /banca, que las pinta en
  // permanencia también en verde, y el cuerpo de una alerta crítica, donde son contexto útil.

  // Tras sincronizar, categorizar los movimientos nuevos (degrada limpio sin NVIDIA_API_KEY).
  const cat = await categorizarPendientesTodas().catch(e => ({ cuentas: 0, categorizados: 0, error: String(e) }))
  return NextResponse.json({ ok: true, ...sync, criticos: criticos.length, notas: notas.length, categorizacion: cat })
}
