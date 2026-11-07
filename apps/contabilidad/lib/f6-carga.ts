// Ejecución de la fase 6 contra la BD: cada operación en SU PROPIA transacción RLS de la empresa, "todo o nada" (si el caso de uso devuelve `ok: false`
// se revierte lo que hubiera hecho). La lógica está en `gestoria.ts` / `onboarding.ts` (probada sin BD); esto solo junta los repositorios.
import { conEmpresa } from './db.ts'
import { repoSql, type RepoContable } from './repo.ts'
import { repoF6Sql, type RepoF6 } from './repo-f6.ts'
import { Revertir } from './revertir.ts'

const TIMEOUT = { timeout: 30_000 }

/** Lectura (o escritura) con ambos repositorios en una transacción propia. Si 0006 no está aplicada, las consultas a sus tablas lanzan: el llamador lo tolera. */
export const conF6 = <R>(empresaId: string, fn: (repo: RepoContable, f6: RepoF6) => Promise<R>) =>
  conEmpresa(empresaId, (tx) => fn(repoSql(tx, empresaId.toLowerCase()), repoF6Sql(tx, empresaId.toLowerCase())), TIMEOUT)

/** Escritura todo-o-nada: `ok: false` revierte la transacción y se devuelve el resultado tal cual. */
export async function ejecutarF6<R extends { ok: boolean }>(empresaId: string, fn: (repo: RepoContable, f6: RepoF6) => Promise<R>): Promise<R> {
  try {
    return await conF6(empresaId, async (repo, f6) => {
      const r = await fn(repo, f6)
      if (!r.ok) throw new Revertir(r)
      return r
    })
  } catch (e) {
    if (e instanceof Revertir) return e.valor as R
    throw e
  }
}
