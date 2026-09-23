// ────────────────────────────────────────────────────────────────────────────
// RESPALDO del pull de CIMA (Grupo ASegura).
//
// El pull principal lo dispara GitHub Actions (repo `asegura`, 05:30/11:30 UTC)
// contra `app.grupoasegura.com/api/crons/cima-pull`. El 22/09/2026 el
// presupuesto de Actions de la cuenta se agotó —lo consume casi todo `central`—,
// los jobs de `asegura` se quedaron sin runner y CIMA pasó ~45 h sin entrar.
//
// Este job corre desde el cron-dispatch de plataforma (Vercel, no gasta minutos
// de Actions) a las 07:00 y 13:00 UTC, y SOLO dispara el pull si la franja de
// Actions no ha completado (`decidirRespaldoPull`, con su cepo). Así los dos
// caminos no se pisan en la cola de TIREA: cuando Actions funciona, esto no hace
// nada.
//
// Se enciende al configurar `ASEGURA_CRM_CRON_SECRET` en el proyecto Vercel de
// plataforma (el mismo valor que `CRON_SECRET` del proyecto Vercel `asegura`).
// Sin él no dispara nada y lo dice en el latido: no se calla.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
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

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const secreto = process.env.ASEGURA_CRM_CRON_SECRET
  if (!secreto) {
    await registrarLatido(AGENTE, false, 'sin configurar: falta ASEGURA_CRM_CRON_SECRET — el respaldo no puede disparar el pull')
    return NextResponse.json({ ok: false, motivo: 'sin_configurar' })
  }

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

  const url = process.env.ASEGURA_CRM_CIMA_PULL_URL || URL_POR_DEFECTO
  let ok = false
  let resumen: string
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secreto}` },
      signal: AbortSignal.timeout(270_000),
      cache: 'no-store',
    })
    const cuerpo = (await res.json().catch(() => null)) as Record<string, unknown> | null
    // El handler puede devolver 200 con `{ok:false}`: se mira el cuerpo, no solo el código.
    ok = res.ok && cuerpo?.ok === true
    resumen = ok
      ? `procesados ${String(cuerpo?.processed ?? '?')}`
      : `HTTP ${res.status} · ${String(cuerpo?.error ?? cuerpo?.reason ?? 'cuerpo no válido')}`
  } catch (e) {
    resumen = `sin respuesta (${e instanceof Error ? e.name : 'error'})`
  }

  await registrarLatido(AGENTE, ok, `disparado: el último pull tenía ${decision.horas} h · ${resumen}`)
  await tgAviso(
    'correduria.ingesta',
    ok
      ? `🟠 <b>CIMA · respaldo</b>\nEl pull de GitHub Actions no había corrido (último hace ${decision.horas} h). ` +
        `Lo ha lanzado plataforma y ha ido bien (${resumen}).\nRevisa Actions del repo asegura: ¿minutos o presupuesto agotados?`
      : `🔴 <b>CIMA · respaldo FALLIDO</b>\nEl pull de Actions no corre (último hace ${decision.horas} h) ` +
        `y el respaldo desde plataforma tampoco ha podido: ${resumen}.\nNo está entrando nada de las compañías.`,
  ).catch(() => {})

  return NextResponse.json({ ok, disparado: true, horas: decision.horas, resumen })
}
