// Lo común de cada pantalla interna: contexto revalidado en BD + datos de la empresa para la cabecera.
import { exigirContexto, type Contexto } from './contexto'
import { conRepo, empresasDeUsuarioBd } from './db'
import type { FilaEmpresa } from './repo'

export async function datosPagina(): Promise<{ ctx: Contexto; empresa: FilaEmpresa | null; variasEmpresas: boolean }> {
  const ctx = await exigirContexto()
  const [empresa, empresas] = await Promise.all([conRepo(ctx.empresaId, (r) => r.empresa()), empresasDeUsuarioBd(ctx.usuarioId)])
  return { ctx, empresa, variasEmpresas: empresas.length > 1 }
}
