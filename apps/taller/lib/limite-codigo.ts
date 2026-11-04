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

/** Taller del código, o null si es inexistente O la IP está bloqueada (indistinguible). */
export async function resolverCodigoLimitado(
  store: StoreCodigo, o: { codigo: string; ip: string; ahora: Date; porCodigo(c: string): Promise<string | null> },
): Promise<string | null> {
  const clave = claveCodigo(o.ip)
  const f = await store.leer(clave)
  if (f?.bloqueadoHasta && f.bloqueadoHasta.getTime() > o.ahora.getTime()) return null
  const id = await o.porCodigo(o.codigo)
  if (id) {
    if (f) await store.borrar(clave)
    return id
  }
  const vencida = !f || f.bloqueadoHasta !== null || o.ahora.getTime() - f.creadoEn.getTime() >= LIMITE_CODIGO.ventanaMinutos * MIN
  const intentos = (vencida ? 0 : f!.intentos) + 1
  await store.guardar(clave, {
    intentos,
    bloqueadoHasta: intentos >= LIMITE_CODIGO.maxFallos ? new Date(o.ahora.getTime() + LIMITE_CODIGO.bloqueoMinutos * MIN) : null,
    creadoEn: vencida ? o.ahora : f!.creadoEn,
  })
  return null
}
