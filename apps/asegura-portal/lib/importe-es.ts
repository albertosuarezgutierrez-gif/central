// Lo que teclea una persona en España como importe → número. PURO.
//
// «412,50», «1.234,56», «1234.5», «1.234», «320 €» → número. Vacío → `null` («no lo ha puesto»).
// Cualquier otra cosa → `NaN` (la pantalla dice que no nos vale; nunca se adivina un 0).
// Regla del punto: con coma, el punto es de miles; sin coma, el punto es de miles SOLO si separa
// grupos exactos de tres («1.234», «12.345.678»); si no, es el decimal («1234.5»).

export function importeEs(texto: string): number | null {
  const limpio = texto.replace(/€/g, '').replace(/\s/g, '')
  if (limpio === '') return null
  let canonico: string
  if (limpio.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(limpio)) return NaN
    canonico = limpio.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    canonico = limpio.replace(/\./g, '')
  } else if (/^\d+(\.\d{1,2})?$/.test(limpio)) {
    canonico = limpio
  } else {
    return NaN
  }
  const n = Number(canonico)
  return Number.isFinite(n) ? n : NaN
}
