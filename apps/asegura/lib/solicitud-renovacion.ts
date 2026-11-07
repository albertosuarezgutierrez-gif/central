// SOLICITUD DE DATOS DE LA RENOVACIÓN por la app (Alberto, 05/11/2026): la parte con BD, Catastro y Telegram. El flujo y sus
// porqués, en la cabecera de `solicitud-renovacion-reglas.ts` (PURO, con test). Migración: `prisma/sql/2026-11-05d_solicitud_datos_renovacion.sql`.
//
// Reutiliza, no rehace: la oportunidad de la póliza (`abrirRiesgoDePoliza`), el Catastro de la renovación (`catastroDeOportunidad`),
// el riesgo tal como lo leen los bots (`leerRiesgo` + `catalogosHogarVivos` + `faltasHogarBot`), la tabla y el formulario del
// enlace de datos (`solicitud_datos`, `insertarSolicitud`, `responderFila`: validación, cifrado, Catastro, escritura sin pisar y
// Telegram), quién lo ve en la app (`quienVeEnApp`, la misma regla que la renovación con alternativas) y la regla única de quién
// contesta (`quienContestaDatosRenovacion` de module-seguros-portal).
//
// 🛡️ Todo SQL por `correduria_id`. El puente del portal NO acepta `clienteId`: la ficha sale de la solicitud y quién la contesta,
//    del vínculo/autorización de la IDENTIDAD (fail-closed: cualquier duda = 404).
// 🚨 Nada sale al cliente sin el ✅ de Alberto (`publicada_at`). 🚨 Nada de esto cotiza (ni Avant2 ni bots) ni EMITE.
// 🚨 Sin la migración: `sin_migracion` (503) ANTES de escribir nada.
// El SQL crudo NO prefija `seguros.`: la conexión ya trae `?schema=seguros`.
import { randomBytes } from 'node:crypto'
import { tgSend, tgSendButtons } from '@central/core-telegram'
import { NADA_CONOCIDO, camposSolicitud, type CampoSolicitud } from '@central/module-seguros'
import { MOTIVO_SOLICITUD_RENOVACION, quienContestaDatosRenovacion, textoQuienContesto, type QuienContestaDatos } from '@central/module-seguros-portal'
import { datosViviendaParaBot, eleccionesInicialesHogar, faltasHogarBot, type FaltaHogarBot } from '@central/module-tarificacion'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { registrarErrorCartera } from './error-cartera'
import { abrirRiesgoDePoliza, leerRiesgo } from './oportunidad-riesgo'
import { catastroDeOportunidad, leerPoliza, quienVeEnApp } from './renovacion-alternativas'
import { decidirDestinatarios, decidirPreparacion, lineaCatastro } from './renovacion-alternativas-reglas'
import { filasAutorizacionRenovacion } from './renovacion-autorizados'
import { catalogosHogarVivos } from './tarificacion-lead'
import { hashToken, insertarSolicitud, responderFila, type FilaSolicitud, type ResultadoResponder } from './solicitud-datos'
import { nombreDePila } from './presupuesto-rpa-reglas'
import { URL_PLATAFORMA_DEFECTO } from './datos-cotizados'
import { botonesRevisionDatos, decidirPreguntas, lineaHistorialPreparadaDatos, mensajeVigente, textoRevisionDatos } from './solicitud-renovacion-reglas'
import { esColumnaAusente } from './pg-error'
import { lanzarBotsRenovacion } from './solicitud-renovacion-bots'
import { botonesBotsRenovacion, textoBotsRenovacion } from './solicitud-renovacion-bots-reglas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const db = () => prismaAsegura()
const plataforma = () => (process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO).replace(/\/$/, '')
export const urlModificarDatos = (polizaId: string) => `${plataforma()}/correduria/poliza/${polizaId}#datos-renovacion`

/** ¿Está la migración 2026-11-05d? Un fallo que NO es «falta la columna» se propaga (no se confunde con «no está»). */
export async function migracionSolicitudRenovacion(): Promise<boolean> {
  try {
    await db().$queryRaw`select motivo, poliza_id, publicada_at, publicada_por, revision_mensaje_id, respondida_por_papel, respondida_por_identidad_id, respondida_por_nombre from solicitud_datos limit 0`
    return true
  } catch (e) {
    if (esColumnaAusente(e)) return false
    throw e
  }
}

