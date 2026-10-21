// Lo PURO de la comparativa guardada (20/10/2026): la huella de la entrada y la lectura de la narrativa de un
// `estudio`. Sin BD (lo cubre `comparativa-huella.test.ts`); la parte con BD vive en `comparativa-guardada.ts`.

import { createHash } from 'node:crypto'
import { textoHuellaComparativa, type OfertaNormalizada, type RamoOferta } from '@central/module-seguros'
import type { Narrativa } from './estudio-ia.ts'

/** sha256 hex de la entrada de la comparativa. Misma entrada (en cualquier orden) → misma huella. PURO. */
export function huellaComparativa(input: { ramo: RamoOferta; ofertas: readonly OfertaNormalizada[]; superficieM2?: number | null; recomendadaId?: string | null }): string {
  const texto = textoHuellaComparativa({ ramo: input.ramo, ofertas: input.ofertas, superficieM2: input.superficieM2 ?? null, extra: { recomendadaId: input.recomendadaId ?? null } })
  return createHash('sha256').update(texto, 'utf8').digest('hex')
}

/** La narrativa de un `estudio` guardado, validada de forma. `null` = no hay una legible. PURO. */
export function narrativaDeEstudio(estudio: unknown): Narrativa | null {
  if (!estudio || typeof estudio !== 'object' || Array.isArray(estudio)) return null
  const n = (estudio as Record<string, unknown>).narrativa
  if (!n || typeof n !== 'object' || Array.isArray(n)) return null
  const x = n as Record<string, unknown>
  if (typeof x.resumen !== 'string' || typeof x.recomendacion !== 'string') return null
  if (x.fuente !== 'ia' && x.fuente !== 'determinista') return null
  return {
    resumen: x.resumen, recomendacion: x.recomendacion, fuente: x.fuente, descartada: typeof x.descartada === 'string' ? x.descartada : null,
    ...(typeof x.revisada === 'boolean' ? { revisada: x.revisada } : {}),
  }
}

/**
 * ¿Se puede heredar este resumen guardado en un estudio nuevo con la misma huella? Solo si lo redactó la IA (y pasó
 * sus cepos). Uno de PLANTILLA no: la IA falló o no tenía cupo, y la siguiente consolidación debe reintentarla. PURO.
 */
export function narrativaReutilizable(n: Narrativa | null | undefined): n is Narrativa {
  return !!n && n.fuente === 'ia'
}
