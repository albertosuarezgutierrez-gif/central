// De una póliza de HOGAR de la cartera a una precalificación lista para cotizar.
// PURO: entran los datos ya leídos y descifrados, sale qué se va a mandar, qué
// se ha SUPUESTO y qué falta. Misma disciplina que `desde-cartera.ts` (auto).
//
// ─── De dónde salen los datos del riesgo, y por qué hay que decirlo ─────────
// CIMA (la póliza VIVA, `import_ref IS NULL`) no manda el objeto de hogar: ni
// m², ni año, ni CP del riesgo. La copia GEMELA del volcado de junio/2026 (mismo
// `numero_poliza`) sí los trae, tecleados a mano en el CRM. Medido el 02/09/2026
// sobre las dos vivas de Occident de J.S.S.: todo el riesgo está en la gemela.
// Así que el dato que viaja al vendor puede tener tres procedencias —la póliza,
// su gemela o el Catastro— y la pantalla tiene que enseñar cuál, porque un m²
// tecleado hace tres años y un m² oficial de hoy no merecen la misma confianza.
//
// ─── Lo que el vendor exige y la ficha NO trae ──────────────────────────────
// El `HomeRisk` verificado (`peticion-hogar.ts`) pide cosas que ninguna ficha
// de la cartera guarda: habitaciones, si la puerta es blindada, si hay
// alarma, cuántas joyas hay en la caja fuerte, si hay perros peligrosos… Todo
// eso se SUPONE con el valor conservador («piso normal sin protecciones, sin
// joyas, sin perros») y se declara como supuesto, uno por uno. Lo que abarata
// el precio se marca `optimista` para que el corredor sepa por dónde puede subir.
//
// ─── Lo que NO se supone ────────────────────────────────────────────────────
// Nada personal (DNI, nombre, nacimiento, teléfono, sexo) — igual que en auto.
// Y tampoco el CAPITAL: un continente inventado da un precio inventado. Si no
// viene de la póliza, lo teclea el corredor (o lo recomienda el vendor con
// `POST /home/recommend-limits`, que está por cablear).

import { revisarDatosHogar, type DatosHogar, type ReparoHogar } from './peticion-hogar.ts'
import { partirApellidos, sexoDeSaludo, diaSiguiente, type ClienteCartera } from './desde-cartera.ts'

/** El riesgo de hogar tal como lo trae la ficha (póliza o gemela), ya descifrado. */
export type HogarCartera = {
  cp: string | null
  localidad: string | null
  /** Calle y número, descifrados. Se trocea para el vendor (`partirDireccion`) y se pinta entera. */
  direccion: string | null
  metrosCuadrados: number | null
  anioConstruccion: number | null
  capitalContinente: number | null
  capitalContenido: number | null
  /** De dónde salió: `null` = ni la póliza ni su gemela traen nada. */
  fuente: 'poliza' | 'gemela' | null
}

/** Lo que el Catastro puede aportar (ya consultado, gratis). Opcional. */
export type CatastroHogar = {
  metrosCuadrados: number | null
  anioConstruccion: number | null
  codigoPostal: string | null
  uso: string | null
}

/** Los desplegables de catálogo que la pantalla resuelve (ids del vendor). */
export type CatalogoResuelto =
  | 'tipoVivienda'
  | 'uso'
  | 'ocupacion'
  | 'ubicacion'
  | 'material'
  | 'calidad'
  | 'alarma'
  | 'puertasSecundarias'
  | 'asentamiento'
  | 'tipoVia'

/** Lo que exige red: ids de los catálogos del vendor. `null` = no resuelto. */
export type ResueltosHogar = {
  municipioId: number | null
  estadoCivilId: string | null
  /** id de `/road-types` que la pantalla emparejó con el tipo de vía de la dirección. */
  tipoViaId: string | null
  tipoVivienda: string | null
  uso: string | null
  ocupacion: string | null
  ubicacion: string | null
  material: string | null
  calidad: string | null
  alarma: string | null
  puertasSecundarias: string | null
  asentamiento: string | null
  /** `null` = la pantalla no lo ha decidido; se deduce del `uso` elegido si se puede. */
  propietarioEsTomador: boolean | null
  /** Cuáles de los ids anteriores son un DEFECTO de la pantalla, no una elección. */
  supuestos?: Partial<Record<CatalogoResuelto, boolean>>
}

export type SupuestoHogar = {
  campo: keyof DatosHogar
  valor: unknown
  porque: string
  optimista?: boolean
}

