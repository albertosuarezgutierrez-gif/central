// Los importes de los EIAC llegan como TEXTO, no como numeric: así los guarda
// `poliza_recibos` (prima_total, prima_neta, comision_bruta, comision_liquida)
// y así los guarda `cuenta_efectivo`. Alguien tiene que convertirlos, y ese
// alguien es el sitio donde más barato sale mentir.
//
// ─── Por qué no vale `Number(texto)` ────────────────────────────────────────
// `Number('1.234')` devuelve 1,234 — y si ese texto era «mil doscientos treinta
// y cuatro» en formato español, acabas de dividir la cifra por mil y NADIE lo
// nota, porque el resultado es un número perfectamente plausible. Es la lección
// de ORCL (`CLAUDE.md`, 31/07/2026): un dato mal leído es peor que uno ausente,
// porque no deja hueco que lo delate.
//
// ─── Qué formato llega DE VERDAD (medido el 01/09/2026) ─────────────────────
// Los 184 recibos de la cartera traen `prima_total` con la MISMA forma:
// `NNN.NN` — punto decimal, exactamente dos decimales, sin separador de miles
// (3 de ellos pasan de mil y siguen sin separador). Ni uno con coma.
//
// Así que se acepta ESA forma y la de un entero pelado, y CUALQUIER otra cosa
// devuelve `null`. `null` sube a la pantalla como «no se ha podido leer», que
// es la verdad; convertir un `1.234,56` inesperado en 1,23 sería inventarse
// una cifra sobre la que Alberto decide.

/** El importe, o `null` si el texto no tiene la forma medida. Nunca 0. */
export function importeEiac(texto: string | null | undefined): number | null {
  if (typeof texto !== 'string') return null
  const t = texto.trim()
  if (t === '') return null
  // Entero pelado (`1234`) o decimal con punto y 1-2 cifras (`1234.5`, `1234.56`).
  // Un tercer decimal ya no es un importe en euros: no se adivina qué es.
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Suma una lista de importes en texto SIN colapsar los ilegibles a cero.
 *
 * Devuelve el total de los que se han podido leer y **cuántos no**. Un total a
 * secas sobre una lista con tres textos rotos sería una cifra falsa que parece
 * buena; con `ilegibles > 0` la pantalla puede decir «870,45€ de 12 recibos,
 * 3 sin poder leer» en vez de dar el total por completo.
 */
export function sumarImportesEiac(
  textos: readonly (string | null | undefined)[],
): { total: number; leidos: number; ilegibles: number } {
  let total = 0
  let leidos = 0
  let ilegibles = 0
  for (const t of textos) {
    const n = importeEiac(t)
    if (n === null) {
      // Un campo ausente NO es un importe ilegible: que la compañía no informe
      // la comisión es distinto de que mande basura donde va un número.
      if (typeof t === 'string' && t.trim() !== '') ilegibles++
      continue
    }
    total += n
    leidos++
  }
  // Los céntimos vuelven a su sitio: sumar flotantes deja 870.4499999999999.
  return { total: Math.round(total * 100) / 100, leidos, ilegibles }
}
