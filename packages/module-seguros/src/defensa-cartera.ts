// DEFENSA DE CARTERA: en qué compañías NO se le puede hacer póliza nueva a un
// cliente, porque ya es cliente de ellas.
//
// Dictado por Alberto (21/09/2026), sobre la tabla de 24 precios de retarificar:
// «Si José Suárez tiene póliza en una compañía no puedo hacérsela en la misma…
// iría por defensa de cartera pero no podría hacer póliza nueva.» La compañía
// no rechaza el precio: lo da igual. Lo que no acepta es que el negocio entre
// por nosotros, porque ese cliente ya es suyo y lo manda a retención.
//
// ─── El emparejamiento es el problema, no la regla ──────────────────────────
// La regla («¿tiene póliza aquí?») es trivial. Lo difícil es saber que «Mapfre»
// del vendor y «MAPFRE ESPAÑA COMPAÑIA DE SEGUROS Y REASEGUROS SA» de CIMA son
// la misma entidad — y eso es exactamente el fallo que `CLAUDE.md` llama
// «agrupar por la ETIQUETA, no por la IDENTIDAD», que falla en las dos
// direcciones:
//
//   · **Falso positivo** (decimos «ocupada» y estaba libre) → esconde un precio
//     que sí se podía vender. Es el error CARO de este fichero.
//   · **Falso negativo** (decimos «libre» y ya es cliente suyo) → Alberto pierde
//     un rato intentando emitir algo que la compañía va a mandar a retención.
//     Molesta, pero se descubre solo y no cuesta dinero: los 0,50€ se pagan por
//     la CONSULTA entera, no por fila.
//
// Por eso la decisión de diseño que hace tolerable equivocarse: **una fila
// bloqueada se MARCA, nunca se esconde por defecto** (`comparativa-precios.ts`).
// Con la fila a la vista, un falso positivo es un rótulo que Alberto ve y
// descarta; escondiéndola sería un precio perdido que nadie puede auditar.
//
// ─── Orden de identificación: DGS → nombre, nunca al revés ──────────────────
// El vendor (Codeoscopic/Avant2) manda **solo el nombre** en `product.vendor.name`;
// no hay código DGS en su respuesta. Las pólizas de CIMA sí traen
// `codigo_entidad_dgs`. El puente ya existe en la BD: `seguros.companias_dgs`
// (`codigo_dgs`, `nombre_comun`, `nombre_cima`), creada el 02/09/2026 justo para
// esto. Aquí se recibe ese catálogo como dato (el módulo es puro) y se resuelve:
//
//   1. nombre del vendor → fila del catálogo → `codigo_dgs`   ← identidad fuerte
//   2. si NO hay fila, y tampoco la hay para la póliza, se compara el nombre
//      normalizado exacto ← identidad DÉBIL, y se DECLARA (`coincidencia:'nombre'`)
//   3. dos códigos DGS distintos NO se funden jamás, coincida lo que coincida.
//
// Medido el 21/09/2026 sobre los 187 precios guardados en `tarificacion_precios`:
// 6 de los 7 nombres de vendor resuelven a un `codigo_dgs` por nombre exacto
// (Allianz C0109, Fidelidade E0118, Mapfre C0058, Mutua Madrileña M0083,
// Occident C0468, Reale C0613) y **«Fiatc» no está en el catálogo**: para esa,
// la respuesta honrada es `desconocida`, no «libre». Y de las 157 pólizas de
// cartera viva, las 157 traen `codigo_entidad_dgs` — el lado de CIMA hoy es
// identidad fuerte al 100 %, así que el nombre es la red, no el camino.
//
// ─── Qué bloquea y qué no ───────────────────────────────────────────────────
//   · Bloquea la cartera **EN VIGOR** (viva Y estado vigente), de CUALQUIER ramo:
//     la defensa de cartera es de la relación cliente↔compañía, no del producto.
//   · NO bloquea una **cancelada**: es justo cuando se puede volver a escribir.
//     Se cuenta aparte (`exPolizas`) porque es un argumento, no un veto.
//   · NO bloquea el **volcado histórico** (leads, vencimientos 2013-2018): una
//     póliza de 2016 no defiende nada. El llamante ya decide qué es viva con
//     `esCarteraViva()`; aquí llega en el campo `viva`.
//   · La compañía **ACTUAL** de la póliza que se retarifica es un caso DISTINTO
//     (`estado:'actual'`): ahí la alternativa no es emitir nueva, es renovar o
//     negociar. Es además la única fila que sirve de referencia del precio.
//
// ─── Lo que este fichero NO puede saber ─────────────────────────────────────
// Las pólizas que el cliente tenga **fuera de nuestra cartera**. Por eso `libre`
// NUNCA se dice como «no tiene póliza ahí», sino como «no consta ninguna póliza
// NUESTRA ahí» (ver `fraseDefensa`). Es la misma regla del `NULL`: lo que no se
// ha mirado no se afirma.

