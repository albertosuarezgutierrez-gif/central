// Límite de fallos por IP en el enlace público de cita `/c/[token]`. Mismo patrón que el código del taller (limite-codigo.ts) y misma
// tabla (`taller.bloqueos_codigo`, sin taller_id), con clave `enlace:<ip>`. Un token inexistente, caducado, usado o con formato inválido
// cuenta como fallo; con la IP bloqueada ni un token CORRECTO resuelve, y la respuesta es la misma (404) que para un token malo.
import { resolverConLimite, type LimitePorIp, type StoreCodigo } from './limite-codigo.ts'

export const LIMITE_ENLACE: LimitePorIp = { maxFallos: 10, ventanaMinutos: 15, bloqueoMinutos: 60 }
export const claveEnlace = (ip: string) => `enlace:${ip}`

/** `resolver` devuelve el taller de una invitación VIGENTE (o null). IP sin dato → una sola cubeta común: nunca se salta el límite. */
export function resolverEnlaceLimitado(
  store: StoreCodigo, o: { ip: string | null; ahora: Date; resolver(): Promise<string | null> },
): Promise<string | null> {
  return resolverConLimite(store, { clave: claveEnlace(o.ip ?? 'sin-ip'), limite: LIMITE_ENLACE, ahora: o.ahora, resolver: o.resolver })
}
