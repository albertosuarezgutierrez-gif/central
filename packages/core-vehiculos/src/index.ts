// Punto único de entrada: quien consuma este paquete solo conoce
// `resolverMatricula`, nunca el proveedor real detrás. Cambiar de proveedor
// es cambiar esta función, no las apps que la llaman.
import { consultarApiVehiculo } from './apivehiculo.ts'
import type { DatosVehiculo } from './tipos.ts'

export type { DatosVehiculo }

export async function resolverMatricula(matricula: string, pais: 'ES' | 'PT' = 'ES'): Promise<DatosVehiculo | null> {
  return consultarApiVehiculo(matricula, pais)
}
