// Tomador = el MEDIADOR en las exploraciones de patinete y Pelayo (Alberto, 28/10/2026: «datos del mediador con su consentimiento»).
// Función PURA. Los datos salen de `MEDIADOR` (`@central/module-seguros`), la única copia: ningún literal aquí ni en los tests.
// Forma = la de `riesgo.tomador` que lee el resolver del explorador (`tomador.nif`, `.nombre`, `.apellido1`, `.apellido2`,
// `.nombreCompleto`, `.fechaNacimiento` ISO, `.documentoIdentidad`, `.telefono`, `.email`). Solo para entradas con `tomadorMediador` (ver `explorador.ts` del módulo).

import { MEDIADOR } from '@central/module-seguros'
import { riesgoTomadorDeMediador, type IdentidadTomadorMediador, type RiesgoTomadorMediador } from '@central/module-tarificacion'

export type { RiesgoTomadorMediador }

/**
 * `riesgo` de una exploración SINTÉTICA con `tomadorMediador`: solo el tomador. El mapeo es UNO (`riesgoTomadorDeMediador` del
 * módulo, puro; también lo usa el pilotaje del worker): aquí solo se le pasa `MEDIADOR.identidad`. Un dato que no trae se OMITE.
 */
export function riesgoTomadorMediador(m: IdentidadTomadorMediador = MEDIADOR.identidad): RiesgoTomadorMediador {
  return riesgoTomadorDeMediador(m)
}

/** El `riesgo` de la respuesta al worker con el tomador del mediador añadido (solo en la respuesta, nunca en BD). */
export function riesgoConTomadorMediador(riesgo: unknown): Record<string, unknown> {
  const base = typeof riesgo === 'object' && riesgo !== null && !Array.isArray(riesgo) ? (riesgo as Record<string, unknown>) : {}
  return { ...base, ...riesgoTomadorMediador() }
}
