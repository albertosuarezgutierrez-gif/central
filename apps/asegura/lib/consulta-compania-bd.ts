/**
 * Consultas a compañías (15/10/2026, fase 1): los PUERTOS reales del flujo (`consulta-compania-flujo.ts`).
 *
 * - Toda consulta va acotada a la correduría (con BYPASSRLS un id ajeno no falla: da los datos de otro).
 * - SQL crudo: `ramos` es `tipo_seguro[]` NULL (Prisma no admite listas NULL) y la tabla de consultas puede no existir
 *   todavía (código antes que el SQL → el flujo responde 503 `sin_migracion`).
 * - El DNI se descifra SOLO aquí y solo lo usa el envío; hacia plataforma sale enmascarado (lo hace el flujo).
 * - `oportunidad_historial` es append-only y no admite datos personales ni texto libre: allí va el `detalle` sin
 *   nombres; el texto con nombres de adjuntos va a `historial_interno` de la ficha.
 */
import { prisma } from '@/lib/tenant'
import { esquema } from '@/lib/esquema-bd'
import { iaTexto } from '@/lib/ia'
import { leerDocumento } from '@/lib/cartera-documentos'
import { decryptField } from '@central/module-seguros-pii'
import { leerBloqueDeRamo } from '@central/module-seguros'
import type {
  AdjuntoConsulta,
  CompaniaBD,
  ConsultaBD,
  ContactoBD,
  CorreoSaliente,
  HistorialConsulta,
  OportunidadBD,
  PuertosConsulta,
  TomadorBD,
} from '@/lib/consulta-compania-flujo'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Remitente de las consultas: el alias de la cuenta de Gmail de Alberto (decisión 2 del spec). */
export const REMITENTE_CONSULTAS_DEFECTO = 'hola@grupoasegura.es'
export function remitenteConsultas(env: Record<string, string | undefined> = process.env): string {
  const v = env.CONSULTAS_MAIL_FROM?.trim()
  return v ? v : REMITENTE_CONSULTAS_DEFECTO
}

export const hayTablasConsulta = async () =>
  (await esquema.existeTabla('consulta_compania')) && (await esquema.existeTabla('consulta_compania_oportunidad'))
export const hayRamosContactos = () => esquema.existeColumna('compania_contactos', 'ramos')

const iso = (d: Date | null | undefined): string | null => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null)
const dia = (d: Date | null | undefined): string | null => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null)

function leerAdjuntos(v: unknown): AdjuntoConsulta[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .filter((x) => typeof x.documentoId === 'string')
    .map((x) => ({ documentoId: String(x.documentoId), nombre: typeof x.nombre === 'string' ? x.nombre : 'documento', competencia: x.competencia === true }))
}

// ─── Lecturas ───────────────────────────────────────────────────────────────────

async function leerOportunidad(correduriaId: string, id: string): Promise<OportunidadBD | null> {
  if (!UUID.test(id)) return null
  const [op] = await prisma.$queryRaw<
    Array<{ id: string; cliente_id: string; tipo: string | null; fecha_fin_vigencia: Date | null; info_riesgo: unknown; poliza_competencia: unknown }>
  >`
    select o.id::text as id, o.cliente_id::text as cliente_id, o.tipo::text as tipo, o.fecha_fin_vigencia,
           o.info_riesgo, o.poliza_competencia
    from seguros.oportunidades o
    where o.id = ${id}::uuid and o.correduria_id = ${correduriaId}::uuid`
  if (!op) return null
  const ramo = op.tipo ?? 'otros'
  let faltanRamo: string[] | null = null
  let datosRamo: Record<string, unknown> | null = null
  try {
    const b = leerBloqueDeRamo(ramo, op.info_riesgo, null)
    faltanRamo = b.faltan
    datosRamo = b.datos
  } catch {
    // «No se pudo calcular» (null), nunca «no falta nada».
  }
  return {
    id: op.id,
    clienteId: op.cliente_id,
    ramo,
    fechaFinVigencia: dia(op.fecha_fin_vigencia),
    infoRiesgo: op.info_riesgo,
    polizaCompetencia: op.poliza_competencia,
    faltanRamo,
    datosRamo,
  }
}

async function companias(): Promise<CompaniaBD[]> {
  const filas = await prisma.$queryRaw<Array<{ codigo_dgs: string; nombre_comun: string }>>`
    select codigo_dgs, nombre_comun from seguros.companias_dgs where activa order by nombre_comun`
  return filas.map((f) => ({ codigoDgs: f.codigo_dgs, nombre: f.nombre_comun }))
}

