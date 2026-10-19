// lib/correo/lead-correduria-pendiente.ts — la parte con RED y BD de la petición de datos aprobada por Telegram
// (19/10/2026). Las reglas viven en `lead-correduria-peticion.ts` y `lead-correduria-catastro.ts` (puros, con test).
//
//   · `catastroDeLead`      → consulta el Catastro y rellena el riesgo de hogar (solo lo vacío); nunca lanza.
//   · `proponerPeticion`    → guarda el pendiente (`correduria_pendiente_tg`) y manda el borrador con ✅/✏️/❌.
//                             `null` = no se pudo (sin tabla, sin Telegram): el proceso cae a la plantilla «para copiar».
//   · `resolverBotonClp`    → ✅ envía por el puerto de asegura (un solo uso), ✏️ pide el texto, ❌ descarta.
//   · `guardarEdicionClp`   → la respuesta de Alberto sustituye al borrador y vuelve a salir con botones.
// Nada de PII en `console.*`: solo nombres de error.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { tgAskForReply, tgSendButtons } from '@central/core-telegram'
import { tgAvisoBotones } from '@/lib/telegram/avisos'
import { datosRiesgoAsegura, peticionLeadAsegura, riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo } from '@/lib/riesgo-asegura'
import {
  botonesPeticion, borradorEditado, interpretarEnvioPeticion, leerDatosPeticion, lineaTrasEnviar,
  CLAVES_PII_PENDIENTE, textoBorradorTelegram, textoPedirEdicion, type DatosPeticion, type DecisionClp,
} from './lead-correduria-peticion'
import {
  cambiosViviendaDesdeCatastro, conocidosDeVivienda, puedeEscribirCatastro, elegirViviendaCatastro, lineaCatastroTelegram, type DatosCatastroLead,
} from './lead-correduria-catastro'
import { ACTOR_TRIAJE_CORREO } from './lead-correduria'

// ─── Purga (revisión 19/10/2026) ─────────────────────────────────────────────
// Un pendiente CERRADO (enviado, descartado o caducado) no necesita ni el email del lead ni el texto: se anulan y
// quedan solo ids y estado (`CLAVES_PII_PENDIENTE`). Lo enviado ya consta en asegura (`correo_envio` + historial).
// Fallido/incierto los conservan: Alberto tiene que poder mirarlo antes de contestar a mano.
const PURGA = Prisma.sql`datos = datos - ${[...CLAVES_PII_PENDIENTE]}::text[], borrador = ''`

