// lib/sivra/agente-huesped/noche-guardia.ts — efectos del MODO NOCHE (la política vive en `noche.ts`).
//
// Dos entradas:
//   · `acusarNocturno(...)`  — lo llama el orquestador cuando un mensaje ESCALA fuera de horario.
//   · `barrerUltimoRecurso()` — lo llama el sondeo de `/api/sivra/mensajes/auto-reply` (cada 3 min).
//
// Ninguna de las dos redacta nada: los textos son constantes por idioma (ver `noche.ts`), porque el
// acuse es la red de seguridad y no puede depender de la IA ni del clasificador — que son justo lo
// que puede estar caído a las 3 de la mañana.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { tgSend, escapeHtml } from '@/lib/telegram'
import { enviarAlHuesped } from './enviar'
import { esUrgenciaNocturna, textoAcuse, textoUltimoRecurso, MINUTOS_ULTIMO_RECURSO } from './noche'
import type { Contexto } from './contexto'

// Acusa recibo al huésped fuera de horario y, si es urgencia de acceso o avería, despierta a Alberto.
//
// Se llama DESPUÉS de `proponerPorTelegram` (la fila de `mensajes_pendientes_tg` ya existe, y es
// esa fila la que el barrido usa después para saber que nadie ha contestado todavía).
//
// El aviso urgente sale por `tgSend` y NO por `tgAviso`: los avisos tienen interruptor por canal, y
// un interruptor apagado convertiría «te despierto» en silencio sin que nada fallara.
export async function acusarNocturno(ctx: Contexto, pregunta: string): Promise<'acuse' | 'urgencia' | 'ya_acusado'> {
  const urgente = esUrgenciaNocturna(pregunta)

  // Un acuse por noche y por reserva: si el huésped escribe tres veces a las 23:30 no recibe tres
  // veces el mismo texto. 8 h cubre la noche entera (21:00 → 09:00) sin tapar la noche siguiente.
  const yaFilas = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT count(*)::bigint AS n FROM mensajes_pendientes_tg
    WHERE booking_id = ${ctx.bookingId} AND acuse_nocturno_at > now() - interval '8 hours'
  `).catch(() => [] as { n: bigint }[])
  const yaAcusado = Number(yaFilas?.[0]?.n || 0) > 0

  if (!yaAcusado) {
    const ok = await enviarAlHuesped(ctx.reservationId, textoAcuse(ctx.lang, urgente))
    // Si Smoobu rechaza el acuse NO se marca la fila: así el siguiente mensaje del huésped vuelve a
    // intentarlo, y sobre todo no damos por avisado a alguien que no ha recibido nada.
    if (ok) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE mensajes_pendientes_tg
        SET acuse_nocturno_at = now(), urgente_nocturno = ${urgente}
        WHERE booking_id = ${ctx.bookingId}
      `).catch(() => {})
    } else {
      await tgSend(`⚠️ <b>Modo noche</b>: no he podido enviarle el acuse de recibo a ${escapeHtml(ctx.guestName)} (reserva ${ctx.bookingId}). Smoobu rechazó el envío — el huésped está sin respuesta.`).catch(() => {})
    }
  } else if (urgente) {
    // Ya se acusó antes esta noche, pero AHORA es urgente: la fila tiene que reflejarlo para que el
    // barrido lo recoja (si no, una urgencia que llega en el segundo mensaje no derivaría nunca).
    await prisma.$executeRaw(Prisma.sql`
      UPDATE mensajes_pendientes_tg SET urgente_nocturno = true WHERE booking_id = ${ctx.bookingId}
    `).catch(() => {})
  }

  if (urgente) {
    await tgSend(
      `🚨🚨 <b>URGENCIA NOCTURNA</b> — ${escapeHtml(ctx.property)} · ${escapeHtml(ctx.guestName)} (reserva ${ctx.bookingId})` +
      `\n\n<b>Huésped:</b> ${escapeHtml(pregunta)}` +
      `\n\n⏱️ Tienes ${MINUTOS_ULTIMO_RECURSO} min: si no respondes, le diré que contacte con el servicio de atención de su portal de reserva.` +
      `\n<i>El borrador con botones va en el mensaje de arriba.</i>`,
    ).catch(() => {})
    return 'urgencia'
  }
  return yaAcusado ? 'ya_acusado' : 'acuse'
}

// Barrido del ÚLTIMO RECURSO. Una urgencia acusada hace más de MINUTOS_ULTIMO_RECURSO cuyo pendiente
// SIGUE en la tabla = Alberto no ha contestado (al enviar o descartar, el webhook borra la fila).
// Entonces se le dice al huésped que acuda al portal de reserva. Va el último a propósito: el portal
// no puede abrir una puerta, y su llamada abre un caso contra el anfitrión.
export async function barrerUltimoRecurso(): Promise<number> {
  const filas = await prisma.$queryRaw<{ booking_id: string; idioma: string | null }[]>(Prisma.sql`
    SELECT booking_id, idioma FROM mensajes_pendientes_tg
    WHERE urgente_nocturno = true
      AND acuse_nocturno_at IS NOT NULL
      AND acuse_nocturno_at < now() - (${MINUTOS_ULTIMO_RECURSO} || ' minutes')::interval
      AND ultimo_recurso_at IS NULL
  `).catch(() => [] as { booking_id: string; idioma: string | null }[])

  let enviados = 0
  for (const f of filas) {
    const ok = await enviarAlHuesped(f.booking_id, textoUltimoRecurso(f.idioma || 'es'))
    // Se marca SIEMPRE, salga o no: si Smoobu falla, reintentarlo cada 3 minutos llenaría el hilo del
    // huésped de mensajes iguales en cuanto se recuperase. El fallo se dice por Telegram.
    await prisma.$executeRaw(Prisma.sql`
      UPDATE mensajes_pendientes_tg SET ultimo_recurso_at = now() WHERE booking_id = ${f.booking_id}
    `).catch(() => {})
    if (ok) enviados++
    await tgSend(ok
      ? `🕐 <b>Modo noche</b>: pasaron ${MINUTOS_ULTIMO_RECURSO} min sin respuesta (reserva ${f.booking_id}). Le he dicho al huésped que contacte con el servicio de atención de su portal de reserva.`
      : `⚠️ <b>Modo noche</b>: pasaron ${MINUTOS_ULTIMO_RECURSO} min sin respuesta (reserva ${f.booking_id}) y ADEMÁS falló el envío del último recurso. El huésped sigue sin ninguna salida.`,
    ).catch(() => {})
  }
  return enviados
}