import { esEstadoVigente } from './vigencia.ts'

// ─── Normalización de nombres ────────────────────────────────────────────────

/**
 * Minúsculas, sin acentos, sin puntuación ni formas societarias, espacios
 * colapsados. Se quitan `sa`, `sl`, `seguros`, `compañia`… porque el nombre de
 * CIMA es la razón social entera («MAPFRE ESPAÑA COMPAÑIA DE SEGUROS Y
 * REASEGUROS SA») y el del vendor es la marca («Mapfre»).
 *
 * ⚠️ Esto se usa SOLO para buscar en el catálogo y como red de última hora. No
 * decide identidad por sí mismo: ver `emparejarPoliza`.
 */
const RUIDO = new Set([
  'sa', 'sau', 'sl', 'slu', 'sam', 'mutua', 'mutualidad', 'seguros', 'seguro',
  'reaseguros', 'reaseguro', 'compania', 'compañia', 'cia', 'de', 'del', 'la',
  'las', 'el', 'los', 'y', 'espana', 'españa', 'iberica', 'sucursal', 'en',
  'grupo', 'asegurador', 'aseguradora', 'sociedad', 'anonima', 'prima', 'fija',
])

export function normalizarCompania(nombre: string | null | undefined): string {
  if (typeof nombre !== 'string') return ''
  const base = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (base === '') return ''
  // Las letras sueltas son los restos de «S.A.» / «S.L.» una vez que la
  // puntuación se ha vuelto espacios («FIATC, S.A.» → `fiatc s a`). Ninguna
  // marca aseguradora es de una sola letra, así que se van con el ruido.
  const palabras = base.split(' ').filter((p) => p.length > 1 && !RUIDO.has(p))
  // Si al quitar el ruido no queda nada, el nombre ERA ruido: se devuelve el
  // original normalizado en vez de una cadena vacía, que se emparejaría con
  // cualquier otra vacía — el modo silencioso de fundir dos compañías.
  return (palabras.length > 0 ? palabras : base.split(' ')).join(' ')
}

// ─── El catálogo de equivalencias ────────────────────────────────────────────

/**
 * Una fila de `seguros.companias_dgs` (02/09/2026), que es donde vive la tabla
 * de equivalencias y donde debe seguir viviendo: la mantiene la ingesta de CIMA
 * y la consulta la trastienda. Este módulo NO la duplica ni la cablea — la
 * recibe como dato para seguir siendo puro y testeable.
 *
 * `nombreCima` a `null` significa «todavía no se ha visto ninguna póliza de CIMA
 * de esa compañía», no «no tiene nombre en CIMA» (hoy: Generali y Reale).
 */
export type CompaniaCatalogo = {
  codigoDgs: string
  nombreComun: string
  nombreCima?: string | null
  /** Otros nombres con los que puede llegar (del vendor, de un EIAC viejo…). */
  alias?: readonly string[]
}

export type IdentidadCompania =
  | { estado: 'resuelta'; codigoDgs: string; nombre: string }
  /** Varias filas del catálogo casan con ese nombre: NO se elige una. */
  | { estado: 'ambigua'; codigos: string[] }
  | { estado: 'sin_resolver'; normalizado: string }

/**
 * Nombre (del vendor o de CIMA) → identidad.
 *
 * 🚨 Con **varias** filas candidatas devuelve `ambigua`, no la primera. Elegir
 * una arbitrariamente es exactamente cómo se funden dos entidades distintas, y
 * el resultado siempre parece haber funcionado.
 */
