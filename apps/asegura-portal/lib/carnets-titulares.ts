/**
 * Lectura PURA de la respuesta del puente `GET /api/portal/carnets` (de `apps/asegura`), por titular.
 *
 * Una identidad puede estar vinculada a varias fichas (la suya y la de su empresa, o dos fichas con el
 * mismo correo). Antes el puente contestaba `varias_fichas` y el portal decía «no hemos podido comprobar
 * tu carné». Ahora los devuelve AGRUPADOS POR TITULAR (ficha dueña + nombre):
 *
 *  - `ok` → un titular (trae también la lista plana de siempre, `carnets`).
 *  - `varios_titulares` → varios; cada carné va con el nombre de su titular hacia la campana y la
 *    precarga, para no decir «tu carné» del de otra persona.
 *  - `sin_ficha` → `[]` (no hay ficha nuestra que mirar: no es que no se sepa).
 *  - Cualquier otra cosa (puente caído, `error`, forma rara) → `null` = NO se ha podido mirar. Nunca `[]`.
 */
import type { CarnetParaAviso } from '@central/module-seguros-portal'

export type CarnetDeTitular = { id: string; tipo: string; fechaCaducidad: string }
export type TitularCarnets = { fichaId: string; nombre: string; carnets: CarnetDeTitular[] }

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function carnetsValidos(crudo: unknown): CarnetDeTitular[] {
  return (Array.isArray(crudo) ? crudo : [])
    .filter(esObjeto)
    .filter((c) => typeof c.id === 'string' && typeof c.tipo === 'string' && typeof c.fechaCaducidad === 'string')
    .map((c) => ({ id: c.id as string, tipo: c.tipo as string, fechaCaducidad: c.fechaCaducidad as string }))
}

/**
 * `TitularCarnets[]` si se ha podido mirar (`[]` = mirado, no hay); `null` si no. Un titular sin `fichaId`
 * no se acepta: sin dueño no se puede decir de quién es, y con varios eso es justo lo que no se mezcla.
 */
export function interpretarCarnets(status: number, j: unknown): TitularCarnets[] | null {
  if (!esObjeto(j)) return null
  const estado = typeof j.estado === 'string' ? j.estado : null
  if (estado === 'sin_ficha') return []
  if (!(status >= 200 && status < 300)) return null
  if (estado !== 'ok' && estado !== 'varios_titulares') return null

  if (Array.isArray(j.titulares)) {
    const titulares: TitularCarnets[] = []
    for (const t of j.titulares) {
      if (!esObjeto(t) || typeof t.fichaId !== 'string' || t.fichaId.trim() === '') return null
      titulares.push({ fichaId: t.fichaId, nombre: typeof t.nombre === 'string' ? t.nombre.trim() : '', carnets: carnetsValidos(t.carnets) })
    }
    return titulares
  }
  // Puente anterior (sin `titulares`): solo vale el `ok` de una ficha, con su lista plana.
  if (estado === 'ok') return [{ fichaId: '', nombre: '', carnets: carnetsValidos(j.carnets) }]
  return null
}

/**
 * La lista plana para la campana y la precarga. Con VARIOS titulares cada carné lleva el nombre del suyo
 * (`titular`); con uno, `null` («tu carné», como siempre). Un titular sin nombre visible entre varios
 * se nombra «otra ficha vinculada»: callarlo lo convertiría en «tu carné».
 */
export function carnetsParaAviso(titulares: readonly TitularCarnets[]): CarnetParaAviso[] {
  const varios = titulares.length > 1
  return titulares.flatMap((t) =>
    t.carnets.map((c) => ({
      id: c.id,
      tipo: c.tipo,
      fechaCaducidad: c.fechaCaducidad,
      titular: varios ? (t.nombre !== '' ? t.nombre : 'otra ficha vinculada') : null,
    })),
  )
}
