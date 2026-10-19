// lib/correo/lead-correduria-tarificar-proceso.ts — F3a con RED y BD: ofrecer y ejecutar la tarificación con BOTS de un lead
// (19/10/2026). Las reglas viven en `lead-correduria-tarificar.ts` (puro, con test) y en asegura
// (`tarificacion-lead-puro.ts`). Aquí solo se encadenan:
//   · `ofrecerTarificacion`: revisión gratis en asegura → aviso §3.3 con 🤖 (pendiente `tipo='tarificar'`), o repregunta F2
//     si a los bots les falta algo que el cliente puede dar, o solo el aviso («sin bot para <ramo>»).
//   · `resolverTarificarClp` (🤖 `clp_tar`): un solo uso (`pendiente → enviando`), asegura reserva el cupo del día y encola.
//     Tope → el pendiente vuelve a esperar EN COLA (`resultado.cola = día`) y llega ➕ `clp_top`.
//   · `resolverTopeClp` (➕ `clp_top`): un solo uso por mensaje (fila `tope:<día>:<mensaje>`), amplía 10 y relanza la cola.
// Nunca lanza; ningún dato personal en `console.*` ni en Telegram. Nunca habla con Codeoscopic (0,50€): solo bots.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { escapeHtml, tgSend, tgSendButtons } from '@central/core-telegram'
import { tgAviso, tgAvisoBotones } from '@/lib/telegram/avisos'
import { tarificarLeadAsegura } from '@/lib/seguimiento-asegura'
import { CLAVES_PII_PENDIENTE, leerDatosPeticion, type DatosPeticion } from './lead-correduria-peticion'
import { plantillaRepregunta } from './lead-correduria-respuesta'
import { proponerPeticion } from './lead-correduria-pendiente'
import {
  botonTope, botonesTarificar, decidirOferta, estadoPendienteTras, leerAmpliar, leerRevision, leerTarificar, lineaContador, lineaTrasTarificar,
  textoBotonVivo, textoTarificar, textoTope, type ResultadoTarificar, type Revision,
} from './lead-correduria-tarificar'

const PURGA = Prisma.sql`datos = datos - ${[...CLAVES_PII_PENDIENTE]}::text[], borrador = ''`
const actorTelegram = (quien: string) => `agente:telegram-${quien}`
/** La línea «✅ Datos completos — listo para tarificar» de F2 solo vale si de verdad se ofrece 🤖. */
const sinListo = (resumen: string) => resumen.replace(/\n✅ <b>Datos completos[^\n]*/g, '')

/**
 * Datos completos (F2) → ¿qué se ofrece? `datos` es el de la petición (para una repregunta en el hilo) con
 * `tipo: 'tarificar'`. Devuelve si se avisó. Nunca lanza.
 */
