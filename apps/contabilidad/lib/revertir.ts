// «Todo o nada» dentro de la transacción de la empresa. Los casos de uso devuelven `{ ok: false, … }` cuando algo no se pudo hacer
// (hecho que no se asienta, duplicado en carrera…); como `conRepo` es UNA transacción, para que no quede NADA a medias hay que lanzar.
// `revirtiendo(fn)` lanza `Revertir` cuando el resultado trae `ok: false`; `capturarReversion(promesa)` lo convierte de nuevo en el resultado.
import type { RepoContable } from './repo.ts'

export class Revertir<T> extends Error {
  readonly valor: T
  constructor(valor: T) {
    super('operación revertida')
    this.name = 'Revertir'
    this.valor = valor
  }
}

export const revirtiendo = <R extends { ok: boolean }>(fn: (repo: RepoContable) => Promise<R>) => async (repo: RepoContable): Promise<R> => {
  const r = await fn(repo)
  if (!r.ok) throw new Revertir(r)
  return r
}

export async function capturarReversion<R extends { ok: boolean }>(p: Promise<R>): Promise<R> {
  try {
    return await p
  } catch (e) {
    if (e instanceof Revertir) return e.valor as R
    throw e
  }
}
