// Trocear una dirección de texto libre (CRM) o del Catastro en tipo de vía /
// nombre / número / planta / puerta, que es como Codeoscopic la exige.
// PURO: sin red, sin BD. Extraído de `desde-cartera-hogar.ts` el 12/09/2026
// para que `desde-cartera.ts` (auto) pueda usarlo también sin crear un
// import circular entre los dos (auto y hogar ya se importan entre sí).

function limpio(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

export type DireccionPartida = {
  /** Nombre canónico del tipo de vía («Calle», «Avenida»…), para emparejar con `/road-types`. */
  tipoVia: string | null
  nombre: string | null
  numero: string | null
  planta: string | null
  puerta: string | null
}

const SIN = { tipoVia: null, nombre: null, numero: null, planta: null, puerta: null } as const

/** Abreviaturas del CRM y del Catastro → nombre canónico del tipo de vía. */
const TIPOS_VIA: Record<string, string> = {
  cl: 'Calle', c: 'Calle', calle: 'Calle',
  av: 'Avenida', avd: 'Avenida', avda: 'Avenida', avenida: 'Avenida',
  pz: 'Plaza', pza: 'Plaza', plz: 'Plaza', plaza: 'Plaza',
  ps: 'Paseo', pso: 'Paseo', paseo: 'Paseo',
  cm: 'Camino', cmno: 'Camino', camino: 'Camino',
  cr: 'Carretera', ctra: 'Carretera', carretera: 'Carretera',
  rd: 'Ronda', ronda: 'Ronda',
  ur: 'Urbanización', urb: 'Urbanización', urbanizacion: 'Urbanización',
  tr: 'Travesía', trv: 'Travesía', trva: 'Travesía', travesia: 'Travesía',
  gl: 'Glorieta', glorieta: 'Glorieta',
  bo: 'Barrio', barrio: 'Barrio', bda: 'Barriada', barriada: 'Barriada',
  pj: 'Pasaje', psj: 'Pasaje', pasaje: 'Pasaje',
  cj: 'Callejón', cjon: 'Callejón', callejon: 'Callejón',
  lg: 'Lugar', lugar: 'Lugar',
  pg: 'Polígono', poligono: 'Polígono',
  al: 'Alameda', alameda: 'Alameda',
  cta: 'Cuesta', cuesta: 'Cuesta',
}

/**
 * De `paramsDnploc()` (`@central/core-catastro`, que sí entiende «Es:1 Pl:01
 * Pt:IZ») a `DireccionPartida`. Existe porque `partirDireccion()` de aquí
 * abajo está pensado para el texto libre de la ficha del CRM y no reconoce el
 * formato propio del Catastro — reparsear con el parser equivocado perdía
 * planta y puerta en silencio.
 */
export function direccionDesdeCatastro(p: {
  sigla: string
  calle: string
  numero: string
  planta?: string | null
  puerta?: string | null
} | null): DireccionPartida {
  if (p === null) return { ...SIN }
  return {
    tipoVia: TIPOS_VIA[p.sigla.trim().toLowerCase()] ?? null,
    nombre: limpio(p.calle) ?? null,
    numero: limpio(p.numero) ?? null,
    planta: p.planta ?? null,
    puerta: p.puerta ?? null,
  }
}

/**
 * El `roadType` del vendor para la dirección de una ficha: el tipo que trocea
 * `partirDireccion()` («CL» → Calle), emparejado EXACTO contra el catálogo
 * vivo `/road-types`. `null` = la dirección no empieza por un tipo reconocible
 * (el caso de Pilar Franco Ruz, «Severo Ochoa 12») o el catálogo no lo tiene
 * con ese nombre: entonces lo elige el corredor, nunca se inventa un id.
 *
 * UNA implementación para los tres sitios que la necesitan (precalificación,
 * pre-vuelo de `prepararAuto` y la reparación de `valoresPersonaDesdeFicha`):
 * tres copias de la misma regla divergen sin que nada falle. PURA: el catálogo
 * lo trae quien tiene red.
 */
export function tipoViaDeFicha(
  direccion: string | null | undefined,
  catalogo: ReadonlyArray<{ id: string; nombre: string }>,
): { id: string; nombre: string } | null {
  const tipo = partirDireccion(direccion ?? null).tipoVia
  if (tipo === null) return null
  const buscado = normalizarToken(tipo)
  const coincidencias = catalogo.filter((o) => normalizarToken(o.nombre) === buscado)
  return coincidencias.length === 1 ? coincidencias[0] : null
}

const RE_NUMERO = /^\d{1,4}[a-z]?$/i
const RE_ORDINAL = /^(\d{1,2})[ºª°o]?$/i
const RE_PLANTA_PALABRA = /^(bajo|bj|bajos|entlo|entresuelo|entreplanta|atico|ático|pb|sotano|sótano|principal|ppal)$/i
const RE_PLANTA_Y_PUERTA = /^(\d{1,2})[ºª°o]?[-\s]?([a-z]{1,4}|\d{1,2})$/i
const RE_PUERTA = /^([a-z]{1,4}|\d{1,2})$/i
const RELLENO = /^(piso|pl|planta|pta|puerta|pt|n|nº|no|num|numero|número|esc|escalera|s\/n|sn|bloque|blq|portal)$/i

function normalizarToken(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[./]+$/g, '')
}

