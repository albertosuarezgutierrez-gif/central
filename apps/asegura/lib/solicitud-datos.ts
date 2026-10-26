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
import { after } from 'next/server'
import {
  DIAS_SOLICITUD,
  MAX_DOCS_SOLICITUD,
  NADA_CONOCIDO,
  camposSolicitud,
  camposAlDia,
  camposAPreguntar,
  nombreRamoSolicitud,
  conIdentidad,
  contrastarConDocumentos,
  etiquetaDocSolicitud,
  normalizarLecturaSolicitud,
  ramoSolicitud,
  tipoArchivoDocSolicitud,
  validarRespuestas,
  valoresDePolizaLeida,
  limpiarBorrador,
  borradorParaTercero,
  ultimoPasoDe,
  type BorradorSolicitud,
  type CampoSolicitud,
  type DiscrepanciaSolicitud,
  type LecturaDocSolicitud,
  type RamoSolicitud,
  type Respuesta,
  type TipoDocSolicitud,
  type ViaValidada,
} from '@central/module-seguros'
import { PREFIJO_HISTORIAL_DATOS_PRESUPUESTO } from '@central/module-seguros-portal'
import { decryptField, encryptField } from '@central/module-seguros-pii'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { clienteOrigenDe, listarCarnets } from './cartera-ficha'
import { guardarDocumento } from './cartera-documentos'
import { revisarDocumento } from '@central/module-seguros'
import { leerDocSolicitud } from './documentos/leer-doc-solicitud'
import { contrasenasDeLaFicha } from './documentos/contrasenas-ficha'
import { oportunidadDesdeFichero, oportunidadDesdeLectura } from './oportunidad-documento'
import { leerPoliza } from './documentos/extraer-poliza'
import { trasCompletarHogar } from './solicitud-datos-hogar'
import { enlaceACiegas, politicaDocEnlace } from './enlace-ciego'
import { viasValidadas, zonaCpServidor } from './solicitud-datos-direccion'
import { esColumnaAusente } from './pg-error'
import { PLAZO_LECTURA_DOCUMENTO_MS, PLAZO_LECTURA_POLIZA_MS, conPlazo } from './solicitud-plazos.ts'
import { limpiarBorradoresMuertos } from './solicitud-borrador-purga.ts'

// `creada_por = 'web'` = enlace del formulario ANÓNIMO, «a ciegas» (regla y porqué en `enlace-ciego.ts`).
export { ACTOR_ENLACE_WEB } from './enlace-ciego'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN = /^[A-Za-z0-9_-]{40,60}$/
const CARNETS_MOTO = new Set(['A', 'A2', 'A1', 'AM'])

/** El enlace del portal para un token en claro. Solo se construye al crear la solicitud (el token no se guarda). */
export function urlPortalSolicitud(token: string): string {
  const base = (process.env.ASEGURA_PORTAL_URL ?? 'https://clientes.grupoasegura.es').replace(/\/+$/, '')
  return `${base}/datos/${token}`
}

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
  /** De quién son los datos: el cliente de la oportunidad o una figura del riesgo (un familiar). */
  personaId: string
  tercero: boolean
}

/**
 * Crea (o devuelve la viva) la solicitud de datos de una oportunidad ABIERTA de moto/coche.
 * `personaId` (29/09/2026): los datos de OTRA persona del riesgo (un familiar que es figura); sin él,
 * los del cliente. Una viva por persona y oportunidad.
 */
