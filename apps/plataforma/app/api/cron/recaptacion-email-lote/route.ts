// ────────────────────────────────────────────────────────────────────────────
// Envío AUTOMÁTICO diario de recaptación por email (leads del volcado
// sin vencimiento, solo-email —sin teléfono usable—, no en cooldown, no
// dados de baja). A quien tiene teléfono se le sigue trabajando a mano por
// WhatsApp desde `/correduria`; este cron es SOLO para quien no tiene ningún
// otro canal, que si no se queda sin recaptar nunca.
//
// 🚨 Igual que `correduria-renovaciones`: un fallo de lectura del puerto NUNCA
// se sirve como «hoy no había nadie que recaptar». Solo un `ok` autoriza a
// callar cuando no hubo candidatos.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { tgAviso } from '@/lib/telegram'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { enviarLoteEmailRecaptacionAsegura } from '@/lib/recaptacion-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 150

const AGENTE = 'correduria_recaptacion_email_lote'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const r = await enviarLoteEmailRecaptacionAsegura()

  if (r.estado === 'sin_configurar') {
    await registrarLatido(AGENTE, false, 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)')
    return NextResponse.json({ ok: false, motivo: 'sin_configurar' }, { status: 200 })
  }
  if (r.estado === 'error') {
    await registrarLatido(AGENTE, false, `no se pudo enviar el lote: ${r.motivo}`)
    await tgAviso('correduria.recaptacion-lote',
      `📧 *Recaptación por email · lote diario*\nNo he podido mandar el lote (${r.motivo}). ` +
      `Esto NO significa que no hubiera nadie: hoy no se ha podido intentar.`,
    ).catch(() => {})
    return NextResponse.json({ ok: false, motivo: r.motivo }, { status: 200 })
  }

  const detalle = `${r.candidatos} candidatos · ${r.enviados} enviados · ${r.fallidos} fallidos · ${r.descartadosPorSilencio} descartados por silencio`
  await registrarLatido(AGENTE, true, detalle)

  if (r.enviados > 0 || r.fallidos > 0 || r.descartadosPorSilencio > 0) {
    const lineasFallos = r.detalleFallos.slice(0, 5).map((f) => `· ${f}`).join('\n')
    const mensaje = [
      `📧 *Recaptación por email · lote diario*`,
      `${r.enviados} enviados de ${r.candidatos} candidatos.`,
      r.fallidos > 0 ? `⚠️ ${r.fallidos} fallidos:\n${lineasFallos}` : null,
      // Los que no abrieron en 3 intentos ya no vuelven a la cola: probablemente
      // ese correo no existe o no lo usan.
      r.descartadosPorSilencio > 0 ? `🔇 ${r.descartadosPorSilencio} lead(s) descartado(s): sin abrir ningún email en 3 intentos.` : null,
    ].filter(Boolean).join('\n')
    await tgAviso('correduria.recaptacion-lote', mensaje).catch(() => {})
  }

  return NextResponse.json({ ok: true, ...r })
}
