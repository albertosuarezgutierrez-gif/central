/**
 * Solo el CÓDIGO de un error va a los logs (p. ej. P2002 de Prisma), nunca `e.message`: el mensaje de Prisma o de
 * Postgres puede llevar los valores de la fila (nombre de la empresa, NIF, resumen del lead).
 */
export function codigoError(e: unknown): string {
  const c = (e as { code?: unknown } | null)?.code
  return typeof c === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(c) ? c : 'sin_codigo'
}
