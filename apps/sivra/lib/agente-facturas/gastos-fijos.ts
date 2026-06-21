// Gastos fijos mensuales (alquileres, comunidades, seguros…): plantillas con
// importe conocido que se imputan automáticamente el día configurado de cada mes.
//
// Es AUTOMÁTICO de punta a punta:
//   1) sincronizarReglasFijas() trae a `gastos_fijos` las reglas recurrentes que el
//      agente de facturas ya aprendió (gastos_reglas, periodicidad mensual), sin pisar
//      las que edites a mano (casadas por fingerprint).
//   2) generarGastosFijos() las imputa en `gastos` el día 1, con dedup POR MES: no crea
//      si ya hay un gasto con esa huella ese mes (lo creó una ejecución previa o la
//      factura real del proveedor).
//   3) Si la factura real llega después, insertarGasto() borra el placeholder 'fijo' del
//      mismo mes (la factura real manda) → cero duplicados.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { fingerprint as huella } from './fingerprint'

export interface GastoFijo {
  id: string
  concepto: string
  proveedor: string | null
  nif_proveedor: string | null
  categoria: string
  propiedad: string | null
  base_imponible: number | null
  iva: number | null
  iva_porcentaje: number | null
  irpf: number | null
  irpf_porcentaje: number | null
  total: number
  dia_mes: number
  activo: boolean
  notas: string | null
  fingerprint: string | null
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function mapRow(r: any): GastoFijo {
  return {
    id: r.id,
    concepto: r.concepto,
    proveedor: r.proveedor ?? null,
    nif_proveedor: r.nif_proveedor ?? null,
    categoria: r.categoria,
    propiedad: r.propiedad ?? null,
    base_imponible: num(r.base_imponible),
    iva: num(r.iva),
    iva_porcentaje: num(r.iva_porcentaje),
    irpf: num(r.irpf),
    irpf_porcentaje: num(r.irpf_porcentaje),
    total: Number(r.total ?? 0),
    dia_mes: Number(r.dia_mes ?? 1),
    activo: r.activo !== false,
    notas: r.notas ?? null,
    fingerprint: r.fingerprint ?? null,
  }
}

export async function listarGastosFijos(soloActivos = false): Promise<GastoFijo[]> {
  const cond = soloActivos ? Prisma.sql`WHERE activo = true` : Prisma.sql``
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, concepto, proveedor, nif_proveedor, categoria, propiedad,
           base_imponible, iva, iva_porcentaje, irpf, irpf_porcentaje, total,
           dia_mes, activo, notas, fingerprint
    FROM gastos_fijos ${cond}
    ORDER BY activo DESC, propiedad NULLS LAST, concepto
  `)
  return rows.map(mapRow)
}

// La huella de un gasto fijo: la guardada (casa con regla/factura), o la derivada
// de proveedor+concepto (misma que produce el agente de facturas).
export function huellaFijo(f: Pick<GastoFijo, 'fingerprint' | 'proveedor' | 'nif_proveedor' | 'concepto'>): string {
  return f.fingerprint || huella({ nif_proveedor: f.nif_proveedor, proveedor: f.proveedor, concepto: f.concepto })
}

// Importa a `gastos_fijos` las reglas mensuales aprendidas que aún no estén (por
// huella). No actualiza las existentes → respeta tus ediciones manuales.
export async function sincronizarReglasFijas(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    WITH ins AS (
      INSERT INTO gastos_fijos
        (concepto, proveedor, categoria, propiedad, iva_porcentaje, irpf_porcentaje,
         total, dia_mes, activo, fingerprint, origen)
      SELECT
        COALESCE(NULLIF(r.proveedor,''),'Gasto fijo'), r.proveedor, COALESCE(r.categoria,'OTRO'),
        r.propiedad, r.iva_porcentaje, r.irpf_porcentaje, r.importe_esperado, 1, true, r.fingerprint, 'regla'
      FROM gastos_reglas r
      WHERE r.activa = true AND r.periodicidad = 'mensual'
        AND r.fingerprint IS NOT NULL AND r.importe_esperado IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM gastos_fijos f WHERE f.fingerprint = r.fingerprint)
      RETURNING 1
    )
    SELECT count(*)::bigint AS n FROM ins
  `)
  return Number(rows[0]?.n ?? 0)
}

// ¿Ya hay un gasto con esta huella en (year, month)? (factura real o ejecución previa)
async function existeEnMes(fingerprint: string, year: number, month: number): Promise<boolean> {
  if (!fingerprint) return false
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT 1 FROM gastos
    WHERE fingerprint = ${fingerprint}
      AND EXTRACT(YEAR FROM fecha) = ${year} AND EXTRACT(MONTH FROM fecha) = ${month}
    LIMIT 1
  `)
  return rows.length > 0
}

// Día efectivo: si la plantilla pide un día que no existe ese mes, se ajusta al último.
function fechaDelMes(year: number, month: number, dia: number): string {
  const ultimo = new Date(year, month, 0).getDate()
  const d = Math.min(Math.max(dia || 1, 1), ultimo)
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export interface ResultadoGeneracion {
  year: number
  month: number
  sincronizados: number
  creados: number
  existentes: number
  detalle: string[]
}

// Imputa los gastos fijos activos para (year, month). Idempotente por mes.
export async function generarGastosFijos(
  year: number,
  month: number,
  opts: { commit?: boolean; sincronizar?: boolean } = {},
): Promise<ResultadoGeneracion> {
  const commit = opts.commit !== false
  const sincronizados = opts.sincronizar !== false && commit ? await sincronizarReglasFijas() : 0

  const fijos = await listarGastosFijos(true)
  const res: ResultadoGeneracion = { year, month, sincronizados, creados: 0, existentes: 0, detalle: [] }

  for (const f of fijos) {
    const fp = huellaFijo(f)
    if (await existeEnMes(fp, year, month)) { res.existentes++; continue }

    const fecha = fechaDelMes(year, month, f.dia_mes)
    res.detalle.push(`${fecha} · ${f.propiedad ?? '—'} · ${f.concepto} · ${f.total}€`)
    if (commit) {
      const raw = JSON.stringify({ origen: 'gasto-fijo', gasto_fijo_id: f.id })
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO gastos
          (fecha, proveedor, nif_proveedor, concepto, categoria, propiedad,
           base_imponible, iva, iva_porcentaje, irpf, irpf_porcentaje, total,
           fingerprint, origen, revisado, confianza, raw_extraction)
        VALUES
          (${fecha}::date, ${f.proveedor}, ${f.nif_proveedor}, ${f.concepto}, ${f.categoria}, ${f.propiedad},
           ${f.base_imponible}, ${f.iva}, ${f.iva_porcentaje}, ${f.irpf}, ${f.irpf_porcentaje}, ${f.total},
           ${fp}, 'fijo', true, 1, ${raw}::jsonb)
      `)
    }
    res.creados++
  }
  return res
}
