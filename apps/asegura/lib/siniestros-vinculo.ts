// Parte del portal ↔ siniestro, y alta manual ↔ siniestro de CIMA: la BD.
// Reglas puras (emparejamiento fuerte/ambiguo/ninguno y fusión) en
// `@central/module-seguros` (`siniestro-vinculo.ts`). SQL: 2026-10-03d.
//
// 🚨 Vinculado ≠ comunicado. Un parte pasa a `abierto_en_compania` (lo que el
// portal le enseña al cliente como «tu compañía ya lo sabe») SOLO si el
// siniestro lo conoce la compañía: es de CIMA, o tiene el nº que ella dio
// (`id_siniestro_entidad`/`referencia`). Un alta manual sin nº vincula el parte
// en `recibido`; cuando se le anote el nº (seguimiento) o se funda con el de
// CIMA, `promoverPartesComunicados` lo pasa a `abierto_en_compania`.
//
// 🚨 Los partes NO llevan `correduria_id`: la pertenencia se comprueba por la
// póliza y por el siniestro, que sí la llevan (BYPASSRLS: sin ese filtro un id
// ajeno no da error, da datos de otra correduría).
//
// La ingesta de CIMA vive en OTRO repo (`asegura`, `persist-siniestro.ts`), así
// que el vínculo automático y la fusión no se cuelgan de su INSERT: los corre
// `reconciliarSiniestros` (cron `/api/cron/siniestros-vinculo`) sobre lo que ya
// está en la BD. Es idempotente: lo vinculado/fusionado no vuelve a entrar.

