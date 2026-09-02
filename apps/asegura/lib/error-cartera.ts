/**
 * Causa de un fallo al leer la cartera — LÓGICA PURA sobre el error de Prisma/pg.
 *
 * Nació el 02/09/2026: `/correduria` en plataforma decía «asegura no puede leer su
 * base de datos» y el puerto se tragaba el error sin registrarlo, así que el único
 * sitio donde se veía la causa real (`password authentication failed for user
 * "prisma_seguros"`) eran los logs del pooler de Supabase. Cada causa se arregla en
 * un sitio distinto: la respuesta del puerto la lleva y la pantalla la muestra.
 *
 * Nunca se devuelve el mensaje crudo hacia fuera: puede llevar la URL con la
 * contraseña. Lo que viaja es la categoría; el detalle (sin URL) va a `console.error`.
 */
export type CausaErrorCartera =
  | 'credenciales'    // P1000 / «password authentication failed»: la URL lleva otra contraseña
  | 'permisos'        // P1010 / «permission denied»: el rol no tiene USAGE/SELECT sobre `seguros`
  | 'conexion'        // P1001, P1002, P1017 / ECONNREFUSED, ETIMEDOUT, ENOTFOUND
  | 'esquema'         // P2021, P2022 / «does not exist»: tabla o columna que no está en `seguros`
  | 'sin_correduria'  // la BD responde pero no hay fila en `corredurias`
  | 'otro'

type ConCodigo = { code?: unknown; message?: unknown; name?: unknown }

function texto(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  const m = (err as ConCodigo | null)?.message
  return typeof m === 'string' ? m : ''
}

function codigo(err: unknown): string | null {
  const c = (err as ConCodigo | null)?.code
  return typeof c === 'string' ? c : null
}

export function causaErrorCartera(err: unknown): CausaErrorCartera {
  const c = codigo(err)
  if (c === 'P1000') return 'credenciales'
  if (c === 'P1010') return 'permisos'
  if (c === 'P1001' || c === 'P1002' || c === 'P1017') return 'conexion'
  if (c === 'P2021' || c === 'P2022') return 'esquema'
  const m = texto(err).toLowerCase()
  if (/password authentication failed|authentication failed/.test(m)) return 'credenciales'
  if (/permission denied/.test(m)) return 'permisos'
  if (/econnrefused|etimedout|enotfound|econnreset|can't reach database|timed out/.test(m)) return 'conexion'
  if (/does not exist/.test(m)) return 'esquema'
  return 'otro'
}

/** Una línea para los logs, SIN la URL de conexión (que llevaría la contraseña). */
export function describirErrorCartera(err: unknown): string {
  const c = codigo(err)
  const m = texto(err)
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, '<url>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
  return `${c ?? 'sin-codigo'}: ${m || '(sin mensaje)'}`
}

/** Registra el fallo en el log del servidor y devuelve su causa para la respuesta. */
export function registrarErrorCartera(contexto: string, err: unknown): CausaErrorCartera {
  const causa = causaErrorCartera(err)
  console.error(`[cartera] ${contexto} → ${causa} · ${describirErrorCartera(err)}`)
  return causa
}
