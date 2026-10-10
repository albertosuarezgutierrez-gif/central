// La REFERENCIA propia del presupuesto (`AS-26-0042`, 30/09/2026): buscarlo por ella y sellar la
// descarga del PDF. Las reglas puras (reconocer lo tecleado, el estado, la igualdad de conjuntos)
// viven en `@central/module-seguros/referencia-presupuesto`, con test. Aquí solo la BD.
//
// 🛡️ Todo filtrado por `correduriaId`: con BYPASSRLS un id o una referencia ajena no falla, devuelve
// los datos de otro. 🚨 Nada de esto gasta un euro ni sale al cliente.

import {
  admiteEmitir,
  estadoReferencia,
  normalizarReferencia,
  type EstadoReferencia,
} from '@central/module-seguros/referencia-presupuesto'

import { prismaAsegura } from './asegura-db'
import { esDeAvant2, origenPresupuesto, type OrigenPresupuesto } from './presupuesto-origen'

export type OpcionEnDocumento = {
  id: string
  orden: number
  compania: string
  producto: string
  modalidad: string | null
  categoria: string | null
  /** `null` = no se pudo leer; se pinta «—», nunca 0. */
  primaEur: number | null
  /** Fila de `tarificacion_precios` de la que sale (identidad del precio para emitir). `null` = no consta. */
  precioId: string | null
}

export type PresupuestoPorReferencia = {
  id: string
  referencia: string
  clienteId: string
  cliente: string
  ramo: string
  polizaId: string | null
  /** `null` SOLO en un presupuesto de origen `ofertas` (no tiene tarificación de Avant2). */
  tarificacionId: string | null
  /** Avant2 | `ofertas`. `null` = un origen que esta versión no conoce (y entonces no se emite). */
  origen: OrigenPresupuesto | null
  /** La oportunidad: la de la tarificación (Avant2) o la del propio presupuesto (ofertas). `null` = sin enlazar (regla 9: desde ahí no se emite). */
  oportunidadId: string | null
  estado: EstadoReferencia
  /** `false` = retirado, emitido o CADUCADO (con ese precio no se emite, se re-tarifica) — y SIEMPRE en
   *  un presupuesto de ofertas: ese se emite en la compañía, nunca por Avant2. */
  emitible: boolean
  creadoAt: Date
  venceEl: Date
  enviadoAt: Date | null
  enlaceGeneradoAt: Date | null
  documentoDescargadoAt: Date | null
  emitidoAt: Date | null
  polizaEmitidaId: string | null
  /** SOLO lo que va en el documento (`oculta_at IS NULL`), en su orden. */
  opciones: OpcionEnDocumento[]
}

export type ResultadoReferencia =
  | { estado: 'no_es_referencia' }
  | { estado: 'no_encontrado'; referencia: string }
  | { estado: 'ok'; presupuesto: PresupuestoPorReferencia }

function numero(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(String(v))
  return Number.isFinite(n) ? n : null
}

/** Un fallo de consulta LANZA: no es «no existe». */
export async function buscarPresupuestoPorReferencia(
  correduriaId: string,
  q: string,
  hoy: Date = new Date(),
): Promise<ResultadoReferencia> {
  const referencia = normalizarReferencia(q)
  if (referencia === null) return { estado: 'no_es_referencia' }
  const db = prismaAsegura()
  const p = await db.presupuesto.findFirst({
    where: { correduriaId, referencia },
    include: {
      opciones: {
        where: { ocultaAt: null },
        orderBy: { orden: 'asc' },
        select: { id: true, orden: true, compania: true, producto: true, modalidad: true, categoria: true, primaEur: true, precioId: true },
      },
    },
  })
  if (!p) return { estado: 'no_encontrado', referencia }

  const cliente = await db.cliente.findFirst({ where: { id: p.clienteId, correduriaId }, select: { nombre: true, apellidos: true } })
  const deAvant2 = esDeAvant2(p)
  const [tarif] = deAvant2
    ? await db.$queryRaw<{ oportunidad_id: string | null }[]>`
        select oportunidad_id::text as oportunidad_id from tarificaciones
        where correduria_id = ${correduriaId}::uuid and id = ${p.tarificacionId}::uuid`
    : []

  const estado = estadoReferencia(p, hoy)
  return {
    estado: 'ok',
    presupuesto: {
      id: p.id,
      referencia,
      clienteId: p.clienteId,
      cliente: [cliente?.nombre, cliente?.apellidos].map((s) => s?.trim()).filter(Boolean).join(' ') || 'Cliente sin nombre',
      ramo: p.ramo,
      polizaId: p.polizaId,
      tarificacionId: p.tarificacionId,
      origen: origenPresupuesto(p.origen),
      oportunidadId: deAvant2 ? tarif?.oportunidad_id ?? null : p.oportunidadId,
      estado,
      // 🚨 Emitir desde la referencia es emitir por Avant2: solo un presupuesto de Codeoscopic.
      emitible: deAvant2 && admiteEmitir(estado),
      creadoAt: p.creadoAt,
      venceEl: p.venceEl,
      enviadoAt: p.enviadoAt,
      enlaceGeneradoAt: p.enlaceGeneradoAt,
      documentoDescargadoAt: p.documentoDescargadoAt,
      emitidoAt: p.emitidoAt,
      polizaEmitidaId: p.polizaEmitidaId,
      opciones: p.opciones.map((o) => ({
        id: o.id,
        orden: o.orden,
        compania: o.compania,
        producto: o.producto,
        modalidad: o.modalidad,
        categoria: o.categoria,
        primaEur: numero(o.primaEur),
        precioId: o.precioId,
      })),
    },
  }
}

