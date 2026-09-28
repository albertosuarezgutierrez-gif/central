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
import { smoobuFetch } from '@/lib/smoobu'
import { esModoNoche } from './noche'
import { minutosAtencion, peldanoRancio, respondidoFuera, textoEspera, MIN_RECORDATORIO, MIN_ACUSE_ESPERA } from './rancio'
import { construirContexto } from './contexto'
import { esEcoPropio } from './atribucion'
import { esPlantillaHost } from './reglas'
import { confirmarRespondidoFuera } from './telegram-msg'

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

// ¿Hoy es el día de salida o posterior? `undefined` si Smoobu no responde o no trae la fecha: en la
// duda se acusa como siempre, porque callar ante un huésped que espera es el fallo caro.
async function estanciaAcabando(bookingId: string, ahora: Date): Promise<boolean | undefined> {
  const r: any = await smoobuFetch(`/api/reservations/${bookingId}`, { cache: 'no-store' })
    .then(x => (x.ok ? x.json() : null)).catch(() => null)
  const salida = String(r?.departure || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(salida)) return undefined
  return ahora.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }) >= salida
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
    [{ texto: '✋ Ya respondido', callback: `hsp_done:${f.booking_id}` }],
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

// ¿Ya se le contestó a mano fuera del agente? Si sí, se cierra el pendiente (se «olvida») y se le
// dice a Alberto qué respuesta se tomó como buena, para que un falso positivo no quede en silencio.
// Si Smoobu no responde, `false`: en la duda el barrido sigue como siempre.
async function cerrarSiRespondidoFuera(f: Fila & { tg_message_id: number | null }): Promise<boolean> {
  const ctx = await construirContexto(f.booking_id, f.idioma || 'es').catch(() => null)
  if (!ctx) return false
  const respuesta = respondidoFuera(ctx.historial, t => esEcoPropio(t, ctx.enviados) || esPlantillaHost(t, ctx.guestName))
  if (!respuesta) return false
  await prisma.$executeRaw(Prisma.sql`DELETE FROM mensajes_pendientes_tg WHERE booking_id = ${f.booking_id}`).catch(() => {})
  await confirmarRespondidoFuera(f.tg_message_id).catch(() => {})
  await tgSend(`✋ <b>Reserva ${f.booking_id}: pendiente cerrado</b> — ya se le respondió fuera del agente, no le mando nada.\n\n<b>Respuesta que he visto:</b> ${escapeHtml(recorte(respuesta, 300))}`).catch(() => {})
  return true
}

/**
 * Barrido de PENDIENTES RANCIOS. Solo en horario de atención: de noche manda `noche-guardia`, que
 * ya acusa recibo al escalar y tiene su propio último recurso para las urgencias.
 */
export async function barrerPendientesRancios(): Promise<{ recordados: number; acusados: number; cerrados: number }> {
  if (esModoNoche()) return { recordados: 0, acusados: 0, cerrados: 0 }

  // Prefiltro barato en SQL (los umbrales se miden en minutos de ATENCIÓN, que SQL no sabe contar):
  // nada por debajo de MIN_RECORDATORIO de reloj puede haberlos superado todavía.
  const filas = await prisma.$queryRaw<(Fila & { tg_message_id: number | null })[]>(Prisma.sql`
    SELECT booking_id, property_id, borrador, categoria, pregunta, idioma, created_at,
           recordatorio_at, acuse_espera_at, no_requiere_respuesta, tg_message_id
    FROM mensajes_pendientes_tg
    WHERE created_at < now() - (${MIN_RECORDATORIO} || ' minutes')::interval
      AND NOT no_requiere_respuesta
      AND (recordatorio_at IS NULL OR acuse_espera_at IS NULL)
    ORDER BY created_at ASC
    LIMIT 20
  `).catch(() => [] as (Fila & { tg_message_id: number | null })[])

  const ahora = new Date()
  let recordados = 0
  let acusados = 0
  let cerrados = 0
  for (const f of filas) {
    const minutos = minutosAtencion(new Date(f.created_at), ahora)
    // Solo se pregunta a Smoobu cuando el acuse está en juego: es lo único que depende de la fecha.
    const tocaAcuse = !f.acuse_espera_at && minutos >= MIN_ACUSE_ESPERA
    const acabando = tocaAcuse ? await estanciaAcabando(f.booking_id, ahora) : undefined
    const peldano = peldanoRancio({
      minutos,
      recordado: !!f.recordatorio_at,
      acusado: !!f.acuse_espera_at,
      noRequiereRespuesta: !!f.no_requiere_respuesta,
      estanciaAcabando: acabando,
    })
    // Antes de recordar o acusar, se mira el hilo: solo cuando algo va a salir (≤2 veces por pendiente).
    if ((peldano || (tocaAcuse && acabando === true)) && await cerrarSiRespondidoFuera(f)) { cerrados++; continue }
    if (tocaAcuse && acabando === true) {
      // Se cierra el peldaño SIN enviar: si la fila siguiera con `acuse_espera_at` NULL, volvería al
      // prefiltro cada 3 min y, con el LIMIT 20 por antigüedad, acabaría quitándole el turno a los
      // pendientes nuevos. El recordatorio a Alberto sí sale si aún no se había dado.
      if (peldano === 'recordatorio') { await recordar(f, minutos); recordados++ }
      await prisma.$executeRaw(Prisma.sql`
        UPDATE mensajes_pendientes_tg
        SET acuse_espera_at = now(), recordatorio_at = COALESCE(recordatorio_at, now())
        WHERE booking_id = ${f.booking_id}
      `).catch(() => {})
      await tgSend(`🧳 Reserva ${f.booking_id}: <b>no le mando el «lo estamos revisando»</b> — hoy es su día de salida. El borrador sigue en tu cola por si quieres contestar o descartarlo.`).catch(() => {})
      continue
    }
    if (peldano === 'acuse') { if (await acusarEspera(f, minutos)) acusados++ }
    else if (peldano === 'recordatorio') { await recordar(f, minutos); recordados++ }
  }
  return { recordados, acusados, cerrados }
}
