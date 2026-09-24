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
 *
 * 🚨 EL DNI CENTINELA: un valor de cajón que SÍ parece un documento (05/09/2026).
 * `looksLikeDniNieCif` filtra los «PENDIENTE» y los «X», pero no puede filtrar un
 * DNI con letra correcta tecleado en veinte fichas distintas. Medido en la
 * cartera: **20 fichas comparten un mismo DNI con 20 nombres sin relación entre
 * sí** («alberto suárez gutiérrez», «alejandro saez caro», «chema 14134», «eva
 * 12895»…) y 19 correos distintos. Eso no es una persona duplicada: es el mismo
 * documento escrito en la ficha de veinte personas.
 *
 * Por qué no basta con el índice único: `uq_clientes_dni_lookup_hash` sólo cubre
 * `tipo='cliente'`, y **14.990 de las 15.092 fichas sin hash son `lead`**. En un
 * lead el hash se escribiría sin que nada fallara, y a partir de ahí una búsqueda
 * por ese DNI devolvería veinte personas — y [Probable] la ingesta de CIMA, que
 * engancha la póliza a la ficha POR ese hash, podría colgarle una póliza viva a
 * quien no es. Por eso el grupo entero se marca `compartido` y **no se escribe
 * ninguno**, lead incluido.
 *
 * ⚠️ CORREGIDO el 05/09/2026, al escribirlo de verdad: el grupo no son 20
 * fichas, son **5.636** — las 20 personas de arriba más **5.615 fichas del
 * volcado sin nombre** («Lead 12345»), todas con ese mismo documento, sin un
 * solo canal de contacto, con pólizas de aseguradora «(legacy)» vencidas entre
 * 2014 y 2018 y **5.454 de ellas sin número de póliza**. Se vieron 20 porque
 * sólo se miraron los grupos de choque, y esos son `tipo='cliente'`; el bulto
 * es `lead`, que es justo donde el índice único no protege. La cifra de 20
 * medía lo que se había mirado, no lo que había.
 *
 * Qué lo distingue de un duplicado de verdad, que es lo que sí se quiere
 * encontrar: **los nombres**. «Adela Gutiérrez Alcalá» y «Adela Alcalá» son la
 * misma persona escrita de dos formas y comparten tokens; veinte nombres sin un
 * solo token en común, no. De ahí la regla: ≥3 nombres distintos Y ningún token
 * compartido por todos. Con dos nombres NO se activa —ahí un DNI mal tecleado y
 * una variante de nombre son indistinguibles— y esos siguen siendo `choca`, que
 * es lo que los pone delante de una persona.
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
  /**
   * Nombre completo de la ficha, SÓLO para detectar el DNI centinela. No se
   * emite en el plan (lo que sale son ids y recuentos): sirve para comparar
   * unos con otros dentro del mismo hash y nada más.
   */
  nombre?: string | null
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
  /**
   * El DNI está escrito en fichas de varias personas distintas: es un centinela,
   * no una identidad. No se escribe en ninguna de ellas, ni siquiera en los
   * `lead`, donde el índice único no protege.
   */
  | 'compartido'