/** Lo que el bot echa en falta HOY del riesgo de la oportunidad (`null` = no se pudo leer: no se afirma nada). */
async function faltasDeOportunidad(correduriaId: string, oportunidadId: string): Promise<FaltaHogarBot[] | null> {
  const r = await leerRiesgo(correduriaId, oportunidadId)
  if (!r) return null
  const catalogos = await catalogosHogarVivos().catch(() => ({}))
  return faltasHogarBot({ ...datosViviendaParaBot(r), ...eleccionesInicialesHogar(r, catalogos) })
}

// ─── Preparar (Alberto, desde la póliza) ─────────────────────────────────────

export type ResultadoPrepararDatos =
  | { estado: 'creada' | 'actualizada'; solicitudId: string; preguntas: string[]; catastro: string | null; destinatarios: string[]; publicable: boolean; telegram: boolean }
  | { estado: 'sin_migracion' | 'invalido' | 'no_encontrado' | 'no_admite' | 'nada_que_pedir' | 'no_preguntable' | 'ya_publicada' | 'otra_solicitud' | 'error'; status: number; motivo: string }

export async function prepararSolicitudRenovacion(correduriaId: string, e: { polizaId: string; actor: string }, ahora: Date = new Date()): Promise<ResultadoPrepararDatos> {
  if (!UUID.test(e.polizaId)) return { estado: 'invalido', status: 422, motivo: 'polizaId no válido' }
  if (!(await migracionSolicitudRenovacion())) return { estado: 'sin_migracion', status: 503, motivo: 'Falta aplicar la migración 2026-11-05d_solicitud_datos_renovacion.sql.' }
  const pol = await leerPoliza(correduriaId, e.polizaId)
  const d = decidirPreparacion(pol)
  if (!d.ok || !pol) return { estado: d.ok ? 'no_encontrado' : d.status === 404 ? 'no_encontrado' : 'no_admite', status: d.ok ? 404 : d.status, motivo: d.ok ? 'póliza no encontrada' : d.motivo }
  if (pol.ramo !== 'hogar') return { estado: 'no_admite', status: 422, motivo: 'De momento la solicitud de datos de la renovación es solo para hogar (los bots de hogar).' }

  // 1. La oportunidad de la póliza y el Catastro (año y m² se rellenan solos si se puede; nunca pisa lo escrito).
  const ab = await abrirRiesgoDePoliza(correduriaId, { polizaId: e.polizaId, actor: e.actor })
  if (!ab.ok) return { estado: 'no_encontrado', status: ab.status, motivo: ab.motivo }
  const catastro = await catastroDeOportunidad(correduriaId, ab.oportunidadId, ahora)

  // 2. Lo que el bot echa en falta DESPUÉS del Catastro → las preguntas.
  const faltas = await faltasDeOportunidad(correduriaId, ab.oportunidadId)
  if (faltas === null) return { estado: 'error', status: 503, motivo: 'No se ha podido leer el riesgo de la oportunidad: no se pregunta nada a ciegas.' }
  const dec = decidirPreguntas(faltas, camposSolicitud('hogar', NADA_CONOCIDO))
  if (!dec.ok) return { estado: dec.motivo, status: dec.status, motivo: dec.texto }

  // 3. La fila (una viva por oportunidad y persona). La de renovación aún SIN publicar se rehace (✏️ Modificar = volver a
  //    prepararla); publicada, no se toca; otra solicitud viva (el enlace de siempre) no se pisa.
  const tomador = pol.clienteId
  type Hecho = { estado: 'creada' | 'actualizada'; id: string } | { estado: 'ya_publicada' | 'otra_solicitud' }
  const hecho: Hecho = await db().$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`solicitud:${ab.oportunidadId}:${tomador}`}))`)
    const [viva] = await tx.$queryRaw<{ id: string; motivo: string | null; publicada: Date | null }[]>(Prisma.sql`
      select id::text as id, motivo, publicada_at as publicada from solicitud_datos
      where oportunidad_id = ${ab.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid and cliente_id = ${tomador}::uuid
        and estado = 'pendiente' and caduca_at > now()`)
    if (viva && viva.motivo !== MOTIVO_SOLICITUD_RENOVACION) return { estado: 'otra_solicitud' as const }
    if (viva && viva.publicada) return { estado: 'ya_publicada' as const }
    if (viva) {
      await tx.$executeRaw(Prisma.sql`
        update solicitud_datos set campos = ${JSON.stringify(dec.campos)}::jsonb, poliza_id = ${e.polizaId}::uuid
        where id = ${viva.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente' and publicada_at is null`)
      return { estado: 'actualizada' as const, id: viva.id }
    }
    const [o] = await tx.$queryRaw<{ estado: string }[]>(Prisma.sql`
      select estado::text as estado from oportunidades where id = ${ab.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`)
    const r = await insertarSolicitud(tx, {
      correduriaId, oportunidadId: ab.oportunidadId, personaId: tomador, ramo: 'hogar', campos: dec.campos, actor: e.actor, tercero: false,
      estadoOportunidad: o?.estado ?? 'nueva',
    })
    // El token del enlace público NO se usa aquí: se rota a uno que nadie conoce (la solicitud solo se abre con sesión del portal).
    await tx.$executeRaw(Prisma.sql`
      update solicitud_datos set motivo = ${MOTIVO_SOLICITUD_RENOVACION}, poliza_id = ${e.polizaId}::uuid,
        token_hash = ${hashToken(randomBytes(32).toString('base64url'))}
      where id = ${r.id}::uuid and correduria_id = ${correduriaId}::uuid`)
    await tx.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${tomador}::uuid, cast('gestion' as tipo_historial_interno), ${lineaHistorialPreparadaDatos(dec.campos.length)})`)
    return { estado: 'creada' as const, id: r.id }
  })
  if (!('id' in hecho)) {
    if (hecho.estado === 'otra_solicitud') return { estado: 'otra_solicitud', status: 409, motivo: 'Ya hay otra petición de datos viva para este riesgo (enlace). Anúlala desde la oportunidad o espera a que conteste.' }
    return { estado: 'ya_publicada', status: 409, motivo: 'Ya se le pidieron estos datos por la app y aún no ha contestado.' }
  }
  const solicitudId = hecho.id
  anotarCambio({ entidad: 'solicitud_datos', id: solicitudId, campo: 'motivo', antes: null, despues: MOTIVO_SOLICITUD_RENOVACION })

  // 4. Telegram de revisión (interno). Best effort: la solicitud ya está; si no sale, se dice.
  const dest = decidirDestinatarios(await quienVeEnApp(correduriaId, tomador, e.polizaId))
  const [cab] = await db().$queryRaw<{ nombre: string | null }[]>`select nombre from clientes where id = ${tomador}::uuid and correduria_id = ${correduriaId}::uuid`
  const lineaCat = lineaCatastro(catastro)
  let telegram = false
  try {
    const texto = textoRevisionDatos({
      cliente: nombreDePila(cab?.nombre ?? null), compania: pol.actual.compania, vence: pol.actual.vence, preguntas: dec.preguntas,
      catastro: lineaCat, destinatarios: dest.lineas, publicable: dest.publicable,
    })
    const id = await tgSendButtons(texto, botonesRevisionDatos(solicitudId, urlModificarDatos(e.polizaId), dest.publicable))
    if (id !== null) {
      telegram = true
      await db().$executeRaw`update solicitud_datos set revision_mensaje_id = ${id} where id = ${solicitudId}::uuid and correduria_id = ${correduriaId}::uuid`
    }
  } catch (x) {
    registrarErrorCartera('solicitud-renovacion/telegram', x)
  }
  return { estado: hecho.estado, solicitudId: solicitudId, preguntas: dec.preguntas, catastro: lineaCat, destinatarios: dest.lineas, publicable: dest.publicable, telegram }
}

// ─── Publicar (el ✅ de Alberto) ─────────────────────────────────────────────

export type ResultadoPublicarDatos =
  | { estado: 'publicada' | 'ya_publicada'; solicitudId: string }
  | { estado: 'sin_migracion' | 'invalido' | 'no_encontrado' | 'no_vigente' | 'caducada' | 'canal_no_disponible' | 'contestada'; status: number; motivo: string }

/**
 * Publica la solicitud en la app (✅). Desde Telegram es OBLIGATORIO el `message_id` del botón y tiene que ser el del último
 * mensaje de revisión. Un solo uso (CAS sobre `publicada_at`). El plazo cuenta desde aquí. 503 `canal_no_disponible` = nadie que
 * pueda contestar usa la app (≠ «el envío falló»). El correo de aviso (sin datos) lo manda el cron `avisos-intranet`.
 */
export async function publicarSolicitudRenovacion(correduriaId: string, e: { solicitudId: string; actor: string; via: 'telegram' | 'pantalla'; telegramMessageId?: number | null }): Promise<ResultadoPublicarDatos> {
  if (!UUID.test(e.solicitudId)) return { estado: 'invalido', status: 422, motivo: 'solicitudId no válido' }
  if (!(await migracionSolicitudRenovacion())) return { estado: 'sin_migracion', status: 503, motivo: 'Falta aplicar la migración 2026-11-05d_solicitud_datos_renovacion.sql.' }
  const [s] = await db().$queryRaw<{ id: string; clienteId: string; polizaId: string | null; estado: string; caduca: Date; publicada: Date | null; mensaje: bigint | number | null; motivo: string | null }[]>`
    select id::text as id, cliente_id::text as "clienteId", poliza_id::text as "polizaId", estado, caduca_at as caduca, publicada_at as publicada,
           revision_mensaje_id as mensaje, motivo
    from solicitud_datos where id = ${e.solicitudId}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!s || s.motivo !== MOTIVO_SOLICITUD_RENOVACION || !s.polizaId) return { estado: 'no_encontrado', status: 404, motivo: 'No es una solicitud de datos de renovación de esta correduría.' }
  if (s.publicada) return { estado: 'ya_publicada', solicitudId: s.id }
  if (s.estado === 'completada') return { estado: 'contestada', status: 409, motivo: 'Ya está contestada.' }
  if (s.estado !== 'pendiente' || s.caduca.getTime() <= Date.now()) return { estado: 'caducada', status: 409, motivo: 'La solicitud caducó o se anuló: prepárala de nuevo.' }
  const vig = mensajeVigente(e.via, e.telegramMessageId ?? null, s.mensaje === null ? null : Number(s.mensaje))
  if (!vig.ok) return { estado: 'no_vigente', status: 409, motivo: vig.motivo }
  const dest = decidirDestinatarios(await quienVeEnApp(correduriaId, s.clienteId, s.polizaId))
  if (!dest.publicable) return { estado: 'canal_no_disponible', status: 503, motivo: dest.lineas[0] ?? 'Nadie que pueda contestar usa la app.' }
  const n = await db().$transaction(async (tx) => {
    const n = await tx.$executeRaw`
      update solicitud_datos set publicada_at = now(), publicada_por = ${e.actor.slice(0, 120)},
        caduca_at = now() + make_interval(days => 14)
      where id = ${s.id}::uuid and correduria_id = ${correduriaId}::uuid and motivo = ${MOTIVO_SOLICITUD_RENOVACION}
        and publicada_at is null and estado = 'pendiente' and caduca_at > now()`
    if (n === 0) return 0
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${s.clienteId}::uuid, cast('gestion' as tipo_historial_interno),
              ${'Solicitud de datos de la renovación de hogar enviada a la app del cliente (✅ de Alberto): le llega a la campana y un correo de aviso sin datos.'})`
    return n
  })
  if (n === 0) return { estado: 'ya_publicada', solicitudId: s.id }
  anotarCambio({ entidad: 'solicitud_datos', id: s.id, campo: 'publicada_at', antes: null, despues: 'app' })
  return { estado: 'publicada', solicitudId: s.id }
}

// ─── Lado del portal (por IDENTIDAD, por el puente) ──────────────────────────

type FilaRenovacion = FilaSolicitud & { polizaId: string | null; publicada: Date | null; motivo: string | null }

async function filaRenovacion(correduriaId: string, id: string): Promise<FilaRenovacion | null> {
  if (!UUID.test(id)) return null
  const [f] = await db().$queryRaw<FilaRenovacion[]>`
    select id::text as id, correduria_id::text as "correduriaId", oportunidad_id::text as "oportunidadId",
           cliente_id::text as "clienteId", ramo, estado, caduca_at as caduca, campos, tercero, creada_por as "creadaPor",
           poliza_id::text as "polizaId", publicada_at as publicada, motivo
    from solicitud_datos where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
  // Solo las de RENOVACIÓN y PUBLICADAS existen para el portal: una sin ✅ es como si no existiera.
  return f && f.motivo === MOTIVO_SOLICITUD_RENOVACION && f.publicada !== null && f.polizaId ? f : null
}

