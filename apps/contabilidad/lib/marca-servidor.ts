// Marca de la empresa de la sesión (servidor). Sin sesión vigente → cara Grupo ASegura (cobalto), sin datos de nadie.
import { leerContexto } from './contexto'
import { conRepo } from './db'
import type { FilaEmpresa } from './repo'

export async function empresaActual(): Promise<FilaEmpresa | null> {
  const c = await leerContexto()
  if (!c) return null
  return conRepo(c.empresaId, (repo) => repo.empresa())
}
