// Repositorio de la FASE 4 (impuestos) de UNA empresa. Mismas reglas que repo.ts / repo-f3.ts:
//   · se construye SOLO dentro de `conEmpresa` (RLS) y TODA consulta filtra además por `empresa_id` explícito;
//   · SQL parametrizado con plantilla, nunca concatenación; importes en céntimos (bigint);
//   · `declaraciones` (0004) es de ciclo de vida acotado: aquí no hay DELETE, y el UPDATE solo toca columnas del ciclo (los triggers de 0004
//     lo exigen aunque este código se equivocara).
// Va APARTE de `repoSql` a propósito: lee tablas de 0003/0004 que pueden no existir todavía y así no altera el contrato de aislamiento del
// repositorio principal. Cada llamada de la app lo abre en su propia transacción y tolera el fallo.
import type { TxSql } from './rls.ts'
import { centimosDeBd, enteroDeBd, fechaDeBd } from './importes.ts'
import type { FilaHechoFiscal } from './impuestos-datos.ts'
import type { EstadoDeclaracion, ModeloAeat, PeriodoModelo, SumaCuenta } from '@central/module-contabilidad'

type Fila = Record<string, unknown>
const s = (v: unknown) => (v == null ? null : String(v))
const iso = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v))

export const LIMITE_HECHOS_FISCALES = 20_000

export type FilaDeclaracion = {
  id: string; modelo: ModeloAeat; anio: number; periodo: PeriodoModelo; version: number; estado: EstadoDeclaracion
  resultado: number | null; completo: boolean; calculadoEn: string; revisadoEn: string | null
  presentadoEl: string | null; justificante: string | null; asientoLiquidacionId: string | null; asientoPagoId: string | null
  /** Snapshot del cálculo (solo en las lecturas de una declaración concreta). */
  calculo?: unknown
}
export type NuevaDeclaracion = { modelo: ModeloAeat; anio: number; periodo: PeriodoModelo; version: number; resultado: number | null; completo: boolean; calculo: unknown; huella: string; usuarioId: string | null }

export interface RepoF4 {
  /** Hechos asentados y no rectificados del periodo (ventas, compras y nóminas), con la factura recibida si existe. */
  hechosFiscales(desde: string, hasta: string, conFacturas: boolean): Promise<{ filas: FilaHechoFiscal[]; truncado: boolean }>
  /** Σ 477/472/4751 de los asientos de ORIGEN «hecho» no rectificados del periodo (antes de liquidar). */
  sumasFiscalesDeHechos(desde: string, hasta: string): Promise<SumaCuenta[]>
  regimenIva(): Promise<string | null>
  declaraciones(anio: number): Promise<FilaDeclaracion[]>
  declaracion(id: string, bloquear?: boolean): Promise<FilaDeclaracion | null>
  ultimaVersion(modelo: ModeloAeat, anio: number, periodo: PeriodoModelo): Promise<FilaDeclaracion | null>
  /** 303 presentados del ejercicio y del 4T anterior, con su snapshot (para las cuotas pendientes de compensar). */
  presentados303(anio: number): Promise<FilaDeclaracion[]>
  /** 130 presentados del ejercicio con su resultado (pagos fraccionados anteriores). */
  presentados130(anio: number): Promise<FilaDeclaracion[]>
  insertarDeclaracion(d: NuevaDeclaracion): Promise<string | null>
  /** Recalcula un BORRADOR. false = ya no era borrador. */
  actualizarBorrador(id: string, d: { resultado: number | null; completo: boolean; calculo: unknown; huella: string; usuarioId: string | null }): Promise<boolean>
  marcarRevisada(id: string, usuarioId: string | null): Promise<boolean>
  devolverABorrador(id: string): Promise<boolean>
  marcarPresentada(id: string, d: { usuarioId: string | null; fecha: string; justificante: string; asientoLiquidacionId: string | null; asientoPagoId: string | null }): Promise<boolean>
}

const aDeclaracion = (f: Fila): FilaDeclaracion => ({
  id: String(f.id), modelo: f.modelo as ModeloAeat, anio: enteroDeBd(f.anio, 'anio'), periodo: f.periodo as PeriodoModelo, version: enteroDeBd(f.version, 'version'),
  estado: f.estado as EstadoDeclaracion, resultado: f.resultado_cent == null ? null : centimosDeBd(f.resultado_cent, 'resultado'), completo: f.completo === true,
  calculadoEn: iso(f.calculado_en) ?? '', revisadoEn: iso(f.revisado_en), presentadoEl: f.presentado_el == null ? null : fechaDeBd(f.presentado_el),
  justificante: s(f.justificante), asientoLiquidacionId: s(f.asiento_liquidacion_id), asientoPagoId: s(f.asiento_pago_id),
  ...(f.calculo !== undefined ? { calculo: f.calculo } : {}),
})

