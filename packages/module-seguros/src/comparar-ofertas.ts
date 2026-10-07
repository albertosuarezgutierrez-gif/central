/**
 * Comparación PURA de ofertas de seguro contra la póliza actual: matriz garantía × oferta.
 * REGLA: `null` = «no figura en el documento» ≠ `excluida` ≠ 0. Nunca `?? 0`. Sin ranking ni «mejor oferta»:
 * solo hechos (deltas, marcas, huecos) que el corredor interpreta.
 */
import { eurEs } from './comparativa-precios.ts'
import { garantiasDelRamo, type GarantiaCanonica, type RamoOferta } from './coberturas-taxonomia.ts'

export type EstadoGarantia = 'incluida' | 'excluida'
export type ValorGarantia = {
  estado: EstadoGarantia | null
  capital: number | null
  limite: number | null
  franquicia: number | null
  evidencia?: { pagina: number | null; texto: string } | null
}
export type OfertaNormalizada = {
  id: string
  rol: 'actual' | 'oferta'
  compania: string
  producto: string | null
  primaTotal: number | null
  primaNeta: number | null
  garantias: Record<string, ValorGarantia>
}

/**
 * Referencia ORIENTATIVA de coste de reconstrucción de edificio residencial (€/m² construido). Por debajo, el
 * continente puede quedar infraasegurado (regla proporcional). No es tasación: solo dispara un aviso al corredor.
 */
export const UMBRAL_CONTINENTE_EUR_M2 = 1100

export type MarcaCelda = 'peorQueActual' | 'mejorQueActual' | 'hueco'
export type CeldaMatriz = {
  ofertaId: string
  /** Valor tal cual consta (incluye `null` = no figura). */
  valor: ValorGarantia | null
  consta: boolean
  peorQueActual: boolean
  mejorQueActual: boolean
  hueco: boolean
}
export type FilaMatriz = {
  clave: string
  etiqueta: string
  canonica: boolean
  grupo: GarantiaCanonica['grupo'] | 'otros'
  celdas: CeldaMatriz[]
}
export type AlertaInfraseguro = { capital: number; superficieM2: number; eurPorM2: number; umbral: number }
export type ResumenOferta = {
  ofertaId: string
  rol: 'actual' | 'oferta'
  deltaPrimaEur: number | null
  deltaPrimaPct: number | null
  garantiasPeor: number
  garantiasMejor: number
  huecos: number
  franquiciaMaxima: number | null
  infraseguroContinente: AlertaInfraseguro | null
}
export type ResultadoComparacion = {
  ramo: RamoOferta
  actualId: string | null
  ofertas: OfertaNormalizada[]
  filas: FilaMatriz[]
  resumen: ResumenOferta[]
  superficieM2: number | null
}

const num = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

/** Estado efectivo: si no hay estado pero sí cifra, la garantía está incluida; si no hay nada, no figura. */
function estadoEfectivo(v: ValorGarantia | undefined): EstadoGarantia | null {
  if (!v) return null
  if (v.estado) return v.estado
  return num(v.capital) || num(v.limite) ? 'incluida' : null
}
const consta = (v: ValorGarantia | undefined): boolean =>
  !!v && (v.estado !== null || num(v.capital) || num(v.limite) || num(v.franquicia))

/** Importe comparable de una garantía: capital si lo hay, si no límite. */
const importe = (v: ValorGarantia | undefined): number | null => (v ? (num(v.capital) ? v.capital : num(v.limite) ? v.limite : null) : null)

/** +1 = la oferta es mejor que la actual, -1 peor, 0 igual o no comparable. */
function juzgar(act: ValorGarantia | undefined, of: ValorGarantia | undefined): { peor: boolean; mejor: boolean } {
  let peor = false
  let mejor = false
  const ea = estadoEfectivo(act)
  const eo = estadoEfectivo(of)
  if (ea === 'incluida' && eo === 'excluida') peor = true
  if (ea === 'excluida' && eo === 'incluida') mejor = true
  if (ea === 'incluida' && eo === 'incluida') {
    const ia = importe(act)
    const io = importe(of)
    if (ia !== null && io !== null) {
      if (io < ia) peor = true
      else if (io > ia) mejor = true
    }
  }
  if (num(act?.franquicia) && num(of?.franquicia) && ea !== 'excluida' && eo !== 'excluida') {
    if (of.franquicia > act.franquicia) peor = true
    else if (of.franquicia < act.franquicia) mejor = true
  }
  // Señales contradictorias en la misma fila: no se marca ninguna (lo decide el corredor).
  if (peor && mejor) return { peor: false, mejor: false }
  return { peor, mejor }
}

