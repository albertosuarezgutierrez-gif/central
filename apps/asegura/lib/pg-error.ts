/** ¿El error de Prisma/Postgres es «columna inexistente» (SQLSTATE 42703)? Cualquier otro error NO lo es. */
export function esColumnaAusente(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const o = e as { code?: unknown; meta?: { code?: unknown; message?: unknown }; message?: unknown }
  if (o.meta?.code === '42703') return true
  const msg = [o.message, o.meta?.message].filter((m): m is string => typeof m === 'string').join(' ')
  return /\b42703\b/.test(msg) || /column "?\w+"? does not exist/i.test(msg)
}

/**
 * ¿El error es «tabla inexistente» (SQLSTATE 42P01)? Sirve para una tabla cuya
 * migración puede no estar aplicada todavía (p. ej. `poliza_no_duplicado`, mig
 * 0108 del repo asegura). Cualquier otro error NO lo es.
 */
export function esTablaAusente(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const o = e as { code?: unknown; meta?: { code?: unknown; message?: unknown }; message?: unknown }
  if (o.code === '42P01' || o.meta?.code === '42P01') return true
  const msg = [o.message, o.meta?.message].filter((m): m is string => typeof m === 'string').join(' ')
  // «column "x" of relation "y" does not exist» es una COLUMNA (42703), no la tabla.
  if (/\bcolumn\b/i.test(msg)) return false
  return /\b42P01\b/.test(msg) || /relation "?[\w.]+"? does not exist/i.test(msg)
}
