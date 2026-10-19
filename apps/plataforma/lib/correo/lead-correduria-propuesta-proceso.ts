// lib/correo/lead-correduria-propuesta-proceso.ts — F4 con RED y BD: el aviso de la PROPUESTA de un lead y su envío
// (19/10/2026, spec lead → propuesta §F4/§3.4). Las reglas viven en `lead-correduria-propuesta.ts` (puro, con test) y en
// asegura (`propuesta-lead*.ts`). Aquí solo se encadenan:
//   · `revisarPropuestasLead` (cada pasada del triaje): asegura dice qué hilos de lead tienen precio; por cada uno, UN
//     pendiente `tipo='propuesta'` (`propuesta:<hilo>`) con su aviso §3.4. Si la huella cambia (más precios, otra prima,
//     necesidades nuevas) el aviso se EDITA en sitio con los botones nuevos: no se duplica. Si faltan necesidades IDD, la
//     repregunta va por el camino de F2 (`proponerPeticion`, con ✅), una vez por conjunto de necesidades que faltan.
//   · `resolverPropuestaClp` (📤 `clp_pro:<p>:<n>`): un solo uso (`pendiente → enviando`), EXACTAMENTE el precio n, por el
//     puerto de asegura (aviso del presupuesto de siempre, EN EL HILO). Si el precio o las necesidades cambiaron, no se
//     envía nada: el pendiente vuelve y el aviso se rehace.
//   · `resolverElegirClp` (🔀 `clp_eli:<p>`): un botón por precio enviable.
//   · `reenviarPropuestaEditada` (tras ✏️): el aviso vuelve con el texto nuevo y sus botones.
// Nunca lanza; ningún dato personal en `console.*` ni en Telegram (nombre de pila, compañías, primas y coberturas).
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { tgEditMessage, tgSend, tgSendButtons } from '@central/core-telegram'
import { MEDIADOR } from '@central/module-seguros'
import { tgAvisoBotones } from '@/lib/telegram/avisos'
import { propuestaLeadAsegura } from '@/lib/seguimiento-asegura'
import { CLAVES_PII_PENDIENTE } from './lead-correduria-peticion'
import { proponerPeticion } from './lead-correduria-pendiente'
import {
  AVISO_PROPUESTA_LEAD, borradorPropuesta, botonesElegir, botonesPropuesta, claveRepreguntaIdd, clavePendientePropuesta, conOpcion, datosDePropuesta,
  interpretarEnvioPropuesta, leerDatosPropuesta, leerPendientesPropuesta, lineaTrasPropuesta, plantillaRepreguntaIdd, textoPropuestaTelegram,
  type DatosPropuesta, type PropuestaLeida,
} from './lead-correduria-propuesta'

const PURGA = Prisma.sql`datos = datos - ${[...CLAVES_PII_PENDIENTE]}::text[], borrador = ''`
const actorTelegram = (quien: string) => `agente:telegram-${quien}`
const ACTOR_TRIAJE = 'agente:triaje-correo'
const DOMINIO_PROPIO = MEDIADOR.identidad.email.split('@')[1]!.toLowerCase()

type FilaPendiente = { id: bigint; estado: string; datos: unknown; borrador: string; editado: boolean; tg_message_id: bigint | null }

/**
 * El email, el asunto y el Message-ID del ÚLTIMO correo del cliente en su hilo (lo guardó el triaje al leerlo). El remitente
 * propio (copias a hola@) no cuenta. `null` = no se encuentra: sin destinatario no se ofrece enviar nada.
 */
async function contactoDelHilo(ids: readonly string[]): Promise<{ to: string; asunto: string; messageId: string } | null> {
  if (!ids.length) return null
  const f = await prisma.$queryRaw<{ gmail_message_id: string; remitente: string | null; asunto: string | null }[]>(Prisma.sql`
    SELECT gmail_message_id, remitente, asunto FROM correo_triaje
    WHERE gmail_message_id = ANY(${[...ids]}::text[]) AND remitente IS NOT NULL AND lower(split_part(remitente, '@', 2)) <> ${DOMINIO_PROPIO}
    ORDER BY fecha DESC NULLS LAST, id DESC LIMIT 1`).catch(() => null)
  const r = f?.[0]
  const to = (r?.remitente ?? '').trim().toLowerCase()
  if (!r || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to)) return null
  return { to, asunto: (r.asunto ?? '').trim() || 'Tu seguro', messageId: r.gmail_message_id }
}

