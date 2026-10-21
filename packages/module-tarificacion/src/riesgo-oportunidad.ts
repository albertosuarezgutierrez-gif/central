// Riesgo de una EXPLORACIÓN con datos reales anclada a una OPORTUNIDAD de Hogar (vía «c», 13/10/2026). PURO.
//
// De la ficha del cliente (ya descifrada por quien llama) + `oportunidades.info_riesgo.datosVivienda` (nombres de
// `@central/module-seguros` → datos-vivienda-riesgo.ts) a la forma que lee el worker por `rutaRiesgo` del catálogo
// (`explorador.ts`): `{ tomador, inmueble, hogar }`.
//
// 🚨 Nada se inventa: lo que la oportunidad no trae se OMITE. Año de construcción y m² (obligatorios en Allianz Hogar, que
//    NO los autocompleta antes de avanzar) los completa asegura al encolar desde el Catastro, solo si es inequívoco
//    (`completarInmuebleConCatastro` / `inmuebleUnicoCatastro`, abajo). 🚨 USO de la vivienda y RÉGIMEN deciden la tarifa: tienen que venir EXPLÍCITOS en
//    `datosVivienda` (`ocupacion` = uso habitual/secundaria/alquiler…, `uso` = régimen propietario/inquilino, ids del
//    catálogo de Codeoscopic). Sin ellos no hay riesgo: la exploración no se encola. Nunca un valor por defecto.
//    Y su id tiene que estar en el mapa cerrado `ETIQUETAS_ID_HOGAR` (la IA ve su significado en español).

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const texto = (v: unknown, max = 120): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t !== '' && t.length <= max ? t : null
}

const positivo = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : null)

/**
 * MAPA CERRADO id de Codeoscopic → su significado en español, para los tres catálogos de Hogar cuyo valor ve la IA
 * (`CLAVES_VALOR_VISIBLE_IA` de `explorador.ts`). La IA casa la opción del portal (en español) con el SIGNIFICADO, no con
 * el id inglés. Solo ids con su etiqueta atestiguada en el repo (DEFECTOS_HOGAR y tests de `apps/asegura/lib/codeoscopic`,
 * `docs/CODEOSCOPIC-API-PORTAL.md` § Hogar): `Owner`/«Propietario», `Tenant`/«Inquilino», `MainResidence`/«Habitual»,
 * `MiddleFloor`/«Piso intermedio». 🚨 Un id que no esté aquí NO se traduce ni se adivina: la oportunidad se rechaza
 * (`noReconocidos` → 409 `oportunidad_incompleta`). Añadir uno = verlo en el catálogo vivo (`GET /home/<catálogo>`).
 */
export const ETIQUETAS_ID_HOGAR = Object.freeze({
  /** `datosVivienda.ocupacion` → catálogo `/home/occupancy-types` = USO de la vivienda. */
  uso: Object.freeze({ MainResidence: 'Vivienda habitual' }) as Readonly<Record<string, string>>,
  /** `datosVivienda.uso` → catálogo `/home/uses` = RÉGIMEN. */
  regimen: Object.freeze({ Owner: 'Propietario', Tenant: 'Inquilino' }) as Readonly<Record<string, string>>,
  /** `datosVivienda.tipoVivienda` → catálogo `/home/property-types`. */
  tipoVivienda: Object.freeze({ MiddleFloor: 'Piso intermedio' }) as Readonly<Record<string, string>>,
})
export type CampoIdHogar = keyof typeof ETIQUETAS_ID_HOGAR

/** El significado en español de un id del mapa cerrado; `null` si no está (nunca se adivina). */
export function etiquetaIdHogar(campo: CampoIdHogar, id: unknown): string | null {
  if (typeof id !== 'string') return null
  const m = ETIQUETAS_ID_HOGAR[campo]
  return Object.hasOwn(m, id) ? m[id] : null
}

// ─── Claves CANÓNICAS del formulario de Hogar desde el catálogo de Codeoscopic (19/10/2026) ───────────────────────────────
//
// El bot de Allianz Hogar (`FormularioHogar`) usa claves en español (`habitual`, `propietario`, `piso`…), no los ids de Codeoscopic
// que guarda `datosVivienda`. La traducción es CERRADA y EXACTA, por dos vías y nada más:
//   1. el id atestiguado en el repo (`ETIQUETAS_ID_HOGAR`: MainResidence, Owner, Tenant, MiddleFloor);
//   2. el NOMBRE en español de esa opción en el catálogo vivo (`GET /home/<catálogo>`), igual a una de las frases de la tabla
//      tras quitar mayúsculas, tildes y signos. Una frase parecida pero distinta NO casa.
// 🚨 Sin suponer: lo que no casa exactamente es `null` («sin dato») y lo elige una persona. Los ids de «segunda residencia»,
//    «alquiler», «turístico» y de los demás tipos de vivienda NO están atestiguados en el repo: por eso se casan por su nombre y
//    no por un id escrito de memoria. Añadir una frase = haberla visto en el catálogo vivo.

