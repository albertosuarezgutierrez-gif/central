/**
 * ¿Es este destino algo a lo que se pueda ENVIAR un código?
 *
 * Existe para cerrar un amplificador de correo: `POST /api/acceso/solicitar` es
 * público y sin sesión, y antes escribía una fila en `portal_codigo` y disparaba
 * un envío con cualquier cadena de 3 a 200 caracteres. O sea, cualquiera podía
 * usar el portal para meterle correo a un tercero, y la factura de envíos era
 * nuestra.
 *
 * 🚨 VALIDA PERO NO NORMALIZA, y esa es la mitad del diseño. Quien busca el
 * código después (`/api/acceso/verificar`) compara `hashCanal(destino)`, y
 * `hashCanal` ya hace su propio `trim().toLowerCase()` (`apps/asegura-portal/lib/auth.ts`).
 * Si aquí devolviéramos un valor «limpio» y se guardara ese, tendríamos DOS
 * normalizaciones distintas en dos sitios: el día que una cambie, el hash de
 * escritura y el de lectura dejan de coincidir y el código bueno sale
 * `sin_codigo` — un fallo silencioso, sin excepción y sin log, del que solo se
 * entera el cliente que no puede entrar. Por eso la función devuelve
 * `boolean` y no una cadena: para que no exista la tentación.
 *
 * Los dos formatos son deliberadamente ESTRICTOS pero no exhaustivos: un
 * validador de email «completo» (RFC 5322) acepta cosas que ningún proveedor
 * entrega y no es lo que hace falta aquí. Lo que hace falta es que no pase
 * basura ni una cadena de relleno.
 */

/** Longitud máxima aceptada, la misma que ya imponía el esquema de la ruta. */
export const MAX_DESTINO = 200

/**
 * Email con forma real: algo, arroba, dominio con al menos un punto y un TLD de
 * dos letras o más. Sin espacios, sin comas y sin dos arrobas.
 *
 * `a@b` se rechaza a propósito aunque sea técnicamente entregable en una red
 * interna: aquí el canal es correo de internet y un dominio sin punto es, en la
 * práctica, un error de tecleo o un intento de colar cualquier cosa.
 */
const EMAIL = /^[^\s@,;:<>()[\]\\"]+@[^\s@,;:<>()[\]\\".]+(\.[^\s@,;:<>()[\]\\".]+)+$/

/**
 * E.164: `+` y de 8 a 15 dígitos, el primero distinto de cero.
 *
 * Se exige el `+` a propósito. Un `600123456` suelto no dice de qué país es, y
 * WhatsApp necesita el prefijo: aceptarlo aquí sería aceptar un destino que
 * luego no se puede entregar, que es justo lo que esta función existe para
 * evitar. Tampoco se «arregla» añadiendo `+34`, porque suponer el país es
 * inventarse un dato del usuario.
 */
const E164 = /^\+[1-9]\d{7,14}$/

/**
 * `true` si a `destino` se le puede enviar un código por `tipo`.
 *
 * No lanza y no muta: con cualquier entrada rara (vacía, larguísima, con
 * espacios) devuelve `false`.
 */
export function destinoValido(tipo: 'email' | 'whatsapp', destino: string): boolean {
  if (typeof destino !== 'string') return false
  if (destino.length === 0 || destino.length > MAX_DESTINO) return false
  // Un destino con espacios alrededor es un error de tecleo, no un destino
  // distinto — pero NO se limpia aquí (ver la cabecera): se rechaza y se le
  // pide a la persona que lo escriba bien.
  if (destino !== destino.trim()) return false

  return tipo === 'email' ? EMAIL.test(destino) : E164.test(destino)
}
