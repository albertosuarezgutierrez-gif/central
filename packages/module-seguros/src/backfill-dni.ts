/**
 * Backfill del blind index de DNI (`clientes.dni_lookup_hash`).
 *
 * EL PROBLEMA (medido 03/09/2026): 19.696 fichas tienen el DNI guardado cifrado
 * pero **15.800 de ellas no tienen `dni_lookup_hash`**. Ese hash es la única
 * forma de preguntar «¿hay otra ficha con este mismo DNI?» sin descifrar la
 * base entera, así que el criterio de fusión más fuerte —y el único que Alberto
 * ha aprobado sin reservas, el del lote `fusion-dni-2026-09-02`— sólo pudo
 * mirar 3.896 fichas. De ahí que queden 556 grupos nombre+teléfono sin fusionar
 * (Pilar Piña Franco entre ellos): no es que no se pueda decidir, es que no se
 * ha podido ni preguntar.
 *
 * 🚨 POR QUÉ ESTO NO ES UN `UPDATE ... SET hash = ...` Y YA ESTÁ:
 * `uq_clientes_dni_lookup_hash` es UNIQUE sobre `dni_lookup_hash` para las
 * filas con `tipo='cliente'`. Si dos fichas comparten DNI, escribir el hash en
 * la segunda **revienta**. Y eso no es un estorbo: **el choque ES el hallazgo**.
 * Un DNI repetido es la misma persona dos veces, que es exactamente lo que se
 * busca. Por eso el flujo tiene tres pasos y este módulo sólo hace el primero:
 *
 *   1. CALCULAR sin escribir  → `planBackfillDni()`  ← aquí
 *   2. FUSIONAR los choques   → lote SQL con el motor de `2026-09-02_fusion_dni_lote2.sql`,
 *                               y con el OK de Alberto delante de los nombres
 *   3. ESCRIBIR los hashes    → ya sin conflicto posible
 *
 * Escribir primero y fusionar después no funciona, y fusionar sin mirar tampoco:
 * dos identificadores distintos no se funden jamás (regla del repo), así que lo
 * que este plan produce son CANDIDATOS, nunca una fusión.
 *
 * TRES ESTADOS, NO DOS: una ficha cuyo DNI no se puede descifrar o no parece un
 * documento («X», «-», «PENDIENTE») no es «una ficha sin DNI». Se cuenta aparte
 * (`ilegible`), porque contarla como «sin DNI» convertiría un «no lo sé» en una
 * afirmación, y son justo las fichas que habría que mirar a mano.
 */

/** Una ficha tal y como llega de la BD, con el DNI YA descifrado por el caller. */
export interface FichaDni {
  id: string
  /** `tipo='cliente'` es el único que entra en el índice único parcial. */
  esCliente: boolean
  /** DNI descifrado. `null` si la ficha no tiene, o si no se pudo descifrar. */
  dni: string | null
  /** `true` si el descifrado LANZÓ (clave mala, campo corrupto). Distinto de «no tiene». */
  descifradoFallido?: boolean
  /** Hash que la ficha ya tiene guardado, si lo tiene. */
  hashActual: string | null
}

/** Qué hacer con cada ficha. */
export type Destino =
  /** No tiene DNI que hashear. No es un problema: es que no hay dato. */
  | 'sin_dni'
  /** Ya tiene su hash. Nada que hacer. */
  | 'ya_tiene'
  /** El DNI está pero no se puede leer (no descifra, o no parece un documento). */
  | 'ilegible'
  /** Se puede escribir el hash sin chocar con nadie. */
  | 'rellenable'
  /** Chocaría con el índice único: hay otra ficha `cliente` con ese mismo DNI. */
  | 'choca'

export interface FilaPlan {
  id: string
  destino: Destino
  /** El hash calculado. `null` salvo en `rellenable` y `choca`. */
  hash: string | null
  /** Por qué es ilegible, cuando lo es. Para poder mirarlas a mano. */
  motivo?: 'no_descifra' | 'no_parece_documento'
}

/** Un DNI que aparece en más de una ficha `tipo='cliente'`: candidato a fusión. */
export interface GrupoChoque {
  hash: string
  /** Todas las fichas `cliente` con ese DNI, la que ya tenía hash primero. */
  fichas: string[]
  /** `true` si una de ellas ya llevaba el hash guardado (la que sobrevive por defecto). */
  hayPreexistente: boolean
}

export interface PlanBackfillDni {
  filas: FilaPlan[]
  /** Los DNI repetidos entre fichas `cliente`. Esto es lo que hay que fusionar. */
  choques: GrupoChoque[]
  resumen: {
    total: number
    sinDni: number
    yaTiene: number
    ilegibles: number
    rellenables: number
    enChoque: number
  }
}