/** Los tres campos de `datosVivienda` que el bot de Hogar traduce. `uso` = `ocupacion`; `regimen` = `uso` (ojo: Codeoscopic los cruza). */
export type CampoCanonicoHogar = 'uso' | 'regimen' | 'tipoVivienda'

const sinSignos = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const FRASES_CANONICAS: Readonly<Record<CampoCanonicoHogar, Readonly<Record<string, readonly string[]>>>> = Object.freeze({
  uso: Object.freeze({
    habitual: ['vivienda habitual', 'habitual', 'residencia habitual'],
    secundaria: ['vivienda secundaria', 'secundaria', 'segunda residencia', 'segunda vivienda', 'residencia secundaria'],
    alquiler: ['alquiler', 'vivienda en alquiler', 'vivienda alquilada', 'alquilada', 'en alquiler'],
    turistico: ['turistico', 'vivienda turistica', 'uso turistico', 'turistico o vacacional', 'vivienda de uso turistico', 'alquiler turistico', 'vivienda vacacional'],
  }),
  regimen: Object.freeze({
    propietario: ['propietario', 'propietaria'],
    inquilino: ['inquilino', 'inquilina', 'arrendatario', 'arrendataria'],
  }),
  tipoVivienda: Object.freeze({
    piso: ['piso', 'piso intermedio'],
    planta_baja: ['planta baja', 'piso planta baja', 'piso en planta baja'],
    atico: ['atico', 'piso atico'],
    adosada: ['adosada', 'vivienda adosada', 'casa adosada', 'chalet adosado', 'adosado', 'unifamiliar adosado', 'unifamiliar adosada'],
    independiente: ['independiente', 'vivienda independiente', 'casa independiente', 'chalet independiente', 'unifamiliar independiente'],
  }),
})

/** id atestiguado → clave canónica (la misma lista cerrada que `ETIQUETAS_ID_HOGAR`). */
const CLAVE_DE_ID: Readonly<Record<CampoCanonicoHogar, Readonly<Record<string, string>>>> = Object.freeze({
  uso: Object.freeze({ MainResidence: 'habitual' }),
  regimen: Object.freeze({ Owner: 'propietario', Tenant: 'inquilino' }),
  tipoVivienda: Object.freeze({ MiddleFloor: 'piso' }),
})

/**
 * Clave canónica de Hogar para un valor de `datosVivienda`, o `null` si no casa EXACTAMENTE (ni por id atestiguado ni por el
 * nombre del catálogo). `nombre` = el texto de esa opción en el catálogo vivo (opcional: sin él solo vale el id). Si el id y el
 * nombre dicen cosas distintas, `null` (hay algo raro: lo decide una persona). Nunca un valor por defecto. PURA.
 */
export function claveHogarDeCatalogo(campo: CampoCanonicoHogar, id: unknown, nombre?: unknown): string | null {
  const porId = typeof id === 'string' && Object.hasOwn(CLAVE_DE_ID[campo], id.trim()) ? CLAVE_DE_ID[campo][id.trim()] : null
  let porNombre: string | null = null
  if (typeof nombre === 'string' && sinSignos(nombre) !== '') {
    const n = sinSignos(nombre)
    const hallados = Object.entries(FRASES_CANONICAS[campo]).filter(([, frases]) => frases.includes(n)).map(([clave]) => clave)
    porNombre = hallados.length === 1 ? hallados[0]! : null
  }
  if (porId !== null && porNombre !== null && porId !== porNombre) return null
  return porId ?? porNombre
}

/** Tipo de vía solo si ya es una palabra («Calle», «Avenida»): un código numérico de catálogo no lo es. */
const RE_TIPO_VIA = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ. ]{2,30}$/

/** dd/mm/aaaa desde ISO (`aaaa-mm-dd…`) o desde dd/mm/aaaa. Otra forma → `null` (se omite, no se adivina). */
export function fechaDdMmAaaa(v: unknown): string | null {
  const t = texto(v, 40)
  if (!t) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(t)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return /^\d{2}\/\d{2}\/\d{4}$/.test(t) ? t : null
}

export type FichaTomadorExploracion = {
  nif?: string | null
  nombre?: string | null
  apellido1?: string | null
  apellido2?: string | null
  /** ISO o dd/mm/aaaa. */
  fechaNacimiento?: string | null
}

