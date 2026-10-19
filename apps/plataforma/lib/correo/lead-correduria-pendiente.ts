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
  botonesPeticion, borradorEditado, interpretarEnvioPeticion, leerDatosPeticion, lineaTrasEnviar, purgaAlCerrar,
  CLAVES_PII_PENDIENTE, textoBorradorTelegram, textoPedirEdicion, type DatosPeticion, type DecisionClp,
} from './lead-correduria-peticion'
import {
  cambiosViviendaDesdeCatastro, conocidosDeVivienda, puedeEscribirCatastro, elegirViviendaCatastro, lineaCatastroTelegram, type DatosCatastroLead,
} from './lead-correduria-catastro'
import { ACTOR_TRIAJE_CORREO } from './lead-correduria'
import { decidirGuardaManual, lineaClienteEscribioManual, type Silencio } from './lead-correduria-seguimiento'

// ─── Purga (revisión 19/10/2026) ─────────────────────────────────────────────
// Un pendiente CERRADO (enviado, descartado o caducado) no necesita ni el email del lead ni el texto: se anulan y
// quedan solo ids y estado (`CLAVES_PII_PENDIENTE`). Lo enviado ya consta en asegura (`correo_envio` + historial).
// Fallido/incierto los conservan: Alberto tiene que poder mirarlo antes de contestar a mano.
const PURGA = Prisma.sql`datos = datos - ${[...CLAVES_PII_PENDIENTE]}::text[], borrador = ''`
/** La purga de un cierre según tipo y estado (`purgaAlCerrar`, con test): fallido/incierto ya no guardan email ni nombre. */
const purgaDe = (tipo: string, estado: string) => {
  const p = purgaAlCerrar(tipo, estado)
  return p.borrador ? Prisma.sql`, datos = datos - ${p.claves}::text[], borrador = ''` : Prisma.sql`, datos = datos - ${p.claves}::text[]`
}

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
  /** F2: el resumen de su respuesta (HTML seguro) encabeza el borrador de la repregunta. */
  resumen?: string | null
}): Promise<{ id: number; nuevo: boolean } | null> {
  await purgarCaducados()
  // La repregunta (F2) es otra fila (`tipo`), con su propio «un correo = un pendiente».
  const tipo = a.datos.tipo === 'repregunta' ? 'repregunta' : 'peticion_datos'
  let id: number
  try {
    const filas = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
      INSERT INTO correduria_pendiente_tg (tipo, gmail_message_id, datos, borrador)
      VALUES (${tipo}, ${a.gmailMessageId}, ${JSON.stringify(a.datos)}::jsonb, ${a.borrador})
      ON CONFLICT (gmail_message_id, tipo) DO NOTHING
      RETURNING id`)
    if (!filas.length) {
      const ya = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        SELECT id FROM correduria_pendiente_tg WHERE gmail_message_id = ${a.gmailMessageId} AND tipo = ${tipo}`)
      return ya.length ? { id: Number(ya[0].id), nuevo: false } : null
    }
    id = Number(filas[0].id)
  } catch (e) {
    console.error('[triaje] pendiente de la petición (¿falta el SQL 2026-10-19b?):', e instanceof Error ? e.name : 'error')
    return null
  }
  // F5: con el modo automático que Alberto activó para ESTE tipo (y dentro de ventana y tope), sale solo y se avisa
  // «🤖 enviado solo» con ⏸. Cualquier «no» (apagado, fuera de ventana, tope, tablas sin crear) = el ✅ de siempre.
  // 🚨 Y solo si NO ha entrado otro correo suyo después del que se contesta (aunque el triaje no lo casara con el hilo).
  const { enviarSoloSiToca, silencioCliente } = await import('./lead-correduria-seguimiento-proceso')
  const { huellaRemitente } = await import('@central/module-seguros/huella-remitente')
  const huella = huellaRemitente(a.datos.to)
  const solo = await enviarSoloSiToca({
    id, tipo, pila: a.datos.pila, ramos: a.datos.ramos,
    silencio: () => silencioCliente({ huellas: huella ? [huella] : null, trasMensaje: a.datos.messageId, hilo: [a.datos.messageId, ...a.datos.references] }),
    enviar: (actor) => enviarPeticionReclamada(id, a.datos, a.borrador, actor),
  }).catch(() => false)
  if (solo) return { id, nuevo: true }
  const texto = textoBorradorTelegram({ id, datos: a.datos, borrador: a.borrador, preguntas: a.preguntas, catastro: a.catastro, resumen: a.resumen ?? null })
  const msg = tipo === 'repregunta'
    ? await tgAvisoBotones('correduria.lead-respuesta', texto, botonesPeticion(id)).catch(() => null)
    : await tgAvisoBotones('correduria.lead-peticion', texto, botonesPeticion(id)).catch(() => null)
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