/** ¿Quién es esta identidad para esta solicitud? `null` = nadie (404). La regla es la ÚNICA, la del portal. */
async function quienEs(correduriaId: string, f: FilaRenovacion, identidadId: string): Promise<QuienContestaDatos | null> {
  const [v] = await db().$queryRaw<{ nivel: string; origen: string }[]>`
    select nivel::text as nivel, origen::text as origen from portal_vinculo
    where correduria_id = ${correduriaId}::uuid and identidad_id = ${identidadId}::uuid and cliente_id = ${f.clienteId}::uuid
    order by (origen::text = 'corredor') asc limit 1`
  const filas = await filasAutorizacionRenovacion(correduriaId, f.clienteId, identidadId)
  return quienContestaDatosRenovacion({ identidadId, vinculo: v ?? null, filas, polizaId: f.polizaId, ahora: new Date() })
}

export type SolicitudParaIdentidad =
  | { estado: 'ok'; ramo: string; campos: CampoSolicitud[]; papel: 'tomador' | 'autorizado' }
  | { estado: 'completada' | 'muerta' | 'no_encontrada' | 'sin_migracion' }

/** Lo que pinta la página del portal: solo los CAMPOS (etiquetas). Nada de la ficha, ni el DNI (lo tiene la ficha). */
export async function solicitudParaIdentidad(correduriaId: string, identidadId: string, solicitudId: string): Promise<SolicitudParaIdentidad> {
  if (!UUID.test(identidadId) || !UUID.test(solicitudId)) return { estado: 'no_encontrada' }
  if (!(await migracionSolicitudRenovacion())) return { estado: 'sin_migracion' }
  const f = await filaRenovacion(correduriaId, solicitudId)
  if (!f) return { estado: 'no_encontrada' }
  const quien = await quienEs(correduriaId, f, identidadId)
  if (!quien) return { estado: 'no_encontrada' }
  if (f.estado === 'completada') return { estado: 'completada' }
  if (f.estado !== 'pendiente' || f.caduca.getTime() <= Date.now()) return { estado: 'muerta' }
  return { estado: 'ok', ramo: f.ramo, campos: f.campos, papel: quien.papel }
}