/** Lo que falta para poder explorar con datos reales (nombres de campo, nunca valores). */
export type FaltaRiesgoOportunidad =
  | 'tomador.nif' | 'tomador.nombre' | 'tomador.apellido1' | 'datosVivienda' | 'datosVivienda.ocupacion' | 'datosVivienda.uso'

/** Ids presentes en `datosVivienda` pero fuera de {@link ETIQUETAS_ID_HOGAR}: no se sabe qué significan. */
export type NoReconocidoRiesgoOportunidad = 'datosVivienda.ocupacion' | 'datosVivienda.uso' | 'datosVivienda.tipoVivienda'

export type ResultadoRiesgoOportunidad =
  | { ok: true; riesgo: { tomador: Record<string, string>; inmueble: Record<string, string | number>; hogar: Record<string, string | number> } }
  | { ok: false; faltan: FaltaRiesgoOportunidad[]; noReconocidos?: NoReconocidoRiesgoOportunidad[] }

/**
 * Ficha + `datosVivienda` → `{ tomador, inmueble, hogar }`. Obligatorios: NIF, nombre y primer apellido del tomador, el
 * bloque `datosVivienda`, su USO (`ocupacion`) y su RÉGIMEN (`uso`). Todo lo demás, solo si viene (si no, la clave no
 * está y el worker no rellena nada en su lugar).
 */
export function riesgoExploracionDeOportunidad(ficha: FichaTomadorExploracion | null | undefined, datosVivienda: unknown): ResultadoRiesgoOportunidad {
  const f = ficha ?? {}
  const faltan: FaltaRiesgoOportunidad[] = []
  const nif = texto(f.nif, 20)?.toUpperCase().replace(/[\s-]/g, '') ?? null
  const nombre = texto(f.nombre)
  const apellido1 = texto(f.apellido1)
  const apellido2 = texto(f.apellido2)
  if (!nif) faltan.push('tomador.nif')
  if (!nombre) faltan.push('tomador.nombre')
  if (!apellido1) faltan.push('tomador.apellido1')
  const v = obj(datosVivienda)
  const noReconocidos: NoReconocidoRiesgoOportunidad[] = []
  // Id → solo si está en el mapa cerrado. Vacío = falta; presente y desconocido = no reconocido (los dos → 409).
  const idConocido = (campo: CampoIdHogar, bruto: unknown, nombre: NoReconocidoRiesgoOportunidad, obligatorio: boolean): string | null => {
    const t = texto(bruto, 60)
    if (t === null) {
      if (obligatorio) faltan.push(nombre as FaltaRiesgoOportunidad)
      return null
    }
    if (etiquetaIdHogar(campo, t) === null) {
      noReconocidos.push(nombre)
      return null
    }
    return t
  }
  let uso: string | null = null
  let regimen: string | null = null
  let tipoVivienda: string | null = null
  if (!v) faltan.push('datosVivienda')
  else {
    uso = idConocido('uso', v.ocupacion, 'datosVivienda.ocupacion', true)
    regimen = idConocido('regimen', v.uso, 'datosVivienda.uso', true)
    tipoVivienda = idConocido('tipoVivienda', v.tipoVivienda, 'datosVivienda.tipoVivienda', false)
  }
  if (faltan.length || noReconocidos.length) return { ok: false, faltan, ...(noReconocidos.length ? { noReconocidos } : {}) }

  const tomador: Record<string, string> = { nif: nif!, nombre: nombre!, apellido1: apellido1! }
  if (apellido2) tomador.apellido2 = apellido2
  tomador.nombreCompleto = [nombre, apellido1, apellido2].filter(Boolean).join(' ')
  const nac = fechaDdMmAaaa(f.fechaNacimiento)
  if (nac) tomador.fechaNacimiento = nac

  const inmueble: Record<string, string | number> = {}
  const pon = (k: string, x: string | number | null) => { if (x !== null) inmueble[k] = x }
  const tipoVia = texto(v!.tipoViaId, 30)
  pon('tipoVia', tipoVia !== null && RE_TIPO_VIA.test(tipoVia) ? tipoVia : null)
  pon('nombreVia', texto(v!.nombreVia, 80))
  pon('numero', texto(v!.numeroVia, 10))
  const cp = texto(v!.cp, 5)
  pon('codigoPostal', cp !== null && /^\d{5}$/.test(cp) ? cp : null)
  pon('municipio', texto(v!.municipio, 80))
  pon('provincia', texto(v!.provincia, 60))
  pon('planta', texto(v!.planta, 10))
  pon('superficieM2', positivo(v!.metrosCuadrados, 100_000))
  const anio = v!.anioConstruccion
  pon('anioConstruccion', typeof anio === 'number' && Number.isInteger(anio) && anio >= 1500 && anio <= 2100 ? anio : null)

  const hogar: Record<string, string | number> = { uso: uso!, regimen: regimen! }
  if (tipoVivienda) hogar.tipoVivienda = tipoVivienda
  const cc = positivo(v!.capitalContinente, 100_000_000)
  if (cc !== null) hogar.capitalContinente = cc
  const ct = positivo(v!.capitalContenido, 100_000_000)
  if (ct !== null) hogar.capitalContenido = ct

  return { ok: true, riesgo: { tomador, inmueble, hogar } }
}

