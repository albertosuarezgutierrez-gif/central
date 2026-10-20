// Estado civil elegido en el cotizador (moto/auto) → ficha del cliente (20/10/2026). PURO salvo `guardarEstadoCivilEnFicha`.
//
// Hermano de `sexo-cotizador-ficha.ts`. El selector «Estado civil» precarga lo que la ficha trae SI casa con el catálogo de
// Codeoscopic (`estadoCivilMoto`/`estadoCivilAuto` de la precalificación); si no lo trae o no casa, el corredor lo elige y
// hasta hoy se perdía: la próxima vez había que volver a elegirlo. Regla:
//   - solo se guarda si la ficha NO lo traía emparejado (precargado `null`) y la precalificación se pudo hacer
//     (`faltan === null` = no se sabe nada de la ficha: ante la duda no se escribe);
//   - solo una opción DEL CATÁLOGO y nunca una de cajón («otro», «N/A»);
//   - se manda el id; asegura lo vuelve a validar contra el catálogo, guarda su NOMBRE (lo que `emparejar` precarga la
//     próxima vez) y, en el primer guardado, `estadoCivilSoloSiNoCasa`: si entretanto la ficha ya tiene uno que casa, no
//     lo pisa. Los cambios siguientes en la misma pantalla corrigen lo que acabamos de guardar nosotros.
import { estadoCivilGuardable } from '@central/module-seguros'

type Opcion = { id: string; nombre: string }

export type AccionEstadoCivil = { estadoCivil: string; soloSiNoCasa: boolean }

export function estadoCivilAPersistir(e: {
  /** Lo que la precalificación emparejó con la ficha. Con valor, la ficha ya lo tiene bien: no se toca. */
  precargado: Opcion | null
  /** `false` = la precalificación no se pudo hacer (`faltan === null`): no se sabe qué tiene la ficha. */
  precalificado: boolean
  elegidoId: string | null | undefined
  catalogo: readonly Opcion[]
  /** Id que ya se guardó en esta pantalla (para no repetir y para no exigir «solo si no casa» a nuestro propio guardado). */
  yaGuardadoId?: string | null
  /** Tomador empresa: no tiene estado civil. */
  empresa?: boolean
}): AccionEstadoCivil | null {
  if (!e.precalificado || e.precargado !== null || e.empresa === true) return null
  const id = typeof e.elegidoId === 'string' ? e.elegidoId.trim() : ''
  if (id === '') return null
  const op = e.catalogo.find((o) => o.id === id)
  if (!op || !estadoCivilGuardable(op.nombre).ok) return null
  if ((e.yaGuardadoId ?? null) === id) return null
  return { estadoCivil: id, soloSiNoCasa: (e.yaGuardadoId ?? null) === null }
}

/** PATCH de la ficha con solo `{ id, estadoCivil }` (el resto no se toca). `true` = guardado (o la ficha ya lo tenía). Nunca lanza. */
export async function guardarEstadoCivilEnFicha(clienteId: string, a: AccionEstadoCivil): Promise<boolean> {
  try {
    const res = await fetch('/api/correduria/cliente', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: clienteId, estadoCivil: a.estadoCivil, ...(a.soloSiNoCasa ? { estadoCivilSoloSiNoCasa: true } : {}) }),
    })
    return res.ok
  } catch {
    return false
  }
}