/**
 * Una propuesta de asegura → su aviso (nuevo, actualizado o igual). Nunca lanza. Devuelve qué pasó, para el resumen.
 */
export async function avisarPropuesta(p: PropuestaLeida): Promise<'nuevo' | 'actualizado' | 'igual' | 'cerrado' | 'sin_contacto' | 'fallo'> {
  try {
    const clave = clavePendientePropuesta(p.hiloId)
    const filas = await prisma.$queryRaw<FilaPendiente[]>(Prisma.sql`
      SELECT id, estado, datos, borrador, editado, tg_message_id FROM correduria_pendiente_tg
      WHERE gmail_message_id = ${clave} AND tipo = 'propuesta'`)
    const fila = filas[0] ?? null
    // Enviada, descartada (🚫), enviándose o caducada: no se vuelve a proponer (🚫 es la decisión de Alberto).
    if (fila && fila.estado !== 'pendiente') return 'cerrado'
    const previo = fila ? leerDatosPropuesta(fila.datos) : null
    if (previo && previo.huella === p.huella) return 'igual'
    const contacto = await contactoDelHilo(p.messageIds)
    if (!contacto) return 'sin_contacto'
    const datos = datosDePropuesta(p, contacto, previo?.opciones ?? [])
    const borrador = fila?.editado ? fila.borrador : borradorPropuesta(datos)

    let id: number
    let nuevo = false
    if (!fila) {
      const ins = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        INSERT INTO correduria_pendiente_tg (tipo, gmail_message_id, datos, borrador)
        VALUES ('propuesta', ${clave}, ${JSON.stringify(datos)}::jsonb, ${borrador})
        ON CONFLICT (gmail_message_id, tipo) DO NOTHING
        RETURNING id`)
      if (!ins.length) return 'igual' // otra pasada a la vez la acaba de crear
      id = Number(ins[0].id)
      nuevo = true
    } else {
      id = Number(fila.id)
      const n = await prisma.$executeRaw(Prisma.sql`
        UPDATE correduria_pendiente_tg SET datos = ${JSON.stringify(datos)}::jsonb, borrador = ${borrador}
        WHERE id = ${id} AND estado = 'pendiente'`)
      if (!n) return 'cerrado'
    }

    const texto = textoPropuestaTelegram({ id, datos, borrador, editado: fila?.editado === true, actualizado: !nuevo })
    const botones = botonesPropuesta(id, datos)
    // Actualizar = EDITAR el mensaje que ya hay (con los botones nuevos). Si no se puede (sin id o Telegram dice que no),
    // se manda uno nuevo y el viejo se queda sin botones: nunca dos avisos vivos de la misma propuesta.
    const editado = !nuevo && fila?.tg_message_id ? await tgEditMessage(Number(fila.tg_message_id), texto, { botones }).catch(() => false) : false
    if (!editado) {
      if (!nuevo && fila?.tg_message_id) await tgEditMessage(Number(fila.tg_message_id), '<i>Propuesta actualizada: va en un mensaje nuevo más abajo.</i>').catch(() => false)
      const msg = await tgAvisoBotones('correduria.lead-propuesta', texto, botones).catch(() => null)
      if (msg === null) {
        if (nuevo) {
          // Sin botón en Telegram nadie puede aprobarla: se BORRA (no se descarta) para que la próxima pasada lo reintente.
          await prisma.$executeRaw(Prisma.sql`DELETE FROM correduria_pendiente_tg WHERE id = ${id} AND estado = 'pendiente'`).catch(() => {})
        }
        return 'fallo'
      }
      await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET tg_message_id = ${msg} WHERE id = ${id}`).catch(() => {})
    }

    // Faltan necesidades → la repregunta de F2 (✅/✏️/❌), una vez por conjunto de necesidades que faltan.
    if (!datos.necesidades.completas && datos.necesidades.faltan.length) {
      const plantilla = plantillaRepreguntaIdd({ pila: datos.pila, faltan: datos.necesidades.faltan, asuntoOriginal: contacto.asunto })
      if (plantilla) {
        await proponerPeticion({
          gmailMessageId: claveRepreguntaIdd(p.hiloId, datos.necesidades.faltan),
          datos: {
            clienteId: datos.clienteId, oportunidadIds: datos.oportunidadIds, to: datos.to, asunto: plantilla.asunto, messageId: datos.messageId,
            references: datos.references, pila: datos.pila, ramos: datos.ramos, tipo: 'repregunta',
          },
          borrador: plantilla.cuerpo, preguntas: plantilla.preguntas, catastro: null,
          resumen: `🧭 <b>Necesidades IDD que faltan para la propuesta</b> (#clp${id}): sin ellas no se le propone nada.`,
        }).catch(() => null)
      }
    }
    return nuevo ? 'nuevo' : 'actualizado'
  } catch (e) {
    console.error('[triaje] aviso de propuesta (¿falta el SQL 2026-10-19b?):', e instanceof Error ? e.name : 'error')
    return 'fallo'
  }
}

