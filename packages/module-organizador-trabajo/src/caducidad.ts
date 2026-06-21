/** Cualquier cosa con fecha de caducidad: un lote de mercancía, un certificado de manipulador… */
export interface ConCaducidad {
  id: string
  nombre: string
  caduca_at: string   // ISO 8601
}

/** Ordena por caducidad ascendente (FEFO: lo que antes caduca, se usa/avisa primero). No muta la entrada. */
export function ordenarPorCaducidad<T extends ConCaducidad>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.caduca_at < b.caduca_at ? -1 : a.caduca_at > b.caduca_at ? 1 : 0,
  )
}

/**
 * Items que caducan dentro de `dentroDeDias` desde `ahoraIso` (incluye los ya
 * caducados), ordenados por caducidad. Sirve igual para FEFO de lotes que para
 * avisar de certificados (manipulador) a punto de vencer.
 */
export function proximosACaducar<T extends ConCaducidad>(
  items: T[],
  ahoraIso: string,
  dentroDeDias: number,
): T[] {
  const limite = new Date(ahoraIso).getTime() + dentroDeDias * 86_400_000
  return ordenarPorCaducidad(items).filter(i => new Date(i.caduca_at).getTime() <= limite)
}
