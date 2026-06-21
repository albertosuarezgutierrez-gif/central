// Persona física compartida entre verticales de la casa de marcas.
//
// Una misma persona (p.ej. Vanessa) puede ser limpiadora en ialimp y empleada en rrhh: es UNA
// persona con un `persona_id` compartido. Este módulo es PURO (no toca BD): define el contrato y
// las reglas de coincidencia para proponer que dos identidades de verticales distintas son la misma.
// El enlace real lo materializa cada vertical guardando el mismo `persona_id` en su fila
// (`ialimp.limpiadoras.persona_id` ↔ `rrhh.empleados.persona_id`), patrón `refExt` de core-identity.

/** Identidad mínima de una persona en una vertical, para comparar y enlazar. */
export interface Persona {
  /** persona_id compartido (uuid). Puede ser null si aún no se ha provisionado. */
  id?: string | null
  nombre: string
  email?: string | null
  dni?: string | null
}

/** Genera un nuevo `persona_id` (uuid v4). Se asigna al dar de alta a un trabajador. */
export function nuevaPersonaId(): string {
  return crypto.randomUUID()
}

/** Normaliza un DNI/NIE para comparar: sin espacios/guiones/puntos, en mayúsculas. */
export function normalizarDni(dni?: string | null): string | null {
  const t = (dni ?? '').replace(/[\s.\-]/g, '').toUpperCase()
  return t.length ? t : null
}

/** Normaliza un email para comparar: recortado y en minúsculas. */
export function normalizarEmail(email?: string | null): string | null {
  const t = (email ?? '').trim().toLowerCase()
  return t.length ? t : null
}

/**
 * ¿Dos identidades son (con alta probabilidad) la misma persona?
 * - Si ambas tienen `persona_id` → iguales solo si coincide (es la verdad).
 * - DNI coincidente = señal FUERTE (documento único).
 * - Email coincidente = señal DÉBIL pero útil (puede compartirse en familia, por eso no es definitiva).
 * Devuelve la confianza para que la UI decida si auto-enlaza o solo sugiere.
 */
export function coincidenciaPersona(a: Persona, b: Persona): 'misma' | 'probable' | 'posible' | 'no' {
  if (a.id && b.id) return a.id === b.id ? 'misma' : 'no'
  const dniA = normalizarDni(a.dni), dniB = normalizarDni(b.dni)
  if (dniA && dniB) return dniA === dniB ? 'probable' : 'no'
  const emailA = normalizarEmail(a.email), emailB = normalizarEmail(b.email)
  if (emailA && emailB && emailA === emailB) return 'posible'
  return 'no'
}

/** Atajo booleano: ¿deberían tratarse como la misma persona? (DNI o persona_id). */
export function mismaPersona(a: Persona, b: Persona): boolean {
  const c = coincidenciaPersona(a, b)
  return c === 'misma' || c === 'probable'
}