export function resolverCompania(
  catalogo: readonly CompaniaCatalogo[],
  nombre: string | null | undefined,
): IdentidadCompania {
  const buscado = normalizarCompania(nombre)
  if (buscado === '') return { estado: 'sin_resolver', normalizado: '' }

  const casan = catalogo.filter((c) => {
    const candidatos = [c.nombreComun, c.nombreCima ?? '', ...(c.alias ?? [])]
    return candidatos.some((n) => normalizarCompania(n) === buscado)
  })
  const codigos = [...new Set(casan.map((c) => c.codigoDgs))]
  if (codigos.length === 1) {
    return { estado: 'resuelta', codigoDgs: codigos[0]!, nombre: casan[0]!.nombreComun }
  }
  if (codigos.length > 1) return { estado: 'ambigua', codigos }
  return { estado: 'sin_resolver', normalizado: buscado }
}

// ─── Las pólizas del cliente ─────────────────────────────────────────────────

/**
 * Lo que hace falta saber de cada póliza del cliente. Los dos campos de
 * identidad se piden por separado a propósito: `codigoEntidadDgs` es el bueno y
 * `aseguradora` la red.
 *
 * `viva` NO se recalcula aquí: lo decide `esCarteraViva()` (asegura, que tiene
 * `import_ref`/`eiac_xml_hash`) o lo trae ya resuelto `PolizaFicha.viva`. La
 * mitad del estado sí se resuelve aquí con `esEstadoVigente()`, que es la única
 * fuente de esa lista en el repo.
 */
export type PolizaCliente = {
  id?: string | null
  /** `null` = CIMA no trajo el código. NO es «no tiene compañía». */
  codigoEntidadDgs: string | null | undefined
  aseguradora: string | null | undefined
  /** `estado_poliza` tal cual. `null` = no vigente (no se supone lo contrario). */
  estado: string | null | undefined
  /** ¿Es cartera viva (origen CIMA o emitida por nosotros)? Ver `cartera-viva.ts`. */
  viva: boolean
  ramo?: string | null
  numeroPoliza?: string | null
}

/** Viva Y con estado vigente = la que defiende la compañía. */
export function polizaDefiende(p: PolizaCliente): boolean {
  if (!p.viva) return false
  return typeof p.estado === 'string' && esEstadoVigente(p.estado)
}

// ─── El veredicto ────────────────────────────────────────────────────────────

/**
 * Cuatro estados, y ninguno es «no». `desconocida` existe porque «no se ha
 * podido comprobar» no es «está libre»: el que tranquiliza es `libre`, y esa
 * es justo la respuesta que no se da cuando falta un dato.
 */
export type EstadoDefensa = 'libre' | 'ocupada' | 'actual' | 'desconocida'

export type PolizaEnLaCompania = {
  numeroPoliza: string | null
  ramo: string | null
  estado: string | null
}

export type Defensa = {
  estado: EstadoDefensa
  /**
   * Con qué se ha emparejado. `'dgs'` = código contra código (fuerte).
   * `'nombre'` = ninguno de los dos lados resolvía y los nombres normalizados
   * coinciden (débil: la pantalla lo dice). `null` = no hay emparejamiento.
   */
  coincidencia: 'dgs' | 'nombre' | null
  /** Las pólizas EN VIGOR encontradas en esa compañía. */
  polizas: PolizaEnLaCompania[]
  /** Pólizas suyas en esa compañía que ya NO están en vigor: argumento, no veto. */
  exPolizas: number
  /**
   * Cuántas pólizas del cliente no se han podido identificar. Mientras sea > 0
   * no se puede decir `libre`: una ausencia con filas ilegibles no está medida.
   */
  sinIdentificar: number
  /** Por qué sale este estado, en la frase que se puede pintar tal cual. */
  motivo: string
}

export type EntradaDefensa = {
  /** Nombre de la compañía del PRECIO, tal y como lo manda el vendor. */
  compania: string | null | undefined
  catalogo: readonly CompaniaCatalogo[]
  /**
   * 🚨 `null` = la cartera del cliente no se ha podido mirar (o el puerto de
   * asegura es una versión que todavía no manda el campo). `[]` = mirada y el
   * cliente no tiene ninguna póliza. Colapsar el primero en el segundo
   * convertiría un «no lo sé» en un «adelante, véndelo».
   */
  polizas: readonly PolizaCliente[] | null | undefined
  /** La póliza que se está retarificando, para distinguir `actual` de `ocupada`. */
  polizaActualId?: string | null
  /** Si no hay id, su compañía (código DGS mejor que nombre). */
  companiaActualDgs?: string | null
  companiaActualNombre?: string | null
}

