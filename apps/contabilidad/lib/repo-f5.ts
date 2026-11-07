// Repositorio de la FASE 5 (cierre, inmovilizado, periodificaciones) de UNA empresa. Mismas reglas que repo.ts / repo-f3.ts / repo-f4.ts:
//   · se construye SOLO dentro de `conEmpresa` (RLS) y TODA consulta filtra además por `empresa_id` explícito;
//   · SQL parametrizado con plantilla, nunca concatenación; importes en céntimos (bigint);
//   · tablas de 0005: `activos_fijos` solo admite el UPDATE de la baja; `amortizacion_tabla`, `periodificaciones` y `cierres_ejercicio` solo se
//     añaden; `ejercicios` solo cambia `estado` (y solo a `cerrado`, definitivo). Aquí no hay DELETE ni UPDATE de asientos/apuntes.
// Va APARTE de `repoSql` a propósito: lee tablas de 0005 que pueden no existir todavía; cada llamada de la app lo abre en su propia transacción
// y tolera el fallo.
import type { Asiento, FichaActivo, FilaTablaAmortizacion, Periodificacion, SaldoCuenta } from '@central/module-contabilidad'
import type { TxSql } from './rls.ts'
import { centimosDeBd, enteroDeBd, fechaDeBd } from './importes.ts'
import type { FilaEjercicio } from './repo.ts'

type Fila = Record<string, unknown>
const s = (v: unknown) => (v == null ? null : String(v))

export const LIMITE_ASIENTOS_LIBRO = 50_000

export type FilaActivo = FichaActivo & {
  id: string
  estado: 'activo' | 'baja'
  precioVenta: number | null
  resultadoBaja: number | null
  asientoAltaId: string | null
  asientoBajaId: string | null
}
export type NuevoActivo = { ficha: FichaActivo; usuarioId: string | null; asientoAltaId: string | null }
export type BajaActivo = { fecha: string; precioVenta: number | null; resultado: number; asientoId: string }
export type FilaCierre = {
  anio: number; resultado: number; asientoRegularizacionId: string | null; asientoCierreId: string | null; asientoAperturaId: string | null; cerradoEn: string
}
export type NuevoCierre = Omit<FilaCierre, 'cerradoEn'> & { usuarioId: string | null }
export type TablaVigente = { version: number; filas: FilaTablaAmortizacion[] }

export interface RepoF5 {
  /** Bloquea la fila del ejercicio hasta el COMMIT (serializa cierres/amortizaciones concurrentes). */
  ejercicioBloqueado(anio: number): Promise<FilaEjercicio | null>
  /** UPDATE estado = 'cerrado' (definitivo). false = no estaba abierto. La BD exige el registro de cierre y las cuentas 6/7 a cero. */
  cerrarEjercicio(anio: number): Promise<boolean>
  /** Σ por cuenta del ejercicio (exacto, sin tope). `sinCierre` excluye regularización y cierre (para balance y PyG). */
  saldosEjercicio(anio: number, o: { sinCierre: boolean }): Promise<SaldoCuenta[]>
  /** Asientos del ejercicio con apuntes y origen (libros). `truncado` = hay más de `limite`: el libro estaría incompleto. */
  asientosEjercicio(anio: number, limite: number): Promise<{ asientos: Asiento[]; truncado: boolean }>
  asientoPorOrigen(tipo: string, ref: string): Promise<{ id: string; numero: number } | null>
  cierre(anio: number): Promise<FilaCierre | null>
  cierres(): Promise<FilaCierre[]>
  insertarCierre(c: NuevoCierre): Promise<void>
  activos(): Promise<FilaActivo[]>
  activoPorRef(ref: string): Promise<FilaActivo | null>
  activoPorOrigen(origen: string, refExterna: string): Promise<FilaActivo | null>
  /** INSERT … ON CONFLICT DO NOTHING: null = ya existía (origen, refExterna) o la ref. */
  insertarActivo(a: NuevoActivo): Promise<string | null>
  /** Única transición: activo → baja. false = ya estaba de baja. */
  darDeBajaActivo(ref: string, b: BajaActivo): Promise<boolean>
  tablaAmortizacion(): Promise<TablaVigente | null>
  /** Nueva VERSIÓN de la tabla (las anteriores no se tocan). Devuelve el nº de versión. */
  guardarTablaAmortizacion(filas: readonly FilaTablaAmortizacion[], usuarioId: string | null): Promise<number>
  periodificaciones(): Promise<Periodificacion[]>
  /** false = ya existía esa referencia. */
  insertarPeriodificacion(p: Periodificacion, usuarioId: string | null): Promise<boolean>
}