export async function ofrecerTarificacion(a: { gmailMessageId: string; datos: DatosPeticion; resumen: string; asuntoOriginal: string }): Promise<boolean> {
  try {
    const r = await tarificarLeadAsegura({ accion: 'revisar', clienteId: a.datos.clienteId, oportunidadIds: a.datos.oportunidadIds, actor: 'agente:triaje-correo' })
      .catch(() => ({ status: 502, json: null }))
    const rev = leerRevision(r.status, r.json)
    if (rev.estado !== 'ok') {
      const msg = await tgAviso('correduria.lead-tarificar', `${sinListo(a.resumen)}\n\n⚠️ Datos completos, pero no he podido comprobar los bots (${rev.motivo}): no te ofrezco tarificar todavía.`).catch(() => null)
      return msg !== null
    }
    const oferta = decidirOferta(rev)
    if (oferta.tipo === 'repregunta') {
      const plantilla = plantillaRepregunta({ pila: a.datos.pila, ramos: a.datos.ramos, faltan: oferta.preguntar, invalidos: [], asuntoOriginal: a.asuntoOriginal })
      const resumen = `${sinListo(a.resumen)}\n${textoTarificar({ id: null, pila: a.datos.pila, revision: rev })}`
      if (plantilla) {
        const p = await proponerPeticion({
          gmailMessageId: a.gmailMessageId, datos: { ...a.datos, asunto: plantilla.asunto, tipo: 'repregunta' },
          borrador: plantilla.cuerpo, preguntas: plantilla.preguntas, catastro: null, resumen,
        })
        if (p) return true
      }
      const msg = await tgAviso('correduria.lead-tarificar', resumen).catch(() => null)
      return msg !== null
    }
    if (oferta.tipo === 'aviso') {
      const msg = await tgAviso('correduria.lead-tarificar', `${sinListo(a.resumen)}\n\n${textoTarificar({ id: null, pila: a.datos.pila, revision: rev })}`).catch(() => null)
      return msg !== null
    }
    // 🤖: pendiente de un solo uso; un correo reprocesado no vuelve a mandar el botón.
    let id: number
    try {
      const filas = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        INSERT INTO correduria_pendiente_tg (tipo, gmail_message_id, datos, borrador)
        VALUES ('tarificar', ${a.gmailMessageId}, ${JSON.stringify({ ...a.datos, tipo: 'tarificar' })}::jsonb, '')
        ON CONFLICT (gmail_message_id, tipo) DO NOTHING
        RETURNING id`)
      if (!filas.length) return true
      id = Number(filas[0].id)
    } catch (e) {
      console.error('[triaje] pendiente de tarificar (¿falta el SQL 2026-10-19b?):', e instanceof Error ? e.name : 'error')
      const msg = await tgAviso('correduria.lead-tarificar', `${a.resumen}\n\n${textoTarificar({ id: null, pila: a.datos.pila, revision: rev })}\n⚠️ No he podido preparar el botón: tarifícalo desde la ficha.`).catch(() => null)
      return msg !== null
    }
    const texto = `${a.resumen}\n\n${textoTarificar({ id, pila: a.datos.pila, revision: rev })}`
    const msg = await tgAvisoBotones('correduria.lead-tarificar', texto, botonesTarificar(id)).catch(() => null)
    if (msg === null) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE correduria_pendiente_tg SET estado = 'descartado', resultado = '{"motivo":"sin_telegram"}'::jsonb, ${PURGA} WHERE id = ${id}`).catch(() => {})
      return false
    }
    await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET tg_message_id = ${msg} WHERE id = ${id}`).catch(() => {})
    return true
  } catch (e) {
    console.error('[triaje] ofrecer tarificación:', e instanceof Error ? e.name : 'error')
    return false
  }
}

/** 🤖 sobre el pendiente `id`. Devuelve la línea y el resultado (para que ➕ sepa si volvió a toparse). Nunca lanza. */
async function tarificarPendiente(id: number, quien: string): Promise<{ linea: string; r: ResultadoTarificar | null }> {
  const filas = await prisma.$queryRaw<{ datos: unknown }[]>(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'enviando', esperando_edit = false, decidido_por = ${actorTelegram(quien)}, decidido_at = now()
    WHERE id = ${id} AND tipo = 'tarificar' AND estado = 'pendiente' AND caduca_at > now()
    RETURNING datos`).catch(() => null)
  if (filas === null) return { linea: '⚠️ <i>No he podido leer el pendiente: no se ha lanzado nada.</i>', r: null }
  if (!filas.length) return { linea: '<i>Ese botón ya se usó, se descartó o ha caducado: no se ha lanzado nada.</i>', r: null }
  const datos = leerDatosPeticion(filas[0].datos)
  if (!datos || !datos.oportunidadIds.length) {
    await cerrar(id, 'fallido', { motivo: 'ilegible' }, true)
    return { linea: '⚠️ <i>El pendiente guardado no se entiende: no se ha lanzado nada.</i>', r: null }
  }
  const res = await tarificarLeadAsegura({ accion: 'tarificar', clienteId: datos.clienteId, oportunidadIds: datos.oportunidadIds, actor: actorTelegram(quien) })
    .catch(() => ({ status: 502, json: { estado: 'red' } }))
  const r = leerTarificar(res.status, res.json)
  const tras = estadoPendienteTras(r)
  if (tras === 'pendiente' || tras === 'cola') {
    // No se ha hecho nada: vuelve a esperar (con la marca de cola si fue por el tope).
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'pendiente', decidido_por = NULL, decidido_at = NULL,
        resultado = ${JSON.stringify(r.estado === 'tope' ? { cola: r.dia } : { motivo: r.estado })}::jsonb
      WHERE id = ${id} AND estado = 'enviando'`).catch(() => {})
  } else {
    await cerrar(id, tras, r, tras === 'enviado')
  }
  if (r.estado === 'nada' && r.revision.estado === 'ok') await despuesDeNada(id, datos, r.revision)
  return { linea: lineaTrasTarificar(r), r }
}

/** Tras «ningún bot llega a precio»: si es por algo que el cliente puede dar, repregunta F2 (con ✅); si no, qué falta. */
async function despuesDeNada(id: number, datos: DatosPeticion, rev: Extract<Revision, { estado: 'ok' }>): Promise<void> {
  const oferta = decidirOferta(rev)
  const texto = textoTarificar({ id: null, pila: datos.pila, revision: rev })
  if (oferta.tipo === 'repregunta') {
    const plantilla = plantillaRepregunta({ pila: datos.pila, ramos: datos.ramos, faltan: oferta.preguntar, invalidos: [], asuntoOriginal: datos.asunto })
    if (plantilla) {
      const p = await proponerPeticion({
        gmailMessageId: datos.messageId, datos: { ...datos, asunto: plantilla.asunto, tipo: 'repregunta' },
        borrador: plantilla.cuerpo, preguntas: plantilla.preguntas, catastro: null, resumen: texto,
      }).catch(() => null)
      if (p) {
        await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET ${PURGA} WHERE id = ${id} AND estado = 'fallido'`).catch(() => {})
        return
      }
    }
  }
  await tgSend(texto, { html: true }).catch(() => null)
}

