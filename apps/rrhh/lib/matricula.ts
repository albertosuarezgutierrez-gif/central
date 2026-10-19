// Normalización de la matrícula de la ficha del empleado. Módulo PURO.
// rrhh no depende de module-seguros/module-tarificacion (no se acopla un paquete a otra
// vertical), así que el helper vive aquí: mayúsculas, sin espacios, guiones ni puntos.

/** Matrícula normalizada para guardar, o null si queda vacía (nunca '' ni 'N/A'). */
export function normalizarMatriculaFicha(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const m = valor.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return m === '' ? null : m
}
