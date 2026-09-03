// Siniestros DESDE la ficha: lectura completa, apertura, cambio de estado y
// seguimiento (visión del CRM §9, punto 6). Reglas puras en
// `@central/module-seguros` (`siniestros.ts`); aquí la BD.
//
// - `correduriaId` SIEMPRE explícito; la póliza y el siniestro se comprueban
//   contra la correduría antes de escribir.
// - Dos orígenes (ver cabecera del módulo): en uno de CIMA no se toca el
//   estado a mano ni la referencia; en uno nuestro la referencia que dé la
//   compañía se guarda TAMBIÉN en `id_siniestro_entidad` (+ el código DGS de
//   la póliza) para que el pull de CIMA caiga sobre nuestra fila y no la duplique.
// - Toda escritura deja fila en `historial_interno` (tipo `siniestro`), sin la
//   descripción del hecho ni datos personales.
// - La dirección exacta del hecho se cifra (`encryptField`); el resto del
//   lugar (CP/ciudad/provincia) va en claro como en CIMA.

import {
  anadirNota,
  revisarApertura,
  revisarSeguimiento,
  revisarTransicion,
  textoHistorialSiniestro,
  type AperturaSiniestro,
  type OrigenSiniestro,
  type SeguimientoSiniestro,
  esVolcadoHistorico,
} from '@central/module-seguros'
import { encryptField } from '@central/module-seguros-pii'
import { prismaAsegura } from './asegura-db'
import type { SiniestroFicha } from './cartera-ficha'

/** Columnas que necesita `SiniestroFicha`. Lo usan la ficha de cliente, la de póliza y este módulo. */
export const SELECT_SINIESTRO = {
  id: true,
  clienteId: true,
  polizaId: true,
  estado: true,
  tipo: true,
  referencia: true,
  fechaHora: true,
  reservaImporte: true,
  indemnizacionImporte: true,
  tramitadorNombre: true,
  tramitadorTelefono: true,
  tramitadorEmail: true,
  peritoNombre: true,
  peritoTelefono: true,
  peritoEmail: true,
  gravedad: true,
  comentario: true,
  origen: true,
  idSiniestroEntidad: true,
  lugarCp: true,
  lugarCiudad: true,
  lugarProvincia: true,
  updatedAt: true,
} as const

type FilaSiniestro = {
  id: string
  clienteId: string
  polizaId: string
  estado: unknown
  tipo: string | null
  referencia: string | null
  fechaHora: Date | null
  reservaImporte: unknown
  indemnizacionImporte: unknown
  tramitadorNombre: string | null
  tramitadorTelefono: string | null
  tramitadorEmail: string | null
  peritoNombre: string | null
  peritoTelefono: string | null
  peritoEmail: string | null
  gravedad: unknown
  comentario: string | null
  origen: unknown
  idSiniestroEntidad: string | null
  lugarCp: string | null
  lugarCiudad: string | null
  lugarProvincia: string | null
  updatedAt: Date
}

const ESTADOS_ABIERTO = new Set(['abierto', 'en_tramitacion'])

function num(d: unknown): number | null {
  if (d === null || d === undefined) return null
  const n = Number(d)
  return Number.isFinite(n) ? n : null
}