type Emparejamiento = 'misma' | 'otra' | 'no_se_sabe'

/**
 * ¿Es esta póliza de la misma compañía que el precio?
 *
 * El orden es identificador → nombre, y **dos identificadores distintos nunca
 * se funden**. El `'no_se_sabe'` es el caso que impide afirmar `libre`.
 */
function emparejar(
  idPrecio: IdentidadCompania,
  idPoliza: IdentidadCompania,
  nombrePrecio: string,
  nombrePoliza: string | null | undefined,
): { veredicto: Emparejamiento; via: 'dgs' | 'nombre' | null } {
  if (idPrecio.estado === 'resuelta' && idPoliza.estado === 'resuelta') {
    return idPrecio.codigoDgs === idPoliza.codigoDgs
      ? { veredicto: 'misma', via: 'dgs' }
      : { veredicto: 'otra', via: null }
  }
  // Ninguno de los dos resuelve: el nombre es el ÚNICO identificador que hay,
  // así que se usa — y se declara que ha sido por nombre.
  if (idPrecio.estado === 'sin_resolver' && idPoliza.estado === 'sin_resolver') {
    const a = normalizarCompania(nombrePrecio)
    const b = normalizarCompania(nombrePoliza)
    if (a !== '' && a === b) return { veredicto: 'misma', via: 'nombre' }
    // Nombres distintos y sin catálogo: NO se descarta. «Fiatc» y «Fiatc Mutua»
    // son la misma y no lo sabríamos; decir «otra» aquí es el falso negativo
    // que deja creer que la compañía está libre.
    return { veredicto: 'no_se_sabe', via: null }
  }
  // Uno resuelve y el otro no: un nombre suelto no descarta un código.
  return { veredicto: 'no_se_sabe', via: null }
}

/**
 * ¿Se puede emitir en esta compañía para este cliente?
 *
 * Es la función que consume la tabla de precios. No decide qué se pinta: eso es
 * de `comparativa-precios.ts`.
 */
