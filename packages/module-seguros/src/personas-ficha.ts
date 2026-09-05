// UNA sola lista de personas por ficha: las que salen en sus pólizas (lo que
// dice CIMA) y las que tienen un vínculo declarado (lo que hemos anotado
// nosotros), fundidas por IDENTIDAD.
//
// Por qué se juntan: las dos tarjetas contestaban la MISMA pregunta —«¿a quién
// llamo y con qué derecho?»— y obligaban a leerla dos veces y a cruzarla a ojo.
// El conductor habitual salía en una, el administrador autorizado en la otra, y
// cuando era la misma persona no había forma de verlo.
//
// 🚨 Por qué NO se funden del todo: son datos de PROCEDENCIA distinta y eso no
// se puede borrar. Un papel en una póliza es un hecho de la compañía; un vínculo
// declarado es nuestro, y su autorización abre las pólizas en el portal del
// cliente. Cada fila conserva las dos caras por separado (`papeles` y `vinculo`)
// para que la pantalla pueda decir de dónde sale cada cosa.
//
// 🚨 Y se funde por FICHA, nunca por nombre (regla global de identidad): dos
// homónimos —el padre y el hijo de la póliza del mismo coche— colapsarían en una
// fila con los teléfonos mezclados, que es el fallo que no se ve. Una persona
// que CIMA no ha enlazado a ninguna ficha no se funde con nadie: se queda sola,
// y la pantalla dice por qué.

import type { PersonaDePolizas } from './intervinientes.ts'

/** Lo mínimo que se le pide a un vínculo para poder unirlo. La pantalla pasa el
 *  suyo entero (con su autorización) y lo recupera tal cual en `vinculo`. */
export type VinculoUnible = { relacionadoId: string; nombre: string; tipo: string }

export type PersonaFicha<V extends VinculoUnible> = {
  /** Estable entre renders: la ficha cuando la hay, y si no la clave de la persona. */
  clave: string
  nombre: string | null
  /** El nombre está, pero cifrado y no se pudo descifrar (≠ no tiene nombre). */
  nombreIlegible: boolean
  fichaId: string | null
  telefono: string | null
  email: string | null
  /** Lo que dice CIMA: qué es en cada póliza. Vacío = no sale en ninguna. */
  papeles: { rol: string; polizas: string[] }[]
  /** Lo que hemos anotado nosotros. `null` = no hay vínculo declarado. */
  vinculo: V | null
  homonimia: PersonaDePolizas['homonimia']
}

export type ListaPersonasFicha<V extends VinculoUnible> = {
  lista: PersonaFicha<V>[]
  /** No se pudo leer quién interviene en sus pólizas. NO es «no hay nadie». */
  sinLeerPolizas: boolean
  /** No se pudieron leer los vínculos. NO es «no tiene ninguno». */
  sinLeerVinculos: boolean
}

/**
 * Junta las dos fuentes en una lista.
 *
 * Se conserva el orden que trae `personasDePolizas` (ya decidido allí) y se
 * anexan al final los vínculos que no salen en ninguna póliza, en su orden: son
 * gente de la que no hay hecho operativo que contar, y ponerlos arriba
 * desplazaría a quien conduce el coche del que va la llamada.
 *
 * `null` en cualquiera de las dos entradas es «no se ha podido leer», y se
 * propaga como bandera en vez de convertirse en una lista vacía: la pantalla
 * tiene que poder decir «no lo sé» y no «no hay».
 */
export function unificarPersonas<V extends VinculoUnible>(
  personas: PersonaDePolizas[] | null,
  vinculos: readonly V[] | null,
): ListaPersonasFicha<V> {
  const porFicha = new Map<string, V>()
  for (const v of vinculos ?? []) if (!porFicha.has(v.relacionadoId)) porFicha.set(v.relacionadoId, v)

  const lista: PersonaFicha<V>[] = []
  const usados = new Set<string>()

  for (const p of personas ?? []) {
    // Sin ficha no hay identidad que casar: se queda sola aunque el nombre
    // coincida con el de un vínculo. Fundirlas por el nombre es la mentira cara.
    const v = p.fichaId === null ? null : (porFicha.get(p.fichaId) ?? null)
    if (v && p.fichaId !== null) usados.add(p.fichaId)
    lista.push({
      clave: p.fichaId ?? p.clave,
      nombre: p.nombre,
      nombreIlegible: p.nombreIlegible,
      fichaId: p.fichaId,
      telefono: p.telefono,
      email: p.email,
      papeles: p.papeles,
      vinculo: v,
      homonimia: p.homonimia,
    })
  }

  for (const v of vinculos ?? []) {
    if (usados.has(v.relacionadoId)) continue
    usados.add(v.relacionadoId)
    lista.push({
      clave: v.relacionadoId,
      nombre: v.nombre,
      nombreIlegible: false,
      fichaId: v.relacionadoId,
      // Un vínculo no trae contacto: el teléfono vive en la ficha del otro. No
      // es «no tiene» — por eso la pantalla manda a su ficha en vez de decirlo.
      telefono: null,
      email: null,
      papeles: [],
      vinculo: v,
      homonimia: null,
    })
  }

  return { lista, sinLeerPolizas: personas === null, sinLeerVinculos: vinculos === null }
}

/** Sale en alguna de sus pólizas (lo dice CIMA). */
export function saleEnPolizas(p: PersonaFicha<VinculoUnible>): boolean {
  return p.papeles.length > 0
}
