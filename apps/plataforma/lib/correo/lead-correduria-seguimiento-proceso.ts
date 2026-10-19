// lib/correo/lead-correduria-seguimiento-proceso.ts — la parte con RED y BD del seguimiento del lead y de «soltar a
// automático» (19/10/2026, spec lead → propuesta F5). Las reglas viven en `lead-correduria-seguimiento.ts` y en
// `@central/module-seguros` (`seguimiento-lead.ts`), puros y con test. Aquí solo se encadenan:
//
//   · `pasadaSeguimientoLeads` → al final de cada pasada del triaje (cada ~10 min), SOLO en ventana 9-20 h Madrid y
//     SOLO si el buzón se ha leído entero y sin errores (si no, «no contestó» podría ser «no lo he podido leer»).
//     Pregunta a asegura los hilos vivos, decide el hito y lo deja como pendiente de un solo uso
//     (`correduria_pendiente_tg`, tipo `recordatorio_cliente`, clave `f5:<hilo>:<etapa>:<ancla>`): el índice único
//     `(gmail_message_id, tipo)` es lo que hace que cada hito se avise UNA vez y nunca en cada pasada.
//   · `enviarSoloSiToca`       → el modo automático (tipo, ventana, tope diario). Si no toca, `false` y el ✅ de siempre.
//   · `registrarDecisionAuto`  → la racha por tipo (✅ sin editar suma; editar o rechazar la reinicia) y la oferta 🔓.
//   · `resolverBotonSeguimiento` → 🗑 `per`, 🔓 `aut`, ⏸ `man`.
// Nunca lanza hacia el triaje. Nada de datos personales en `console.*`.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { tgSendButtons } from '@central/core-telegram'
import { tgAviso, tgAvisoBotones } from '@/lib/telegram/avisos'
import { seguimientoLeadAsegura } from '@/lib/seguimiento-asegura'
import { ETAPAS_CON_ENVIO, claveHitoSeguimiento, enVentanaSeguimiento, hitoSeguimientoLead } from '@central/module-seguros'
import { CLAVES_PII_PENDIENTE, purgaAlCerrar, type DecisionClp } from './lead-correduria-peticion'
import { hoyMadrid } from './lead-correduria'
import {
  RACHA_PARA_OFRECER, botonesCerrar, decidirSilencioCliente, lineaSilencio, textoClienteEscribio, botonesOfertaAuto, botonesRecordatorio, botonesVolverManual, debeOfrecerAuto, decidirEnvioAuto,
  esTipoAutomatizable, interpretarPendientes, interpretarRecordar, leerDatosRecordatorio, lineaModo, lineaTrasCerrar, lineaTrasRecordar,
  rachaTras, textoAvisoSeguimiento, textoEnviadoSolo, textoOfertaAuto, textoRecordatorioCliente, topeAutoDiario,
  type DatosRecordatorio, type DecisionManual, type Silencio, type TipoAutomatizable,
} from './lead-correduria-seguimiento'

const PURGA = Prisma.sql`datos = datos - ${[...CLAVES_PII_PENDIENTE]}::text[], borrador = ''`
/** Cierre de un recordatorio (`purgaAlCerrar`): enviado = todo; fallido/incierto conservan asunto y texto, no el nombre. */
const purgaRecordatorio = (estado: string) => {
  const p = purgaAlCerrar('recordatorio_cliente', estado)
  return p.borrador ? PURGA : Prisma.sql`datos = datos - ${p.claves}::text[]`
}
/** Hitos nuevos como mucho por pasada: el triaje tiene presupuesto de tiempo. Lo que no cabe lo coge la siguiente. */
const TOPE_HITOS_PASADA = 10
const tope = () => topeAutoDiario(process.env.ASEGURA_ENVIO_AUTO_TOPE_DIARIO)
const actorTelegram = (quien: string) => `agente:telegram-${quien}`

// ─── ¿Ha escrito el cliente? ─────────────────────────────────────────────────

/**
 * ¿Ha entrado en el buzón algún correo de esas huellas DESPUÉS de la referencia? Mira `correo_triaje` entero (todo lo
 * que entra, se clasifique como se clasifique), no solo lo casado con el hilo. Referencia: `desde` (ISO del último
 * envío) o `trasMensaje` (el Message-ID del correo suyo al que se contesta: cuenta lo que entró después de él).
 * Cualquier fallo = `no_se_sabe`. Nunca lanza. La huella en SQL es la de `huellaRemitente` (cepo en el test).
 */
