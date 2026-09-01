import { randomInt } from 'node:crypto'

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
export function generarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
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
