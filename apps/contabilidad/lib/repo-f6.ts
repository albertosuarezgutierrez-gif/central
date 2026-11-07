// Repositorio de la FASE 6 (portal de la gestoría, comentarios, revisiones, terceros) de UNA empresa. Mismas reglas que repo.ts / repo-f5.ts:
//   · se construye SOLO dentro de `conEmpresa` (RLS) y TODA consulta filtra además por `empresa_id` explícito, enlazado como parámetro;
//   · SQL parametrizado con plantilla, nunca concatenación; importes en céntimos (bigint);
//   · tablas de 0006: `revisiones` y `comentarios` solo se añaden (aquí no hay UPDATE ni DELETE de ellas); `terceros` admite UPDATE solo de datos de contacto.
// Va APARTE de `repoSql` a propósito: lee tablas de 0006 que pueden no existir todavía; cada llamada de la app lo abre en su propia transacción y tolera el fallo.
import type { ObjetoComentable, TerceroImportado } from '@central/module-contabilidad'
import type { TxSql } from './rls.ts'
import { centimosDeBd, enteroDeBd, fechaDeBd } from './importes.ts'

type Fila = Record<string, unknown>
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ''))

export type AsientoPendiente = { id: string; numero: number; ejercicio: number; fecha: string; concepto: string; comentarios: number }
export type FacturaPendiente = { id: string; proveedor: string; numero: string; fecha: string; total: number; origen: string; comentarios: number }
export type ComentarioLeido = { id: string; rol: 'dueno' | 'gestor'; autor: string; texto: string; creadoEn: string }
export type NuevoComentario = { objeto: ObjetoComentable; usuarioId: string; rol: 'dueno' | 'gestor'; texto: string }
export type NuevaRevision = { tipo: 'asiento' | 'factura_recibida'; id: string; usuarioId: string; rol: 'dueno' | 'gestor' }

export interface RepoF6 {
  contarAsientosSinRevisar(): Promise<number>
  contarFacturasAConfirmar(): Promise<number>
  contarAvisosSinLeer(): Promise<number>
  contarDeclaracionesBorrador(): Promise<number>
  asientosSinRevisar(limite: number): Promise<AsientoPendiente[]>
  facturasAConfirmar(limite: number): Promise<FacturaPendiente[]>
  comentarios(objeto: ObjetoComentable, limite: number): Promise<ComentarioLeido[]>
  /** id del comentario. Lanza si el objeto no es de ESTA empresa (FK compuesta) o el autor no está vinculado (trigger). */
  insertarComentario(c: NuevoComentario): Promise<string>
  /** false = ya estaba revisado. */
  insertarRevision(r: NuevaRevision): Promise<boolean>
  insertarTerceros(ts: readonly TerceroImportado[], usuarioId: string | null): Promise<{ nuevos: number; repetidos: number }>
  terceros(limite: number): Promise<(TerceroImportado & { activo: boolean })[]>
  contarTerceros(): Promise<number>
  /** Las cuentas que reciben subcuentas dejan de admitir apuntes (único UPDATE de plan_cuentas de la fase). */
  marcarCuentasNoHoja(codigos: readonly string[]): Promise<void>
}

