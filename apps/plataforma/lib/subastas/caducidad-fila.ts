// Resumen de caducidad (art. 86 LH) a partir del cuadro guardado en
// `subastas.cargas_detalle`, para que la ficha lo enseñe SIN ABRIR nada.
//
// Va aquí y no en la UI porque el cálculo lo hace el módulo puro y necesita la
// fecha de hoy: en un componente cliente sería no determinista entre servidor y
// cliente (y haría saltar la hidratación de React).
import { cargasQueSubsisten, normalizarCuadroCargas } from '@central/module-subastas'

export interface ResumenCaducidad {
  /** Cuántas anotaciones anteriores podrían estar caducadas. Siempre ≥ 1. */
  cuantas: number
  /** Lo que se heredaría si se confirmara. `null` si no se puede cuantificar. */
  importeSiCaducan: number | null
}

/**
 * `null` cuando no hay nada que decir — que es el caso normal. Solo devuelve
 * algo cuando de verdad hay una anotación pasada de plazo y sin prórroga: así
 * la ficha no gana ruido en las subastas limpias.
 */
export function caducidadDeFila(cargasDetalle: unknown, hoy = new Date()): ResumenCaducidad | null {
  if (!cargasDetalle || typeof cargasDetalle !== 'object') return null
  try {
    const cuadro = normalizarCuadroCargas(cargasDetalle, 'ocr_ia')
    if (!cuadro.cargas.length) return null
    const s = cargasQueSubsisten(cuadro, hoy)
    if (!s.posiblesCaducadas.length) return null
    return { cuantas: s.posiblesCaducadas.length, importeSiCaducan: s.importeSiCaducan }
  } catch {
    // Un cuadro corrupto no puede tumbar la pantalla: simplemente no se dice nada.
    return null
  }
}
