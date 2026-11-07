// Casos de uso del portal de la GESTORÍA y de los comentarios (F6) sobre repositorios inyectados (tests con fakes). Sin BD directa.
//   · El autor y su rol salen del CONTEXTO revalidado en BD (nunca del cuerpo de la petición).
//   · Un comentario o una revisión solo existen para objetos de la empresa del contexto: la BD lo impone con FK compuestas; aquí además se rechaza
//     un id que no aparezca en la empresa antes de insertar (mensaje claro en vez de un error de FK).
import { bandejaGestor, gestionaEmpresa, validarComentario, validarRevision, type BandejaGestor, type ContadoresPendientes, type FuentePendientes, type VinculoUsuario } from '@central/module-contabilidad'
import type { RepoF6 } from './repo-f6.ts'

export type AutorF6 = { usuarioId: string; rol: 'dueno' | 'gestor' }
type Res<T> = ({ ok: true } & T) | { ok: false; errores: string[] }

export async function anotarComentario(f6: RepoF6, autor: AutorF6, entrada: unknown): Promise<Res<{ id: string }>> {
  const v = validarComentario(entrada)
  if (!v.ok) return v
  try {
    return { ok: true, id: await f6.insertarComentario({ objeto: v.valor.objeto, usuarioId: autor.usuarioId, rol: autor.rol, texto: v.valor.texto }) }
  } catch {
    // FK compuesta (objeto de otra empresa o inexistente) o autor sin vínculo activo: no se distingue hacia fuera.
    return { ok: false, errores: ['no se pudo añadir el comentario: el asiento o documento no existe en esta empresa'] }
  }
}

export async function marcarRevisado(f6: RepoF6, autor: AutorF6, entrada: unknown): Promise<Res<{ nuevo: boolean }>> {
  const v = validarRevision(entrada)
  if (!v.ok) return v
  try {
    return { ok: true, nuevo: await f6.insertarRevision({ tipo: v.valor.tipo, id: v.valor.id, usuarioId: autor.usuarioId, rol: autor.rol }) }
  } catch {
    return { ok: false, errores: ['no se pudo marcar como revisado: el objeto no existe en esta empresa'] }
  }
}

/**
 * Contadores de UNA empresa. Cada contador en SU transacción: si una tabla aún no existe (0002/0004/0006 sin aplicar) falla solo ese y queda `null`
 * («no se sabe»), nunca 0. `abrir` abre la transacción RLS de la empresa dada.
 */
export function fuenteContadores(abrir: <R>(empresaId: string, fn: (f6: RepoF6) => Promise<R>) => Promise<R>): FuentePendientes {
  return async (empresaId) => {
    const leer = (fn: (f6: RepoF6) => Promise<number>) => abrir(empresaId, fn).catch(() => null)
    const [asientosSinRevisar, facturasAConfirmar, avisosSinLeer, declaracionesBorrador] = await Promise.all([
      leer((r) => r.contarAsientosSinRevisar()), leer((r) => r.contarFacturasAConfirmar()), leer((r) => r.contarAvisosSinLeer()), leer((r) => r.contarDeclaracionesBorrador()),
    ])
    return { asientosSinRevisar, facturasAConfirmar, avisosSinLeer, declaracionesBorrador } satisfies ContadoresPendientes
  }
}

/** Portal: bandeja de las empresas que el usuario gestiona. Los vínculos vienen de la BD (`empresas_de_usuario`), nunca de la petición. */
export const bandejaDelUsuario = (vinculos: readonly VinculoUsuario[], fuente: FuentePendientes): Promise<BandejaGestor> => bandejaGestor(vinculos, fuente)
export { gestionaEmpresa }
