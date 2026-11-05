// Repositorio de la FASE 3 (actividad/CNAE, compras, banco y conciliación) de UNA empresa. Mismas reglas que lib/repo.ts:
//   · se construye SOLO dentro de `conEmpresa` (RLS) y TODA consulta filtra además por `empresa_id` explícito;
//   · solo-añadir (los triggers de 0003 lo exigen): aquí no hay UPDATE/DELETE de facturas, movimientos ni conciliaciones;
//   · SQL parametrizado con plantilla, nunca concatenación. Importes en céntimos (bigint).
// Separado de repo.ts para no engordarlo; `repoSql` lo mezcla en el repositorio completo.
import type { Centimos, ProveedorRecordado } from '@central/module-contabilidad'
import type { ReglaConcepto } from '@central/core-banca'
import type { TxSql } from './rls.ts'
import { centimosDeBd, enteroDeBd, fechaDeBd } from './importes.ts'

export type OrigenFactura = 'manual' | 'gmail' | 'ocr' | 'vertical'
export type FilaFacturaRecibida = {
  id: string; proveedorNif: string; proveedorNombre: string; numero: string; fecha: string; fechaContable: string
  base: Centimos; cuota: Centimos; retencion: Centimos; total: Centimos; origen: OrigenFactura; adjuntoRef: string | null; asientoId: string | null
}
export type NuevaFacturaRecibida = {
  proveedorNif: string; proveedorNombre: string; numero: string; numeroNorm: string; fecha: string; fechaContable: string
  base: Centimos; cuota: Centimos; retencion: Centimos; total: Centimos; lineas: unknown; origen: OrigenFactura
  mensajeId?: string | null; adjuntoRef?: string | null; hechoId: string; asientoId: string | null; creadaPor: string | null
}

export type OrigenMovimiento = 'norma43' | 'csv' | 'psd2'
export type NuevoMovimientoBanco = {
  cuentaRef: string; fecha: string; fechaValor: string; importe: Centimos; concepto: string; contraparte: string; referencia: string
  saldo: Centimos | null; origen: OrigenMovimiento; huella: string
}
export type MovimientoBancoLeido = {
  id: string; cuentaRef: string; fecha: string; fechaValor: string; importe: Centimos; concepto: string; contraparte: string; referencia: string
  origen: OrigenMovimiento
  conciliacion: { tipo: 'cobro' | 'pago' | 'regla'; documento: string | null; cuenta: string | null; metodo: 'importe_exacto' | 'regla' | 'manual'; asientoId: string | null; confirmadaEn: string } | null
}
export type NuevaConciliacion = {
  movimientoId: string; tipo: 'cobro' | 'pago' | 'regla'; documento: string | null; cuenta: string | null
  metodo: 'importe_exacto' | 'regla' | 'manual'; hechoId: string; asientoId: string | null; confirmadaPor: string | null
}
export type ReglaConciliacionLeida = ReglaConcepto & { creadaEn: string }
export type FiltroMovimientos = 'pendientes' | 'conciliados' | 'todos'

export interface RepoF3 {
  /** CNAE de la empresa (null = no se sabe). Falla si 0003 no está aplicada: llamar en transacción propia. */
  cnaeEmpresa(): Promise<string | null>
  /** Cambia CNAE y/o plantilla de la empresa (función SECURITY DEFINER de 0003). `sector` null = no tocar. */
  fijarActividad(cnae: string | null, sector: string | null): Promise<void>

  proveedor(nif: string): Promise<ProveedorRecordado | null>
  proveedoresRecientes(limite: number): Promise<ProveedorRecordado[]>
  guardarProveedor(p: ProveedorRecordado): Promise<void>
  facturaRecibidaPorClave(nif: string, numeroNorm: string): Promise<FilaFacturaRecibida | null>
  /** null = la clave (empresa, NIF, nº) o el Message-ID ya existían (otra petición se adelantó). */
  insertarFacturaRecibida(f: NuevaFacturaRecibida): Promise<string | null>
  facturasRecibidas(o: { limite: number }): Promise<FilaFacturaRecibida[]>

