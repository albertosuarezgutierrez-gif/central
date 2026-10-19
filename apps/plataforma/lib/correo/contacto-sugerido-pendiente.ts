// lib/correo/contacto-sugerido-pendiente.ts — la parte con BD y red del botón «✅ Añadir al directorio» (19/10/2026).
// Las reglas viven en `contacto-sugerido.ts` (puro, con test). Impuro (Prisma + Telegram + puerto de asegura).
//   · `proponerContactoSugerido` → guarda la sugerencia en `correduria_pendiente_tg` y manda el aviso con ✅/🚫.
//                                  `false` = no se pudo (sin tabla/CHECK, sin Telegram): el triaje manda el aviso de siempre.
//   · alta AUTOMÁTICA (19/10/2026): compañía EXACTA + email nuevo → se crea sin pulsar y el aviso lleva «↩️ Deshacer».
//   · `resolverBotonCsg`         → ✅ infiere la compañía por dominio y crea el contacto por el puerto de asegura
//                                  (idempotente por email); 🚫 descarta. Un solo uso: `pendiente → enviando`.
// Nada de PII en `console.*`: solo nombres de error.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { escapeHtml } from '@central/core-telegram'
import type { Boton } from '@central/core-telegram'
import { tgAviso, tgAvisoBotones } from '@/lib/telegram/avisos'
import { companiasAsegura, crearContactoAsegura, desactivarContactoAsegura, interpretarCompanias } from '@/lib/companias-asegura'
import {
  TIPO_PENDIENTE_CSG, botonDeshacerCsg, botonesContactoSugerido, decidirRutaAlta, idContactoCreado, interpretarDeshacer, leerContactoIdGuardado,
  lineaTrasDeshacer, textoAltaAutomatica, botonesElegirCompania, candidatasCompania, contactoParaDirectorio, interpretarAltaContacto,
  candidataElegida, leerCandidatasGuardadas, leerDatosContactoSugerido, lineaTrasAlta, nombreVisible, partirRemitente, type DecisionCsg, type ResultadoAlta,
} from './contacto-sugerido'

