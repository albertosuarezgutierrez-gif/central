// Qué tipo de vivienda es, DEDUCIDO del Catastro (26/10/2026, Alberto: «no preguntes nada que se pueda deducir de la
// dirección y del Catastro»). PURO: entran la lista del portal (`Consulta_DNPLOC`), lo que dice la ficha del inmueble
// (`caracterizarVivienda` de core-catastro) y la planta DECLARADA; sale el tipo canónico del bot (`TIPOS_VIVIENDA`) o
// `null` («no se sabe»: entonces el formulario lo pregunta). Lo deducido es dato del Catastro, sin confirmar.
//
// Reglas de «último piso» (Alberto, 26/10/2026), una por caso:
//   - Plantas de la parcela, solo de inmuebles RESIDENCIALES: «BJ»/«00» = 0; «EN» = entreplanta (nunca la última);
//     «SM»/«-1» y sótanos se ignoran; «AT»/«ÁTICO» = ático, por encima de la numérica más alta.
//     🚨 `Consulta_DNPLOC` NO trae el uso de cada inmueble (fixture real `module-subastas/test/fixture-dnploc.xml`): se
//     descartan solo los que traen un uso NO residencial; los que no lo traen cuentan (no se puede saber más sin pedir
//     la ficha de cada piso).
//   - Último piso = la declarada es la máxima residencial, o es «AT». Tipo «ático» SOLO si es «AT»: un último piso
//     numérico es «piso» con `ultimoPiso: 'ultimo'` (se anota como planta + `ultimoPiso = true`).
//   - Declarada que NO existe en el Catastro (declara 2º y solo hay 00 y 01) → nada se deduce y se avisa para revisar.
//   - Sin plantas en el Catastro → nada se deduce (la pregunta se muestra).
import { normPlantaCatastro } from './riesgo-oportunidad.ts'
import type { TipoVivienda } from './formulario-hogar.ts'

export type PlantaCatastro = { t: 'num'; n: number } | { t: 'atico' } | { t: 'entreplanta' }

/** Una planta del Catastro (o declarada) normalizada; `null` = se ignora (sótano, semisótano, negativa o desconocida). */
export function plantaResidencial(v: unknown): PlantaCatastro | null {
  const p = normPlantaCatastro(v)
  if (p === null) return null
  if (p === 'AT') return { t: 'atico' }
  if (/^(EN|ENT|EP|ENTREPLANTA|ENTRESUELO|ENTLO)$/.test(p)) return { t: 'entreplanta' }
  if (/^\d+$/.test(p)) return { t: 'num', n: Number(p) }
  // Negativas («-1»), sótano («SM», «SS», «ST», «SOTANO», «SEMISOTANO») y lo no reconocido: fuera.
  return null
}

const igual = (a: PlantaCatastro, b: PlantaCatastro) => a.t === b.t && (a.t !== 'num' || a.n === (b as { n: number }).n)

export type InmueblePlanta = { planta: string | null; uso?: string | null }

export type UltimoPiso = 'ultimo' | 'no_ultimo' | 'no_cuadra' | 'sin_plantas' | 'sin_planta_declarada'

const residencial = (i: InmueblePlanta) => !(typeof i.uso === 'string' && i.uso.trim() !== '' && !/RESIDENCIAL|VIVIENDA/i.test(i.uso))

/** ¿La planta declarada es el último piso de la parcela? Ver las reglas en la cabecera. */
export function ultimoPisoCatastro(declarada: unknown, inmuebles: readonly InmueblePlanta[]): UltimoPiso {
  const plantas = inmuebles.filter(residencial).map((i) => plantaResidencial(i.planta)).filter((p): p is PlantaCatastro => p !== null)
  if (plantas.length === 0) return 'sin_plantas'
  if (normPlantaCatastro(declarada) === null) return 'sin_planta_declarada'
  const d = plantaResidencial(declarada)
  if (d === null || !plantas.some((p) => igual(p, d))) return 'no_cuadra'
  if (d.t === 'atico') return 'ultimo'
  if (d.t === 'entreplanta') return 'no_ultimo'
  if (plantas.some((p) => p.t === 'atico')) return 'no_ultimo'
  const max = Math.max(...plantas.flatMap((p) => (p.t === 'num' ? [p.n] : [])))
  return d.n === max ? 'ultimo' : 'no_ultimo'
}

export type ViviendaDeducida = {
  /** Tipo canónico, o `unifamiliar` (adosada o independiente: el Catastro no lo distingue). `null` = no se sabe. */
  tipo: Extract<TipoVivienda, 'piso' | 'planta_baja' | 'atico'> | 'unifamiliar' | null
  ultimoPiso: UltimoPiso | null
  /** Frase para el aviso a la correduría (p. ej. planta que no cuadra). */
  aviso: string | null
}

/**
 * Tipo de vivienda del Catastro. `tipoFicha` = `caracterizarVivienda(...).tipo` del inmueble único (si lo hubo);
 * sin él, varios inmuebles residenciales en la parcela = división horizontal = piso. Un solo inmueble sin ficha: no se sabe.
 */
export function deducirViviendaCatastro(e: {
  tipoFicha: 'piso' | 'unifamiliar' | null
  inmuebles: readonly InmueblePlanta[]
  plantaDeclarada: unknown
}): ViviendaDeducida {
  const residenciales = e.inmuebles.filter(residencial)
  const base = e.tipoFicha ?? (residenciales.length > 1 ? 'piso' : null)
  if (base === null) return { tipo: null, ultimoPiso: null, aviso: null }
  if (base === 'unifamiliar') return { tipo: 'unifamiliar', ultimoPiso: null, aviso: null }
  const u = ultimoPisoCatastro(e.plantaDeclarada, e.inmuebles)
  if (u === 'no_cuadra') {
    const p = String(e.plantaDeclarada ?? '').trim()
    const legible = /^\d+$/.test(p) ? `${Number(p)}º` : p
    return { tipo: null, ultimoPiso: u, aviso: `⚠️ planta declarada ${legible} no cuadra con el Catastro: revisar` }
  }
  if (u === 'sin_plantas' || u === 'sin_planta_declarada') return { tipo: null, ultimoPiso: u, aviso: null }
  const d = plantaResidencial(e.plantaDeclarada)
  if (d?.t === 'num' && d.n === 0) return { tipo: 'planta_baja', ultimoPiso: u, aviso: null }
  // 26/10/2026 (revisión del PR #5068): «último piso» NO es «ático». Solo es ático si el Catastro dice AT (y esa es la
  // planta declarada); un último piso NUMÉRICO es un piso, con `ultimoPiso: 'ultimo'` para quien lo anote.
  return { tipo: d?.t === 'atico' ? 'atico' : 'piso', ultimoPiso: u, aviso: null }
}