  /** Inserta los nuevos; los de huella ya existente se cuentan como repetidos (ON CONFLICT DO NOTHING). */
  insertarMovimientosBanco(movs: readonly NuevoMovimientoBanco[], importadoPor: string | null): Promise<{ nuevos: number; repetidos: number }>
  movimientosBanco(o: { filtro: FiltroMovimientos; limite: number }): Promise<MovimientoBancoLeido[]>
  movimientoBanco(id: string): Promise<MovimientoBancoLeido | null>
  /** null = ese movimiento ya estaba conciliado (UNIQUE por movimiento). */
  insertarConciliacion(c: NuevaConciliacion): Promise<string | null>
  reglasConciliacion(): Promise<ReglaConciliacionLeida[]>
  insertarReglaConciliacion(r: { patron: string; cuenta: string; sentido: ReglaConcepto['sentido'] }, usuarioId: string | null): Promise<string | null>
  desactivarReglaConciliacion(id: string): Promise<boolean>
}

type Fila = Record<string, unknown>
const s = (v: unknown) => (v == null ? null : String(v))
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v))

const aFactura = (f: Fila): FilaFacturaRecibida => ({
  id: String(f.id), proveedorNif: String(f.proveedor_nif), proveedorNombre: String(f.proveedor_nombre), numero: String(f.numero),
  fecha: fechaDeBd(f.fecha), fechaContable: fechaDeBd(f.fecha_contable), base: centimosDeBd(f.base_cent), cuota: centimosDeBd(f.cuota_cent),
  retencion: centimosDeBd(f.retencion_cent), total: centimosDeBd(f.total_cent), origen: f.origen as OrigenFactura, adjuntoRef: s(f.adjunto_ref), asientoId: s(f.asiento_id),
})
const aProveedor = (f: Fila): ProveedorRecordado => ({
  nif: String(f.nif), nombre: String(f.nombre), tipo: f.tipo === 'acreedor' ? 'acreedor' : 'proveedor', categoria: s(f.categoria),
  retencionPct: f.retencion_pct == null ? null : enteroDeBd(f.retencion_pct, 'retencion_pct'),
})
const aMovimiento = (f: Fila): MovimientoBancoLeido => ({
  id: String(f.id), cuentaRef: String(f.cuenta_ref), fecha: fechaDeBd(f.fecha), fechaValor: fechaDeBd(f.fecha_valor), importe: centimosDeBd(f.importe_cent),
  concepto: String(f.concepto), contraparte: String(f.contraparte), referencia: String(f.referencia), origen: f.origen as OrigenMovimiento,
  conciliacion: f.c_tipo == null ? null : {
    tipo: f.c_tipo as 'cobro' | 'pago' | 'regla', documento: s(f.c_documento), cuenta: s(f.c_cuenta), metodo: f.c_metodo as 'importe_exacto' | 'regla' | 'manual',
    asientoId: s(f.c_asiento), confirmadaEn: iso(f.c_en),
  },
})

