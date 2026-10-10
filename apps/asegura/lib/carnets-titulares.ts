/**
 * Carnés de conducir AGRUPADOS POR TITULAR — la regla pura del puente `GET /api/portal/carnets`.
 *
 * Una identidad del portal puede estar casada (`portal_vinculo`) con varias fichas (la suya y la de su
 * empresa, o dos fichas con el mismo correo). Antes, con más de una, el puente contestaba `varias_fichas`
 * y el portal decía «no hemos podido comprobar tu carné». Juntar los carnés de dos fichas en una lista
 * plana mezclaría personas («tu carné» siendo el de otra), así que se devuelven SEPARADOS, cada uno con
 * el nombre de su ficha:
 *
 *  - 🚨 Un carné solo va con la ficha que es su DUEÑA (`cliente_id` leído de BD). Uno cuyo dueño no está
 *    entre las fichas leídas se DESCARTA: nunca se cuelga de otra persona.
 *  - 🚨 El carné es un dato de la PERSONA, no de la cosa (como en `module-seguros-portal/acceso.ts`): solo se
 *    leen los de las fichas cuyo vínculo OPERA (`NIVELES_QUE_OPERAN`: gestionar/administrar). Un vínculo
 *    `tarjeta` o `completo` a la ficha de otra persona no expone sus carnés; nivel desconocido = no legible.
 *  - Una ficha de EMPRESA (`juridica`) sin carnés no es titular: una SL no conduce, y contarla haría que
 *    el caso normal (persona + su empresa) se pintara con cabeceras sin motivo. Si la empresa tiene
 *    carnés (dato raro), sí cuenta: esconderlos sería decir «no hay» de algo que sí hay.
 *  - `nombrar` = hay más de un titular: entonces cada carné lleva el nombre; con uno, igual que siempre.
 */

import { NIVELES_QUE_OPERAN } from './ficha-de-poliza.ts'

export type FichaTitular = { id: string; nombre: string; tipoPersona: string | null }

export type CarnetDeFicha = { clienteId: string; id: string; tipo: string; fechaCaducidad: string }

export type CarnetPortal = { id: string; tipo: string; fechaCaducidad: string }

export type TitularCarnets = { fichaId: string; nombre: string; carnets: CarnetPortal[] }

function limpio(id: string | null | undefined): string {
  return typeof id === 'string' ? id.trim() : ''
}

/** Las fichas (sin repetir, ordenadas) de las que esta identidad puede LEER carnés: solo las de vínculo que opera. */
export function fichasLegiblesDeCarnets(vinculos: readonly { clienteId: string; nivel: string }[]): string[] {
  return [
    ...new Set(
      vinculos
        .filter((v) => (NIVELES_QUE_OPERAN as readonly string[]).includes(v.nivel))
        .map((v) => limpio(v.clienteId))
        .filter((id) => id !== ''),
    ),
  ].sort()
}

/**
 * Agrupa los carnés por su ficha dueña. Orden: el de `fichas` (el llamador las pasa ordenadas); dentro de
 * cada titular, por fecha de caducidad (la más cercana primero) y luego por tipo, para que sea estable.
 */
export function agruparCarnetsPorTitular(
  fichas: readonly FichaTitular[],
  carnets: readonly CarnetDeFicha[],
): TitularCarnets[] {
  const porFicha = new Map<string, CarnetPortal[]>()
  for (const f of fichas) {
    const id = limpio(f.id)
    if (id !== '' && !porFicha.has(id)) porFicha.set(id, [])
  }
  for (const c of carnets) {
    const lista = porFicha.get(limpio(c.clienteId))
    if (!lista) continue // dueño fuera de las fichas leídas: no se cuelga de nadie
    lista.push({ id: c.id, tipo: c.tipo, fechaCaducidad: c.fechaCaducidad })
  }
  const vistos = new Set<string>()
  const titulares: TitularCarnets[] = []
  for (const f of fichas) {
    const id = limpio(f.id)
    if (id === '' || vistos.has(id)) continue
    vistos.add(id)
    const lista = porFicha.get(id) ?? []
    if (f.tipoPersona === 'juridica' && lista.length === 0) continue
    lista.sort((a, b) => a.fechaCaducidad.localeCompare(b.fechaCaducidad) || a.tipo.localeCompare(b.tipo))
    titulares.push({ fichaId: id, nombre: f.nombre.trim(), carnets: lista })
  }
  return titulares
}