/**
 * Trocea «CL SOCORRO 24 3º IZQ» en tipo de vía / nombre / número / planta /
 * puerta. Best-effort y CONSERVADOR: lo que no se reconoce queda a `null` (y
 * la pantalla lo pide), nunca se inventa un número. Solo se usan los primeros
 * tokens que parecen planta/puerta; el resto se descarta a propósito (una
 * escalera o un bloque no van al vendor).
 */
export function partirDireccion(direccion: string | null): DireccionPartida {
  const t = limpio(direccion)
  if (t === null) return { ...SIN }
  const tokens = t.replace(/,/g, ' ').split(/\s+/).filter((x) => x !== '')
  if (tokens.length === 0) return { ...SIN }

  let tipoVia: string | null = null
  // «C/» pegado al nombre: «C/Socorro».
  const m = /^c\/(.+)$/i.exec(tokens[0])
  if (m) {
    tipoVia = 'Calle'
    tokens[0] = m[1]
  } else if (TIPOS_VIA[normalizarToken(tokens[0])]) {
    tipoVia = TIPOS_VIA[normalizarToken(tokens[0])]
    tokens.shift()
  }

  // El número: el primer token numérico que NO es el primero (hace falta nombre).
  let iNumero = -1
  for (let i = 1; i < tokens.length; i++) {
    if (RE_NUMERO.test(tokens[i])) {
      iNumero = i
      break
    }
  }
  const nombreTokens = (iNumero === -1 ? tokens : tokens.slice(0, iNumero)).filter((x) => !RELLENO.test(normalizarToken(x)))
  const nombre = nombreTokens.length > 0 ? nombreTokens.join(' ') : null
  if (iNumero === -1) return { tipoVia, nombre, numero: null, planta: null, puerta: null }

  const numero = tokens[iNumero]
  const resto = tokens.slice(iNumero + 1).filter((x) => !RELLENO.test(normalizarToken(x)))
  let planta: string | null = null
  let puerta: string | null = null
  const r0 = resto[0]
  if (r0 !== undefined) {
    const pp = RE_PLANTA_Y_PUERTA.exec(r0)
    const ord = RE_ORDINAL.exec(r0)
    if (ord) {
      planta = ord[1]
      const r1 = resto[1]
      if (r1 !== undefined && RE_PUERTA.test(r1)) puerta = r1.toUpperCase()
    } else if (RE_PLANTA_PALABRA.test(r0)) {
      planta = normalizarToken(r0).toUpperCase()
      const r1 = resto[1]
      if (r1 !== undefined && RE_PUERTA.test(r1)) puerta = r1.toUpperCase()
    } else if (pp) {
      planta = pp[1]
      puerta = pp[2].toUpperCase()
    }
  }
  return { tipoVia, nombre, numero, planta, puerta }
}