export async function silencioCliente(a: { huellas: readonly string[] | null; desde?: string; trasMensaje?: string }, ahora = new Date()): Promise<Silencio> {
  const huellas = a.huellas?.length ? [...a.huellas] : null
  if (!huellas) return decidirSilencioCliente({ huellas: null, referencia: null, entrantes: null, cursorAt: null, ahora })
  const ref = a.trasMensaje !== undefined
    ? Prisma.sql`(SELECT min(created_at) FROM correo_triaje WHERE gmail_message_id = ${a.trasMensaje})`
    : Prisma.sql`${a.desde ?? null}::timestamptz`
  const f = await prisma.$queryRaw<{ referencia: Date | null; n: bigint | number | null; cursor_at: Date | null }[]>(Prisma.sql`
    WITH r AS (SELECT ${ref} AS t)
    SELECT r.t AS referencia,
      (SELECT count(*) FROM correo_triaje c
        WHERE r.t IS NOT NULL
          AND (c.created_at > r.t OR c.fecha > r.t)
          AND c.gmail_message_id IS DISTINCT FROM ${a.trasMensaje ?? null}
          AND encode(sha256(convert_to(lower(btrim(c.remitente)), 'UTF8')), 'hex') = ANY(${huellas}::text[])) AS n,
      (SELECT updated_at FROM correo_cursor WHERE buzon = 'INBOX') AS cursor_at
    FROM r`).catch(() => null)
  const fila = f?.[0]
  return decidirSilencioCliente({
    huellas, referencia: fila?.referencia ?? null, entrantes: fila && fila.n !== null ? Number(fila.n) : null, cursorAt: fila?.cursor_at ?? null, ahora,
  })
}

// ─── La pasada del cron ──────────────────────────────────────────────────────

export type ResultadoPasadaSeguimiento = {
  avisados: number; enviadosSolos: number
  /** Hitos no avisados porque el cliente HA ESCRITO (aviso sin botones) o porque no se pudo comprobar (se reintenta). */
  haEscrito?: number; sinComprobar?: number
  omitido?: 'fuera_de_ventana' | 'no_se_sabe'
}

/** Asunto del correo original del lead (el triaje ya lo guarda); sin él, uno neutro. */
async function asuntoDeRaiz(raiz: string | null): Promise<string> {
  if (!raiz) return 'Tu seguro'
  const f = await prisma.$queryRaw<{ asunto: string | null }[]>(Prisma.sql`
    SELECT asunto FROM correo_triaje WHERE gmail_message_id = ${raiz} LIMIT 1`).catch(() => [])
  return f[0]?.asunto?.trim() || 'Tu seguro'
}

