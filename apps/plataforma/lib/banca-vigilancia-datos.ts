// lib/banca-vigilancia-datos.ts — consultas (solo lectura) de los avisos de banca. Lógica pura en
// banca-vigilancia.ts. Fechas como 'YYYY-MM-DD' (to_char) para no depender de la zona del servidor.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { Cargo, CuentaFrescura } from './banca-vigilancia'

export async function cuentasConUltimoMovimiento(): Promise<CuentaFrescura[]> {
  const filas = await prisma.$queryRaw<Array<{ banco: string; alias: string | null; iban: string | null; oculta: boolean; ultimo: string | null }>>`
    SELECT cb.banco, cb.alias, COALESCE(cb.iban, cb.iban_mascara) AS iban, cb.oculta,
           to_char(MAX(m.fecha_operacion), 'YYYY-MM-DD') AS ultimo
    FROM cuentas_bancarias cb
    LEFT JOIN movimientos_bancarios m ON m.cuenta_bancaria_id = cb.id
    GROUP BY cb.id`
  return filas.map(f => ({ banco: f.banco, alias: f.alias, iban: f.iban, oculta: f.oculta, ultimoMovimiento: f.ultimo }))
}

// Categorías que no son «gasto en un proveedor» (flujos propios, cuotas fijas, impuestos).
const NO_PROVEEDOR = ['transferencia', 'nomina', 'prestamo', 'impuestos', 'comision_bancaria', 'cobro_cliente']

export async function cargosMovimientos(): Promise<Cargo[]> {
  const filas = await prisma.$queryRaw<Array<{ fecha: string; prov: string; importe: unknown }>>`
    SELECT to_char(fecha_operacion, 'YYYY-MM-DD') AS fecha,
           COALESCE(NULLIF(contraparte, ''), concepto) AS prov, -importe AS importe
    FROM movimientos_bancarios
    WHERE importe < 0 AND fecha_operacion > current_date - 180
      AND COALESCE(categoria, '') NOT IN (${Prisma.join(NO_PROVEEDOR)})`
  return filas.filter(f => f.prov).map(f => ({ fecha: f.fecha, proveedor: f.prov, importe: Number(f.importe) }))
}

export async function cargosGastos(): Promise<Cargo[]> {
  const filas = await prisma.$queryRaw<Array<{ fecha: string; prov: string; importe: unknown }>>`
    SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, proveedor AS prov, total AS importe
    FROM gastos
    WHERE fecha > current_date - 180 AND proveedor IS NOT NULL AND total > 0
      AND COALESCE(categoria, '') NOT ILIKE 'seguro%'`
  return filas.map(f => ({ fecha: f.fecha, proveedor: f.prov, importe: Number(f.importe) }))
}