/**
 * ✅ / ✏️ / ❌ y, F3a, 🤖 `tar` / ➕ `top`. Devuelve la línea que sustituye a los botones (o `null` si ya se ha contestado de
 * otra forma). `mensajeId`: el mensaje pulsado (el ➕ es de un solo uso POR mensaje).
 */
export async function resolverBotonClp(d: Extract<DecisionClp, { ok: true }>, mensajeId: number | null = null): Promise<string | null> {
  // F5: 🗑 cerrar perdida, 🔓 pasar a automático y ⏸ volver a manual.
  if (d.accion === 'per' || d.accion === 'aut' || d.accion === 'man') return (await import('./lead-correduria-seguimiento-proceso')).resolverBotonSeguimiento(d)
  // F3a (import dinámico: el proceso de tarificar usa `proponerPeticion` de este fichero).
  if (d.accion === 'top') return (await import('./lead-correduria-tarificar-proceso')).resolverTopeClp(d.dia, d.quien, mensajeId)
  if (d.accion === 'tar') return (await import('./lead-correduria-tarificar-proceso')).resolverTarificarClp(d.id, d.quien)
  // F3b: repregunta tras el fallo de un bot (📝 `clp_fal`) y elección en una discrepancia (`clp_dis`).
  if (d.accion === 'fal') return (await import('./lead-correduria-tarificar-proceso')).resolverFalloClp(d.id, d.quien)
  if (d.accion === 'dis') return (await import('./lead-correduria-discrepancia-proceso')).resolverDiscrepanciaClp(d)
  // F4 (import dinámico: el proceso de la propuesta usa `proponerPeticion` de este fichero).
  if (d.accion === 'pro') return (await import('./lead-correduria-propuesta-proceso')).resolverPropuestaClp(d.id, d.n, d.quien)
  if (d.accion === 'eli') return (await import('./lead-correduria-propuesta-proceso')).resolverElegirClp(d.id)
  if (d.accion === 'no') {
    const filas = await prisma.$queryRaw<{ tipo: string }[]>(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'descartado', decidido_por = ${actorTelegram(d.quien)}, decidido_at = now(), esperando_edit = false, ${PURGA}
      WHERE id = ${d.id} AND estado = 'pendiente'
      RETURNING tipo`).catch(() => null)
    if (filas === null) return '⚠️ <i>No he podido descartarlo; caduca solo a los 7 días.</i>'
    if (!filas.length) return lineaTrasEnviar({ estado: 'usado' })
    // F5: un rechazo reinicia la racha de «soltar a automático» de ese tipo.
    await registrarDecision(filas[0].tipo, 'rechazado')
    return filas[0].tipo === 'tarificar'
      ? '⏸ <i>En espera: no se ha lanzado ningún bot. Cuando quieras, pide el precio desde su ficha.</i>'
      : filas[0].tipo === 'discrepancia'
        ? '⏸ <i>Sin elegir: el expediente sigue sin estar completo (elige en la ficha cuando quieras).</i>'
      : filas[0].tipo === 'propuesta'
        ? '🚫 <i>Propuesta NO enviada: no se le ha mandado nada y no te la vuelvo a proponer. Si cambias de idea, desde su ficha.</i>'
        : '❌ <i>Descartado: no se le ha enviado nada.</i>'
  }
  if (d.accion === 'edt') {
    // Un pendiente de TARIFICAR no tiene texto que editar: el dato se corrige en la ficha y el 🤖 sigue vivo.
    const tar = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
      SELECT id FROM correduria_pendiente_tg WHERE id = ${d.id} AND tipo = 'tarificar' AND estado = 'pendiente' AND caduca_at > now()`).catch(() => null)
    if (tar?.length) {
      const { botonesTarificar } = await import('./lead-correduria-tarificar')
      await tgSendButtons(`✏️ Corrige el dato en su ficha (/correduria → oportunidad → riesgo) y vuelve a pulsar 🤖 (#clp${d.id}). No se ha lanzado nada.`, botonesTarificar(d.id)).catch(() => null)
      return null
    }
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_pendiente_tg SET esperando_edit = true
      WHERE id = ${d.id} AND tipo NOT IN ('tarificar', 'discrepancia') AND estado = 'pendiente' AND caduca_at > now()`).catch(() => null)
    if (!n) return lineaTrasEnviar({ estado: 'usado' })
    await tgAskForReply(textoPedirEdicion(d.id)).catch(() => null)
    return null
  }
  // ✅ Un solo uso: dos pulsaciones (o un reintento del webhook) = una gana.
  // 🚨 Ni un pendiente de tarificar (no es un correo) ni una PROPUESTA (F4): la propuesta solo sale por 📤 `clp_pro`, con
  //    el precio exacto y el aviso del presupuesto; por aquí saldría su texto suelto como si fuera una petición de datos.
  const filas = await prisma.$queryRaw<{ datos: unknown; borrador: string; tipo: string; editado: boolean }[]>(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = 'enviando', esperando_edit = false, decidido_por = ${actorTelegram(d.quien)}, decidido_at = now()
    WHERE id = ${d.id} AND tipo NOT IN ('tarificar', 'discrepancia', 'propuesta') AND estado = 'pendiente' AND caduca_at > now()
    RETURNING datos, borrador, tipo, editado`).catch(() => null)
  if (filas === null) return '⚠️ <i>No he podido leer el borrador: no se ha enviado nada.</i>'
  if (!filas.length) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_pendiente_tg SET estado = 'caducado', esperando_edit = false, ${PURGA} WHERE id = ${d.id} AND tipo NOT IN ('tarificar', 'discrepancia', 'propuesta') AND estado = 'pendiente' AND caduca_at <= now()`).catch(() => {})
    return lineaTrasEnviar({ estado: 'usado' })
  }
  const fila = filas[0]
  // F5: el recordatorio al cliente sale por su propio puerto (asegura pone el destinatario desde la ficha).
  const r = fila.tipo === 'recordatorio_cliente'
    ? await (await import('./lead-correduria-seguimiento-proceso')).enviarRecordatorioReclamado(d.id, fila.datos, fila.borrador, actorTelegram(d.quien))
    : await enviarPeticionManual(d.id, fila.tipo, fila.datos, fila.borrador, actorTelegram(d.quien))
  // F5: solo un ✅ SIN editar que de verdad salió suma a la racha; uno editado la reinicia.
  if (r.enviado) await registrarDecision(fila.tipo, fila.editado ? 'editado' : 'aprobado')
  return r.linea
}

/**
 * ✅ MANUAL de petición/repregunta: antes de mandar, ¿ha escrito el cliente en el hilo desde que se preparó el borrador
 * (aunque un filtro de Gmail lo etiquetara o archivara)? Si sí NO sale: el pendiente vuelve a `pendiente` (con sus
 * botones, reenviado) y se avisa sin datos personales. Si no se pudo comprobar, decide Alberto (`decidirGuardaManual`).
 */
async function enviarPeticionManual(id: number, tipo: string, datosRaw: unknown, borrador: string, actor: string): Promise<{ enviado: boolean; linea: string }> {
  const datos = leerDatosPeticion(datosRaw)
  if (datos && (tipo === 'peticion_datos' || tipo === 'repregunta')) {
    const { silencioCliente } = await import('./lead-correduria-seguimiento-proceso')
    const { huellaRemitente } = await import('@central/module-seguros/huella-remitente')
    const huella = huellaRemitente(datos.to)
    const s = await silencioCliente({ huellas: huella ? [huella] : null, trasMensaje: datos.messageId, hilo: [datos.messageId, ...datos.references] })
      .catch((): Silencio => ({ estado: 'no_se_sabe', motivo: 'sin_leer' }))
    if (decidirGuardaManual(s) === 'cliente_escribio') {
      const vuelto = await prisma.$executeRaw(Prisma.sql`
        UPDATE correduria_pendiente_tg SET estado = 'pendiente', decidido_por = NULL, decidido_at = NULL
        WHERE id = ${id} AND estado = 'enviando'`).catch(() => 0)
      if (vuelto) {
        const msg = await tgSendButtons(textoBorradorTelegram({ id, datos, borrador, preguntas: null }), botonesPeticion(id)).catch(() => null)
        if (msg !== null) await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET tg_message_id = ${msg} WHERE id = ${id}`).catch(() => {})
      }
      return { enviado: false, linea: lineaClienteEscribioManual() }
    }
  }
  return enviarPeticionReclamada(id, datosRaw, borrador, actor)
}