export async function pasadaSeguimientoLeads(ahora = new Date()): Promise<ResultadoPasadaSeguimiento> {
  const out: ResultadoPasadaSeguimiento = { avisados: 0, enviadosSolos: 0 }
  // 🚨 Fuera de 9-20 h (Madrid) no se avisa ni se envía nada: ni a Alberto ni al cliente.
  if (!enVentanaSeguimiento(ahora)) return { ...out, omitido: 'fuera_de_ventana' }
  const r = await seguimientoLeadAsegura({ accion: 'pendientes' }).catch(() => ({ status: 502, json: null }))
  const p = interpretarPendientes(r.status, r.json)
  if (p.estado !== 'ok') {
    console.error('[triaje] seguimiento de leads sin mirar:', p.motivo)
    return { ...out, omitido: 'no_se_sabe' }
  }
  for (const h of p.hilos) {
    if (out.avisados + out.enviadosSolos >= TOPE_HITOS_PASADA) break
    const hito = hitoSeguimientoLead(h.seguimiento, ahora)
    if (!hito) continue
    const conEnvio = ETAPAS_CON_ENVIO.includes(hito.etapa)
    // 🚨 ¿Ha escrito después del último envío aunque el triaje no lo casara con el hilo? Entonces no hay hito que avisar.
    const silencio = await silencioCliente({ huellas: h.remitentes, desde: hito.ancla }, ahora)
    if (silencio.estado === 'no_se_sabe') { out.sinComprobar = (out.sinComprobar ?? 0) + 1; continue } // la próxima pasada lo mira
    if (silencio.estado === 'ha_escrito') {
      // Una vez por hito (misma clave): la fila nace cerrada y sin datos personales; el aviso no lleva botones.
      const f = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        INSERT INTO correduria_pendiente_tg (tipo, gmail_message_id, datos, borrador, estado, resultado)
        VALUES ('recordatorio_cliente', ${claveHitoSeguimiento(h.hiloId, hito)},
                ${JSON.stringify({ hiloId: h.hiloId, clienteId: h.clienteId, etapa: hito.etapa, ancla: hito.ancla })}::jsonb, '',
                'descartado', '{"motivo":"cliente_escribio"}'::jsonb)
        ON CONFLICT (gmail_message_id, tipo) DO NOTHING
        RETURNING id`).catch(() => null)
      if (f?.length) {
        await tgAviso('correduria.lead-seguimiento', textoClienteEscribio({ pila: h.pila, ramos: h.ramos })).catch(() => null)
        out.haEscrito = (out.haEscrito ?? 0) + 1
      }
      continue
    }
    const datos: DatosRecordatorio = {
      hiloId: h.hiloId, clienteId: h.clienteId, etapa: hito.etapa, ancla: hito.ancla, pila: h.pila, ramos: h.ramos,
      asunto: await asuntoDeRaiz(h.raiz), remitentes: h.remitentes,
    }
    const borrador = conEnvio ? textoRecordatorioCliente({ pila: h.pila, etapa: hito.etapa, ramos: h.ramos }) : ''
    let id: number
    try {
      // Un hito = una fila (índice único): si ya existe, ya se avisó (o se envió) y no se repite.
      const filas = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        INSERT INTO correduria_pendiente_tg (tipo, gmail_message_id, datos, borrador)
        VALUES ('recordatorio_cliente', ${claveHitoSeguimiento(h.hiloId, hito)}, ${JSON.stringify(datos)}::jsonb, ${borrador})
        ON CONFLICT (gmail_message_id, tipo) DO NOTHING
        RETURNING id`)
      if (!filas.length) continue
      id = Number(filas[0].id)
    } catch (e) {
      console.error('[triaje] pendiente del recordatorio:', e instanceof Error ? e.name : 'error')
      return out
    }
    if (conEnvio) {
      const solo = await enviarSoloSiToca({
        id, tipo: 'recordatorio_cliente', pila: h.pila, ramos: h.ramos, ahora,
        silencio: () => silencioCliente({ huellas: datos.remitentes, desde: datos.ancla }),
        enviar: (actor) => enviarRecordatorioReclamado(id, datos, borrador, actor),
      }).catch(() => false)
      if (solo) { out.enviadosSolos++; continue }
    }
    const msg = await tgAvisoBotones('correduria.lead-seguimiento', textoAvisoSeguimiento({ id, datos, borrador }),
      conEnvio ? botonesRecordatorio(id) : botonesCerrar(id)).catch(() => null)
    if (msg === null) {
      // Sin botón nadie puede aprobarlo: se cierra (y NO se repite en cada pasada).
      await prisma.$executeRaw(Prisma.sql`
        UPDATE correduria_pendiente_tg SET estado = 'descartado', resultado = '{"motivo":"sin_telegram"}'::jsonb, ${PURGA} WHERE id = ${id}`).catch(() => {})
      continue
    }
    await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET tg_message_id = ${msg} WHERE id = ${id}`).catch(() => {})
    out.avisados++
  }
  return out
}

// ─── Envío del recordatorio (✅ o automático) ────────────────────────────────

/** Lo que devuelve un envío ya reclamado. `sinEnviar`: no se mandó por el silencio del cliente (ver `silencioCliente`). */
export type EnvioReclamado = { enviado: boolean; linea: string; sinEnviar?: 'ha_escrito' | 'no_se_sabe' }

async function cerrarRecordatorio(id: number, estado: 'enviado' | 'fallido' | 'incierto', resultado: unknown): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = ${estado}, resultado = ${JSON.stringify(resultado ?? null)}::jsonb, ${purgaRecordatorio(estado)}
    WHERE id = ${id} AND estado = 'enviando'`).catch(() => {})
}

/**
 * Envía un recordatorio YA reclamado (`estado = 'enviando'`) por el puerto de asegura, que vuelve a decidir el hito con
 * su BD (si el cliente contestó entre el aviso y el ✅, no sale) y pone el destinatario desde la ficha. Nunca lanza.
 */
