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
 *  - 🔒 La fecha de EXPEDICIÓN (21/10/2026) cruza el puente SOLO para las fichas de `fichasConExpedicion`
 *    (`fichasQueVenExpedicion`): las que la identidad tiene con vínculo `gestionar`/`administrar`. Hoy coincide
 *    con las legibles (la misma puerta), pero se decide aparte y FAIL-CLOSED: si mañana se leen carnés con
 *    otro nivel, la expedición (que sirve para verificar el dato y deducir la edad) no se va con ellos. Sin el
 *    conjunto, no sale ninguna.
 *  - `fechaCaducidad: null` = hay carné pero no se puede calcular (falta la fecha de nacimiento de la ficha):
 *    el portal lo dice, no lo esconde ni lo da por «sin carné».
 */

import { NIVELES_QUE_OPERAN } from './ficha-de-poliza.ts'

export type FichaTitular = { id: string; nombre: string; tipoPersona: string | null }

export type CarnetDeFicha = {
  clienteId: string
  id: string
  tipo: string
  fechaCaducidad: string | null
  /** `aaaa-mm-dd` descifrada, o `null` si no es una fecha legible. Solo cruza el puente si la ficha la permite. */
  fechaExpedicion?: string | null
}

export type CarnetPortal = { id: string; tipo: string; fechaCaducidad: string | null; fechaExpedicion?: string | null }

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
 * Las fichas cuya fecha de expedición puede ver esta identidad: vínculo que OPERA (`gestionar`/`administrar`,
 * o sea, el titular o quien actúa con plenos poderes sobre su ficha). `tarjeta`, `completo` o un nivel
 * desconocido → no. Misma lista que `fichasLegiblesDeCarnets`, por separado a propósito (ver cabecera).
 */
export function fichasQueVenExpedicion(vinculos: readonly { clienteId: string; nivel: string }[]): Set<string> {
  return new Set(fichasLegiblesDeCarnets(vinculos))
}

/** Solo una fecha `aaaa-mm-dd` real cruza el puente; cualquier otra cosa es «no consta». */
export function expedicionParaPortal(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === t ? t : null
}

/**
 * Agrupa los carnés por su ficha dueña. Orden: el de `fichas` (el llamador las pasa ordenadas); dentro de
 * cada titular, por fecha de caducidad (la más cercana primero) y luego por tipo, para que sea estable.
 */
export function agruparCarnetsPorTitular(
  fichas: readonly FichaTitular[],
  carnets: readonly CarnetDeFicha[],
  /** Fichas de las que se puede enseñar la expedición. Ausente = de ninguna (fail-closed). */
  fichasConExpedicion: ReadonlySet<string> = new Set(),
): TitularCarnets[] {
  const porFicha = new Map<string, CarnetPortal[]>()
  for (const f of fichas) {
    const id = limpio(f.id)
    if (id !== '' && !porFicha.has(id)) porFicha.set(id, [])
  }
  for (const c of carnets) {
    const lista = porFicha.get(limpio(c.clienteId))
    if (!lista) continue // dueño fuera de las fichas leídas: no se cuelga de nadie
    const expedicion = fichasConExpedicion.has(limpio(c.clienteId)) ? expedicionParaPortal(c.fechaExpedicion) : null
    lista.push({
      id: c.id,
      tipo: c.tipo,
      fechaCaducidad: c.fechaCaducidad,
      ...(fichasConExpedicion.has(limpio(c.clienteId)) ? { fechaExpedicion: expedicion } : {}),
    })
  }
  const vistos = new Set<string>()
  const titulares: TitularCarnets[] = []
  for (const f of fichas) {
    const id = limpio(f.id)
    if (id === '' || vistos.has(id)) continue
    vistos.add(id)
    const lista = porFicha.get(id) ?? []
    if (f.tipoPersona === 'juridica' && lista.length === 0) continue
    // Sin caducidad calculable (`null`) al final: lo más urgente primero, lo que no se sabe después.
    lista.sort((a, b) => (a.fechaCaducidad ?? '9999-12-31').localeCompare(b.fechaCaducidad ?? '9999-12-31') || a.tipo.localeCompare(b.tipo))
    titulares.push({ fichaId: id, nombre: f.nombre.trim(), carnets: lista })
  }
  return titulares
}