type FilaContacto = {
  id: string; compania_codigo_dgs: string; nombre: string; cargo: string | null; area: string | null
  email: string | null; activo: boolean; orden: number; ramos: string[] | null
}

function aContacto(f: FilaContacto): ContactoBD {
  return {
    id: f.id, companiaCodigoDgs: f.compania_codigo_dgs, nombre: f.nombre, cargo: f.cargo, area: f.area,
    email: f.email, activo: f.activo, orden: f.orden, ramos: f.ramos,
  }
}

/** Tabla de REFERENCIA compartida (sin `correduria_id`), como `GET /api/operador/companias`. */
export async function contactos(): Promise<ContactoBD[]> {
  const conRamos = await hayRamosContactos()
  const filas = conRamos
    ? await prisma.$queryRaw<FilaContacto[]>`
        select id::text as id, compania_codigo_dgs, nombre, cargo, area::text as area, email, activo, orden,
               ramos::text[] as ramos
        from seguros.compania_contactos order by compania_codigo_dgs, orden`
    : await prisma.$queryRaw<FilaContacto[]>`
        select id::text as id, compania_codigo_dgs, nombre, cargo, area::text as area, email, activo, orden,
               null::text[] as ramos
        from seguros.compania_contactos order by compania_codigo_dgs, orden`
  return filas.map(aContacto)
}

export async function contactoPorId(id: string): Promise<ContactoBD | null> {
  if (!UUID.test(id)) return null
  return (await contactos()).find((c) => c.id === id) ?? null
}

async function documentos(correduriaId: string, op: OportunidadBD): Promise<AdjuntoConsulta[] | null> {
  try {
    const filas = await prisma.$queryRaw<Array<{ id: string; nombre: string | null; competencia: boolean }>>`
      select d.id::text as id, d.nombre_fichero as nombre,
             exists (select 1 from seguros.oportunidad_oferta oo
                      where oo.correduria_id = d.correduria_id and oo.oportunidad_id = ${op.id}::uuid
                        and oo.documento_id = d.id and oo.rol = 'actual') as competencia
      from seguros.documentos d
      where d.correduria_id = ${correduriaId}::uuid
        and d.contenido is not null
        and (d.cliente_id = ${op.clienteId}::uuid
             or d.poliza_id = (select o.poliza_id from seguros.oportunidades o
                                where o.id = ${op.id}::uuid and o.correduria_id = ${correduriaId}::uuid)
             or d.id in (select oo.documento_id from seguros.oportunidad_oferta oo
                          where oo.correduria_id = ${correduriaId}::uuid and oo.oportunidad_id = ${op.id}::uuid
                            and oo.documento_id is not null))
      order by d.created_at desc
      limit 200`
    return filas.map((f) => ({ documentoId: f.id, nombre: f.nombre ?? 'documento', competencia: f.competencia }))
  } catch (err) {
    console.error('[consulta-compania] documentos sin leer:', err instanceof Error ? err.message : err)
    return null
  }
}

