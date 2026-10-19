// lib/correo/lead-correduria-avant2-proceso.ts — 💶 `clp_cds:<p>:<auto|moto>` con RED y BD (19/10/2026, opción B). Las
// reglas viven en `lead-correduria-avant2.ts` (puro, con test). Aquí solo se encadenan:
//   1. Asistente encendido y escrituras del asistente activas (si no, no se hace nada: 0€ y el botón sigue valiendo).
//   2. El pendiente de tarificar `p` → la ficha y sus oportunidades (sin datos personales) → la de ESE ramo y tomador
//      (lectura gratis del riesgo en asegura).
//   3. Marca `cds:<hilo>:<ramo>` que caduca a los 15 min (ON CONFLICT DO UPDATE solo si ya caducó): dos pulsaciones seguidas = una entrega;
//      si el asistente lanza, se borra; si sale en silencio, se puede reintentar pasados 15 min.
//   4. Se ENTREGA al asistente (`manejarCorreduriaTg`) con una instrucción de solo ids. Él propone el vehículo del catálogo
//      y manda el resumen con «💶 Pedir precio (0,50€)» (`cas_tarif`, un solo uso, tope diario). AQUÍ NO SE PAGA NADA.
// Nunca lanza; ningún dato personal en `console.*` ni en Telegram.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo } from '@/lib/riesgo-asegura'
import { tomadorDelRiesgo } from '@/app/(usuario)/correduria/oportunidad/[id]/variante'
import { apagado } from '@/lib/correduria-asistente'
import { emisionTgActiva } from '@/lib/correduria-emision-tg'
import type { RamoAvant2 } from './lead-correduria-peticion'
import { claveAvant2, instruccionAvant2, leerDatosAvant2, oportunidadAvant2 } from './lead-correduria-avant2'

const actorTelegram = (quien: string) => `agente:telegram-${quien}`
const RAMO_TXT: Record<RamoAvant2, string> = { auto: 'coche', moto: 'moto' }

// 💶 `clp_cds`. La línea que sustituye al botón. Nunca lanza y NUNCA paga (el 0,50€ es el segundo botón, el del asistente).
export async function resolverAvant2Clp(id: number, ramo: RamoAvant2, quien: string): Promise<string> {
  try {
    if (apagado(process.env.CORREDURIA_ASISTENTE_APAGADO)) return '🛡️ El asistente de la correduría está apagado: no se ha hecho nada (0€). El botón sigue valiendo.'
    if (!emisionTgActiva(process.env.CORREDURIA_ASISTENTE_EMISION_ACTIVA)) return '🛑 Las escrituras del asistente están apagadas (CORREDURIA_ASISTENTE_EMISION_ACTIVA): no se ha hecho nada (0€). Pide el precio desde su ficha.'
    const filas = await prisma.$queryRaw<{ datos: unknown; gmail_message_id: string }[]>(Prisma.sql`
      SELECT datos, gmail_message_id FROM correduria_pendiente_tg WHERE id = ${id} AND tipo = 'tarificar'`)
    if (!filas.length) return '<i>No encuentro ese aviso de tarificar: no se ha hecho nada (0€).</i>'
    const datos = leerDatosAvant2(filas[0].datos)
    if (!datos) return '⚠️ <i>El aviso guardado no se entiende (sin ficha u oportunidad): no se ha hecho nada (0€).</i>'
    const hilo = datos.hilo ?? filas[0].gmail_message_id

    // La oportunidad de ESE ramo y ESE tomador (lectura gratis). Un fallo de lectura no es «no hay»: no se entrega nada.
    const leidas: { id: string; ramo: string; tomador: string }[] = []
    for (const op of datos.oportunidadIds) {
      const l = await riesgoAsegura(op).then((x) => interpretarRiesgo(x.status, x.json)).catch(() => null)
      if (!l || l.estado === 'error') return '⚠️ <i>No he podido leer el riesgo del lead en asegura: no se ha hecho nada (0€). Prueba en un rato.</i>'
      if (l.estado === 'ok') leidas.push({ id: l.riesgo.oportunidad.id, ramo: l.riesgo.oportunidad.ramo, tomador: tomadorDelRiesgo(l.riesgo) })
    }
    const oportunidadId = oportunidadAvant2(leidas, datos.clienteId, ramo)
    if (!oportunidadId) return `<i>No encuentro UNA oportunidad de ${RAMO_TXT[ramo]} de este lead: no se ha hecho nada (0€). Pídeselo al asistente nombrando la oportunidad.</i>`

    const marca = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
      INSERT INTO correduria_pendiente_tg (tipo, gmail_message_id, datos, borrador, estado, decidido_por, decidido_at, caduca_at)
      VALUES ('tarificar', ${claveAvant2(hilo, ramo)}, ${JSON.stringify({ clienteId: datos.clienteId, oportunidadIds: [oportunidadId], avant2: ramo })}::jsonb, '',
              'enviado', ${actorTelegram(quien)}, now(), now() + interval '15 minutes')
      ON CONFLICT (gmail_message_id, tipo) DO UPDATE SET caduca_at = EXCLUDED.caduca_at, datos = EXCLUDED.datos
        WHERE correduria_pendiente_tg.caduca_at < now()
      RETURNING id`).catch(() => null)
    if (marca === null) return '⚠️ <i>No he podido registrar la pulsación: no se ha hecho nada (0€).</i>'
    if (!marca.length) return `<i>Este lead de ${RAMO_TXT[ramo]} ya se pasó al asistente para Avant2: no se repite (0€). Si quieres otra petición, pídesela a él.</i>`

    const { manejarCorreduriaTg } = await import('@/lib/correduria-asistente-telegram')
    try {
      await manejarCorreduriaTg(instruccionAvant2({ clienteId: datos.clienteId, oportunidadId, ramo }), quien)
    } catch (e) {
      // El asistente reventó: la marca no puede quedar gastada (el botón debe poder reintentarse).
      await prisma.$executeRaw(Prisma.sql`DELETE FROM correduria_pendiente_tg WHERE id = ${marca[0].id}`).catch(() => null)
      throw e
    }
    return `💶 #clp${id}. Pasado al asistente: si no ves su propuesta en un momento, vuelve a pulsar 💶 en 15 min. <b>No se paga nada hasta que pulses «💶 Pedir precio (0,50€)»</b>.`
  } catch (e) {
    console.error('[triaje] entregar lead a Avant2:', e instanceof Error ? e.name : 'error')
    return '⚠️ <i>Fallo interno al pasarlo al asistente: no se ha pedido ningún precio. Mira si te llegó su propuesta antes de repetir.</i>'
  }
}