export async function enviarRecordatorioReclamado(id: number, datosRaw: unknown, borrador: string, actor: string): Promise<EnvioReclamado> {
  const datos = leerDatosRecordatorio(datosRaw)
  if (!datos || !ETAPAS_CON_ENVIO.includes(datos.etapa) || borrador.trim().length < 20) {
    await cerrarRecordatorio(id, 'fallido', { motivo: 'ilegible' })
    return { enviado: false, linea: lineaTrasRecordar({ estado: 'ilegible' }) }
  }
  // 🚨 Justo antes de mandar (✅ o automático): si ha escrito después del último envío, no sale; si no se puede saber,
  //    tampoco (el pendiente vuelve a `pendiente` con su ✅ para reintentarlo, nada se pierde).
  const s = await silencioCliente({ huellas: datos.remitentes, desde: datos.ancla })
  if (s.estado === 'ha_escrito') {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'descartado', resultado = '{"motivo":"cliente_escribio"}'::jsonb, ${PURGA}
      WHERE id = ${id} AND estado = 'enviando'`).catch(() => {})
    return { enviado: false, linea: lineaSilencio(s, false), sinEnviar: 'ha_escrito' }
  }
  if (s.estado === 'no_se_sabe') {
    const vuelto = await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'pendiente', decidido_por = NULL, decidido_at = NULL
      WHERE id = ${id} AND estado = 'enviando'`).catch(() => 0)
    if (vuelto && !actor.startsWith('agente:auto-')) await reenviarRecordatorioEditado(id, datosRaw, borrador, false)
    return { enviado: false, linea: lineaSilencio(s, vuelto > 0 && !actor.startsWith('agente:auto-')), sinEnviar: 'no_se_sabe' }
  }
  const r = await seguimientoLeadAsegura({
    accion: 'recordar', hiloId: datos.hiloId, etapa: datos.etapa, ancla: datos.ancla, asunto: datos.asunto || 'Tu seguro', texto: borrador,
    idempotencia: `clp-${id}`, actor,
  }).catch(() => ({ status: 502, json: { motivo: 'red' } }))
  const res = interpretarRecordar(r.status, r.json)
  await cerrarRecordatorio(id, res.estado === 'enviado' ? 'enviado' : res.estado === 'no_enviado' ? 'fallido' : 'incierto', res)
  return { enviado: res.estado === 'enviado', linea: lineaTrasRecordar(res) }
}

/** ✏️ guardado de un recordatorio (o uno devuelto por «no se sabe»): vuelve a salir con sus botones (el ✅ sigue siendo obligatorio). */
export async function reenviarRecordatorioEditado(id: number, datosRaw: unknown, borrador: string, editado = true): Promise<void> {
  const datos = leerDatosRecordatorio(datosRaw)
  if (!datos) return
  const msg = await tgSendButtons(textoAvisoSeguimiento({ id, datos, borrador, editado }), botonesRecordatorio(id)).catch(() => null)
  if (msg !== null) await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET tg_message_id = ${msg} WHERE id = ${id}`).catch(() => {})
}

// ─── Modo automático ─────────────────────────────────────────────────────────

/** ¿Está encendido? Lo que no se puede leer (tabla sin crear, BD caída) = APAGADO. */
async function modoAuto(tipo: TipoAutomatizable): Promise<boolean> {
  const f = await prisma.$queryRaw<{ auto: boolean }[]>(Prisma.sql`
    SELECT auto FROM correduria_auto_config WHERE tipo = ${tipo}`).catch(() => null)
  return f?.[0]?.auto === true
}

/** Reserva UN envío automático del día (Madrid) si cabe en el tope. `null` = tope alcanzado o no se pudo reservar. */
async function reservarEnvioAuto(tipo: TipoAutomatizable, dia: string, max: number): Promise<number | null> {
  const f = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    INSERT INTO correduria_auto_envios (dia, tipo, n) VALUES (${dia}::date, ${tipo}, 1)
    ON CONFLICT (dia, tipo) DO UPDATE SET n = correduria_auto_envios.n + 1 WHERE correduria_auto_envios.n < ${max}
    RETURNING n`).catch(() => null)
  return f?.length ? Number(f[0].n) : null
}

/**
 * Si el modo automático de ESE tipo está encendido (lo encendió Alberto con 🔓), estamos en ventana y cabe en el tope
 * del día: reclama el pendiente, lo envía por el mismo camino que el ✅ y avisa «🤖 enviado solo» con ⏸. `false` = no
 * toca (o no se pudo reclamar): el llamante sigue con el borrador y el ✅ de siempre.
 */
