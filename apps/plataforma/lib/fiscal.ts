// Estimación fiscal ORIENTATIVA por trimestre (IVA / pago fraccionado IRPF) a partir de
// los movimientos bancarios. NO es la liquidación real: muchas actividades de Alberto
// (alquiler turístico sin servicios, seguros) están exentas o a tipo reducido, así que
// esto es solo una foto aproximada al tipo general para anticipar caja. El cálculo fino
// lo hace el gestor con las facturas — por eso convive con "Exportar para el gestor".

import { prisma } from './db'

const IVA_GENERAL = 0.21
const IRPF_FRACCIONADO = 0.20 // pago fraccionado estimado sobre el rendimiento positivo

export type Trimestre = {
  trimestre: number          // 1..4
  ingresos: number
  gastos: number
  resultado: number
  ivaRepercutido: number     // estimado sobre ingresos (tipo general)
  ivaSoportado: number       // estimado sobre gastos (tipo general)
  ivaAIngresar: number       // repercutido - soportado (si > 0)
  irpfFraccionado: number    // estimado sobre el rendimiento positivo
}

export async function getEstimacionFiscal(cuentaId: string, anio: number): Promise<Trimestre[]> {
  const rows = await prisma.$queryRaw<Array<{ trimestre: number; ingresos: unknown; gastos: unknown }>>`
    SELECT extract(quarter FROM mb.fecha_operacion)::int AS trimestre,
           coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0), 0) AS ingresos,
           coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0), 0) AS gastos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.destino, '') <> 'traspaso_interno'
      AND extract(year FROM mb.fecha_operacion) = ${anio}
    GROUP BY 1 ORDER BY 1
  `
  return [1, 2, 3, 4].map(t => {
    const r = rows.find(x => Number(x.trimestre) === t)
    const ingresos = r ? Number(r.ingresos) : 0
    const gastos = r ? Number(r.gastos) : 0
    const resultado = ingresos - gastos
    // El importe bancario ya incluye IVA → la base es importe / 1.21.
    const ivaRepercutido = ingresos - ingresos / (1 + IVA_GENERAL)
    const ivaSoportado = gastos - gastos / (1 + IVA_GENERAL)
    return {
      trimestre: t,
      ingresos,
      gastos,
      resultado,
      ivaRepercutido,
      ivaSoportado,
      ivaAIngresar: Math.max(0, ivaRepercutido - ivaSoportado),
      irpfFraccionado: Math.max(0, resultado) * IRPF_FRACCIONADO,
    }
  })
}