export function defensaDeCartera(e: EntradaDefensa): Defensa {
  const nombrePrecio = typeof e.compania === 'string' ? e.compania : ''
  if (normalizarCompania(nombrePrecio) === '') {
    return {
      estado: 'desconocida',
      coincidencia: null,
      polizas: [],
      exPolizas: 0,
      sinIdentificar: 0,
      motivo: 'el precio no dice de qué compañía es, así que no se puede comprobar si el cliente ya está en ella.',
    }
  }

  if (e.polizas === null || e.polizas === undefined) {
    return {
      estado: 'desconocida',
      coincidencia: null,
      polizas: [],
      exPolizas: 0,
      sinIdentificar: 0,
      motivo: 'no se han podido leer las pólizas del cliente, así que NO consta que esta compañía esté libre — solo que no se ha mirado.',
    }
  }

  const idPrecio = resolverCompania(e.catalogo, nombrePrecio)
  if (idPrecio.estado === 'ambigua') {
    return {
      estado: 'desconocida',
      coincidencia: null,
      polizas: [],
      exPolizas: 0,
      sinIdentificar: 0,
      motivo: `«${nombrePrecio}» casa con ${idPrecio.codigos.length} compañías del catálogo (${idPrecio.codigos.join(', ')}) y no se elige una a dedo.`,
    }
  }

  const enVigor: PolizaEnLaCompania[] = []
  let exPolizas = 0
  let sinIdentificar = 0
  let via: 'dgs' | 'nombre' | null = null
  let esActual = false

  for (const p of e.polizas) {
    const idPoliza: IdentidadCompania =
      typeof p.codigoEntidadDgs === 'string' && p.codigoEntidadDgs.trim() !== ''
        ? { estado: 'resuelta', codigoDgs: p.codigoEntidadDgs.trim(), nombre: p.aseguradora ?? p.codigoEntidadDgs }
        : resolverCompania(e.catalogo, p.aseguradora)

    const m = emparejar(idPrecio, idPoliza, nombrePrecio, p.aseguradora)
    if (m.veredicto === 'otra') continue
    if (m.veredicto === 'no_se_sabe') {
      sinIdentificar += 1
      continue
    }
    // Un emparejamiento por DGS manda sobre uno por nombre en el rótulo.
    if (via === null || m.via === 'dgs') via = m.via
    if (!polizaDefiende(p)) {
      exPolizas += 1
      continue
    }
    enVigor.push({
      numeroPoliza: p.numeroPoliza ?? null,
      ramo: p.ramo ?? null,
      estado: p.estado ?? null,
    })
    if (esLaActual(p, e)) esActual = true
  }

  if (enVigor.length > 0) {
    const cuantas = `${enVigor.length} póliza${enVigor.length === 1 ? '' : 's'} en vigor`
    if (esActual) {
      return {
        estado: 'actual',
        coincidencia: via,
        polizas: enVigor,
        exPolizas,
        sinIdentificar,
        motivo: `es la compañía de la póliza que se está retarificando (${cuantas} del cliente aquí): aquí se renueva o se negocia, no se emite nueva.`,
      }
    }
    return {
      estado: 'ocupada',
      coincidencia: via,
      polizas: enVigor,
      exPolizas,
      sinIdentificar,
      motivo: `el cliente ya tiene ${cuantas} en esta compañía: el precio vale para defender la cartera, pero la póliza nueva no la podemos emitir nosotros.`,
    }
  }

  if (sinIdentificar > 0) {
    return {
      estado: 'desconocida',
      coincidencia: null,
      polizas: [],
      exPolizas,
      sinIdentificar,
      motivo: `${sinIdentificar} póliza${sinIdentificar === 1 ? '' : 's'} del cliente no se ${sinIdentificar === 1 ? 'ha' : 'han'} podido identificar con una compañía, así que no se puede afirmar que esta esté libre.`,
    }
  }

  return {
    estado: 'libre',
    coincidencia: null,
    polizas: [],
    exPolizas,
    sinIdentificar: 0,
    motivo:
      exPolizas > 0
        ? `no consta ninguna póliza NUESTRA en vigor aquí (sí ${exPolizas} cancelada${exPolizas === 1 ? '' : 's'}, que es argumento para volver a entrar).`
        : 'no consta ninguna póliza NUESTRA en esta compañía. Lo que tenga contratado por su cuenta no lo sabemos.',
  }
}

function esLaActual(p: PolizaCliente, e: EntradaDefensa): boolean {
  if (e.polizaActualId != null && p.id != null) return p.id === e.polizaActualId
  const dgs = e.companiaActualDgs
  if (typeof dgs === 'string' && dgs.trim() !== '' && typeof p.codigoEntidadDgs === 'string') {
    return p.codigoEntidadDgs.trim() === dgs.trim()
  }
  const n = normalizarCompania(e.companiaActualNombre)
  return n !== '' && n === normalizarCompania(p.aseguradora)
}

/**
 * ¿Hay que marcar esta fila como no emitible?
 *
 * 🚨 `desconocida` NO bloquea. Bloquear con una duda escondería un precio
 * vendible por no haber podido mirar, que es el error caro de este fichero; la
 * duda se dice con un rótulo («sin comprobar»), no quitando la fila.
 */
export function bloqueaEmision(d: Defensa): boolean {
  return d.estado === 'ocupada' || d.estado === 'actual'
}

/** Rótulo corto para la fila. */
export function etiquetaDefensa(d: Defensa): string {
  if (d.estado === 'actual') return 'compañía actual'
  if (d.estado === 'ocupada') return 'ya es cliente · no emitible'
  if (d.estado === 'desconocida') return 'sin comprobar'
  return 'emitible'
}

/**
 * La frase larga, para el `title` de la fila o un desplegable.
 *
 * Nunca dice «el cliente no tiene póliza en esa compañía»: decimos lo que
 * sabemos, que es lo que hay en NUESTRA cartera.
 */
export function fraseDefensa(d: Defensa): string {
  const partes = [d.motivo]
  if (d.coincidencia === 'nombre') {
    partes.push(
      '⚠️ La compañía se ha emparejado por el NOMBRE, no por el código DGS: podría no ser la misma entidad.',
    )
  }
  if (d.estado !== 'libre' && d.sinIdentificar > 0) {
    partes.push(
      `Además hay ${d.sinIdentificar} póliza(s) del cliente sin compañía identificada.`,
    )
  }
  return partes.join(' ')
}