const aActivo = (f: Fila): FilaActivo => ({
  id: String(f.id), ref: String(f.ref), origen: String(f.origen), refExterna: String(f.ref_externa), descripcion: String(f.descripcion), categoria: String(f.categoria),
  cuentaActivo: String(f.cuenta_activo), cuentaAmortizacionAcumulada: String(f.cuenta_amort_acum), cuentaGasto: String(f.cuenta_gasto),
  fechaAlta: fechaDeBd(f.fecha_alta), valorAdquisicion: centimosDeBd(f.valor_cent, 'valor'), valorResidual: centimosDeBd(f.residual_cent, 'residual'),
  porcentajePb: enteroDeBd(f.porcentaje_pb, 'porcentaje'), metodo: 'lineal', yaContabilizado: f.ya_contabilizado === true,
  fechaBaja: f.fecha_baja == null ? null : fechaDeBd(f.fecha_baja), estado: f.estado === 'baja' ? 'baja' : 'activo',
  precioVenta: f.precio_venta_cent == null ? null : centimosDeBd(f.precio_venta_cent, 'precio'),
  resultadoBaja: f.resultado_baja_cent == null ? null : centimosDeBd(f.resultado_baja_cent, 'resultado'),
  asientoAltaId: s(f.asiento_alta_id), asientoBajaId: s(f.asiento_baja_id),
})

const aCierre = (f: Fila): FilaCierre => ({
  anio: enteroDeBd(f.anio, 'anio'), resultado: centimosDeBd(f.resultado_cent, 'resultado'), asientoRegularizacionId: s(f.asiento_regularizacion_id),
  asientoCierreId: s(f.asiento_cierre_id), asientoAperturaId: s(f.asiento_apertura_id),
  cerradoEn: f.cerrado_en instanceof Date ? f.cerrado_en.toISOString() : String(f.cerrado_en ?? ''),
})

