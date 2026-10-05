import { normalizarMatricula } from '@central/module-seguros'

/**
 * ¿Se puede escribir el `datosVehiculo` leído de un documento en una oportunidad YA abierta?
 * Conservador (05/10/2026): si la oportunidad ya tenía el coche en las claves antiguas
 * (`matricula` / `vehiculo` texto), el nuevo `datosVehiculo` solo entra si es seguro que es el MISMO coche;
 * si no, taparía en la ficha el vehículo de la corredora.
 * - Con matrícula antigua: solo si coincide con la leída (mayúsculas, sin espacios ni guiones).
 * - Sin matrícula antigua pero con `vehiculo` texto: no se escribe (no se puede saber si es el mismo).
 * - Sin nada antiguo: se escribe.
 */
export function puedeEscribirDatosVehiculo(
  previo: { matricula: string | null; vehiculo: string | null },
  datosVehiculo: Record<string, unknown> | null,
): boolean {
  if (!datosVehiculo) return false
  const vieja = normalizarMatricula(previo.matricula ?? '')
  if (vieja) {
    const leida = typeof datosVehiculo.matricula === 'string' ? normalizarMatricula(datosVehiculo.matricula) : ''
    return leida === vieja
  }
  return !(previo.vehiculo ?? '').trim()
}