function fechaHoy(): string {
  return new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Al cerrar la sugerencia (creada, ignorada, sin compañía) se anulan email, nombre y asunto: quedan ids y estado. */
const PURGA = Prisma.sql`datos = datos - ARRAY['email','nombre','asunto','candidatos']::text[]`

/**
 * Alta automática cuando no hay duda. Devuelve `true` si el triaje NO debe mandar además el aviso de siempre.
 *   · exacta + email nuevo → crea por el puerto idempotente y avisa «✅ Añadido… ↩️ Deshacer».
 *   · ya existía → silencio (no es noticia). Parcial → botones de confirmar. Ninguna → `false` (aviso «añádelo a mano»).
 *   · Incierto (red/5xx) → NO se reintenta: el aviso de siempre con ✅/🚫 y «No sé si se ha añadido…».
 * 🔕 El alta es dato interno e idempotente: con el aviso SILENCIADO en el panel de Telegram se hace igual, sin mensaje.
 */
export async function proponerContactoSugerido(a: { gmailMessageId: string; fromRaw: string; asunto: string }, hoy = fechaHoy()): Promise<boolean> {
  const p = partirRemitente(a.fromRaw)
  const nombre = nombreVisible(a.fromRaw)
  if (!p || !nombre) return false
  const alta = contactoParaDirectorio(a.fromRaw, a.asunto, hoy)

  // Compañías del directorio. Si no se pueden leer, el flujo de siempre (botón ✅ que decide al pulsar).
  let ruta: ReturnType<typeof decidirRutaAlta> = { ruta: 'confirmar' }
  try {
    const lista = await companiasAsegura()
    const comp = interpretarCompanias(lista.status, lista.json)
    if (comp.estado === 'ok') ruta = decidirRutaAlta(p.email, comp.companias, alta !== null)
  } catch (e) {
    console.error('[triaje] directorio para el alta automática:', e instanceof Error ? e.name : 'error')
  }
  if (ruta.ruta === 'existia') return true
  if (ruta.ruta === 'a_mano') return false

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

  let avisoIncierto = false
  if (ruta.ruta === 'auto' && alta) {
    // La fila se reserva ANTES de llamar (`pendiente → enviando`): un reproceso concurrente no duplica el alta.
    const reservada = await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET estado = 'enviando', decidido_por = 'agente:triaje-auto', decidido_at = now() WHERE id = ${id} AND estado = 'pendiente'`).catch(() => 0)
    if (reservada) {
      let r: { status: number; json: unknown } | null = null
      try { r = await crearContactoAsegura({ companiaCodigoDgs: ruta.compania.codigoDgs, ...alta }) } catch { r = null }
      const i = r ? interpretarAltaContacto(r.status, r.json) : ({ estado: 'error', motivo: 'excepcion', incierto: true } as const)
      if (i.estado === 'existia' || i.estado === 'desactivado') {
        // Silencio: ya estaba, o Alberto ya lo dio de baja (no se resucita solo).
        await cerrar(id, 'enviado', { estado: i.estado })
        return true
      }
      if (i.estado === 'creado' && r) {
        const contactoId = idContactoCreado(r.json)
        // Se guarda solo el id del contacto (y la compañía) para poder deshacer; email/nombre/asunto se purgan.
        const filas = await prisma.$executeRaw(Prisma.sql`
          UPDATE correduria_pendiente_tg SET estado = 'enviado', resultado = ${JSON.stringify({ estado: 'creado', auto: true })}::jsonb,
            datos = datos || ${JSON.stringify(contactoId ? { contactoId } : {})}::jsonb
          WHERE id = ${id} AND estado = 'enviando'`).catch(() => 0)
        await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET ${PURGA} WHERE id = ${id}`).catch(() => {})
        // El botón de deshacer solo si el id quedó GUARDADO: si no, el botón fallaría; se indica cómo quitarlo a mano.
        const conDeshacer = Boolean(contactoId) && filas === 1
        // Silenciado o sin Telegram → `null`: el contacto ya está, simplemente no hay mensaje (ni botón de deshacer).
        const txt = textoAltaAutomatica(nombre, i.compania, !conDeshacer)
        const msg = await (conDeshacer ? tgAvisoBotones('correo.contacto-sugerido', txt, botonDeshacerCsg(id)) : tgAviso('correo.contacto-sugerido', txt)).catch(() => null)
        if (msg !== null) await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET tg_message_id = ${msg} WHERE id = ${id}`).catch(() => {})
        return true
      }
      // Previo a escribir (400/404/sin configurar): nada creado → vuelve a 'pendiente' y sigue el flujo de botones.
      // Incierto: NO se reintenta; estado 'incierto' (el ✅ puede repetirse, el puerto es idempotente por email).
      const nuevo = i.estado === 'error' && i.incierto ? 'incierto' : 'pendiente'
      avisoIncierto = nuevo === 'incierto'
      await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET estado = ${nuevo} WHERE id = ${id} AND estado = 'enviando'`).catch(() => {})
    }
  }

  const aviso = avisoIncierto ? `\n${lineaTrasAlta({ estado: 'error', incierto: true })}` : ''
  const texto = `👤 <b>Posible contacto nuevo de aseguradora</b>\n${escapeHtml(a.fromRaw)}\n${escapeHtml(a.asunto)}\n➡️ Si es una persona o un buzón útil de la compañía, pulsa ✅ y lo añado al Directorio de compañías (/correduria).${aviso}`
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

/** Lo que sustituye a los botones: la línea HTML y, solo si hay que ELEGIR compañía, los botones nuevos. */
export type RespuestaCsg = { linea: string; botones?: Boton[][] }