import {
  cambiosDeFusion,
  candidatosDeParte,
  conocidoPorCompania,
  emparejarManualConCima,
  emparejarParte,
  fusionesAutomaticas,
  vinculosAutomaticos,
  type CamposCorredor,
  type EmparejamientoSiniestro,
  type SiniestroCandidato,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'

type Db = ReturnType<typeof prismaAsegura>
type Tx = Prisma.TransactionClient

export type VinculoParte = 'alta_desde_parte' | 'manual' | 'auto_cima'
const ESTADOS_PARTE_VINCULABLE = ['enviado', 'recibido'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SELECT_CANDIDATO = {
  id: true,
  polizaId: true,
  fechaHora: true,
  origen: true,
  idSiniestroEntidad: true,
  referencia: true,
  estado: true,
  tipo: true,
} as const

type FilaCandidato = {
  id: string
  polizaId: string
  fechaHora: Date | null
  origen: unknown
  idSiniestroEntidad: string | null
  referencia: string | null
  estado: unknown
  tipo: string | null
}

function aCandidato(s: FilaCandidato): SiniestroCandidato {
  return {
    id: s.id,
    polizaId: s.polizaId,
    fechaHora: s.fechaHora,
    origen: String(s.origen) === 'cima' ? 'cima' : 'gestionado_correduria',
    idSiniestroEntidad: s.idSiniestroEntidad,
    referencia: s.referencia,
  }
}


async function anotarHistorial(db: Db | Tx, correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await db.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('siniestro' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[siniestros-vinculo] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}

/** Los siniestros VISIBLES (sin fusionar) de unas pólizas de la correduría. */
export async function siniestrosDePolizas(db: Db | Tx, correduriaId: string, polizaIds: string[]): Promise<FilaCandidato[]> {
  if (polizaIds.length === 0) return []
  return db.siniestro.findMany({
    where: { correduriaId, polizaId: { in: polizaIds }, fusionadoEnSiniestroId: null },
    select: SELECT_CANDIDATO,
  })
}

// ─── Sugerencias (lectura) ───────────────────────────────────────────────────

export type CandidatoSiniestro = {
  id: string
  referencia: string | null
  /** `YYYY-MM-DD`; `null` = no se sabe cuándo pasó. */
  fecha: string | null
  origen: 'cima' | 'gestionado_correduria'
  estado: string
  tipo: string | null
}

export type SugerenciaParte = { tipo: EmparejamientoSiniestro['tipo']; candidatos: CandidatoSiniestro[] }

/**
 * Sugerencia de vínculo para cada parte SIN vincular con póliza de cartera.
 * Ausente del mapa = no aplica (ya vinculado, o sin póliza de cartera con la
 * que comparar). Nunca vincula: solo propone.
 */
export async function sugerenciasDePartes(
  correduriaId: string,
  partes: { id: string; polizaId: string | null; fechaHecho: Date; siniestroId: string | null }[],
): Promise<Map<string, SugerenciaParte>> {
  const out = new Map<string, SugerenciaParte>()
  const sueltos = partes.filter((p) => p.siniestroId === null && p.polizaId !== null)
  if (sueltos.length === 0) return out
  const filas = await siniestrosDePolizas(prismaAsegura(), correduriaId, [...new Set(sueltos.map((p) => p.polizaId as string))])
  const porId = new Map(filas.map((f) => [f.id, f]))
  const candidatos = filas.map(aCandidato)
  for (const p of sueltos) {
    const e = emparejarParte(p, candidatos)
    const ids = e.tipo === 'fuerte' ? [e.siniestroId] : e.tipo === 'ambiguo' ? e.candidatos : candidatosDeParte(p, candidatos).map((c) => c.id)
    out.set(p.id, {
      tipo: e.tipo,
      candidatos: ids.map((id) => porId.get(id)).filter((f): f is FilaCandidato => f !== undefined).map((f) => ({
        id: f.id,
        referencia: f.referencia ?? f.idSiniestroEntidad ?? null,
        fecha: f.fechaHora ? f.fechaHora.toISOString().slice(0, 10) : null,
        origen: String(f.origen) === 'cima' ? 'cima' : 'gestionado_correduria',
        estado: String(f.estado),
        tipo: f.tipo,
      })),
    })
  }
  return out
}

/**
 * Antes de un alta manual: ¿ese siniestro ya está en CIMA? Fuerte → no se crea
 * un duplicado (quien llama devuelve 409 con el id). Ambiguo → se crea con aviso.
 */
export async function duplicadoEnCima(
  db: Db,
  correduriaId: string,
  alta: { polizaId: string; fechaHora: string; referencia: string | null },
): Promise<EmparejamientoSiniestro> {
  const filas = await db.siniestro.findMany({
    where: { correduriaId, polizaId: alta.polizaId, origen: 'cima', fusionadoEnSiniestroId: null },
    select: SELECT_CANDIDATO,
  })
  const manual: SiniestroCandidato = {
    id: '__alta__',
    polizaId: alta.polizaId,
    fechaHora: alta.fechaHora,
    origen: 'gestionado_correduria',
    idSiniestroEntidad: alta.referencia,
    referencia: alta.referencia,
  }
  return emparejarManualConCima(manual, filas.map(aCandidato))
}

// ─── Vincular un parte ───────────────────────────────────────────────────────

export type ResultadoVincular =
  | { ok: true; parteId: string; siniestroId: string; estado: 'abierto_en_compania' | 'recibido' }
  | { ok: false; error: 'datos_invalidos' | 'no_encontrado' | 'ya_vinculado' | 'no_vinculable' | 'poliza_distinta'; status: 400 | 404 | 409 | 422 }

/**
 * Vincula un parte a un siniestro de la correduría, dentro de `db` (que puede
 * ser una transacción). Carrera segura: solo escribe si el parte sigue sin
 * vincular y en `enviado`/`recibido`.
 */
export async function vincularParteEn(
  db: Db | Tx,
  correduriaId: string,
  e: { parteId: string; siniestroId: string; vinculo: VinculoParte; actor: string },
): Promise<ResultadoVincular> {
  if (!UUID.test(e.parteId) || !UUID.test(e.siniestroId)) return { ok: false, error: 'datos_invalidos', status: 400 }
  const s = await db.siniestro.findFirst({
    where: { id: e.siniestroId, correduriaId, fusionadoEnSiniestroId: null },
    select: { id: true, clienteId: true, polizaId: true, origen: true, idSiniestroEntidad: true, referencia: true },
  })
  if (!s) return { ok: false, error: 'no_encontrado', status: 404 }
  const p = await db.portalParteSiniestro.findFirst({
    where: { id: e.parteId },
    select: { id: true, polizaId: true, estado: true, siniestroId: true, fechaHecho: true },
  })
  if (!p) return { ok: false, error: 'no_encontrado', status: 404 }
  if (p.polizaId !== null) {
    // El parte va sobre una póliza de cartera: tiene que ser de esta correduría y la del siniestro.
    const pol = await db.poliza.findFirst({ where: { id: p.polizaId, correduriaId }, select: { id: true } })
    if (!pol) return { ok: false, error: 'no_encontrado', status: 404 }
    if (p.polizaId !== s.polizaId) return { ok: false, error: 'poliza_distinta', status: 422 }
  }
  if (p.siniestroId !== null) return { ok: false, error: 'ya_vinculado', status: 409 }
  if (!(ESTADOS_PARTE_VINCULABLE as readonly string[]).includes(String(p.estado))) return { ok: false, error: 'no_vinculable', status: 409 }

  const ahora = new Date()
  const comunicado = conocidoPorCompania(s)
  const data: Record<string, unknown> = {
    siniestroId: s.id,
    siniestroVinculo: e.vinculo,
    siniestroVinculadoAt: ahora,
    actualizadoEn: ahora,
  }
  if (comunicado) {
    data.estado = 'abierto_en_compania'
    data.abiertoEnCompaniaAt = ahora
  } else if (String(p.estado) === 'enviado') {
    data.estado = 'recibido'
    data.recibidoAt = ahora
  }
  const r = await db.portalParteSiniestro.updateMany({
    where: { id: p.id, siniestroId: null, estado: { in: [...ESTADOS_PARTE_VINCULABLE] } },
    data,
  })
  if (r.count !== 1) return { ok: false, error: 'ya_vinculado', status: 409 }
  anotarCambio({ entidad: 'siniestro', id: s.id, campo: 'parte_portal' })
  const dia = p.fechaHecho.toISOString().slice(0, 10).split('-').reverse().join('/')
  const como = e.vinculo === 'auto_cima' ? 'automáticamente (misma póliza y fecha, único candidato)' : e.vinculo === 'alta_desde_parte' ? 'al registrar el siniestro desde él' : 'a mano'
  await anotarHistorial(
    db,
    correduriaId,
    s.clienteId,
    `Parte del portal del ${dia} vinculado al siniestro${s.referencia ? ` ${s.referencia}` : ''} ${como}${comunicado ? '' : ' (aún sin nº de la compañía: el cliente lo sigue viendo como recibido)'} por ${e.actor}`,
  )
  return { ok: true, parteId: p.id, siniestroId: s.id, estado: comunicado ? 'abierto_en_compania' : 'recibido' }
}

export async function vincularParte(
  correduriaId: string,
  e: { parteId: unknown; siniestroId: unknown; actor?: unknown },
): Promise<ResultadoVincular> {
  const parteId = typeof e.parteId === 'string' ? e.parteId.trim() : ''
  const siniestroId = typeof e.siniestroId === 'string' ? e.siniestroId.trim() : ''
  const actor = typeof e.actor === 'string' && e.actor.trim() !== '' ? e.actor.trim() : 'plataforma'
  return vincularParteEn(prismaAsegura(), correduriaId, { parteId, siniestroId, vinculo: 'manual', actor })
}

/**
 * Los partes vinculados a un siniestro que la compañía YA conoce pasan a
 * `abierto_en_compania`. Se llama al anotar el nº de la compañía y tras fusionar.
 */
export async function promoverPartesComunicados(db: Db | Tx, siniestroId: string): Promise<number> {
  const ahora = new Date()
  const r = await db.portalParteSiniestro.updateMany({
    where: { siniestroId, estado: { in: [...ESTADOS_PARTE_VINCULABLE] } },
    data: { estado: 'abierto_en_compania', abiertoEnCompaniaAt: ahora, actualizadoEn: ahora },
  })
  return r.count
}

// ─── Reconciliación (cron) ───────────────────────────────────────────────────

const SELECT_CORREDOR = {
  ...SELECT_CANDIDATO,
  clienteId: true,
  comentario: true,
  tramitadorNombre: true,
  tramitadorTelefono: true,
  tramitadorEmail: true,
  peritoNombre: true,
  peritoTelefono: true,
  peritoEmail: true,
  gravedad: true,
  reservaImporte: true,
  indemnizacionImporte: true,
  seConsideraCulpable: true,
  datosRamo: true,
  fechaDeclaracion: true,
  createdAt: true,
} as const

type FilaCorredor = FilaCandidato & {
  clienteId: string
  comentario: string | null
  tramitadorNombre: string | null
  tramitadorTelefono: string | null
  tramitadorEmail: string | null
  peritoNombre: string | null
  peritoTelefono: string | null
  peritoEmail: string | null
  gravedad: unknown
  reservaImporte: unknown
  indemnizacionImporte: unknown
  seConsideraCulpable: boolean | null
  datosRamo: unknown
  fechaDeclaracion: Date | null
  createdAt: Date
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function camposCorredor(f: FilaCorredor): CamposCorredor {
  return {
    referencia: f.referencia,
    comentario: f.comentario,
    tramitadorNombre: f.tramitadorNombre,
    tramitadorTelefono: f.tramitadorTelefono,
    tramitadorEmail: f.tramitadorEmail,
    peritoNombre: f.peritoNombre,
    peritoTelefono: f.peritoTelefono,
    peritoEmail: f.peritoEmail,
    gravedad: f.gravedad === null || f.gravedad === undefined ? null : String(f.gravedad),
    reservaImporte: numero(f.reservaImporte),
    indemnizacionImporte: numero(f.indemnizacionImporte),
    seConsideraCulpable: f.seConsideraCulpable,
    datosRamo: f.datosRamo !== null && typeof f.datosRamo === 'object' && !Array.isArray(f.datosRamo) ? (f.datosRamo as Record<string, unknown>) : null,
    fechaDeclaracion: f.fechaDeclaracion ? f.fechaDeclaracion.toISOString().slice(0, 10) : null,
  }
}

/** `cambiosDeFusion` → `data` de Prisma (tipos de columna). */
function dataDeFusion(c: Partial<CamposCorredor>): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(c)) {
    if (v === undefined) continue
    if (k === 'datosRamo') data.datosRamo = v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue)
    else if (k === 'fechaDeclaracion') data.fechaDeclaracion = v === null ? null : new Date(`${String(v)}T00:00:00Z`)
    else data[k] = v
  }
  return data
}

export type ResumenReconciliacion = {
  fusionados: { manualId: string; cimaId: string }[]
  vinculados: { parteId: string; siniestroId: string }[]
  /** Fusiones fuertes que no se hicieron porque el de CIMA ya absorbió otra alta: decide Alberto. */
  fusionesOmitidas: number
  /** Partes sin vincular que se quedan como sugerencia (ambiguos o fuertes no automáticos). */
  partesPendientes: number
}

async function fusionar(db: Db, correduriaId: string, manual: FilaCorredor, cima: FilaCorredor): Promise<boolean> {
  const ahora = new Date()
  const dia = manual.createdAt.toISOString().slice(0, 10).split('-').reverse().join('/')
  const cambios = cambiosDeFusion(camposCorredor(cima), camposCorredor(manual), ahora, dia)
  return db.$transaction(async (tx) => {
    const marca = await tx.siniestro.updateMany({
      where: { id: manual.id, correduriaId, fusionadoEnSiniestroId: null },
      data: { fusionadoEnSiniestroId: cima.id, fusionadoAt: ahora, updatedAt: ahora },
    })
    if (marca.count !== 1) return false // otra pasada llegó antes
    await tx.siniestro.update({ where: { id: cima.id }, data: { ...dataDeFusion(cambios), updatedAt: ahora } })
    // Lo que colgaba del alta manual pasa al siniestro que queda. Nada se borra.
    await tx.portalParteSiniestro.updateMany({ where: { siniestroId: manual.id }, data: { siniestroId: cima.id, actualizadoEn: ahora } })
    await tx.documento.updateMany({ where: { correduriaId, siniestroId: manual.id }, data: { siniestroId: cima.id } })
    await tx.siniestroInterviniente.updateMany({ where: { siniestroId: manual.id }, data: { siniestroId: cima.id } })
    await tx.$executeRaw`update gestiones set siniestro_id = ${cima.id}::uuid where siniestro_id = ${manual.id}::uuid`
    await promoverPartesComunicados(tx, cima.id)
    return true
  })
}

/**
 * Una pasada: (1) funde altas manuales con el siniestro de CIMA que les
 * corresponde, (2) vincula los partes con coincidencia fuerte a un siniestro de
 * CIMA. Lo ambiguo NO se toca: sale como sugerencia en la ficha.
 */
export async function reconciliarSiniestros(correduriaId: string): Promise<ResumenReconciliacion> {
  const db = prismaAsegura()
  const resumen: ResumenReconciliacion = { fusionados: [], vinculados: [], fusionesOmitidas: 0, partesPendientes: 0 }

  // (1) Fusión. `eiacXmlHash: null`: un alta manual sobre la que CIMA ya escribió
  // (casó por la clave) YA es el siniestro de la compañía; no hay nada que fundir.
  const manuales: FilaCorredor[] = await db.siniestro.findMany({
    where: { correduriaId, origen: 'gestionado_correduria', fusionadoEnSiniestroId: null, eiacXmlHash: null },
    select: SELECT_CORREDOR,
  })
  if (manuales.length > 0) {
    const cimas: FilaCorredor[] = await db.siniestro.findMany({
      where: { correduriaId, origen: 'cima', fusionadoEnSiniestroId: null, polizaId: { in: [...new Set(manuales.map((m) => m.polizaId))] } },
      select: { ...SELECT_CORREDOR, _count: { select: { fusionados: true } } },
    })
    const porId = new Map<string, FilaCorredor & { _count?: { fusionados: number } }>(cimas.map((c) => [c.id, c]))
    const manualPorId = new Map(manuales.map((m) => [m.id, m]))
    for (const par of fusionesAutomaticas(manuales.map(aCandidato), cimas.map(aCandidato))) {
      const cima = porId.get(par.cimaId)
      const manual = manualPorId.get(par.manualId)
      if (!cima || !manual) continue
      if ((cima._count?.fusionados ?? 0) > 0) { resumen.fusionesOmitidas++; continue }
      if (await fusionar(db, correduriaId, manual, cima)) {
        resumen.fusionados.push(par)
        anotarCambio({ entidad: 'siniestro', id: cima.id, campo: 'fusion' })
        await anotarHistorial(
          db,
          correduriaId,
          cima.clienteId,
          `Siniestro${manual.referencia ? ` ${manual.referencia}` : ''} dado de alta a mano: unido al que mandó la compañía por CIMA${cima.idSiniestroEntidad ? ` (${cima.idSiniestroEntidad})` : ''}. Se conservan el nº y las notas; estado y fechas, los de la compañía.`,
        )
      }
    }
  }

  // (2) Partes sin vincular → siniestro de CIMA con coincidencia fuerte.
  const partes = await db.portalParteSiniestro.findMany({
    where: { siniestroId: null, estado: { in: [...ESTADOS_PARTE_VINCULABLE] }, polizaId: { not: null } },
    select: { id: true, polizaId: true, fechaHecho: true },
  })
  if (partes.length === 0) return resumen
  const filas = await siniestrosDePolizas(db, correduriaId, [...new Set(partes.map((p) => p.polizaId as string))])
  if (filas.length === 0) { resumen.partesPendientes = 0; return resumen }
  const conParte = await db.portalParteSiniestro.findMany({
    where: { siniestroId: { in: filas.map((f) => f.id) } },
    select: { siniestroId: true },
  })
  const yaVinculados = new Set(conParte.map((c) => c.siniestroId as string))
  const auto = vinculosAutomaticos(partes, filas.map(aCandidato), yaVinculados)
  for (const v of auto) {
    const r = await vincularParteEn(db, correduriaId, { parteId: v.parteId, siniestroId: v.siniestroId, vinculo: 'auto_cima', actor: 'reconciliación CIMA' })
    if (r.ok) resumen.vinculados.push(v)
  }
  const polizasConSiniestro = new Set(filas.map((f) => f.polizaId))
  resumen.partesPendientes = partes.filter((p) => polizasConSiniestro.has(p.polizaId as string)).length - resumen.vinculados.length
  return resumen
}
