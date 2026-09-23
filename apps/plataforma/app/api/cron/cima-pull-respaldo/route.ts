// ────────────────────────────────────────────────────────────────────────────
// RESPALDO del pull de CIMA (Grupo ASegura).
//
// El pull principal lo dispara GitHub Actions (repo `asegura`, 05:30/11:30 UTC)
// contra `app.grupoasegura.com/api/crons/cima-pull`. El 22/09/2026 el
// presupuesto de Actions de la cuenta se agotó —lo consume casi todo `central`—,
// los jobs de `asegura` se quedaron sin runner y CIMA pasó ~45 h sin entrar.
//
// Este job corre desde el cron-dispatch de plataforma (Vercel, no gasta minutos
// de Actions) a las 08:00 y 14:00 UTC, y SOLO dispara el pull si la franja de
// Actions no ha completado (`decidirRespaldoPull`, con su cepo).
//
// ⚠️ Riesgo residual declarado: si un run de Actions arranca más de 2,5 h tarde
// y sigue en marcha a la hora del respaldo, los dos pulls coincidirían. El
// respaldo solo ve pulls COMPLETADOS, no los que están en curso.
//
// Se enciende al configurar `ASEGURA_CRM_CRON_SECRET` en el proyecto Vercel de
// plataforma (el mismo valor que `CRON_SECRET` del proyecto Vercel `asegura`).
// Sin él NO puede disparar, y si CIMA está parado lo dice por Telegram: un
// respaldo apagado justo el día que hace falta no puede ser silencioso.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { tgAviso } from '@/lib/telegram'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { leerIngestaCima } from '@/lib/correduria/ingesta-cima'
import { decidirRespaldoPull } from '@central/module-seguros'

export const dynamic = 'force-dynamic'
// El pull espera al adaptador Java (~200 s). El dispatch corta a los 280 s.
export const maxDuration = 300

const AGENTE = 'cima_pull_respaldo'
const URL_POR_DEFECTO = 'https://app.grupoasegura.com/api/crons/cima-pull'

/** Lo que dejó la pasada anterior, para no repetir el mismo aviso dos veces al día. */
async function detalleAnterior(): Promise<string | null> {
  try {
    const filas = await prisma.$queryRaw<Array<{ detalle: string | null }>>(Prisma.sql`
      SELECT detalle FROM agente_latidos WHERE agente = ${AGENTE}`)
    return filas[0]?.detalle ?? null
  } catch {
    // Si no se puede leer, se avisa igual: perder un aviso es peor que duplicarlo.
    return null
  }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const ingesta = await leerIngestaCima()
  const ultimoPull = ingesta.estado === 'ok' ? ingesta.salud.ultimoPull : null
  const decision = decidirRespaldoPull(ultimoPull)

  if (!decision.disparar) {
    const texto = decision.motivo === 'al_dia'
      ? `al día: último pull hace ${decision.horas} h, no hace falta respaldo`
      : 'sin dato del último pull: NO se dispara a ciegas (lo avisa el vigía de la ingesta)'
    await registrarLatido(AGENTE, decision.motivo === 'al_dia', texto)
    return NextResponse.json({ ok: true, disparado: false, motivo: decision.motivo, horas: decision.horas })
  }

  const anterior = await detalleAnterior()
  const secreto = process.env.ASEGURA_CRM_CRON_SECRET
  if (!secreto) {
    await registrarLatido(AGENTE, false, `sin configurar: CIMA lleva ${decision.horas} h sin pull y falta ASEGURA_CRM_CRON_SECRET`)
    if (!anterior?.startsWith('sin configurar')) {
      await tgAviso('correduria.cima-respaldo',
        `🔴 <b>CIMA · sin pull desde hace ${decision.horas} h</b>\nEl pull de GitHub Actions no corre y el respaldo de ` +
        'plataforma NO puede lanzarlo: falta <code>ASEGURA_CRM_CRON_SECRET</code> en Vercel (proyecto plataforma), ' +
        'con el mismo valor que <code>CRON_SECRET</code> del proyecto asegura.',
      ).catch(() => {})
    }
    return NextResponse.json({ ok: false, disparado: false, motivo: 'sin_configurar', horas: decision.horas })
  }

  const url = process.env.ASEGURA_CRM_CIMA_PULL_URL || URL_POR_DEFECTO
  let resultado: 'ok' | 'fallo' | 'sin_confirmar'
  let resumen: string
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secreto}` },
      signal: AbortSignal.timeout(270_000),
      cache: 'no-store',
    })
    const cuerpo = (await res.json().catch(() => null)) as Record<string, unknown> | null
    // El handler puede devolver 200 con `{ok:false}`: se mira el cuerpo, no solo el código.
    resultado = res.ok && cuerpo?.ok === true ? 'ok' : 'fallo'
    resumen = resultado === 'ok'
      ? `procesados ${String(cuerpo?.processed ?? '?')}`
      : `HTTP ${res.status} · ${String(cuerpo?.error ?? cuerpo?.reason ?? 'cuerpo no válido')}`
  } catch (e) {
    // Cortar la espera NO para el pull en el CRM: puede terminar igualmente. No se
    // afirma que falló — lo confirmará (o no) el vigía de la ingesta.
    const esTimeout = e instanceof Error && e.name === 'TimeoutError'
    resultado = esTimeout ? 'sin_confirmar' : 'fallo'
    resumen = esTimeout
      ? 'sin respuesta en 270 s (el pull puede haber seguido en el CRM)'
      : `sin respuesta (${e instanceof Error ? e.name : 'error'})`
  }

  const detalle = `disparado (${resultado}): el último pull tenía ${decision.horas} h · ${resumen}`
  await registrarLatido(AGENTE, resultado === 'ok', detalle)

  // El éxito se avisa UNA vez por racha: si la pasada anterior ya fue un respaldo
  // con éxito, Actions sigue caído y ya se sabe. El fallo suena siempre.
  const yaAvisadoOk = resultado === 'ok' && (anterior?.startsWith('disparado (ok)') ?? false)
  if (!yaAvisadoOk) {
    const mensaje = resultado === 'ok'
      ? `🟠 <b>CIMA · respaldo</b>\nEl pull de GitHub Actions no había corrido (último hace ${decision.horas} h). ` +
        `Lo ha lanzado plataforma y ha ido bien (${resumen}).\nRevisa Actions del repo asegura: ¿minutos o presupuesto agotados?`
      : resultado === 'sin_confirmar'
        ? `🟠 <b>CIMA · respaldo sin confirmar</b>\nEl pull de Actions no corre (último hace ${decision.horas} h). ` +
          `Plataforma lo ha lanzado pero ${resumen}. Si mañana el vigía de la ingesta sigue diciendo que el cron está parado, no entró.`
        : `🔴 <b>CIMA · respaldo FALLIDO</b>\nEl pull de Actions no corre (último hace ${decision.horas} h) ` +
          `y el respaldo desde plataforma tampoco ha podido: ${resumen}.\nNo está entrando nada de las compañías.`
    await tgAviso('correduria.cima-respaldo', mensaje).catch(() => {})
  }

  return NextResponse.json({ ok: resultado === 'ok', disparado: true, resultado, horas: decision.horas, resumen })
}