export type ResultadoResponderIdentidad = ResultadoResponder | { ok: false; estado: 'no_encontrada' | 'sin_migracion' }

/**
 * Contesta (tomador o autorizado). Se aceptan EXACTAMENTE los campos que se aprobaron (los de la fila). Lo declarado va a
 * `datosVivienda` sin pisar nada (`responderFila` → `trasCompletarHogar` → `planEscrituraVivienda`), queda quién contestó y se
 * avisa a Alberto por Telegram (con lo que aún le falte al bot, si algo).
 */
export async function responderSolicitudIdentidad(correduriaId: string, identidadId: string, solicitudId: string, respuestas: Record<string, unknown>): Promise<ResultadoResponderIdentidad> {
  if (!UUID.test(identidadId) || !UUID.test(solicitudId)) return { ok: false, estado: 'no_encontrada' }
  if (!(await migracionSolicitudRenovacion())) return { ok: false, estado: 'sin_migracion' }
  const f = await filaRenovacion(correduriaId, solicitudId)
  if (!f) return { ok: false, estado: 'no_encontrada' }
  const quien = await quienEs(correduriaId, f, identidadId)
  if (!quien) return { ok: false, estado: 'no_encontrada' }
  if (f.estado === 'completada') return { ok: false, estado: 'completada' }
  if (f.estado !== 'pendiente' || f.caduca.getTime() <= Date.now()) return { ok: false, estado: 'muerta' }
  const nombre = quien.papel === 'autorizado' ? nombreDePila(quien.nombre) : null
  const { oportunidadId } = f
  return responderFila(f, f.campos, respuestas, false, {
    papel: quien.papel, identidadId, nombre, texto: textoQuienContesto(quien),
    // Tras escribir el riesgo: ¿le queda algo al bot? Si no, los bots se lanzan SOLOS (gratis; Avant2 no). Nunca lanza.
    alTerminar: async () => { await lanzarYAvisarBots(correduriaId, f.clienteId, oportunidadId, solicitudId) },
  })
}

