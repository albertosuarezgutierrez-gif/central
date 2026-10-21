/**
 * EL motor de comparativa de ofertas de seguro (único para toda fuente y todo ramo, 20/10/2026): matriz
 * garantía × oferta, tabla de precios, diferencias frente a la póliza actual y un ORDEN explicado.
 * REGLA: `null` = «no figura en el documento» ≠ `excluida` ≠ 0. Nunca `?? 0`. Sin «mejor oferta»: el orden es
 * por prima anual y cada puesto dice sus hechos y sus reservas; la RECOMENDACIÓN la marca el corredor.
 *
 * Las fuentes (Avant2, PDF de compañía o de la competencia, póliza de la cartera, bot) entran por un adaptador
 * fino de `ofertas-fuentes.ts` que deja cada una en `OfertaNormalizada`. Aquí no se sabe de dónde viene nada.
 */
import { eurEs } from './comparativa-precios.ts'
import { garantiasDelRamo, type GarantiaCanonica, type RamoOferta } from './coberturas-taxonomia.ts'
import { CATALOGO_GARANTIAS } from './catalogo-garantias.ts'

/** Versión del motor: entra en la huella (un cambio de reglas invalida lo guardado). */
export const VERSION_COMPARATIVA = 2

export const FUENTES_OFERTA = ['avant2', 'pdf_compania', 'pdf_competencia', 'poliza_actual', 'bot'] as const
export type FuenteOferta = (typeof FUENTES_OFERTA)[number]
export type FraccionamientoOferta = 'anual' | 'semestral' | 'trimestral' | 'mensual'
/** De qué fila sale la oferta (evidencia de origen). */
export type ReferenciaOferta = { tipo: 'tarificacion_precio' | 'oportunidad_oferta' | 'poliza' | 'trabajo_rpa' | 'otro'; id: string }
/** Tres estados de una garantía en el cuadro: `no_se_sabe` = no figura / no se ha leído (NUNCA «no incluida»). */
export type EstadoTriple = 'incluida' | 'no_incluida' | 'no_se_sabe'

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
  /** Prima ANUAL total con impuestos. `null` = no figura (o es de otro periodo: ver `avisos`). */
  primaTotal: number | null
  primaNeta: number | null
  garantias: Record<string, ValorGarantia>
  // ── Opcionales (20/10/2026): ausentes en los estudios guardados antes; ausente = no se sabe. ──
  fuente?: FuenteOferta | null
  fraccionamiento?: FraccionamientoOferta | null
  /** Importe de cada recibo con ese fraccionamiento. `null` = no lo dice. */
  importeReciboEur?: number | null
  /** Franquicia general de la oferta. `null` = NO DECLARADA (nunca «sin franquicia»). */
  franquiciaGeneral?: number | null
  /** Nivel/modalidad tal cual lo da la compañía («Todo Riesgo Con Franquicia Media»). */
  nivel?: string | null
  firmeza?: 'firme' | 'condicionado' | 'estimado' | null
  referencia?: ReferenciaOferta | null
  /** Hechos que el adaptador no pudo dejar en un campo (se enseñan como reservas, nunca se esconden). */
  avisos?: string[]
  /**
   * El precio tal como lo dio la fuente cuando NO es una prima anual comparable (`primaTotal: null`): se enseña con su
   * periodo (`meses: null` = no declarado) y nunca entra en el orden. Ausente = no hay tal precio.
   */
  primaPeriodo?: { importe: number; meses: number | null } | null
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
  /** Tres estados explícitos (incluida / no incluida / no se sabe). */
  estado3: EstadoTriple
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
  // ── Tabla de precios (20/10/2026; opcionales para leer estudios viejos) ──
  fuente?: FuenteOferta | null
  primaTotal?: number | null
  fraccionamiento?: FraccionamientoOferta | null
  importeReciboEur?: number | null
  franquiciaGeneral?: number | null
  /** Garantías del cuadro en las que esta oferta está en «no se sabe». */
  noSeSabe?: number
}
/** Un puesto del orden. `posicion: null` = no entra (sin prima anual comparable). */
export type PuestoRanking = {
  ofertaId: string
  posicion: number | null
  /** Misma prima y mismos hechos que otra: el orden entre ellas no dice nada. */
  empate: boolean
  /** Hechos a favor, en español y solo con cifras del cuadro. */
  motivos: string[]
  /** Lo que hay que mirar antes de decidir. */
  reservas: string[]
}
export type RankingComparacion = { criterio: string; puestos: PuestoRanking[] }
export type ResultadoComparacion = {
  ramo: RamoOferta
  actualId: string | null
  ofertas: OfertaNormalizada[]
  filas: FilaMatriz[]
  resumen: ResumenOferta[]
  superficieM2: number | null
  /** Ausentes en estudios anteriores al 20/10/2026. */
  version?: number
  ranking?: RankingComparacion
}

