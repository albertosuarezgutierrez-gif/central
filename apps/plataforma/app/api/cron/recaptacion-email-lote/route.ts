// ────────────────────────────────────────────────────────────────────────────
// Envío AUTOMÁTICO diario de recaptación por email (leads del volcado
// sin vencimiento, solo-email —sin teléfono usable—, no en cooldown, no
// dados de baja). A quien tiene teléfono se le sigue trabajando a mano por
// WhatsApp desde `/correduria/vencimientos`; este cron es SOLO para quien no tiene ningún
// otro canal, que si no se queda sin recaptar nunca.
//
// 🚨 Igual que `correduria-renovaciones`: un fallo de lectura del puerto NUNCA
// se sirve como «hoy no había nadie que recaptar». Solo un `ok` autoriza a
// callar cuando no hubo candidatos.
//
// 30/09/2026: el bloque «Recaptación» de /correduria se quitó (esos leads se
// trabajan en Vencimientos), pero este envío SIGUE. Además del resumen diario,
// la pasada que vacía la cola de PRIMEROS envíos manda un aviso de fin de
// campaña con las aperturas acumuladas (`lib/recaptacion-campana.ts`), con id
// propio y como mucho una vez cada 60 días (dedupe por la bitácora de avisos).
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { tgAviso } from '@/lib/telegram'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { enviarLoteEmailRecaptacionAsegura } from '@/lib/recaptacion-asegura'
import {
  AVISO_FIN_CAMPANA, DIAS_SIN_REPETIR_FIN, decidirAvisoFinCampana, vaciaLaColaDePrimeros,
} from '@/lib/recaptacion-campana'

export const dynamic = 'force-dynamic'
export const maxDuration = 150

const AGENTE = 'correduria_recaptacion_email_lote'

/**
 * ¿Salió ya el aviso de fin de campaña en los últimos `DIAS_SIN_REPETIR_FIN`
 * días? `null` = la bitácora no se pudo leer. A diferencia del canario (que
 * prefiere un duplicado a un silencio), aquí un fallo NO se toma por «no ha
 * salido»: el aviso es informativo, y avisar a ciegas es justo la repetición
 * diaria que este dedupe existe para evitar. Solo cuenta lo `enviado` (un
 * `omitido` es que Alberto lo tiene silenciado).
 */
async function finCampanaYaAvisado(): Promise<boolean | null> {
  try {
    const filas = await prisma.$queryRaw<{ n: bigint | number | null }[]>`
      SELECT count(*) AS n FROM telegram_avisos_log
      WHERE aviso_id = ${AVISO_FIN_CAMPANA} AND estado = 'enviado'
        AND enviado_at > now() - make_interval(days => ${DIAS_SIN_REPETIR_FIN}::int)
    `
    const n = filas[0]?.n
    // `count(*)` sin GROUP BY siempre devuelve una fila: si no llega, no se sabe.
    if (n === undefined || n === null) return null
    return Number(n) > 0
  } catch (e) {
    console.warn('[recaptacion-email-lote] bitácora de avisos no disponible:', e)
    return null
  }
}

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

  // Fin de campaña: se decide ANTES del latido para que una bitácora ilegible
  // quede anotada en su detalle (el aviso no sale, y eso no puede ser mudo).
  const yaAvisado = vaciaLaColaDePrimeros(r) ? await finCampanaYaAvisado() : null
  const fin = decidirAvisoFinCampana(r, yaAvisado)

  // `null` = asegura no lo manda o no lo pudo leer: se dice, nunca se pinta 0.
  const pendientes = r.pendientesPrimerEnvio === null
    ? 'pendientes de primer envío sin leer'
    : `${r.pendientesPrimerEnvio} pendientes de primer envío`
  const primeros = r.primerosEnviados === null ? 'primeros sin leer' : `${r.primerosEnviados} primeros`
  const notaFin = fin.estado === 'bitacora_ilegible'
    ? ' · fin de campaña NO avisado: bitácora de avisos ilegible'
    : fin.estado === 'ya_avisado' ? ` · fin de campaña ya avisado (<${DIAS_SIN_REPETIR_FIN} días)` : ''
  const detalle = `${r.candidatos} candidatos · ${r.enviados} enviados (${primeros}) · ${r.fallidos} fallidos · ${r.descartadosPorSilencio} descartados por silencio · ${pendientes}${notaFin}`
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

  // Id LITERAL (lo rastrea el guardián del catálogo); es `AVISO_FIN_CAMPANA`,
  // y `recaptacion-campana.test.ts` vigila que no diverjan.
  if (fin.estado === 'avisar') await tgAviso('correduria.recaptacion-fin', fin.texto).catch(() => {})

  return NextResponse.json({ ok: true, ...r })
}
