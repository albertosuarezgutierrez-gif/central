// Sexo elegido en el cotizador (moto/auto) → ficha del cliente (19/10/2026). PURO salvo `guardarSexoEnFicha`.
//
// Antes el selector «Sexo» (obligatorio en Allianz Moto) solo viajaba en `correcciones` al bot/cotización y NUNCA se guardaba:
// al volver a entrar la ficha seguía sin él. Regla: se persiste SOLO si la precalificación dice que la ficha no lo tiene
// (`faltan` con `sexo`) y el corredor eligió Hombre/Mujer. Con la ficha informada el selector ni aparece, y `faltan === null`
// (sin precalificar) es «no se sabe»: ante la duda no se escribe, para no pisar un sexo ya guardado.
import { SEXOS_FICHA, type SexoFicha } from '@central/module-seguros'

export function sexoAPersistir(faltan: readonly { campo: string }[] | null | undefined, elegido: string | null | undefined): SexoFicha | null {
  if (!faltan || !faltan.some((f) => f.campo === 'sexo')) return null
  const v = typeof elegido === 'string' ? elegido.trim() : ''
  return (SEXOS_FICHA as readonly string[]).includes(v) ? (v as SexoFicha) : null
}

/** PATCH de la ficha con solo `{ id, sexo }` (el resto no se toca). `true` = guardado. Nunca lanza. */
export async function guardarSexoEnFicha(clienteId: string, sexo: SexoFicha): Promise<boolean> {
  try {
    const res = await fetch('/api/correduria/cliente', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: clienteId, sexo }),
    })
    return res.ok
  } catch {
    return false
  }
}