/**
 * Envía un pendiente de petición/repregunta YA reclamado (`estado = 'enviando'`) por el puerto de asegura y lo cierra.
 * Lo usan el ✅ de Alberto y el modo automático (F5): un solo camino de envío. Nunca lanza.
 */
export async function enviarPeticionReclamada(id: number, datosRaw: unknown, borrador: string, actor: string): Promise<{ enviado: boolean; linea: string }> {
  const datos = leerDatosPeticion(datosRaw)
  if (!datos) {
    await cerrar(id, 'fallido', { motivo: 'ilegible' })
    return { enviado: false, linea: lineaTrasEnviar({ estado: 'ilegible' }) }
  }
  const r = await peticionLeadAsegura({
    clienteId: datos.clienteId, oportunidadIds: datos.oportunidadIds, to: datos.to, asunto: datos.asunto, texto: borrador,
    enRespuestaA: { messageId: datos.messageId, references: datos.references }, idempotencia: `clp-${id}`,
    actor, ...(datos.tipo === 'repregunta' ? { tipo: 'repregunta' } : {}),
  }).catch(() => ({ status: 502, json: { motivo: 'red' } }))
  const res = interpretarEnvioPeticion(r.status, r.json)
  await cerrar(id, res.estado === 'enviado' ? 'enviado' : res.estado === 'no_enviado' ? 'fallido' : 'incierto', res)
  return { enviado: res.estado === 'enviado', linea: lineaTrasEnviar(res) }
}

