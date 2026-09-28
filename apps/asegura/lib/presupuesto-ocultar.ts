// Qué opciones quita el corredor ANTES de preparar el presupuesto, y en qué orden se congelan todas
// (29/09/2026, entrega 2 de docs/superpowers/plans/2026-09-28-presupuesto-filtro-garantias.md). PURO.
//
// Desde la entrega 2 el presupuesto congela TODOS los precios de la tarificación: la portada
// (recomendadas) primero y el resto debajo, de la más barata a la más cara. Lo que el corredor oculta
// se congela igual —al final y con `oculta_at`— para que lo que se decidió no enseñar también se
// pueda reconstruir; pero no entra en la portada, el cliente no lo ve y no se puede aceptar.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ENTRADAS = 200

export type Ocultar = { companias: string[]; precios: string[] }

export const OCULTAR_VACIO: Ocultar = { companias: [], precios: [] }

/** La compañía comparada sin mayúsculas ni espacios de más: «Allianz » y «allianz» son la misma. */
export function claveCompania(c: string | null | undefined): string {
  return (c ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
}

/**
 * Lee `ocultar` del cuerpo. Ausente = nada oculto. `null` = viene pero MAL (no se adivina: un id
 * roto que se ignorara en silencio enseñaría al cliente justo lo que el corredor quiso quitar).
 */
export function leerOcultar(v: unknown): Ocultar | null {
  if (v === undefined || v === null) return OCULTAR_VACIO
  if (typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const lista = (x: unknown): string[] | null => {
    if (x === undefined || x === null) return []
    if (!Array.isArray(x) || x.length > MAX_ENTRADAS) return null
    return x.every((s) => typeof s === 'string') ? (x as string[]).map((s) => s.trim()) : null
  }
  const companias = lista(o.companias)
  const precios = lista(o.precios)
  if (companias === null || precios === null) return null
  if (companias.some((c) => c === '' || c.length > 120)) return null
  if (precios.some((p) => !UUID.test(p))) return null
  return { companias, precios: precios.map((p) => p.toLowerCase()) }
}

export function estaOculta(f: { id: string; compania: string | null }, o: Ocultar): boolean {
  if (o.precios.includes(f.id.toLowerCase())) return true
  const c = claveCompania(f.compania)
  return c !== '' && o.companias.some((x) => claveCompania(x) === c)
}

/**
 * El orden en que se congelan los índices de `filas` que NO son portada: primero los visibles y
 * luego los ocultos, cada tramo de la prima más baja a la más alta (empate: compañía). Los que no
 * tienen prima no se congelan (`prima_eur` es NOT NULL y una tarjeta sin precio no se enseña).
 */
export function ordenResto(
  filas: readonly { compania: string | null; prima: number | null; oculta: boolean }[],
  portada: ReadonlySet<number>,
): number[] {
  const idx = filas.map((_, i) => i).filter((i) => !portada.has(i) && filas[i].prima !== null)
  const cmp = (a: number, b: number) =>
    (filas[a].prima as number) - (filas[b].prima as number) ||
    claveCompania(filas[a].compania).localeCompare(claveCompania(filas[b].compania), 'es') ||
    a - b
  return [...idx.filter((i) => !filas[i].oculta).sort(cmp), ...idx.filter((i) => filas[i].oculta).sort(cmp)]
}
