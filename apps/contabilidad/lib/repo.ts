// Repositorio de la contabilidad de UNA empresa. Interfaz + implementación SQL (Postgres, schema `contabilidad`).
//
// 🚨 Aislamiento (dos capas, las dos obligatorias):
//   1. Se construye SOLO dentro de `conEmpresa(empresaId, tx => repoSql(tx, empresaId))`: RLS forzado por empresa.
//   2. Además, TODA consulta filtra por `empresa_id = ${empresaId}` explícito (si alguien llegara a usar un cliente sin RLS, el
//      filtro sigue ahí). Lo vigila test/aislamiento.test.ts sobre cada método.
// Solo-añadir: aquí NO hay ningún UPDATE/DELETE de asientos ni apuntes (lo vigila test/inmutabilidad.test.ts); un hecho solo
// avanza de estado. SQL siempre con plantilla parametrizada (nunca concatenación).
import type { Centimos } from '@central/module-contabilidad'
import type { TxSql } from './rls.ts'
import type { TipoHecho } from './hecho-entrada.ts'
import { centimosDeBd, enteroDeBd, fechaDeBd } from './importes.ts'

export type FilaCuenta = { codigo: string; nombre: string; grupo: number; naturaleza: 'deudora' | 'acreedora'; admiteApuntes: boolean; activa: boolean }
export type EstadoEjercicio = 'abierto' | 'en_cierre' | 'cerrado'
export type FilaEjercicio = { anio: number; inicio: string; fin: string; estado: EstadoEjercicio }
export type ApunteLeido = { orden: number; cuenta: string; debe: Centimos; haber: Centimos; documento: string | null }
export type OrigenAsientoBd = 'manual' | 'hecho' | 'rectificacion' | 'apertura' | 'cierre'
export type AsientoLeido = {
  id: string; numero: number; ejercicio: number; fecha: string; concepto: string; origen: OrigenAsientoBd
  reversaDe: string | null; rectificadoPor: string | null; apuntes: ApunteLeido[]
}
export type LineaMayorLeida = { fecha: string; numero: number; concepto: string; cuenta: string; debe: Centimos; haber: Centimos; saldo: Centimos; documento: string | null }
export type EstadoHecho = 'asentado' | 'pendiente_de_regla' | 'rechazado'
export type FilaHecho = { id: string; estado: EstadoHecho; motivo: string | null; asientoId: string | null; huella: string }
export type SumaCuenta = { cuenta: string; debe: Centimos; haber: Centimos; n: number }

export type NuevoAsiento = {
  ejercicio: number; numero: number; fecha: string; concepto: string; origen: OrigenAsientoBd
  origenTipo?: string; origenRef?: string; hechoId?: string; reversaDe?: string; hash: string; creadoPor?: string | null
  apuntes: readonly { cuenta: string; debe: Centimos; haber: Centimos; documento?: string }[]
}
export type NuevoHecho = { app: string; tipo: TipoHecho; ref: string; fecha: string; payload: unknown; huella: string }
export type Actor = 'usuario' | 'operador' | `puerto:${string}`
export type EntradaAuditoria = { actor: Actor; usuarioId?: string | null; accion: string; entidad: string; entidadId?: string | null; detalle?: unknown }

export type FilaEmpresa = { razonSocial: string; nif: string; forma: string; sector: string; logoUrl: string | null; colorPrimario: string | null }

