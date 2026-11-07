// Competitividad de PRECIO por compañía (07/11/2026, Alberto: llevar a las reuniones con cada compañía
// «en auto estás un 20 % más caro que X y un 10 % más caro que Y»). PURO: sin BD, sin red, sin reloj.
// Test: `competitividad-precio.test.ts`.
//
// Trabaja sobre una forma GENÉRICA (`ObservacionPrecio`) para que la fuente se pueda cambiar sin tocar el cálculo
// (Avant2, bots RPA, pólizas de la competencia escaneadas, primas de renovación de CIMA… irán a un almacén único).
// Quien lee las tablas es un ADAPTADOR aparte (`apps/asegura/lib/observaciones-precio-tarificaciones.ts`).
//
// REGLA DE COMPARACIÓN (para que valga delante de una compañía):
//  1. Solo se compara dentro de la MISMA petición (`grupoComparacion`), el MISMO ramo y el MISMO nivel de cobertura,
//     y en una ventana corta de fechas (`ventanaDias`, 7 por defecto: pasada esa distancia al primer precio del
//     grupo es OTRA tarificación). Sin nivel no se compara (jamás se inventa un nivel).
//  2. Por compañía y comparación se toma su precio MÁS BAJO (una compañía puede dar varias modalidades en el
//     nivel o por dos canales); el canal de ese precio queda en `canales`.
//  3. Hacen falta ≥2 compañías: con una sola no hay con quién compararse (`sinRivales`), nunca «0 %».
//  4. % sobre la más barata = (mi precio − más barata de TODAS) / más barata (0 si soy la más barata; empatar con
//     la más barata cuenta como serlo). % sobre la mediana = (mi precio − mediana de las OTRAS) / mediana (con signo).
//  5. Observaciones sin grupo (`grupoComparacion: null`: una póliza escaneada) NO se emparejan: van a la métrica de
//     SEGMENTO (mediana de la compañía frente a mediana del resto en ramo + nivel + año), orientativa.
// 🚨 Sin observaciones → arrays vacíos (el llamador dice «sin datos»); nunca un 0 que afirme algo.
// 🚨 Muestra < `MUESTRA_MINIMA_COMPETITIVIDAD` → `muestraPequena`, y la frase lo dice.

import { etiquetaRamo } from './filtro-cartera.ts'

export type FuenteObservacion = 'avant2' | 'bot' | 'poliza_escaneada' | 'cima' | 'manual'

export type ObservacionPrecio = {
  fuente: FuenteObservacion
  /** Código DGS si se pudo resolver; si no, una clave estable propia (`?:nombre`). Es la identidad de la compañía. */
  companiaCodigo: string
  /** Nombre legible (para los rivales, que pueden no tener ficha). */
  companiaNombre?: string | null
  ramo: string
  /** Nivel de cobertura. `null` = no se sabe → no compite. */
  nivel: string | null
  /** Prima ANUAL en céntimos (entero > 0). */
  primaAnualCents: number
  /** 'YYYY-MM-DD' de la observación. */
  fecha: string
  /** Misma petición/riesgo. `null` = observación suelta (segmento, no pareja). */
  grupoComparacion: string | null
}

export const MUESTRA_MINIMA_COMPETITIVIDAD = 5
export const VENTANA_DIAS_DEFECTO = 7
export const MAX_RIVALES = 3

export type OpcionesCompetitividad = {
  /** Solo este año natural. Ausente = todos los que haya. */
  anio?: number
  ventanaDias?: number
}

export type PierdeContra = {
  companiaCodigo: string
  nombre: string
  /** En cuántas comparaciones era más barata esa compañía que la nuestra. */
  veces: number
  /** % mediano que NUESTRO precio supera al suyo en esas comparaciones. */
  pctMediano: number
}

