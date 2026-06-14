// Acceso a BD del agente: reglas, dedup, inserción de gastos, refuerzo y log.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import type { Regla } from './reglas'

export interface DatosGasto {
  fecha: string
  proveedor?: string | null
  nif_proveedor?: string | null
  numero_factura?: string | null
  concepto?: string | null
  categoria: string
  propiedad?: string | null
  base_imponible?: number | null
  iva?: number | null
  iva_porcentaje?: number | null
  irpf?: number | null
  irpf_porcentaje?: number | null
  total: number
  fingerprint: string
  drive_url?: string | null
  carpeta_drive?: string | null
  drive_file_name?: string | null
  raw_extraction?: unknown
}

export async function getRegla(fingerprint: string): Promise<Regla | null> {
  if (!fingerprint) return null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT fingerprint, propiedad, categoria, iva_porcentaje, irpf_porcentaje,
           importe_esperado, importe_min, importe_max, vistas, activa
    FROM gastos_reglas WHERE fingerprint = ${fingerprint} LIMIT 1
  `)
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    fingerprint: r.fingerprint,
    propiedad: r.propiedad,
    categoria: r.categoria,
    iva_porcentaje: num(r.iva_porcentaje),
    irpf_porcentaje: num(r.irpf_porcentaje),
    importe_esperado: num(r.importe_esperado),
    importe_min: num(r.importe_min),
    importe_max: num(r.importe_max),
    vistas: Number(r.vistas ?? 0),
    activa: r.activa !== false,
  }
}

// Dedup: misma huella+fecha+importe, o mismo número de factura.
export async function existeDuplicado(d: {
  fingerprint: string
  numero_factura?: string | null
  fecha: string
  total: number
}): Promise<boolean> {
  // Dedup por nº de factura exacto, o por misma huella + mismo importe dentro de
  // ±7 días (pilla "presupuesto+factura" del mismo gasto, sin chocar con los
  // recurrentes mensuales, que distan ~30 días).
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT 1 FROM gastos WHERE
      (${d.numero_factura}::text IS NOT NULL AND numero_factura = ${d.numero_factura})
      OR (${d.fingerprint} <> '' AND fingerprint = ${d.fingerprint}
          AND fecha BETWEEN ${d.fecha}::date - 7 AND ${d.fecha}::date + 7
          AND abs(coalesce(total,0) - ${d.total}) < 0.01)
    LIMIT 1
  `)
  return rows.length > 0
}

export async function insertarGasto(
  d: DatosGasto,
  meta: { revisado: boolean; origen: string; confianza: number; motivo_revision?: string | null },
): Promise<string> {
  // La factura real manda: si llega un gasto real (no 'fijo') con la misma huella,
  // elimina el placeholder estimado de gastos fijos (origen='fijo') del mismo mes,
  // para que no se cuente dos veces el alquiler/comunidad/etc.
  if (meta.origen !== 'fijo' && d.fingerprint) {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM gastos
      WHERE origen = 'fijo' AND fingerprint = ${d.fingerprint}
        AND date_trunc('month', fecha) = date_trunc('month', ${d.fecha}::date)
    `).catch(() => {})
  }
  const raw = d.raw_extraction != null ? JSON.stringify(d.raw_extraction) : null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO gastos
      (fecha, proveedor, nif_proveedor, numero_factura, concepto, categoria, propiedad,
       base_imponible, iva, iva_porcentaje, irpf, irpf_porcentaje, total,
       drive_url, carpeta_drive, drive_file_name, fingerprint, origen,
       revisado, confianza, motivo_revision, raw_extraction)
    VALUES
      (${d.fecha}::date, ${d.proveedor}, ${d.nif_proveedor}, ${d.numero_factura}, ${d.concepto},
       ${d.categoria}, ${d.propiedad},
       ${d.base_imponible}, ${d.iva}, ${d.iva_porcentaje}, ${d.irpf}, ${d.irpf_porcentaje}, ${d.total},
       ${d.drive_url}, ${d.carpeta_drive}, ${d.drive_file_name}, ${d.fingerprint}, ${meta.origen},
       ${meta.revisado}, ${meta.confianza}, ${meta.motivo_revision ?? null}, ${raw}::jsonb)
    RETURNING id
  `)
  return rows[0]?.id as string
}

// Crea o refuerza la regla aprendida tras una confirmación/imputación.
export async function reforzarRegla(d: DatosGasto): Promise<void> {
  if (!d.fingerprint) return
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO gastos_reglas
      (fingerprint, proveedor, nif_proveedor, propiedad, categoria,
       iva_porcentaje, irpf_porcentaje, importe_esperado, importe_min, importe_max,
       periodicidad, vistas, ultima_fecha, activa)
    VALUES
      (${d.fingerprint}, ${d.proveedor}, ${d.nif_proveedor}, ${d.propiedad}, ${d.categoria},
       ${d.iva_porcentaje}, ${d.irpf_porcentaje}, ${d.total}, ${d.total * 0.9}, ${d.total * 1.1},
       'mensual', 1, ${d.fecha}::date, true)
    ON CONFLICT (fingerprint) DO UPDATE SET
      vistas = gastos_reglas.vistas + 1,
      propiedad = EXCLUDED.propiedad,
      categoria = EXCLUDED.categoria,
      iva_porcentaje = EXCLUDED.iva_porcentaje,
      irpf_porcentaje = EXCLUDED.irpf_porcentaje,
      importe_esperado = EXCLUDED.importe_esperado,
      importe_min = LEAST(gastos_reglas.importe_min, EXCLUDED.importe_esperado * 0.9),
      importe_max = GREATEST(gastos_reglas.importe_max, EXCLUDED.importe_esperado * 1.1),
      ultima_fecha = EXCLUDED.ultima_fecha,
      updated_at = now()
  `)
}

export async function log(entry: {
  fuente: string
  fingerprint?: string | null
  gasto_id?: string | null
  decision: string
  confianza?: number | null
  motivo?: string | null
  payload?: unknown
}): Promise<void> {
  const payload = entry.payload != null ? JSON.stringify(entry.payload) : null
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO agente_log (fuente, fingerprint, gasto_id, decision, confianza, motivo, payload)
    VALUES (${entry.fuente}, ${entry.fingerprint ?? null}, ${entry.gasto_id ?? null}::uuid,
            ${entry.decision}, ${entry.confianza ?? null}, ${entry.motivo ?? null}, ${payload}::jsonb)
  `).catch(() => {})
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