export async function crearSolicitud(
  correduriaId: string,
  oportunidadId: string,
  actor: string,
  personaId: string | null = null,
  /** `fichaCiega`: se pide todo como si la ficha no supiera nada (lead web de una ficha que ya existía). */
  opciones: { fichaCiega?: boolean } = {},
): Promise<{ ok: true; id: string; token: string | null; nueva: boolean; ramo: RamoSolicitud; caduca: string; tercero: boolean } | Fallo> {
  if (!UUID.test(oportunidadId)) return { ok: false, estado: 'invalido', motivo: 'id de oportunidad no válido', status: 422 }
  const db = prismaAsegura()
  const [o] = await db.$queryRaw<{ clienteId: string; ramo: string; estado: string }[]>(Prisma.sql`
    select cliente_id::text as "clienteId", tipo::text as ramo, estado::text as estado
    from oportunidades where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`)
  if (!o) return { ok: false, estado: 'no_encontrado', motivo: 'Esa oportunidad no es de esta correduría.', status: 404 }
  if (o.estado === 'ganada' || o.estado === 'perdida') return { ok: false, estado: 'conflicto', motivo: `La oportunidad está ${o.estado}.`, status: 409 }
  const ramo = ramoSolicitud(o.ramo)
  if (!ramo) return { ok: false, estado: 'invalido', motivo: 'Ese ramo no admite enlace de datos.', status: 422 }

  if (personaId !== null && !UUID.test(personaId)) return { ok: false, estado: 'invalido', motivo: 'id de persona no válido', status: 422 }
  const persona = personaId ?? o.clienteId
  const tercero = persona !== o.clienteId
  if (tercero) {
    // Solo de quien FIGURA en este riesgo: el enlace no sirve para pedir datos de cualquiera.
    const [fig] = await db.$queryRaw<{ n: number }[]>(Prisma.sql`
      select count(*)::int as n from oportunidad_figura
      where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid and cliente_id = ${persona}::uuid`)
    if (!fig || fig.n === 0) return { ok: false, estado: 'invalido', motivo: 'Esa persona no figura en este riesgo.', status: 422 }
  }
  const campos = opciones.fichaCiega ? camposSolicitud(ramo, NADA_CONOCIDO) : await camposParaPersona(correduriaId, persona, ramo)
  if (!campos) return { ok: false, estado: 'no_encontrado', motivo: 'No se encuentra la ficha de esa persona.', status: 404 }
  const r = await prismaAsegura().$transaction((tx) =>
    insertarSolicitud(tx, { correduriaId, oportunidadId, personaId: persona, ramo, campos, actor, tercero, estadoOportunidad: o.estado }))
  // RGPD: la pendiente caducada que `insertarSolicitud` acaba de anular no guarda su borrador. FUERA de la transacción:
  // sin la columna, un error dentro la abortaría entera.
  if (r.nueva) await limpiarBorradoresMuertos(prismaAsegura(), { oportunidadId, clienteId: persona, correduriaId })
  // El token solo existe en claro al crearla: una viva no lo puede devolver (solo guardamos su hash).
  return { ok: true, id: r.id, token: r.token, nueva: r.nueva, ramo, caduca: r.caduca.toISOString(), tercero }
}

/** Qué se le pide a esa persona según lo que ya hay en su ficha. `null` = no se encuentra la ficha. */
export async function camposParaPersona(correduriaId: string, personaId: string, ramo: RamoSolicitud): Promise<CampoSolicitud[] | null> {
  const origen = await clienteOrigenDe(correduriaId, personaId)
  if (!origen) return null
  const carnets = (await listarCarnets(correduriaId, personaId, origen.cliente.fechaNacimiento)) ?? []
  const conFecha = carnets.filter((c) => c.fechaExpedicion !== null)
  return camposSolicitud(ramo, {
    dni: origen.cliente.dni !== null,
    fechaNacimiento: origen.cliente.fechaNacimiento !== null,
    codigoPostal: origen.cliente.codigoPostal !== null,
    carnetMoto: conFecha.some((c) => CARNETS_MOTO.has(c.tipo.toUpperCase())),
    carnetCoche: conFecha.some((c) => c.tipo.toUpperCase() === 'B') || origen.cliente.fechaCarnet !== null,
  })
}

/**
 * La escritura de la solicitud, DENTRO de la transacción que le pasen (la propia de `crearSolicitud`, o la
 * del alta de la oportunidad del lead web: así o quedan las dos o ninguna). Una viva por persona y
 * oportunidad: si ya la hay, la devuelve sin token. `token` en claro solo si es nueva.
 */