export interface FilaPlan {
  id: string
  destino: Destino
  /** El hash calculado. `null` salvo en `rellenable`, `choca` y `compartido`. */
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

/**
 * Un DNI que aparece en fichas de PERSONAS DISTINTAS: un centinela, no una
 * identidad. No es candidato a fusión — es un dato que hay que corregir.
 */
export interface GrupoCompartido {
  hash: string
  /** Todas las fichas que llevan ese DNI, `cliente` y `lead`. */
  fichas: string[]
  /** Cuántos nombres distintos hay entre ellas. Es lo que lo delata. */
  nombresDistintos: number
}

export interface PlanBackfillDni {
  filas: FilaPlan[]
  /** Los DNI repetidos entre fichas `cliente`. Esto es lo que hay que fusionar. */
  choques: GrupoChoque[]
  /** Los DNI centinela. Esto NO se fusiona: se corrige. */
  compartidos: GrupoCompartido[]
  resumen: {
    total: number
    sinDni: number
    yaTiene: number
    ilegibles: number
    rellenables: number
    enChoque: number
    compartidos: number
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
  // hash → TODAS las fichas que lo llevarían, con su nombre. El centinela no
  // distingue entre `cliente` y `lead`: el índice único no lo protege, y son
  // justo los `lead` los que se escribirían sin que nada fallase.
  const todas = new Map<string, { ids: string[]; nombres: string[][] }>()

  for (const f of fichas) {
    if (f.hashActual !== null && f.hashActual !== '') {
      filas.push({ id: f.id, destino: 'ya_tiene', hash: f.hashActual })
      if (f.esCliente) anota(porHash, f.hashActual, f.id, true)
      anotaTodas(todas, f.hashActual, f.id, f.nombre)
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
    anotaTodas(todas, h, f.id, f.nombre)
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

  // Tercera pasada: los centinelas. Se calcula sobre `todas` (no sobre
  // `porHash`) porque el índice único sólo cubre `tipo='cliente'` y el daño
  // está justo donde no cubre.
  const compartidos: GrupoCompartido[] = []
  for (const [h, g] of todas) {
    if (g.ids.length < 2) continue
    const distintos = new Set(g.nombres.filter((n) => n.length > 0).map((n) => n.join(' ')))
    if (distintos.size < NOMBRES_PARA_CENTINELA) continue
    if (hayTokenComun(g.nombres)) continue
    compartidos.push({ hash: h, fichas: g.ids, nombresDistintos: distintos.size })
  }

  const enChoque = new Set(choques.flatMap((c) => c.fichas))
  const esCentinela = new Set(compartidos.flatMap((c) => c.fichas))
  for (const fila of filas) {
    if (fila.destino !== 'rellenable') continue
    // `compartido` manda sobre `choca`: un choque es una persona repetida (se
    // fusiona) y un centinela es un dato equivocado (se corrige). Confundirlos
    // fundiría a veinte personas en una.
    if (esCentinela.has(fila.id)) fila.destino = 'compartido'
    else if (enChoque.has(fila.id)) fila.destino = 'choca'
  }

  return {
    filas,
    choques,
    compartidos,
    resumen: {
      total: filas.length,
      sinDni: filas.filter((f) => f.destino === 'sin_dni').length,
      yaTiene: filas.filter((f) => f.destino === 'ya_tiene').length,
      ilegibles: filas.filter((f) => f.destino === 'ilegible').length,
      rellenables: filas.filter((f) => f.destino === 'rellenable').length,
      enChoque: filas.filter((f) => f.destino === 'choca').length,
      compartidos: filas.filter((f) => f.destino === 'compartido').length,
    },
  }
}

/**
 * Cuántos nombres distintos hacen falta bajo un mismo DNI para llamarlo
 * centinela. Con DOS no se activa a propósito: ahí «Adela Gutiérrez Alcalá» y
 * «Adela Alcalá» (la misma persona) y un DNI mal tecleado se ven igual, y esos
 * pares ya van a `choca`, que es lo que los pone delante de una persona.
 */
const NOMBRES_PARA_CENTINELA = 3

/**
 * `true` si hay algún token (palabra del nombre) presente en TODAS las fichas
 * del grupo. Es lo que separa una variante de escritura —«Antonio Villega
 * Sánchez» / «Antonio Sánchez» comparten dos— de veinte personas sin relación.
 * Un nombre vacío no cuenta como ficha con nombre: si NINGUNA lo tiene, no se
 * afirma nada y el grupo no se marca (`nombres` vacíos ⇒ 0 distintos ⇒ no llega
 * aquí).
 */
function hayTokenComun(nombres: string[][]): boolean {
  const conNombre = nombres.filter((n) => n.length > 0)
  if (conNombre.length === 0) return true
  let comunes = new Set(conNombre[0])
  for (const n of conNombre.slice(1)) {
    const s = new Set(n)
    comunes = new Set([...comunes].filter((t) => s.has(t)))
    if (comunes.size === 0) return false
  }
  return comunes.size > 0
}

/**
 * Cómo escribió el volcado «esta ficha no trae nombre»: `Lead 12345`.
 *
 * 🚨 Medido el 05/09/2026, y NO es un caso raro: **26.277 fichas se llaman así**
 * —el 82% de la cartera—, ninguna de ellas tiene email ni teléfono, y entre las
 * dos suman 25.694 pólizas, todas vencidas entre 2013 y 2018. O sea, es el
 * marcador de hueco del sistema viejo, que creó una ficha por PÓLIZA.
 */
const MARCA_SIN_NOMBRE = 'lead'

/**
 * Parte un nombre en tokens comparables: sin acentos, sin signos, en minúsculas
 * y **sin los números** que el volcado dejó pegados al apellido («Ángel 14386»,
 * «Chema 14134») — son el código de cliente del sistema viejo, no parte del
 * nombre, y contarlos haría distintos a dos nombres iguales.
 *
 * 🚨 Y «Lead 12345» devuelve `[]`, o sea «esta ficha no tiene nombre», que es
 * justo lo que significa. Tratarlo como un nombre más costó caro (medido el
 * 05/09/2026, el día siguiente a escribir esta pieza): las fichas del volcado
 * que comparten DNI con una persona con nombre —sus propias pólizas viejas, la
 * misma persona— sumaban «lead» como un nombre distinto más, y con eso tres de
 * los cinco grupos centinela eran en realidad **duplicados legítimos** («Jose
 * Angel 12950» + «Jose Angel Benedito Mauri» + dos `Lead N`). El guardián los
 * sacaba de la cola de fusión, que es donde tenían que estar.
 */
export function tokensNombre(nombre: string | null | undefined): string[] {
  if (nombre === null || nombre === undefined) return []
  const tokens = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(sin apellidos\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t !== '' && !/^\d+$/.test(t))
  // Sólo cuando NO queda nada más: un «Lead» que viniera con apellidos de
  // verdad sí sería un nombre, y no hay ninguno así en la cartera.
  if (tokens.length > 0 && tokens.every((t) => t === MARCA_SIN_NOMBRE)) return []
  return tokens
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

function anotaTodas(
  m: Map<string, { ids: string[]; nombres: string[][] }>,
  hash: string,
  id: string,
  nombre: string | null | undefined,
): void {
  const g = m.get(hash)
  if (g === undefined) {
    m.set(hash, { ids: [id], nombres: [tokensNombre(nombre)] })
    return
  }
  g.ids.push(id)
  g.nombres.push(tokensNombre(nombre))
}

function seguro(fn: () => string | null): string | null {
  try {
    return fn()
  } catch {
    return null
  }
}
