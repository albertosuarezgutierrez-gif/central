// Mapeo PURO de la capa intercompany (sin BD, sin imports en runtime → testeable con
// `node --test`). Los `import type` de @central/module-intercompany se borran al type-strip.
import type { OperacionIntercompany, ResumenSociedad } from '@central/module-intercompany'

export interface OperacionIntercompanyRow {
  id: string
  sociedad_origen_id: string
  sociedad_destino_id: string
  importe: unknown
  concepto: string | null
  fecha: Date | string | null
  tipo: string | null
  parent_id: string | null
  parent_type: string | null
}

/** Mapea una fila de BD ↔ el tipo genérico del módulo. */
export function filaAOperacion(row: OperacionIntercompanyRow): OperacionIntercompany {
  const fecha =
    row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : row.fecha ?? null
  return {
    id: row.id,
    sociedadOrigenId: row.sociedad_origen_id,
    sociedadDestinoId: row.sociedad_destino_id,
    importe: Number(row.importe),
    concepto: row.concepto,
    fecha,
    tipo: row.tipo,
    parent:
      row.parent_id && row.parent_type
        ? { parentId: row.parent_id, parentType: row.parent_type }
        : undefined,
  }
}

/**
 * Resumen por-negocio (lo que ya calcula el dashboard) → resumen por-SOCIEDAD, que es el
 * input que `consolidar()` espera. Varios negocios pueden colgar de la misma sociedad (CIF).
 *
 * `sociedadIdsHolding` (opcional) siembra el conjunto con TODAS las sociedades de la cuenta —
 * incluso las que reportan 0 (sin app/financiero) — para que el holding de `consolidar()` las
 * contenga y una operación intercompany que toque a una sociedad sin datos SÍ se elimine.
 */
export function resumenPorSociedad(
  negocios: Array<{ sociedadId: string; ingresos: number; gastos: number; disponible: boolean }>,
  sociedadIdsHolding: string[] = [],
): ResumenSociedad[] {
  const m = new Map<string, ResumenSociedad>()
  for (const id of sociedadIdsHolding) {
    if (!m.has(id)) m.set(id, { sociedadId: id, ingresos: 0, gastos: 0 })
  }
  for (const n of negocios) {
    if (!n.disponible) continue
    const cur = m.get(n.sociedadId) ?? { sociedadId: n.sociedadId, ingresos: 0, gastos: 0 }
    cur.ingresos += n.ingresos
    cur.gastos += n.gastos
    m.set(n.sociedadId, cur)
  }
  return [...m.values()]
}
