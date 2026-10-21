// ────────────────────────────────────────────────────────────────────────────
// Cruce correo de compañías ↔ CIMA (F1 del agente de correo, 21/10/2026, docs/CORREDURIA-AGENTE-CORREO.md §4.2).
// Asegura DECIDE qué avisar (emitida por correo y CIMA no la trae a los 5 días hábiles, anulación que CIMA sigue dando
// en vigor, devolución sin recibo, póliza nueva que casa con varias oportunidades) y lo apunta UNA vez por hecho; aquí
// se manda por Telegram y SOLO lo que salió se marca. Si no sale (o está silenciado en /telegram) no se marca: la pasada
// siguiente lo reintenta. 🚨 Un fallo del puerto NO es «nada que avisar»: se registra y la respuesta es no-ok.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'

import { isCronAuthorized } from '@/lib/cron-auth'
import { tgAviso } from '@/lib/telegram/avisos'
import { urlFichaCliente } from '@/lib/leads-web'
import { cruceCimaAsegura, marcarCruceCimaAsegura } from '@/lib/seguimiento-asegura'
import { componerAvisosCruce, interpretarCruce } from '@/lib/correduria/cruce-cima'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const r = await cruceCimaAsegura()
  const l = interpretarCruce(r.status, r.json)
  if (l.estado === 'sin_migracion') return NextResponse.json({ ok: false, estado: 'sin_migracion', causa: 'falta aplicar 2026-10-21_correo_agente_f1.sql en asegura' })
  if (l.estado === 'error') {
    console.error('[correduria-cruce-cima] no se pudo cruzar:', l.motivo)
    return NextResponse.json({ ok: false, estado: 'sin_datos', causa: l.motivo })
  }
  const avisados: string[] = []
  let sinEnviar = 0
  for (const m of componerAvisosCruce(l.avisos, (id) => urlFichaCliente(id))) {
    // ⚠️ Id LITERAL: `lib/telegram/catalogo.test.ts` lee el fuente.
    const salio = (await tgAviso('correduria.cruce-cima-correo', m.texto).catch(() => null)) !== null
    if (salio) avisados.push(...m.ids)
    else sinEnviar += m.ids.length
  }
  const marca = avisados.length ? await marcarCruceCimaAsegura(avisados) : { status: 200, json: { estado: 'ok' } }
  const marcados = marca.status === 200
  if (!marcados) console.error('[correduria-cruce-cima] avisados pero sin marcar en asegura (puede repetirse):', avisados.length)
  return NextResponse.json({
    ok: sinEnviar === 0 && marcados && l.descartados === 0,
    pendientes: l.avisos.length, nuevos: l.nuevos, avisados: avisados.length, sinEnviar, descartados: l.descartados, marcados,
  })
}