export type FilaPareja = {
  companiaCodigo: string
  ramo: string
  nivel: string
  anio: number
  /** Comparaciones (misma petición y nivel, ≥2 compañías) en que cotizó. */
  tarificaciones: number
  /** En cuántas fue la más barata (empate incluido). */
  masBarata: number
  /** Comparaciones en que cotizó SOLA en ese nivel (no cuentan arriba). */
  sinRivales: number
  /** Mediana del % sobre la más barata (≥0). */
  pctMedianoSobreBarata: number
  /** Mediana del % sobre la mediana de las otras (con signo). */
  pctMedianoSobreMediana: number
  posicionMediana: number
  /** Mediana del nº de compañías comparadas. */
  companiasMediana: number
  pierdeContra: PierdeContra[]
  /** Comparaciones por canal del precio usado (bot / avant2 / …). */
  canales: Partial<Record<FuenteObservacion, number>>
  muestraPequena: boolean
}

export type FilaSegmento = {
  companiaCodigo: string
  ramo: string
  nivel: string
  anio: number
  n: number
  medianaCents: number
  nResto: number
  medianaRestoCents: number
  /** (mediana propia − mediana del resto) / mediana del resto, con signo. */
  pct: number
  muestraPequena: boolean
}

export type ResultadoCompetitividad = {
  pareja: FilaPareja[]
  segmento: FilaSegmento[]
  /** Nombre por código, de lo visto en las observaciones. */
  nombres: Record<string, string>
  descartadas: {
    /** Prima, fecha, ramo o compañía inválidos. */
    invalidas: number
    /** Sin nivel de cobertura: no compiten. */
    sinNivel: number
  }
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/
const dias = (a: string, b: string): number => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000
const r1 = (n: number): number => Math.round(n * 10) / 10

export function mediana(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

function valida(o: ObservacionPrecio): boolean {
  return Number.isInteger(o.primaAnualCents) && o.primaAnualCents > 0 && ISO.test(o.fecha) && Number.isFinite(Date.parse(o.fecha))
    && typeof o.companiaCodigo === 'string' && o.companiaCodigo.trim() !== '' && typeof o.ramo === 'string' && o.ramo.trim() !== ''
}

type Acum = {
  companiaCodigo: string; ramo: string; nivel: string; anio: number
  tarificaciones: number; masBarata: number; sinRivales: number
  sobreBarata: number[]; sobreMediana: number[]; posiciones: number[]; companias: number[]
  pierde: Map<string, { nombre: string; pcts: number[] }>
  canales: Partial<Record<FuenteObservacion, number>>
}

// ─── Cálculo ─────────────────────────────────────────────────────────────────

export function calcularCompetitividad(observaciones: readonly ObservacionPrecio[], opts: OpcionesCompetitividad = {}): ResultadoCompetitividad {
  const ventana = opts.ventanaDias ?? VENTANA_DIAS_DEFECTO
  const descartadas = { invalidas: 0, sinNivel: 0 }
  const nombres: Record<string, string> = {}
  const agrupadas = new Map<string, ObservacionPrecio[]>()
  const sueltas = new Map<string, ObservacionPrecio[]>()

  for (const o of observaciones) {
    if (!valida(o)) { descartadas.invalidas++; continue }
    const nombre = o.companiaNombre?.trim()
    if (nombre && !nombres[o.companiaCodigo]) nombres[o.companiaCodigo] = nombre
    if (o.nivel === null || o.nivel.trim() === '') { descartadas.sinNivel++; continue }
    const anioObs = Number(o.fecha.slice(0, 4))
    if (o.grupoComparacion === null) {
      if (opts.anio !== undefined && anioObs !== opts.anio) continue
      const k = `${o.ramo}\u0000${o.nivel}\u0000${anioObs}`
      sueltas.set(k, [...(sueltas.get(k) ?? []), o])
    } else {
      const k = `${o.grupoComparacion}\u0000${o.ramo}\u0000${o.nivel}`
      agrupadas.set(k, [...(agrupadas.get(k) ?? []), o])
    }
  }

  // ── Parejas ──
  const acum = new Map<string, Acum>()
  const dame = (c: string, ramo: string, nivel: string, anio: number): Acum => {
    const k = `${c}\u0000${ramo}\u0000${nivel}\u0000${anio}`
    let a = acum.get(k)
    if (!a) {
      a = { companiaCodigo: c, ramo, nivel, anio, tarificaciones: 0, masBarata: 0, sinRivales: 0, sobreBarata: [], sobreMediana: [], posiciones: [], companias: [], pierde: new Map(), canales: {} }
      acum.set(k, a)
    }
    return a
  }

  for (const lista of agrupadas.values()) {
    const orden = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha))
    // Ventana corta: un precio a más de `ventana` días del PRIMERO de su tanda es otra tarificación.
    const tandas: ObservacionPrecio[][] = []
    for (const o of orden) {
      const t = tandas[tandas.length - 1]
      if (t && dias(t[0]!.fecha, o.fecha) <= ventana) t.push(o)
      else tandas.push([o])
    }
    for (const tanda of tandas) {
      const anio = Number(tanda[0]!.fecha.slice(0, 4))
      if (opts.anio !== undefined && anio !== opts.anio) continue
      const mejor = new Map<string, ObservacionPrecio>()
      for (const o of tanda) {
        const m = mejor.get(o.companiaCodigo)
        if (!m || o.primaAnualCents < m.primaAnualCents) mejor.set(o.companiaCodigo, o)
      }
      const { ramo, nivel } = tanda[0]!
      if (mejor.size < 2) {
        for (const c of mejor.keys()) dame(c, ramo, nivel!, anio).sinRivales++
        continue
      }
      const todas = [...mejor.values()]
      const minimo = Math.min(...todas.map((o) => o.primaAnualCents))
      for (const yo of todas) {
        const otras = todas.filter((o) => o.companiaCodigo !== yo.companiaCodigo)
        const a = dame(yo.companiaCodigo, ramo, nivel!, anio)
        a.tarificaciones++
        if (yo.primaAnualCents <= minimo) a.masBarata++
        a.sobreBarata.push(((yo.primaAnualCents - minimo) / minimo) * 100)
        const med = mediana(otras.map((o) => o.primaAnualCents))
        a.sobreMediana.push(((yo.primaAnualCents - med) / med) * 100)
        a.posiciones.push(1 + otras.filter((o) => o.primaAnualCents < yo.primaAnualCents).length)
        a.companias.push(todas.length)
        a.canales[yo.fuente] = (a.canales[yo.fuente] ?? 0) + 1
        for (const r of otras) {
          if (r.primaAnualCents >= yo.primaAnualCents) continue
          const p = a.pierde.get(r.companiaCodigo) ?? { nombre: nombres[r.companiaCodigo] ?? r.companiaCodigo, pcts: [] }
          p.pcts.push(((yo.primaAnualCents - r.primaAnualCents) / r.primaAnualCents) * 100)
          a.pierde.set(r.companiaCodigo, p)
        }
      }
    }
  }

  const pareja: FilaPareja[] = [...acum.values()].map((a) => ({
    companiaCodigo: a.companiaCodigo, ramo: a.ramo, nivel: a.nivel, anio: a.anio,
    tarificaciones: a.tarificaciones, masBarata: a.masBarata, sinRivales: a.sinRivales,
    pctMedianoSobreBarata: a.tarificaciones ? r1(mediana(a.sobreBarata)) : 0,
    pctMedianoSobreMediana: a.tarificaciones ? r1(mediana(a.sobreMediana)) : 0,
    posicionMediana: a.tarificaciones ? mediana(a.posiciones) : 0,
    companiasMediana: a.tarificaciones ? mediana(a.companias) : 0,
    pierdeContra: [...a.pierde.entries()]
      .map(([companiaCodigo, p]) => ({ companiaCodigo, nombre: p.nombre, veces: p.pcts.length, pctMediano: r1(mediana(p.pcts)) }))
      .sort((x, y) => y.veces - x.veces || y.pctMediano - x.pctMediano || x.nombre.localeCompare(y.nombre, 'es'))
      .slice(0, MAX_RIVALES),
    canales: a.canales,
    muestraPequena: a.tarificaciones < MUESTRA_MINIMA_COMPETITIVIDAD,
  }))
    // Una compañía que solo cotizó sola no tiene comparación que enseñar: queda fuera (no es «0 %»).
    .filter((f) => f.tarificaciones > 0)
    .sort((x, y) => x.companiaCodigo.localeCompare(y.companiaCodigo) || x.ramo.localeCompare(y.ramo) || x.nivel.localeCompare(y.nivel, 'es') || x.anio - y.anio)

  // ── Segmento (observaciones sueltas) ──
  const segmento: FilaSegmento[] = []
  for (const lista of sueltas.values()) {
    const { ramo, nivel } = lista[0]!
    const anio = Number(lista[0]!.fecha.slice(0, 4))
    const porCompania = new Map<string, number[]>()
    for (const o of lista) porCompania.set(o.companiaCodigo, [...(porCompania.get(o.companiaCodigo) ?? []), o.primaAnualCents])
    for (const [c, precios] of porCompania) {
      const resto = lista.filter((o) => o.companiaCodigo !== c).map((o) => o.primaAnualCents)
      if (resto.length === 0) continue
      const propia = mediana(precios), med = mediana(resto)
      segmento.push({
        companiaCodigo: c, ramo, nivel: nivel!, anio, n: precios.length, medianaCents: Math.round(propia),
        nResto: resto.length, medianaRestoCents: Math.round(med), pct: r1(((propia - med) / med) * 100),
        muestraPequena: precios.length < MUESTRA_MINIMA_COMPETITIVIDAD || resto.length < MUESTRA_MINIMA_COMPETITIVIDAD,
      })
    }
  }
  segmento.sort((x, y) => x.companiaCodigo.localeCompare(y.companiaCodigo) || x.ramo.localeCompare(y.ramo) || x.nivel.localeCompare(y.nivel, 'es') || x.anio - y.anio)

  return { pareja, segmento, nombres, descartadas }
}