export function compararOfertas(input: { ramo: RamoOferta; ofertas: OfertaNormalizada[]; superficieM2?: number | null }): ResultadoComparacion {
  const { ramo, ofertas } = input
  const superficieM2 = num(input.superficieM2) && input.superficieM2 > 0 ? input.superficieM2 : null
  const actual = ofertas.find(o => o.rol === 'actual') ?? null
  const canon = garantiasDelRamo(ramo)
  const claves = new Set(canon.map(c => c.clave))

  const extras: string[] = []
  for (const o of ofertas) for (const k of Object.keys(o.garantias)) if (!claves.has(k) && !extras.includes(k)) extras.push(k)

  const filas: FilaMatriz[] = []
  const construir = (clave: string, etiqueta: string, canonica: boolean, grupo: FilaMatriz['grupo']) => {
    const celdas: CeldaMatriz[] = ofertas.map(o => {
      const v = o.garantias[clave]
      const esActual = actual !== null && o.id === actual.id
      let peor = false
      let mejor = false
      let hueco = false
      if (actual && !esActual) {
        const j = juzgar(actual.garantias[clave], v)
        peor = j.peor
        mejor = j.mejor
        hueco = estadoEfectivo(actual.garantias[clave]) === 'incluida' && !consta(v)
      }
      return { ofertaId: o.id, valor: v ?? null, consta: consta(v), peorQueActual: peor, mejorQueActual: mejor, hueco }
    })
    // Una fila canónica que nadie menciona no aporta nada: se omite. Las extras siempre tienen algún dato.
    if (celdas.some(c => c.consta)) filas.push({ clave, etiqueta, canonica, grupo, celdas })
  }
  for (const c of canon) construir(c.clave, c.etiqueta, true, c.grupo)
  for (const k of extras) construir(k, k, false, 'otros')

  const resumen: ResumenOferta[] = ofertas.map(o => {
    const esActual = actual !== null && o.id === actual.id
    let deltaPrimaEur: number | null = null
    let deltaPrimaPct: number | null = null
    if (actual && !esActual && num(o.primaTotal) && num(actual.primaTotal)) {
      deltaPrimaEur = redondear(o.primaTotal - actual.primaTotal)
      deltaPrimaPct = actual.primaTotal > 0 ? redondear(((o.primaTotal - actual.primaTotal) / actual.primaTotal) * 100, 1) : null
    }
    let garantiasPeor = 0
    let garantiasMejor = 0
    let huecos = 0
    for (const f of filas) {
      const c = f.celdas.find(x => x.ofertaId === o.id)
      if (!c) continue
      if (c.peorQueActual) garantiasPeor++
      if (c.mejorQueActual) garantiasMejor++
      if (c.hueco) huecos++
    }
    const franq = Object.values(o.garantias).map(v => v.franquicia).filter(num)
    const franquiciaMaxima = franq.length ? Math.max(...franq) : null
    let infraseguroContinente: AlertaInfraseguro | null = null
    const cap = o.garantias['continente']?.capital
    if (superficieM2 !== null && num(cap)) {
      const eurPorM2 = redondear(cap / superficieM2)
      if (eurPorM2 < UMBRAL_CONTINENTE_EUR_M2) infraseguroContinente = { capital: cap, superficieM2, eurPorM2, umbral: UMBRAL_CONTINENTE_EUR_M2 }
    }
    return { ofertaId: o.id, rol: o.rol, deltaPrimaEur, deltaPrimaPct, garantiasPeor, garantiasMejor, huecos, franquiciaMaxima, infraseguroContinente }
  })

  return { ramo, actualId: actual?.id ?? null, ofertas, filas, resumen, superficieM2 }
}

function redondear(n: number, dec = 2): number {
  const f = 10 ** dec
  return Math.round(n * f) / f
}

const pctEs = (n: number): string => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: 'always' }) + '%'
const entEs = (n: number): string => n.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' })

/**
 * Todas las cifras que aparecen en la matriz y el resumen, ya formateadas en español. Un cepo de la narrativa IA
 * comprueba que cada número del texto esté aquí: lo que no esté, es inventado. Importes en dos formas
 * (`200.000,00€` y `200.000`), porcentajes con coma y valores absolutos de los deltas (el texto dirá «sube 90,40€»).
 */
export function cifrasDeMatriz(r: ResultadoComparacion): Set<string> {
  const out = new Set<string>()
  const eur = (n: number | null | undefined) => {
    if (!num(n)) return
    out.add(eurEs(n))
    out.add(eurEs(Math.abs(n)))
    out.add(entEs(Math.abs(n)))
    out.add(Math.abs(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }))
  }
  for (const o of r.ofertas) {
    eur(o.primaTotal)
    eur(o.primaNeta)
    for (const v of Object.values(o.garantias)) {
      eur(v.capital)
      eur(v.limite)
      eur(v.franquicia)
    }
  }
  for (const s of r.resumen) {
    eur(s.deltaPrimaEur)
    if (num(s.deltaPrimaPct)) {
      out.add(pctEs(s.deltaPrimaPct))
      out.add(pctEs(Math.abs(s.deltaPrimaPct)))
    }
    eur(s.franquiciaMaxima)
    for (const n of [s.garantiasPeor, s.garantiasMejor, s.huecos]) out.add(String(n))
    if (s.infraseguroContinente) {
      const a = s.infraseguroContinente
      eur(a.eurPorM2)
      eur(a.umbral)
      out.add(entEs(a.superficieM2))
    }
  }
  if (r.superficieM2 !== null) out.add(entEs(r.superficieM2))
  return out
}
