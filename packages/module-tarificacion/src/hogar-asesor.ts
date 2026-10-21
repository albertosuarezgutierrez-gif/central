// Ayudas PURAS para trabajar una oportunidad de HOGAR (20/10/2026): sugerencia de capital de continente, aviso de infraseguro,
// discrepancias declarado↔Catastro, preguntas por antigüedad del inmueble y filtro de bots por uso. Ni BD, ni red, ni reloj
// (`hoy` se inyecta: regla de la casa «tests con fecha fija contra reloj real = bomba de tiempo»).
//
// 🚨 Todo esto ASESORA, no impone: la sugerencia de capital se muestra, nunca se escribe sola; los avisos no bloquean.
// 🚨 `null` = «no se sabe». Sin m² no hay sugerencia (nunca 0); sin año no hay preguntas de reforma ni aviso de antigüedad.

const sinAcentos = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// ─── a) Capital de continente sugerido ───────────────────────────────────────────────────────────────────────────────────
//
// ESTIMACIÓN, no tarifa de ninguna compañía: coste de reconstrucción por m² construido de una vivienda de calidad media, por
// ZONA de provincia. Son órdenes de magnitud de mercado (el valor de reconstrucción habitual de un piso va de ~1.000 a ~1.500 €/m²);
// la tabla es de Alberto para afinarla. Una provincia que no conste en ninguna zona usa la media y lo dice (`zona: 'media'`).

export const COSTE_RECONSTRUCCION_EUR_M2 = Object.freeze({ alta: 1400, media: 1150, baja: 1000 })
export type ZonaCoste = keyof typeof COSTE_RECONSTRUCCION_EUR_M2

const PROVINCIAS_ZONA: Readonly<Record<'alta' | 'baja', readonly string[]>> = Object.freeze({
  alta: ['madrid', 'barcelona', 'illes balears', 'baleares', 'islas baleares', 'gipuzkoa', 'guipuzcoa', 'bizkaia', 'vizcaya', 'alava', 'araba'],
  baja: ['badajoz', 'caceres', 'jaen', 'zamora', 'soria', 'teruel', 'avila', 'palencia', 'ourense', 'orense', 'lugo', 'cuenca', 'ciudad real', 'albacete', 'leon', 'huesca'],
})

export function zonaCostePorProvincia(provincia: string | null | undefined): ZonaCoste {
  const p = sinAcentos(provincia ?? '')
  if (p !== '') {
    if (PROVINCIAS_ZONA.alta.includes(p)) return 'alta'
    if (PROVINCIAS_ZONA.baja.includes(p)) return 'baja'
  }
  return 'media'
}

export type CapitalSugerido = {
  /** m² × coste de reconstrucción, redondeado a la centena. */
  capitalEur: number
  eurPorM2: number
  zona: ZonaCoste
  /** Siempre `true`: es una estimación, no un dato de compañía. */
  estimacion: true
}

/** `null` si los m² no constan o no son una superficie (≤ 0). No se inventa una superficie. */
export function capitalContinenteSugerido(m2: number | null | undefined, provincia: string | null | undefined): CapitalSugerido | null {
  if (typeof m2 !== 'number' || !Number.isFinite(m2) || m2 <= 0) return null
  const zona = zonaCostePorProvincia(provincia)
  const eurPorM2 = COSTE_RECONSTRUCCION_EUR_M2[zona]
  return { capitalEur: Math.round((m2 * eurPorM2) / 100) * 100, eurPorM2, zona, estimacion: true }
}

/** Por debajo de esta fracción del capital sugerido se avisa de infraseguro. */
export const UMBRAL_INFRASEGURO = 0.8

export type AvisoInfraseguro = { infraseguro: boolean; ratio: number }

/** `null` si falta el capital tecleado o el sugerido (sin base no se compara). `ratio` = tecleado / sugerido. */
export function avisoInfraseguro(capitalTecleadoEur: number | null | undefined, sugeridoEur: number | null | undefined): AvisoInfraseguro | null {
  if (typeof capitalTecleadoEur !== 'number' || !Number.isFinite(capitalTecleadoEur) || capitalTecleadoEur <= 0) return null
  if (typeof sugeridoEur !== 'number' || !Number.isFinite(sugeridoEur) || sugeridoEur <= 0) return null
  const ratio = capitalTecleadoEur / sugeridoEur
  return { infraseguro: ratio < UMBRAL_INFRASEGURO, ratio }
}

// ─── b) Discrepancias declarado ↔ Catastro ───────────────────────────────────────────────────────────────────────────────

export type DiscrepanciaCatastro = { campo: 'metrosCuadrados' | 'anioConstruccion'; declarado: number; catastro: number; mensaje: string }

/** Diferencia relativa de m² (sobre el Catastro) a partir de la cual se avisa. */
export const TOLERANCIA_M2 = 0.1

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

/** Solo se compara lo que consta en AMBOS lados; un lado `null` no genera aviso (no se sabe). */
export function discrepanciasCatastro(
  declarado: { metrosCuadrados?: number | null; anioConstruccion?: number | null },
  catastro: { metrosCuadrados?: number | null; anioConstruccion?: number | null },
): DiscrepanciaCatastro[] {
  const r: DiscrepanciaCatastro[] = []
  const dm = num(declarado.metrosCuadrados)
  const cm = num(catastro.metrosCuadrados)
  if (dm !== null && cm !== null && Math.abs(dm - cm) / cm > TOLERANCIA_M2) {
    r.push({ campo: 'metrosCuadrados', declarado: dm, catastro: cm, mensaje: `Superficie declarada ${dm} m², el Catastro dice ${cm} m² (más de un ${TOLERANCIA_M2 * 100}% de diferencia).` })
  }
  const da = num(declarado.anioConstruccion)
  const ca = num(catastro.anioConstruccion)
  if (da !== null && ca !== null && da !== ca) {
    r.push({ campo: 'anioConstruccion', declarado: da, catastro: ca, mensaje: `Año de construcción declarado ${da}, el Catastro dice ${ca}.` })
  }
  return r
}

