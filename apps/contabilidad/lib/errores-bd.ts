// Traduce un error de BD a la respuesta HTTP de las rutas de la F5. Solo «tabla/función inexistente» (42P01/42883/3F000) significa «¿falta aplicar 0005?» (503);
// un duplicado (23505, p. ej. el periodo ya asentado) es un 409; cualquier otra cosa es un 500 que NO se disfraza de esquema pendiente.
export type RespuestaBd = { status: 503 | 409 | 500; body: { error: string; errores: string[] } }

/** Código SQLSTATE de un error de Prisma/pg (directo, en `meta` o dentro del mensaje), o null. */
export function codigoSqlState(e: unknown): string | null {
  const o = (e ?? {}) as { code?: unknown; meta?: { code?: unknown; message?: unknown }; message?: unknown }
  for (const c of [o.code, o.meta?.code]) if (typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c) && !/^P\d{4}$/.test(c)) return c
  const m = `${typeof o.meta?.message === 'string' ? o.meta.message : ''} ${typeof o.message === 'string' ? o.message : ''}`
  const x = m.match(/\bSQLSTATE[:\s]+([0-9A-Z]{5})\b/) ?? m.match(/\bcode:\s*"?([0-9A-Z]{5})"?/i) ?? m.match(/\bCode:\s*`([0-9A-Z]{5})`/)
  if (x) return x[1]
  if (/relation "[^"]+" does not exist/.test(m)) return '42P01'
  if (/duplicate key value violates unique constraint/.test(m)) return '23505'
  return null
}

export function respuestaDeErrorBd(e: unknown): RespuestaBd {
  const c = codigoSqlState(e)
  if (c === '42P01' || c === '42883' || c === '3F000') {
    return { status: 503, body: { error: 'cierre_no_disponible', errores: ['Falta aplicar el esquema de la fase 5 (0005_cierre.sql).'] } }
  }
  if (c === '23505') return { status: 409, body: { error: 'duplicado', errores: ['Esa operación ya estaba registrada (periodo o referencia duplicados).'] } }
  return { status: 500, body: { error: 'error_interno', errores: ['No se pudo completar la operación.'] } }
}
