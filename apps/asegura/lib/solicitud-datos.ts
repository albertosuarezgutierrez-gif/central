/**
 * «Pídele los datos al cliente» (24/09/2026): enlace directo, sin código, para
 * que el cliente complete lo que falta para presupuestar (moto o coche).
 * Reglas puras (qué se pide, cómo se valida) en `@central/module-seguros`.
 *
 * Decisiones que no se tocan sin Alberto:
 * - El token solo vive en claro en la respuesta de crear; en BD, su SHA-256.
 * - La página pública (portal) NO recibe ningún dato del cliente: solo los
 *   campos a pedir (etiquetas) y el ramo. Ni nombre.
 * - Las respuestas se guardan CIFRADAS y NO se escriben en la ficha: son
 *   «declaradas por quien tenía el enlace»; valen para presupuestar y se
 *   verifican al emitir.
 * - Completar deja una nota con prefijo fijo en el historial (la recoge el
 *   aviso de actividad → Telegram) y una tarea «tarificar» para hoy.
 *
 * El SQL crudo NO prefija `seguros.`: la conexión ya trae `?schema=seguros`.
 */
import { createHash, randomBytes } from 'node:crypto'
import {
  DIAS_SOLICITUD,
  MAX_DOCS_SOLICITUD,
  camposSolicitud,
  conIdentidad,
  contrastarConDocumentos,
  etiquetaDocSolicitud,
  normalizarLecturaSolicitud,
  ramoSolicitud,
  tipoArchivoDocSolicitud,
  validarRespuestas,
  type CampoSolicitud,
  type DiscrepanciaSolicitud,
  type LecturaDocSolicitud,
  type RamoSolicitud,
  type Respuesta,
  type TipoDocSolicitud,
} from '@central/module-seguros'
import { PREFIJO_HISTORIAL_DATOS_PRESUPUESTO } from '@central/module-seguros-portal'
import { decryptField, encryptField } from '@central/module-seguros-pii'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { clienteOrigenDe, listarCarnets } from './cartera-ficha'
import { guardarDocumento } from './cartera-documentos'
import { revisarDocumento } from '@central/module-seguros'
import { leerDocSolicitud } from './documentos/leer-doc-solicitud'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN = /^[A-Za-z0-9_-]{40,60}$/
const CARNETS_MOTO = new Set(['A', 'A2', 'A1', 'AM'])

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

type Fallo = { ok: false; estado: 'invalido' | 'no_encontrado' | 'conflicto'; motivo: string; status: 404 | 409 | 422 }

export type SolicitudResumen = {
  id: string
  ramo: RamoSolicitud
  estado: 'pendiente' | 'completada' | 'anulada' | 'caducada'
  caduca: string
  completada: string | null
  campos: CampoSolicitud[]
  /** Descifradas. `null` = sin completar (o no se han podido descifrar: `ilegible`). */
  respuestas: Record<string, Respuesta> | null
  ilegible: boolean
  /** Documentos que subió por el enlace (están en su ficha → Documentos). */
  documentos: { id: string; tipo: TipoDocSolicitud }[] | null
  /** Lo declarado que no casa con sus papeles. `null` = no se ha podido contrastar. */
  discrepancias: DiscrepanciaSolicitud[] | null
}

