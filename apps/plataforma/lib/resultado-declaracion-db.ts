// Cargador (SOLO LECTURA) de lo que el resultado de la declaración necesita y no está ya en `getResumenFinanciero`:
// retenciones de Pilar (fiscal_perfil.conyuge_retenciones) y sus ingresos del año (para el aviso de prestación exenta).
import { prisma } from './db'
import type { IngresoPilar } from './resultado-declaracion.ts'

export async function cargarDatosResultado(cuentaId: string, anio: number): Promise<{ retencionesPilar: number | null; ingresosPilar: IngresoPilar[] | null }> {
  const [ret, ing] = await Promise.all([
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
  ])
  return { retencionesPilar: ret, ingresosPilar: ing }
}