export interface RepoContable {
  readonly empresaId: string
  empresa(): Promise<FilaEmpresa | null>
  planCuentas(): Promise<FilaCuenta[]>
  ejercicio(anio: number): Promise<FilaEjercicio | null>
  ejercicios(): Promise<FilaEjercicio[]>
  /** Siguiente número correlativo del ejercicio (bloquea la fila del ejercicio hasta el COMMIT). */
  reservarNumero(anio: number): Promise<number>
  insertarAsiento(a: NuevoAsiento): Promise<string>
  asiento(id: string): Promise<AsientoLeido | null>
  /** Diario, del más reciente al más antiguo. `hayMas` = quedan asientos por ver («Ver más»). */
  diario(o: { limite: number; ejercicio?: number }): Promise<{ asientos: AsientoLeido[]; hayMas: boolean }>
  /** Mayor de una cuenta (y sus subcuentas) en un ejercicio: últimas `limite` líneas con saldo acumulado real. */
  mayor(cuenta: string, o: { limite: number; ejercicio: number }): Promise<{ lineas: LineaMayorLeida[]; hayMas: boolean; totalDebe: Centimos; totalHaber: Centimos; n: number }>
  hechoPorClave(app: string, tipo: TipoHecho, ref: string): Promise<FilaHecho | null>
  /** INSERT … ON CONFLICT DO NOTHING: null = ya existía (otra petición lo registró). Nace en la bandeja ('en proceso'). */
  insertarHecho(h: NuevoHecho): Promise<string | null>
  cerrarHecho(id: string, estado: EstadoHecho, motivo: string | null, asientoId: string | null): Promise<void>
  /** Última versión de las reglas de la empresa por tipo de hecho (parciales sobre REGLAS_PGC). */
  reglasVigentes(): Promise<Partial<Record<TipoHecho, Record<string, string>>>>
  origenAutorizado(app: string): Promise<boolean>
  /** Σ debe / Σ haber / nº de apuntes por cuenta con fecha en [desde, hasta] (sin `desde` = desde el principio). */
  sumasPorCuenta(o: { desde?: string; hasta: string }): Promise<SumaCuenta[]>
  auditar(a: EntradaAuditoria): Promise<void>
  // ── Alta (operador) ──
  contarCuentas(): Promise<number>
  sembrarPlan(filas: readonly FilaCuenta[]): Promise<void>
  crearEjercicio(e: FilaEjercicio): Promise<boolean>
  vinculos(): Promise<{ usuarioId: string; rol: 'dueno' | 'gestor'; activo: boolean }[]>
  vincular(usuarioId: string, rol: 'dueno' | 'gestor'): Promise<void>
  autorizarOrigen(app: string): Promise<void>
}

type Fila = Record<string, unknown>
const s = (v: unknown) => (v == null ? null : String(v))

function aAsiento(f: Fila, apuntes: ApunteLeido[]): AsientoLeido {
  return {
    id: String(f.id), numero: enteroDeBd(f.numero, 'numero'), ejercicio: enteroDeBd(f.ejercicio, 'ejercicio'),
    fecha: fechaDeBd(f.fecha), concepto: String(f.concepto), origen: f.origen as OrigenAsientoBd,
    reversaDe: s(f.reversa_de), rectificadoPor: s(f.rectificado_por), apuntes,
  }
}
const aApunte = (f: Fila): ApunteLeido => ({
  orden: enteroDeBd(f.orden, 'orden'), cuenta: String(f.cuenta), debe: centimosDeBd(f.debe, 'debe'),
  haber: centimosDeBd(f.haber, 'haber'), documento: s(f.documento),
})
const aEjercicio = (f: Fila): FilaEjercicio => ({
  anio: enteroDeBd(f.anio, 'anio'), inicio: fechaDeBd(f.inicio), fin: fechaDeBd(f.fin), estado: f.estado as EstadoEjercicio,
})