/** Crea (o devuelve la viva) la solicitud de datos de una oportunidad ABIERTA de moto/coche. */
export async function crearSolicitud(
  correduriaId: string,
  oportunidadId: string,
  actor: string,
): Promise<{ ok: true; id: string; token: string | null; nueva: boolean; ramo: RamoSolicitud; caduca: string } | Fallo> {
  if (!UUID.test(oportunidadId)) return { ok: false, estado: 'invalido', motivo: 'id de oportunidad no válido', status: 422 }
  const db = prismaAsegura()
  const [o] = await db.$queryRaw<{ clienteId: string; ramo: string; estado: string }[]>(Prisma.sql`
    select cliente_id::text as "clienteId", tipo::text as ramo, estado::text as estado
    from oportunidades where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`)
  if (!o) return { ok: false, estado: 'no_encontrado', motivo: 'Esa oportunidad no es de esta correduría.', status: 404 }
  if (o.estado === 'ganada' || o.estado === 'perdida') return { ok: false, estado: 'conflicto', motivo: `La oportunidad está ${o.estado}.`, status: 409 }
  const ramo = ramoSolicitud(o.ramo)
  if (!ramo) return { ok: false, estado: 'invalido', motivo: 'Por ahora el enlace de datos es solo para moto y coche.', status: 422 }

  const origen = await clienteOrigenDe(correduriaId, o.clienteId)
  if (!origen) return { ok: false, estado: 'no_encontrado', motivo: 'No se encuentra la ficha del cliente.', status: 404 }
  const carnets = (await listarCarnets(correduriaId, o.clienteId, origen.cliente.fechaNacimiento)) ?? []
  const conFecha = carnets.filter((c) => c.fechaExpedicion !== null)
  const campos = camposSolicitud(ramo, {
    dni: origen.cliente.dni !== null,
    fechaNacimiento: origen.cliente.fechaNacimiento !== null,
    codigoPostal: origen.cliente.codigoPostal !== null,
    carnetMoto: conFecha.some((c) => CARNETS_MOTO.has(c.tipo.toUpperCase())),
    carnetCoche: conFecha.some((c) => c.tipo.toUpperCase() === 'B') || origen.cliente.fechaCarnet !== null,
  })

  const token = randomBytes(32).toString('base64url')
  const r = await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`solicitud:${oportunidadId}`}))`)
    const [viva] = await tx.$queryRaw<{ id: string; caduca: Date }[]>(Prisma.sql`
      select id::text as id, caduca_at as caduca from solicitud_datos
      where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid
        and estado = 'pendiente' and caduca_at > now()`)
    if (viva) return { id: viva.id, caduca: viva.caduca, nueva: false }
    // Una pendiente ya caducada deja sitio (índice «una viva por oportunidad»).
    await tx.$executeRaw(Prisma.sql`
      update solicitud_datos set estado = 'anulada'
      where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`)
    const [n] = await tx.$queryRaw<{ id: string; caduca: Date }[]>(Prisma.sql`
      insert into solicitud_datos (correduria_id, oportunidad_id, cliente_id, ramo, token_hash, campos, caduca_at, creada_por)
      values (${correduriaId}::uuid, ${oportunidadId}::uuid, ${o.clienteId}::uuid, ${ramo}, ${hashToken(token)},
              ${JSON.stringify(campos)}::jsonb, now() + make_interval(days => ${DIAS_SOLICITUD}::int), ${actor})
      returning id::text as id, caduca_at as caduca`)
    await tx.$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${oportunidadId}::uuid, 'datos_pedidos', cast(${o.estado} as estado_comercial),
              cast(${o.estado} as estado_comercial), ${JSON.stringify({ solicitudId: n.id, campos: campos.length })}::jsonb, ${actor})`)
    return { id: n.id, caduca: n.caduca, nueva: true }
  })
  // El token solo existe en claro al crearla: una viva no lo puede devolver (solo guardamos su hash).
  return { ok: true, id: r.id, token: r.nueva ? token : null, nueva: r.nueva, ramo, caduca: r.caduca.toISOString() }
}

function estadoEfectivo(estado: string, caduca: Date): SolicitudResumen['estado'] {
  if (estado === 'pendiente' && caduca.getTime() <= Date.now()) return 'caducada'
  return estado === 'completada' || estado === 'anulada' ? estado : 'pendiente'
}

function descifrarLecturas(v: string | null): LecturaDocSolicitud[] | null {
  if (v === null) return []
  try {
    const o = JSON.parse(decryptField(v)) as unknown
    if (Array.isArray(o)) return o as LecturaDocSolicitud[]
  } catch {
    /* clave PII ausente o distinta */
  }
  return null
}

function descifrarRespuestas(v: string | null): { respuestas: Record<string, Respuesta> | null; ilegible: boolean } {
  if (v === null) return { respuestas: null, ilegible: false }
  try {
    const o = JSON.parse(decryptField(v)) as unknown
    if (o && typeof o === 'object' && !Array.isArray(o)) return { respuestas: o as Record<string, Respuesta>, ilegible: false }
  } catch {
    /* clave PII ausente o distinta */
  }
  return { respuestas: null, ilegible: true }
}

