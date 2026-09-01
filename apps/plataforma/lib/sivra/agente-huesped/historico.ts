// lib/sivra/agente-huesped/historico.ts — aprender de las conversaciones YA mantenidas.
//
// Idea de Alberto (20/08/2026): «también puedes ver las conversaciones de anteriores huéspedes para
// aprender». En los hilos de Smoobu están las respuestas que él ha dado a mano durante meses — 159
// reservas en lo que va de 2026 —, y ahí vive el conocimiento del piso que no está ni en la guía ni
// en el código.
//
// 🚨 Lo minado NO entra directo: se guarda como `estado='propuesto'` y Alberto confirma por Telegram.
// Un hecho falso aprendido del histórico se propagaría a TODOS los huéspedes futuros, y encima con
// la autoridad de un dato de la casa. Confirmar es barato; desaprender no.
import { smoobuFetch } from '@/lib/smoobu'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { aiComplete } from '@central/core-ai'
import { escapeHtml, tgAvisoBotones, type Boton } from '@/lib/telegram'
import { atribuirEmisor, setEnviados, normalizarTexto } from './atribucion'
import { toPropertyId } from './contexto'
import { htmlATexto } from './guest-app'
import { guardarHecho } from './hechos'
import { paresPregRespuesta, esAutomatico, type MsgMin, type ParQA } from './reglas'

// ── I/O ─────────────────────────────────────────────────────────────────────
// Condensa un par pregunta→respuesta en UNA afirmación sobre el alojamiento. Devuelve '' si el
// modelo no ve ningún dato del piso o si falla: preferimos perder un hecho a inventarlo.
async function condensarHecho(par: ParQA): Promise<string> {
  const system = `Te doy la pregunta de un huésped de un apartamento turístico y la respuesta que le dio el anfitrión.
Extrae UNA sola frase afirmativa, en español, con el DATO del alojamiento que contiene la respuesta (dónde está algo, cómo funciona, qué norma aplica, qué se ofrece y qué no).
Reglas:
- Usa SOLO lo que diga la respuesta. No añadas nada.
- Nada de saludos, nombres de huésped, fechas concretas ni cortesías.
- Si la respuesta no contiene ningún dato del alojamiento (es una cortesía, un "lo consulto", o algo que solo vale para esa reserva), responde exactamente: NADA`
  try {
    const out = await aiComplete(
      [{ role: 'user' as const, content: `PREGUNTA: ${par.pregunta}\n\nRESPUESTA: ${par.respuesta}` }],
      { system, maxTokens: 120, temperature: 0, timeoutMs: 15_000 },
    )
    const t = (out || '').trim().replace(/^["'«]|["'»]$/g, '')
    if (!t || /^nada\b/i.test(t) || t.length < 20) return ''
    return t
  } catch { return '' }
}

export type ResultadoMinado = {
  reservas: number
  pares: number
  propuestos: number
  sinLeer: number       // hilos que NO se pudieron leer: son huecos, no "reservas sin nada que aprender"
  hechos: { id: number; propertyId: string; hecho: string }[]
}

// Recorre las reservas de una ventana y propone hechos. `max` acota el número de reservas por pasada
// (cada una son 2 llamadas a Smoobu + 1 a la IA por par).
export async function minarHistorico(opts: {
  desde: string
  hasta: string
  max?: number
  avisar?: boolean
} ): Promise<ResultadoMinado> {
  const max = Math.max(1, Math.min(opts.max ?? 20, 100))
  const res: ResultadoMinado = { reservas: 0, pares: 0, propuestos: 0, sinLeer: 0, hechos: [] }

  const bookings: any[] | null = await smoobuFetch(
    `/api/reservations?from=${opts.desde}&to=${opts.hasta}&showCancellation=false&pageSize=100`,
    { cache: 'no-store' },
  ).then(r => r.json()).then(d => (Array.isArray(d?.bookings) ? d.bookings : Array.isArray(d?.data) ? d.data : [])).catch(() => null)
  if (bookings === null) throw new Error('no se pudo listar las reservas en Smoobu')

  for (const b of bookings.slice(0, max)) {
    const bookingId = String(b?.id || '')
    if (!bookingId) continue
    res.reservas++
    const propertyId = toPropertyId(b?.apartment?.id, b?.apartment?.name || '')

    const crudos: any[] | null = await smoobuFetch(`/api/reservations/${bookingId}/messages`, { cache: 'no-store' })
      .then(r => r.json()).then(d => (Array.isArray(d?.messages) ? d.messages : Array.isArray(d) ? d : [])).catch(() => null)
    if (crudos === null) { res.sinLeer++; continue }

    // Lo que respondió NUESTRO agente no es conocimiento de Alberto: es la salida del propio modelo.
    // Aprender de ahí sería realimentar sus propias invenciones (justo las que motivaron todo esto).
    const propias = await prisma.$queryRaw<{ respuesta: string }[]>(Prisma.sql`
      SELECT respuesta FROM mensajes_log WHERE booking_id = ${bookingId} AND respuesta <> ''
    `).catch(() => [])
    const nuestras = setEnviados(propias.map(r => r.respuesta))

    const msgs: MsgMin[] = crudos.map((m: any) => {
      const html = String(m.htmlMessage || '')
      const texto = html ? htmlATexto(html) : String(m.message || m.text || '')
      return { from: atribuirEmisor(m), text: texto, automatico: esAutomatico(String(m.subject || ''), texto) }
    }).filter((m: MsgMin) => m.text)

    for (const par of paresPregRespuesta(msgs)) {
      if (nuestras.has(normalizarTexto(par.respuesta))) continue
      res.pares++
      const hecho = await condensarHecho(par)
      if (!hecho) continue
      const id = await guardarHecho({
        propertyId, pregunta: par.pregunta, hecho, origen: 'historico', estado: 'propuesto', bookingRef: bookingId,
      })
      if (!id) continue                 // ya existía ese hecho para el piso
      res.propuestos++
      res.hechos.push({ id, propertyId, hecho })
    }
  }

  if (opts.avisar !== false) await proponerHechos(res.hechos)
  return res
}

// Un mensaje por hecho, con botones. Se mandan de uno en uno a propósito: confirmar en bloque es
// aprobar sin leer, y aquí cada fila acaba en el prompt de todos los huéspedes de ese piso.
export async function proponerHechos(hechos: { id: number; propertyId: string; hecho: string }[]): Promise<void> {
  for (const h of hechos.slice(0, 15)) {
    const botones: Boton[][] = [[
      { texto: '✅ Es correcto', callback: `hch_ok:${h.id}` },
      { texto: '❌ No', callback: `hch_no:${h.id}` },
    ]]
    await tgAvisoBotones('huespedes.historico', 
      `🧠 <b>Aprendido de una conversación tuya</b> · ${escapeHtml(h.propertyId)}` +
      `\n\n«${escapeHtml(h.hecho)}»` +
      `\n\n<i>Si lo confirmas, el agente lo usará como dato de este piso con todos los huéspedes.</i>`,
      botones,
    ).catch(() => {})
  }
}