export async function enviarSoloSiToca(a: {
  id: number; tipo: string; pila: string | null; ramos: readonly string[]; ahora?: Date
  /** 🚨 OBLIGATORIO: ¿ha escrito el cliente después de lo que se contesta/recuerda? Solo `callado` deja salir solo. */
  silencio: () => Promise<Silencio>
  enviar: (actor: string) => Promise<EnvioReclamado>
}): Promise<boolean> {
  if (!esTipoAutomatizable(a.tipo)) return false // 🚨 `propuesta` y `tarificar`: nunca solos
  const tipo = a.tipo
  const ahora = a.ahora ?? new Date()
  const max = tope()
  const enVentana = enVentanaSeguimiento(ahora)
  if (decidirEnvioAuto({ tipo, auto: await modoAuto(tipo), enVentana, usadosHoy: 0, tope: max }).modo !== 'auto') return false
  // Ante la duda (o si ha escrito), NO sale solo: el llamante deja el borrador con su ✅ y Alberto decide.
  if ((await a.silencio().catch((): Silencio => ({ estado: 'no_se_sabe', motivo: 'sin_leer' }))).estado !== 'callado') return false
  const n = await reservarEnvioAuto(tipo, hoyMadrid(ahora), max)
  if (decidirEnvioAuto({ tipo, auto: true, enVentana, usadosHoy: n === null ? max : n - 1, tope: max }).modo !== 'auto') return false
  const actor = `agente:auto-${tipo}`
  const reclamado = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'enviando', esperando_edit = false, decidido_por = ${actor}, decidido_at = now()
    WHERE id = ${a.id} AND tipo = ${tipo} AND estado = 'pendiente' AND caduca_at > now()
    RETURNING id`).catch(() => null)
  if (!reclamado?.length) return false
  const r = await a.enviar(actor)
  // La comprobación de dentro (justo antes de mandar) puede discrepar: «no se sabe» devuelve el pendiente → el ✅ de
  // siempre; «ha escrito» lo cierra → se avisa SIN decir «enviado solo».
  if (r.sinEnviar === 'no_se_sabe') return false
  if (r.sinEnviar === 'ha_escrito') {
    await tgAviso('correduria.lead-seguimiento', textoClienteEscribio({ pila: a.pila, ramos: a.ramos })).catch(() => null)
    return true
  }
  await tgAvisoBotones('correduria.lead-auto', textoEnviadoSolo({ tipo, pila: a.pila, ramos: a.ramos, linea: r.linea }), botonesVolverManual(tipo)).catch(() => null)
  return true
}

/**
 * La decisión de Alberto sobre un envío de `tipo`: ✅ sin editar suma 1 a la racha; editar o rechazar la ponen a 0.
 * Al llegar a 20 (y con el modo apagado y sin oferta abierta) se le OFRECE pasar a automático. Nunca lanza.
 */
export async function registrarDecisionAuto(tipo: string, d: DecisionManual): Promise<void> {
  if (!esTipoAutomatizable(tipo)) return // 🚨 la propuesta no tiene racha: no se le puede ofrecer nunca
  const suma = rachaTras(0, d) > 0
  try {
    await prisma.$executeRaw(Prisma.sql`INSERT INTO correduria_auto_config (tipo) VALUES (${tipo}) ON CONFLICT (tipo) DO NOTHING`)
    const f = await prisma.$queryRaw<{ racha: number; auto: boolean; oferta_abierta: boolean }[]>(Prisma.sql`
      UPDATE correduria_auto_config
      SET racha = ${suma ? Prisma.sql`racha + 1` : Prisma.sql`0`}, oferta_abierta = ${suma ? Prisma.sql`oferta_abierta` : Prisma.sql`false`}, actualizado_at = now()
      WHERE tipo = ${tipo}
      RETURNING racha, auto, oferta_abierta`)
    const e = f[0]
    if (!e || !debeOfrecerAuto({ tipo, racha: Number(e.racha), auto: e.auto, ofertaAbierta: e.oferta_abierta })) return
    const abierta = await prisma.$queryRaw<{ racha: number }[]>(Prisma.sql`
      UPDATE correduria_auto_config SET oferta_abierta = true, oferta_at = now()
      WHERE tipo = ${tipo} AND NOT auto AND NOT oferta_abierta AND racha >= ${RACHA_PARA_OFRECER}
      RETURNING racha`)
    if (!abierta.length) return
    const msg = await tgAvisoBotones('correduria.lead-auto', textoOfertaAuto(tipo, Number(abierta[0].racha), tope()), botonesOfertaAuto(tipo)).catch(() => null)
    if (msg === null) {
      await prisma.$executeRaw(Prisma.sql`UPDATE correduria_auto_config SET oferta_abierta = false WHERE tipo = ${tipo}`).catch(() => {})
      return
    }
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO correduria_auto_historial (tipo, evento, actor) VALUES (${tipo}, 'ofrecido', 'agente:triaje-correo')`).catch(() => {})
  } catch (err) {
    console.error('[triaje] racha de automático (¿falta el SQL 2026-10-19g?):', err instanceof Error ? err.name : 'error')
  }
}