export const CRITERIO_RANKING =
  'Orden por prima anual total, de menor a mayor; a igual prima, la que empeora menos garantías de la póliza actual. ' +
  'No es una recomendación: la recomendación la marca tu corredor.'

const num = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

/** Estado efectivo: si no hay estado pero sí cifra, la garantía está incluida; si no hay nada, no figura. */
function estadoEfectivo(v: ValorGarantia | undefined): EstadoGarantia | null {
  if (!v) return null
  if (v.estado) return v.estado
  return num(v.capital) || num(v.limite) ? 'incluida' : null
}
const consta = (v: ValorGarantia | undefined): boolean =>
  !!v && (v.estado !== null || num(v.capital) || num(v.limite) || num(v.franquicia))

/** El estado de tres valores de una celda. Solo `excluida` declarada es «no incluida». */
export function estadoTriple(v: ValorGarantia | null | undefined): EstadoTriple {
  const e = estadoEfectivo(v ?? undefined)
  return e === 'incluida' ? 'incluida' : e === 'excluida' ? 'no_incluida' : 'no_se_sabe'
}

/** Etiqueta de una clave que no es de la taxonomía del ramo: la del catálogo de Avant2 si la tiene, si no la clave. */
function etiquetaExtra(clave: string): string {
  for (const lista of Object.values(CATALOGO_GARANTIAS)) {
    const g = lista.find((x) => x.clave === clave)
    if (g) return g.etiqueta
  }
  return clave
}

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
      return { ofertaId: o.id, valor: v ?? null, consta: consta(v), estado3: estadoTriple(v), peorQueActual: peor, mejorQueActual: mejor, hueco }
    })
    // Una fila canónica que nadie menciona no aporta nada: se omite. Las extras siempre tienen algún dato.
    if (celdas.some(c => c.consta)) filas.push({ clave, etiqueta, canonica, grupo, celdas })
  }
  for (const c of canon) construir(c.clave, c.etiqueta, true, c.grupo)
  for (const k of extras) construir(k, etiquetaExtra(k), false, 'otros')

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
    let noSeSabe = 0
    for (const f of filas) {
      const c = f.celdas.find(x => x.ofertaId === o.id)
      if (!c) continue
      if (c.peorQueActual) garantiasPeor++
      if (c.mejorQueActual) garantiasMejor++
      if (c.hueco) huecos++
      if (c.estado3 === 'no_se_sabe') noSeSabe++
    }
    const franq = Object.values(o.garantias).map(v => v.franquicia).filter(num)
    const franquiciaMaxima = franq.length ? Math.max(...franq) : null
    let infraseguroContinente: AlertaInfraseguro | null = null
    const cap = o.garantias['continente']?.capital
    if (superficieM2 !== null && num(cap)) {
      const eurPorM2 = redondear(cap / superficieM2)
      if (eurPorM2 < UMBRAL_CONTINENTE_EUR_M2) infraseguroContinente = { capital: cap, superficieM2, eurPorM2, umbral: UMBRAL_CONTINENTE_EUR_M2 }
    }
    return {
      ofertaId: o.id, rol: o.rol, deltaPrimaEur, deltaPrimaPct, garantiasPeor, garantiasMejor, huecos, franquiciaMaxima, infraseguroContinente,
      fuente: o.fuente ?? null,
      primaTotal: num(o.primaTotal) ? o.primaTotal : null,
      fraccionamiento: o.fraccionamiento ?? null,
      importeReciboEur: num(o.importeReciboEur) ? o.importeReciboEur : null,
      franquiciaGeneral: num(o.franquiciaGeneral) ? o.franquiciaGeneral : null,
      noSeSabe,
    }
  })

  const ranking = ordenar(ofertas, resumen, actual)
  return { ramo, actualId: actual?.id ?? null, ofertas, filas, resumen, superficieM2, version: VERSION_COMPARATIVA, ranking }
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * El ORDEN explicado: determinista (misma entrada → mismo orden y mismos textos) y solo con hechos del cuadro.
 * Entran las OFERTAS con prima anual; la póliza actual es la referencia, no compite.
 */
