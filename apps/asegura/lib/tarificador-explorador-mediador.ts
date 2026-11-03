// Tomador = el MEDIADOR en las exploraciones de patinete (Alberto, 28/10/2026: «datos del mediador con su consentimiento»).
// Función PURA. Los datos salen de `MEDIADOR` (`@central/module-seguros`), la única copia: ningún literal aquí ni en los tests.
// Forma = la de `riesgo.tomador` que lee el resolver del explorador (`tomador.nif`, `.nombre`, `.apellido1`, `.apellido2`,
// `.nombreCompleto`, `.fechaNacimiento` ISO). Solo para entradas con `tomadorMediador` (ver `explorador.ts` del módulo).

import { MEDIADOR } from '@central/module-seguros'

export type RiesgoTomadorMediador = { tomador: Record<string, string> }

/**
 * `riesgo` de una exploración SINTÉTICA de patinete: solo el tomador. Un dato que `MEDIADOR` no trae (o que no se puede
 * separar sin adivinar) se OMITE: el explorador para con `dato_sensible_requerido` y lo cuenta; nada se inventa.
 * El nombre se parte solo si son EXACTAMENTE tres palabras (nombre + dos apellidos); si no, solo `nombreCompleto`.
 */
export function riesgoTomadorMediador(m: { nombre: string; nif: string; fechaNacimiento?: string } = MEDIADOR.identidad): RiesgoTomadorMediador {
  const t: Record<string, string> = {}
  const nif = m.nif.trim()
  if (nif) t.nif = nif
  const completo = m.nombre.trim().replace(/\s+/g, ' ')
  if (completo) {
    t.nombreCompleto = completo
    const partes = completo.split(' ')
    if (partes.length === 3) {
      t.nombre = partes[0]!
      t.apellido1 = partes[1]!
      t.apellido2 = partes[2]!
    }
  }
  const nac = m.fechaNacimiento?.trim()
  if (nac && /^\d{4}-\d{2}-\d{2}$/.test(nac)) t.fechaNacimiento = nac
  return { tomador: t }
}

/** El `riesgo` de la respuesta al worker con el tomador del mediador añadido (solo en la respuesta, nunca en BD). */
export function riesgoConTomadorMediador(riesgo: unknown): Record<string, unknown> {
  const base = typeof riesgo === 'object' && riesgo !== null && !Array.isArray(riesgo) ? (riesgo as Record<string, unknown>) : {}
  return { ...base, ...riesgoTomadorMediador() }
}
