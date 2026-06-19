// Construye las filas de `cocina_evento_elaboraciones` desde el body de la API:
// menú principal (dieta NULL, todos los PAX) + grupos de dieta de comensales puntuales.

export interface ElaboracionRow {
  evento_id: string
  receta_id: string
  dieta?: string | null
  comensales?: number | null
}

interface DietaBody { receta_id?: string; dieta?: string; comensales?: number | string }

export function buildElaboracionRows(eventoId: string, body: unknown): ElaboracionRow[] {
  const b = (body ?? {}) as { elaboraciones?: unknown; dietas?: unknown }
  const principales: string[] = Array.isArray(b.elaboraciones) ? (b.elaboraciones as string[]) : []
  const dietas: DietaBody[] = Array.isArray(b.dietas) ? (b.dietas as DietaBody[]) : []

  const rows: ElaboracionRow[] = principales
    .filter(id => typeof id === 'string' && id)
    .map(receta_id => ({ evento_id: eventoId, receta_id }))

  for (const d of dietas) {
    const receta_id = String(d?.receta_id ?? '')
    const dieta = String(d?.dieta ?? '').trim()
    const comensales = Number(d?.comensales)
    if (!receta_id || !dieta || !(comensales > 0)) continue
    rows.push({ evento_id: eventoId, receta_id, dieta, comensales })
  }
  return rows
}