async function tomador(correduriaId: string, clienteId: string): Promise<TomadorBD | null> {
  const [c] = await prisma.$queryRaw<Array<{ nombre: string | null; apellidos: string | null; dni: string | null }>>`
    select nombre, apellidos, dni from seguros.clientes
    where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!c) return null
  const nombre = [c.nombre, c.apellidos].map((x) => (x ?? '').trim()).filter(Boolean).join(' ') || null
  if (!c.dni) return { nombre, documento: null, documentoLegible: true }
  try {
    const d = decryptField(c.dni)
    return { nombre, documento: d && d.trim() !== '' ? d.trim().toUpperCase() : null, documentoLegible: true }
  } catch {
    // Sin clave o no abre: «no se sabe», no «no tiene». El envío con identidad se para.
    return { nombre, documento: null, documentoLegible: false }
  }
}

type FilaConsulta = {
  id: string; cliente_id: string; oportunidades: string[] | null; compania_codigo_dgs: string; destinatarios: string[]
  asunto: string; cuerpo: string; estado: string; codigo_ref: string; gmail_message_id: string | null
  identidad_incluida: boolean; competencia_incluida: boolean; responder_antes: Date | null; adjuntos: unknown
  enviada_at: Date | null; respondida_at: Date | null
}

function aConsulta(f: FilaConsulta): ConsultaBD {
  return {
    id: f.id, clienteId: f.cliente_id, oportunidadIds: f.oportunidades ?? [], companiaCodigoDgs: f.compania_codigo_dgs,
    destinatarios: f.destinatarios ?? [], asunto: f.asunto, cuerpo: f.cuerpo, estado: f.estado, codigoRef: f.codigo_ref,
    gmailMessageId: f.gmail_message_id, identidadIncluida: f.identidad_incluida, competenciaIncluida: f.competencia_incluida,
    responderAntes: dia(f.responder_antes), adjuntos: leerAdjuntos(f.adjuntos), enviadaAt: iso(f.enviada_at), respondidaAt: iso(f.respondida_at),
  }
}

async function listarConsultas(correduriaId: string, oportunidadId: string): Promise<ConsultaBD[]> {
  if (!UUID.test(oportunidadId)) return []
  const filas = await prisma.$queryRaw<FilaConsulta[]>`
    select c.id::text as id, c.cliente_id::text as cliente_id,
           (select array_agg(x.oportunidad_id::text order by x.created_at) from seguros.consulta_compania_oportunidad x where x.consulta_id = c.id) as oportunidades,
           c.compania_codigo_dgs, c.destinatarios::text[] as destinatarios, c.asunto, c.cuerpo, c.estado::text as estado,
           c.codigo_ref, c.gmail_message_id, c.identidad_incluida, c.competencia_incluida, c.responder_antes, c.adjuntos,
           c.enviada_at, c.respondida_at
    from seguros.consulta_compania c
    where c.correduria_id = ${correduriaId}::uuid
      and exists (select 1 from seguros.consulta_compania_oportunidad x where x.consulta_id = c.id and x.oportunidad_id = ${oportunidadId}::uuid)
    order by (c.estado = 'borrador') desc, c.created_at desc
    limit 200`
  return filas.map(aConsulta)
}

async function leerConsulta(correduriaId: string, id: string): Promise<ConsultaBD | null> {
  if (!UUID.test(id)) return null
  const [f] = await prisma.$queryRaw<FilaConsulta[]>`
    select c.id::text as id, c.cliente_id::text as cliente_id,
           (select array_agg(x.oportunidad_id::text order by x.created_at) from seguros.consulta_compania_oportunidad x where x.consulta_id = c.id) as oportunidades,
           c.compania_codigo_dgs, c.destinatarios::text[] as destinatarios, c.asunto, c.cuerpo, c.estado::text as estado,
           c.codigo_ref, c.gmail_message_id, c.identidad_incluida, c.competencia_incluida, c.responder_antes, c.adjuntos,
           c.enviada_at, c.respondida_at
    from seguros.consulta_compania c
    where c.id = ${id}::uuid and c.correduria_id = ${correduriaId}::uuid`
  return f ? aConsulta(f) : null
}

// ─── Escrituras ─────────────────────────────────────────────────────────────────

type Tx = Pick<typeof prisma, '$executeRaw' | '$queryRaw'>

async function escribirHistorial(tx: Tx, correduriaId: string, h: HistorialConsulta, actor: string): Promise<void> {
  for (const op of h.oportunidadIds) {
    await tx.$executeRaw`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
      values (${correduriaId}::uuid, ${op}::uuid, ${h.accion}, ${JSON.stringify(h.detalle)}::jsonb, ${actor})`
  }
  await tx.$executeRaw`
    insert into seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
    values (${correduriaId}::uuid, ${h.clienteId}::uuid, cast('gestion' as seguros.tipo_historial_interno), ${h.textoInterno})`
}

function esCodigoRepetido(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err)
  return m.includes('consulta_compania_codigo_ref_uq')
}

async function insertarBorrador(
  correduriaId: string,
  c: Parameters<PuertosConsulta['insertarBorrador']>[1],
  h: HistorialConsulta,
): Promise<{ id: string } | 'codigo_repetido'> {
  try {
    return await prisma.$transaction(async (tx) => {
      const [fila] = await tx.$queryRaw<Array<{ id: string }>>`
        insert into seguros.consulta_compania
          (correduria_id, cliente_id, compania_codigo_dgs, destinatarios, asunto, cuerpo, codigo_ref,
           identidad_incluida, competencia_incluida, responder_antes, adjuntos, creado_por)
        values (${correduriaId}::uuid, ${c.clienteId}::uuid, ${c.companiaCodigoDgs}, ${c.destinatarios}::uuid[],
                ${c.asunto}, ${c.cuerpo}, ${c.codigoRef}, ${c.identidadIncluida}, ${c.competenciaIncluida},
                ${c.responderAntes}::date, ${JSON.stringify(c.adjuntos)}::jsonb, ${c.creadoPor})
        returning id::text as id`
      for (const op of c.oportunidadIds) {
        await tx.$executeRaw`
          insert into seguros.consulta_compania_oportunidad (consulta_id, oportunidad_id)
          values (${fila.id}::uuid, ${op}::uuid)`
      }
      await escribirHistorial(tx, correduriaId, { ...h, detalle: { ...h.detalle, consultaId: fila.id } }, c.creadoPor)
      return { id: fila.id }
    })
  } catch (err) {
    if (esCodigoRepetido(err)) return 'codigo_repetido'
    throw err
  }
}

async function actualizarBorrador(
  correduriaId: string,
  id: string,
  k: Partial<Pick<ConsultaBD, 'asunto' | 'cuerpo' | 'adjuntos' | 'responderAntes'>>,
): Promise<boolean> {
  const n = await prisma.$executeRaw`
    update seguros.consulta_compania set
      asunto = case when ${k.asunto !== undefined} then ${k.asunto ?? ''} else asunto end,
      cuerpo = case when ${k.cuerpo !== undefined} then ${k.cuerpo ?? ''} else cuerpo end,
      adjuntos = case when ${k.adjuntos !== undefined} then ${JSON.stringify(k.adjuntos ?? [])}::jsonb else adjuntos end,
      responder_antes = case when ${k.responderAntes !== undefined} then ${k.responderAntes ?? null}::date else responder_antes end,
      updated_at = now()
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid
      and estado = 'borrador' and gmail_message_id is null`
  return n === 1
}

async function reservarEnvio(correduriaId: string, id: string): Promise<boolean> {
  const n = await prisma.$executeRaw`
    update seguros.consulta_compania set gmail_message_id = ${'enviando:' + id}, updated_at = now()
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'borrador' and gmail_message_id is null`
  return n === 1
}

async function liberarReserva(correduriaId: string, id: string): Promise<void> {
  await prisma.$executeRaw`
    update seguros.consulta_compania set gmail_message_id = null, updated_at = now()
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'borrador'
      and gmail_message_id = ${'enviando:' + id}`
}

function crearMarcarEnviada(actor: string): PuertosConsulta['marcarEnviada'] {
  return async (correduriaId, id, e, h) => {
    await prisma.$transaction(async (tx) => {
      const n = await tx.$executeRaw`
        update seguros.consulta_compania set
          estado = 'enviada', enviada_at = ${e.enviadaAt}, gmail_message_id = ${e.messageId}, asunto = ${e.asunto},
          identidad_incluida = ${e.identidadIncluida}, updated_at = now()
        where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'borrador'
          and gmail_message_id = ${'enviando:' + id}`
      if (n !== 1) throw new Error('la reserva de envío ya no estaba')
      await escribirHistorial(tx, correduriaId, { ...h, detalle: { ...h.detalle, consultaId: id } }, actor)
    })
  }
}

// ─── Correo e IA ────────────────────────────────────────────────────────────────

export function canalGmailDisponible(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.GMAIL_USER?.trim() && !!env.GMAIL_APP_PASSWORD?.trim()
}

async function enviarCorreo(c: CorreoSaliente): Promise<{ messageId: string | null; rechazados: string[] }> {
  const { gmailTransporter } = await import('@central/core-email')
  const t = gmailTransporter()
  if (!t) throw new Error('sin credenciales de Gmail')
  const info = await t.sendMail({
    from: { name: 'Grupo ASegura', address: remitenteConsultas() },
    to: c.para,
    subject: c.asunto,
    text: c.texto,
    attachments: c.adjuntos.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: a.mime })),
  })
  const rechazados = (Array.isArray(info.rejected) ? info.rejected : []).map((x: string | { address: string }) => (typeof x === 'string' ? x : x.address))
  const aceptados = Array.isArray(info.accepted) ? info.accepted.length : 0
  // Nadie lo aceptó → no ha salido (el flujo libera la reserva: 502). Si ALGUIEN lo aceptó, el correo YA salió: se
  // registra como enviada con los rechazados anotados; lanzar aquí haría que se reenviara a quien ya lo tiene.
  if (aceptados === 0) throw new Error(rechazados.length > 0 ? `rechazados todos (${rechazados.length})` : 'el SMTP no aceptó a nadie')
  return { messageId: typeof info.messageId === 'string' && info.messageId !== '' ? info.messageId : null, rechazados }
}

async function redactar(prompt: string, system: string): Promise<string> {
  return iaTexto(prompt, { system, maxTokens: 900, timeoutMs: 45_000, privado: true, categoria: 'redaccion', cliente: 'consulta-compania' })
}

function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

export function puertosConsulta(actor: string): PuertosConsulta {
  return {
    hayTablas: hayTablasConsulta,
    leerOportunidad,
    companias,
    contactos,
    documentos,
    tomador,
    listarConsultas,
    leerConsulta,
    insertarBorrador,
    actualizarBorrador,
    reservarEnvio,
    liberarReserva,
    marcarEnviada: crearMarcarEnviada(actor),
    leerAdjunto: leerDocumento,
    redactar,
    canalDisponible: () => canalGmailDisponible(),
    enviarCorreo,
    hoy: hoyMadrid,
    ahora: () => new Date(),
  }
}

// ─── Contactos: ramos y alta inline ─────────────────────────────────────────────

export type ResultadoContacto = { ok: true; contacto: ContactoBD } | { ok: false; status: number; estado: string; motivo: string }

export async function ponerRamosContacto(id: string, ramos: string[] | null): Promise<ResultadoContacto> {
  if (!(await hayRamosContactos())) return { ok: false, status: 503, estado: 'sin_migracion', motivo: 'falta el SQL 2026-10-15_seguros_consulta_compania.sql' }
  if (!UUID.test(id)) return { ok: false, status: 404, estado: 'no_encontrado', motivo: 'contacto no encontrado' }
  const n = ramos === null
    ? await prisma.$executeRaw`update seguros.compania_contactos set ramos = null, updated_at = now() where id = ${id}::uuid`
    : await prisma.$executeRaw`update seguros.compania_contactos set ramos = ${ramos}::seguros.tipo_seguro[], updated_at = now() where id = ${id}::uuid`
  if (n === 0) return { ok: false, status: 404, estado: 'no_encontrado', motivo: 'contacto no encontrado' }
  const c = await contactoPorId(id)
  return c ? { ok: true, contacto: c } : { ok: false, status: 404, estado: 'no_encontrado', motivo: 'contacto no encontrado' }
}

export async function altaContacto(
  codigoDgs: string,
  d: { nombre: string; cargo: string | null; area: string | null; email: string; telefono: string | null; ramos: string[] | null | undefined },
): Promise<ResultadoContacto> {
  const [co] = await prisma.$queryRaw<Array<{ ok: boolean }>>`
    select true as ok from seguros.companias_dgs where codigo_dgs = ${codigoDgs} and activa`
  if (!co) return { ok: false, status: 404, estado: 'no_encontrado', motivo: 'compañía no encontrada' }
  const conRamos = d.ramos !== undefined && d.ramos !== null
  if (conRamos && !(await hayRamosContactos())) return { ok: false, status: 503, estado: 'sin_migracion', motivo: 'falta el SQL 2026-10-15_seguros_consulta_compania.sql (ramos)' }
  const [orden] = await prisma.$queryRaw<Array<{ n: number }>>`
    select coalesce(max(orden) + 1, 0)::int as n from seguros.compania_contactos where compania_codigo_dgs = ${codigoDgs}`
  const [fila] = conRamos
    ? await prisma.$queryRaw<Array<{ id: string }>>`
        insert into seguros.compania_contactos (compania_codigo_dgs, nombre, cargo, area, email, telefono, orden, activo, ramos)
        values (${codigoDgs}, ${d.nombre}, ${d.cargo}, ${d.area}::seguros.area_contacto, ${d.email}, ${d.telefono}, ${orden?.n ?? 0}, true,
                ${d.ramos as string[]}::seguros.tipo_seguro[])
        returning id::text as id`
    : await prisma.$queryRaw<Array<{ id: string }>>`
        insert into seguros.compania_contactos (compania_codigo_dgs, nombre, cargo, area, email, telefono, orden, activo)
        values (${codigoDgs}, ${d.nombre}, ${d.cargo}, ${d.area}::seguros.area_contacto, ${d.email}, ${d.telefono}, ${orden?.n ?? 0}, true)
        returning id::text as id`
  const c = await contactoPorId(fila.id)
  return c ? { ok: true, contacto: c } : { ok: false, status: 500, estado: 'error', motivo: 'alta hecha, pero no se ha podido releer' }
}

