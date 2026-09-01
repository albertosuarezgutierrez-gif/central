/**
 * De dónde sale un dato. Son CUATRO, nunca dos, y se pintan distinto.
 *
 * - `compania`  — vino por CIMA/EIAC. El único fiable sin que nadie lo confirme.
 * - `documento` — lo leyó una máquina de un documento que aportó el cliente
 *                 (su póliza, la ficha técnica, el DNI). Detrás hay un papel
 *                 real, así que vale más que lo que alguien teclea; pero lo ha
 *                 leído un OCR o un modelo, así que **no es la compañía** y
 *                 hasta que una persona lo confirma no se afirma.
 * - `calculado` — lo dedujo el sistema de una norma (ITV según matriculación,
 *                 caducidad del DNI...). PROPONE; hasta que el usuario lo
 *                 confirma no se afirma nada.
 * - `declarado` — lo escribió el usuario. Se guarda y se avisa, pero el sistema
 *                 NO pretende que sea verdad: no lo verificó nadie.
 *
 * Por eso `declarado` no se puede afirmar ni aunque el usuario lo «confirme»:
 * confirmar lo que tú mismo escribiste no añade ninguna verificación.
 *
 * 🚨 Y por eso existe `fiabilidad()`: cuando dos fuentes dan el MISMO campo,
 * gana la más fiable. Un extractor que pisa lo que mandó la compañía degrada
 * el dato sin que nadie se entere — es la lección de `subastas.tipo_bien`.
 */
export const PROCEDENCIAS = ['compania', 'documento', 'calculado', 'declarado'] as const
export type Procedencia = (typeof PROCEDENCIAS)[number]

const FIABILIDAD: Record<Procedencia, number> = {
  compania: 4,
  documento: 3,
  calculado: 2,
  declarado: 1,
}

export function fiabilidad(p: Procedencia): number {
  return FIABILIDAD[p]
}

const ETIQUETA: Record<Procedencia, string> = {
  compania: 'Confirmado por la compañía',
  documento: 'Leído de un documento — confírmalo',
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
  if (dato.procedencia === 'documento' || dato.procedencia === 'calculado') {
    return dato.confirmadoPorUsuario
  }
  return false
}

/**
 * ¿Debe `nueva` sustituir a `actual` para el MISMO campo?
 *
 * Solo si es estrictamente más fiable. Empate = se queda lo que había, porque
 * reescribir sin ganar nada solo sirve para perder la fecha del dato bueno.
 *
 * Existe para que ningún llamante compare procedencias a mano: esa comparación
 * hecha al revés (o con un `>=`) es exactamente cómo un extractor termina
 * pisando lo que mandó la compañía.
 */
export function debeSustituir(actual: Procedencia | null, nueva: Procedencia): boolean {
  if (actual === null) return true
  return fiabilidad(nueva) > fiabilidad(actual)
}