/** La pasada del triaje: todos los hilos de lead con precio. Nunca lanza. */
export async function revisarPropuestasLead(): Promise<Record<string, number>> {
  const cuenta: Record<string, number> = { revisadas: 0, nuevo: 0, actualizado: 0, igual: 0, cerrado: 0, sin_contacto: 0, fallo: 0 }
  try {
    const r = await propuestaLeadAsegura({ accion: 'pendientes', actor: ACTOR_TRIAJE }).catch(() => ({ status: 502, json: null }))
    const l = leerPendientesPropuesta(r.status, r.json)
    if (l.estado !== 'ok') {
      cuenta.fallo++
      return cuenta
    }
    for (const p of l.propuestas) {
      cuenta.revisadas++
      cuenta[await avisarPropuesta(p)]++
    }
  } catch (e) {
    console.error('[triaje] propuestas de leads:', e instanceof Error ? e.name : 'error')
    cuenta.fallo++
  }
  return cuenta
}

async function cerrar(id: number, estado: 'enviado' | 'fallido' | 'incierto', resultado: unknown): Promise<void> {
  // Solo lo ENVIADO se purga: fallido/incierto conservan email y texto para contestar a mano.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = ${estado}, resultado = ${JSON.stringify(resultado ?? null)}::jsonb${estado === 'enviado' ? Prisma.sql`, ${PURGA}` : Prisma.empty}
    WHERE id = ${id} AND estado = 'enviando'`).catch(() => {})
}

/** El pendiente vuelve a esperar (no se hizo nada) y, si toca, la comparativa se rehace en el momento. */
async function devolver(id: number, refrescar: boolean, datos: DatosPropuesta | null): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'pendiente', decidido_por = NULL, decidido_at = NULL WHERE id = ${id} AND estado = 'enviando'`).catch(() => {})
  if (!refrescar || !datos) return
  const r = await propuestaLeadAsegura({ accion: 'revisar', hiloId: datos.hiloId, actor: ACTOR_TRIAJE }).catch(() => ({ status: 502, json: null }))
  const { leerPropuesta } = await import('./lead-correduria-propuesta')
  const p = r.status === 200 ? leerPropuesta((r.json as { propuesta?: unknown } | null)?.propuesta) : null
  if (p) await avisarPropuesta(p)
}