/**
 * Decide, sin tocar la BD, qué hash se puede escribir y cuál chocaría.
 *
 * `hash` es la función de hashing real (`computeDniLookupHash` de
 * `@central/module-seguros-pii`), inyectada para que esta pieza sea pura y
 * testeable sin claves. Si devuelve `null` para un DNI que sí existe —lo que
 * pasa cuando falta `PII_LOOKUP_KEY`— la ficha cae en `ilegible`, no en
 * `sin_dni`: no saber hashear no es no tener DNI.
 *
 * `pareceDocumento` filtra los valores de cajón. Es opcional porque la validez
 * del documento no es cosa del blind index; cuando se pasa, un «PENDIENTE» o un
 * «000000» no genera hash y por tanto **no puede fundir a dos personas**, que es
 * el fallo caro (el `'otro'` que pisa al `'vivienda'` de la regla del repo).
 */
export function planBackfillDni(
  fichas: FichaDni[],
  hash: (dni: string) => string | null,
  pareceDocumento?: (dni: string) => boolean,
): PlanBackfillDni {
  const filas: FilaPlan[] = []
  // hash → fichas `cliente` que lo llevarían. Sólo las `cliente` entran en el
  // índice único parcial, así que sólo entre ellas puede haber choque.
  const porHash = new Map<string, { ids: string[]; preexistente: boolean }>()

  for (const f of fichas) {
    if (f.hashActual !== null && f.hashActual !== '') {
      filas.push({ id: f.id, destino: 'ya_tiene', hash: f.hashActual })
      if (f.esCliente) anota(porHash, f.hashActual, f.id, true)
      continue
    }
    if (f.descifradoFallido === true) {
      filas.push({ id: f.id, destino: 'ilegible', hash: null, motivo: 'no_descifra' })
      continue
    }
    if (f.dni === null || f.dni.trim() === '') {
      filas.push({ id: f.id, destino: 'sin_dni', hash: null })
      continue
    }
    if (pareceDocumento !== undefined && !pareceDocumento(f.dni)) {
      filas.push({ id: f.id, destino: 'ilegible', hash: null, motivo: 'no_parece_documento' })
      continue
    }
    const h = seguro(() => hash(f.dni as string))
    if (h === null || h === '') {
      // Hay DNI pero no hay hash: falta la clave o el hashing lanzó. No es «sin DNI».
      filas.push({ id: f.id, destino: 'ilegible', hash: null, motivo: 'no_descifra' })
      continue
    }
    filas.push({ id: f.id, destino: 'rellenable', hash: h })
    if (f.esCliente) anota(porHash, h, f.id, false)
  }

  // Segunda pasada: lo que comparte hash con otra ficha `cliente` no es
  // rellenable, es un choque. Da igual si el gemelo ya tenía el hash guardado
  // (choque contra el índice) o si son dos fichas nuevas con el mismo DNI
  // (choque entre ellas): en los dos casos hay que fusionar antes de escribir.
  const choques: GrupoChoque[] = []
  for (const [h, g] of porHash) {
    if (g.ids.length < 2) continue
    choques.push({ hash: h, fichas: g.ids, hayPreexistente: g.preexistente })
  }
  const enChoque = new Set(choques.flatMap((c) => c.fichas))
  for (const fila of filas) {
    if (fila.destino === 'rellenable' && enChoque.has(fila.id)) fila.destino = 'choca'
  }

  return {
    filas,
    choques,
    resumen: {
      total: filas.length,
      sinDni: filas.filter((f) => f.destino === 'sin_dni').length,
      yaTiene: filas.filter((f) => f.destino === 'ya_tiene').length,
      ilegibles: filas.filter((f) => f.destino === 'ilegible').length,
      rellenables: filas.filter((f) => f.destino === 'rellenable').length,
      enChoque: filas.filter((f) => f.destino === 'choca').length,
    },
  }
}

function anota(
  m: Map<string, { ids: string[]; preexistente: boolean }>,
  hash: string,
  id: string,
  yaLoTenia: boolean,
): void {
  const g = m.get(hash)
  if (g === undefined) {
    m.set(hash, { ids: [id], preexistente: yaLoTenia })
    return
  }
  // La que ya tenía el hash va primero: es la que sobrevive por defecto en la fusión.
  if (yaLoTenia) {
    g.ids.unshift(id)
    g.preexistente = true
  } else {
    g.ids.push(id)
  }
}

function seguro(fn: () => string | null): string | null {
  try {
    return fn()
  } catch {
    return null
  }
}
