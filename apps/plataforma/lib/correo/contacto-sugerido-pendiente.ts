// lib/correo/contacto-sugerido-pendiente.ts — la parte con BD y red del botón «✅ Añadir al directorio» (19/10/2026).
// Las reglas viven en `contacto-sugerido.ts` (puro, con test). Impuro (Prisma + Telegram + puerto de asegura).
//   · `proponerContactoSugerido` → guarda la sugerencia en `correduria_pendiente_tg` y manda el aviso con ✅/🚫.
//                                  `false` = no se pudo (sin tabla/CHECK, sin Telegram): el triaje manda el aviso de siempre.
//   · `resolverBotonCsg`         → ✅ infiere la compañía por dominio y crea el contacto por el puerto de asegura
//                                  (idempotente por email); 🚫 descarta. Un solo uso: `pendiente → enviando`.
// Nada de PII en `console.*`: solo nombres de error.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { escapeHtml } from '@central/core-telegram'
import { tgAvisoBotones } from '@/lib/telegram/avisos'
import { companiasAsegura, crearContactoAsegura, interpretarCompanias } from '@/lib/companias-asegura'
import {
  TIPO_PENDIENTE_CSG, botonesContactoSugerido, contactoParaDirectorio, inferirCompania, interpretarAltaContacto,
  leerDatosContactoSugerido, lineaTrasAlta, nombreVisible, partirRemitente, type DecisionCsg, type ResultadoAlta,
} from './contacto-sugerido'

/** Al cerrar la sugerencia (creada, ignorada, sin compañía) se anulan email, nombre y asunto: quedan ids y estado. */
const PURGA = Prisma.sql`datos = datos - ARRAY['email','nombre','asunto']::text[]`

export async function proponerContactoSugerido(a: { gmailMessageId: string; fromRaw: string; asunto: string }): Promise<boolean> {
  const p = partirRemitente(a.fromRaw)
  const nombre = nombreVisible(a.fromRaw)
  if (!p || !nombre) return false
  let id: number
  try {
    const filas = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
      INSERT INTO correduria_pendiente_tg (tipo, gmail_message_id, datos, borrador)
      VALUES (${TIPO_PENDIENTE_CSG}, ${a.gmailMessageId}, ${JSON.stringify({ email: p.email, nombre, asunto: a.asunto.slice(0, 200) })}::jsonb, '')
      ON CONFLICT (gmail_message_id, tipo) DO NOTHING
      RETURNING id`)
    // Ya propuesto (reproceso del correo): no se vuelve a avisar, pero tampoco se cae al aviso sin botones.
    if (!filas.length) return true
    id = Number(filas[0].id)
  } catch (e) {
    console.error('[triaje] pendiente del contacto sugerido (¿falta el SQL 2026-10-19c?):', e instanceof Error ? e.name : 'error')
    return false
  }
  const texto = `👤 <b>Posible contacto nuevo de aseguradora</b>\n${escapeHtml(a.fromRaw)}\n${escapeHtml(a.asunto)}\n➡️ Si es una persona o un buzón útil de la compañía, pulsa ✅ y lo añado al Directorio de compañías (/correduria).`
  const msg = await tgAvisoBotones('correo.contacto-sugerido', texto, botonesContactoSugerido(id)).catch(() => null)
  if (msg === null) {
    // Silenciado (interruptor del panel) o sin Telegram: sin botón nadie puede aprobarlo, se cierra. `true` = no hay
    // que mandar además el aviso sin botones (pasaría por el mismo interruptor).
    await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET estado = 'descartado', ${PURGA} WHERE id = ${id}`).catch(() => {})
    return true
  }
  await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET tg_message_id = ${msg} WHERE id = ${id}`).catch(() => {})
  return true
}

async function cerrar(id: number, estado: 'enviado' | 'descartado' | 'fallido', resultado: unknown): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = ${estado}, resultado = ${JSON.stringify(resultado ?? null)}::jsonb, ${PURGA}
    WHERE id = ${id} AND estado = 'enviando'`).catch(() => {})
}

/** Devuelve la línea HTML que sustituye a los botones. */
export async function resolverBotonCsg(d: Extract<DecisionCsg, { ok: true }>, hoy: string): Promise<string> {
  if (d.accion === 'no') {
    const f = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'descartado', decidido_por = ${`agente:telegram-${d.quien}`}, decidido_at = now(), ${PURGA}
      WHERE id = ${d.id} AND tipo = ${TIPO_PENDIENTE_CSG} AND estado = 'pendiente' RETURNING id`).catch(() => null)
    if (f === null) return '⚠️ <i>No he podido descartarlo.</i>'
    return f.length ? '🚫 <i>Ignorado: no se ha añadido nada.</i>' : 'ℹ️ <i>Esta sugerencia ya estaba resuelta.</i>'
  }
  // Un solo uso: dos pulsaciones (o un reintento del webhook) = una gana.
  const filas = await prisma.$queryRaw<{ datos: unknown }[]>(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'enviando', decidido_por = ${`agente:telegram-${d.quien}`}, decidido_at = now()
    WHERE id = ${d.id} AND tipo = ${TIPO_PENDIENTE_CSG} AND estado = 'pendiente' AND caduca_at > now()
    RETURNING datos`).catch(() => null)
  if (filas === null) return lineaTrasAlta({ estado: 'error' })
  if (!filas.length) return 'ℹ️ <i>Esta sugerencia ya estaba resuelta o ha caducado.</i>'
  const datos = leerDatosContactoSugerido(filas[0].datos)
  if (!datos) { await cerrar(d.id, 'fallido', { motivo: 'ilegible' }); return lineaTrasAlta({ estado: 'error' }) }

  let res: ResultadoAlta
  try {
    const lista = await companiasAsegura()
    const comp = interpretarCompanias(lista.status, lista.json)
    if (comp.estado !== 'ok') {
      res = { estado: 'error', motivo: comp.estado }
    } else {
      const compania = inferirCompania(datos.email, comp.companias)
      const alta = contactoParaDirectorio(`${datos.nombre} <${datos.email}>`, datos.asunto, hoy)
      if (!compania) res = { estado: 'sin_compania' }
      else if (!alta) res = { estado: 'error', motivo: 'ilegible' }
      else {
        // Idempotencia previa barata (el puerto la repite): el email ya está en CUALQUIER compañía del directorio.
        const ya = comp.companias.find((c) => c.contactos.some((x) => (x.email ?? '').toLowerCase() === datos.email))
        if (ya) res = { estado: 'existia', compania: ya.nombreComun }
        else {
          const r = await crearContactoAsegura({ companiaCodigoDgs: compania.codigoDgs, ...alta })
          const i = interpretarAltaContacto(r.status, r.json)
          res = i.estado === 'creado' ? { estado: 'creado', compania: compania.nombreComun } : i
        }
      }
    }
  } catch (e) {
    console.error('[csg] alta de contacto:', e instanceof Error ? e.name : 'error')
    res = { estado: 'error', motivo: 'excepcion' }
  }
  if (res.estado === 'error') {
    // Fallo: se conservan los datos (sin purgar) para poder añadirlo a mano; la línea de Telegram lo dice.
    await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET estado = 'fallido', resultado = ${JSON.stringify({ motivo: res.motivo ?? null })}::jsonb WHERE id = ${d.id} AND estado = 'enviando'`).catch(() => {})
  } else if (res.estado === 'sin_compania') {
    await cerrar(d.id, 'fallido', { motivo: 'sin_compania' })
  } else {
    await cerrar(d.id, 'enviado', { estado: res.estado })
  }
  return lineaTrasAlta(res)
}