/** Caducados sin pulsar: se cierran y purgan (se llama en cada lead nuevo; nunca lanza). */
async function purgarCaducados(): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'caducado', esperando_edit = false, ${PURGA}
    WHERE estado = 'pendiente' AND caduca_at <= now()`).catch(() => {})
}

// ─── Catastro ────────────────────────────────────────────────────────────────

/** Tope de tiempo de TODO el paso del Catastro: el lead tiene presupuesto (`LEAD_HASTA_MS`). */
const CATASTRO_TOPE_MS = 25_000

export type CatastroLead = { linea: string; conocidos: string[] }

/**
 * Referencias VÁLIDAS del correo + la oportunidad de hogar → datos del Catastro en su riesgo (solo lo vacío) y las
 * claves que ya no hay que preguntar. Nunca lanza; un fallo = «no se sabe» y la petición pregunta como siempre.
 */
export async function catastroDeLead(referencias: readonly string[], hogar: { id: string; recienAbierta: boolean } | null): Promise<CatastroLead | null> {
  const oportunidadHogarId = hogar?.id ?? null
  if (!referencias.length) return null
  try {
    const trabajo = (async (): Promise<CatastroLead> => {
      const { bajarCatastro } = await import('@central/core-catastro/http')
      const { precalificarHogar } = await import('@central/core-catastro')
      const consultas: { referencia: string; datos: DatosCatastroLead | null }[] = []
      for (const referencia of referencias.slice(0, 3)) {
        const d = await bajarCatastro(referencia).catch(() => null)
        const p = d ? precalificarHogar(d).datos : null
        consultas.push({
          referencia,
          datos: p ? { metrosCuadrados: p.metrosCuadrados, anioConstruccion: p.anioConstruccion, direccion: p.direccion, localidad: p.localidad, provincia: p.provincia, codigoPostal: p.codigoPostal, uso: p.uso } : null,
        })
      }
      const e = elegirViviendaCatastro(consultas)
      if (e.estado !== 'ok') return { linea: lineaCatastroTelegram(e), conocidos: [] }
      if (!oportunidadHogarId) return { linea: lineaCatastroTelegram({ estado: 'ok', datos: e.datos, guardado: 'no', distintos: [] }), conocidos: [] }
      // Lo que YA hay en el riesgo manda: se lee antes y solo se rellena lo vacío.
      const leido = await riesgoAsegura(oportunidadHogarId)
      const r = interpretarRiesgo(leido.status, leido.json)
      const actual = r.estado === 'ok' && r.riesgo.datosRiesgo?.clave === 'datosVivienda' ? (r.riesgo.datosRiesgo.datos as unknown as Record<string, unknown>) : null
      if (r.estado !== 'ok') return { linea: lineaCatastroTelegram({ estado: 'ok', datos: e.datos, guardado: 'no', distintos: [] }), conocidos: [] }
      const { cambios, distintos } = cambiosViviendaDesdeCatastro(actual, e.referencia, e.datos)
      // Ni oportunidad que ya existía ni riesgo confirmado: escribir sin `confirmar` borraría su `confirmadoAt`.
      if (!puedeEscribirCatastro({ recienAbierta: hogar?.recienAbierta === true, confirmadoAt: actual?.confirmadoAt })) {
        return { linea: lineaCatastroTelegram({ estado: 'ok', datos: e.datos, guardado: 'protegido', distintos }), conocidos: conocidosDeVivienda(actual ?? {}) }
      }
      if (Object.keys(cambios).length === 0) {
        return { linea: lineaCatastroTelegram({ estado: 'ok', datos: e.datos, guardado: 'nada_nuevo', distintos }), conocidos: conocidosDeVivienda(actual ?? {}) }
      }
      const w = await datosRiesgoAsegura({ oportunidadId: oportunidadHogarId, datosVivienda: cambios, actor: `${ACTOR_TRIAJE_CORREO}:catastro` })
      const ok = w.status === 200 && (w.json as { estado?: unknown } | null)?.estado === 'ok'
      return {
        linea: lineaCatastroTelegram({ estado: 'ok', datos: e.datos, guardado: ok ? 'si' : 'no', distintos }),
        conocidos: ok ? conocidosDeVivienda({ ...(actual ?? {}), ...cambios }) : conocidosDeVivienda(actual ?? {}),
      }
    })()
    const tope = new Promise<CatastroLead>((res) => setTimeout(() => res({ linea: lineaCatastroTelegram({ estado: 'fallo' }), conocidos: [] }), CATASTRO_TOPE_MS))
    return await Promise.race([trabajo, tope])
  } catch (e) {
    console.error('[triaje] catastro del lead:', e instanceof Error ? e.name : 'error')
    return { linea: lineaCatastroTelegram({ estado: 'fallo' }), conocidos: [] }
  }
}

// ─── Proponer (pendiente + Telegram) ─────────────────────────────────────────

/**
 * Guarda el pendiente y manda el borrador con botones. `null` = no se ha podido (tabla sin crear, BD caída, Telegram
 * mudo): el llamante manda la plantilla «para copiar». Un correo ya propuesto (reproceso) devuelve el id que ya había
 * sin volver a mandar nada.
 */
export async function proponerPeticion(a: {
  gmailMessageId: string; datos: DatosPeticion; borrador: string; preguntas: number; catastro: string | null
}): Promise<{ id: number; nuevo: boolean } | null> {
  await purgarCaducados()
  let id: number
  try {
    const filas = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
      INSERT INTO correduria_pendiente_tg (tipo, gmail_message_id, datos, borrador)
      VALUES ('peticion_datos', ${a.gmailMessageId}, ${JSON.stringify(a.datos)}::jsonb, ${a.borrador})
      ON CONFLICT (gmail_message_id, tipo) DO NOTHING
      RETURNING id`)
    if (!filas.length) {
      const ya = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        SELECT id FROM correduria_pendiente_tg WHERE gmail_message_id = ${a.gmailMessageId} AND tipo = 'peticion_datos'`)
      return ya.length ? { id: Number(ya[0].id), nuevo: false } : null
    }
    id = Number(filas[0].id)
  } catch (e) {
    console.error('[triaje] pendiente de la petición (¿falta el SQL 2026-10-19b?):', e instanceof Error ? e.name : 'error')
    return null
  }
  const texto = textoBorradorTelegram({ id, datos: a.datos, borrador: a.borrador, preguntas: a.preguntas, catastro: a.catastro })
  const msg = await tgAvisoBotones('correduria.lead-peticion', texto, botonesPeticion(id)).catch(() => null)
  if (msg === null) {
    // Sin botón en Telegram nadie puede aprobarlo: se cierra para que no quede un pendiente fantasma.
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'descartado', resultado = '{"motivo":"sin_telegram"}'::jsonb, ${PURGA} WHERE id = ${id}`).catch(() => {})
    return null
  }
  await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET tg_message_id = ${msg} WHERE id = ${id}`).catch(() => {})
  return { id, nuevo: true }
}

// ─── Botones ─────────────────────────────────────────────────────────────────

const actorTelegram = (quien: string) => `agente:telegram-${quien}`

/** ✅ / ✏️ / ❌. Devuelve la línea que sustituye a los botones (o `null` si ya se ha contestado de otra forma). */
export async function resolverBotonClp(d: Extract<DecisionClp, { ok: true }>): Promise<string | null> {
  if (d.accion === 'no') {
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'descartado', decidido_por = ${actorTelegram(d.quien)}, decidido_at = now(), esperando_edit = false, ${PURGA}
      WHERE id = ${d.id} AND estado = 'pendiente'`).catch(() => null)
    if (n === null) return '⚠️ <i>No he podido descartarlo; caduca solo a los 7 días.</i>'
    return n > 0 ? '❌ <i>Descartado: no se le ha enviado nada.</i>' : lineaTrasEnviar({ estado: 'usado' })
  }
  if (d.accion === 'edt') {
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_pendiente_tg SET esperando_edit = true
      WHERE id = ${d.id} AND estado = 'pendiente' AND caduca_at > now()`).catch(() => null)
    if (!n) return lineaTrasEnviar({ estado: 'usado' })
    await tgAskForReply(textoPedirEdicion(d.id)).catch(() => null)
    return null
  }
  // ✅ Un solo uso: dos pulsaciones (o un reintento del webhook) = una gana.
  const filas = await prisma.$queryRaw<{ datos: unknown; borrador: string }[]>(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'enviando', esperando_edit = false, decidido_por = ${actorTelegram(d.quien)}, decidido_at = now()
    WHERE id = ${d.id} AND estado = 'pendiente' AND caduca_at > now()
    RETURNING datos, borrador`).catch(() => null)
  if (filas === null) return '⚠️ <i>No he podido leer el borrador: no se ha enviado nada.</i>'
  if (!filas.length) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'caducado', esperando_edit = false, ${PURGA} WHERE id = ${d.id} AND estado = 'pendiente' AND caduca_at <= now()`).catch(() => {})
    return lineaTrasEnviar({ estado: 'usado' })
  }
  const datos = leerDatosPeticion(filas[0].datos)
  if (!datos) {
    await cerrar(d.id, 'fallido', { motivo: 'ilegible' })
    return lineaTrasEnviar({ estado: 'ilegible' })
  }
  const r = await peticionLeadAsegura({
    clienteId: datos.clienteId, oportunidadIds: datos.oportunidadIds, to: datos.to, asunto: datos.asunto, texto: filas[0].borrador,
    enRespuestaA: { messageId: datos.messageId, references: datos.references }, idempotencia: `clp-${d.id}`,
    actor: actorTelegram(d.quien),
  }).catch(() => ({ status: 502, json: { motivo: 'red' } }))
  const res = interpretarEnvioPeticion(r.status, r.json)
  await cerrar(d.id, res.estado === 'enviado' ? 'enviado' : res.estado === 'no_enviado' ? 'fallido' : 'incierto', res)
  return lineaTrasEnviar(res)
}

async function cerrar(id: number, estado: 'enviado' | 'fallido' | 'incierto', resultado: unknown): Promise<void> {
  // Solo lo ENVIADO se purga: fallido/incierto conservan email y texto para contestar a mano.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = ${estado}, resultado = ${JSON.stringify(resultado ?? null)}::jsonb${estado === 'enviado' ? Prisma.sql`, ${PURGA}` : Prisma.empty}
    WHERE id = ${id} AND estado = 'enviando'`).catch(() => {})
}