export function repoF4Sql(tx: TxSql, empresaId: string): RepoF4 {
  const e = empresaId
  return {
    async hechosFiscales(desde, hasta, conFacturas) {
      const filas = conFacturas
        ? await tx.$queryRaw<Fila[]>`
            SELECT h.id, h.tipo, h.ref, h.fecha, h.payload, a.numero AS a_numero, a.ejercicio AS a_ejercicio,
                   fr.proveedor_nif, fr.proveedor_nombre, fr.numero AS f_numero
              FROM contabilidad.hechos_contables h
              LEFT JOIN contabilidad.asientos a ON a.empresa_id = h.empresa_id AND a.id = h.asiento_id
              LEFT JOIN contabilidad.facturas_recibidas fr ON fr.empresa_id = h.empresa_id AND fr.hecho_id = h.id
             WHERE h.empresa_id = ${e}::uuid AND h.estado = 'asentado' AND h.tipo IN ('venta', 'compra', 'nomina')
               AND h.fecha BETWEEN ${desde}::date AND ${hasta}::date
               AND NOT EXISTS (SELECT 1 FROM contabilidad.asientos r WHERE r.empresa_id = h.empresa_id AND r.reversa_de = h.asiento_id)
             ORDER BY h.fecha, h.recibido_en LIMIT ${LIMITE_HECHOS_FISCALES + 1}::int`
        : await tx.$queryRaw<Fila[]>`
            SELECT h.id, h.tipo, h.ref, h.fecha, h.payload, a.numero AS a_numero, a.ejercicio AS a_ejercicio,
                   NULL::text AS proveedor_nif, NULL::text AS proveedor_nombre, NULL::text AS f_numero
              FROM contabilidad.hechos_contables h
              LEFT JOIN contabilidad.asientos a ON a.empresa_id = h.empresa_id AND a.id = h.asiento_id
             WHERE h.empresa_id = ${e}::uuid AND h.estado = 'asentado' AND h.tipo IN ('venta', 'compra', 'nomina')
               AND h.fecha BETWEEN ${desde}::date AND ${hasta}::date
               AND NOT EXISTS (SELECT 1 FROM contabilidad.asientos r WHERE r.empresa_id = h.empresa_id AND r.reversa_de = h.asiento_id)
             ORDER BY h.fecha, h.recibido_en LIMIT ${LIMITE_HECHOS_FISCALES + 1}::int`
      const truncado = filas.length > LIMITE_HECHOS_FISCALES
      return {
        truncado,
        filas: filas.slice(0, LIMITE_HECHOS_FISCALES).map((f) => ({
          hechoId: String(f.id), tipo: f.tipo as FilaHechoFiscal['tipo'], ref: String(f.ref), fecha: fechaDeBd(f.fecha), payload: f.payload,
          asientoRef: f.a_numero == null ? null : `${enteroDeBd(f.a_numero, 'numero')}/${enteroDeBd(f.a_ejercicio, 'ejercicio')}`,
          proveedorNif: s(f.proveedor_nif), proveedorNombre: s(f.proveedor_nombre), facturaNumero: s(f.f_numero),
        })),
      }
    },

    async sumasFiscalesDeHechos(desde, hasta) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT p.cuenta, COALESCE(sum(p.debe), 0)::bigint AS debe, COALESCE(sum(p.haber), 0)::bigint AS haber, count(*)::int AS n
          FROM contabilidad.apuntes p
          JOIN contabilidad.asientos a ON a.empresa_id = p.empresa_id AND a.id = p.asiento_id
         WHERE p.empresa_id = ${e}::uuid AND a.origen = 'hecho' AND a.fecha BETWEEN ${desde}::date AND ${hasta}::date
           AND (p.cuenta LIKE '477%' OR p.cuenta LIKE '472%' OR p.cuenta LIKE '4751%')
           AND NOT EXISTS (SELECT 1 FROM contabilidad.asientos r WHERE r.empresa_id = a.empresa_id AND r.reversa_de = a.id)
         GROUP BY p.cuenta ORDER BY p.cuenta`
      return f.map((x) => ({ cuenta: String(x.cuenta), debe: centimosDeBd(x.debe), haber: centimosDeBd(x.haber), n: enteroDeBd(x.n) }))
    },

    async regimenIva() {
      const f = await tx.$queryRaw<Fila[]>`SELECT regimen_iva FROM contabilidad.empresas WHERE id = ${e}::uuid`
      return s(f[0]?.regimen_iva)
    },

    async declaraciones(anio) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT id, modelo, anio, periodo, version, estado, resultado_cent, completo, calculado_en, revisado_en, presentado_el, justificante,
               asiento_liquidacion_id, asiento_pago_id
          FROM contabilidad.declaraciones WHERE empresa_id = ${e}::uuid AND anio = ${anio}::int ORDER BY modelo, periodo, version`
      return f.map(aDeclaracion)
    },

    async declaracion(id, bloquear = false) {
      const f = bloquear
        ? await tx.$queryRaw<Fila[]>`SELECT * FROM contabilidad.declaraciones WHERE empresa_id = ${e}::uuid AND id = ${id}::uuid FOR UPDATE`
        : await tx.$queryRaw<Fila[]>`SELECT * FROM contabilidad.declaraciones WHERE empresa_id = ${e}::uuid AND id = ${id}::uuid`
      return f[0] ? aDeclaracion(f[0]) : null
    },

    async ultimaVersion(modelo, anio, periodo) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT * FROM contabilidad.declaraciones
         WHERE empresa_id = ${e}::uuid AND modelo = ${modelo} AND anio = ${anio}::int AND periodo = ${periodo}
         ORDER BY version DESC LIMIT 1`
      return f[0] ? aDeclaracion(f[0]) : null
    },

    async presentados303(anio) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT * FROM contabilidad.declaraciones
         WHERE empresa_id = ${e}::uuid AND modelo = '303' AND estado = 'presentado' AND (anio = ${anio}::int OR (anio = ${anio - 1}::int AND periodo = '4T'))
         ORDER BY anio, periodo, version`
      return f.map(aDeclaracion)
    },

    async presentados130(anio) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT DISTINCT ON (periodo) * FROM contabilidad.declaraciones
         WHERE empresa_id = ${e}::uuid AND modelo = '130' AND anio = ${anio}::int AND estado = 'presentado'
         ORDER BY periodo, version DESC`
      return f.map(aDeclaracion)
    },

    async insertarDeclaracion(d) {
      const f = await tx.$queryRaw<Fila[]>`
        INSERT INTO contabilidad.declaraciones (empresa_id, modelo, anio, periodo, version, resultado_cent, completo, calculo, calculo_huella, calculado_por)
        VALUES (${e}::uuid, ${d.modelo}, ${d.anio}::int, ${d.periodo}, ${d.version}::smallint, ${d.resultado}::bigint, ${d.completo}::boolean,
                ${JSON.stringify(d.calculo)}::jsonb, ${d.huella}, ${d.usuarioId}::uuid)
        ON CONFLICT (empresa_id, modelo, anio, periodo, version) DO NOTHING
        RETURNING id`
      return f[0] ? String(f[0].id) : null
    },

    async actualizarBorrador(id, d) {
      const n = await tx.$executeRaw`
        UPDATE contabilidad.declaraciones
           SET resultado_cent = ${d.resultado}::bigint, completo = ${d.completo}::boolean, calculo = ${JSON.stringify(d.calculo)}::jsonb,
               calculo_huella = ${d.huella}, calculado_por = ${d.usuarioId}::uuid, calculado_en = now()
         WHERE empresa_id = ${e}::uuid AND id = ${id}::uuid AND estado = 'borrador'`
      return n === 1
    },

    async marcarRevisada(id, usuarioId) {
      const n = await tx.$executeRaw`
        UPDATE contabilidad.declaraciones SET estado = 'revisado', revisado_por = ${usuarioId}::uuid, revisado_en = now()
         WHERE empresa_id = ${e}::uuid AND id = ${id}::uuid AND estado = 'borrador' AND completo`
      return n === 1
    },

    async devolverABorrador(id) {
      const n = await tx.$executeRaw`
        UPDATE contabilidad.declaraciones SET estado = 'borrador', revisado_por = NULL, revisado_en = NULL
         WHERE empresa_id = ${e}::uuid AND id = ${id}::uuid AND estado = 'revisado'`
      return n === 1
    },

    async marcarPresentada(id, d) {
      const n = await tx.$executeRaw`
        UPDATE contabilidad.declaraciones
           SET estado = 'presentado', presentado_por = ${d.usuarioId}::uuid, presentado_el = ${d.fecha}::date, justificante = ${d.justificante},
               presentado_en = now(), asiento_liquidacion_id = ${d.asientoLiquidacionId}::uuid, asiento_pago_id = ${d.asientoPagoId}::uuid
         WHERE empresa_id = ${e}::uuid AND id = ${id}::uuid AND estado = 'revisado' AND completo`
      return n === 1
    },
  }
}
