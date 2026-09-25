// /api/cron/cima-sincro — ficha ↔ CIMA (25/09/2026).
//
// Alberto: «primero CIMA manda; luego, si hay discrepancia con CIMA, avisarme y
// yo intervengo». Cada día: (1) se rellenan los HUECOS de las fichas con lo que
// manda CIMA de esa persona, sin preguntar; (2) se cuentan las DIFERENCIAS que
// esperan su decisión y, si hay, se avisa por Telegram con el enlace a la
// pantalla donde se deciden (/correduria → Hoy).
//
// 🚨 «No se ha podido comparar» también avisa: un fallo del puerto no puede
// leerse como «todo coincide».
import { NextRequest, NextResponse } from 'next/server'
import { tgAviso } from '@/lib/telegram/avisos'
import { accionSincroCimaAsegura, contadorSincroCima, interpretarSincroCima, sincroCimaAsegura } from '@/lib/cima-sincro-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const rell = await accionSincroCimaAsegura({ accion: 'rellenar', actor: 'cron cima-sincro' })
  const r = (rell.json ?? {}) as Record<string, unknown>
  const aplicados = rell.status === 200 && typeof r.aplicados === 'number' ? r.aplicados : null
  const fallidos = rell.status === 200 && Array.isArray(r.fallidos) ? r.fallidos.length : null

  const est = await sincroCimaAsegura()
  const l = interpretarSincroCima(est.status, est.json)
  const n = contadorSincroCima(l)

  const base = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : ''
  const lineas: string[] = []
  if (aplicados === null) lineas.push(`⚠️ No se han podido rellenar los huecos desde CIMA (HTTP ${rell.status}).`)
  else if (aplicados > 0 || fallidos) lineas.push(`🔄 ${aplicados} dato(s) copiados de CIMA a las fichas${fallidos ? ` · ${fallidos} sin aplicar` : ''}.`)
  if (n === null) lineas.push('⚠️ No se ha podido comparar las fichas con CIMA: no significa que coincidan.')
  else if (n > 0) lineas.push(`🔀 ${n} dato(s) de fichas distintos de lo que manda CIMA: decide en ${base}/correduria (Hoy).`)

  if (lineas.length > 0) await tgAviso('correduria.cima-diferencias', lineas.join('\n'))
  return NextResponse.json({ ok: aplicados !== null && n !== null, aplicados, fallidos, diferencias: n })
}
