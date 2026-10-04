/** ¿El error de Prisma/Postgres es «columna inexistente» (SQLSTATE 42703)? Cualquier otro error NO lo es. */
export function esColumnaAusente(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const o = e as { code?: unknown; meta?: { code?: unknown; message?: unknown }; message?: unknown }
  if (o.meta?.code === '42703') return true
  const msg = [o.message, o.meta?.message].filter((m): m is string => typeof m === 'string').join(' ')
  return /\b42703\b/.test(msg) || /column "?\w+"? does not exist/i.test(msg)
}
