// /api/cron/psd2-sync — re-sincroniza a diario las conexiones PSD2 vinculadas (saldos
// y movimientos nuevos por Enable Banking) y, a continuación, auto-categoriza con IA los
// movimientos nuevos (marcando "por revisar" los dudosos). Auth: Bearer CRON_SECRET (o ?secret=).
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { disponible } from '@/lib/enablebanking'
import { prisma } from '@/lib/db'
import { sincronizarTodas } from '@/lib/psd2'
import { partirAvisos, avisosNuevos } from '@/lib/psd2-semaforo'
import { categorizarPendientesTodas } from '@/lib/categorizar'
import { tgAlert, escapeHtml } from '@/lib/telegram'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!disponible()) return NextResponse.json({ ok: true, nota: 'Enable Banking sin configurar' })

  // ?since=YYYY-MM-DD permite importar histórico puntualmente (p. ej. ?since=2026-01-01).
  // Sin el parámetro se usan los últimos 89 días (sync normal diario).
  const since = req.nextUrl.searchParams.get('since') ?? undefined
  // Avisos de la pasada ANTERIOR: sirven para no repetir cada mañana una nota informativa que
  // ya se contó (ver más abajo). Se leen ANTES del sync, que los pisa.
  const previos = await avisosPersistidos()
  const sync = await sincronizarTodas(since).catch(e => ({ conexiones: 0, insertados: 0, avisos: [`sincronizarTodas falló — ${String(e).slice(0, 160)}`] }))

  // Dos clases de aviso, dos tratos — el MISMO corte que usa el semáforo de /banca
  // (lib/psd2-semaforo.ts). Que el cron gritase «el banco no está entregando movimientos» por
  // una nota ℹ️ («rechazó la ventana de 89 días», con el feed entregando a diario) contradecía
  // al panel, que la pintaba en verde con razón: el aviso alarmaba y el panel tranquilizaba
  // sobre el MISMO hecho (21/08/2026).
  const { criticos, notas } = partirAvisos(sync.avisos)
  const notasNuevas = avisosNuevos(previos, notas)

  if (criticos.length) {
    // Un crítico es el banco dejando de entregar datos (consentimiento degradado, API caída):
    // si se calla, la banca se congela «en verde» durante días (pasó 11→16/08/2026). Máx. 1
    // Telegram/día (el cron es diario); el 200 se mantiene para no confundir al dispatcher.
    // Las notas viajan como contexto, no como motivo.
    const cuerpo = [...criticos, ...notas].map(a => `• ${escapeHtml(a)}`).join('\n')
    await tgAlert(`⚠️ <b>PSD2 sync</b> — el banco no está entregando movimientos:\n${cuerpo}`, 'aviso').catch(() => {})
  } else if (notasNuevas.length) {
    // Nota nueva y NADA roto: se cuenta UNA vez, sin alarma y sin pedir re-vincular. Mientras
    // siga igual no se repite (el panel la muestra en permanencia); si desaparece y vuelve,
    // vuelve a contarse.
    const cuerpo = notasNuevas.map(a => `• ${escapeHtml(a)}`).join('\n')
    await tgAlert(
      `<b>PSD2 sync</b> — el feed sigue vivo, con una limitación nueva del banco:\n${cuerpo}\nNo hay que hacer nada: queda anotado en /banca.`,
      'info',
    ).catch(() => {})
  }
  // Tras sincronizar, categorizar los movimientos nuevos (degrada limpio sin NVIDIA_API_KEY).
  const cat = await categorizarPendientesTodas().catch(e => ({ cuentas: 0, categorizados: 0, error: String(e) }))
  return NextResponse.json({ ok: true, ...sync, criticos: criticos.length, notas: notas.length, categorizacion: cat })
}

// Avisos que dejó escritos la pasada anterior en las conexiones vinculadas. Si la consulta
// falla se devuelve `[]`, que aquí es el lado CONSERVADOR: «no sé qué se avisó ayer» hace que
// una nota se repita, nunca que se silencie.
async function avisosPersistidos(): Promise<string[]> {
  const filas = await prisma.$queryRaw<Array<{ ultimo_avisos: unknown }>>`
    SELECT ultimo_avisos FROM conexiones_banco WHERE estado = 'vinculada'
  `.catch(() => [] as Array<{ ultimo_avisos: unknown }>)
  return filas.flatMap(f => (Array.isArray(f.ultimo_avisos) ? f.ultimo_avisos.map(String) : []))
}
