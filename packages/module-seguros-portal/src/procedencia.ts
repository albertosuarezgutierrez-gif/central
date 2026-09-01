/**
 * De dónde sale un dato del portal. Son TRES, nunca dos, y se pintan distinto.
 *
 * - `compania`  — vino por CIMA/EIAC. El único fiable sin que nadie lo confirme.
 * - `calculado` — lo dedujo el sistema de una norma (ITV según matriculación,
 *                 caducidad del DNI...). PROPONE; hasta que el usuario lo
 *                 confirma no se afirma nada.
 * - `declarado` — lo escribió el usuario. Se guarda y se avisa, pero el sistema
 *                 NO pretende que sea verdad: no lo verificó nadie.
 *
 * Por eso `declarado` no se puede afirmar ni aunque el usuario lo «confirme»:
 * confirmar lo que tú mismo escribiste no añade ninguna verificación.
 */
export const PROCEDENCIAS = ['compania', 'calculado', 'declarado'] as const
export type Procedencia = (typeof PROCEDENCIAS)[number]

const FIABILIDAD: Record<Procedencia, number> = {
  compania: 3,
  calculado: 2,
  declarado: 1,
}

export function fiabilidad(p: Procedencia): number {
  return FIABILIDAD[p]
}

const ETIQUETA: Record<Procedencia, string> = {
  compania: 'Confirmado por la compañía',
  calculado: 'Calculado — confírmalo',
  declarado: 'Lo has indicado tú',
}

export function etiquetaProcedencia(p: Procedencia): string {
  return ETIQUETA[p]
}

export function sePuedeAfirmar(dato: {
  procedencia: Procedencia
  confirmadoPorUsuario: boolean
}): boolean {
  if (dato.procedencia === 'compania') return true
  if (dato.procedencia === 'calculado') return dato.confirmadoPorUsuario
  return false
}
