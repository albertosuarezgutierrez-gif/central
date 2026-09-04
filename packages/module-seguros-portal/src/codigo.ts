
/** Minutos que vive un código antes de caducar. */
export const VALIDEZ_MINUTOS = 10

/** Intentos fallidos antes de bloquear. Con 6 dígitos, sin tope hay fuerza bruta. */
export const MAX_INTENTOS = 5

export type EstadoCodigo = 'valido' | 'incorrecto' | 'caducado' | 'ya_usado' | 'bloqueado'

export type CodigoGuardado = {
  codigo: string
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

/**
 * El orden de las comprobaciones importa y es deliberado: primero «ya usado» y
 * «bloqueado», DESPUÉS la caducidad, y el acierto al final. Comprobar el acierto
 * antes del bloqueo convertiría el contador de intentos en decorativo.
 */
export function estadoCodigo(
  guardado: CodigoGuardado,
  entrada: string,
  ahora: Date,
): EstadoCodigo {
  if (guardado.usadoEn !== null) return 'ya_usado'
  if (guardado.intentos >= MAX_INTENTOS) return 'bloqueado'
  const caducaEn = guardado.creadoEn.getTime() + VALIDEZ_MINUTOS * 60_000
  if (ahora.getTime() > caducaEn) return 'caducado'
  return entrada === guardado.codigo ? 'valido' : 'incorrecto'
}
