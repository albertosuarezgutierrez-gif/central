// Lo común de cada pantalla interna: contexto revalidado en BD + datos de la empresa para la cabecera.
import { exigirContexto, type Contexto } from './contexto'
import { conRepo, empresasDeUsuarioBd } from './db'
import type { FilaEmpresa } from './repo'

/** Avisos sin leer para la campana. En su PROPIA transacción y a prueba de fallos: si `avisos` aún no existe (0002 sin aplicar) o la BD falla, la campana muestra 0 y la página sigue. */
async function avisosSinLeer(empresaId: string): Promise<number> {
  try {
    return await conRepo(empresaId, (r) => r.contarAvisosSinLeer())
  } catch {
    return 0
  }
}

export async function datosPagina(): Promise<{ ctx: Contexto; empresa: FilaEmpresa | null; variasEmpresas: boolean; avisos: number }> {
  const ctx = await exigirContexto()
  const [empresa, empresas, avisos] = await Promise.all([conRepo(ctx.empresaId, (r) => r.empresa()), empresasDeUsuarioBd(ctx.usuarioId), avisosSinLeer(ctx.empresaId)])
  return { ctx, empresa, variasEmpresas: empresas.length > 1, avisos }
}