// ─── Bots automáticos tras la respuesta (07/11/2026) ─────────────────────────

/**
 * Relee lo que le falta al bot y, si ya no le falta nada, encola los bots de hogar (`lanzarBotsRenovacion`, mismo camino y
 * guardas que «Probar»). Telegram a Alberto con lo que pasó + botón de reintento. NUNCA lanza ni toca la respuesta del cliente
 * (ya guardada): un fallo se registra y el aviso dice «bots no lanzados: motivo» (queda «Probar» como respaldo). Sin PII.
 */
export async function lanzarYAvisarBots(correduriaId: string, clienteId: string, oportunidadId: string, solicitudId?: string): Promise<{ estado: 'lanzados' | 'no_lanzados' | 'faltan_datos' | 'riesgo_no_leido' }> {
  try {
    const faltas = await faltasDeOportunidad(correduriaId, oportunidadId)
    if (faltas === null) {
      await tgSend('🔁 Renovación de hogar: no he podido releer el riesgo tras los datos del cliente. Bots no lanzados; míralo y usa «Probar».')
      return { estado: 'riesgo_no_leido' }
    }
    if (faltas.length > 0) {
      await tgSend(`🔁 Renovación de hogar: aún falta para los bots: ${faltas.map((x) => x.etiqueta).join(' · ')}. Bots no lanzados.`)
      return { estado: 'faltan_datos' }
    }
    const r = await lanzarBotsRenovacion(correduriaId, { clienteId, oportunidadId, faltas: 0 })
    const texto = textoBotsRenovacion({ decision: r.decision, resultados: r.resultados, fallo: r.fallo })
    const enMarcha = r.decision.accion === 'encolar' && !r.fallo && r.resultados.some((x) => x.tipo !== 'rechazado')
    if (solicitudId) await tgSendButtons(texto, botonesBotsRenovacion(solicitudId))
    else await tgSend(texto)
    return { estado: enMarcha ? 'lanzados' : 'no_lanzados' }
  } catch (x) {
    registrarErrorCartera('solicitud-renovacion/bots-aviso', x)
    return { estado: 'no_lanzados' }
  }
}