export function repoF6Sql(tx: TxSql, empresaId: string): RepoF6 {
  const e = empresaId
  const n = async (q: Promise<Fila[]>) => enteroDeBd((await q)[0]?.n ?? 0)
  return {
    contarAsientosSinRevisar: () => n(tx.$queryRaw<Fila[]>`
      SELECT count(*)::int AS n FROM contabilidad.asientos a
       WHERE a.empresa_id = ${e}::uuid AND a.origen NOT IN ('apertura', 'cierre')
         AND a.ejercicio IN (SELECT x.anio FROM contabilidad.ejercicios x WHERE x.empresa_id = ${e}::uuid AND x.estado = 'abierto')
         AND NOT EXISTS (SELECT 1 FROM contabilidad.revisiones r WHERE r.empresa_id = ${e}::uuid AND r.asiento_id = a.id)`),
    contarFacturasAConfirmar: () => n(tx.$queryRaw<Fila[]>`
      SELECT count(*)::int AS n FROM contabilidad.facturas_recibidas f
       WHERE f.empresa_id = ${e}::uuid AND f.origen <> 'manual'
         AND NOT EXISTS (SELECT 1 FROM contabilidad.revisiones r WHERE r.empresa_id = ${e}::uuid AND r.factura_recibida_id = f.id)`),
    contarAvisosSinLeer: () => n(tx.$queryRaw<Fila[]>`
      SELECT count(*)::int AS n FROM contabilidad.avisos WHERE empresa_id = ${e}::uuid AND leido_en IS NULL`),
    contarDeclaracionesBorrador: () => n(tx.$queryRaw<Fila[]>`
      SELECT count(*)::int AS n FROM contabilidad.declaraciones d
       WHERE d.empresa_id = ${e}::uuid AND d.estado = 'borrador'
         AND d.version = (SELECT max(v.version) FROM contabilidad.declaraciones v
                           WHERE v.empresa_id = ${e}::uuid AND v.modelo = d.modelo AND v.anio = d.anio AND v.periodo = d.periodo)`),

    async asientosSinRevisar(limite) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT a.id, a.numero, a.ejercicio, a.fecha, a.concepto,
               (SELECT count(*)::int FROM contabilidad.comentarios c WHERE c.empresa_id = ${e}::uuid AND c.asiento_id = a.id) AS comentarios
          FROM contabilidad.asientos a
         WHERE a.empresa_id = ${e}::uuid AND a.origen NOT IN ('apertura', 'cierre')
           AND a.ejercicio IN (SELECT x.anio FROM contabilidad.ejercicios x WHERE x.empresa_id = ${e}::uuid AND x.estado = 'abierto')
           AND NOT EXISTS (SELECT 1 FROM contabilidad.revisiones r WHERE r.empresa_id = ${e}::uuid AND r.asiento_id = a.id)
         ORDER BY a.fecha DESC, a.numero DESC LIMIT ${limite}::int`
      return f.map((x) => ({ id: String(x.id), numero: enteroDeBd(x.numero, 'numero'), ejercicio: enteroDeBd(x.ejercicio, 'ejercicio'), fecha: fechaDeBd(x.fecha), concepto: String(x.concepto), comentarios: enteroDeBd(x.comentarios) }))
    },

    async facturasAConfirmar(limite) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT f.id, f.proveedor_nombre, f.numero, f.fecha, f.total_cent, f.origen,
               (SELECT count(*)::int FROM contabilidad.comentarios c WHERE c.empresa_id = ${e}::uuid AND c.factura_recibida_id = f.id) AS comentarios
          FROM contabilidad.facturas_recibidas f
         WHERE f.empresa_id = ${e}::uuid AND f.origen <> 'manual'
           AND NOT EXISTS (SELECT 1 FROM contabilidad.revisiones r WHERE r.empresa_id = ${e}::uuid AND r.factura_recibida_id = f.id)
         ORDER BY f.fecha DESC, f.creada_en DESC LIMIT ${limite}::int`
      return f.map((x) => ({ id: String(x.id), proveedor: String(x.proveedor_nombre), numero: String(x.numero), fecha: fechaDeBd(x.fecha), total: centimosDeBd(x.total_cent, 'total'), origen: String(x.origen), comentarios: enteroDeBd(x.comentarios) }))
    },

    async comentarios(objeto, limite) {
      const id = objeto.tipo === 'documento' ? null : objeto.id
      const ref = objeto.tipo === 'documento' ? objeto.ref : null
      const f = await tx.$queryRaw<Fila[]>`
        SELECT c.id, c.rol, u.nombre AS autor, c.texto, c.creado_en
          FROM contabilidad.comentarios c JOIN contabilidad.usuarios u ON u.id = c.usuario_id
         WHERE c.empresa_id = ${e}::uuid
           AND ((${objeto.tipo}::text = 'asiento' AND c.asiento_id = ${id}::uuid)
             OR (${objeto.tipo}::text = 'factura_recibida' AND c.factura_recibida_id = ${id}::uuid)
             OR (${objeto.tipo}::text = 'documento' AND c.documento_ref = ${ref}::text))
         ORDER BY c.creado_en ASC LIMIT ${limite}::int`
      return f.map((x) => ({ id: String(x.id), rol: x.rol === 'gestor' ? 'gestor' : 'dueno', autor: String(x.autor), texto: String(x.texto), creadoEn: iso(x.creado_en) }))
    },

    async insertarComentario(c) {
      const asiento = c.objeto.tipo === 'asiento' ? c.objeto.id : null
      const factura = c.objeto.tipo === 'factura_recibida' ? c.objeto.id : null
      const ref = c.objeto.tipo === 'documento' ? c.objeto.ref : null
      const f = await tx.$queryRaw<Fila[]>`
        INSERT INTO contabilidad.comentarios (empresa_id, asiento_id, factura_recibida_id, documento_ref, usuario_id, rol, texto)
        VALUES (${e}::uuid, ${asiento}::uuid, ${factura}::uuid, ${ref}::text, ${c.usuarioId}::uuid, ${c.rol}::text, ${c.texto}::text)
        RETURNING id`
      return String(f[0].id)
    },

    async insertarRevision(r) {
      const asiento = r.tipo === 'asiento' ? r.id : null
      const factura = r.tipo === 'factura_recibida' ? r.id : null
      const k = r.tipo === 'asiento'
        ? await tx.$executeRaw`
            INSERT INTO contabilidad.revisiones (empresa_id, asiento_id, usuario_id, rol)
            VALUES (${e}::uuid, ${asiento}::uuid, ${r.usuarioId}::uuid, ${r.rol}::text)
            ON CONFLICT (empresa_id, asiento_id) WHERE asiento_id IS NOT NULL DO NOTHING`
        : await tx.$executeRaw`
            INSERT INTO contabilidad.revisiones (empresa_id, factura_recibida_id, usuario_id, rol)
            VALUES (${e}::uuid, ${factura}::uuid, ${r.usuarioId}::uuid, ${r.rol}::text)
            ON CONFLICT (empresa_id, factura_recibida_id) WHERE factura_recibida_id IS NOT NULL DO NOTHING`
      return k === 1
    },

    async insertarTerceros(ts, usuarioId) {
      if (!ts.length) return { nuevos: 0, repetidos: 0 }
      const k = await tx.$executeRaw`
        INSERT INTO contabilidad.terceros (empresa_id, nif, nombre, tipo, email, telefono, origen, creado_por)
        SELECT ${e}::uuid, t.nif, t.nombre, t.tipo, nullif(t.email, ''), nullif(t.tel, ''), 'importacion', ${usuarioId}::uuid
          FROM unnest(${ts.map((x) => x.nif)}::text[], ${ts.map((x) => x.nombre)}::text[], ${ts.map((x) => x.tipo)}::text[],
                      ${ts.map((x) => x.email ?? '')}::text[], ${ts.map((x) => x.telefono ?? '')}::text[]) AS t(nif, nombre, tipo, email, tel)
        ON CONFLICT (empresa_id, nif, tipo) DO NOTHING`
      return { nuevos: k, repetidos: ts.length - k }
    },

    async terceros(limite) {
      const f = await tx.$queryRaw<Fila[]>`
        SELECT nif, nombre, tipo, email, telefono, activo FROM contabilidad.terceros
         WHERE empresa_id = ${e}::uuid ORDER BY tipo, nombre LIMIT ${limite}::int`
      return f.map((x) => ({ nif: String(x.nif), nombre: String(x.nombre), tipo: x.tipo as TerceroImportado['tipo'], email: x.email == null ? null : String(x.email), telefono: x.telefono == null ? null : String(x.telefono), activo: x.activo === true }))
    },

    async contarTerceros() {
      return n(tx.$queryRaw<Fila[]>`SELECT count(*)::int AS n FROM contabilidad.terceros WHERE empresa_id = ${e}::uuid`)
    },

    async marcarCuentasNoHoja(codigos) {
      if (!codigos.length) return
      await tx.$executeRaw`
        UPDATE contabilidad.plan_cuentas SET admite_apuntes = false WHERE empresa_id = ${e}::uuid AND codigo = ANY(${[...codigos]}::text[])`
    },
  }
}