export async function resolverBotonCsg(d: Extract<DecisionCsg, { ok: true }>, hoy: string): Promise<RespuestaCsg> {
  const linea = (l: string): RespuestaCsg => ({ linea: l })
  const actor = `agente:telegram-${d.quien}`
  if (d.accion === 'no') {
    const f = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'descartado', decidido_por = ${actor}, decidido_at = now(), ${PURGA}
      WHERE id = ${d.id} AND tipo = ${TIPO_PENDIENTE_CSG} AND estado IN ('pendiente', 'incierto') RETURNING id`).catch(() => null)
    if (f === null) return linea('⚠️ <i>No he podido descartarlo.</i>')
    return linea(f.length ? '🚫 <i>Ignorado: no se ha añadido nada.</i>' : 'ℹ️ <i>Esta sugerencia ya estaba resuelta.</i>')
  }
  if (d.accion === 'u') return linea(await deshacerAlta(d.id, actor))
  // Un solo uso en CADA paso: dos pulsaciones (o un reintento del webhook) = una gana. `incierto` se puede repetir
  // (el puerto es idempotente por email). El segundo paso (`c`, elegir compañía) exige candidatas guardadas.
  const exigeCandidatas = d.accion === 'c' ? Prisma.sql`AND datos ? 'candidatos'` : Prisma.empty
  const filas = await prisma.$queryRaw<{ datos: unknown }[]>(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'enviando', decidido_por = ${actor}, decidido_at = now()
    WHERE id = ${d.id} AND tipo = ${TIPO_PENDIENTE_CSG} AND estado IN ('pendiente', 'incierto') AND caduca_at > now() ${exigeCandidatas}
    RETURNING datos`).catch(() => null)
  if (filas === null) return linea(lineaTrasAlta({ estado: 'error' }))
  if (!filas.length) {
    // Caducada sin resolver: se cierra y se purga la PII (email/nombre/asunto).
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'caducado', ${PURGA}
      WHERE id = ${d.id} AND tipo = ${TIPO_PENDIENTE_CSG} AND estado IN ('pendiente', 'incierto') AND caduca_at <= now()`).catch(() => {})
    return linea('ℹ️ <i>Esta sugerencia ya estaba resuelta o ha caducado.</i>')
  }
  const datos = leerDatosContactoSugerido(filas[0].datos)
  if (!datos) { await cerrar(d.id, 'fallido', { motivo: 'ilegible' }); return linea(lineaTrasAlta({ estado: 'error' })) }

  // Paso 2: la elegida SOLO vale si es una de las candidatas guardadas; si no, la fila vuelve a 'pendiente' intacta.
  let elegida: { codigoDgs: string; nombreComun: string } | null = null
  if (d.accion === 'c') {
    elegida = candidataElegida(leerCandidatasGuardadas(filas[0].datos), d.codigoDgs)
    if (!elegida) {
      await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET estado = 'pendiente' WHERE id = ${d.id} AND estado = 'enviando'`).catch(() => {})
      return linea('⚠️ <i>Esa compañía no era una de las candidatas: no se ha creado nada.</i>')
    }
  }

  let res: ResultadoAlta
  let llamado = false // a partir de la llamada de alta, un fallo es INCIERTO (puede haberse creado)
  try {
    const alta = contactoParaDirectorio(`${datos.nombre} <${datos.email}>`, datos.asunto, hoy)
    if (elegida) {
      if (!alta) res = { estado: 'error', motivo: 'ilegible' }
      else {
        llamado = true
        const r = await crearContactoAsegura({ companiaCodigoDgs: elegida.codigoDgs, ...alta })
        const i = interpretarAltaContacto(r.status, r.json)
        res = i.estado === 'creado' ? { estado: 'creado', compania: elegida.nombreComun } : i
      }
    } else {
      const lista = await companiasAsegura()
      const comp = interpretarCompanias(lista.status, lista.json)
      if (comp.estado !== 'ok') {
        res = { estado: 'error', motivo: comp.estado }
      } else {
        const cand = candidatasCompania(datos.email, comp.companias)
        // Idempotencia previa barata (el puerto la repite): el email ya está en CUALQUIER compañía del directorio.
        const ya = comp.companias.find((c) => c.contactos.some((x) => (x.email ?? '').toLowerCase() === datos.email))
        if (ya) res = { estado: 'existia', compania: ya.nombreComun }
        else if (cand.tipo === 'ninguna') res = { estado: 'sin_compania' }
        else if (!alta) res = { estado: 'error', motivo: 'ilegible' }
        else if (cand.tipo === 'ambigua') res = { estado: 'ambigua', candidatas: cand.candidatas.map((c) => ({ codigoDgs: c.codigoDgs, nombreComun: c.nombreComun })) }
        else {
          llamado = true
          const r = await crearContactoAsegura({ companiaCodigoDgs: cand.compania.codigoDgs, ...alta })
          const i = interpretarAltaContacto(r.status, r.json)
          res = i.estado === 'creado' ? { estado: 'creado', compania: cand.compania.nombreComun } : i
        }
      }
    }
  } catch (e) {
    console.error('[csg] alta de contacto:', e instanceof Error ? e.name : 'error')
    res = llamado ? { estado: 'error', motivo: 'excepcion', incierto: true } : { estado: 'error', motivo: 'excepcion' }
  }
  if (res.estado === 'ambigua') {
    const botones = botonesElegirCompania(d.id, res.candidatas)
    if (!botones) {
      await cerrar(d.id, 'fallido', { motivo: 'sin_compania' })
      return linea(lineaTrasAlta({ estado: 'sin_compania' }))
    }
    // Se guardan las candidatas y la fila vuelve a 'pendiente': el segundo paso (`csg_c`) es de un solo uso también.
    const ok = await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'pendiente', datos = datos || ${JSON.stringify({ candidatos: res.candidatas })}::jsonb
      WHERE id = ${d.id} AND estado = 'enviando'`).catch(() => null)
    if (!ok) return linea(lineaTrasAlta({ estado: 'sin_compania' }))
    return { linea: lineaTrasAlta(res), botones }
  }
  if (res.estado === 'error') {
    // Fallo: se conservan los datos (sin purgar) para poder añadirlo a mano. Incierto → 'incierto' (como `clp_*`) y el
    // ✅ puede repetirse (el puerto es idempotente por email); previo → 'fallido'.
    const est = res.incierto ? 'incierto' : 'fallido'
    await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET estado = ${est}, resultado = ${JSON.stringify({ motivo: res.motivo ?? null })}::jsonb WHERE id = ${d.id} AND estado = 'enviando'`).catch(() => {})
  } else if (res.estado === 'sin_compania') {
    await cerrar(d.id, 'fallido', { motivo: 'sin_compania' })
  } else {
    await cerrar(d.id, 'enviado', { estado: res.estado })
  }
  return linea(lineaTrasAlta(res))
}

