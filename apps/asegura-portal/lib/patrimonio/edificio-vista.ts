// EDIFICIO SIN DIVISIÓN HORIZONTAL (27/10/2026) — orden de pantalla PURO (sin imports: lo usan componentes de cliente).
//
// En la lista de Patrimonio y en Rentabilidad, cada edificio va seguido de SUS unidades (no mezcladas por orden alfabético
// con el resto). Una unidad cuyo edificio no está en la lista (archivado, o de otro titular por un dato roto) sale SUELTA:
// nunca se esconde ni se pega a un edificio que no es el suyo.

export type ConPadre = { id: string; inmueblePadreId?: string | null }

export type FilaOrdenada<T> = { fila: T; /** Edificio del que cuelga (unidad). `null` = suelto o el propio edificio. */ edificioId: string | null; /** Nº de unidades (solo en el edificio). */ unidades: number }

/** Edificio → sus unidades a continuación; el resto conserva el orden de entrada. */
export function ordenarConUnidades<T extends ConPadre>(filas: readonly T[]): FilaOrdenada<T>[] {
  const ids = new Set(filas.map((f) => f.id))
  const hijas = new Map<string, T[]>()
  for (const f of filas) {
    const p = f.inmueblePadreId ?? null
    if (p !== null && p !== f.id && ids.has(p)) hijas.set(p, [...(hijas.get(p) ?? []), f])
  }
  const colocadas = new Set<string>()
  const out: FilaOrdenada<T>[] = []
  for (const f of filas) {
    const p = f.inmueblePadreId ?? null
    if (p !== null && hijas.get(p)?.includes(f)) continue // va detrás de su edificio
    const suyas = hijas.get(f.id) ?? []
    out.push({ fila: f, edificioId: null, unidades: suyas.length })
    colocadas.add(f.id)
    for (const h of suyas) out.push({ fila: h, edificioId: f.id, unidades: 0 })
  }
  // Defensa: una unidad cuyo padre también es unidad (no debería existir: un solo nivel) no se pierde.
  for (const [p, hs] of hijas) if (!colocadas.has(p)) for (const h of hs) if (!out.some((o) => o.fila === h)) out.push({ fila: h, edificioId: null, unidades: 0 })
  return out
}
