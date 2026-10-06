/**
 * Aplica `fn` a cada elemento con COMO MUCHO `limite` ejecuciones a la vez (pool mínimo, sin dependencias).
 * Devuelve los resultados en el orden de `items`. Si `fn` lanza, la promesa rechaza (el llamador que no quiera
 * eso captura dentro de `fn`). `limite` < 1 o no finito se trata como 1.
 */
export async function mapConConcurrencia<T, R>(items: readonly T[], limite: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const tope = Number.isFinite(limite) ? Math.max(1, Math.floor(limite)) : 1
  const out = new Array<R>(items.length)
  let siguiente = 0
  const obrero = async (): Promise<void> => {
    while (siguiente < items.length) {
      const i = siguiente++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(tope, items.length) }, obrero))
  return out
}
