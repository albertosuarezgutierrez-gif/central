// Fichaje desde el taller (puerto de operador). Validación PURA de la entrada; la BD vive en el route.
import { isIP } from 'node:net'

export type EntradaFichajeTaller = {
  empresa_id: string
  accion: 'entrada' | 'salida'
  /** Identificador estable del empleado: `empleado_id` (uuid) o `dni` (NIF normalizado). Uno de los dos. */
  empleado_id: string | null
  dni: string | null
  /** IP del trabajador tal y como la vio el taller; null si no es una IP válida. */
  ip: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** NIF/DNI comparable: mayúsculas, sin espacios, puntos ni guiones. */
export function normalizaNif(v: string): string {
  return v.toUpperCase().replace(/[\s.\-]/g, '')
}

export function validarFichajeTaller(body: unknown): { ok: true; datos: EntradaFichajeTaller } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const empresa_id = typeof b.empresa_id === 'string' ? b.empresa_id.trim() : ''
  if (!UUID.test(empresa_id)) return { ok: false, error: 'empresa_id no válido' }
  if (b.accion !== 'entrada' && b.accion !== 'salida') return { ok: false, error: "accion debe ser 'entrada' o 'salida'" }
  const eid = typeof b.empleado_id === 'string' ? b.empleado_id.trim() : ''
  const dni = typeof b.dni === 'string' ? normalizaNif(b.dni) : ''
  if (eid && dni) return { ok: false, error: 'Indica empleado_id o dni, no ambos' }
  if (eid && !UUID.test(eid)) return { ok: false, error: 'empleado_id no válido' }
  if (!eid && !dni) return { ok: false, error: 'Falta el identificador del empleado (empleado_id o dni)' }
  const ipRaw = typeof b.ip === 'string' ? b.ip.trim() : ''
  return { ok: true, datos: { empresa_id, accion: b.accion, empleado_id: eid || null, dni: dni || null, ip: ipRaw && isIP(ipRaw) ? ipRaw : null } }
}
