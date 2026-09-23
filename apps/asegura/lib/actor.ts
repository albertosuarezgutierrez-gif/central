// Quién está detrás de cada llamada al puerto de operador (Fase 1b de ASegura OS, 23/09/2026).
// PURO: sin BD ni red, para `node --test`.
//
// plataforma manda `x-actor` en cada llamada: `humano:<cuentaId>`, `agente:<id>` o
// `sistema:<origen>`. Viaja DENTRO del canal que ya protege el Bearer de operador, así que
// quien tiene ese secreto podría poner cualquier actor: esto es ATRIBUCIÓN, no autorización.
// Se descartó firmarlo como JWT con una clave derivada del mismo secreto porque no añade nada
// frente a quien ya tiene el Bearer; la separación real llegará cuando cada agente tenga su
// propia credencial (Fase 5), y entonces el tipo lo decidirá la credencial, no la cabecera.
//
// Sin cabecera o con una mal formada NO se rechaza la llamada (despliegue gradual): queda como
// `desconocido` con su motivo, que es un «no lo sé» explícito y no se confunde con `sistema`.

export const CABECERA_ACTOR = 'x-actor'

export type Actor =
  | { tipo: 'humano' | 'agente' | 'sistema'; id: string }
  | { tipo: 'desconocido'; motivo: 'sin_cabecera' | 'mal_formada' }

const FORMATO = /^(humano|agente|sistema):([A-Za-z0-9._:@-]{1,120})$/

export function leerActor(valor: string | null | undefined): Actor {
  const v = (valor ?? '').trim()
  if (v === '') return { tipo: 'desconocido', motivo: 'sin_cabecera' }
  const m = FORMATO.exec(v)
  if (!m) return { tipo: 'desconocido', motivo: 'mal_formada' }
  // Un humano va SIEMPRE por su cuentaId: un `humano:nombre@correo.es` metería un correo en una
  // tabla que no se puede borrar.
  if (m[1] === 'humano' && !UUID.test(m[2])) return { tipo: 'desconocido', motivo: 'mal_formada' }
  return { tipo: m[1] as 'humano' | 'agente' | 'sistema', id: m[2] }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLAVE_ID = /^(id|[a-z][A-Za-z]*Id)$/

/**
 * Los identificadores de la escritura (`clienteId`, `polizaId`, `id`…) sacados de la query y del
 * cuerpo JSON de primer nivel. SOLO claves con forma de id y valores con forma de UUID: el cuerpo
 * lleva DNI, teléfonos y correos, y esta tabla no se puede borrar, así que nada de eso entra.
 */
export function idsDeEscritura(url: string, cuerpo: unknown): Record<string, string> {
  const ids: Record<string, string> = {}
  const anotar = (k: string, v: unknown) => {
    if (Object.keys(ids).length >= 10) return
    if (CLAVE_ID.test(k) && typeof v === 'string' && UUID.test(v)) ids[k] = v.toLowerCase()
  }
  try {
    for (const [k, v] of new URL(url).searchParams) anotar(k, v)
  } catch { /* url relativa o rota: sin ids de query */ }
  if (cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo)) {
    for (const [k, v] of Object.entries(cuerpo as Record<string, unknown>)) anotar(k, v)
  }
  return ids
}
