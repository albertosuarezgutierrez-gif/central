// Escritura/lectura de `comisiones_liquidacion_docs` (prisma/sql/2026-11-03_comisiones_liquidacion_docs.sql).
// Solo servidor. La lógica vive en `liquidacion-doc.ts` (puro, con test).
//
// Fail-open hacia el agente de facturas: si la tabla aún no existe o la cuenta del libro no se puede
// resolver, el documento sigue omitido como gasto (como antes) y el motivo queda en `agente_log`;
// nunca rompe el escaneo. Dedupe: UNIQUE (cuenta_id, compania_clave, numero_documento) + ON CONFLICT DO NOTHING.
import { prisma } from '@/lib/db'
import { cuentaDelLibro } from './cuenta-libro'
import { driveFileId, type DocGuardado, type LiquidacionLeida } from './liquidacion-doc'

export type ResultadoGuardar =
  | { estado: 'guardado' | 'duplicado'; numeroDocumento: string }
  | { estado: 'no_guardado'; motivo: string }

export async function guardarLiquidacionDoc(
  l: LiquidacionLeida,
  ctx: { fuente: string; driveUrl?: string | null; nombreArchivo?: string | null; huellaDoc?: string | null },
): Promise<ResultadoGuardar> {
  if (!l.companiaClave) return { estado: 'no_guardado', motivo: 'no se sabe de qué compañía es' }
  // Sin nº de documento, la huella del documento (correo + fichero + contenido) hace de dedupe.
  const numero = l.numeroDocumento ?? (ctx.huellaDoc ? `huella:${ctx.huellaDoc}` : null)
  if (!numero) return { estado: 'no_guardado', motivo: 'sin nº de documento ni huella para deduplicar' }
  const cuenta = await cuentaDelLibro().catch(e => ({ ok: false as const, motivo: String((e as Error)?.message ?? e).slice(0, 200) }))
  if (!cuenta.ok) return { estado: 'no_guardado', motivo: cuenta.motivo }
  try {
    const n = await prisma.$executeRaw`
      INSERT INTO comisiones_liquidacion_docs
        (cuenta_id, compania_codigo, compania, compania_clave, clase, numero_documento,
         periodo_inicio, periodo_fin, fecha_documento,
         bruto, retencion, otros_descuentos, neto, saldo_anterior, aritmetica_ok,
         drive_url, drive_file_id, nombre_archivo, huella_documento, fuente)
      VALUES (${cuenta.cuentaId}::uuid, ${l.companiaCodigo}, ${l.compania}, ${l.companiaClave}, ${l.clase}, ${numero},
              ${l.periodoInicio}::date, ${l.periodoFin}::date, ${l.fechaDocumento}::date,
              ${l.bruto}, ${l.retencion}, ${l.otrosDescuentos}, ${l.neto}, ${l.saldoAnterior}, ${l.aritmeticaOk},
              ${ctx.driveUrl ?? null}, ${driveFileId(ctx.driveUrl)}, ${ctx.nombreArchivo ?? null}, ${ctx.huellaDoc ?? null}, ${ctx.fuente})
      ON CONFLICT (cuenta_id, compania_clave, numero_documento) DO NOTHING`
    return { estado: n > 0 ? 'guardado' : 'duplicado', numeroDocumento: numero }
  } catch (e) {
    return { estado: 'no_guardado', motivo: `no se pudo escribir (¿falta la migración?): ${String((e as Error)?.message ?? e).slice(0, 160)}` }
  }
}

/** Documentos de la cuenta desde `desde` (YYYY-MM-DD). `null` = no se pudo leer (≠ `[]`, no hay). */
export async function leerLiquidacionDocs(cuentaId: string, desde: string): Promise<DocGuardado[] | null> {
  try {
    const f = await prisma.$queryRaw<Array<{
      compania_codigo: string | null; clase: string; numero_documento: string
      periodo_inicio: string | null; periodo_fin: string | null; fecha_documento: string | null
      bruto: number | null; retencion: number | null; neto: number | null; aritmetica_ok: boolean | null
    }>>`
      SELECT compania_codigo, clase, numero_documento,
             to_char(periodo_inicio, 'YYYY-MM-DD') AS periodo_inicio, to_char(periodo_fin, 'YYYY-MM-DD') AS periodo_fin,
             to_char(fecha_documento, 'YYYY-MM-DD') AS fecha_documento,
             bruto::float AS bruto, retencion::float AS retencion, neto::float AS neto, aritmetica_ok
      FROM comisiones_liquidacion_docs
      WHERE cuenta_id = ${cuentaId}::uuid
        AND coalesce(periodo_fin, fecha_documento, creado_at::date) >= ${desde}::date`
    return f.map(r => ({
      companiaCodigo: r.compania_codigo,
      clase: r.clase === 'aviso_recibo' ? 'aviso_recibo' : 'extracto',
      numeroDocumento: r.numero_documento,
      periodoInicio: r.periodo_inicio,
      periodoFin: r.periodo_fin,
      fechaDocumento: r.fecha_documento,
      bruto: r.bruto, retencion: r.retencion, neto: r.neto, aritmeticaOk: r.aritmetica_ok,
    }))
  } catch (e) {
    console.warn('[cima-liq] sin tabla comisiones_liquidacion_docs:', e instanceof Error ? e.message : e)
    return null
  }
}