// ─── c) Preguntas por antigüedad ─────────────────────────────────────────────────────────────────────────────────────────

/** Años de antigüedad a partir de los cuales se pregunta por las reformas de tuberías e instalación eléctrica (estrictamente más). */
export const ANTIGUEDAD_PREGUNTAR_REFORMAS = 40

export type PreguntasAntiguedad = {
  /** `null` = año desconocido (no se sabe la antigüedad). */
  antiguedad: number | null
  preguntarReformaTuberias: boolean
  preguntarReformaElectrica: boolean
}

export function preguntasPorAntiguedad(anioConstruccion: number | null | undefined, hoy: Date): PreguntasAntiguedad {
  const a = typeof anioConstruccion === 'number' && Number.isInteger(anioConstruccion) && anioConstruccion >= 1500 ? anioConstruccion : null
  if (a === null) return { antiguedad: null, preguntarReformaTuberias: false, preguntarReformaElectrica: false }
  const antiguedad = hoy.getUTCFullYear() - a
  const preguntar = antiguedad > ANTIGUEDAD_PREGUNTAR_REFORMAS
  return { antiguedad, preguntarReformaTuberias: preguntar, preguntarReformaElectrica: preguntar }
}

// ─── d) Bots según el USO de la vivienda ─────────────────────────────────────────────────────────────────────────────────

/** Usos que distingue la tabla. `deshabitada` no está en `USOS_VIVIENDA` del bot: aquí solo sirve para avisar. */
export const USOS_FILTRO_BOTS = ['habitual', 'secundaria', 'alquiler', 'turistico', 'deshabitada'] as const
export type UsoFiltroBots = (typeof USOS_FILTRO_BOTS)[number]

export type AceptaUso = 'acepta' | 'no_acepta' | 'sin_confirmar'

/**
 * TABLA PARA QUE ALBERTO LA COMPLETE (compañía → uso → ¿lo acepta?). 🚨 Aquí NO se ha confirmado ninguna exclusión real: lo único que
 * está atestiguado es que el bot tarifica vivienda HABITUAL (Allianz Hogar, Mapfre Hogar). El resto es `sin_confirmar`: NO se
 * excluye la compañía (no se inventa una regla), pero se avisa de que no se sabe si lo acepta. Cuando Alberto confirme una regla
 * (p. ej. «Mapfre no suscribe turístico»), se cambia el valor a `no_acepta` AQUÍ y el filtro excluye ese bot. Compañía que no
 * esté en la tabla = todo `sin_confirmar`.
 */
export const REGLAS_USO_COMPANIA: Readonly<Record<string, Readonly<Record<UsoFiltroBots, AceptaUso>>>> = Object.freeze({
  allianz: Object.freeze({ habitual: 'acepta', secundaria: 'sin_confirmar', alquiler: 'sin_confirmar', turistico: 'sin_confirmar', deshabitada: 'sin_confirmar' }),
  mapfre: Object.freeze({ habitual: 'acepta', secundaria: 'sin_confirmar', alquiler: 'sin_confirmar', turistico: 'sin_confirmar', deshabitada: 'sin_confirmar' }),
})

export function aceptaUso(compania: string, uso: string): AceptaUso {
  const reglas = REGLAS_USO_COMPANIA[compania.trim().toLowerCase()]
  if (!reglas || !Object.hasOwn(reglas, uso)) return 'sin_confirmar'
  return reglas[uso as UsoFiltroBots]
}

export type FiltroBotsPorUso = {
  /** `true` = el uso no se ha contestado: no se lanza ningún bot (la pregunta es obligatoria). */
  usoPendiente: boolean
  /** Bots que se pueden lanzar (incluye los `sin_confirmar`, que se lanzan con aviso). */
  lanzar: string[]
  /** Excluidos porque su regla confirmada dice que NO aceptan ese uso. */
  excluidas: { compania: string; motivo: string }[]
  /** Los que se lanzan sin saber si aceptan ese uso. */
  sinConfirmar: string[]
}

/** `uso` vacío/`null` = pendiente: nada se lanza (el bot cuesta dinero o tiempo y el uso decide la tarifa). PURA. */
export function filtrarBotsPorUso(uso: string | null | undefined, bots: readonly string[]): FiltroBotsPorUso {
  const u = typeof uso === 'string' ? uso.trim().toLowerCase() : ''
  if (u === '') return { usoPendiente: true, lanzar: [], excluidas: [], sinConfirmar: [] }
  const lanzar: string[] = []
  const excluidas: FiltroBotsPorUso['excluidas'] = []
  const sinConfirmar: string[] = []
  for (const b of bots) {
    const a = aceptaUso(b, u)
    if (a === 'no_acepta') excluidas.push({ compania: b, motivo: `${b} no acepta vivienda de uso «${u}».` })
    else {
      lanzar.push(b)
      if (a === 'sin_confirmar') sinConfirmar.push(b)
    }
  }
  return { usoPendiente: false, lanzar, excluidas, sinConfirmar }
}
