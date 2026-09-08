// El nombre de pila con el que saludar a un cliente. Puro y sin BD.
//
// ── Por qué vive en `module-seguros` y no en el portal (08/09/2026) ─────────
//
// Nació en `module-seguros-portal/src/saludo.ts` para el «Buenas tardes,
// Alberto» de la bóveda. Alberto, sobre el mensaje de WhatsApp de invitación
// («Hola, Gabriel Duran Martinez:»): «solo pondría el nombre... apellidos es
// demasiado formal, al ser cliente tiene que ser trato más cercano». Ese
// mensaje lo compone `apps/plataforma`, que NO depende del portal (añadirlo
// arrastraría su árbol entero al build del panel), así que la regla baja al
// módulo que comparten los dos. El portal la sigue re-exportando.
//
// ── 🚨 Peor que no saludar ──────────────────────────────────────────────────
//
// «Hola, cliente» o «Hola, ,» delata que no sabemos quién es. Por eso
// `nombreDePila` devuelve `null` en cuanto duda y quien lo usa saluda SIN
// nombre en vez de rellenar el hueco.
//
// ── Medido antes de escribirla (07/09/2026) ─────────────────────────────────
//
//   80 clientes vivos · **0 con coma** · 7 en mayúsculas · 21 de dos palabras
//   · 1 con forma de sociedad
//
// Cero comas significa que el formato de la cartera es «Nombre Apellido1
// Apellido2» y NO «APELLIDOS, NOMBRE». Por eso la primera palabra es el nombre
// de pila. Si algún día entrara una ficha con coma, el corte sería al revés y
// saludaríamos a la gente por su primer apellido: ese caso se detecta y se
// devuelve `null`.

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
