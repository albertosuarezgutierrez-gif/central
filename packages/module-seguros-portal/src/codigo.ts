
/** Minutos que vive un código antes de caducar. */
export const VALIDEZ_MINUTOS = 10

/** Intentos fallidos antes de bloquear. Con 6 dígitos, sin tope hay fuerza bruta. */
export const MAX_INTENTOS = 5

export type EstadoCodigo = 'valido' | 'incorrecto' | 'caducado' | 'ya_usado' | 'bloqueado'

export type CodigoGuardado = {
  /**
   * 🚨 El HASH del código, nunca los 6 dígitos. Lo calcula `hashCodigo()` de
   * `apps/asegura-portal/lib/auth.ts` (SHA-256 con la MISMA pimienta de entorno
   * que el canal): sin pimienta, un espacio de 10^6 se revierte con un bucle.
   *
   * La columna de la BD se sigue llamando `codigo` —no se renombró para no
   * pedir migración— y guarda este hash. Quien lea el schema y suponga que ahí
   * hay 6 dígitos se equivoca.
   */
  codigoHash: string
  creadoEn: Date
  intentos: number
  usadoEn: Date | null
}

/** 6 dígitos con aleatoriedad criptográfica: `Math.random` aquí sería un fallo de seguridad. */
/**
 * 🚨 Web Crypto (`crypto.getRandomValues`), NO `node:crypto`.
 *
 * Este fichero lo re-exporta el barril del paquete, y del barril tiran también
 * los COMPONENTES DE CLIENTE del portal. Un `import ... from 'node:crypto'` aquí
 * arrastra el esquema `node:` al bundle del navegador y **el build de producción
 * revienta** con `UnhandledSchemeError`, mientras el typecheck y los tests pasan
 * tan tranquilos: en Node el módulo existe. Pasó de verdad —tres despliegues de
 * producción seguidos en ERROR el 03/09/2026, con el portal sin desplegar desde
 * que entró el parte de siniestro— y lo tapa el cepo de
 * `test/regression-portal-autorizacion.test.ts`.
 *
 * `crypto.getRandomValues` es global en Node 18+, en los navegadores y en edge,
 * así que además vale en runtimes donde `node:crypto` no existe.
 *
 * **Muestreo con rechazo**, no `% 1_000_000` a secas: 2³² no es múltiplo de un
 * millón, así que el resto favorecería a los ~295.000 primeros códigos. Se
 * descarta el sobrante (probabilidad ~0,022 %) y se repite.
 */
const TOPE = 1_000_000
const MAYOR_MULTIPLO = Math.floor(2 ** 32 / TOPE) * TOPE

export function generarCodigo(): string {
  const buf = new Uint32Array(1)
  let n = 0
  do {
    crypto.getRandomValues(buf)
    n = buf[0]
  } while (n >= MAYOR_MULTIPLO)
  return String(n % TOPE).padStart(6, '0')
}

/** Forma de lo que `hashCodigo()` produce: SHA-256 en hex minúscula. */
const FORMA_HASH = /^[0-9a-f]{64}$/

export function esHashCodigo(valor: string): boolean {
  return FORMA_HASH.test(valor)
}

/**
 * Comparación en TIEMPO CONSTANTE de dos hashes hex.
 *
 * 🚨 Es JavaScript puro y no `timingSafeEqual` de `node:crypto` a propósito:
 * este fichero lo re-exporta el barril del paquete y del barril tiran también
 * los COMPONENTES DE CLIENTE del portal — un `import ... from 'node:crypto'`
 * aquí revienta el build de producción con `UnhandledSchemeError` mientras el
 * typecheck y los tests pasan (ver la cabecera de `generarCodigo`).
 *
 * El `length` sí se compara de golpe, y no filtra nada: los dos lados son
 * SIEMPRE un SHA-256 hex de 64 caracteres, así que la longitud no es secreta.
 * Lo que no se puede filtrar es CUÁNTO se parece la entrada al hash guardado,
 * y eso es lo que cubre el bucle sin corte anticipado.
 */
export function igualEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let dif = 0
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return dif === 0
}

/**
 * El orden de las comprobaciones importa y es deliberado: primero «ya usado» y
 * «bloqueado», DESPUÉS la caducidad, y el acierto al final. Comprobar el acierto
 * antes del bloqueo convertiría el contador de intentos en decorativo.
 */
export function estadoCodigo(
  guardado: CodigoGuardado,
  entradaHash: string,
  ahora: Date,
): EstadoCodigo {
  if (guardado.usadoEn !== null) return 'ya_usado'
  if (guardado.intentos >= MAX_INTENTOS) return 'bloqueado'
  const caducaEn = guardado.creadoEn.getTime() + VALIDEZ_MINUTOS * 60_000
  if (ahora.getTime() > caducaEn) return 'caducado'
  // 🚨 Fila anterior al hasheado del código: guardaba los 6 dígitos en claro y
  // ya no casa con nada. Se responde `caducado` —«pide otro»— y NUNCA
  // `incorrecto`: `incorrecto` le dice que ha tecleado mal (y en el portal el intento
  // se reserva antes de comparar), culpando a quien ha tecleado bien. **No se aceptan los dos
  // formatos**: mantener viva la comparación en claro dejaría el agujero
  // abierto justo para las filas que lo tienen. Son 10 minutos de códigos
  // vivos; esas personas piden otro.
  if (!esHashCodigo(guardado.codigoHash)) return 'caducado'
  return igualEnTiempoConstante(entradaHash, guardado.codigoHash) ? 'valido' : 'incorrecto'
}