function limpio(v: string | null | undefined): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** Fila de Prisma → `SiniestroFicha`. `null` en reserva/indemnización = no informada, nunca 0. */
export function mapSiniestro(s: FilaSiniestro): SiniestroFicha {
  const origen = (String(s.origen) === 'cima' ? 'cima' : 'gestionado_correduria') as OrigenSiniestro
  const lugar = [s.lugarCiudad, s.lugarCp ? `(${s.lugarCp})` : null].filter(Boolean).join(' ') || s.lugarProvincia || null
  return {
    id: s.id,
    clienteId: s.clienteId,
    polizaId: s.polizaId,
    estado: String(s.estado),
    tipo: s.tipo ?? null,
    referencia: s.referencia ?? null,
    fecha: s.fechaHora instanceof Date ? s.fechaHora.toISOString().slice(0, 10) : null,
    fechaHora: s.fechaHora instanceof Date ? s.fechaHora.toISOString() : null,
    reserva: num(s.reservaImporte),
    indemnizacion: num(s.indemnizacionImporte),
    tramitador: s.tramitadorNombre ?? null,
    tramitadorTelefono: limpio(s.tramitadorTelefono),
    tramitadorEmail: limpio(s.tramitadorEmail),
    perito: limpio(s.peritoNombre),
    peritoTelefono: limpio(s.peritoTelefono),
    peritoEmail: limpio(s.peritoEmail),
    gravedad: s.gravedad === null || s.gravedad === undefined ? null : String(s.gravedad),
    comentario: limpio(s.comentario),
    lugar,
    origen,
    confirmadoCima: s.idSiniestroEntidad !== null,
    abierto: ESTADOS_ABIERTO.has(String(s.estado)),
    actualizado: s.updatedAt.toISOString(),
  }
}

// ─── Resultado común ─────────────────────────────────────────────────────────

type Fallo = { ok: false; estado: 'invalido' | 'no_encontrado' | 'error'; motivo: string; status: 404 | 422 | 500 }
export type ResultadoSiniestro = { ok: true; siniestro: SiniestroFicha; aviso: string | null; ignorados: string[] } | Fallo

const invalido = (motivo: string): Fallo => ({ ok: false, estado: 'invalido', motivo, status: 422 })
const noEncontrado = (motivo: string): Fallo => ({ ok: false, estado: 'no_encontrado', motivo, status: 404 })