function ordenar(ofertas: readonly OfertaNormalizada[], resumen: readonly ResumenOferta[], actual: OfertaNormalizada | null): RankingComparacion {
  const r = (id: string) => resumen.find((x) => x.ofertaId === id)!
  const candidatas = ofertas.filter((o) => o.rol === 'oferta')
  const conPrima = candidatas.filter((o) => num(o.primaTotal))
  conPrima.sort((a, b) => (a.primaTotal! - b.primaTotal!) || (r(a.id).garantiasPeor - r(b.id).garantiasPeor) || (r(a.id).huecos - r(b.id).huecos) || a.id.localeCompare(b.id))
  const minima = conPrima.length ? conPrima[0]!.primaTotal! : null
  const niveles = new Set(candidatas.map((o) => (o.nivel ?? '').trim()).filter((x) => x !== ''))
  const clave = (o: OfertaNormalizada) => `${o.primaTotal}|${r(o.id).garantiasPeor}|${r(o.id).huecos}`
  const puestos: PuestoRanking[] = []
  let pos = 0
  conPrima.forEach((o, i) => {
    const anterior = i > 0 ? conPrima[i - 1]! : null
    if (!anterior || clave(anterior) !== clave(o)) pos = i + 1
    const empate = conPrima.some((x) => x !== o && clave(x) === clave(o))
    const s = r(o.id)
    const motivos: string[] = []
    const reservas: string[] = []
    motivos.push(
      pos === 1
        ? conPrima.length > 1 ? `Prima anual ${eurEs(o.primaTotal!)}, la más baja de las ${conPrima.length} ofertas con precio` : `Prima anual ${eurEs(o.primaTotal!)}`
        : o.primaTotal === minima
          ? `Prima anual ${eurEs(o.primaTotal!)}, igual que la más baja`
          : `Prima anual ${eurEs(o.primaTotal!)}, ${eurEs(redondear(o.primaTotal! - minima!))} más que la más baja`,
    )
    if (s.deltaPrimaEur !== null && actual) {
      motivos.push(s.deltaPrimaEur === 0 ? 'Misma prima que la póliza actual' : `${eurEs(Math.abs(s.deltaPrimaEur))} ${s.deltaPrimaEur < 0 ? 'menos' : 'más'} al año que la póliza actual`)
    }
    if (s.garantiasMejor > 0) motivos.push(`Mejora ${plural(s.garantiasMejor, 'garantía', 'garantías')} frente a la actual`)
    if (s.garantiasPeor > 0) reservas.push(`Empeora ${plural(s.garantiasPeor, 'garantía', 'garantías')} frente a la actual`)
    if (s.huecos > 0) reservas.push(`No figuran ${plural(s.huecos, 'garantía', 'garantías')} que hoy tiene la póliza actual`)
    if ((s.noSeSabe ?? 0) > 0) reservas.push(`${plural(s.noSeSabe ?? 0, 'garantía', 'garantías')} sin dato: no se sabe si la incluye`)
    if (!num(o.franquiciaGeneral) && s.franquiciaMaxima === null) reservas.push('No declara franquicia (no quiere decir que no la tenga)')
    if (niveles.size > 1 && o.nivel) reservas.push(`Nivel «${o.nivel}»: hay ofertas de otro nivel de cobertura, compara con cuidado`)
    if (o.firmeza === 'estimado') reservas.push('Precio estimado: la compañía lo confirma al emitir')
    if (s.infraseguroContinente) reservas.push('Posible infraseguro del continente')
    for (const a of o.avisos ?? []) reservas.push(a)
    puestos.push({ ofertaId: o.id, posicion: pos, empate, motivos, reservas })
  })
  for (const o of candidatas.filter((x) => !num(x.primaTotal))) {
    puestos.push({ ofertaId: o.id, posicion: null, empate: false, motivos: [], reservas: ['Sin prima anual comparable: no entra en el orden', ...(o.avisos ?? [])] })
  }
  return { criterio: CRITERIO_RANKING, puestos }
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
    eur(s.franquiciaGeneral)
    eur(s.importeReciboEur)
    for (const n of [s.garantiasPeor, s.garantiasMejor, s.huecos, s.noSeSabe]) if (num(n)) out.add(String(n))
    if (s.infraseguroContinente) {
      const a = s.infraseguroContinente
      eur(a.eurPorM2)
      eur(a.umbral)
      out.add(entEs(a.superficieM2))
    }
  }
  for (const o of r.ofertas) {
    eur(o.franquiciaGeneral)
    eur(o.importeReciboEur)
  }
  // El orden: posiciones, cuántas tienen precio y la distancia a la más baja (las cifras de sus motivos).
  const puestos = r.ranking?.puestos ?? []
  const conPrima = puestos.filter((p) => p.posicion !== null)
  if (conPrima.length) out.add(String(conPrima.length))
  const primas = r.ofertas.filter((o) => conPrima.some((p) => p.ofertaId === o.id)).map((o) => o.primaTotal).filter(num)
  const minima = primas.length ? Math.min(...primas) : null
  for (const p of conPrima) {
    out.add(String(p.posicion))
    const o = r.ofertas.find((x) => x.id === p.ofertaId)
    if (o && num(o.primaTotal) && minima !== null) eur(redondear(o.primaTotal - minima))
  }
  if (r.superficieM2 !== null) out.add(entEs(r.superficieM2))
  return out
}

