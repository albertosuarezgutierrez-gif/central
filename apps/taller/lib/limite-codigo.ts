// Límite de intentos por IP al escribir el CÓDIGO del taller (paso 1 del login). Aún no hay taller resuelto, así que NO es política de
// taller: es una constante de seguridad de la plataforma. Mismo patrón que el login: candado de transacción + contador persistente
// (`taller.bloqueos_codigo`, clave `codigo:<ip>`). Código inexistente y IP bloqueada dan LA MISMA respuesta (no se distingue).
export const LIMITE_CODIGO = { maxFallos: 10, ventanaMinutos: 15, bloqueoMinutos: 60 } as const

export type FilaCodigo = { intentos: number; bloqueadoHasta: Date | null; creadoEn: Date }
export interface StoreCodigo {
  /** Toma el candado de la clave y lee la fila. */
  leer(clave: string): Promise<FilaCodigo | null>
  guardar(clave: string, f: FilaCodigo): Promise<void>
  borrar(clave: string): Promise<void>
}

const MIN = 60_000
export const claveCodigo = (ip: string) => `codigo:${ip}`

export type LimitePorIp = { maxFallos: number; ventanaMinutos: number; bloqueoMinutos: number }

/**
 * Patrón común de «límite de fallos por IP»: devuelve lo que resuelva `resolver`, o null si no resuelve O la IP está bloqueada
 * (las dos cosas, indistinguibles). Un acierto limpia la cuenta; un fallo la suma y, al llegar al máximo, bloquea.
 * Lo usan el código del taller (`codigo:<ip>`) y los enlaces públicos de cita (`enlace:<ip>`, limite-enlace.ts).
 */
export async function resolverConLimite<T>(
  store: StoreCodigo, o: { clave: string; limite: LimitePorIp; ahora: Date; resolver(): Promise<T | null> },
): Promise<T | null> {
  const f = await store.leer(o.clave)
  if (f?.bloqueadoHasta && f.bloqueadoHasta.getTime() > o.ahora.getTime()) return null
  const r = await o.resolver()
  if (r !== null) {
    if (f) await store.borrar(o.clave)
    return r
  }
  const vencida = !f || f.bloqueadoHasta !== null || o.ahora.getTime() - f.creadoEn.getTime() >= o.limite.ventanaMinutos * MIN
  const intentos = (vencida ? 0 : f!.intentos) + 1
  await store.guardar(o.clave, {
    intentos,
    bloqueadoHasta: intentos >= o.limite.maxFallos ? new Date(o.ahora.getTime() + o.limite.bloqueoMinutos * MIN) : null,
    creadoEn: vencida ? o.ahora : f!.creadoEn,
  })
  return null
}

/** Taller del código, o null si es inexistente O la IP está bloqueada (indistinguible). */
export function resolverCodigoLimitado(
  store: StoreCodigo, o: { codigo: string; ip: string; ahora: Date; porCodigo(c: string): Promise<string | null> },
): Promise<string | null> {
  return resolverConLimite(store, { clave: claveCodigo(o.ip), limite: LIMITE_CODIGO, ahora: o.ahora, resolver: () => o.porCodigo(o.codigo) })
}