export async function insertarSolicitud(
  tx: Prisma.TransactionClient,
  p: { correduriaId: string; oportunidadId: string; personaId: string; ramo: RamoSolicitud; campos: CampoSolicitud[]; actor: string; tercero: boolean; estadoOportunidad: string },
): Promise<{ id: string; caduca: Date; nueva: boolean; token: string | null }> {
  const { correduriaId, oportunidadId, personaId: persona, ramo, campos, actor, tercero } = p
  await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`solicitud:${oportunidadId}:${persona}`}))`)
  const [viva] = await tx.$queryRaw<{ id: string; caduca: Date }[]>(Prisma.sql`
    select id::text as id, caduca_at as caduca from solicitud_datos
    where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid and cliente_id = ${persona}::uuid
      and estado = 'pendiente' and caduca_at > now()`)
  if (viva) return { id: viva.id, caduca: viva.caduca, nueva: false, token: null }
  // Una pendiente ya caducada deja sitio (índice «una viva por oportunidad»).
  await tx.$executeRaw(Prisma.sql`
    update solicitud_datos set estado = 'anulada'
    where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid and cliente_id = ${persona}::uuid
      and estado = 'pendiente'`)
  const token = randomBytes(32).toString('base64url')
  const [n] = await tx.$queryRaw<{ id: string; caduca: Date }[]>(Prisma.sql`
    insert into solicitud_datos (correduria_id, oportunidad_id, cliente_id, ramo, token_hash, campos, caduca_at, creada_por, tercero)
    values (${correduriaId}::uuid, ${oportunidadId}::uuid, ${persona}::uuid, ${ramo}, ${hashToken(token)},
            ${JSON.stringify(campos)}::jsonb, now() + make_interval(days => ${DIAS_SOLICITUD}::int), ${actor}, ${tercero})
    returning id::text as id, caduca_at as caduca`)
  await tx.$executeRaw(Prisma.sql`
    insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
    values (${correduriaId}::uuid, ${oportunidadId}::uuid, 'datos_pedidos', cast(${p.estadoOportunidad} as estado_comercial),
            cast(${p.estadoOportunidad} as estado_comercial), ${JSON.stringify({ solicitudId: n.id, campos: campos.length, tercero })}::jsonb, ${actor})`)
  return { id: n.id, caduca: n.caduca, nueva: true, token }
}

/**
 * Los campos que se enseñan Y se aceptan de una solicitud guardada (26/10/2026): los guardados al crearla, puestos al
 * día (`camposAlDia`: hogar toma las preguntas vigentes; todos, nivel y «No lo sé») y con DNI y nacimiento si faltan.
 * Lo mismo al pintar, al leer un documento y al validar.
 */
function camposDeFila(f: { ramo: string; campos: CampoSolicitud[] }): CampoSolicitud[] {
  const ramo = ramoSolicitud(f.ramo)
  return conIdentidad(ramo ? camposAlDia(ramo, f.campos) : f.campos)
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
      personaId: string; tercero: boolean
    }[]>(Prisma.sql`
      select id::text as id, ramo, estado, caduca_at as caduca, completada_at as completada, campos, respuestas, lecturas,
             cliente_id::text as "personaId", tercero
      from (
        select *, row_number() over (partition by cliente_id order by created_at desc) as n
        from solicitud_datos where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid
      ) s
      -- Las últimas de CADA persona: un familiar con varios enlaces no puede esconder la del cliente.
      where s.n <= 5
      order by created_at desc`)
    return filas.map((f) => {
      const d = descifrarRespuestas(f.respuestas)
      const lecturas = descifrarLecturas(f.lecturas)
      return {
        id: f.id,
        ramo: ramoSolicitud(f.ramo) ?? 'moto',
        estado: estadoEfectivo(f.estado, f.caduca),
        caduca: f.caduca.toISOString(),
        completada: f.completada ? f.completada.toISOString() : null,
        // Al día (hogar: preguntas vigentes), pero de una completada solo lo que se contestó de verdad: validar guarda
        // TODAS las claves pedidas (null incluido), así que una clave ausente es una pregunta que entonces no existía.
        campos: d.respuestas
          ? camposDeFila(f).filter((c) => c.tipo === 'direccion' || Object.hasOwn(d.respuestas!, c.clave))
          : camposDeFila(f),
        ...d,
        // `null` = no se ha podido leer qué subió (≠ «no subió nada»).
        documentos: lecturas === null ? null : lecturas.flatMap((l) => (l.tipo === 'ficha' ? [] : [{ id: l.documentoId, tipo: l.tipo }])),
        discrepancias: lecturas === null || d.ilegible ? null : d.respuestas ? contrastarConDocumentos(d.respuestas, lecturas) : [],
        personaId: f.personaId,
        tercero: f.tercero,
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
  // RGPD: un enlace anulado no guarda lo que se tecleó a medias (aparte: sin la columna, no falla).
  if (n > 0) await limpiarBorradoresMuertos(prismaAsegura(), { id, correduriaId })
  return n > 0 ? { ok: true } : { ok: false, estado: 'conflicto', motivo: 'No está pendiente.', status: 409 }
}

// ─── Lado del portal (por token, sin identidad) ──────────────────────────────

export type SolicitudPublica =
  /** `tercero`: los datos son de otra persona; la página pide el consentimiento y no rellena nada. */
  /** `borrador` (26/10/2026): lo que dejó a medias con este mismo enlace; `null` = nada guardado (o sin la columna). */
  | { estado: 'ok'; ramo: RamoSolicitud; campos: CampoSolicitud[]; tercero: boolean; borrador: BorradorSolicitud | null }
  | { estado: 'muerta' }
  | { estado: 'completada' }

type FilaToken = { id: string; correduriaId: string; oportunidadId: string; clienteId: string; ramo: string; estado: string; caduca: Date; campos: CampoSolicitud[]; tercero: boolean; creadaPor: string }

async function porToken(token: string): Promise<FilaToken | null> {
  if (!TOKEN.test(token)) return null
  const [f] = await prismaAsegura().$queryRaw<FilaToken[]>(Prisma.sql`
    select id::text as id, correduria_id::text as "correduriaId", oportunidad_id::text as "oportunidadId",
           cliente_id::text as "clienteId", ramo, estado, caduca_at as caduca, campos, tercero, creada_por as "creadaPor"
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
  // Datos de un TERCERO: no se rellena nada. El enlace puede ir al cliente, y el DNI de su padre no
  // es suyo para verlo (a diferencia del propio, que Alberto decidió traer relleno).
  // El borrador es lo que ESTE enlace tecleó (no sale de la ficha): vale también a ciegas y, sin datos personales, para un tercero.
  const borrador = await leerBorrador(f)
  // De un tercero, sin sus datos personales (DNI, nacimiento, carné…): la regla de tercero no rellena nada, y el
  // enlace puede abrirlo otro. Lo del riesgo sí vuelve.
  if (f.tercero) return { estado: 'ok', ramo, campos: camposDeFila(f), tercero: true, borrador: borradorParaTercero(borrador) }
  // Enlace del formulario web ANÓNIMO: nada de la ficha, ni su DNI (ver `ACTOR_ENLACE_WEB`).
  if (enlaceACiegas(f.creadaPor)) return { estado: 'ok', ramo, campos: camposDeFila(f), tercero: false, borrador }
  const id = await identidadFicha(f)
  const campos = camposDeFila(f).map((c) => {
    const actual = c.clave === 'dni' ? id.dni : c.clave === 'fechaNacimiento' ? id.fechaNacimiento : null
    return actual ? { ...c, actual } : c
  })
  return { estado: 'ok', ramo, campos, tercero: false, borrador }
}

