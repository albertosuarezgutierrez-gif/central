// lib/correo/lead-correduria-discrepancia-proceso.ts — F3b (19/10/2026): un dato del correo del cliente que NO cuadra con lo que
// ya había (la ficha o una respuesta anterior; p. ej. la fecha de nacimiento). asegura lo guarda PENDIENTE y el expediente no
// queda completo hasta que Alberto elija. Aquí, con red y BD:
//   · `proponerDiscrepancias`: pendiente `tipo='discrepancia'` (SQL 2026-10-19e) + mensaje con un par de botones por dato
//     (📇 lo que había · ✉️ el del correo, `clp_dis:<p>:<i>:f|c`). Sin el SQL o sin Telegram, el aviso dice que se elige en la
//     ficha (nunca se elige solo).
//   · `resolverDiscrepanciaClp`: un solo uso por pulsación (`pendiente → enviando`), asegura aplica la elección
//     (`accion:'elegir'`, nunca toca la ficha); al elegir el último, si ya está completo, se ofrece tarificar (§3.3).
// Las reglas viven en `lead-correduria-respuesta.ts` (puro, con test). Ningún valor llega a Telegram ni a `console.*`.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { tgSendButtons } from '@central/core-telegram'
import { tgAviso, tgAvisoBotones } from '@/lib/telegram/avisos'
import { tarificarLeadAsegura } from '@/lib/seguimiento-asegura'
import { leerDatosPeticion, purgaAlCerrar, type DatosPeticion, type DecisionClp } from './lead-correduria-peticion'
import { botonesDiscrepancias, leerElegir, textoDiscrepancias, type Discrepancia } from './lead-correduria-respuesta'

const actorTelegram = (quien: string) => `agente:telegram-${quien}`

/** Guarda el pendiente y manda los botones. `false` = no se pudo (lo dice el aviso). Nunca lanza. */
export async function proponerDiscrepancias(a: { gmailMessageId: string; datos: DatosPeticion; lista: Discrepancia[] }): Promise<boolean> {
  if (!a.lista.length) return true
  try {
    const datos: DatosPeticion = { ...a.datos, tipo: 'discrepancia', discrepancias: a.lista }
    let id: number
    try {
      const filas = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        INSERT INTO correduria_pendiente_tg (tipo, gmail_message_id, datos, borrador)
        VALUES ('discrepancia', ${a.gmailMessageId}, ${JSON.stringify(datos)}::jsonb, '')
        ON CONFLICT (gmail_message_id, tipo) DO NOTHING
        RETURNING id`)
      if (!filas.length) return true // correo reprocesado: ya se propuso
      id = Number(filas[0].id)
    } catch (e) {
      console.error('[triaje] pendiente de discrepancia (¿falta el SQL 2026-10-19e?):', e instanceof Error ? e.name : 'error')
      const msg = await tgAviso('correduria.lead-respuesta', `${textoDiscrepancias({ id: '—', pila: a.datos.pila, lista: a.lista })}\n⚠️ No he podido preparar los botones: elige en su ficha (el expediente sigue sin estar completo).`).catch(() => null)
      return msg !== null
    }
    const msg = await tgAvisoBotones('correduria.lead-respuesta', textoDiscrepancias({ id, pila: a.datos.pila, lista: a.lista }), botonesDiscrepancias(id, a.lista)).catch(() => null)
    if (msg === null) {
      const p = purgaAlCerrar('discrepancia', 'descartado')
      await prisma.$executeRaw(Prisma.sql`
        UPDATE correduria_pendiente_tg SET estado = 'descartado', resultado = '{"motivo":"sin_telegram"}'::jsonb, datos = datos - ${p.claves}::text[] WHERE id = ${id}`).catch(() => {})
      return false
    }
    await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET tg_message_id = ${msg} WHERE id = ${id}`).catch(() => {})
    return true
  } catch (e) {
    console.error('[triaje] discrepancias:', e instanceof Error ? e.name : 'error')
    return false
  }
}