// ─── Catastro para el año y los m² (14/10/2026) ───────────────────────────────
//
// La pantalla «Datos del tomador y vivienda» de Allianz Hogar EXIGE año y m² y no los autocompleta antes de avanzar. Si la
// oportunidad no los trae, asegura los consulta en el Catastro al ENCOLAR (solo para el `riesgo` del trabajo; nunca se
// guardan en la oportunidad). Estas son las reglas puras; la red vive en asegura (`tarificador-explorador-catastro.ts`).
// 🚨 Solo un resultado INEQUÍVOCO: un único inmueble que casa con planta/puerta. Varios o ninguno → sin valor.

/** Lo mínimo de un inmueble de `Consulta_DNPLOC` (`InmuebleCatastro` de `@central/core-catastro`). */
export type InmuebleCatastroMin = { refCompleta: string; planta: string | null; puerta: string | null; codigoPostal: string | null }

export type EleccionInmueble = { estado: 'unico'; refCompleta: string } | { estado: 'varios' } | { estado: 'ninguno' }

/** Planta/puerta comparables: mayúsculas, sin «º/ª/.»/espacios, números sin ceros a la izquierda, «BAJO/BJ» = 0. */
export function normPlantaPuerta(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const t = String(v).toUpperCase().replace(/[ºª°.\s-]/g, '')
  if (t === '') return null
  if (/^(BAJO|BAJA|BJ|BJO|PB)$/.test(t)) return '0'
  return /^\d+$/.test(t) ? String(Number.parseInt(t, 10)) : t
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

const ORDINALES_PLANTA: Readonly<Record<string, string>> = Object.freeze({
  PRIMERO: '1', PRIMERA: '1', PRIMER: '1', SEGUNDO: '2', SEGUNDA: '2', TERCERO: '3', TERCERA: '3', TERCER: '3',
  CUARTO: '4', CUARTA: '4', QUINTO: '5', QUINTA: '5', SEXTO: '6', SEXTA: '6', SEPTIMO: '7', SEPTIMA: '7',
  OCTAVO: '8', OCTAVA: '8', NOVENO: '9', NOVENA: '9', DECIMO: '10', DECIMA: '10',
})

/**
 * PLANTA como la codifica el Catastro (`<pt>` de `Consulta_DNPLOC`: «01», «00», «-1», «AT»…), 14/10/2026: «1»/«1º»/
 * «primero»/«01» → `1`; «bajo»/«0»/«00»/«BJ»/«PB» → `0`; «ático»/«AT» → `AT`; «-1» (sótano) → `-1` (nunca `1`, que lo
 * confundiría con la primera). Otra cosa: en mayúsculas sin signos. Pura.
 */
export function normPlantaCatastro(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const t = sinTildes(String(v).toUpperCase()).replace(/[ºª°.\s]/g, '')
  if (t === '') return null
  const neg = /^-(\d+)$/.exec(t)
  if (neg) return Number.parseInt(neg[1], 10) === 0 ? '0' : `-${Number.parseInt(neg[1], 10)}`
  const s = t.replace(/-/g, '')
  if (/^(BAJO|BAJA|BJ|BJO|PB|PLANTABAJA)$/.test(s)) return '0'
  if (/^(ATICO|AT|ATC)$/.test(s)) return 'AT'
  if (Object.hasOwn(ORDINALES_PLANTA, s)) return ORDINALES_PLANTA[s]
  // «1», «01», «1O»/«1A» (º/ª escritos como letra), «1ER»/«1RO».
  const n = /^(\d{1,3})(?:O|A|ER|RO|DO|TO)?$/.exec(s)
  return n ? String(Number.parseInt(n[1], 10)) : s
}

/**
 * PUERTA como la codifica el Catastro (`<pu>`: «IZ», «DR», «A», «01»…), 14/10/2026: «Izquierda»/«Izq»/«Izda»/«I»/«IZ» →
 * `IZ`; «Derecha»/«Dcha»/«Dr»/«D» → `DR`; «Centro»/«Ctro»/«CT» → `CT`; letras («A», «B») tal cual; números sin ceros a la
 * izquierda. Pura. (Una «D» puede ser la letra D: se normalizan los DOS lados igual, así que casa igual; si hubiera «D»
 * y «DR» en el mismo portal salen los dos → `varios`, nunca uno a dedo.)
 */
export function normPuertaCatastro(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const t = sinTildes(String(v).toUpperCase()).replace(/[ºª°.\s-]/g, '')
  if (t === '') return null
  if (/^(IZQUIERDA|IZQUIERDO|IZQDA|IZQDO|IZDA|IZDO|IZQ|IZ|I)$/.test(t)) return 'IZ'
  if (/^(DERECHA|DERECHO|DCHA|DCHO|DRCHA|DRCHO|DRA|DCH|DER|DR|D)$/.test(t)) return 'DR'
  if (/^(CENTRO|CTRO|CT)$/.test(t)) return 'CT'
  return /^\d+$/.test(t) ? String(Number.parseInt(t, 10)) : t
}

const normCp = (v: unknown): string | null => {
  const t = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''
  return /^\d{4,5}$/.test(t) ? t.padStart(5, '0') : null
}

/**
 * El inmueble del portal que es LA vivienda, solo si es inequívoco. Con planta y/o puerta: los que casan con lo dado
 * (normalizado); sin ninguna de las dos: solo si el portal tiene UN inmueble (unifamiliar). Un CP distinto (si los dos lo
 * tienen) descarta. Uno → `unico`; más → `varios`; cero → `ninguno`. Pura.
 */
export function inmuebleUnicoCatastro(inmuebles: readonly InmuebleCatastroMin[], q: { planta?: unknown; puerta?: unknown; codigoPostal?: unknown }): EleccionInmueble {
  // Planta y puerta normalizadas COMO EL CATASTRO (14/10/2026: «1» + «Izquierda» daba `ninguno` contra «01» + «IZ»).
  const planta = normPlantaCatastro(q.planta)
  const puerta = normPuertaCatastro(q.puerta)
  const cp = normCp(q.codigoPostal)
  const casan = inmuebles.filter((i) => {
    if (!/^[0-9A-Z]{20}$/.test(i.refCompleta)) return false
    const icp = normCp(i.codigoPostal)
    if (cp && icp && cp !== icp) return false
    if (planta !== null && normPlantaCatastro(i.planta) !== planta) return false
    if (puerta !== null && normPuertaCatastro(i.puerta) !== puerta) return false
    return true
  })
  if (casan.length === 0) return { estado: 'ninguno' }
  if (casan.length > 1 || (planta === null && puerta === null && inmuebles.length > 1)) return { estado: 'varios' }
  return { estado: 'unico', refCompleta: casan[0].refCompleta }
}

/** Lo que falta en `riesgo.inmueble` y el Catastro puede dar. */
export type CampoCatastroRiesgo = 'anioConstruccion' | 'superficieM2'

export function faltanDatosCatastro(riesgo: { inmueble: Record<string, string | number> }): CampoCatastroRiesgo[] {
  return (['anioConstruccion', 'superficieM2'] as const).filter((k) => !(k in riesgo.inmueble))
}

/**
 * Copia del riesgo con año/m² del Catastro SOLO donde faltaban y SOLO si son válidos (mismos rangos que la oportunidad).
 * Nunca pisa lo que ya trae la oportunidad. Devuelve también qué se añadió (nombres, nunca valores). Pura.
 */
export function completarInmuebleConCatastro<R extends { inmueble: Record<string, string | number> }>(
  riesgo: R,
  catastro: { anioConstruccion: number | null; metrosCuadrados: number | null },
): { riesgo: R; anadidos: CampoCatastroRiesgo[] } {
  const inmueble = { ...riesgo.inmueble }
  const anadidos: CampoCatastroRiesgo[] = []
  const anio = catastro.anioConstruccion
  if (!('anioConstruccion' in inmueble) && typeof anio === 'number' && Number.isInteger(anio) && anio >= 1500 && anio <= 2100) {
    inmueble.anioConstruccion = anio
    anadidos.push('anioConstruccion')
  }
  const m2 = positivo(catastro.metrosCuadrados, 100_000)
  if (!('superficieM2' in inmueble) && m2 !== null) {
    inmueble.superficieM2 = m2
    anadidos.push('superficieM2')
  }
  return { riesgo: { ...riesgo, inmueble }, anadidos }
}
