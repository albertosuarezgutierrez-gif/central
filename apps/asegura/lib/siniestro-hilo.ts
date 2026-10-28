// Hilo de conversación por siniestro (corredor ↔ IA ↔ compañía), plazos legales y cierre con resultado.
// Reglas puras en `@central/module-seguros` (`siniestro-plazos.ts`); aquí la BD.
//
// - `correduriaId` SIEMPRE explícito; el siniestro y el documento se comprueban contra la correduría.
// - `siniestro_mensajes` es SOLO-AÑADIR (SQL 2026-10-28d: trigger + GRANT sin UPDATE/DELETE). La ÚNICA escritura es
//   `anadirMensajeSiniestro()`; ningún UPDATE/DELETE sobre esa tabla en `apps/asegura`
//   (cepo `test/regression-siniestro-hilo.test.ts`).
// - El texto se CIFRA con `encryptField` (el mismo mecanismo que `lugar_direccion` y los terceros). Un mensaje que no
//   se puede descifrar sale con `texto: null` + `textoIlegible: true`; nunca tumba el hilo entero.
// - `historial_interno` lleva QUÉ se hizo (tipo, autor, quién), NUNCA el texto ni el motivo.
// - No toca `siniestros.comentario` ni el flujo de `cartera-siniestros.ts`.

