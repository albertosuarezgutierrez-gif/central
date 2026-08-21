// lib/sivra/agente-huesped/coherencia.ts — la apertura tiene que decir lo mismo que la respuesta.
//
// Caso fundacional (20/08/2026, detectado por Alberto sobre la respuesta auto-enviada a Pilar):
// «Hola Pilar, ¡claro que sí! Aunque el apartamento no tiene servicio de consigna, te recomiendo
// estas opciones cercanas…». El «claro que sí» concede lo que la frase siguiente niega, y encima
// manda al huésped a otro sitio: «no tiene lógica». Un huésped que lee la primera línea entiende
// que le guardamos las maletas, y la decepción llega en la segunda.
//
// Es un fallo de CONTENIDO, no una coletilla de cortesía, así que —a diferencia de `cierre.ts`—
// aquí NO se poda nada: reescribir la apertura obliga a recolocar el resto del mensaje, y eso lo
// hace mejor una persona. El borrador pasa por Alberto (needs_human) en vez de auto-enviarse.
// La capa que EVITA el fallo es la instrucción del system prompt (`REGLA_COHERENCIA`).

// Fórmulas de CONCESIÓN: prometen que lo que pide el huésped se le da.
const RE_CONCESION = /claro\s+que\s+s[ií]|(?<=^|[\s¡!¿?.,;:—-])claro(?=[\s!.,])|por\s+supuesto|desde\s+luego|sin\s+(?:ning[uú]n\s+)?problema|faltar[ií]a\s+m[aá]s|c[oó]mo\s+no\b|of\s+course|sure\s+thing|certainly|absolutely|no\s+problem|bien\s+s[uû]r|avec\s+plaisir|nat[uü]rlich|selbstverst[aä]ndlich|certo\b|senz'?altro/i

// Negación de un SERVICIO nuestro (no un «no» cualquiera): es lo que convierte la concesión en
// una contradicción. Deliberadamente específica — «no hay problema» o «no dudes en escribirme»
// NO son esto, y confundirlos escalaría media bandeja.
const RE_NO_SERVICIO = new RegExp([
  'no\\s+(?:dispone|disponemos|disponen)\\s+de',
  'no\\s+(?:tiene|tenemos|tienen|cuenta\\s+con|contamos\\s+con)\\s+(?:de\\s+)?(?:servicio|consigna|recepci[oó]n|parking|aparcamiento|plaza|posibilidad)',
  'no\\s+(?:ofrece|ofrecemos|ofrecen)\\b',
  'no\\s+(?:hay|existe)\\s+(?:servicio|consigna|recepci[oó]n|posibilidad)',
  'no\\s+es\\s+posible',
  'no\\s+podemos\\s+(?:ofrecer|guardar|custodiar)',
  'lamentablemente\\s+no',
  'sentimos\\s+no',
  'siento\\s+no',
  'does\\s+not\\s+(?:have|offer|provide)',
  "(?:we\\s+)?(?:don'?t|do\\s+not)\\s+(?:have|offer|provide)",
  'there\\s+is\\s+no\\s+(?:luggage|storage|left-?luggage|reception)',
  'unfortunately\\s+(?:we|the|there)',
  "n'?(?:a|avons)\\s+pas\\s+de",
  'nicht\\s+(?:[uü]ber|an)',
  'non\\s+(?:disponiamo|abbiamo|dispone)',
].join('|'), 'i')

// Longitud de la APERTURA: el saludo y la primera frase, que es lo que el huésped lee de un vistazo
// (y lo único que se ve en la notificación del móvil).
function apertura(texto: string): string {
  const trozos = texto.match(/[^.!?\n]+[.!?]*\n*/g) || []
  return trozos.slice(0, 2).join('')
}

export type RevisionCoherencia = {
  incoherente: boolean
  // La fórmula de concesión que abre el mensaje, para que el aviso a Alberto diga QUÉ chirría.
  concesion: string
}

// ¿El mensaje abre concediendo lo que luego niega? Devuelve la fórmula para poder explicarlo.
export function revisarCoherencia(reply: string): RevisionCoherencia {
  const texto = reply || ''
  const cabeza = apertura(texto)
  const m = cabeza.match(RE_CONCESION)
  if (!m) return { incoherente: false, concesion: '' }
  // La negación tiene que venir DESPUÉS de la concesión: si el mensaje ya abre diciendo que no
  // tenemos el servicio, no hay contradicción que arreglar.
  const resto = texto.slice((m.index || 0) + m[0].length)
  if (!RE_NO_SERVICIO.test(resto)) return { incoherente: false, concesion: '' }
  return { incoherente: true, concesion: m[0].trim() }
}

// Instrucción para el system prompt: es la capa que EVITA el fallo (la de arriba solo lo caza).
export const REGLA_COHERENCIA =
  'COHERENCIA — la primera línea tiene que decir lo MISMO que el resto del mensaje: si la respuesta ' +
  'es que el apartamento NO ofrece algo (consigna, parking, recepción…) y le derivas a un sitio de ' +
  'fuera, NUNCA abras concediéndolo («¡claro que sí!», «por supuesto», «sin problema»): el huésped lee ' +
  'esa línea y entiende que se lo damos nosotros. Empieza por lo que hay de verdad, con naturalidad y ' +
  'sin dramatismo («Nosotros no tenemos consigna en el apartamento, pero a dos minutos tienes…»), y ' +
  'deja el tono cálido para la solución que sí le sirve.'
