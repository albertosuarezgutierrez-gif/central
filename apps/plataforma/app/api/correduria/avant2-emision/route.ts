import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { tgAviso } from '@/lib/telegram'
import { urlOportunidadesCliente } from '@/lib/correduria/retenidas-aviso'
import { esAllianz, RECORDATORIO_ALLIANZ_CORTO } from '@central/module-seguros'
import { emisionExternaRegistrar, emisionExternaVista } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Registrar en la intranet una emisión hecha en la web de Avant2 (30/09/2026).
 *
 * `GET ?projectId=&clienteId=&oportunidadId=` → vista previa (gratis, no escribe).
 * `POST { projectId, clienteId, oportunidadId? }` → la registra. `confirmado` y `actor` los pone el
 * servidor (sesión), nunca el cuerpo: la confirmación real es el `confirm` del navegador.
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const q = req.nextUrl.searchParams
  const projectId = q.get('projectId')?.trim() ?? ''
  const clienteId = q.get('clienteId')?.trim() ?? ''
  if (!projectId || !clienteId) return NextResponse.json({ estado: 'error', mensaje: 'faltan projectId y clienteId' }, { status: 400 })
  const r = await emisionExternaVista({ projectId, clienteId, oportunidadId: q.get('oportunidadId')?.trim() || null })
  return NextResponse.json(r.json, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const projectId = typeof cuerpo.projectId === 'string' ? cuerpo.projectId.trim() : ''
  const clienteId = typeof cuerpo.clienteId === 'string' ? cuerpo.clienteId.trim() : ''
  const oportunidadId = typeof cuerpo.oportunidadId === 'string' && cuerpo.oportunidadId.trim() ? cuerpo.oportunidadId.trim() : null
  if (!projectId || !clienteId) return NextResponse.json({ estado: 'error', mensaje: 'faltan projectId y clienteId' }, { status: 400 })
  const r = await emisionExternaRegistrar({ projectId, clienteId, oportunidadId, actor: guarda.session.email })
  await avisarSiQuedaRetenida(r, clienteId)
  return NextResponse.json(r.json, { status: r.status })
}

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Registrada una emisión que la compañía deja en «riesgo condicionado» → Telegram inmediato: hay que
 * entrar en su intranet. Best-effort: un fallo aquí no cambia la respuesta (el cron de retenidas
 * lo recordará cada mañana).
 */
async function avisarSiQuedaRetenida(r: { status: number; json: unknown }, clienteId: string): Promise<void> {
  try {
    const j = r.json as Record<string, unknown> | null
    if (r.status >= 300 || !j || typeof j !== 'object' || j.despues !== 'riesgo_condicionado') return
    const compania = typeof j.compania === 'string' ? j.compania : null
    const detalle = typeof j.descripcion === 'string' && j.descripcion.trim() ? ` (${j.descripcion.trim()})` : ''
    const partes = [
      '🛡️ <b>Emisión retenida por la compañía</b>',
      `<a href="${esc(urlOportunidadesCliente(clienteId))}">Ver cliente</a> — ${esc(compania ?? 'la compañía')}${esc(detalle)}: riesgo condicionado, no está en vigor.`,
      '⛔ Bloqueada: tienes que intervenir tú en la intranet de la compañía.',
    ]
    if (esAllianz(compania)) partes.push(`<i>${esc(RECORDATORIO_ALLIANZ_CORTO)}</i>`)
    await tgAviso('correduria.emision-retenida', partes.join('\n'))
  } catch {
    // best-effort
  }
}
