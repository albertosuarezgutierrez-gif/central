// Puro: ¿el nombre tecleado es el de esta ficha? Lo usa el alta en línea del riesgo antes de
// reutilizar una ficha por DNI (un DNI mal tecleado apunta a OTRA persona).

const normal = (x: unknown) => (typeof x === 'string' ? x : '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9ñ]+/).filter(Boolean)

/** Mismo nombre de pila y primer apellido (sin tildes ni mayúsculas). Ante la duda, NO es la misma. */
export function mismaPersonaPorNombre(tecleado: Record<string, unknown>, ficha: { nombre: string | null; apellidos: string | null }): boolean {
  const n1 = normal(tecleado.nombre)[0]
  const a1 = normal(tecleado.apellidos)[0]
  if (!n1 || !a1) return false
  const fn = normal(ficha.nombre)
  const fa = normal(ficha.apellidos)
  return fn[0] === n1 && (fa.includes(a1) || fn.includes(a1))
}
