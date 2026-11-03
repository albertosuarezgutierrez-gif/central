// Cargador (SOLO LECTURA) de lo que el resultado de la declaración necesita y no está ya en `getResumenFinanciero`:
// retenciones de Pilar (fiscal_perfil.conyuge_retenciones) y sus ingresos del año (para el aviso de prestación exenta).
import { prisma } from './db'
import { detectarAbonosAnticipados, type AbonosBanco } from './abonos-anticipados.ts'
import type { IngresoPilar } from './resultado-declaracion.ts'

export async function cargarDatosResultado(cuentaId: string, anio: number): Promise<{ retencionesPilar: number | null; ingresosPilar: IngresoPilar[] | null; guarderiaBanco: number | null; abonosBanco: AbonosBanco | null }> {
  const [ret, ing, guarderiaBanco, abonosBanco] = await Promise.all([
    prisma.$queryRaw<Array<{ r: unknown }>>`SELECT conyuge_retenciones AS r FROM fiscal_perfil WHERE cuenta_id = ${cuentaId}::uuid LIMIT 1`
      .then(rs => (rs[0]?.r == null ? null : Number(rs[0].r)))
      .catch((e: unknown) => { console.warn('[resultado-declaracion] retenciones de Pilar no leídas:', e instanceof Error ? e.message : e); return null }),
    prisma.$queryRaw<Array<{ fecha: Date | null; concepto: string | null; importe: unknown }>>`
      SELECT mb.fecha_operacion AS fecha, mb.concepto, mb.importe
      FROM movimientos_bancarios mb JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.destino = 'actividad_pilar' AND mb.importe > 0
        AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
        AND mb.fecha_operacion BETWEEN make_date(${anio}::int, 1, 1) AND make_date(${anio}::int, 12, 31)`
      .then(rs => rs.map((r): IngresoPilar => ({ fecha: r.fecha ? r.fecha.toISOString().slice(0, 10) : '', concepto: r.concepto ?? '', importe: Number(r.importe) })))
      .catch(() => null),
    // Guardería pagada en banco (movimientos etiquetados `guarderia`), sin los duplicados ignorados. null = no se pudo leer.
    prisma.$queryRaw<Array<{ t: unknown }>>`
      SELECT coalesce(sum(-mb.importe), 0) AS t
      FROM movimientos_bancarios mb JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.deduccion_cuota_tipo = 'guarderia' AND mb.importe < 0
        AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
        AND mb.fecha_operacion BETWEEN make_date(${anio}::int, 1, 1) AND make_date(${anio}::int, 12, 31)`
      .then(rs => (rs[0]?.t == null ? null : Number(rs[0].t)))
      .catch(() => null),
    // Abonos anticipados 140/143: ingresos AEAT 140/143 (la detección e imputación al ejercicio por etiqueta -MM-AAAA es el helper puro; el SQL solo acota candidatos: cobros del año y del siguiente por las etiquetas de diciembre). null = no se pudo leer.
    prisma.$queryRaw<Array<{ fecha: Date; concepto: string | null; contraparte: string | null; importe: unknown; duplicado_estado: string | null }>>`
      SELECT mb.fecha_operacion AS fecha, mb.concepto, mb.contraparte, mb.importe, mb.duplicado_estado
      FROM movimientos_bancarios mb JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.importe > 0 AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
        AND (coalesce(mb.concepto, '') || ' ' || coalesce(mb.contraparte, '')) ~* 'DEVOLUCIONES\\s+TRIBUTARIAS|DEDUCCION\\s+MATERNIDAD|MOD\\s*14[03]|FAMILIA\\s+NUMEROSA'
        AND mb.fecha_operacion BETWEEN make_date(${anio}::int, 1, 1) AND make_date(${anio}::int + 1, 12, 31)`
      .then(rs => detectarAbonosAnticipados(rs.map(r => ({ fecha: r.fecha.toISOString().slice(0, 10), concepto: r.concepto, contraparte: r.contraparte, importe: Number(r.importe), duplicado_estado: r.duplicado_estado })), anio, new Date().toISOString().slice(0, 10)))
      // 0 abonos leídos ≠ «sin abonos»: no pisa el perfil ni quita el aviso (null = sin dato del banco).
      .then(b => (b.n > 0 ? b : null))
      .catch((e: unknown) => { console.warn('[resultado-declaracion] abonos 140/143 no leídos:', e instanceof Error ? e.message : e); return null }),
  ])
  return { retencionesPilar: ret, ingresosPilar: ing, guarderiaBanco, abonosBanco }
}