/** 📤 `clp_pro:<p>:<n>`. La línea que sustituye a los botones. Nunca lanza. */
export async function resolverPropuestaClp(id: number, n: number, quien: string): Promise<string> {
  // Un solo uso: dos pulsaciones (o un reintento del webhook) = una gana.
  const filas = await prisma.$queryRaw<{ datos: unknown; borrador: string }[]>(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'enviando', esperando_edit = false, decidido_por = ${actorTelegram(quien)}, decidido_at = now()
    WHERE id = ${id} AND tipo = 'propuesta' AND estado = 'pendiente' AND caduca_at > now()
    RETURNING datos, borrador`).catch(() => null)
  if (filas === null) return '⚠️ <i>No he podido leer la propuesta: no se ha enviado nada.</i>'
  if (!filas.length) return lineaTrasPropuesta({ estado: 'usado' })
  const datos = leerDatosPropuesta(filas[0].datos)
  if (!datos) {
    await cerrar(id, 'fallido', { motivo: 'ilegible' })
    return lineaTrasPropuesta({ estado: 'ilegible' })
  }
  // EXACTAMENTE el pulsado: si su número no está o no es enviable, no se envía ningún otro.
  const o = datos.opciones.find((x) => x.n === n)
  if (!o || !o.enviable || !datos.necesidades.completas) {
    await devolver(id, false, null)
    return lineaTrasPropuesta({ estado: 'sin_opcion' })
  }
  const r = await propuestaLeadAsegura({
    accion: 'enviar', hiloId: datos.hiloId, clave: o.clave, primaEur: o.primaEur, to: datos.to, asunto: datos.asunto,
    texto: conOpcion(filas[0].borrador, o), enRespuestaA: { messageId: datos.messageId, references: datos.references },
    idempotencia: `clp-${id}`, actor: actorTelegram(quien),
  }).catch(() => ({ status: 502, json: { motivo: 'red' } }))
  const res = interpretarEnvioPropuesta(r.status, r.json)
  if (res.estado === 'no_enviado' && res.refrescar) {
    await devolver(id, true, datos)
  } else {
    await cerrar(id, res.estado === 'enviado' ? 'enviado' : res.estado === 'no_enviado' ? 'fallido' : 'incierto', { ...res, n: o.n })
  }
  return lineaTrasPropuesta(res, o)
}

/** 🔀 `clp_eli:<p>`: un botón por precio enviable. Nunca lanza. */
export async function resolverElegirClp(id: number): Promise<string> {
  const f = await prisma.$queryRaw<{ datos: unknown }[]>(Prisma.sql`
    SELECT datos FROM correduria_pendiente_tg WHERE id = ${id} AND tipo = 'propuesta' AND estado = 'pendiente' AND caduca_at > now()`).catch(() => null)
  const datos = f?.[0] ? leerDatosPropuesta(f[0].datos) : null
  if (!datos) return lineaTrasPropuesta({ estado: 'usado' })
  await tgSendButtons(`🔀 Elige el precio que le envías (#clp${id}). Solo los que encajan con sus necesidades:`, botonesElegir(id, datos)).catch(() => null)
  return '🔀 <i>Elige el precio en el mensaje de abajo.</i>'
}

/** Tras ✏️: el aviso de la propuesta vuelve con el texto nuevo y sus botones. `false` = no era una propuesta. */
export async function reenviarPropuestaEditada(id: number): Promise<boolean> {
  const f = await prisma.$queryRaw<{ datos: unknown; borrador: string }[]>(Prisma.sql`
    SELECT datos, borrador FROM correduria_pendiente_tg WHERE id = ${id} AND tipo = 'propuesta' AND estado = 'pendiente'`).catch(() => null)
  if (!f?.length) return false
  const datos = leerDatosPropuesta(f[0].datos)
  if (!datos) return true
  const msg = await tgSendButtons(textoPropuestaTelegram({ id, datos, borrador: f[0].borrador, editado: true }), botonesPropuesta(id, datos)).catch(() => null)
  if (msg !== null) await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET tg_message_id = ${msg} WHERE id = ${id}`).catch(() => {})
  else await tgSend('✏️ <i>Texto guardado, pero no he podido volver a mandarte la propuesta: llegará con la próxima actualización.</i>', { html: true }).catch(() => null)
  return true
}
