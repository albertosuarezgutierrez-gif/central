/**
 * «¿De cuál de MIS fichas cuelga esta póliza?» — la regla pura del puente del portal.
 *
 * Una identidad del portal puede estar casada (`portal_vinculo`) con VARIAS fichas de la cartera (su ficha
 * y la de su empresa, o dos fichas con el mismo correo). El portal le enseña las pólizas de TODAS, así que
 * una operación SOBRE UNA PÓLIZA (o sobre algo que cuelga de una: presupuesto, anulación) no necesita
 * adivinar ficha: la ficha es la DUEÑA de esa póliza, siempre que esté entre las vinculadas y con un nivel
 * que permita operar. Con eso desaparece `varias_fichas` donde no hacía falta, sin abrir nada:
 *
 *  - 🚨 Una póliza de una ficha NO vinculada a la identidad se rechaza (`ajena/no_vinculada`), igual que hoy
 *    se rechaza la de otra persona. Ajena e inexistente acaban en el mismo «no es tuya» del llamador.
 *  - 🚨 Un vínculo sin nivel de operar (`tarjeta`, `completo`: solo ver) NO opera aunque la póliza sea de
 *    esa ficha (`ajena/sin_permiso`). Esta función nunca AMPLÍA lo que un vínculo deja hacer.
 *  - Las operaciones que no van sobre una póliza y que de verdad necesitan UNA ficha (la cuenta bancaria,
 *    el contacto, un documento suelto) siguen con `decidirFichaPropia` y su `varias_fichas`: ahí no se elige.
 *
 * El llamador sigue filtrando su consulta por `cliente_id = <la ficha devuelta>`: esto decide la ficha, no
 * sustituye esa guarda.
 */

/** Niveles de `portal_vinculo` que dejan OPERAR (pedir una baja, firmar, aceptar, nombrarnos…). */
export const NIVELES_QUE_OPERAN = ['gestionar', 'administrar'] as const

export type VinculoPortal = { clienteId: string; nivel: string }

export type FichaDeRecurso =
  | { estado: 'ok'; clienteId: string }
  /** La identidad no tiene ninguna ficha vinculada: no es «no es tuya», es «no sabemos quién eres». */
  | { estado: 'sin_ficha' }
  /** No se opera. `motivo` es para el log; hacia fuera, el llamador lo dice como su «no encontrado». */
  | { estado: 'ajena'; motivo: 'sin_dueno' | 'no_vinculada' | 'sin_permiso' }

export function puedeOperar(nivel: string): boolean {
  return (NIVELES_QUE_OPERAN as readonly string[]).includes(nivel)
}

function limpio(id: string | null | undefined): string {
  return typeof id === 'string' ? id.trim() : ''
}

/** Las fichas (sin repetir, ordenadas) en las que esta identidad PUEDE operar. */
export function fichasOperables(vinculos: readonly VinculoPortal[]): string[] {
  return [...new Set(vinculos.filter((v) => limpio(v.clienteId) !== '' && puedeOperar(v.nivel)).map((v) => limpio(v.clienteId)))].sort()
}

/**
 * Decide la ficha sobre la que se opera, dada la ficha DUEÑA del recurso (`null` = el recurso no existe en
 * esta correduría). Puro: los vínculos y el dueño los lee quien llama.
 */
export function fichaDeRecurso(vinculos: readonly VinculoPortal[], duenoClienteId: string | null): FichaDeRecurso {
  const conFicha = vinculos.filter((v) => limpio(v.clienteId) !== '')
  if (conFicha.length === 0) return { estado: 'sin_ficha' }
  const dueno = limpio(duenoClienteId)
  if (dueno === '') return { estado: 'ajena', motivo: 'sin_dueno' }
  const suyos = conFicha.filter((v) => limpio(v.clienteId) === dueno)
  if (suyos.length === 0) return { estado: 'ajena', motivo: 'no_vinculada' }
  // Dos filas a la misma ficha no deberían existir (UNIQUE identidad+cliente), pero si las hubiera basta una
  // que permita operar: es el mismo vínculo, no otra persona.
  if (!suyos.some((v) => puedeOperar(v.nivel))) return { estado: 'ajena', motivo: 'sin_permiso' }
  return { estado: 'ok', clienteId: dueno }
}
