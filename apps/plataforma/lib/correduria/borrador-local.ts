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
export type AlmacenLocal = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>

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
export function claveBorradorAutoNuevo(clienteId: string, oportunidadId?: string | null): string {
  // Una variante va con SU riesgo: el borrador de otro coche del mismo cliente no puede pisarlo.
  return oportunidadId ? `asegura_auto_nuevo_borrador_${clienteId}_op_${oportunidadId}` : `asegura_auto_nuevo_borrador_${clienteId}`
}

/** Clave del borrador de la pantalla de RETARIFICAR una póliza. */
export function claveBorradorRetarificar(polizaId: string): string {
  return `asegura_retarificar_borrador_${polizaId}`
}

/**
 * Borrador de AUTO NUEVO con red de seguridad (05/10/2026). La clave lleva la oportunidad, y se puede
 * entrar a la pantalla por una URL con `?oportunidad=` o sin ella: si la clave propia está vacía se
 * recupera el borrador hermano del MISMO cliente (sin oportunidad si se entra con una; el más reciente
 * de sus variantes si se entra sin ella), en vez de arrancar vacío y perder lo tecleado.
 * Lo propio siempre manda sobre lo hermano.
 */
export function leerBorradorAutoNuevo<T extends object>(
  clienteId: string,
  oportunidadId?: string | null,
  almacen: AlmacenLocal | null = almacenPorDefecto(),
  ahora: number = Date.now(),
): T | null {
  return leerBorradorAutoNuevoConSello<T>(clienteId, oportunidadId, almacen, ahora)?.datos ?? null
}

/** Sello (ms) de una clave cuyo borrador ya se ha leído como válido. `0` si no se puede leer. */
function selloDe(clave: string, almacen: AlmacenLocal): number {
  try {
    const raw = JSON.parse(almacen.getItem(clave) ?? '{}') as { guardadoEn?: unknown }
    return typeof raw.guardadoEn === 'number' ? raw.guardadoEn : 0
  } catch {
    return 0
  }
}

/**
 * Lo mismo que `leerBorradorAutoNuevo`, con el SELLO del borrador elegido (05/10/2026): la pantalla
 * lo compara con el del servidor (`lib/correduria/borrador-servidor.ts`) para quedarse con el más
 * reciente. Misma regla de hermanos.
 */
export function leerBorradorAutoNuevoConSello<T extends object>(
  clienteId: string,
  oportunidadId?: string | null,
  almacen: AlmacenLocal | null = almacenPorDefecto(),
  ahora: number = Date.now(),
): { datos: T; guardadoEn: number } | null {
  if (!almacen) return null
  const conSello = (k: string): { datos: T; guardadoEn: number } | null => {
    const b = leerBorrador<T>(k, almacen, ahora)
    return b ? { datos: b, guardadoEn: selloDe(k, almacen) } : null
  }
  const propio = conSello(claveBorradorAutoNuevo(clienteId, oportunidadId))
  if (propio) return propio
  if (oportunidadId) return conSello(claveBorradorAutoNuevo(clienteId))
  try {
    const prefijo = `${claveBorradorAutoNuevo(clienteId)}_op_`
    const claves: string[] = []
    for (let i = 0; i < (almacen.length ?? 0); i++) {
      const k = almacen.key?.(i)
      if (k && k.startsWith(prefijo)) claves.push(k)
    }
    let mejor: { datos: T; guardadoEn: number } | null = null
    for (const k of claves) {
      const b = conSello(k)
      if (b && (!mejor || b.guardadoEn > mejor.guardadoEn)) mejor = b
    }
    return mejor
  } catch {
    return null
  }
}