/** Las solicitudes de una oportunidad (más reciente primero), para plataforma. */
export async function solicitudesDeOportunidad(correduriaId: string, oportunidadId: string): Promise<SolicitudResumen[] | null> {
  if (!UUID.test(oportunidadId)) return []
  try {
    const filas = await prismaAsegura().$queryRaw<{
      id: string; ramo: string; estado: string; caduca: Date; completada: Date | null; campos: CampoSolicitud[]; respuestas: string | null; lecturas: string | null
    }[]>(Prisma.sql`
      select id::text as id, ramo, estado, caduca_at as caduca, completada_at as completada, campos, respuestas, lecturas
      from solicitud_datos where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid
      order by created_at desc limit 10`)
    return filas.map((f) => {
      const d = descifrarRespuestas(f.respuestas)
      const lecturas = descifrarLecturas(f.lecturas)
      return {
        id: f.id,
        ramo: ramoSolicitud(f.ramo) ?? 'moto',
        estado: estadoEfectivo(f.estado, f.caduca),
        caduca: f.caduca.toISOString(),
        completada: f.completada ? f.completada.toISOString() : null,
        campos: f.campos,
        ...d,
        // `null` = no se ha podido leer qué subió (≠ «no subió nada»).
        documentos: lecturas === null ? null : lecturas.flatMap((l) => (l.tipo === 'ficha' ? [] : [{ id: l.documentoId, tipo: l.tipo }])),
        discrepancias: lecturas === null || d.ilegible ? null : d.respuestas ? contrastarConDocumentos(d.respuestas, lecturas) : [],
      }
    })
  } catch (e) {
    console.error('[solicitud-datos] no se pudieron leer:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Anula una pendiente (el enlace deja de funcionar). */
export async function anularSolicitud(correduriaId: string, id: string): Promise<{ ok: true } | Fallo> {
  if (!UUID.test(id)) return { ok: false, estado: 'invalido', motivo: 'id no válido', status: 422 }
  const n = await prismaAsegura().$executeRaw(Prisma.sql`
    update solicitud_datos set estado = 'anulada'
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`)
  return n > 0 ? { ok: true } : { ok: false, estado: 'conflicto', motivo: 'No está pendiente.', status: 409 }
}

// ─── Lado del portal (por token, sin identidad) ──────────────────────────────

export type SolicitudPublica =
  | { estado: 'ok'; ramo: RamoSolicitud; campos: CampoSolicitud[] }
  | { estado: 'muerta' }
  | { estado: 'completada' }

type FilaToken = { id: string; correduriaId: string; oportunidadId: string; clienteId: string; ramo: string; estado: string; caduca: Date; campos: CampoSolicitud[] }

async function porToken(token: string): Promise<FilaToken | null> {
  if (!TOKEN.test(token)) return null
  const [f] = await prismaAsegura().$queryRaw<FilaToken[]>(Prisma.sql`
    select id::text as id, correduria_id::text as "correduriaId", oportunidad_id::text as "oportunidadId",
           cliente_id::text as "clienteId", ramo, estado, caduca_at as caduca, campos
    from solicitud_datos where token_hash = ${hashToken(token)}`)
  return f ?? null
}

/** DNI y nacimiento de su ficha, para traerlos rellenos. Si no se pueden leer, se piden en blanco. */
async function identidadFicha(f: FilaToken): Promise<{ dni: string | null; fechaNacimiento: string | null }> {
  try {
    const o = await clienteOrigenDe(f.correduriaId, f.clienteId)
    return { dni: o?.cliente.dni ?? null, fechaNacimiento: o?.cliente.fechaNacimiento ?? null }
  } catch {
    return { dni: null, fechaNacimiento: null }
  }
}

/**
 * Lo que ve la página pública: el ramo y los campos a pedir. Del cliente, SOLO su DNI y su fecha
 * de nacimiento, rellenos para que los confirme o corrija (decisión de Alberto, 24/09/2026: «es su
 * DNI, no hay problema»; se le avisó de que el enlace no lleva código). Ningún otro dato de la ficha.
 * No existe, anulada o caducada → «muerta», todas igual (no es un oráculo de tokens).
 */
export async function solicitudPorToken(token: string): Promise<SolicitudPublica> {
  const f = await porToken(token)
  if (!f) return { estado: 'muerta' }
  if (f.estado === 'completada') return { estado: 'completada' }
  if (estadoEfectivo(f.estado, f.caduca) !== 'pendiente') return { estado: 'muerta' }
  const ramo = ramoSolicitud(f.ramo)
  if (!ramo) return { estado: 'muerta' }
  const id = await identidadFicha(f)
  const campos = conIdentidad(f.campos).map((c) => {
    const actual = c.clave === 'dni' ? id.dni : c.clave === 'fechaNacimiento' ? id.fechaNacimiento : null
    return actual ? { ...c, actual } : c
  })
  return { estado: 'ok', ramo, campos }
}

export type ResultadoDocSolicitud =
  | { ok: true; tipo: TipoDocSolicitud; etiqueta: string; valores: Record<string, Respuesta>; aviso: string | null }
  | { ok: false; estado: 'muerta' | 'completada' | 'tope' | 'invalido' | 'error'; motivo?: string }

/**
 * El cliente sube un documento por el enlace (DNI, carné, papeles del vehículo, su póliza).
 * 1) Se ARCHIVA en su ficha (`seguros.documentos`, subido por el cliente) — aunque luego no
 *    se pueda leer: el papel vale para emitir.
 * 2) La IA lo lee y se proponen al cliente SOLO los campos pedidos que validan.
 * 3) Lo leído se guarda cifrado en la solicitud para contrastarlo con lo que declare.
 * Nada de lo leído se escribe en la ficha.
 */
export async function subirDocumentoSolicitud(
  token: string,
  fichero: { nombre: string; mime: string; contenido: Buffer },
): Promise<ResultadoDocSolicitud> {
  const f = await porToken(token)
  if (!f) return { ok: false, estado: 'muerta' }
  if (f.estado === 'completada') return { ok: false, estado: 'completada' }
  if (estadoEfectivo(f.estado, f.caduca) !== 'pendiente') return { ok: false, estado: 'muerta' }
  const ramo = ramoSolicitud(f.ramo)
  if (!ramo) return { ok: false, estado: 'muerta' }
  // Tipo de fichero ANTES de gastar IA o plaza.
  const reparo = revisarDocumento({ type: fichero.mime, size: fichero.contenido.length, name: fichero.nombre })
  if (reparo) return { ok: false, estado: 'invalido', motivo: reparo }
  // La plaza se RESERVA de forma atómica: con subidas en paralelo, leer-y-luego-sumar dejaría pasar
  // a todas. Si luego algo falla, la plaza queda gastada (preferible a guardar sin tope).
  const reservada = await prismaAsegura().$queryRaw<{ n: number }[]>(Prisma.sql`
    update solicitud_datos set documentos_subidos = documentos_subidos + 1
    where id = ${f.id}::uuid and documentos_subidos < ${MAX_DOCS_SOLICITUD} and estado = 'pendiente' and caduca_at > now()
    returning documentos_subidos as n`)
  if (reservada.length === 0) return { ok: false, estado: 'tope', motivo: `Como máximo ${MAX_DOCS_SOLICITUD} documentos por enlace.` }

  // Primero se lee (para saber qué es y archivarlo con su tipo); si la IA falla, se archiva como «otro».
  const lectura = await leerDocSolicitud(fichero.contenido, fichero.mime, fichero.nombre)
  const leido = lectura.ok ? normalizarLecturaSolicitud(lectura.bruto, ramo, conIdentidad(f.campos)) : { tipo: 'otro' as const, valores: {} }
  const g = await guardarDocumento(f.correduriaId, {
    clienteId: f.clienteId,
    tipo: tipoArchivoDocSolicitud(leido.tipo),
    nombre: fichero.nombre,
    mime: fichero.mime,
    contenido: fichero.contenido,
    notas: `${etiquetaDocSolicitud(leido.tipo)} · subido por el cliente en el enlace de datos del presupuesto`,
    subidoPor: 'cliente',
  })
  if (!g.ok) return { ok: false, estado: g.status === 415 ? 'invalido' : 'error', motivo: g.motivo }

  await prismaAsegura().$transaction(async (tx) => {
    const [fila] = await tx.$queryRaw<{ lecturas: string | null }[]>(Prisma.sql`
      select lecturas from solicitud_datos where id = ${f.id}::uuid for update`)
    const previas = descifrarLecturas(fila?.lecturas ?? null)
    // Ilegibles (clave PII cambiada): no se machacan. El fichero ya está archivado en la ficha.
    if (previas === null) return
    const nuevas: LecturaDocSolicitud[] = [...previas, { documentoId: g.documento.id, tipo: leido.tipo, valores: leido.valores }]
    await tx.$executeRaw(Prisma.sql`
      update solicitud_datos set lecturas = ${encryptField(JSON.stringify(nuevas))} where id = ${f.id}::uuid`)
  })
  if (!lectura.ok) console.warn('[solicitud-datos] documento sin leer:', lectura.motivo)
  const aviso = !lectura.ok
    ? 'Guardado. No lo hemos podido leer; rellena los datos a mano.'
    : Object.keys(leido.valores).length === 0
      ? 'Guardado. No hemos sacado de aquí ningún dato de los que faltan.'
      : null
  return { ok: true, tipo: leido.tipo, etiqueta: etiquetaDocSolicitud(leido.tipo), valores: leido.valores, aviso }
}

/** El cliente manda sus datos. Una sola vez; lo que no se pidió se ignora. */
export async function responderSolicitud(
  token: string,
  entrada: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; estado: 'muerta' | 'completada' } | { ok: false; estado: 'errores'; errores: Record<string, string> }> {
  const f = await porToken(token)
  if (!f) return { ok: false, estado: 'muerta' }
  if (f.estado === 'completada') return { ok: false, estado: 'completada' }
  if (estadoEfectivo(f.estado, f.caduca) !== 'pendiente') return { ok: false, estado: 'muerta' }
  const v = validarRespuestas(conIdentidad(f.campos), entrada)
  if (!v.ok) return { ok: false, estado: 'errores', errores: v.errores }

  const cifradas = encryptField(JSON.stringify(v.respuestas))
  // Lo que decía su ficha al contestar: si corrige DNI o nacimiento, Alberto lo ve como discrepancia.
  const id = await identidadFicha(f)
  const ficha: Record<string, Respuesta> = {}
  if (id.dni) ficha.dni = id.dni
  if (id.fechaNacimiento) ficha.fechaNacimiento = id.fechaNacimiento
  const ramoTexto = f.ramo === 'moto' ? 'moto' : 'coche'
  const hecho = await prismaAsegura().$transaction(async (tx) => {
    const [o] = await tx.$queryRaw<{ estado: string }[]>(Prisma.sql`
      select estado::text as estado from oportunidades where id = ${f.oportunidadId}::uuid for update`)
    // Oportunidad ya ganada o perdida (o descartada): el enlace muere aquí. Si no, llegaría
    // una tarea «Tarificar» y un aviso sobre algo que Alberto ya cerró.
    if (o && (o.estado === 'ganada' || o.estado === 'perdida')) {
      await tx.$executeRaw(Prisma.sql`
        update solicitud_datos set estado = 'anulada' where id = ${f.id}::uuid and estado = 'pendiente'`)
      return false
    }
    const n = await tx.$executeRaw(Prisma.sql`
      update solicitud_datos set estado = 'completada', respuestas = ${cifradas}, completada_at = now()
      where id = ${f.id}::uuid and estado = 'pendiente' and caduca_at > now()`)
    if (n === 0) return false
    if (Object.keys(ficha).length > 0) {
      const [fila] = await tx.$queryRaw<{ lecturas: string | null }[]>(Prisma.sql`
        select lecturas from solicitud_datos where id = ${f.id}::uuid`)
      const previas = descifrarLecturas(fila?.lecturas ?? null) ?? null
      if (previas !== null) {
      const conFicha: LecturaDocSolicitud[] = [...previas, { documentoId: '', tipo: 'ficha', valores: ficha }]
      await tx.$executeRaw(Prisma.sql`
        update solicitud_datos set lecturas = ${encryptField(JSON.stringify(conFicha))} where id = ${f.id}::uuid`)
      }
    }
    if (o) {
      const nuevo = o.estado === 'competencia' ? 'en_negociacion' : o.estado
      // Quien ha contestado ya no está aparcado, como con la acción «interesado».
      await tx.$executeRaw(Prisma.sql`
        update oportunidades set estado = cast(${nuevo} as estado_comercial), aparcada_hasta = null,
          aparcada_motivo = null, updated_at = now() where id = ${f.oportunidadId}::uuid`)
      await tx.$executeRaw(Prisma.sql`
        insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
        values (${f.correduriaId}::uuid, ${f.oportunidadId}::uuid, 'datos_recibidos', cast(${o.estado} as estado_comercial),
                cast(${nuevo} as estado_comercial), ${JSON.stringify({ solicitudId: f.id })}::jsonb, 'el cliente, por el enlace')`)
      await tx.$executeRaw(Prisma.sql`
        insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, oportunidad_id, origen_trigger)
        values (${f.correduriaId}::uuid, 'tarea', 'alta', 'pendiente', ${`Tarificar ${ramoTexto}: el cliente ha completado sus datos`},
                ((now() at time zone 'Europe/Madrid')::date + time '23:59:59') at time zone 'Europe/Madrid',
                ${f.clienteId}::uuid, ${f.oportunidadId}::uuid, 'central:seguimiento')`)
    }
    // Sin los datos: el historial no se puede borrar (supresión RGPD). La recoge el aviso de actividad.
    await tx.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${f.correduriaId}::uuid, ${f.clienteId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`${PREFIJO_HISTORIAL_DATOS_PRESUPUESTO} ${ramoTexto}. Ya se puede tarificar.`})`)
    return true
  })
  return hecho ? { ok: true } : { ok: false, estado: 'muerta' }
}
