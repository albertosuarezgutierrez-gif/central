// Validación pura del body de `POST /api/admin/firmas/anular` (sin BD: testeable).
export const ANULAR_MAX = 500
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ValidacionAnular = { ok: true; ids: string[] } | { ok: false; error: string }

/** `{ ids: string[] }`: 1..500 uuid válidos. Quita duplicados; un solo id mal formado invalida todo. */
export function validarIdsAnular(body: unknown): ValidacionAnular {
  const ids = (body as { ids?: unknown } | null)?.ids
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: 'Indica los documentos a quitar' }
  if (ids.length > ANULAR_MAX) return { ok: false, error: `Máximo ${ANULAR_MAX} documentos por vez` }
  if (!ids.every(i => typeof i === 'string' && UUID.test(i))) return { ok: false, error: 'Algún identificador no es válido' }
  return { ok: true, ids: [...new Set(ids.map(i => (i as string).toLowerCase()))] }
}
