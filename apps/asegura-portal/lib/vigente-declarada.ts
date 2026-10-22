// «¿Sigue vigente esta póliza?» — validación PURA del cuerpo del PATCH (22/10/2026).
//
// Tres respuestas y NULL, como la columna `portal_poliza_declarada.vigente_declarada`:
//   'si' | 'no' | 'no_sabe'   = lo que contestó el cliente.
//   null                      = «no contestado» (borra una respuesta previa). NUNCA se lee como «sí».
// AUSENTE (la clave no viene) ≠ null: ausente no toca la columna.
//
// Qué puede ir junto a qué (lo decide aquí, no la ruta):
//   - 'si' + prima/fecha/… → la vía normal de corrección (se marca `confirmadaPorUsuario`).
//   - 'no' / 'no_sabe' / null → SOLAS: solo guardan la respuesta. Un «no» con una prima nueva al
//     lado no tiene sentido (¿la corrige o la quita?): se rechaza en vez de adivinar.
//   - 'no' → la ruta la QUITA por borrado lógico (`eliminadaEn`), igual que el DELETE.

export const VIGENCIAS_DECLARADAS = ['si', 'no', 'no_sabe'] as const
export type VigenciaDeclarada = (typeof VIGENCIAS_DECLARADAS)[number]

export type LecturaVigencia =
  | { tipo: 'ausente' }
  | { tipo: 'error'; error: 'vigente_declarada_invalida' | 'vigente_declarada_con_cambios' }
  /** Solo la respuesta, sin más campos. */
  | { tipo: 'sola'; valor: VigenciaDeclarada | null }
  /** 'si' junto a una corrección de datos (prima, fecha…). */
  | { tipo: 'con_cambios'; valor: 'si' }

export function esVigenciaDeclarada(v: unknown): v is VigenciaDeclarada {
  return typeof v === 'string' && (VIGENCIAS_DECLARADAS as readonly string[]).includes(v)
}

export function leerVigenciaDeclarada(cuerpo: unknown): LecturaVigencia {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { tipo: 'ausente' }
  const bruto = cuerpo as Record<string, unknown>
  if (!('vigenteDeclarada' in bruto) || bruto.vigenteDeclarada === undefined) return { tipo: 'ausente' }

  const valor = bruto.vigenteDeclarada
  // Sin recortes ni mayúsculas «amables»: el vocabulario es cerrado y lo manda nuestra propia UI.
  if (valor !== null && !esVigenciaDeclarada(valor)) return { tipo: 'error', error: 'vigente_declarada_invalida' }

  const otros = Object.keys(bruto).filter((k) => k !== 'vigenteDeclarada' && bruto[k] !== undefined)
  if (otros.length === 0) return { tipo: 'sola', valor }
  if (valor === 'si') return { tipo: 'con_cambios', valor }
  return { tipo: 'error', error: 'vigente_declarada_con_cambios' }
}
