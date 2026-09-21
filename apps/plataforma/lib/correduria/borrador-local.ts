// Borrador LOCAL de un formulario de tarificación — lo que el corredor ha
// tecleado ANTES de pagar los 0,50€ de la cotización.
//
// Vive en `localStorage` del navegador, NUNCA en `seguros.*`: un borrador no
// es una cotización, y guardarlo en la base lo convertiría en un dato de la
// cartera que nadie ha confirmado. La fuente de verdad de lo YA pagado sigue
// siendo `seguros.tarificaciones`, y SIEMPRE manda sobre un borrador.
//
// Nació dentro de `retarificar/retarificador.tsx` y se sacó aquí el 21/09/2026
// para que la pantalla de auto NUEVO use el mismo mecanismo en vez de una
// segunda copia que se despistaría de esta. Dos copias del mismo borrador es
// la forma callada de que una de las dos pantallas deje de guardar.
//
// 🚨 `localStorage` puede fallar de varias formas que NO son un error del
// programa: modo privado, cuota agotada, `window` inexistente durante el
// render en servidor, o un JSON corrupto de una versión anterior. Ninguna
// puede romper la pantalla: perder el borrador es perder una comodidad, no un
// dato de negocio. Por eso todo va envuelto en `try` y el fallo devuelve
// `null` / no hace nada, nunca lanza.

/** Lo mínimo de `Storage` que hace falta aquí — inyectable para poder probarlo. */
export type AlmacenLocal = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * Caducidad corta A PROPÓSITO: el borrador puede llevar DNI, nombre, teléfono
 * o fecha de nacimiento tecleados a mano, y eso es dato personal en el
 * navegador. `borrarBorrador()` ya lo limpia en cuanto la cotización se paga;
 * este TTL acota cuánto se queda si esa cotización no llega a hacerse nunca.
 */
export const BORRADOR_TTL_MS = 3 * 24 * 60 * 60 * 1000

type ConSello<T> = T & { guardadoEn: number }

/** `window.localStorage` cuando existe. No lanza: en servidor devuelve `null`. */
function almacenPorDefecto(): AlmacenLocal | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * El borrador guardado, o `null`.
 *
 * `null` significa «no hay borrador utilizable» y agrupa a propósito cuatro
 * casos que aquí se tratan igual porque se arreglan igual —volver a teclear—:
 * no hay nada guardado, está caducado, el JSON no se puede leer, o no hay
 * almacén. Un borrador caducado se borra al leerlo, para no dejar el dato
 * personal ahí esperando a que alguien vuelva a abrir la pantalla.
 */
export function leerBorrador<T extends object>(
  clave: string,
  almacen: AlmacenLocal | null = almacenPorDefecto(),
  ahora: number = Date.now(),
): T | null {
  if (!almacen) return null
  try {
    const raw = almacen.getItem(clave)
    if (!raw) return null
    const b: unknown = JSON.parse(raw)
    if (!b || typeof b !== 'object' || Array.isArray(b)) return null
    const { guardadoEn, ...datos } = b as ConSello<T>
    // Sin sello no se sabe de cuándo es, así que no se puede saber si ha
    // caducado: se trata como caducado, que es el lado conservador.
    if (typeof guardadoEn !== 'number' || ahora - guardadoEn > BORRADOR_TTL_MS) {
      borrarBorrador(clave, almacen)
      return null
    }
    return datos as T
  } catch {
    return null
  }
}

export function guardarBorrador<T extends object>(
  clave: string,
  datos: T,
  almacen: AlmacenLocal | null = almacenPorDefecto(),
  ahora: number = Date.now(),
): void {
  if (!almacen) return
  try {
    almacen.setItem(clave, JSON.stringify({ ...datos, guardadoEn: ahora }))
  } catch {
    // Ver la cabecera: perder el borrador no puede romper nada.
  }
}

export function borrarBorrador(
  clave: string,
  almacen: AlmacenLocal | null = almacenPorDefecto(),
): void {
  if (!almacen) return
  try {
    almacen.removeItem(clave)
  } catch {
    // Ver la cabecera.
  }
}

/** Clave del borrador de la pantalla de AUTO NUEVO de un cliente. */
export function claveBorradorAutoNuevo(clienteId: string): string {
  return `asegura_auto_nuevo_borrador_${clienteId}`
}

/** Clave del borrador de la pantalla de RETARIFICAR una póliza. */
export function claveBorradorRetarificar(polizaId: string): string {
  return `asegura_retarificar_borrador_${polizaId}`
}