async function cerrar(id: number, estado: 'enviado' | 'fallido' | 'incierto', resultado: unknown, purgar: boolean): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = ${estado}, resultado = ${JSON.stringify(resultado ?? null)}::jsonb${purgar ? Prisma.sql`, ${PURGA}` : Prisma.empty}
    WHERE id = ${id} AND estado = 'enviando'`).catch(() => {})
}

/** 🤖 `clp_tar:<id>`. La línea que sustituye a los botones. Si no se hizo nada, los botones vuelven. Nunca lanza. */
export async function resolverTarificarClp(id: number, quien: string): Promise<string> {
  const { linea, r } = await tarificarPendiente(id, quien)
  const vivo = r ? textoBotonVivo(r, id) : null
  if (vivo) await tgSendButtons(vivo, botonesTarificar(id)).catch(() => null)
  if (r?.estado === 'tope') await avisarTope(r.dia, r.tope)
  return linea
}

async function enCola(dia: string): Promise<number | null> {
  return prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT count(*) AS n FROM correduria_pendiente_tg
    WHERE tipo = 'tarificar' AND estado = 'pendiente' AND resultado->>'cola' = ${dia} AND caduca_at > now()`)
    .then((f) => Number(f[0]?.n ?? 0)).catch(() => null)
}

async function avisarTope(dia: string, tope: number | null): Promise<void> {
  const n = await enCola(dia)
  await tgAvisoBotones('correduria.lead-tarificar', textoTope({ tope: tope ?? 20, enCola: n ?? 1 }), botonTope(dia)).catch(() => null)
}

/**
 * ➕ `clp_top:<aaaammdd>`. Un solo uso por MENSAJE (fila `tope:<día>:<mensaje>`): dos pulsaciones = una ampliación. Amplía 10
 * en asegura y relanza la cola de ese día en orden, hasta que se acabe o vuelva a toparse. Nunca lanza.
 */
export async function resolverTopeClp(dia: string, quien: string, mensajeId: number | null): Promise<string> {
  if (mensajeId === null) return '⚠️ <i>No puedo comprobar que este botón no se ha usado ya: no amplío nada.</i>'
  const marca = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
    INSERT INTO correduria_pendiente_tg (tipo, gmail_message_id, datos, borrador, estado, decidido_por, decidido_at)
    VALUES ('tarificar', ${`tope:${dia}:${mensajeId}`}, '{}'::jsonb, '', 'enviado', ${actorTelegram(quien)}, now())
    ON CONFLICT (gmail_message_id, tipo) DO NOTHING
    RETURNING id`).catch(() => null)
  if (marca === null) return '⚠️ <i>No he podido registrar la pulsación: no amplío nada.</i>'
  if (!marca.length) return '<i>Ese botón ya se usó: no se amplía otra vez.</i>'
  const res = await tarificarLeadAsegura({ accion: 'ampliar_tope', dia: dia.replace(/-/g, ''), actor: actorTelegram(quien) })
    .catch(() => ({ status: 502, json: null }))
  const a = leerAmpliar(res.status, res.json)
  if (a.estado !== 'ok') {
    // No se amplió: la marca se retira para que el botón siga valiendo.
    await prisma.$executeRaw(Prisma.sql`DELETE FROM correduria_pendiente_tg WHERE id = ${marca[0].id}`).catch(() => {})
    return a.estado === 'sin_tabla'
      ? '🛑 Falta el SQL del contador diario en asegura (2026-10-19d): no se amplía nada.'
      : '⚠️ No he podido ampliar el tope (¿es de otro día?): no se ha lanzado nada.'
  }
  const lineas = [`➕ Tope de hoy ampliado: ${escapeHtml(lineaContador({ usadas: a.usadas, tope: a.tope }))}.`]
  const cola = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
    SELECT id FROM correduria_pendiente_tg
    WHERE tipo = 'tarificar' AND estado = 'pendiente' AND resultado->>'cola' = ${dia} AND caduca_at > now()
    ORDER BY id LIMIT 20`).catch(() => [] as { id: bigint }[])
  for (const f of cola) {
    const { linea, r } = await tarificarPendiente(Number(f.id), quien)
    lineas.push(`#clp${f.id}: ${linea}`)
    if (r?.estado === 'tope') { await avisarTope(dia, r.tope); break }
  }
  if (!cola.length) lineas.push('No había nada en cola.')
  return lineas.join('\n')
}

