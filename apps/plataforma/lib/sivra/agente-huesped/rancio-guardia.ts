// lib/sivra/agente-huesped/rancio-guardia.ts — efectos de los PENDIENTES RANCIOS.
// (La política —cuánto se espera y qué toca— vive en `rancio.ts`, que es pura y testeada.)
//
// Lo llama el sondeo de `/api/sivra/mensajes/auto-reply` (cada 3 min), igual que
// `barrerUltimoRecurso`. Los dos barridos son hermanos y NO se pisan: aquel solo actúa sobre
// urgencias de MADRUGADA ya acusadas; este solo corre EN HORARIO de atención.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { tgSend, tgSendButtons, escapeHtml, type Boton } from '@/lib/telegram'
import { enviarAlHuesped } from './enviar'
import { esModoNoche } from './noche'
import { minutosAtencion, peldanoRancio, textoEspera, MIN_RECORDATORIO, MIN_ACUSE_ESPERA } from './rancio'

type Fila = {
  booking_id: string
  property_id: string | null
  borrador: string | null
  categoria: string | null
  pregunta: string | null
  idioma: string | null
  created_at: Date
  recordatorio_at: Date | null
  acuse_espera_at: Date | null
  no_requiere_respuesta: boolean
}

function recorte(t: string, n: number): string {
  const s = (t || '').trim()
  return s.length > n ? `${s.slice(0, n)}…` : s
}

// Vuelve a poner el borrador delante de Alberto, con los mismos botones que la propuesta original
// (que a estas alturas ya ha bajado en el hilo de Telegram). Sale por `tgSend*` y NO por `tgAviso*`
// a propósito: los avisos tienen interruptor por canal, y un interruptor apagado convertiría el
// recordatorio —que es la red de seguridad— en silencio sin que nada fallara.
async function recordar(f: Fila, minutos: number): Promise<void> {
  const horas = Math.floor(minutos / 60)
  const cuanto = horas >= 1 ? `${horas} h` : `${minutos} min`
  const cuerpo = `⏳ <b>Sigue esperando respuesta</b> — reserva ${f.booking_id}` +
    (f.property_id ? ` · ${escapeHtml(f.property_id.replace(/^prop_/, '').replace(/_/g, ' '))}` : '') +
    `\n<i>${cuanto} de horario de atención desde que te lo propuse (la noche no cuenta).</i>` +
    `\n\n<b>Huésped:</b> ${escapeHtml(recorte(f.pregunta || '', 400))}` +
    `\n\n<b>Borrador:</b>\n${escapeHtml(recorte(f.borrador || '(sin borrador — escribe tú con Modificar)', 900))}` +
    `\n\n<i>Si a los ${Math.floor(MIN_ACUSE_ESPERA / 60)} h de atención sigue sin respuesta, le diré al huésped que lo estamos revisando.</i>`
  const botones: Boton[][] = [
    [{ texto: '✅ Enviar', callback: `hsp_send:${f.booking_id}` }, { texto: '✏️ Modificar', callback: `hsp_edit:${f.booking_id}` }],
    [{ texto: '🔧 Retocar sobre el borrador', callback: `hsp_tune:${f.booking_id}` }, { texto: '🚫 No responder', callback: `hsp_skip:${f.booking_id}` }],
  ]
  const mid = await tgSendButtons(cuerpo, botones).catch(() => null)
  // El `tg_message_id` pasa a ser el del recordatorio: es el mensaje que Alberto tiene delante, y es
  // el que `confirmarEnviado` edita a «✅ Enviado» cuando pulse. Si Telegram falla, se deja el viejo.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE mensajes_pendientes_tg
    SET recordatorio_at = now()${mid ? Prisma.sql`, tg_message_id = ${mid}` : Prisma.empty}
    WHERE booking_id = ${f.booking_id}
  `).catch(() => {})
}

// Peldaño 2: el huésped deja de estar a oscuras. No responde su pregunta (no la sabemos: por eso
// escaló), solo dice que se está mirando.
async function acusarEspera(f: Fila, minutos: number): Promise<boolean> {
  const ok = await enviarAlHuesped(f.booking_id, textoEspera(f.idioma || 'es'))
  // Se marca SIEMPRE, salga o no: si Smoobu falla, reintentarlo cada 3 min llenaría el hilo del
  // huésped de mensajes iguales en cuanto se recuperase. El fallo se dice por Telegram.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE mensajes_pendientes_tg
    SET acuse_espera_at = now(), recordatorio_at = COALESCE(recordatorio_at, now())
    WHERE booking_id = ${f.booking_id}
  `).catch(() => {})
  const horas = Math.floor(minutos / 60)
  await tgSend(ok
    ? `🕐 <b>${horas} h de atención sin responder</b> a la reserva ${f.booking_id}. Le he dicho al huésped que estamos revisando su consulta — ahora hay una respuesta prometida.\n\n<b>Preguntó:</b> ${escapeHtml(recorte(f.pregunta || '', 300))}`
    : `⚠️ <b>${horas} h de atención sin responder</b> a la reserva ${f.booking_id} y ADEMÁS falló el envío del acuse (Smoobu lo rechazó). El huésped sigue sin recibir absolutamente nada.`,
  ).catch(() => {})
  return ok
}

/**
 * Barrido de PENDIENTES RANCIOS. Solo en horario de atención: de noche manda `noche-guardia`, que
 * ya acusa recibo al escalar y tiene su propio último recurso para las urgencias.
 */
export async function barrerPendientesRancios(): Promise<{ recordados: number; acusados: number }> {
  if (esModoNoche()) return { recordados: 0, acusados: 0 }

  // Prefiltro barato en SQL (los umbrales se miden en minutos de ATENCIÓN, que SQL no sabe contar):
  // nada por debajo de MIN_RECORDATORIO de reloj puede haberlos superado todavía.
  const filas = await prisma.$queryRaw<Fila[]>(Prisma.sql`
    SELECT booking_id, property_id, borrador, categoria, pregunta, idioma, created_at,
           recordatorio_at, acuse_espera_at, no_requiere_respuesta
    FROM mensajes_pendientes_tg
    WHERE created_at < now() - (${MIN_RECORDATORIO} || ' minutes')::interval
      AND NOT no_requiere_respuesta
      AND (recordatorio_at IS NULL OR acuse_espera_at IS NULL)
    ORDER BY created_at ASC
    LIMIT 20
  `).catch(() => [] as Fila[])

  const ahora = new Date()
  let recordados = 0
  let acusados = 0
  for (const f of filas) {
    const minutos = minutosAtencion(new Date(f.created_at), ahora)
    const peldano = peldanoRancio({
      minutos,
      recordado: !!f.recordatorio_at,
      acusado: !!f.acuse_espera_at,
      noRequiereRespuesta: !!f.no_requiere_respuesta,
    })
    if (peldano === 'acuse') { if (await acusarEspera(f, minutos)) acusados++ }
    else if (peldano === 'recordatorio') { await recordar(f, minutos); recordados++ }
  }
  return { recordados, acusados }
}