/**
 * Respuesta de Alberto a «✏️ Responde con el texto corregido [clp #id]». Sustituye el borrador (con el pie legal si
 * faltaba) y lo vuelve a mandar con ✅/✏️/❌. `false` = no era una edición pendiente (el webhook sigue su camino).
 */
export async function guardarEdicionClp(id: number, texto: string): Promise<boolean> {
  const nuevo = borradorEditado(texto)
  if (!nuevo) {
    await tgSendButtons('✏️ <i>Ese texto es demasiado corto: no he tocado el borrador.</i>', botonesPeticion(id)).catch(() => null)
    return true
  }
  const filas = await prisma.$queryRaw<{ datos: unknown }[]>(Prisma.sql`
    UPDATE correduria_pendiente_tg SET borrador = ${nuevo}, editado = true, esperando_edit = false
    WHERE id = ${id} AND estado = 'pendiente' AND esperando_edit AND caduca_at > now()
    RETURNING datos`).catch(() => null)
  if (!filas?.length) return false
  const datos = leerDatosPeticion(filas[0].datos)
  if (!datos) return true
  const msg = await tgSendButtons(textoBorradorTelegram({ id, datos, borrador: nuevo, preguntas: null, editado: true }), botonesPeticion(id)).catch(() => null)
  if (msg !== null) await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET tg_message_id = ${msg} WHERE id = ${id}`).catch(() => {})
  return true
}