import { decryptField, encryptField } from '@central/module-seguros-pii'
import {
  diaMadrid,
  diasEsperandoCompania,
  hiloVigente,
  mapaSustituidoPor,
  plazosSiniestro,
  validarCierreSiniestro,
  validarMensajeSiniestro,
  type MensajeParaPlazos,
  type PlazoSiniestro,
  type ResultadoCierreSiniestro,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { registrarErrorCartera } from './error-cartera'
import { esColumnaAusente, esTablaAusente } from './pg-error'

const SQL_HILO = 'prisma/sql/2026-10-28d_siniestro_hilo.sql'
/** Tope del `meta` serializado: es para metadatos (modelo, ids, citas), no para texto libre. */
const META_MAX_BYTES = 20_000

// ─── Tipos del contrato (plataforma los consume tal cual) ────────────────────

export type MensajeSiniestro = {
  id: string
  siniestroId: string
  autor: 'compania' | 'ia' | 'corredor' | 'interna'
  tipo: 'comentario' | 'rehuse' | 'analisis' | 'borrador' | 'enviado' | 'nota'
  /** En claro. `null` = no se pudo descifrar (ver `textoIlegible`), nunca «vacío». */
  texto: string | null
  textoIlegible: boolean
  documentoId: string | null
  creadoPor: string
  /** ISO. */
  creadoAt: string
  meta: Record<string, unknown> | null
  /** Id del mensaje que SUSTITUYE a este (edición = versión nueva; este se conserva para auditoría). `null` = es vigente. */
  sustituidoPor: string | null
}

export type DocumentoBreve = { id: string; tipo: string; nombre: string | null }

export type SiniestroResumenHilo = {
  id: string
  clienteId: string
  polizaId: string
  estado: string
  origen: 'cima' | 'gestionado_correduria'
  tipo: string | null
  referencia: string | null
  /** ISO de `fecha_hora` (ocurrencia). */
  fechaOcurrencia: string | null
  /** `YYYY-MM-DD`: la compañía recibió la declaración. */
  fechaDeclaracion: string | null
  gravedad: string | null
  resultado: ResultadoCierreSiniestro | null
  resultadoMotivo: string | null
  resultadoAt: string | null
  /** No null = alta manual fusionada en ese siniestro de CIMA: el hilo vivo está allí. */
  fusionadoEnSiniestroId: string | null
}

export type HiloSiniestro = {
  siniestro: SiniestroResumenHilo
  poliza: {
    id: string
    numero: string | null
    compania: string
    ramo: string
    /** `null` = no se pudo leer; `[]` = leído y no hay. */
    documentos: DocumentoBreve[] | null
  }
  /** `null` = no se pudo leer; `[]` = leído y no hay. */
  documentosSiniestro: DocumentoBreve[] | null
  /** `null` = no se pudo leer el hilo; `[]` = no hay mensajes. Orden: más antiguo primero. */
  mensajes: MensajeSiniestro[] | null
  plazos: PlazoSiniestro[]
  diasEsperandoCompania: number | null
}

export type FalloHilo =
  | { ok: false; estado: 'invalido'; motivo: string; status: 422 }
  | { ok: false; estado: 'no_encontrado'; motivo: string; status: 404 }
  | { ok: false; estado: 'ya_editado'; motivo: string; status: 409 }
  | { ok: false; estado: 'sin_migracion'; motivo: string; status: 503 }

const invalido = (motivo: string): FalloHilo => ({ ok: false, estado: 'invalido', motivo, status: 422 })
const noEncontrado = (motivo: string): FalloHilo => ({ ok: false, estado: 'no_encontrado', motivo, status: 404 })
const yaEditado = (): FalloHilo => ({ ok: false, estado: 'ya_editado', motivo: 'Este mensaje ya se editó: edita la última versión.', status: 409 })
const sinMigracion = (): FalloHilo => ({ ok: false, estado: 'sin_migracion', motivo: `falta aplicar ${SQL_HILO}`, status: 503 })
const esMigracionAusente = (e: unknown): boolean => esTablaAusente(e) || esColumnaAusente(e)

// ─── Lectura ─────────────────────────────────────────────────────────────────

const SELECT_RESUMEN = {
  id: true, clienteId: true, polizaId: true, estado: true, origen: true, tipo: true, referencia: true,
  fechaHora: true, fechaDeclaracion: true, gravedad: true,
  fusionadoEnSiniestroId: true,
  poliza: { select: { id: true, numeroPoliza: true, aseguradora: true, tipo: true } },
} as const

const SELECT_MENSAJE = {
  id: true, siniestroId: true, autor: true, tipo: true, texto: true, documentoId: true, creadoPor: true, creadoAt: true, meta: true,
} as const

type FilaMensaje = {
  id: string; siniestroId: string; autor: string; tipo: string; texto: string; documentoId: string | null
  creadoPor: string; creadoAt: Date; meta: unknown
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isoDia = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)
const RESULTADOS = new Set(['ganado', 'perdido', 'parcial'])

type CierreRaw = { resultado: string | null; resultadoMotivo: string | null; resultadoAt: Date | null }

/** Lee el cierre por SQL crudo (columnas del SQL 2026-10-28d). Lanza el error de columna ausente (42703): el llamante lo traduce a `sin_migracion`. */
async function leerCierre(db: ReturnType<typeof prismaAsegura>, correduriaId: string, siniestroId: string): Promise<CierreRaw | null> {
  const filas = await db.$queryRaw<{ resultado: string | null; resultado_motivo: string | null; resultado_at: Date | null }[]>(Prisma.sql`
    select resultado, resultado_motivo, resultado_at from siniestros
    where id = ${siniestroId}::uuid and correduria_id = ${correduriaId}::uuid`)
  const f = filas[0]
  return f ? { resultado: f.resultado, resultadoMotivo: f.resultado_motivo, resultadoAt: f.resultado_at } : null
}

function mapMensaje(f: FilaMensaje): MensajeSiniestro {
  let texto: string | null
  try {
    texto = decryptField(f.texto)
  } catch {
    texto = null
  }
  return {
    id: f.id,
    siniestroId: f.siniestroId,
    autor: f.autor as MensajeSiniestro['autor'],
    tipo: f.tipo as MensajeSiniestro['tipo'],
    texto,
    textoIlegible: texto === null,
    documentoId: f.documentoId,
    creadoPor: f.creadoPor,
    creadoAt: f.creadoAt.toISOString(),
    meta: esObjeto(f.meta) ? f.meta : null,
    sustituidoPor: null,
  }
}

/** Plazos y espera leen la ÚLTIMA versión de cada mensaje, con la fecha del ORIGINAL (una errata no reinicia un plazo). */
function paraPlazosVigentes(mensajes: MensajeSiniestro[]): MensajeParaPlazos[] {
  return hiloVigente(mensajes).map((m) => ({
    autor: m.autor, tipo: m.tipo, creadoAt: m.creadoAtOriginal, dia: diaMadrid(new Date(m.creadoAtOriginal)), meta: m.meta,
  }))
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function documentosDe(correduriaId: string, where: { polizaId: string } | { siniestroId: string }, contexto: string): Promise<DocumentoBreve[] | null> {
  try {
    const filas = await prismaAsegura().documento.findMany({
      where: { correduriaId, ...where },
      select: { id: true, tipo: true, nombreFichero: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return filas.map((d) => ({ id: d.id, tipo: d.tipo, nombre: d.nombreFichero }))
  } catch (e) {
    registrarErrorCartera(contexto, e)
    return null
  }
}

/** El hilo de un siniestro de la correduría, con plazos. `hoy` inyectable (día de Madrid). */
export async function leerHiloSiniestro(
  correduriaId: string,
  siniestroId: string,
  hoy: string = diaMadrid(new Date()),
): Promise<{ ok: true; hilo: HiloSiniestro } | FalloHilo> {
  const db = prismaAsegura()
  let s
  try {
    s = await db.siniestro.findFirst({ where: { id: siniestroId, correduriaId }, select: SELECT_RESUMEN })
  } catch (e) {
    if (esMigracionAusente(e)) return sinMigracion()
    throw e
  }
  if (!s) return noEncontrado('El siniestro no existe en esta correduría.')
  // `resultado*` por SQL crudo: no están en el modelo Prisma hasta aplicar el SQL (código ANTES que el SQL).
  let cierre: CierreRaw | null
  try {
    cierre = await leerCierre(db, correduriaId, s.id)
  } catch (e) {
    if (esMigracionAusente(e)) return sinMigracion()
    throw e
  }

  let mensajes: MensajeSiniestro[] | null
  try {
    const filas = await db.siniestroMensaje.findMany({
      where: { correduriaId, siniestroId: s.id },
      select: SELECT_MENSAJE,
      orderBy: [{ creadoAt: 'asc' }, { id: 'asc' }],
    })
    const todos = filas.map(mapMensaje)
    const sustituidoPor = mapaSustituidoPor(todos)
    mensajes = todos.map((m) => ({ ...m, sustituidoPor: sustituidoPor.get(m.id) ?? null }))
  } catch (e) {
    if (esTablaAusente(e)) return sinMigracion()
    registrarErrorCartera('siniestro/hilo mensajes', e)
    mensajes = null
  }

  const [docsPoliza, docsSiniestro] = await Promise.all([
    documentosDe(correduriaId, { polizaId: s.polizaId }, 'siniestro/hilo documentos póliza'),
    documentosDe(correduriaId, { siniestroId: s.id }, 'siniestro/hilo documentos siniestro'),
  ])

  const resultado = cierre?.resultado != null && RESULTADOS.has(cierre.resultado) ? (cierre.resultado as ResultadoCierreSiniestro) : null
  const lista = mensajes === null ? null : paraPlazosVigentes(mensajes)
  const hilo: HiloSiniestro = {
    siniestro: {
      id: s.id,
      clienteId: s.clienteId,
      polizaId: s.polizaId,
      estado: s.estado,
      origen: s.origen,
      tipo: s.tipo,
      referencia: s.referencia,
      fechaOcurrencia: s.fechaHora ? s.fechaHora.toISOString() : null,
      fechaDeclaracion: isoDia(s.fechaDeclaracion),
      gravedad: s.gravedad,
      resultado,
      resultadoMotivo: cierre?.resultadoMotivo ?? null,
      resultadoAt: cierre?.resultadoAt ? cierre.resultadoAt.toISOString() : null,
      fusionadoEnSiniestroId: s.fusionadoEnSiniestroId,
    },
    poliza: {
      id: s.poliza.id,
      numero: s.poliza.numeroPoliza,
      compania: s.poliza.aseguradora,
      ramo: s.poliza.tipo,
      documentos: docsPoliza,
    },
    documentosSiniestro: docsSiniestro,
    mensajes,
    plazos: plazosSiniestro(
      {
        fechaOcurrencia: s.fechaHora ? diaMadrid(s.fechaHora) : null,
        fechaDeclaracion: isoDia(s.fechaDeclaracion),
        ramo: s.poliza.tipo,
      },
      hoy,
      lista,
    ),
    diasEsperandoCompania: diasEsperandoCompania(lista, hoy),
  }
  return { ok: true, hilo }
}

// ─── Escritura (ÚNICA) ───────────────────────────────────────────────────────

async function anotarHistorial(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('siniestro' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[siniestro-hilo] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}

export type EntradaAnadirMensaje = {
  siniestroId: string
  autor: unknown
  tipo: unknown
  texto: unknown
  documentoId?: string | null
  reclamacionSac?: unknown
  /** Quién lo escribe (`humano:alberto`, `agente:ia-siniestros`, `plataforma`…). Sin PII. */
  creadoPor: string
  /** Metadatos (modelo de IA, documento usado, citas verificadas). SIN texto libre con datos personales: va en claro. */
  meta?: Record<string, unknown> | null
  /** `operador` = llegó por el puerto (no admite autor `ia`); `servidor` = lo escribe el propio servidor (endpoint de IA). */
  canal: 'operador' | 'servidor'
  /** Id del mensaje que esta entrada SUSTITUYE (edición = versión nueva; el anterior no se toca). Mismo siniestro, mismo autor, no `ia`, no ya sustituido. */
  sustituyeA?: string | null
}

/**
 * Añade un mensaje al hilo. Valida (puro), comprueba siniestro y documento contra la correduría, CIFRA el texto,
 * inserta y deja fila en `historial_interno` sin el texto. Reutilizable por el endpoint de IA (`canal: 'servidor'`).
 */
export async function anadirMensajeSiniestro(
  correduriaId: string,
  e: EntradaAnadirMensaje,
): Promise<{ ok: true; mensaje: MensajeSiniestro } | FalloHilo> {
  const v = validarMensajeSiniestro({ autor: e.autor, tipo: e.tipo, texto: e.texto, reclamacionSac: e.reclamacionSac }, e.canal)
  if (!v.ok) return invalido(v.motivo)
  const creadoPor = e.creadoPor.trim().slice(0, 200)
  if (creadoPor === '') return invalido('falta quién escribe el mensaje')
  if (e.meta !== undefined && e.meta !== null && !esObjeto(e.meta)) return invalido('meta tiene que ser un objeto')
  const sustituyeA = typeof e.sustituyeA === 'string' && e.sustituyeA.trim() !== '' ? e.sustituyeA.trim() : null
  if (e.sustituyeA !== undefined && e.sustituyeA !== null && sustituyeA === null) return invalido('sustituyeA tiene que ser un id de mensaje')
  if (sustituyeA !== null && !RE_UUID.test(sustituyeA)) return invalido('sustituyeA no es un id de mensaje válido')
  const meta: Record<string, unknown> | null =
    v.mensaje.reclamacionSac || e.meta || sustituyeA
      ? {
          ...(e.meta ?? {}),
          ...(v.mensaje.reclamacionSac ? { reclamacionSac: true } : {}),
          ...(sustituyeA ? { sustituyeA } : {}),
        }
      : null
  if (meta && Buffer.byteLength(JSON.stringify(meta), 'utf8') > META_MAX_BYTES) return invalido('meta demasiado grande')

  const db = prismaAsegura()
  const s = await db.siniestro.findFirst({
    where: { id: e.siniestroId, correduriaId },
    select: { id: true, clienteId: true, polizaId: true, referencia: true, fusionadoEnSiniestroId: true },
  })
  if (!s) return noEncontrado('El siniestro no existe en esta correduría.')
  if (s.fusionadoEnSiniestroId) {
    return invalido(`Este alta se fusionó en otro siniestro (${s.fusionadoEnSiniestroId}): escribe en ese hilo.`)
  }

  const documentoId = typeof e.documentoId === 'string' && e.documentoId.trim() !== '' ? e.documentoId.trim() : null
  if (documentoId) {
    // De ESTA correduría y de ESTE asunto (el siniestro, su póliza o su cliente): una cita a un papel de otro
    // cliente sería peor que ninguna.
    const doc = await db.documento.findFirst({
      where: {
        id: documentoId,
        correduriaId,
        OR: [{ siniestroId: s.id }, { polizaId: s.polizaId }, { clienteId: s.clienteId }],
      },
      select: { id: true },
    })
    if (!doc) return noEncontrado('El documento no existe en esta correduría o no es de este siniestro, su póliza o su cliente.')
  }

  if (sustituyeA !== null) {
    // Edición: el original tiene que ser de ESTE siniestro y ESTA correduría, no de la IA, del mismo autor y sin sustituir.
    let original: { id: string; siniestroId: string; autor: string } | null
    let yaSustituido: { id: string } | null
    try {
      original = await db.siniestroMensaje.findFirst({ where: { id: sustituyeA, correduriaId }, select: { id: true, siniestroId: true, autor: true } })
      yaSustituido = original
        ? await db.siniestroMensaje.findFirst({
            where: { correduriaId, siniestroId: original.siniestroId, meta: { path: ['sustituyeA'], equals: sustituyeA } },
            select: { id: true },
          })
        : null
    } catch (err) {
      if (esTablaAusente(err)) return sinMigracion()
      throw err
    }
    if (!original) return noEncontrado('El mensaje a editar no existe en esta correduría.')
    if (original.siniestroId !== s.id) return invalido('El mensaje a editar es de otro siniestro.')
    if (original.autor === 'ia') return invalido('Los mensajes de la IA no se editan: se pide otro análisis o borrador.')
    if (original.autor !== v.mensaje.autor) return invalido('Al editar no se puede cambiar el autor del mensaje.')
    if (yaSustituido) return yaEditado()
  }

  let fila: FilaMensaje
  try {
    fila = await db.siniestroMensaje.create({
      data: {
        correduriaId,
        siniestroId: s.id,
        autor: v.mensaje.autor,
        tipo: v.mensaje.tipo,
        texto: encryptField(v.mensaje.texto),
        documentoId,
        creadoPor,
        meta: meta === null ? Prisma.DbNull : (meta as Prisma.InputJsonObject),
      },
      select: SELECT_MENSAJE,
    })
  } catch (err) {
    if (esTablaAusente(err)) return sinMigracion()
    throw err
  }
  anotarCambio({ entidad: 'siniestro_mensaje', id: fila.id, campo: 'tipo', despues: v.mensaje.tipo })
  await anotarHistorial(
    correduriaId,
    s.clienteId,
    `Siniestro${s.referencia ? ` ${s.referencia}` : ''}: mensaje ${sustituyeA ? 'editado' : 'añadido'} «${v.mensaje.tipo}» de ${v.mensaje.autor}` +
      `${v.mensaje.reclamacionSac ? ' (reclamación al SAC)' : ''}${documentoId ? ' con documento' : ''} por ${creadoPor}`,
  )
  // Se devuelve con el texto validado (ya en claro), sin volver a descifrar.
  return { ok: true, mensaje: { ...mapMensaje(fila), texto: v.mensaje.texto, textoIlegible: false } }
}

// ─── Cierre con resultado ────────────────────────────────────────────────────

/** Cierra (o re-cierra) el siniestro con un resultado y su motivo. No toca `estado` ni `comentario`. */
export async function cerrarSiniestroConResultado(
  correduriaId: string,
  e: { siniestroId: string; resultado: unknown; motivo: unknown; actor: string },
): Promise<{ ok: true } | FalloHilo> {
  const v = validarCierreSiniestro(e.resultado, e.motivo)
  if (!v.ok) return invalido(v.motivo)
  const db = prismaAsegura()
  let s
  try {
    s = await db.siniestro.findFirst({
      where: { id: e.siniestroId, correduriaId },
      select: { id: true, clienteId: true, referencia: true, fusionadoEnSiniestroId: true },
    })
  } catch (err) {
    if (esMigracionAusente(err)) return sinMigracion()
    throw err
  }
  if (!s) return noEncontrado('El siniestro no existe en esta correduría.')
  let previo: CierreRaw | null
  try {
    previo = await leerCierre(db, correduriaId, s.id)
  } catch (err) {
    if (esMigracionAusente(err)) return sinMigracion()
    throw err
  }
  if (s.fusionadoEnSiniestroId) return invalido(`Este alta se fusionó en otro siniestro (${s.fusionadoEnSiniestroId}): ciérralo allí.`)
  const ahora = new Date()
  // `updateMany` con la correduría en el WHERE: el aislamiento también en la escritura, no solo en la lectura previa.
  let actualizadas: number
  try {
    actualizadas = await db.$executeRaw(Prisma.sql`
      update siniestros set resultado = ${v.resultado}, resultado_motivo = ${v.motivo}, resultado_at = ${ahora}, updated_at = ${ahora}
      where id = ${s.id}::uuid and correduria_id = ${correduriaId}::uuid`)
  } catch (err) {
    if (esMigracionAusente(err)) return sinMigracion()
    throw err
  }
  if (actualizadas !== 1) return noEncontrado('El siniestro no existe en esta correduría.')
  anotarCambio({ entidad: 'siniestro', id: s.id, campo: 'resultado', antes: previo?.resultado ?? null, despues: v.resultado })
  await anotarHistorial(
    correduriaId,
    s.clienteId,
    `Siniestro${s.referencia ? ` ${s.referencia}` : ''}: ${previo?.resultado ? `resultado cambiado de ${previo.resultado} a` : 'cerrado con resultado'} ${v.resultado} por ${e.actor}`,
  )
  return { ok: true }
}

// ─── Esperando a la compañía (contador «Hoy») ────────────────────────────────

export type SiniestroEsperando = { siniestroId: string; clienteId: string; polizaNumero: string | null; dias: number }

/**
 * Siniestros cuyo último `enviado` del corredor no tiene respuesta posterior de la compañía. Fuera: los fusionados y
 * los ya cerrados con resultado. Orden: los que más llevan esperando primero.
 */
export async function siniestrosEsperandoCompania(
  correduriaId: string,
  hoy: string = diaMadrid(new Date()),
): Promise<{ ok: true; lista: SiniestroEsperando[] } | FalloHilo> {
  let filas: { siniestro_id: string; cliente_id: string; numero_poliza: string | null; ultimo: Date }[]
  try {
    // Solo la ÚLTIMA versión de cada mensaje (las editadas llevan `meta.sustituyeA`), con la fecha del ORIGINAL de la
    // cadena: igual que `hiloVigente` en el hilo (una edición no reinicia la espera).
    filas = await prismaAsegura().$queryRaw`
      with recursive cadena as (
        select id, siniestro_id, autor, tipo, creado_at as original_at
        from siniestro_mensajes
        where correduria_id = ${correduriaId}::uuid and (meta->>'sustituyeA') is null
        union all
        select m.id, m.siniestro_id, m.autor, m.tipo, c.original_at
        from siniestro_mensajes m
        join cadena c on m.meta->>'sustituyeA' = c.id::text
        where m.correduria_id = ${correduriaId}::uuid
      ),
      vigentes as (
        select c.* from cadena c
        where not exists (
          select 1 from siniestro_mensajes x
          where x.correduria_id = ${correduriaId}::uuid and x.meta->>'sustituyeA' = c.id::text
        )
      )
      select s.id as siniestro_id, s.cliente_id, p.numero_poliza, e.ultimo
      from (
        select v.siniestro_id, max(v.original_at) as ultimo
        from vigentes v
        where v.autor = 'corredor' and v.tipo = 'enviado'
        group by v.siniestro_id
      ) e
      join siniestros s on s.id = e.siniestro_id and s.correduria_id = ${correduriaId}::uuid
      join polizas p on p.id = s.poliza_id and p.correduria_id = ${correduriaId}::uuid
      where s.fusionado_en_siniestro_id is null
        and s.resultado is null
        and not exists (
          select 1 from vigentes c
          where c.siniestro_id = e.siniestro_id
            and c.autor = 'compania' and c.original_at > e.ultimo
        )`
  } catch (e) {
    if (esMigracionAusente(e)) return sinMigracion()
    throw e
  }
  const lista: SiniestroEsperando[] = []
  for (const f of filas) {
    const creadoAt = f.ultimo.toISOString()
    const dias = diasEsperandoCompania([{ autor: 'corredor', tipo: 'enviado', creadoAt, dia: diaMadrid(f.ultimo) }], hoy)
    if (dias === null) continue
    lista.push({ siniestroId: f.siniestro_id, clienteId: f.cliente_id, polizaNumero: f.numero_poliza, dias })
  }
  lista.sort((a, b) => b.dias - a.dias)
  return { ok: true, lista }
}