export type ResultadoDocSolicitud =
  /** `dePoliza`: leído con el lector de pólizas (botón del seguro actual): el formulario lo marca «leído de tu póliza». */
  | { ok: true; tipo: TipoDocSolicitud; etiqueta: string; valores: Record<string, Respuesta>; aviso: string | null; dePoliza?: true }
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
  consentimiento = false,
  /**
   * `poliza` (26/10/2026, fase B): el botón «sube tu póliza actual» del bloque del seguro actual. Se lee con el LECTOR
   * DE PÓLIZAS (`leerPoliza`: compañía, vencimiento, capitales…) en vez del de papeles sueltos, y lo leído se propone
   * en el formulario como «leído de tu póliza». Mismo archivo, mismo tope y mismas reglas del enlace a ciegas.
   */
  clase: 'documento' | 'poliza' = 'documento',
): Promise<ResultadoDocSolicitud> {
  const f = await porToken(token)
  if (!f) return { ok: false, estado: 'muerta' }
  if (f.estado === 'completada') return { ok: false, estado: 'completada' }
  if (estadoEfectivo(f.estado, f.caduca) !== 'pendiente') return { ok: false, estado: 'muerta' }
  // Documento de un TERCERO (su DNI, su carné): ni se archiva ni lo lee la IA sin su permiso. Se
  // comprueba ANTES de guardar nada, no solo al enviar el formulario.
  if (f.tercero && !consentimiento) {
    return { ok: false, estado: 'invalido', motivo: 'Marca primero la casilla de que eres esa persona o tienes su permiso.' }
  }
  if (f.tercero) {
    await prismaAsegura().$executeRaw(Prisma.sql`
      update solicitud_datos set consentimiento_at = coalesce(consentimiento_at, now()) where id = ${f.id}::uuid`)
  }
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

  // Enlace a ciegas (formulario web): ni contraseñas de la ficha, ni oportunidades; se archiva para revisión.
  const politica = politicaDocEnlace(f.creadaPor)
  // Primero se lee (para saber qué es y archivarlo con su tipo); si la IA falla, se archiva como «otro».
  const opcionesLector = politica.probarContrasenasFicha ? { contrasenas: () => contrasenasDeLaFicha(f.correduriaId, f.clienteId) } : {}
  // Póliza actual: el lector de pólizas (texto por la pasarela `iaTexto`, con su tope). Lo leído pasa por la misma
  // validación del formulario (`valoresDePolizaLeida`) y nunca trae DNI ni nacimiento (sale el tomador).
  // Con PLAZO (`solicitud-plazos.ts`): asegura corta antes que el puente del portal; pasado el plazo se archiva igual y se
  // dice «no lo hemos podido leer» (el cliente nunca ve «fallo» con el fichero ya en su ficha).
  const polizaLeida = clase === 'poliza'
    ? await conPlazo(leerPoliza(fichero.contenido, fichero.mime, fichero.nombre, opcionesLector), PLAZO_LECTURA_POLIZA_MS, () => ({ fase: 'ninguno' as const, motivo: 'La lectura de la póliza ha superado el plazo.' }))
    : null
  const lectura: { ok: true; bruto: unknown } | { ok: false; motivo: string } = polizaLeida
    ? (polizaLeida.fase === 'ninguno' ? { ok: false, motivo: polizaLeida.motivo } : { ok: true, bruto: polizaLeida.bruto ?? null })
    : await conPlazo(leerDocSolicitud(fichero.contenido, fichero.mime, fichero.nombre, opcionesLector), PLAZO_LECTURA_DOCUMENTO_MS, () => ({ ok: false as const, motivo: 'La lectura del documento ha superado el plazo.' }))
  const leido: { tipo: TipoDocSolicitud; valores: Record<string, Respuesta> } = polizaLeida
    ? { tipo: 'poliza', valores: valoresDePolizaLeida(polizaLeida, camposDeFila(f)) }
    : lectura.ok ? normalizarLecturaSolicitud(lectura.bruto, ramo, camposDeFila(f)) : { tipo: 'otro', valores: {} }
  const g = await guardarDocumento(f.correduriaId, {
    clienteId: f.clienteId,
    tipo: tipoArchivoDocSolicitud(leido.tipo),
    nombre: fichero.nombre,
    mime: fichero.mime,
    contenido: fichero.contenido,
    notas: `${politica.notaRevision ? `${politica.notaRevision} · ` : ''}${etiquetaDocSolicitud(leido.tipo)} · subido por el cliente en el enlace de datos del presupuesto`,
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
  // Todo documento de seguro abre o completa su oportunidad (29/09/2026), tras contestar al cliente.
  // Si es su póliza actual, completa la del presupuesto (misma ficha y ramo: se deduplica). Un DNI,
  // un carné o los papeles del coche ya están clasificados y no traen datos de seguro: no se relee.
  if (politica.abrirOportunidad && (leido.tipo === 'poliza' || leido.tipo === 'otro')) {
    const { correduriaId, clienteId } = f
    const fich = { contenido: fichero.contenido, mime: fichero.mime, nombre: fichero.nombre }
    const base = { correduriaId, clienteSube: clienteId, origen: 'solicitud', actor: 'el cliente, desde el enlace de datos' }
    try {
      // Póliza ya leída por el lector de pólizas: se reutiliza la lectura (no se paga dos veces la IA).
      if (polizaLeida) {
        if (polizaLeida.fase !== 'ninguno') after(() => oportunidadDesdeLectura({ ...base, lectura: polizaLeida }).then(() => undefined))
      } else {
        after(() => oportunidadDesdeFichero({ ...base, fichero: fich }).then(() => undefined))
      }
    } catch (e) {
      // Fuera de una petición `after()` lanza: la oportunidad no puede tumbar la subida.
      console.error('[solicitud-datos] no se pudo programar la oportunidad:', e instanceof Error ? e.message : e)
    }
  }
  if (!lectura.ok) console.warn('[solicitud-datos] documento sin leer:', lectura.motivo)
  // El motivo del lector NO se enseña: puede hablar de «la ficha del cliente» o del DNI (es para el corredor).
  const aviso = !lectura.ok
    ? 'Guardado. No lo hemos podido leer; rellena los datos a mano.'
    : Object.keys(leido.valores).length === 0
      ? 'Guardado. No hemos sacado de aquí ningún dato de los que faltan.'
      : null
  return { ok: true, tipo: leido.tipo, etiqueta: etiquetaDocSolicitud(leido.tipo), valores: leido.valores, aviso, ...(polizaLeida ? { dePoliza: true } : {}) }
}

/**
 * «A preguntar» para el historial (y por él, el aviso de actividad), en TODOS los ramos (26/10/2026): etiquetas de lo
 * que marcó «No lo sé» y de lo que dejó vacío. Nunca valores. Recortado para no inundar el aviso.
 */
export function textoAPreguntar(campos: readonly CampoSolicitud[], respuestas: Record<string, Respuesta>): string {
  const a = camposAPreguntar(campos, respuestas)
  const partes = [
    a.noLoSabe.length > 0 ? `No lo sabe: ${a.noLoSabe.join(' · ')}` : '',
    a.sinContestar.length > 0 ? `Sin contestar: ${a.sinContestar.join(' · ')}` : '',
  ].filter(Boolean)
  return partes.length === 0 ? '' : ` A preguntar en la llamada — ${partes.join('. ')}`.slice(0, 700)
}

/** El cliente manda sus datos. Una sola vez; lo que no se pidió se ignora. */
export async function responderSolicitud(
  token: string,
  entrada: Record<string, unknown>,
  consentimiento = false,
): Promise<{ ok: true } | { ok: false; estado: 'muerta' | 'completada' } | { ok: false; estado: 'errores'; errores: Record<string, string> }> {
  const f = await porToken(token)
  if (!f) return { ok: false, estado: 'muerta' }
  if (f.estado === 'completada') return { ok: false, estado: 'completada' }
  if (estadoEfectivo(f.estado, f.caduca) !== 'pendiente') return { ok: false, estado: 'muerta' }
  const campos = camposDeFila(f)
  // Dirección: provincia/municipio contra la tabla del CP y la calle «oficial» solo si el callejero la confirma.
  const vias = campos.some((c) => c.tipo === 'direccion') ? await viasValidadas(campos, entrada) : new Map<string, ViaValidada>()
  const v = validarRespuestas(campos, entrada, new Date(), { zonaCp: zonaCpServidor, viaValidada: (clave) => vias.get(clave) ?? null })
  if (!v.ok) return { ok: false, estado: 'errores', errores: v.errores }
  // Datos de otra persona: sin su permiso (o ser ella) no se guardan (RGPD, art. 6 y 14).
  if (f.tercero && consentimiento !== true) {
    return { ok: false, estado: 'errores', errores: { consentimiento: 'Marca que eres esa persona o que tienes su permiso para dar sus datos.' } }
  }

  const cifradas = encryptField(JSON.stringify(v.respuestas))
  // Lo que decía su ficha al contestar: si corrige DNI o nacimiento, Alberto lo ve como discrepancia.
  const id = await identidadFicha(f)
  const ficha: Record<string, Respuesta> = {}
  if (id.dni) ficha.dni = id.dni
  if (id.fechaNacimiento) ficha.fechaNacimiento = id.fechaNacimiento
  const ramoLeido = ramoSolicitud(f.ramo)
  const ramoTexto = ramoLeido ? nombreRamoSolicitud(ramoLeido) : f.ramo
  const hecho = await prismaAsegura().$transaction(async (tx) => {
    const [o] = await tx.$queryRaw<{ estado: string; clienteId: string }[]>(Prisma.sql`
      select estado::text as estado, cliente_id::text as "clienteId" from oportunidades where id = ${f.oportunidadId}::uuid for update`)
    // Oportunidad ya ganada o perdida (o descartada): el enlace muere aquí. Si no, llegaría
    // una tarea «Tarificar» y un aviso sobre algo que Alberto ya cerró.
    if (o && (o.estado === 'ganada' || o.estado === 'perdida')) {
      await tx.$executeRaw(Prisma.sql`
        update solicitud_datos set estado = 'anulada' where id = ${f.id}::uuid and estado = 'pendiente'`)
      return false
    }
    const n = await tx.$executeRaw(Prisma.sql`
      update solicitud_datos set estado = 'completada', respuestas = ${cifradas}, completada_at = now(),
        consentimiento_at = case when tercero then now() else null end
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
                cast(${nuevo} as estado_comercial), ${JSON.stringify({ solicitudId: f.id, tercero: f.tercero })}::jsonb,
                ${f.tercero ? 'un tercero, por el enlace (con consentimiento)' : 'el cliente, por el enlace'})`)
      await tx.$executeRaw(Prisma.sql`
        insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, oportunidad_id, origen_trigger)
        values (${f.correduriaId}::uuid, 'tarea', 'alta', 'pendiente',
                ${f.tercero ? `Tarificar ${ramoTexto}: ya están los datos de la otra persona del riesgo` : `Tarificar ${ramoTexto}: el cliente ha completado sus datos`},
                ((now() at time zone 'Europe/Madrid')::date + time '23:59:59') at time zone 'Europe/Madrid',
                ${o.clienteId}::uuid, ${f.oportunidadId}::uuid, 'central:seguimiento')`)
    }
    // Sin los datos: el historial no se puede borrar (supresión RGPD). La recoge el aviso de actividad.
    await tx.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${f.correduriaId}::uuid, ${f.clienteId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`${PREFIJO_HISTORIAL_DATOS_PRESUPUESTO} ${ramoTexto}. Ya se puede tarificar.${textoAPreguntar(campos, v.respuestas)}`})`)
    return true
  })
  // Completada (el borrador sobra: no se guarda dos veces) o anulada por oportunidad cerrada: el borrador se borra.
  await limpiarBorradoresMuertos(prismaAsegura(), { id: f.id, correduriaId: f.correduriaId })
  if (hecho && ramoLeido === 'hogar') {
    // Catastro → riesgo de la oportunidad → Telegram con el resumen, tras contestar al cliente. Nunca tumba la respuesta.
    const respuestas = v.respuestas
    const { correduriaId, oportunidadId, tercero } = f
    try {
      after(async () => {
        try {
          const [o] = await prismaAsegura().$queryRaw<{ clienteId: string }[]>(Prisma.sql`
            select cliente_id::text as "clienteId" from oportunidades where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`)
          await trasCompletarHogar({ correduriaId, oportunidadId, clienteId: o?.clienteId ?? f.clienteId, respuestas, campos, tercero })
        } catch (e) {
          console.error('[solicitud-datos] aviso de hogar tras completar falló:', e instanceof Error ? e.message : e)
        }
      })
    } catch (e) {
      console.error('[solicitud-datos] no se pudo programar el aviso de hogar:', e instanceof Error ? e.message : e)
    }
  }
  return hecho ? { ok: true } : { ok: false, estado: 'muerta' }
}

// ─── Borrador por token (26/10/2026, fase B) ─────────────────────────────────
// Guardado automático: el formulario manda lo que lleva (con pausa) y, al volver con el MISMO enlace, se lo devuelve.
// CIFRADO como las respuestas. Nunca cuenta como completado: no toca `estado`, `respuestas` ni `completada_at`.
// CÓDIGO ANTES QUE SQL (`prisma/sql/2026-10-26_solicitud_datos_borrador.sql`): sin las columnas, `leerBorrador` da
// `null` y guardar contesta `sin_migracion` sin error para el cliente; el formulario funciona igual, sin borrador.

/** Lo guardado de esa solicitud. `null` = nada, ilegible o sin la columna (nunca lanza: el formulario se abre igual). */
async function leerBorrador(f: FilaToken): Promise<BorradorSolicitud | null> {
  try {
    const [fila] = await prismaAsegura().$queryRaw<{ borrador: string | null }[]>(Prisma.sql`
      select borrador from solicitud_datos where id = ${f.id}::uuid`)
    if (!fila?.borrador) return null
    // Se vuelve a limpiar contra los campos VIGENTES: una pregunta retirada no reaparece.
    return limpiarBorrador(camposDeFila(f), JSON.parse(decryptField(fila.borrador)))
  } catch (e) {
    if (!esColumnaAusente(e)) console.warn('[solicitud-datos] borrador ilegible:', e instanceof Error ? e.message : e)
    return null
  }
}

export type ResultadoBorrador =
  | { ok: true; ultimoPaso: string | null }
  | { ok: false; estado: 'muerta' | 'completada' | 'invalido' | 'sin_consentimiento' | 'sin_migracion' }

/**
 * Guarda el borrador (lo sustituye entero) y el último paso alcanzado (`ultimoPasoDe`: solo etiquetas de la casa).
 * Solo en una solicitud PENDIENTE y viva; la condición va en el propio UPDATE (una completada no se reabre).
 * De un TERCERO, solo con su consentimiento marcado (como los documentos).
 */
export async function guardarBorradorSolicitud(token: string, entrada: unknown, consentimiento = false): Promise<ResultadoBorrador> {
  const f = await porToken(token)
  if (!f) return { ok: false, estado: 'muerta' }
  if (f.estado === 'completada') return { ok: false, estado: 'completada' }
  if (estadoEfectivo(f.estado, f.caduca) !== 'pendiente') return { ok: false, estado: 'muerta' }
  if (f.tercero && !consentimiento) return { ok: false, estado: 'sin_consentimiento' }
  const campos = camposDeFila(f)
  const borrador = limpiarBorrador(campos, entrada)
  if (!borrador) return { ok: false, estado: 'invalido' }
  const ultimoPaso = ultimoPasoDe(campos, borrador)
  try {
    const n = await prismaAsegura().$executeRaw(Prisma.sql`
      update solicitud_datos set borrador = ${encryptField(JSON.stringify(borrador))}, borrador_at = now(),
        ultimo_paso = ${ultimoPaso}
      where id = ${f.id}::uuid and estado = 'pendiente' and caduca_at > now()`)
    return n > 0 ? { ok: true, ultimoPaso } : { ok: false, estado: 'muerta' }
  } catch (e) {
    if (esColumnaAusente(e)) return { ok: false, estado: 'sin_migracion' }
    throw e
  }
}