// ─── Texto (determinista, sin IA) ────────────────────────────────────────────

/** «18 %» / «12,5 %» en formato español. */
export function pctEs(n: number): string {
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`
}

const NOMBRE_CANAL: Record<FuenteObservacion, string> = { avant2: 'Avant2', bot: 'bot', poliza_escaneada: 'póliza escaneada', cima: 'CIMA', manual: 'manual' }

function canalesTexto(c: Partial<Record<FuenteObservacion, number>>): string {
  return (Object.entries(c) as [FuenteObservacion, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${NOMBRE_CANAL[f]} ${n}`).join(', ')
}

/**
 * Las frases de competitividad de UNA compañía y año, listas para la ficha y para «Preparar reunión».
 * `[]` = sin tarificaciones comparables (el llamador escribe «sin datos»). Texto plano.
 */
export function frasesCompetitividad(r: ResultadoCompetitividad, companiaCodigo: string, anio: number): string[] {
  const frases: string[] = []
  for (const f of r.pareja.filter((x) => x.companiaCodigo === companiaCodigo && x.anio === anio)) {
    const que = `${etiquetaRamo(f.ramo)} ${f.nivel}`
    const base = f.pctMedianoSobreBarata > 0
      ? `estáis un ${pctEs(f.pctMedianoSobreBarata)} por encima de la más barata`
      : 'sois la más barata en la mayoría de las comparaciones'
    const muestra = `mediana, ${f.tarificaciones} ${f.tarificaciones === 1 ? 'tarificación' : 'tarificaciones'}${f.muestraPequena ? '; muestra pequeña, orientativo' : ''}`
    const barata = `la más barata en ${f.masBarata} de ${f.tarificaciones}`
    const pierde = f.pierdeContra.length
      ? ` Pierde sobre todo frente a ${f.pierdeContra.map((p) => `${p.nombre} (estáis un ${pctEs(p.pctMediano)} por encima, ${p.veces} ${p.veces === 1 ? 'vez' : 'veces'})`).join(', ')}.`
      : ''
    const canales = canalesTexto(f.canales)
    frases.push(`En ${que} ${base} (${muestra}; ${barata}${canales ? `; canal: ${canales}` : ''}).${pierde}`)
  }
  for (const s of r.segmento.filter((x) => x.companiaCodigo === companiaCodigo && x.anio === anio)) {
    frases.push(
      `Referencia suelta en ${etiquetaRamo(s.ramo)} ${s.nivel}: prima mediana ${s.pct > 0 ? `${pctEs(s.pct)} por encima` : s.pct < 0 ? `${pctEs(Math.abs(s.pct))} por debajo` : 'igual'} que el resto `
      + `(${s.n} vs ${s.nResto} primas, riesgos no idénticos${s.muestraPequena ? '; muestra pequeña' : ''}).`,
    )
  }
  return frases
}
