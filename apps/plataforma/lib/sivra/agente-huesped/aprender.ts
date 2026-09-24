// lib/sivra/agente-huesped/aprender.ts — log, aprendizaje, gaps y config de autonomía.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { esHechoDelPiso } from './reglas'
import { guardarHecho } from './hechos'
import { destilarHecho } from './destilar'
import { UMBRAL_PARECIDO, LONGITUD_MINIMA, palabrasClave, regexClaves } from './similitud-reglas'
import { tgSend } from '@/lib/telegram'

export async function logMensaje(p: {
  bookingId: string; propertyId: string; categoria: string; pregunta: string; respuesta: string
  fuente: string; confidence: number; sentimiento: string; needs_human: boolean; auto_sent: boolean; edited: boolean
}): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_log (booking_id, property_id, categoria, pregunta, respuesta, fuente, confidence, sentimiento, needs_human, auto_sent, edited)
    VALUES (${p.bookingId}, ${p.propertyId}, ${p.categoria}, ${p.pregunta}, ${p.respuesta}, ${p.fuente}, ${p.confidence}, ${p.sentimiento}, ${p.needs_human}, ${p.auto_sent}, ${p.edited})
  `).catch(() => {})
}

// Guarda lo que Alberto aprueba o corrige. DOS destinos, no uno:
//   · HECHO del piso (`mensajes_hechos`) si el huésped preguntaba algo y la respuesta enseña algo de
//     la vivienda → permanente, va SIEMPRE al prompt.
//   · Ejemplo de ESTILO (`mensajes_aprendizaje`) en cualquier otro caso (cortesías, despedidas) →
//     solo alimenta el tono y caduca con los 8 últimos.
// Antes iba todo al mismo montón y el conocimiento se perdía debajo de los «gracias a ti».
//
// `huecoGuia` = el aviso de Telegram DECLARÓ que esto no estaba en la guía y prometió aprenderlo.
// Sin él manda `esHechoDelPiso`, que exige que el HUÉSPED haya preguntado algo — y hay huecos reales
// que llegan como afirmación («me han escrito por WhatsApp pidiendo datos»): esos caían en el montón
// de estilo y caducaban con los 8 últimos, que es exactamente «el agente no aprende» (medido el
// 02/09/2026: el aviso de phishing de Mirjam, 31/08, acabó en `mensajes_aprendizaje`).
//
// Y lo que se guarda es el hecho DESTILADO, no la carta: ver `destilar.ts`. Si no se puede destilar
// NO se guarda un hecho —un hecho falso se le cuenta a todos los huéspedes futuros— y, cuando se
// había prometido aprenderlo, se DICE en vez de dejar creer que quedó aprendido.
export async function aprenderCorreccion(p: {
  propertyId: string; categoria: string; pregunta: string; respuestaFinal: string; huecoGuia?: boolean
}): Promise<void> {
  if (p.huecoGuia === true || esHechoDelPiso(p.pregunta, p.respuestaFinal)) {
    const hecho = await destilarHecho({ pregunta: p.pregunta, respuesta: p.respuestaFinal })
    if (hecho) {
      await guardarHecho({ propertyId: p.propertyId, pregunta: p.pregunta, hecho, origen: 'alberto', estado: 'confirmado' })
      return
    }
    if (p.huecoGuia === true) {
      await tgSend('⚠️ No he podido resumir esa respuesta como hecho del piso, así que NO la he aprendido. Si quieres que la recuerde, dímela en una frase (p. ej. «solo escribimos por los mensajes de Booking, nunca por WhatsApp»).').catch(() => {})
    }
  }
  const norm = (p.pregunta || '').toLowerCase().slice(0, 300)
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_aprendizaje (property_id, categoria, pregunta_norm, respuesta_final)
    VALUES (${p.propertyId}, ${p.categoria}, ${norm}, ${p.respuestaFinal})
  `).catch(() => {})
}

// Registra un hueco de la guía (incrementa el contador si ya existía esa pregunta para el piso).
//
// El match es por PARECIDO, no por igualdad (04/09/2026). Con `=` exacto, los cuatro avisos de
// phishing de finales de agosto quedaron como cuatro filas de `veces = 1` en vez de una de 4, así
// que el contador no subía casi nunca y ningún hueco recurrente destacaba. Mismas dos señales que
// `similitud.ts` (trigrama con guarda de longitud + palabra de contenido en común) y por las mismas
// razones medidas; la exacta gana, luego la que comparte palabra, luego la más parecida.
export async function registrarGap(propertyId: string, pregunta: string): Promise<void> {
  const norm = (pregunta || '').toLowerCase().slice(0, 200)
  if (!norm) return
  const trigramaVale = norm.length >= LONGITUD_MINIMA
  const re = regexClaves(palabrasClave(norm))
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT id FROM mensajes_guia_gaps
    WHERE property_id = ${propertyId}
      AND (
        pregunta = ${norm}
        OR (${trigramaVale}::boolean AND extensions.word_similarity(${norm}, pregunta) >= ${UMBRAL_PARECIDO})
        OR (${re}::text IS NOT NULL AND pregunta ~* ${re})
      )
    ORDER BY (pregunta = ${norm}) DESC,
             (${re}::text IS NOT NULL AND pregunta ~* ${re}) DESC,
             extensions.word_similarity(${norm}, pregunta) DESC
    LIMIT 1
  `).catch(() => [])
  if (rows[0]) {
    await prisma.$executeRaw(Prisma.sql`UPDATE mensajes_guia_gaps SET veces = veces + 1, ultima_fecha = now() WHERE id = ${rows[0].id}`).catch(() => {})
  } else {
    await prisma.$executeRaw(Prisma.sql`INSERT INTO mensajes_guia_gaps (property_id, pregunta) VALUES (${propertyId}, ${norm})`).catch(() => {})
  }
}
