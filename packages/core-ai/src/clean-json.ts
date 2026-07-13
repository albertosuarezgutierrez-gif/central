/**
 * Limpia el JSON que devuelven los modelos para que `JSON.parse` no falle:
 *  1) quita el markdown (```json … ```) que algunos añaden alrededor, y
 *  2) recorta la PROSA que otros añaden ANTES o DESPUÉS del objeto — el
 *     modelo del Director devolvía a veces `{"modelo":"x"}\nExplicación…`,
 *     que reventaba `JSON.parse` con "Unexpected non-whitespace character
 *     after JSON" pese a pedir response_format:json_schema (OpenRouter no lo
 *     fuerza a nivel de proveedor).
 * Función pura, sin dependencias. Implementación canónica del núcleo IA.
 */
export function cleanJSON(raw: string): string {
  const sinFences = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  // Si hay un objeto/array JSON balanceado, devuelve SOLO ese fragmento
  // (descarta prosa antes/después). Si no lo hay, deja el texto tal cual.
  return primerJsonBalanceado(sinFences) ?? sinFences
}

/**
 * Extrae el primer objeto `{…}` o array `[…]` con llaves/corchetes balanceados,
 * respetando cadenas y escapes (una llave dentro de un string no cuenta).
 * Devuelve null si no encuentra un fragmento balanceado completo.
 */
function primerJsonBalanceado(s: string): string | null {
  const inicio = buscarInicio(s)
  if (inicio === -1) return null
  const apertura = s[inicio]
  const cierre = apertura === '{' ? '}' : ']'
  let profundidad = 0
  let enCadena = false
  let escapado = false
  for (let i = inicio; i < s.length; i++) {
    const c = s[i]
    if (enCadena) {
      if (escapado) escapado = false
      else if (c === '\\') escapado = true
      else if (c === '"') enCadena = false
      continue
    }
    if (c === '"') enCadena = true
    else if (c === apertura) profundidad++
    else if (c === cierre) {
      profundidad--
      if (profundidad === 0) return s.slice(inicio, i + 1)
    }
  }
  return null // apertura sin cierre → no está balanceado
}

/** Índice del primer `{` o `[`, el que aparezca antes. -1 si no hay ninguno. */
function buscarInicio(s: string): number {
  const llave = s.indexOf('{')
  const corchete = s.indexOf('[')
  if (llave === -1) return corchete
  if (corchete === -1) return llave
  return Math.min(llave, corchete)
}