export type ResultadoReintentoBots =
  | { estado: 'lanzados' | 'no_lanzados' | 'faltan_datos' | 'riesgo_no_leido'; solicitudId: string }
  | { estado: 'sin_migracion' | 'invalido' | 'no_encontrado' | 'sin_contestar'; status: number; motivo: string }

/** El botón «🔁 Reintentar bots» (`cdr_bot:<id>`): solo una solicitud de renovación de esta correduría YA contestada. */
export async function reintentarBotsRenovacion(correduriaId: string, solicitudId: string): Promise<ResultadoReintentoBots> {
  if (!UUID.test(solicitudId)) return { estado: 'invalido', status: 422, motivo: 'solicitudId no válido' }
  if (!(await migracionSolicitudRenovacion())) return { estado: 'sin_migracion', status: 503, motivo: 'Falta aplicar la migración 2026-11-05d_solicitud_datos_renovacion.sql.' }
  const [s] = await db().$queryRaw<{ clienteId: string; oportunidadId: string | null; estado: string; motivo: string | null }[]>`
    select cliente_id::text as "clienteId", oportunidad_id::text as "oportunidadId", estado, motivo
    from solicitud_datos where id = ${solicitudId}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!s || s.motivo !== MOTIVO_SOLICITUD_RENOVACION || !s.oportunidadId) return { estado: 'no_encontrado', status: 404, motivo: 'No es una solicitud de datos de renovación de esta correduría.' }
  if (s.estado !== 'completada') return { estado: 'sin_contestar', status: 409, motivo: 'El cliente aún no ha contestado: no hay nada que tarificar.' }
  const r = await lanzarYAvisarBots(correduriaId, s.clienteId, s.oportunidadId, solicitudId)
  return { estado: r.estado, solicitudId }
}