async function volverAPendiente(id: number, datos?: DatosPeticion): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'pendiente', decidido_por = NULL, decidido_at = NULL${datos ? Prisma.sql`, datos = ${JSON.stringify(datos)}::jsonb` : Prisma.empty}
    WHERE id = ${id} AND estado = 'enviando'`).catch(() => {})
}

/** 📇 / ✉️ `clp_dis:<p>:<i>:f|c`. La línea que sustituye a los botones pulsados; los que quedan vuelven en un mensaje nuevo. */
export async function resolverDiscrepanciaClp(d: Extract<DecisionClp, { ok: true; accion: 'dis' }>): Promise<string> {
  const filas = await prisma.$queryRaw<{ datos: unknown; gmail_message_id: string }[]>(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'enviando', decidido_por = ${actorTelegram(d.quien)}, decidido_at = now()
    WHERE id = ${d.id} AND tipo = 'discrepancia' AND estado = 'pendiente' AND caduca_at > now()
    RETURNING datos, gmail_message_id`).catch(() => null)
  if (filas === null) return '⚠️ <i>No he podido leer la discrepancia: no se ha elegido nada.</i>'
  if (!filas.length) return '<i>Ese botón ya se usó, se descartó o ha caducado: no se ha elegido nada.</i>'
  const datos = leerDatosPeticion(filas[0].datos)
  const item = datos?.discrepancias?.[d.indice]
  if (!datos || !item) { await volverAPendiente(d.id); return '⚠️ <i>No entiendo ese botón: no se ha elegido nada.</i>' }
  if (item.elegida) { await volverAPendiente(d.id); return '<i>Ese dato ya estaba elegido.</i>' }
  const r = await tarificarLeadAsegura({
    accion: 'elegir', clienteId: datos.clienteId, oportunidadIds: [item.oportunidadId], clave: item.clave, eleccion: d.eleccion, actor: actorTelegram(d.quien),
  }).catch(() => ({ status: 502, json: null }))
  const e = leerElegir(r.status, r.json)
  if (e.estado === 'error' || e.estado === 'no_encontrada') { await volverAPendiente(d.id); return `⚠️ <i>No se ha podido elegir (${e.motivo}): el botón sigue vivo.</i>` }
  const lista = datos.discrepancias!.map((x, i) => (i === d.indice ? { ...x, elegida: d.eleccion } : x))
  const quedan = lista.filter((x) => !x.elegida)
  const linea = e.estado === 'no_pendiente'
    ? '<i>asegura ya no lo tenía pendiente (elegido antes): no se ha cambiado nada.</i>'
    : `✅ Elegido ${d.eleccion === 'ficha' ? '📇 lo que había' : '✉️ el del correo'}.${e.corregirFicha ? ' ⚠️ La ficha sigue diciendo lo de antes: corrígela si el bueno es el del correo (los bots leen al tomador de la ficha).' : ''}`
  if (quedan.length) {
    await volverAPendiente(d.id, { ...datos, discrepancias: lista })
    await tgSendButtons(textoDiscrepancias({ id: d.id, pila: datos.pila, lista }), botonesDiscrepancias(d.id, lista)).catch(() => null)
    return linea
  }
  const p = purgaAlCerrar('discrepancia', 'enviado')
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'enviado', resultado = ${JSON.stringify({ elegidas: lista.length })}::jsonb, datos = ${JSON.stringify({ ...datos, discrepancias: lista })}::jsonb - ${p.claves}::text[]
    WHERE id = ${d.id} AND estado = 'enviando'`).catch(() => {})
  if (e.estado === 'ok' && e.completo) {
    const { ofrecerTarificacion } = await import('./lead-correduria-tarificar-proceso')
    await ofrecerTarificacion({
      gmailMessageId: filas[0].gmail_message_id, datos: { ...datos, tipo: 'tarificar', discrepancias: undefined },
      resumen: '⚖️ Discrepancias resueltas: datos completos.', asuntoOriginal: datos.asunto,
    })
    return `${linea}\n🧮 Datos completos: te mando el aviso de tarificar.`
  }
  return `${linea}\nNo quedan datos por elegir.`
}