export function repoF3Sql(tx: TxSql, empresaId: string): RepoF3 {
  const e = empresaId

  return {
    async cnaeEmpresa() {
      const f = await tx.$queryRaw<Fila[]>`SELECT cnae FROM contabilidad.empresas WHERE id = ${e}::uuid`
      return s(f[0]?.cnae)
    },

    async fijarActividad(cnae, sector) {
      await tx.$executeRaw`SELECT contabilidad.fijar_actividad(${e}::uuid, ${cnae}::text, ${sector}::text)`
    },

    async proveedor(nif) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT nif, nombre, tipo, categoria, retencion_pct FROM contabilidad.proveedores WHERE empresa_id = ${e}::uuid AND nif = ${nif}`
      return f[0] ? aProveedor(f[0]) : null
    },

    async proveedoresRecientes(limite) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT nif, nombre, tipo, categoria, retencion_pct FROM contabilidad.proveedores
         WHERE empresa_id = ${e}::uuid ORDER BY actualizado_en DESC, nif LIMIT ${limite}::int`
      return f.map(aProveedor)
    },

    async guardarProveedor(p) {
      await tx.$executeRaw`
        INSERT INTO contabilidad.proveedores (empresa_id, nif, nombre, tipo, categoria, retencion_pct)
        VALUES (${e}::uuid, ${p.nif}, ${p.nombre}, ${p.tipo}, ${p.categoria}, ${p.retencionPct}::smallint)
        ON CONFLICT (empresa_id, nif) DO UPDATE SET nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo,
          categoria = EXCLUDED.categoria, retencion_pct = EXCLUDED.retencion_pct`
    },

    async facturaRecibidaPorClave(nif, numeroNorm) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT id, proveedor_nif, proveedor_nombre, numero, fecha, fecha_contable, base_cent, cuota_cent, retencion_cent, total_cent, origen, adjunto_ref, asiento_id
          FROM contabilidad.facturas_recibidas WHERE empresa_id = ${e}::uuid AND proveedor_nif = ${nif} AND numero_norm = ${numeroNorm}`
      return f[0] ? aFactura(f[0]) : null
    },

    async insertarFacturaRecibida(x) {
      const f = await tx.$queryRaw<Fila[]>`
        INSERT INTO contabilidad.facturas_recibidas (empresa_id, proveedor_nif, proveedor_nombre, numero, numero_norm, fecha, fecha_contable,
                 base_cent, cuota_cent, retencion_cent, total_cent, lineas, origen, mensaje_id, adjunto_ref, hecho_id, asiento_id, creada_por)
        VALUES (${e}::uuid, ${x.proveedorNif}, ${x.proveedorNombre}, ${x.numero}, ${x.numeroNorm}, ${x.fecha}::date, ${x.fechaContable}::date,
                ${x.base}::bigint, ${x.cuota}::bigint, ${x.retencion}::bigint, ${x.total}::bigint, ${JSON.stringify(x.lineas)}::jsonb, ${x.origen},
                ${x.mensajeId ?? null}, ${x.adjuntoRef ?? null}, ${x.hechoId}::uuid, ${x.asientoId}::uuid, ${x.creadaPor}::uuid)
        ON CONFLICT DO NOTHING
        RETURNING id`
      return f[0] ? String(f[0].id) : null
    },

    async facturasRecibidas({ limite }) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT id, proveedor_nif, proveedor_nombre, numero, fecha, fecha_contable, base_cent, cuota_cent, retencion_cent, total_cent, origen, adjunto_ref, asiento_id
          FROM contabilidad.facturas_recibidas WHERE empresa_id = ${e}::uuid ORDER BY fecha_contable DESC, creada_en DESC, id LIMIT ${limite}::int`
      return f.map(aFactura)
    },

    async insertarMovimientosBanco(movs, importadoPor) {
      if (!movs.length) return { nuevos: 0, repetidos: 0 }
      const f = await tx.$queryRaw<Fila[]>`
        INSERT INTO contabilidad.movimientos_banco (empresa_id, cuenta_ref, fecha, fecha_valor, importe_cent, concepto, contraparte, referencia, saldo_cent, origen, huella, importado_por)
        SELECT ${e}::uuid, t.cuenta_ref, t.fecha, t.fecha_valor, t.importe, t.concepto, t.contraparte, t.referencia, t.saldo, t.origen, t.huella, ${importadoPor}::uuid
          FROM unnest(${movs.map((m) => m.cuentaRef)}::text[], ${movs.map((m) => m.fecha)}::date[], ${movs.map((m) => m.fechaValor)}::date[],
                      ${movs.map((m) => m.importe)}::bigint[], ${movs.map((m) => m.concepto)}::text[], ${movs.map((m) => m.contraparte)}::text[],
                      ${movs.map((m) => m.referencia)}::text[], ${movs.map((m) => m.saldo)}::bigint[], ${movs.map((m) => m.origen)}::text[],
                      ${movs.map((m) => m.huella)}::text[])
               AS t(cuenta_ref, fecha, fecha_valor, importe, concepto, contraparte, referencia, saldo, origen, huella)
        ON CONFLICT (empresa_id, huella) DO NOTHING
        RETURNING id`
      return { nuevos: f.length, repetidos: movs.length - f.length }
    },

    async movimientosBanco({ filtro, limite }) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT m.id, m.cuenta_ref, m.fecha, m.fecha_valor, m.importe_cent, m.concepto, m.contraparte, m.referencia, m.origen,
               c.tipo AS c_tipo, c.documento AS c_documento, c.cuenta AS c_cuenta, c.metodo AS c_metodo, c.asiento_id AS c_asiento, c.confirmada_en AS c_en
          FROM contabilidad.movimientos_banco m
          LEFT JOIN contabilidad.conciliaciones c ON c.empresa_id = m.empresa_id AND c.movimiento_id = m.id
         WHERE m.empresa_id = ${e}::uuid
           AND (${filtro} = 'todos' OR (${filtro} = 'pendientes' AND c.id IS NULL) OR (${filtro} = 'conciliados' AND c.id IS NOT NULL))
         ORDER BY m.fecha DESC, m.importado_en DESC, m.id LIMIT ${limite}::int`
      return f.map(aMovimiento)
    },

    async movimientoBanco(id) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT m.id, m.cuenta_ref, m.fecha, m.fecha_valor, m.importe_cent, m.concepto, m.contraparte, m.referencia, m.origen,
               c.tipo AS c_tipo, c.documento AS c_documento, c.cuenta AS c_cuenta, c.metodo AS c_metodo, c.asiento_id AS c_asiento, c.confirmada_en AS c_en
          FROM contabilidad.movimientos_banco m
          LEFT JOIN contabilidad.conciliaciones c ON c.empresa_id = m.empresa_id AND c.movimiento_id = m.id
         WHERE m.empresa_id = ${e}::uuid AND m.id = ${id}::uuid`
      return f[0] ? aMovimiento(f[0]) : null
    },

    async insertarConciliacion(c) {
      const f = await tx.$queryRaw<Fila[]>`
        INSERT INTO contabilidad.conciliaciones (empresa_id, movimiento_id, tipo, documento, cuenta, metodo, hecho_id, asiento_id, confirmada_por)
        VALUES (${e}::uuid, ${c.movimientoId}::uuid, ${c.tipo}, ${c.documento}, ${c.cuenta}, ${c.metodo}, ${c.hechoId}::uuid, ${c.asientoId}::uuid, ${c.confirmadaPor}::uuid)
        ON CONFLICT (empresa_id, movimiento_id) DO NOTHING
        RETURNING id`
      return f[0] ? String(f[0].id) : null
    },

    async reglasConciliacion() {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT id, patron, cuenta, sentido, creada_en FROM contabilidad.reglas_conciliacion
         WHERE empresa_id = ${e}::uuid AND activa ORDER BY creada_en, id`
      return f.map((x) => ({ id: String(x.id), patron: String(x.patron), cuenta: String(x.cuenta), sentido: x.sentido as ReglaConcepto['sentido'], creadaEn: iso(x.creada_en) }))
    },

    async insertarReglaConciliacion(r, usuarioId) {
      const f = await tx.$queryRaw<Fila[]>`
        INSERT INTO contabilidad.reglas_conciliacion (empresa_id, patron, cuenta, sentido, creada_por)
        VALUES (${e}::uuid, ${r.patron}, ${r.cuenta}, ${r.sentido}, ${usuarioId}::uuid)
        ON CONFLICT DO NOTHING
        RETURNING id`
      return f[0] ? String(f[0].id) : null
    },

    async desactivarReglaConciliacion(id) {
      const n = await tx.$executeRaw`
        UPDATE contabilidad.reglas_conciliacion SET activa = false WHERE empresa_id = ${e}::uuid AND id = ${id}::uuid AND activa`
      return n === 1
    },
  }
}