export function repoF5Sql(tx: TxSql, empresaId: string): RepoF5 {
  const e = empresaId
  return {
    async ejercicioBloqueado(anio) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT anio, inicio, fin, estado FROM contabilidad.ejercicios WHERE empresa_id = ${e}::uuid AND anio = ${anio}::int FOR UPDATE`
      return f[0] ? { anio: enteroDeBd(f[0].anio, 'anio'), inicio: fechaDeBd(f[0].inicio), fin: fechaDeBd(f[0].fin), estado: f[0].estado as FilaEjercicio['estado'] } : null
    },

    async cerrarEjercicio(anio) {
      const n = await tx.$executeRaw`
        UPDATE contabilidad.ejercicios SET estado = 'cerrado' WHERE empresa_id = ${e}::uuid AND anio = ${anio}::int AND estado = 'abierto'`
      return n === 1
    },

    async saldosEjercicio(anio, { sinCierre }) {
      const f = sinCierre
        ? await tx.$queryRaw<Fila[]>`
            SELECT p.cuenta, sum(p.debe)::bigint AS debe, sum(p.haber)::bigint AS haber
              FROM contabilidad.apuntes p JOIN contabilidad.asientos a ON a.empresa_id = p.empresa_id AND a.id = p.asiento_id
             WHERE p.empresa_id = ${e}::uuid AND a.empresa_id = ${e}::uuid AND a.ejercicio = ${anio}::int
               AND NOT (a.origen = 'cierre' AND (a.origen_ref LIKE 'regularizacion:%' OR a.origen_ref LIKE 'cierre:%'))
             GROUP BY p.cuenta ORDER BY p.cuenta`
        : await tx.$queryRaw<Fila[]>`
            SELECT p.cuenta, sum(p.debe)::bigint AS debe, sum(p.haber)::bigint AS haber
              FROM contabilidad.apuntes p JOIN contabilidad.asientos a ON a.empresa_id = p.empresa_id AND a.id = p.asiento_id
             WHERE p.empresa_id = ${e}::uuid AND a.empresa_id = ${e}::uuid AND a.ejercicio = ${anio}::int
             GROUP BY p.cuenta ORDER BY p.cuenta`
      return f.map((x) => ({ cuenta: String(x.cuenta), debe: centimosDeBd(x.debe, 'debe'), haber: centimosDeBd(x.haber, 'haber') }))
    },

    async asientosEjercicio(anio, limite) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT a.id, a.numero, a.ejercicio, a.fecha, a.concepto, a.origen_tipo, a.origen_ref
          FROM contabilidad.asientos a
         WHERE a.empresa_id = ${e}::uuid AND a.ejercicio = ${anio}::int
         ORDER BY a.fecha, a.numero LIMIT ${limite + 1}::int`
      const visibles = f.slice(0, limite)
      const ids = visibles.map((x) => String(x.id))
      const ap = ids.length
        ? await tx.$queryRaw<Fila[]>`
            SELECT asiento_id, orden, cuenta, debe, haber, documento FROM contabilidad.apuntes
             WHERE empresa_id = ${e}::uuid AND asiento_id = ANY(${ids}::uuid[]) ORDER BY asiento_id, orden`
        : []
      const por = new Map<string, Asiento['apuntes'][number][]>()
      for (const p of ap) {
        const k = String(p.asiento_id)
        por.set(k, [...(por.get(k) ?? []), { cuenta: String(p.cuenta), debe: centimosDeBd(p.debe, 'debe'), haber: centimosDeBd(p.haber, 'haber'), ...(p.documento != null ? { documento: String(p.documento) } : {}) }])
      }
      return {
        truncado: f.length > limite,
        asientos: visibles.map((x): Asiento => ({
          numero: enteroDeBd(x.numero, 'numero'), fecha: fechaDeBd(x.fecha), ejercicio: enteroDeBd(x.ejercicio, 'ejercicio'), concepto: String(x.concepto),
          apuntes: por.get(String(x.id)) ?? [],
          ...(x.origen_tipo != null && x.origen_ref != null ? { origen: { tipo: String(x.origen_tipo) as never, ref: String(x.origen_ref) } } : {}),
        })),
      }
    },

    async asientoPorOrigen(tipo, ref) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT a.id, a.numero FROM contabilidad.asientos a
         WHERE a.empresa_id = ${e}::uuid AND a.origen_tipo = ${tipo} AND a.origen_ref = ${ref}
           AND NOT EXISTS (SELECT 1 FROM contabilidad.asientos r WHERE r.empresa_id = a.empresa_id AND r.reversa_de = a.id)
         ORDER BY a.numero LIMIT 1`
      return f[0] ? { id: String(f[0].id), numero: enteroDeBd(f[0].numero, 'numero') } : null
    },

    async cierre(anio) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT anio, resultado_cent, asiento_regularizacion_id, asiento_cierre_id, asiento_apertura_id, cerrado_en
          FROM contabilidad.cierres_ejercicio WHERE empresa_id = ${e}::uuid AND anio = ${anio}::int`
      return f[0] ? aCierre(f[0]) : null
    },

    async cierres() {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT anio, resultado_cent, asiento_regularizacion_id, asiento_cierre_id, asiento_apertura_id, cerrado_en
          FROM contabilidad.cierres_ejercicio WHERE empresa_id = ${e}::uuid ORDER BY anio DESC`
      return f.map(aCierre)
    },

    async insertarCierre(c) {
      await tx.$executeRaw`
        INSERT INTO contabilidad.cierres_ejercicio (empresa_id, anio, resultado_cent, asiento_regularizacion_id, asiento_cierre_id, asiento_apertura_id, cerrado_por)
        VALUES (${e}::uuid, ${c.anio}::int, ${c.resultado}::bigint, ${c.asientoRegularizacionId}::uuid, ${c.asientoCierreId}::uuid, ${c.asientoAperturaId}::uuid, ${c.usuarioId}::uuid)`
    },

    async activos() {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT id, ref, origen, ref_externa, descripcion, categoria, cuenta_activo, cuenta_amort_acum, cuenta_gasto, fecha_alta, valor_cent, residual_cent,
               porcentaje_pb, metodo, ya_contabilizado, asiento_alta_id, estado, fecha_baja, precio_venta_cent, resultado_baja_cent, asiento_baja_id
          FROM contabilidad.activos_fijos WHERE empresa_id = ${e}::uuid ORDER BY fecha_alta, ref`
      return f.map(aActivo)
    },

    async activoPorRef(ref) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT id, ref, origen, ref_externa, descripcion, categoria, cuenta_activo, cuenta_amort_acum, cuenta_gasto, fecha_alta, valor_cent, residual_cent,
               porcentaje_pb, metodo, ya_contabilizado, asiento_alta_id, estado, fecha_baja, precio_venta_cent, resultado_baja_cent, asiento_baja_id
          FROM contabilidad.activos_fijos WHERE empresa_id = ${e}::uuid AND ref = ${ref}`
      return f[0] ? aActivo(f[0]) : null
    },

    async activoPorOrigen(origen, refExterna) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT id, ref, origen, ref_externa, descripcion, categoria, cuenta_activo, cuenta_amort_acum, cuenta_gasto, fecha_alta, valor_cent, residual_cent,
               porcentaje_pb, metodo, ya_contabilizado, asiento_alta_id, estado, fecha_baja, precio_venta_cent, resultado_baja_cent, asiento_baja_id
          FROM contabilidad.activos_fijos WHERE empresa_id = ${e}::uuid AND origen = ${origen} AND ref_externa = ${refExterna}`
      return f[0] ? aActivo(f[0]) : null
    },

    async insertarActivo({ ficha: a, usuarioId, asientoAltaId }) {
      const f = await tx.$queryRaw<Fila[]>`
        INSERT INTO contabilidad.activos_fijos (empresa_id, ref, origen, ref_externa, descripcion, categoria, cuenta_activo, cuenta_amort_acum, cuenta_gasto,
                                                fecha_alta, valor_cent, residual_cent, porcentaje_pb, metodo, ya_contabilizado, asiento_alta_id, creado_por)
        VALUES (${e}::uuid, ${a.ref}, ${a.origen}, ${a.refExterna}, ${a.descripcion}, ${a.categoria}, ${a.cuentaActivo}, ${a.cuentaAmortizacionAcumulada}, ${a.cuentaGasto},
                ${a.fechaAlta}::date, ${a.valorAdquisicion}::bigint, ${a.valorResidual}::bigint, ${a.porcentajePb}::int, 'lineal', ${a.yaContabilizado}::boolean,
                ${asientoAltaId}::uuid, ${usuarioId}::uuid)
        ON CONFLICT DO NOTHING RETURNING id`
      return f[0] ? String(f[0].id) : null
    },

    async darDeBajaActivo(ref, b) {
      const n = await tx.$executeRaw`
        UPDATE contabilidad.activos_fijos
           SET estado = 'baja', fecha_baja = ${b.fecha}::date, precio_venta_cent = ${b.precioVenta}::bigint, resultado_baja_cent = ${b.resultado}::bigint,
               asiento_baja_id = ${b.asientoId}::uuid
         WHERE empresa_id = ${e}::uuid AND ref = ${ref} AND estado = 'activo'`
      return n === 1
    },

    async tablaAmortizacion() {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT version, categoria, descripcion, cuenta_activo, cuenta_amort_acum, cuenta_gasto, porcentaje_max_pb, periodo_max_anios
          FROM contabilidad.amortizacion_tabla
         WHERE empresa_id = ${e}::uuid
           AND version = (SELECT max(version) FROM contabilidad.amortizacion_tabla WHERE empresa_id = ${e}::uuid)
         ORDER BY categoria`
      if (!f.length) return null
      return {
        version: enteroDeBd(f[0].version, 'version'),
        filas: f.map((x): FilaTablaAmortizacion => ({
          categoria: String(x.categoria), descripcion: String(x.descripcion), cuentaActivo: String(x.cuenta_activo), cuentaAmortizacionAcumulada: String(x.cuenta_amort_acum),
          cuentaGasto: String(x.cuenta_gasto), porcentajeMaximoPb: enteroDeBd(x.porcentaje_max_pb, 'porcentaje'), periodoMaximoAnios: enteroDeBd(x.periodo_max_anios, 'periodo'),
          // Lo que edita la empresa es suyo: no se garantiza contraste con el reglamento.
          certeza: 'media',
        })),
      }
    },

    async guardarTablaAmortizacion(filas, usuarioId) {
      const v = await tx.$queryRaw<Fila[]>`
        SELECT coalesce(max(version), 0)::int + 1 AS siguiente FROM contabilidad.amortizacion_tabla WHERE empresa_id = ${e}::uuid`
      const version = enteroDeBd(v[0]?.siguiente, 'version')
      for (const x of filas) {
        await tx.$executeRaw`
          INSERT INTO contabilidad.amortizacion_tabla (empresa_id, version, categoria, descripcion, cuenta_activo, cuenta_amort_acum, cuenta_gasto, porcentaje_max_pb, periodo_max_anios, creado_por)
          VALUES (${e}::uuid, ${version}::int, ${x.categoria}, ${x.descripcion}, ${x.cuentaActivo}, ${x.cuentaAmortizacionAcumulada}, ${x.cuentaGasto},
                  ${x.porcentajeMaximoPb}::int, ${x.periodoMaximoAnios}::int, ${usuarioId}::uuid)`
      }
      return version
    },

    async periodificaciones() {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT ref, tipo, descripcion, cuenta_origen, importe_cent, inicio, fin FROM contabilidad.periodificaciones
         WHERE empresa_id = ${e}::uuid ORDER BY inicio, ref`
      return f.map((x): Periodificacion => ({
        ref: String(x.ref), tipo: x.tipo === 'ingreso' ? 'ingreso' : 'gasto', descripcion: String(x.descripcion), cuentaOrigen: String(x.cuenta_origen),
        importe: centimosDeBd(x.importe_cent, 'importe'), inicio: fechaDeBd(x.inicio), fin: fechaDeBd(x.fin),
      }))
    },

    async insertarPeriodificacion(p, usuarioId) {
      const f = await tx.$queryRaw<Fila[]>`
        INSERT INTO contabilidad.periodificaciones (empresa_id, ref, tipo, descripcion, cuenta_origen, importe_cent, inicio, fin, creado_por)
        VALUES (${e}::uuid, ${p.ref}, ${p.tipo}, ${p.descripcion}, ${p.cuentaOrigen}, ${p.importe}::bigint, ${p.inicio}::date, ${p.fin}::date, ${usuarioId}::uuid)
        ON CONFLICT DO NOTHING RETURNING id`
      return f.length === 1
    },
  }
}
