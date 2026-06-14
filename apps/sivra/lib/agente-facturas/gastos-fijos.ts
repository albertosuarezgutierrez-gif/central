// Gastos fijos mensuales (alquileres, comunidades, seguros…): plantillas con
// importe conocido que se imputan automáticamente el día configurado de cada mes.
// Se apoya en el mismo dedup/inserción que el agente de facturas para no duplicar
// si la factura real del proveedor acaba llegando (misma huella).
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { fingerprint } from './fingerprint'
import { existeDuplicado, insertarGasto, type DatosGasto } from './imputar'

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
  }
}

export async function listarGastosFijos(soloActivos = false): Promise<GastoFijo[]> {
  const cond = soloActivos ? Prisma.sql`WHERE activo = true` : Prisma.sql``
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, concepto, proveedor, nif_proveedor, categoria, propiedad,
           base_imponible, iva, iva_porcentaje, irpf, irpf_porcentaje, total,
           dia_mes, activo, notas
    FROM gastos_fijos ${cond}
    ORDER BY activo DESC, propiedad NULLS LAST, concepto
  `)
  return rows.map(mapRow)
}

// Día efectivo: si la plantilla pide un día que no existe ese mes (p.ej. 31 en
// febrero), se ajusta al último día del mes.
function fechaDelMes(year: number, month: number, dia: number): string {
  const ultimo = new Date(year, month, 0).getDate()
  const d = Math.min(Math.max(dia || 1, 1), ultimo)
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export interface ResultadoGeneracion {
  year: number
  month: number
  creados: number
  existentes: number
  detalle: string[]
}

// Imputa los gastos fijos activos para (year, month). Idempotente: usa el dedup
// del agente (misma huella + importe ±7 días) para no duplicar si ya existe el
// gasto (creado por una ejecución previa o por la factura real del proveedor).
export async function generarGastosFijos(
  year: number,
  month: number,
  opts: { commit: boolean } = { commit: true },
): Promise<ResultadoGeneracion> {
  const fijos = await listarGastosFijos(true)
  const res: ResultadoGeneracion = { year, month, creados: 0, existentes: 0, detalle: [] }

  for (const f of fijos) {
    const fecha = fechaDelMes(year, month, f.dia_mes)
    const fp = fingerprint({ nif_proveedor: f.nif_proveedor, proveedor: f.proveedor, concepto: f.concepto })

    const existe = await existeDuplicado({ fingerprint: fp, numero_factura: null, fecha, total: f.total })
    if (existe) { res.existentes++; continue }

    res.detalle.push(`${fecha} · ${f.propiedad ?? '—'} · ${f.concepto} · ${f.total}€`)
    if (opts.commit) {
      const datos: DatosGasto = {
        fecha,
        proveedor: f.proveedor,
        nif_proveedor: f.nif_proveedor,
        numero_factura: null,
        concepto: f.concepto,
        categoria: f.categoria,
        propiedad: f.propiedad,
        base_imponible: f.base_imponible,
        iva: f.iva,
        iva_porcentaje: f.iva_porcentaje,
        irpf: f.irpf,
        irpf_porcentaje: f.irpf_porcentaje,
        total: f.total,
        fingerprint: fp,
        raw_extraction: { origen: 'gasto-fijo', gasto_fijo_id: f.id },
      }
      await insertarGasto(datos, { revisado: true, origen: 'fijo', confianza: 1 })
    }
    res.creados++
  }
  return res
}