/** F5: la decisión de Alberto en la racha de «soltar a automático» (los tipos que no pueden ir solos se ignoran). */
async function registrarDecision(tipo: string, d: 'aprobado' | 'editado' | 'rechazado'): Promise<void> {
  await (await import('./lead-correduria-seguimiento-proceso')).registrarDecisionAuto(tipo, d).catch(() => {})
}

async function cerrar(id: number, estado: 'enviado' | 'fallido' | 'incierto', resultado: unknown): Promise<void> {
  // Lo ENVIADO se purga entero; fallido/incierto conservan asunto y texto para contestar a mano, pero ya no el email ni el
  // nombre (`purgaAlCerrar`; revisión F3a). Aquí solo llegan petición y repregunta (los que envían al cliente).
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_pendiente_tg SET estado = ${estado}, resultado = ${JSON.stringify(resultado ?? null)}::jsonb${purgaDe('peticion_datos', estado)}
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
  const filas = await prisma.$queryRaw<{ datos: unknown; tipo: string }[]>(Prisma.sql`
    UPDATE correduria_pendiente_tg SET borrador = ${nuevo}, editado = true, esperando_edit = false
    WHERE id = ${id} AND estado = 'pendiente' AND esperando_edit AND caduca_at > now()
    RETURNING datos, tipo`).catch(() => null)
  if (!filas?.length) return false
  // F4: la propuesta vuelve con SUS botones (📤/🔀), nunca con el ✅ de una petición de datos.
  if ((filas[0].datos as { tipo?: unknown } | null)?.tipo === 'propuesta') {
    return (await import('./lead-correduria-propuesta-proceso')).reenviarPropuestaEditada(id)
  }
  // F5: una edición reinicia la racha de «soltar a automático» de ese tipo.
  await registrarDecision(filas[0].tipo, 'editado')
  if (filas[0].tipo === 'recordatorio_cliente') {
    await (await import('./lead-correduria-seguimiento-proceso')).reenviarRecordatorioEditado(id, filas[0].datos, nuevo)
    return true
  }
  const datos = leerDatosPeticion(filas[0].datos)
  if (!datos) return true
  const msg = await tgSendButtons(textoBorradorTelegram({ id, datos, borrador: nuevo, preguntas: null, editado: true }), botonesPeticion(id)).catch(() => null)
  if (msg !== null) await prisma.$executeRaw(Prisma.sql`UPDATE correduria_pendiente_tg SET tg_message_id = ${msg} WHERE id = ${id}`).catch(() => {})
  return true
}