export type PrecalificacionHogar = {
  datos: Partial<DatosHogar>
  supuestos: SupuestoHogar[]
  faltan: ReparoHogar[]
  /** Procedencia de m²/año/CP, para rotular la pantalla. */
  fuenteRiesgo: 'poliza' | 'gemela' | 'catastro' | null
}

type PolizaHogarCartera = {
  numeroPoliza: string | null
  fechaVencimiento: string | null
  hogar: HogarCartera | null
}

function limpio(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/** Etiquetas de los desplegables para los textos de los supuestos. */
const QUE_ES: Record<CatalogoResuelto, string> = {
  tipoVivienda: 'si es piso o casa',
  uso: 'si el tomador es propietario o inquilino',
  ocupacion: 'si es vivienda habitual o segunda residencia',
  ubicacion: 'si está en núcleo urbano o aislada',
  material: 'de qué está construida',
  calidad: 'la calidad de construcción',
  alarma: 'si tiene alarma',
  puertasSecundarias: 'cómo son las puertas secundarias',
  asentamiento: 'cómo se liquida el siniestro (valor de reposición…)',
  tipoVia: 'el tipo de vía',
}

/** Lo que abarata el precio si se supone: al corredor le conviene saberlo. */
const OPTIMISTA: Partial<Record<CatalogoResuelto, boolean>> = { ocupacion: true, ubicacion: true, calidad: true }

export function precalificarHogarCartera(
  cliente: ClienteCartera,
  poliza: PolizaHogarCartera,
  resueltos: ResueltosHogar,
  hoy: string,
  catastro: CatastroHogar | null = null,
): PrecalificacionHogar {
  const supuestos: SupuestoHogar[] = []
  const suponer = <T>(campo: keyof DatosHogar, valor: T, porque: string, optimista = false): T => {
    supuestos.push({ campo, valor, porque, optimista })
    return valor
  }
  const { primero, segundo } = partirApellidos(cliente.apellidos)
  const h = poliza.hogar

  // ── Fecha de efecto: el día después del vencimiento, o mañana ──
  const vencimiento = limpio(poliza.fechaVencimiento)
  const fechaEfecto =
    vencimiento && vencimiento >= hoy
      ? suponer('fechaEfecto', diaSiguiente(vencimiento), `el día siguiente al vencimiento de la póliza actual (${vencimiento})`)
      : suponer(
          'fechaEfecto',
          diaSiguiente(hoy),
          vencimiento
            ? `la póliza actual venció el ${vencimiento}, así que se pide precio para mañana`
            : 'la póliza actual no tiene fecha de vencimiento en la ficha, así que se pide precio para mañana',
        )

  // ── El riesgo: póliza/gemela primero, Catastro para los huecos ──
  let fuenteRiesgo: PrecalificacionHogar['fuenteRiesgo'] = h?.fuente ?? null
  const metros = h?.metrosCuadrados ?? null
  const anio = h?.anioConstruccion ?? null
  let metrosFinal = metros
  let anioFinal = anio
  if (metrosFinal === null && catastro?.metrosCuadrados) {
    metrosFinal = suponer(
      'metrosCuadrados',
      catastro.metrosCuadrados,
      'superficie CONSTRUIDA según el Catastro (incluye parte de zonas comunes); si la compañía pregunta la útil, es menor',
    )
    fuenteRiesgo = fuenteRiesgo ?? 'catastro'
  }
  if (anioFinal === null && catastro?.anioConstruccion) {
    anioFinal = suponer('anioConstruccion', catastro.anioConstruccion, 'año de construcción según el Catastro')
    fuenteRiesgo = fuenteRiesgo ?? 'catastro'
  }
  if (h?.fuente === 'gemela' && (metros !== null || anio !== null)) {
    supuestos.push({
      campo: 'metrosCuadrados',
      valor: metros,
      porque:
        `los datos del riesgo (m², año, CP, dirección) no vienen por CIMA: salen de la copia del volcado de junio/2026 de la misma ` +
        `póliza${poliza.numeroPoliza ? ` (nº ${poliza.numeroPoliza})` : ''}, tecleados a mano en el CRM — comprobar con el Catastro si hay dudas`,
    })
  }

  // ── Habitaciones: ninguna ficha las guarda. Se estiman por superficie ──
  const habitaciones =
    metrosFinal !== null
      ? suponer(
          'habitaciones',
          habitacionesPorSuperficie(metrosFinal),
          `estimadas por la superficie (${metrosFinal} m²): dormitorios sin contar salón, cocina ni baños. Corrígelo si lo sabes`,
        )
      : undefined

  // ── Dónde está: CP del riesgo; si no, el del Catastro; si no, el del tomador ──
  let cp = limpio(h?.cp) ?? limpio(catastro?.codigoPostal)
  if (cp === null && limpio(cliente.codigoPostal) !== null) {
    cp = suponer('cp', limpio(cliente.codigoPostal)!, 'la ficha no dice dónde está la vivienda; se supone que es donde vive el tomador')
  }
  // La calle: troceada de la dirección de la ficha. El vendor la exige entera.
  const dir = partirDireccion(h?.direccion ?? null)
  if (dir.nombre !== null) {
    supuestos.push({
      campo: 'nombreVia',
      valor: dir.nombre,
      porque: 'calle y número troceados automáticamente de la dirección de la ficha: comprueba que la calle, el número, la planta y la puerta han quedado bien',
    })
  }

  // ── Capitales: de la póliza o nada. No se inventan ──
  const capitalContinente = h?.capitalContinente ?? null
  const capitalContenido = h?.capitalContenido ?? null
  if (h?.fuente === 'gemela' && (capitalContinente !== null || capitalContenido !== null)) {
    supuestos.push({
      campo: 'capitalContinente',
      valor: capitalContinente,
      porque:
        'los capitales de continente/contenido son los de la copia del volcado de junio/2026, no los de la póliza vigente en CIMA: ' +
        'si la compañía los revalorizó, hoy son mayores',
      // Menos capital ⇒ prima más baja ⇒ el precio real puede subir.
      optimista: true,
    })
  }

  // ── Los desplegables: la pantalla puede haberlos puesto por defecto ──
  const s = resueltos.supuestos ?? {}
  const idDe = (campo: Exclude<CatalogoResuelto, 'tipoVia'>): string | undefined => {
    const v = limpio(resueltos[campo])
    if (v === null) return undefined
    if (s[campo]) suponer(campo, v, `la ficha no dice ${QUE_ES[campo]}; se usa el valor por defecto de la pantalla`, OPTIMISTA[campo] === true)
    return v
  }
  const tipoViaId = limpio(resueltos.tipoViaId) ?? undefined
  if (tipoViaId !== undefined && s.tipoVia) {
    suponer('tipoViaId', tipoViaId, `la dirección de la ficha no dice ${QUE_ES.tipoVia}; se usa el valor por defecto de la pantalla`)
  }

  // ── Lo que ninguna ficha guarda: protecciones, joyas, perros. Conservador ──
  const puertaPrincipalBlindada = suponer('puertaPrincipalBlindada', false, 'la ficha no dice si la puerta principal es blindada; se supone que no (si lo es, el precio baja)')
  const ventanasSeguras = suponer('ventanasSeguras', false, 'la ficha no dice si las ventanas tienen rejas o cristales de seguridad; se supone que no')
  const urbanizacionCerrada = suponer('urbanizacionCerrada', false, 'la ficha no dice si está en urbanización cerrada; se supone que no')
  const joyasEnCajaFuerte = suponer('joyasEnCajaFuerte', 0, 'no se declaran joyas en caja fuerte; si las hay, el precio sube', true)
  const joyasFueraDeCaja = suponer('joyasFueraDeCaja', 0, 'no se declaran joyas fuera de caja fuerte; si las hay, el precio sube', true)
  const objetosDeValor = suponer('objetosDeValor', 0, 'no se declaran objetos de valor (arte, colecciones…); si los hay, el precio sube', true)
  const perrosPeligrosos = suponer('perrosPeligrosos', 0, 'se supone que no hay perros potencialmente peligrosos; si los hay, el precio sube', true)

  // ── ¿El tomador es el dueño? Lo decide la pantalla; si no, se supone que sí ──
  const propietarioEsTomador =
    typeof resueltos.propietarioEsTomador === 'boolean'
      ? resueltos.propietarioEsTomador
      : suponer('propietarioEsTomador', true, 'se supone que el tomador es el dueño de la vivienda (va también como propietario en la petición)')

  const datos: Partial<DatosHogar> = {
    // ── Persona: NUNCA se supone ──
    dni: limpio(cliente.dni) ?? undefined,
    nombre: nombreUtil(cliente.nombre) ?? undefined,
    apellido1: primero ?? undefined,
    apellido2: segundo,
    fechaNacimiento: limpio(cliente.fechaNacimiento) ?? undefined,
    sexo: sexoDeSaludo(cliente.saludo) ?? undefined,
    estadoCivil: limpio(resueltos.estadoCivilId) ?? undefined,
    telefono: limpio(cliente.telefono)?.replace(/\s/g, '') ?? undefined,
    cpResidencia: limpio(cliente.codigoPostal),
    municipioResidenciaId: null,

    // ── Dónde ──
    cp: cp ?? undefined,
    municipioId: resueltos.municipioId ?? undefined,
    tipoViaId,
    nombreVia: dir.nombre ?? undefined,
    numeroVia: dir.numero ?? undefined,
    planta: dir.planta,
    puertaVivienda: dir.puerta,

    // ── Cómo es ──
    metrosCuadrados: metrosFinal ?? undefined,
    anioConstruccion: anioFinal ?? undefined,
    habitaciones,
    tipoVivienda: idDe('tipoVivienda'),
    uso: idDe('uso'),
    ocupacion: idDe('ocupacion'),
    ubicacion: idDe('ubicacion'),
    material: idDe('material'),
    calidad: idDe('calidad'),
    alarma: idDe('alarma'),
    puertasSecundarias: idDe('puertasSecundarias'),
    asentamiento: idDe('asentamiento'),
    puertaPrincipalBlindada,
    ventanasSeguras,
    urbanizacionCerrada,
    propietarioEsTomador,

    // ── Cuánto ──
    capitalContinente,
    capitalContenido,
    joyasEnCajaFuerte,
    joyasFueraDeCaja,
    objetosDeValor,
    perrosPeligrosos,

    fechaEfecto,
  }

  return { datos, supuestos, faltan: revisarDatosHogar(datos), fuenteRiesgo }
}

/**
 * Habitaciones (dormitorios) estimadas por superficie construida. Es un
 * supuesto declarado, no un dato: el vendor exige el número y la ficha no lo
 * tiene. Tramos típicos de vivienda española.
 */
export function habitacionesPorSuperficie(m2: number): number {
  if (m2 < 45) return 1
  if (m2 < 70) return 2
  if (m2 < 100) return 3
  if (m2 < 140) return 4
  return 5
}

const NOMBRES_CENTINELA = new Set(['lead', 'cliente', 'sin nombre', 'desconocido', 'n/a', '-'])
function nombreUtil(v: string | null): string | null {
  const t = limpio(v)
  if (t === null) return null
  return NOMBRES_CENTINELA.has(t.toLowerCase()) ? null : t
}

// ─── La dirección, troceada ──────────────────────────────────────────────────

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

/**
 * Lee el riesgo de hogar de un `datos_especificos` (póliza o gemela). Los
 * números del volcado vienen como TEXTO («76», «61000»): se convierten, y lo
 * que no es número queda a `null` — nunca a 0.
 */
export function hogarDeDatos(
  datos: Record<string, unknown> | null,
  fuente: 'poliza' | 'gemela',
  direccionDescifrada: string | null = null,
): HogarCartera | null {
  if (!datos) return null
  const h: HogarCartera = {
    cp: cpDe(datos.cp),
    localidad: limpio(typeof datos.localidad === 'string' ? datos.localidad : null),
    direccion: direccionDescifrada,
    metrosCuadrados: num(datos.metrosCuadrados),
    anioConstruccion: entero(datos.anioConstruccion),
    capitalContinente: num(datos.continente),
    capitalContenido: num(datos.contenido),
    fuente,
  }
  const hayAlgo = Object.entries(h).some(([k, v]) => k !== 'fuente' && v !== null)
  return hayAlgo ? h : null
}

/** El riesgo que se usa: el de la póliza si está completa; si no, la gemela; si ninguna, lo que haya. */
export function elegirRiesgo(propio: HogarCartera | null, gemela: HogarCartera | null): HogarCartera | null {
  const completo = (x: HogarCartera | null) => x !== null && x.metrosCuadrados !== null && x.anioConstruccion !== null && x.cp !== null
  if (completo(propio)) return propio
  if (completo(gemela)) return gemela
  return propio ?? gemela
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}
function entero(v: unknown): number | null {
  const n = num(v)
  return n !== null && Number.isInteger(n) ? n : null
}
function cpDe(v: unknown): string | null {
  const t = limpio(typeof v === 'string' ? v : null)
  return t !== null && /^\d{5}$/.test(t) ? t : null
}
