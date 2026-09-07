// El saludo de entrada del portal: «Buenas tardes, Alberto». Puro y sin BD.
//
// ── Por qué existe (07/09/2026) ─────────────────────────────────────────────
//
// Alberto: «me gustaría que al entrar el cliente sea más ameno, no tan frío».
// La bóveda abría con «Mis seguros» y una tarjeta de vencimientos: correcto y
// glacial.
//
// ── 🚨 Las dos formas de que un saludo salga PEOR que no saludar ────────────
//
// 1. **Saludar a nadie.** «Buenos días, cliente» o «Buenos días, ,» es peor que
//    un titular seco: delata que no sabemos quién ha entrado. Por eso
//    `nombreDePila` devuelve `null` en cuanto duda, y la pantalla saluda sin
//    nombre en vez de rellenar el hueco.
// 2. **Saludar a la hora equivocada.** «Buenos días» a las once de la noche.
//    Y esto es fácil de romper sin enterarse: el servidor de Vercel corre en
//    UTC, así que la hora «del servidor» y la de quien mira se separan una o
//    dos horas — a la 01:00 de Madrid en UTC son las 23:00 o las 00:00, o sea
//    otro tramo del día. La zona entra como parámetro y NO se da por hecha.
//
// ── Medido antes de escribir `nombreDePila` (07/09/2026) ────────────────────
//
//   80 clientes vivos · **0 con coma** · 7 en mayúsculas · 21 de dos palabras
//   · 1 con forma de sociedad
//
// Cero comas significa que el formato de la cartera es «Nombre Apellido1
// Apellido2» y NO «APELLIDOS, NOMBRE». Por eso la primera palabra es el nombre
// de pila. Si algún día entrara una ficha con coma, el corte sería al revés y
// saludaríamos a la gente por su primer apellido: ese caso se detecta y se
// devuelve `null`.

/** Los tres tramos, con el texto exacto que se pinta. */
export const TRAMOS = ['Buenos días', 'Buenas tardes', 'Buenas noches'] as const
export type Tramo = (typeof TRAMOS)[number]

/**
 * Qué se dice a esta hora.
 *
 * 6-13 mañana · 13-21 tarde · resto noche. Los cortes son los del castellano
 * hablado, no los del reloj: a las 14:00 en España se dice «buenas tardes»
 * aunque el mediodía haya pasado hace dos horas.
 *
 * 🚨 `zona` es obligatoria a propósito. Sin ella, `getHours()` daría la hora del
 * proceso —UTC en Vercel— y el saludo se equivocaría de tramo una o dos horas
 * al día, todos los días, sin que nada fallara.
 */
export function saludoPorHora(ahora: Date, zona: string): Tramo {
  const hora = Number(
    new Intl.DateTimeFormat('es-ES', {
      timeZone: zona,
      hour: 'numeric',
      hour12: false,
    }).format(ahora),
  )
  // `Intl` devuelve 24 para la medianoche en algunas plataformas.
  const h = hora === 24 ? 0 : hora
  if (h >= 6 && h < 13) return 'Buenos días'
  if (h >= 13 && h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Palabras que delatan que la ficha es una sociedad, no una persona. */
const FORMAS_SOCIETARIAS =
  /\b(s\.?l\.?u?\.?|s\.?a\.?u?\.?|s\.?c\.?p?\.?|c\.?b\.?|s\.?l\.?n\.?e\.?|sociedad|comunidad|asociacion|asociación|fundacion|fundación)\b/i

/**
 * El nombre de pila con el que saludar, o `null` si no se puede saber.
 *
 * Devuelve `null` —y la pantalla saluda sin nombre— cuando:
 *   · no hay nombre, o está en blanco;
 *   · trae una coma (formato «APELLIDOS, NOMBRE»: cortar por delante daría el
 *     apellido, y saludar a alguien por su apellido es peor que no saludar);
 *   · lleva dígitos o una forma societaria (es una empresa, no una persona);
 *   · la primera palabra tiene una sola letra (una inicial) o pasa de 20
 *     caracteres (no es un nombre, es otra cosa).
 *
 * 🚨 Un nombre compuesto («José María») se queda en «José». Es una pérdida
 * aceptada: sigue siendo su nombre y sigue siendo cierto. Lo que no se hace es
 * adivinar dónde acaba el nombre y empiezan los apellidos.
 */
export function nombreDePila(nombre: string | null | undefined): string | null {
  if (!nombre) return null
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  if (limpio === '') return null
  if (limpio.includes(',')) return null
  if (/\d/.test(limpio)) return null
  if (FORMAS_SOCIETARIAS.test(limpio)) return null

  const primera = limpio.split(' ')[0]
  if (primera.length < 2 || primera.length > 20) return null
  // Solo letras (con acentos, ñ, guion y apóstrofo de nombres compuestos).
  if (!/^[\p{L}][\p{L}'’-]*$/u.test(primera)) return null

  // La cartera trae 7 de 80 fichas en MAYÚSCULAS. Gritar el nombre de alguien
  // no es ameno, así que se normaliza siempre a inicial mayúscula.
  return primera.charAt(0).toLocaleUpperCase('es-ES') + primera.slice(1).toLocaleLowerCase('es-ES')
}