async function anotarHistorial(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('siniestro' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[cartera-siniestros] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/** Un siniestro de la correduría, o `null` si no existe en ella. */
export async function leerSiniestro(correduriaId: string, id: string): Promise<SiniestroFicha | null> {
  const s = await prismaAsegura().siniestro.findFirst({ where: { id, correduriaId }, select: SELECT_SINIESTRO })
  return s ? mapSiniestro(s) : null
}

// ─── Apertura ────────────────────────────────────────────────────────────────

export async function abrirSiniestro(
  correduriaId: string,
  entrada: AperturaSiniestro & { actor: string },
): Promise<ResultadoSiniestro> {
  const r = revisarApertura(entrada)
  if (!r.ok) return invalido(r.motivo)
  const a = r.apertura
  const db = prismaAsegura()
  const poliza = await db.poliza.findFirst({
    where: { id: a.polizaId, correduriaId, mergedIntoPolizaId: null },
    select: { id: true, clienteId: true, numeroPoliza: true, codigoEntidadDgs: true, importRef: true, eiacXmlHash: true },
  })
  if (!poliza) return noEncontrado('La póliza no existe en esta correduría.')
  // Volcado histórico = lead, no cliente. OJO: no basta con `import_ref`, porque
  // una fila del volcado que la ingesta de CIMA mantiene al día SÍ es cartera viva
  // (ver `cartera-viva.ts`); sobre esa sí se abre siniestro.
  if (esVolcadoHistorico(poliza)) return invalido('Esa póliza es del volcado histórico, no está viva en CIMA: no se abre un siniestro sobre ella.')

  const creado = await db.siniestro.create({
    data: {
      correduriaId,
      clienteId: poliza.clienteId,
      polizaId: poliza.id,
      estado: 'abierto',
      origen: 'gestionado_correduria',
      tipo: a.tipo,
      fechaHora: new Date(a.fechaHora),
      comentario: a.descripcion,
      lugarDireccion: a.lugarDireccion === null ? null : encryptField(a.lugarDireccion),
      lugarCp: a.lugarCp,
      lugarCiudad: a.lugarCiudad,
      lugarProvincia: a.lugarProvincia,
      seConsideraCulpable: a.seConsideraCulpable,
      gravedad: a.gravedad,
      referencia: a.referencia,
      // La referencia de la compañía es la llave de CIMA: si ya la tenemos, el pull cae aquí.
      idSiniestroEntidad: a.referencia,
      codigoEntidadDgs: poliza.codigoEntidadDgs,
    },
    select: SELECT_SINIESTRO,
  })
  await anotarHistorial(
    correduriaId,
    poliza.clienteId,
    `${textoHistorialSiniestro({ accion: 'apertura', tipo: a.tipo, fechaHora: a.fechaHora, numeroPoliza: poliza.numeroPoliza, aviso: a.aviso })} por ${entrada.actor}`,
  )
  return { ok: true, siniestro: mapSiniestro(creado), aviso: a.aviso, ignorados: [] }
}

// ─── Estado ──────────────────────────────────────────────────────────────────

export async function cambiarEstadoSiniestro(
  correduriaId: string,
  entrada: { siniestroId: string; estado: string; actor: string },
): Promise<ResultadoSiniestro> {
  const db = prismaAsegura()
  const s = await db.siniestro.findFirst({ where: { id: entrada.siniestroId, correduriaId }, select: SELECT_SINIESTRO })
  if (!s) return noEncontrado('El siniestro no existe en esta correduría.')
  const actual = mapSiniestro(s)
  const t = revisarTransicion(actual.origen, actual.estado, entrada.estado)
  if (!t.ok) return invalido(t.motivo)
  const nuevo = await db.siniestro.update({
    where: { id: s.id },
    data: { estado: entrada.estado as 'abierto' | 'en_tramitacion' | 'cerrado' | 'rechazado', updatedAt: new Date() },
    select: SELECT_SINIESTRO,
  })
  await anotarHistorial(
    correduriaId,
    s.clienteId,
    `${textoHistorialSiniestro({ accion: 'estado', referencia: actual.referencia, de: actual.estado, a: entrada.estado })} por ${entrada.actor}`,
  )
  return { ok: true, siniestro: mapSiniestro(nuevo), aviso: null, ignorados: [] }
}

// ─── Seguimiento ─────────────────────────────────────────────────────────────

export async function seguirSiniestro(
  correduriaId: string,
  entrada: SeguimientoSiniestro & { siniestroId: string; actor: string },
): Promise<ResultadoSiniestro> {
  const db = prismaAsegura()
  const s = await db.siniestro.findFirst({ where: { id: entrada.siniestroId, correduriaId }, select: { ...SELECT_SINIESTRO, codigoEntidadDgs: true, poliza: { select: { codigoEntidadDgs: true } } } })
  if (!s) return noEncontrado('El siniestro no existe en esta correduría.')
  const actual = mapSiniestro(s)
  const { siniestroId: _id, actor, ...campos } = entrada
  void _id
  const r = revisarSeguimiento(actual.origen, campos)
  if (!r.ok) return invalido(r.motivo)
  const { cambios, nota, ignorados } = r.seguimiento

  const data: Record<string, unknown> = { updatedAt: new Date() }
  for (const [k, v] of Object.entries(cambios)) data[k] = v
  if (cambios.referencia !== undefined) {
    // Llave de CIMA: con la referencia y el código DGS, el próximo pull actualiza esta fila.
    data.idSiniestroEntidad = cambios.referencia
    if (cambios.referencia !== null && s.codigoEntidadDgs === null) data.codigoEntidadDgs = s.poliza.codigoEntidadDgs
  }
  if (nota !== null) data.comentario = anadirNota(actual.comentario, nota)

  const nuevo = await db.siniestro.update({ where: { id: s.id }, data, select: SELECT_SINIESTRO })
  await anotarHistorial(
    correduriaId,
    s.clienteId,
    `${textoHistorialSiniestro({ accion: 'seguimiento', referencia: nuevo.referencia, campos: Object.keys(cambios), conNota: nota !== null })} por ${actor}`,
  )
  return { ok: true, siniestro: mapSiniestro(nuevo), aviso: null, ignorados }
}
