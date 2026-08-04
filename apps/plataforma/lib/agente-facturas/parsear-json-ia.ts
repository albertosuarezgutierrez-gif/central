// Parseo de la respuesta JSON de un modelo de lenguaje.
//
// 🚨 Por qué es un módulo aparte y testeado: el `JSON.parse` directo sobre la
// respuesta cruda era una de las dos causas de que 10 facturas se quedaran sin
// leer el 03/08/2026 («SyntaxError: Unterminated string in JSON at position 322»).
// Los modelos envuelven el JSON en ```json, lo preceden de «Aquí tienes…» o lo
// cortan a mitad si se acaban los tokens; nada de eso significa que no supieran
// leer la factura, solo que la respuesta viene sucia.
//
// Módulo PURO (sin '@/' ni IO) → testeable con `node --test`.

export interface JsonIa {
  /** Objeto parseado, o `{}` si no se pudo. */
  datos: Record<string, any>
  /** `true` = había un objeto JSON legible en la respuesta. */
  ok: boolean
}

/**
 * Saca el primer objeto JSON de una respuesta de modelo, tolerando adornos.
 * NO inventa nada: si no hay objeto legible devuelve `{ datos: {}, ok: false }`
 * y el llamador debe tratarlo como «no se ha podido leer», nunca como «vacío».
 */
export function parsearJsonIa(raw: string | null | undefined): JsonIa {
  if (!raw) return { datos: {}, ok: false }

  // 1) Quitar las vallas de markdown, que es el adorno más frecuente.
  const limpio = raw.replace(/```json/gi, '').replace(/```/g, '').trim()

  const intento = (s: string): Record<string, any> | null => {
    try {
      const obj = JSON.parse(s)
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null
    } catch { return null }
  }

  const directo = intento(limpio)
  if (directo) return { datos: directo, ok: true }

  // Si la respuesta ES un JSON válido pero no un objeto (típicamente un ARRAY de
  // facturas), se declara ilegible en vez de quedarse con el primer elemento: un
  // adjunto es una factura, y coger «la primera de N» sin saber cuántas había es
  // justo el tipo de silencio que este agente persigue.
  try {
    JSON.parse(limpio)
    return { datos: {}, ok: false }
  } catch { /* no era JSON entero: sigue al recorte de abajo */ }

  // 2) Recortar al primer objeto balanceado: cubre el «Aquí tienes el JSON: {...}»
  //    y también la cola de texto después del objeto. Se ignoran las llaves que
  //    aparezcan DENTRO de una cadena (un concepto de factura puede llevarlas).
  const ini = limpio.indexOf('{')
  if (ini === -1) return { datos: {}, ok: false }

  let prof = 0
  let enCadena = false
  let escapado = false
  for (let i = ini; i < limpio.length; i++) {
    const c = limpio[i]
    if (enCadena) {
      if (escapado) escapado = false
      else if (c === '\\') escapado = true
      else if (c === '"') enCadena = false
      continue
    }
    if (c === '"') { enCadena = true; continue }
    if (c === '{') prof++
    else if (c === '}') {
      prof--
      if (prof === 0) {
        const obj = intento(limpio.slice(ini, i + 1))
        return obj ? { datos: obj, ok: true } : { datos: {}, ok: false }
      }
    }
  }

  // 3) Aquí el objeto quedó ABIERTO: la respuesta se cortó a mitad (tope de
  //    tokens). No se intenta «reparar» cerrando llaves — un importe truncado
  //    (1.234,5 en vez de 1.234,56) es peor que no tener importe.
  return { datos: {}, ok: false }
}