// ─── Botones 🗑 / 🔓 / ⏸ ─────────────────────────────────────────────────────

export async function resolverBotonSeguimiento(d: Extract<DecisionClp, { accion: 'per' | 'aut' | 'man' }>): Promise<string> {
  const actor = actorTelegram(d.quien)
  if (d.accion === 'per') {
    // Un solo uso: el pendiente pasa a descartado (con el porqué) y SOLO quien lo consigue cierra el hilo.
    const filas = await prisma.$queryRaw<{ datos: unknown }[]>(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'descartado', esperando_edit = false, decidido_por = ${actor}, decidido_at = now(),
        resultado = '{"motivo":"cerrar_perdida"}'::jsonb, ${PURGA}
      WHERE id = ${d.id} AND tipo = 'recordatorio_cliente' AND estado = 'pendiente' AND caduca_at > now()
      RETURNING datos`).catch(() => null)
    if (filas === null) return '⚠️ <i>No he podido leer el aviso: no he cerrado nada.</i>'
    if (!filas.length) return lineaTrasRecordar({ estado: 'usado' })
    const datos = leerDatosRecordatorio(filas[0].datos)
    if (!datos) return lineaTrasRecordar({ estado: 'ilegible' })
    await registrarDecisionAuto('recordatorio_cliente', 'rechazado')
    const r = await seguimientoLeadAsegura({ accion: 'cerrar_perdida', hiloId: datos.hiloId, actor }).catch(() => ({ status: 502, json: null }))
    return lineaTrasCerrar(r.status, r.json)
  }
  if (!esTipoAutomatizable(d.tipo)) return lineaModo({ accion: d.accion, hecho: false, tipo: d.tipo, noAutomatizable: true })
  if (d.accion === 'aut') {
    // 🔓 SOLO con una oferta abierta y la racha intacta: es la autorización explícita de Alberto para ESTE tipo.
    const f = await prisma.$queryRaw<{ tipo: string }[]>(Prisma.sql`
      UPDATE correduria_auto_config SET auto = true, oferta_abierta = false, activado_por = ${actor}, activado_at = now(), actualizado_at = now()
      WHERE tipo = ${d.tipo} AND oferta_abierta AND NOT auto AND racha >= ${RACHA_PARA_OFRECER}
        AND tipo IN ('peticion_datos', 'repregunta', 'recordatorio_cliente')
      RETURNING tipo`).catch(() => null)
    if (f === null) return '⚠️ <i>No he podido cambiar el modo: sigue en MANUAL.</i>'
    if (f.length) await prisma.$executeRaw(Prisma.sql`INSERT INTO correduria_auto_historial (tipo, evento, actor) VALUES (${d.tipo}, 'activado', ${actor})`).catch(() => {})
    return lineaModo({ accion: 'aut', hecho: f.length > 0, tipo: d.tipo, tope: tope() })
  }
  const f = await prisma.$queryRaw<{ era: boolean }[]>(Prisma.sql`
    UPDATE correduria_auto_config c SET auto = false, oferta_abierta = false, racha = 0, desactivado_por = ${actor}, desactivado_at = now(), actualizado_at = now()
    FROM (SELECT tipo, auto AS era FROM correduria_auto_config WHERE tipo = ${d.tipo} FOR UPDATE) a
    WHERE c.tipo = a.tipo AND (c.auto OR c.oferta_abierta)
    RETURNING a.era`).catch(() => null)
  if (f === null) return '⚠️ <i>No he podido leer el modo. Si seguía en automático, vuelve a pulsar ⏸.</i>'
  if (f.length) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO correduria_auto_historial (tipo, evento, actor) VALUES (${d.tipo}, ${f[0].era ? 'desactivado' : 'rechazada_oferta'}, ${actor})`).catch(() => {})
  }
  return lineaModo({ accion: 'man', hecho: f.length > 0, tipo: d.tipo })
}