/**
 * «↩️ Deshacer» del alta automática: desactiva el contacto (`activo=false`) por el puerto de asegura. Un solo uso:
 * `enviado(auto) → enviando` reserva la fila; éxito → `descartado` (y se borra el id); fallo (incierto o no) → vuelve a
 * `enviado` para poder repetir (desactivar es idempotente). Solo vale sobre filas creadas por el alta automática.
 */
async function deshacerAlta(id: number, actor: string): Promise<string> {
  const filas = await prisma.$queryRaw<{ datos: unknown }[]>(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'enviando', decidido_por = ${actor}, decidido_at = now()
    WHERE id = ${id} AND tipo = ${TIPO_PENDIENTE_CSG} AND estado = 'enviado' AND resultado->>'auto' = 'true'
      AND datos ? 'contactoId' AND caduca_at > now()
    RETURNING datos`).catch(() => null)
  if (filas === null) return lineaTrasDeshacer({ estado: 'error' })
  if (!filas.length) return 'ℹ️ <i>Esto ya estaba resuelto, deshecho o ha caducado.</i>'
  const contactoId = leerContactoIdGuardado(filas[0].datos)
  let res = interpretarDeshacer(500, null)
  if (contactoId) {
    try {
      const r = await desactivarContactoAsegura(contactoId)
      res = interpretarDeshacer(r.status, r.json)
    } catch (e) {
      console.error('[csg] deshacer alta:', e instanceof Error ? e.name : 'error')
    }
  }
  if (res.estado === 'error') {
    await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET estado = 'enviado' WHERE id = ${id} AND estado = 'enviando'`).catch(() => {})
  } else {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'descartado', resultado = ${JSON.stringify({ estado: res.estado })}::jsonb, datos = datos - 'contactoId'
      WHERE id = ${id} AND estado = 'enviando'`).catch(() => {})
  }
  return lineaTrasDeshacer(res)
}
