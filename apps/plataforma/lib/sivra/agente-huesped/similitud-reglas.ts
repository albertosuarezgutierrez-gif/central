// lib/sivra/agente-huesped/similitud-reglas.ts — parte PURA de la recuperación por parecido.
//
// Separada de `similitud.ts` (que importa `@/lib/db`) por la misma razón que `reglas.ts` lo está de
// `aprender.ts`: sin el alias de Next, `node --test` no puede cargar un módulo que tire de Prisma, y
// esto es justo lo que tiene criterio y hay que testear.
//
// Alberto, 04/09/2026: «he respondido varias veces a preguntas similares y no ha aprendido».
// Medido: no había NINGUNA búsqueda por parecido en todo el circuito. `contexto.ts` volcaba al
// prompt las 8 últimas filas de `mensajes_aprendizaje` del piso (`ORDER BY created_at DESC LIMIT 8`)
// sin mirar si tenían algo que ver con la pregunta, así que ocho «gracias a ti» enterraban lo
// enseñado y nada lo recuperaba después.
//
// DOS SEÑALES, en unión, porque ninguna sola vale — medido contra las filas reales de
// `mensajes_guia_gaps` el 04/09/2026:
//
//   (a) **Trigrama sobre la frase** (`word_similarity` de pg_trgm, en `similitud.ts`). Caza la
//       repetición casi literal («llegaremos sobre las 12:30» → 0,62) y poco más: las paráfrasis de
//       verdad puntúan 0,20-0,21 cuando el ruido de un par NO relacionado ya está en 0,19. Por sí
//       sola no resuelve la queja. Y `word_similarity(corta, larga)` **satura**: «hola» contra
//       cualquier texto que contenga «hola» da 1,00 — de ahí `LONGITUD_MINIMA`.
//   (b) **Palabra de contenido en común** (`palabrasClave`, aquí). Es la que caza la paráfrasis
//       real: los cuatro avisos de phishing comparten «whatsapp» aunque estén escritos de formas
//       distintas, y los pares NO relacionados («dejar las maletas» vs «dónde dejo las llaves») no
//       comparten ninguna.
//
// ⚠️ Lo que esto NO resuelve, dicho para que nadie lo dé por hecho: los SINÓNIMOS. «¿dónde puedo
// aparcar el coche?» y «¿hay parking cerca?» no comparten ni trigramas ni palabra, y siguen sin
// encontrarse. Eso es terreno de embeddings; se descartaron a propósito por coste y por no meter
// otra dependencia en la cadena de IA.

// Umbral del trigrama. Por debajo es ruido (comparten «de», «la», «¿»…).
export const UMBRAL_PARECIDO = 0.3

// Por debajo de esto la pregunta es demasiado corta para que el trigrama signifique nada. La señal
// (b) sigue actuando igual.
export const LONGITUD_MINIMA = 20

// Tope de filas de aprendizaje que entran al prompt (el mismo de antes: no se agranda el prompt, se
// cambia QUÉ ocho entran).
export const MAX_APRENDIZAJES = 8
// Cuántas de esas ocho se reservan SIEMPRE a las más recientes, aunque no se parezcan a nada. Evita
// el fallo simétrico: que lo último que enseñó Alberto desaparezca por no venir a cuento hoy.
export const RESERVA_RECIENTES = 3

// Palabras vacías: las que aparecen en CUALQUIER mensaje de un huésped y por tanto no dicen de qué
// va. Multi-idioma porque los huéspedes escriben en cinco. No es una lista exhaustiva de stopwords:
// solo hace falta tumbar las que generarían un cruce falso.
const VACIAS = new Set([
  'hola', 'buenos', 'buenas', 'dias', 'días', 'noches', 'tardes', 'gracias', 'favor', 'saludos',
  'sobre', 'desde', 'hasta', 'para', 'porque', 'pero', 'esta', 'este', 'esto', 'esos', 'estas',
  'puedo', 'puede', 'podria', 'podría', 'quiero', 'queria', 'quería', 'tengo', 'tiene', 'seria',
  'sería', 'estoy', 'estamos', 'somos', 'nuestro', 'nuestra', 'vosotros', 'ustedes', 'tambien',
  'también', 'cuando', 'donde', 'dónde', 'cuanto', 'cuánto', 'como', 'cómo', 'muchas', 'mucho',
  'hello', 'good', 'morning', 'evening', 'thanks', 'thank', 'please', 'would', 'could', 'there',
  'about', 'with', 'have', 'that', 'this', 'your', 'from', 'what', 'when', 'where', 'will',
  'bonjour', 'merci', 'pour', 'avec', 'nous', 'vous', 'ciao', 'grazie', 'sono', 'hallo', 'danke',
  'bitte', 'haben', 'sind', 'wird',
])

// Longitud mínima de una palabra para contar como «de contenido». Por debajo son artículos,
// preposiciones y pronombres en los cinco idiomas.
const MIN_LETRAS = 5
// Tope de claves. Más allá, la consulta empieza a cruzar por casualidad.
const MAX_CLAVES = 6

/**
 * Palabras de CONTENIDO de un texto: las que dicen de qué va el mensaje.
 * Es la señal (b), la que de verdad caza la paráfrasis.
 */
export function palabrasClave(texto: string): string[] {
  const tokens = (texto || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)
  const vistas = new Set<string>()
  const salida: string[] = []
  for (const t of tokens) {
    if (t.length < MIN_LETRAS || VACIAS.has(t) || vistas.has(t)) continue
    vistas.add(t)
    salida.push(t)
    if (salida.length >= MAX_CLAVES) break
  }
  return salida
}

/**
 * Regex de Postgres que casa cualquiera de las claves como PALABRA ENTERA (no un trozo).
 * `null` cuando no hay ninguna clave utilizable — y `null` significa «esta señal no opina»,
 * nunca «casa con todo»: por eso el llamador la compara siempre con `IS NOT NULL`.
 *
 * Las claves salen de `palabrasClave`, que solo deja letras y dígitos, así que no hay nada que
 * escapar — se filtra igualmente por si esa función cambia algún día.
 */
export function regexClaves(claves: string[]): string | null {
  const limpias = claves.filter(c => /^[\p{L}\p{N}]+$/u.test(c))
  if (!limpias.length) return null
  return `(^|[^[:alnum:]])(${limpias.join('|')})([^[:alnum:]]|$)`
}

/**
 * Mezcla lo PARECIDO con lo RECIENTE sin duplicar, respetando una cuota mínima para lo reciente.
 *
 * El orden de salida es el de relevancia (primero lo parecido), porque el modelo pondera más lo que
 * ve antes; las recientes que no venían por parecido se añaden detrás.
 */
export function mezclarPorRelevancia<T>(
  parecidas: T[],
  recientes: T[],
  clave: (x: T) => string,
  max = MAX_APRENDIZAJES,
  reservaRecientes = RESERVA_RECIENTES,
): T[] {
  const huecoParaParecidas = Math.max(0, max - reservaRecientes)
  const vistas = new Set<string>()
  const salida: T[] = []
  const meter = (x: T) => {
    const k = clave(x)
    if (vistas.has(k)) return
    vistas.add(k)
    salida.push(x)
  }
  for (const x of parecidas.slice(0, huecoParaParecidas)) meter(x)
  for (const x of recientes) { if (salida.length >= max) break; meter(x) }
  // Si las recientes no llenaron el cupo, se completa con más parecidas.
  for (const x of parecidas) { if (salida.length >= max) break; meter(x) }
  return salida.slice(0, max)
}