export type ResultadoDescarga =
  | { estado: 'ok'; referencia: string | null; primera: boolean }
  | { estado: 'error'; motivo: 'no_encontrado'; detalle: string }

/**
 * Se descarga el PDF para el cliente: sella `documento_descargado_at` la PRIMERA vez y deja un
 * evento en cada descarga (append-only). 🚨 NO toca `enviado_at` ni `enlace_generado_at`:
 * descargar no prueba que saliera, y esos dos sellos dicen justo eso.
 */
export async function marcarDocumentoDescargado(
  correduriaId: string,
  entrada: { id: string; actor: string },
): Promise<ResultadoDescarga> {
  const db = prismaAsegura()
  const p = await db.presupuesto.findFirst({ where: { id: entrada.id, correduriaId }, select: { id: true, referencia: true } })
  if (!p) return { estado: 'error', motivo: 'no_encontrado', detalle: 'Ese presupuesto no existe en esta correduría.' }
  const n = await db.presupuesto.updateMany({
    where: { id: p.id, correduriaId, documentoDescargadoAt: null },
    data: { documentoDescargadoAt: new Date() },
  })
  await db.presupuestoEvento.create({
    data: { presupuestoId: p.id, tipo: 'pdf_descargado', origen: 'corredor', detalle: { actor: entrada.actor, referencia: p.referencia } },
  })
  return { estado: 'ok', referencia: p.referencia, primera: n.count > 0 }
}

/**
 * Tras emitir: cierra los presupuestos de ESA tarificación cuyo documento enseñaba la compañía
 * emitida (`emitido_at` si faltaba + `poliza_emitida_id`). Sirve para los que se emitieron desde la
 * referencia sin pasar por la firma del portal; el aceptado lo cierra antes `marcarEmitido`, y aquí
 * solo se le ata la póliza. Best-effort para quien llama: la póliza ya existe.
 *
 * Casa por COMPAÑÍA (sin mayúsculas ni espacios) porque el Submit no trae la modalidad; una
 * tarificación sin presupuesto, o uno RETIRADO, no se toca (`retirado_at is null` en el mismo UPDATE:
 * con READ COMMITTED, un retirado a la vez se re-evalúa bajo el cerrojo de fila y queda fuera).
 * El UPDATE y sus eventos van en UNA transacción: o se sella con su rastro, o no se sella.
 */
export async function cerrarPresupuestosPorEmision(
  correduriaId: string,
  entrada: { tarificacionId: string | null; polizaId: string; compania: string | null; actor: string },
): Promise<number> {
  if (!entrada.tarificacionId || !entrada.compania?.trim()) return 0
  const db = prismaAsegura()
  return db.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      update presupuesto p
         set emitido_at = coalesce(p.emitido_at, now()),
             poliza_emitida_id = ${entrada.polizaId}::uuid
       where p.correduria_id = ${correduriaId}::uuid
         and p.tarificacion_id = ${entrada.tarificacionId}::uuid
         and p.retirado_at is null
         and p.poliza_emitida_id is null
         and exists (
           select 1 from presupuesto_opcion o
            where o.presupuesto_id = p.id and o.oculta_at is null
              and lower(regexp_replace(trim(o.compania), '\\s+', ' ', 'g'))
                = lower(regexp_replace(trim(${entrada.compania}), '\\s+', ' ', 'g')))
      returning p.id::text as id`
    if (filas.length > 0) {
      await tx.presupuestoEvento.createMany({
        data: filas.map((f) => ({
          presupuestoId: f.id,
          tipo: 'poliza_emitida',
          origen: 'sistema',
          detalle: { actor: entrada.actor, polizaId: entrada.polizaId, via: 'emitir' },
        })),
      })
    }
    return filas.length
  }, { timeout: 15_000, maxWait: 5_000 })
}