export function repoSql(tx: TxSql, empresaId: string): RepoContable {
  const e = empresaId

  async function apuntesDe(ids: string[]): Promise<Map<string, ApunteLeido[]>> {
    const m = new Map<string, ApunteLeido[]>()
    if (!ids.length) return m
    const filas = await tx.$queryRaw<Fila[]>`
      SELECT asiento_id, orden, cuenta, debe, haber, documento FROM contabilidad.apuntes
       WHERE empresa_id = ${e}::uuid AND asiento_id = ANY(${ids}::uuid[]) ORDER BY asiento_id, orden`
    for (const f of filas) {
      const k = String(f.asiento_id)
      m.set(k, [...(m.get(k) ?? []), aApunte(f)])
    }
    return m
  }

  return {
    empresaId: e,

    async empresa() {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT razon_social, nif, forma, sector, logo_url, color_primario FROM contabilidad.empresas WHERE id = ${e}::uuid`
      return f[0]
        ? { razonSocial: String(f[0].razon_social), nif: String(f[0].nif), forma: String(f[0].forma), sector: String(f[0].sector), logoUrl: s(f[0].logo_url), colorPrimario: s(f[0].color_primario) }
        : null
    },

    async planCuentas() {
      const filas = await tx.$queryRaw<Fila[]>`
        SELECT codigo, nombre, grupo, naturaleza, admite_apuntes, activa FROM contabilidad.plan_cuentas
         WHERE empresa_id = ${e}::uuid ORDER BY codigo`
      return filas.map((f) => ({
        codigo: String(f.codigo), nombre: String(f.nombre), grupo: enteroDeBd(f.grupo, 'grupo'),
        naturaleza: f.naturaleza as FilaCuenta['naturaleza'], admiteApuntes: f.admite_apuntes === true, activa: f.activa === true,
      }))
    },

    async ejercicio(anio) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT anio, inicio, fin, estado FROM contabilidad.ejercicios WHERE empresa_id = ${e}::uuid AND anio = ${anio}::int`
      return f[0] ? aEjercicio(f[0]) : null
    },

    async ejercicios() {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT anio, inicio, fin, estado FROM contabilidad.ejercicios WHERE empresa_id = ${e}::uuid ORDER BY anio DESC`
      return f.map(aEjercicio)
    },

    async reservarNumero(anio) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT ultimo_numero FROM contabilidad.ejercicios WHERE empresa_id = ${e}::uuid AND anio = ${anio}::int FOR UPDATE`
      if (!f[0]) throw new Error(`no existe el ejercicio ${anio}`)
      const n = enteroDeBd(f[0].ultimo_numero, 'ultimo_numero') + 1
      await tx.$executeRaw`
        UPDATE contabilidad.ejercicios SET ultimo_numero = ${n}::int WHERE empresa_id = ${e}::uuid AND anio = ${anio}::int`
      return n
    },

    async insertarAsiento(a) {
      const f = await tx.$queryRaw<Fila[]>`
        INSERT INTO contabilidad.asientos (empresa_id, ejercicio, numero, fecha, concepto, origen, origen_tipo, origen_ref,
                                           hecho_id, reversa_de, hash, creado_por)
        VALUES (${e}::uuid, ${a.ejercicio}::int, ${a.numero}::int, ${a.fecha}::date, ${a.concepto}, ${a.origen},
                ${a.origenTipo ?? null}, ${a.origenRef ?? null}, ${a.hechoId ?? null}::uuid, ${a.reversaDe ?? null}::uuid,
                ${a.hash}, ${a.creadoPor ?? null}::uuid)
        RETURNING id`
      const id = String(f[0].id)
      let orden = 0
      for (const p of a.apuntes) {
        orden += 1
        await tx.$executeRaw`
          INSERT INTO contabilidad.apuntes (empresa_id, asiento_id, orden, cuenta, debe, haber, documento)
          VALUES (${e}::uuid, ${id}::uuid, ${orden}::smallint, ${p.cuenta}, ${p.debe}::bigint, ${p.haber}::bigint, ${p.documento ?? null})`
      }
      return id
    },

    async asiento(id) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT a.id, a.numero, a.ejercicio, a.fecha, a.concepto, a.origen, a.reversa_de, r.id AS rectificado_por
          FROM contabilidad.asientos a
          LEFT JOIN contabilidad.asientos r ON r.empresa_id = a.empresa_id AND r.reversa_de = a.id
         WHERE a.empresa_id = ${e}::uuid AND a.id = ${id}::uuid`
      if (!f[0]) return null
      return aAsiento(f[0], (await apuntesDe([id])).get(id) ?? [])
    },

    async diario({ limite, ejercicio }) {
      const f = ejercicio === undefined
        ? await tx.$queryRaw<Fila[]>`
            SELECT a.id, a.numero, a.ejercicio, a.fecha, a.concepto, a.origen, a.reversa_de, r.id AS rectificado_por
              FROM contabilidad.asientos a
              LEFT JOIN contabilidad.asientos r ON r.empresa_id = a.empresa_id AND r.reversa_de = a.id
             WHERE a.empresa_id = ${e}::uuid
             ORDER BY a.fecha DESC, a.numero DESC LIMIT ${limite + 1}::int`
        : await tx.$queryRaw<Fila[]>`
            SELECT a.id, a.numero, a.ejercicio, a.fecha, a.concepto, a.origen, a.reversa_de, r.id AS rectificado_por
              FROM contabilidad.asientos a
              LEFT JOIN contabilidad.asientos r ON r.empresa_id = a.empresa_id AND r.reversa_de = a.id
             WHERE a.empresa_id = ${e}::uuid AND a.ejercicio = ${ejercicio}::int
             ORDER BY a.fecha DESC, a.numero DESC LIMIT ${limite + 1}::int`
      const visibles = f.slice(0, limite)
      const ap = await apuntesDe(visibles.map((x) => String(x.id)))
      return { asientos: visibles.map((x) => aAsiento(x, ap.get(String(x.id)) ?? [])), hayMas: f.length > limite }
    },

    async mayor(cuenta, { limite, ejercicio }) {
      if (!/^[1-9][0-9]{0,11}$/.test(cuenta)) throw new Error('cuenta no válida')
      const prefijo = `${cuenta}%`
      const lineas = await tx.$queryRaw<Fila[]>`
        SELECT * FROM (
          SELECT a.fecha, a.numero, a.concepto, p.cuenta, p.debe, p.haber, p.documento, p.orden,
                 sum(p.debe - p.haber) OVER (ORDER BY a.fecha, a.numero, p.orden ROWS UNBOUNDED PRECEDING) AS saldo
            FROM contabilidad.apuntes p
            JOIN contabilidad.asientos a ON a.empresa_id = p.empresa_id AND a.id = p.asiento_id
           WHERE p.empresa_id = ${e}::uuid AND a.empresa_id = ${e}::uuid AND a.ejercicio = ${ejercicio}::int
             AND p.cuenta LIKE ${prefijo}
        ) t ORDER BY fecha DESC, numero DESC, orden DESC LIMIT ${limite + 1}::int`
      const tot = await tx.$queryRaw<Fila[]>`
        SELECT coalesce(sum(p.debe), 0)::bigint AS debe, coalesce(sum(p.haber), 0)::bigint AS haber, count(*)::int AS n
          FROM contabilidad.apuntes p
          JOIN contabilidad.asientos a ON a.empresa_id = p.empresa_id AND a.id = p.asiento_id
         WHERE p.empresa_id = ${e}::uuid AND a.empresa_id = ${e}::uuid AND a.ejercicio = ${ejercicio}::int
           AND p.cuenta LIKE ${prefijo}`
      return {
        lineas: lineas.slice(0, limite).map((x) => ({
          fecha: fechaDeBd(x.fecha), numero: enteroDeBd(x.numero, 'numero'), concepto: String(x.concepto), cuenta: String(x.cuenta),
          debe: centimosDeBd(x.debe, 'debe'), haber: centimosDeBd(x.haber, 'haber'), saldo: centimosDeBd(x.saldo, 'saldo'), documento: s(x.documento),
        })),
        hayMas: lineas.length > limite,
        totalDebe: centimosDeBd(tot[0]?.debe ?? 0, 'total debe'),
        totalHaber: centimosDeBd(tot[0]?.haber ?? 0, 'total haber'),
        n: enteroDeBd(tot[0]?.n ?? 0, 'n'),
      }
    },

    async hechoPorClave(app, tipo, ref) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT id, estado, motivo, asiento_id, huella FROM contabilidad.hechos_contables
         WHERE empresa_id = ${e}::uuid AND origen_app = ${app} AND tipo = ${tipo} AND ref = ${ref}`
      return f[0]
        ? { id: String(f[0].id), estado: f[0].estado as EstadoHecho, motivo: s(f[0].motivo), asientoId: s(f[0].asiento_id), huella: String(f[0].huella) }
        : null
    },

    async insertarHecho(h) {
      const f = await tx.$queryRaw<Fila[]>`
        INSERT INTO contabilidad.hechos_contables (empresa_id, origen_app, tipo, ref, fecha, payload, huella, estado, motivo)
        VALUES (${e}::uuid, ${h.app}, ${h.tipo}, ${h.ref}, ${h.fecha}::date, ${JSON.stringify(h.payload)}::jsonb, ${h.huella},
                'pendiente_de_regla', 'en proceso')
        ON CONFLICT (empresa_id, origen_app, tipo, ref) DO NOTHING
        RETURNING id`
      return f[0] ? String(f[0].id) : null
    },

    async cerrarHecho(id, estado, motivo, asientoId) {
      await tx.$executeRaw`
        UPDATE contabilidad.hechos_contables SET estado = ${estado}, motivo = ${motivo}, asiento_id = ${asientoId}::uuid
         WHERE empresa_id = ${e}::uuid AND id = ${id}::uuid`
    },

    async reglasVigentes() {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT DISTINCT ON (tipo_hecho) tipo_hecho, cuentas FROM contabilidad.reglas_asiento
         WHERE empresa_id = ${e}::uuid ORDER BY tipo_hecho, version DESC`
      const r: Partial<Record<TipoHecho, Record<string, string>>> = {}
      for (const x of f) {
        const c = x.cuentas as Record<string, unknown>
        r[x.tipo_hecho as TipoHecho] = Object.fromEntries(Object.entries(c ?? {}).filter(([, v]) => typeof v === 'string')) as Record<string, string>
      }
      return r
    },

    async origenAutorizado(app) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT 1 AS ok FROM contabilidad.origenes_autorizados WHERE empresa_id = ${e}::uuid AND app = ${app} AND activo`
      return f.length > 0
    },

    async sumasPorCuenta({ desde, hasta }) {
      const f = desde === undefined
        ? await tx.$queryRaw<Fila[]>`
            SELECT p.cuenta, sum(p.debe)::bigint AS debe, sum(p.haber)::bigint AS haber, count(*)::int AS n
              FROM contabilidad.apuntes p
              JOIN contabilidad.asientos a ON a.empresa_id = p.empresa_id AND a.id = p.asiento_id
             WHERE p.empresa_id = ${e}::uuid AND a.empresa_id = ${e}::uuid AND a.fecha <= ${hasta}::date
             GROUP BY p.cuenta`
        : await tx.$queryRaw<Fila[]>`
            SELECT p.cuenta, sum(p.debe)::bigint AS debe, sum(p.haber)::bigint AS haber, count(*)::int AS n
              FROM contabilidad.apuntes p
              JOIN contabilidad.asientos a ON a.empresa_id = p.empresa_id AND a.id = p.asiento_id
             WHERE p.empresa_id = ${e}::uuid AND a.empresa_id = ${e}::uuid AND a.fecha >= ${desde}::date AND a.fecha <= ${hasta}::date
             GROUP BY p.cuenta`
      return f.map((x) => ({ cuenta: String(x.cuenta), debe: centimosDeBd(x.debe), haber: centimosDeBd(x.haber), n: enteroDeBd(x.n) }))
    },

    async auditar(a) {
      await tx.$executeRaw`
        INSERT INTO contabilidad.auditoria (empresa_id, usuario_id, actor, accion, entidad, entidad_id, detalle)
        VALUES (${e}::uuid, ${a.usuarioId ?? null}::uuid, ${a.actor}, ${a.accion}, ${a.entidad}, ${a.entidadId ?? null},
                ${a.detalle === undefined ? null : JSON.stringify(a.detalle)}::jsonb)`
    },

    async contarCuentas() {
      const f = await tx.$queryRaw<Fila[]>`SELECT count(*)::int AS n FROM contabilidad.plan_cuentas WHERE empresa_id = ${e}::uuid`
      return enteroDeBd(f[0]?.n ?? 0)
    },

    async sembrarPlan(filas) {
      if (!filas.length) return
      await tx.$executeRaw`
        INSERT INTO contabilidad.plan_cuentas (empresa_id, codigo, nombre, grupo, naturaleza, admite_apuntes, activa)
        SELECT ${e}::uuid, c, n, g, nat, adm, true
          FROM unnest(${filas.map((x) => x.codigo)}::text[], ${filas.map((x) => x.nombre)}::text[],
                      ${filas.map((x) => x.grupo)}::smallint[], ${filas.map((x) => x.naturaleza)}::text[],
                      ${filas.map((x) => x.admiteApuntes)}::boolean[]) AS t(c, n, g, nat, adm)
        ON CONFLICT (empresa_id, codigo) DO NOTHING`
    },

    async crearEjercicio(x) {
      const n = await tx.$executeRaw`
        INSERT INTO contabilidad.ejercicios (empresa_id, anio, inicio, fin, estado)
        VALUES (${e}::uuid, ${x.anio}::int, ${x.inicio}::date, ${x.fin}::date, ${x.estado})
        ON CONFLICT (empresa_id, anio) DO NOTHING`
      return n > 0
    },

    async vinculos() {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT usuario_id, rol, activo FROM contabilidad.usuario_empresas WHERE empresa_id = ${e}::uuid`
      return f.map((x) => ({ usuarioId: String(x.usuario_id), rol: x.rol as 'dueno' | 'gestor', activo: x.activo === true }))
    },

    async vincular(usuarioId, rol) {
      await tx.$executeRaw`
        INSERT INTO contabilidad.usuario_empresas (usuario_id, empresa_id, rol) VALUES (${usuarioId}::uuid, ${e}::uuid, ${rol})
        ON CONFLICT (usuario_id, empresa_id) DO NOTHING`
    },

    async autorizarOrigen(app) {
      await tx.$executeRaw`
        INSERT INTO contabilidad.origenes_autorizados (empresa_id, app) VALUES (${e}::uuid, ${app})
        ON CONFLICT (empresa_id, app) DO NOTHING`
    },
  }
}