// ─── Huella de la entrada ────────────────────────────────────────────────────

/** JSON con las claves ordenadas: el mismo objeto da SIEMPRE el mismo texto. */
function canonico(v: unknown): string {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`
}

/**
 * El texto CANÓNICO de lo que entra en la comparativa (versión del motor, ramo, superficie, ofertas y lo que se
 * pase en `extra`, p. ej. la recomendada). Lo que no cambia el resultado (la cita literal de la evidencia) no
 * entra. PURO y sin cripto (este paquete no la importa): la app lo pasa por sha256 y guarda la huella.
 * Misma entrada en otro ORDEN = misma huella.
 */
export function textoHuellaComparativa(input: { ramo: RamoOferta; ofertas: readonly OfertaNormalizada[]; superficieM2?: number | null; extra?: Record<string, unknown> }): string {
  const ofertas = [...input.ofertas]
    .map((o) => ({
      ...o,
      garantias: Object.fromEntries(Object.entries(o.garantias).map(([k, g]) => [k, { estado: g.estado, capital: g.capital, limite: g.limite, franquicia: g.franquicia }])),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  return canonico({ v: VERSION_COMPARATIVA, ramo: input.ramo, superficieM2: input.superficieM2 ?? null, ofertas, extra: input.extra ?? null })
}
