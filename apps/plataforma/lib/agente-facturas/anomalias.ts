// Detección de recurrentes que faltan (las anomalías de importe/duplicado se
// resuelven en el flujo principal vía evaluar()/existeDuplicado()).
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { estadoCargo, esAviso, type VeredictoCargo, type CuentaCobertura, cuentasParadas as cuentasParadasDe } from './domiciliados'

export interface ReglaFaltante {
  fingerprint: string
  proveedor: string | null
  propiedad: string | null
  importe_esperado: number | null
}

// Reglas mensuales activas (con historial) que NO tienen gasto imputado en el
// mes/año dados → probable factura recurrente que aún no ha llegado.
export async function recurrentesQueFaltan(year: number, month: number): Promise<ReglaFaltante[]> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.fingerprint, r.proveedor, r.propiedad, r.importe_esperado
    FROM gastos_reglas r
    WHERE r.activa = true AND r.periodicidad = 'mensual' AND r.vistas >= 2
      AND NOT EXISTS (
        SELECT 1 FROM gastos g
        WHERE g.fingerprint = r.fingerprint
          AND EXTRACT(YEAR FROM g.fecha) = ${year}
          AND EXTRACT(MONTH FROM g.fecha) = ${month}
      )
  `)
  return rows.map((r) => ({
    fingerprint: r.fingerprint,
    proveedor: r.proveedor,
    propiedad: r.propiedad,
    importe_esperado: r.importe_esperado != null ? Number(r.importe_esperado) : null,
  }))
}

// Cada piso debe tener su factura de LUZ (electricidad) cada mes. Devuelve los
// pisos que NO tienen un gasto de electricidad imputado ese mes.
export async function luzPorPisoQueFalta(year: number, month: number): Promise<{ propiedad: string; nombre: string }[]> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT p.id AS propiedad, p.name AS nombre
    FROM properties p
    WHERE p."smoobuId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM gastos g
        WHERE g.propiedad = p.id
          AND NOT (g.revisado = false AND g.origen IS NOT NULL)
          AND EXTRACT(YEAR FROM g.fecha) = ${year} AND EXTRACT(MONTH FROM g.fecha) = ${month}
          AND (g.concepto ILIKE '%electricidad%' OR g.concepto ILIKE '%luz%'
               OR g.concepto ILIKE '%endesa%' OR g.concepto ILIKE '%totalenergies%'
               OR g.concepto ILIKE '%iberdrola%' OR g.concepto ILIKE '%naturgy%' OR g.concepto ILIKE '%holaluz%')
      )
    ORDER BY p.name
  `)
  return rows.map((r) => ({ propiedad: r.propiedad, nombre: r.nombre }))
}

// ── Domiciliados sin cargo ───────────────────────────────────────────────────
// «Está domiciliado en el banco, tiene que estar cargado en cuenta» (Alberto, 26/08/2026).
// Un gasto con fecha de cobro vencida y sin apunte bancario es dinero que se dio por
// pagado sin comprobarlo. El veredicto lo pone el módulo PURO `domiciliados.ts`.

export interface GastoDomiciliado {
  id: string
  proveedor: string | null
  total: number
  fecha_vencimiento: string
  veredicto: VeredictoCargo
}

/** Última fecha sincronizada de cada cuenta activa (corriente o tarjeta) con movimientos en 180 días. */
export async function coberturaPorCuenta(hoy: string, cuentaId?: string, incluirOcultas = false): Promise<CuentaCobertura[]> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT cb.id::text AS id, COALESCE(cb.alias, cb.banco, cb.iban_mascara, cb.id::text) AS nombre,
           cb.iban_mascara, MAX(m.fecha_operacion)::text AS ultimo
    FROM cuentas_bancarias cb
    JOIN v_movimientos_activos m ON m.cuenta_bancaria_id = cb.id
    WHERE ${incluirOcultas ? Prisma.sql`TRUE` : Prisma.sql`cb.oculta IS NOT TRUE`}
      ${cuentaId ? Prisma.sql`AND cb.cuenta_id = ${cuentaId}::uuid` : Prisma.empty}
    GROUP BY cb.id, cb.alias, cb.banco, cb.iban_mascara
    ${incluirOcultas ? Prisma.empty : Prisma.sql`HAVING MAX(m.fecha_operacion) >= ${hoy}::date - 180`}
  `)
  return rows.map((r) => ({
    nombre: `${r.nombre}${r.iban_mascara && r.nombre !== r.iban_mascara ? ` ${String(r.iban_mascara).slice(-4)}` : ''}`,
    ultimo: r.ultimo ?? null,
  }))
}

/**
 * Gastos ya imputados cuya domiciliación venció y NO tienen cargo en cuenta.
 * Devuelve SOLO los accionables (`sin_cargo`): lo pendiente se calla y lo que no se
 * puede comprobar por falta de extracto NO se reporta como ausencia (se declara aparte).
 */
export async function domiciliadosSinCargo(
  hoy: string,
  diasAtras = 90,
): Promise<{ avisos: GastoDomiciliado[]; sinCobertura: number; sinFecha: number; cuentasParadas: CuentaCobertura[] }> {
  const cuentas = await coberturaPorCuenta(hoy)
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT g.id::text, g.proveedor, g.total::float AS total,
           g.fecha_vencimiento::text AS fecha_vencimiento,
           EXISTS (
             SELECT 1 FROM v_movimientos_activos m
             WHERE m.importe < 0
               AND abs(abs(m.importe) - g.total) < 0.02
               AND m.fecha_operacion BETWEEN g.fecha_vencimiento::date - INTERVAL '7 days'
                                         AND g.fecha_vencimiento::date + INTERVAL '7 days'
           ) AS cargo_casado
    FROM gastos g
    WHERE g.fecha_vencimiento IS NOT NULL
      AND (g.raw_extraction->>'domiciliado') = 'true' -- solo domiciliación EXPLÍCITA; null = no se sabe
      AND g.total > 0
      AND g.fecha_vencimiento::date >= ${hoy}::date - (${diasAtras}::int)
      AND NOT (g.revisado = false AND g.origen IS NOT NULL)
    ORDER BY g.fecha_vencimiento DESC
  `)

  const avisos: GastoDomiciliado[] = []
  let sinCobertura = 0
  let sinFecha = 0
  const paradasMap = new Map<string, CuentaCobertura>()
  for (const r of rows) {
    const veredicto = estadoCargo({
      fechaCargo: r.fecha_vencimiento,
      hoy,
      cargoCasado: r.cargo_casado === true,
      bancoHasta: null,
      cuentas,
    })
    if (veredicto.estado === 'sin_cobertura') {
      sinCobertura++
      for (const c of cuentasParadasDe(cuentas, r.fecha_vencimiento)) paradasMap.set(c.nombre, c)
    }
    if (veredicto.estado === 'sin_fecha') sinFecha++
    if (!esAviso(veredicto)) continue
    avisos.push({
      id: r.id,
      proveedor: r.proveedor,
      total: Number(r.total ?? 0),
      fecha_vencimiento: r.fecha_vencimiento,
      veredicto,
    })
  }
  return { avisos, sinCobertura, sinFecha, cuentasParadas: [...paradasMap.values()] }
}
