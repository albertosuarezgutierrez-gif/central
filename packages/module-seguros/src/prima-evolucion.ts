// «¿Por qué ha subido la póliza?» (visión del CRM, docs/CORREDURIA-CRM-VISION.md
// §9, punto 7). Lo que el cliente pregunta al renovar y lo que el corredor
// tiene que poder contestar sin llamar a la compañía.
//
// ─── Lo que CIMA da y lo que NO (medido 02/09/2026 sobre las 67 vivas activas) ──
//   · La prima de cada ANUALIDAD no viene como dato: se DERIVA de los recibos
//     de clase `CA` (cuota de cartera = renovación) y `NP` (nueva producción =
//     el primer ciclo). Los `SU` (suplementos) son cambios a mitad de ciclo y
//     se cuentan aparte, no en la prima del ciclo.
//   · Una anualidad NO es un año natural: es de aniversario a aniversario. Una
//     semestral que empieza el 1/10 tiene los recibos 10/2024 + 04/2025 en la
//     misma anualidad; agrupar por año natural la parte en dos y la compara
//     mal (visto en la cartera real: 103,95+103,95 → 118,48+118,48 = +14 %).
//   · Cobertura real: 29 vivas con dos anualidades de recibos, 25 con una,
//     13 sin ninguna. O sea, para la MAYORÍA la respuesta honesta es «CIMA no
//     manda la anualidad anterior», y eso es un estado, no un hueco.
//
// ─── Tres estados, no dos ────────────────────────────────────────────────────
//   sube_por_siniestros   → hubo siniestro(s) con fecha en el ciclo anterior.
//   sube_sin_siniestro    → subió y el ciclo anterior no tuvo siniestros con
//                           fecha: candidata a retarificar (si la subida es
//                           pequeña, probablemente es actualización general).
//   no_atribuible         → subió, no hay siniestros fechados en el ciclo pero
//                           SÍ hay siniestros sin fecha: no se afirma «sin
//                           siniestro» sobre lo que no se sabe cuándo pasó.
//   baja / igual          → no subió.
//   sin_datos             → menos de dos anualidades legibles, o la última o la
//                           anterior incompleta (faltan recibos del ciclo).
//                           Nunca se pinta como «no ha subido».

import { importeEiac } from './importe-eiac.ts'
import { FRACCIONES } from './pago.ts'

export type ReciboEvolucion = {
  id: string
  /** `CA` renovación · `NP` nueva producción · `SU` suplemento · otros se ignoran. */
  claseRecibo: string | null
  /** Inicio del periodo que cubre el recibo (ISO). Sin él no se sabe a qué ciclo va. */
  fechaEfectoInicial: string | null
  fechaEmision: string | null
  situacion: string | null
  /** Importes TAL CUAL del EIAC (texto). */
  primaTotal: string | null
  primaNeta: string | null
}

export type SiniestroEvolucion = {
  fechaHora: string | null
  estado: string
}

export type Anualidad = {
  /** Aniversario que abre el ciclo (ISO fecha). */
  desde: string
  /** Día anterior al siguiente aniversario (ISO fecha). */
  hasta: string
  /** Recibos CA/NP no anulados que caen en el ciclo. */
  recibos: number
  /** Cuántos recibos debería tener el ciclo según `fraccionamiento`. `null` = fraccionamiento no informado. */
  esperados: number | null
  /** `true` solo cuando `recibos === esperados` y ninguno ilegible. */
  completa: boolean
  /** Suma de `prima_total` de los recibos del ciclo. `null` si alguno es ilegible. */
  primaTotal: number | null
  primaNeta: number | null
  suplementos: number
  /** Siniestros con fecha dentro del ciclo. */
  siniestros: number
  /** Variación de la prima total respecto a la anualidad anterior, en %. `null` en la primera o si falta dato. */
  variacionPct: number | null
}

export type VeredictoPrima =
  | 'sube_por_siniestros'
  | 'sube_sin_siniestro'
  | 'no_atribuible'
  | 'igual'
  | 'baja'
  | 'sin_datos'

export type EvolucionPrima = {
  anualidades: Anualidad[]
  veredicto: VeredictoPrima
  /** Variación de la última anualidad completa respecto a la anterior, en %. */
  variacionPct: number | null
  /** Siniestros sin fecha: no se pueden atribuir a ningún ciclo, y se dicen. */
  siniestrosSinFecha: number
  /** Una frase para la ficha. */
  explicacion: string
}

/** Por debajo de esto la prima «no ha cambiado» (redondeos). */
export const UMBRAL_IGUAL_PCT = 0.5
/** Por debajo de esto una subida sin siniestro parece actualización general de tarifa, no penalización. */
export const UMBRAL_SUBIDA_GENERAL_PCT = 5

const DIA_MS = 86_400_000

function fechaUtc(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function isoDia(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function sumarAnios(d: Date, n: number): Date {
  const r = new Date(Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate()))
  return r
}

/**
 * El aniversario que abre el ciclo en el que cae `fecha`, contando desde
 * `inicio`. Un recibo cuyo efecto es unos días ANTES del aniversario (la
 * compañía emite con antelación) se lleva al ciclo que empieza, no al que
 * acaba: por eso el margen de 15 días.
 */
export function inicioCiclo(inicio: Date, fecha: Date): Date {
  const MARGEN = 15 * DIA_MS
  let anios = fecha.getUTCFullYear() - inicio.getUTCFullYear()
  let candidato = sumarAnios(inicio, anios)
  if (candidato.getTime() - fecha.getTime() > MARGEN) {
    anios -= 1
    candidato = sumarAnios(inicio, anios)
  } else if (sumarAnios(inicio, anios + 1).getTime() - fecha.getTime() <= MARGEN) {
    anios += 1
    candidato = sumarAnios(inicio, anios)
  }
  return candidato
}

function pct(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null
  return Math.round(((actual - anterior) / anterior) * 1000) / 10
}

export function evolucionPrima(args: {
  fechaInicio: string | null
  fraccionamiento: string | null
  recibos: readonly ReciboEvolucion[]
  siniestros: readonly SiniestroEvolucion[]
}): EvolucionPrima {
  const utiles = args.recibos.filter((r) => (r.situacion ?? '').trim() !== 'anulado')
  const deCiclo = utiles.filter((r) => r.claseRecibo === 'CA' || r.claseRecibo === 'NP')
  const suplementos = utiles.filter((r) => r.claseRecibo === 'SU')

  // El aniversario: la fecha de inicio de la póliza, o si no viene, el efecto
  // del primer recibo de ciclo. Sin ninguna de las dos no hay ciclos.
  const efectos = deCiclo.map((r) => fechaUtc(r.fechaEfectoInicial)).filter((d): d is Date => d !== null)
  const inicio = fechaUtc(args.fechaInicio) ?? (efectos.length ? new Date(Math.min(...efectos.map((d) => d.getTime()))) : null)
  const siniestrosSinFecha = args.siniestros.filter((s) => fechaUtc(s.fechaHora) === null).length

  if (inicio === null || deCiclo.length === 0) {
    return {
      anualidades: [],
      veredicto: 'sin_datos',
      variacionPct: null,
      siniestrosSinFecha,
      explicacion: deCiclo.length === 0 ? 'CIMA no ha mandado recibos de renovación de esta póliza: no se puede comparar anualidades.' : 'Sin fecha de inicio ni efecto en los recibos: no se puede partir en anualidades.',
    }
  }

  const esperados = args.fraccionamiento ? (FRACCIONES[args.fraccionamiento] ?? null) : null
  const ciclos = new Map<string, { desde: Date; totales: (number | null)[]; netas: (number | null)[]; suplementos: number; siniestros: number }>()
  const ciclo = (d: Date) => {
    const desde = inicioCiclo(inicio, d)
    const k = isoDia(desde)
    let c = ciclos.get(k)
    if (!c) {
      c = { desde, totales: [], netas: [], suplementos: 0, siniestros: 0 }
      ciclos.set(k, c)
    }
    return c
  }
  for (const r of deCiclo) {
    const d = fechaUtc(r.fechaEfectoInicial) ?? fechaUtc(r.fechaEmision)
    if (!d) continue
    const c = ciclo(d)
    c.totales.push(importeEiac(r.primaTotal))
    c.netas.push(importeEiac(r.primaNeta))
  }
  for (const r of suplementos) {
    const d = fechaUtc(r.fechaEfectoInicial) ?? fechaUtc(r.fechaEmision)
    if (d) ciclo(d).suplementos++
  }
  for (const s of args.siniestros) {
    const d = fechaUtc(s.fechaHora)
    if (!d) continue
    // Un siniestro de un ciclo del que no hay recibos también cuenta: se crea el ciclo vacío.
    ciclo(d).siniestros++
  }

  const anualidades: Anualidad[] = [...ciclos.values()]
    .sort((a, b) => a.desde.getTime() - b.desde.getTime())
    .map((c) => {
      const ilegible = c.totales.some((t) => t === null)
      const primaTotal = c.totales.length === 0 || ilegible ? null : (c.totales as number[]).reduce((a, b) => a + b, 0)
      const primaNeta = c.netas.length === 0 || c.netas.some((t) => t === null) ? null : (c.netas as number[]).reduce((a, b) => a + b, 0)
      return {
        desde: isoDia(c.desde),
        hasta: isoDia(new Date(sumarAnios(c.desde, 1).getTime() - DIA_MS)),
        recibos: c.totales.length,
        esperados,
        completa: esperados !== null && c.totales.length === esperados && !ilegible,
        primaTotal: primaTotal === null ? null : Math.round(primaTotal * 100) / 100,
        primaNeta: primaNeta === null ? null : Math.round(primaNeta * 100) / 100,
        suplementos: c.suplementos,
        siniestros: c.siniestros,
        variacionPct: null,
      }
    })
  for (let i = 1; i < anualidades.length; i++) {
    const a = anualidades[i]
    const p = anualidades[i - 1]
    a.variacionPct = a.primaTotal !== null && p.primaTotal !== null ? pct(a.primaTotal, p.primaTotal) : null
  }

  // El veredicto se da sobre la ÚLTIMA anualidad con recibos y la anterior.
  const conRecibos = anualidades.filter((a) => a.recibos > 0)
  const ultima = conRecibos[conRecibos.length - 1]
  const anterior = conRecibos[conRecibos.length - 2]
  const base = { anualidades, siniestrosSinFecha }

  if (!ultima || !anterior) {
    return { ...base, veredicto: 'sin_datos', variacionPct: null, explicacion: 'CIMA solo ha mandado recibos de una anualidad: no hay anterior con la que comparar.' }
  }
  if (!ultima.completa || !anterior.completa) {
    const cual = !ultima.completa ? 'la última' : 'la anterior'
    const a = !ultima.completa ? ultima : anterior
    return {
      ...base,
      veredicto: 'sin_datos',
      variacionPct: null,
      explicacion:
        a.esperados === null
          ? 'Sin fraccionamiento informado no se sabe cuántos recibos tiene un ciclo: no se afirma la prima anual.'
          : `Faltan recibos de ${cual} anualidad (${a.recibos} de ${a.esperados}${a.primaTotal === null && a.recibos > 0 ? ', o alguno ilegible' : ''}): comparar sumaría medio ciclo contra uno entero.`,
    }
  }
  const variacion = ultima.variacionPct
  if (variacion === null) {
    return { ...base, veredicto: 'sin_datos', variacionPct: null, explicacion: 'Importe de la anualidad anterior a cero o ilegible: no hay base para el porcentaje.' }
  }
  const pctTxt = `${variacion > 0 ? '+' : ''}${variacion.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
  if (Math.abs(variacion) < UMBRAL_IGUAL_PCT) {
    return { ...base, veredicto: 'igual', variacionPct: variacion, explicacion: `La prima no ha cambiado (${pctTxt}) respecto a la anualidad anterior.` }
  }
  if (variacion < 0) {
    return { ...base, veredicto: 'baja', variacionPct: variacion, explicacion: `La prima ha BAJADO ${pctTxt} respecto a la anualidad anterior.` }
  }
  if (anterior.siniestros > 0) {
    return {
      ...base,
      veredicto: 'sube_por_siniestros',
      variacionPct: variacion,
      explicacion: `Sube ${pctTxt}: hubo ${anterior.siniestros} siniestro(s) en el ciclo anterior (${anterior.desde} → ${anterior.hasta}). La compañía penaliza la siniestralidad; retarificar con otra compañía la arrastra igual (SINCO).`,
    }
  }
  if (siniestrosSinFecha > 0) {
    return {
      ...base,
      veredicto: 'no_atribuible',
      variacionPct: variacion,
      explicacion: `Sube ${pctTxt} y hay ${siniestrosSinFecha} siniestro(s) sin fecha: no se puede decir si la subida viene de ellos o de tarifa.`,
    }
  }
  const general = variacion <= UMBRAL_SUBIDA_GENERAL_PCT
  return {
    ...base,
    veredicto: 'sube_sin_siniestro',
    variacionPct: variacion,
    explicacion: general
      ? `Sube ${pctTxt} sin siniestros en el ciclo anterior: parece actualización general de tarifa (≤ ${UMBRAL_SUBIDA_GENERAL_PCT} %). Aun así, retarificar es gratis de mirar.`
      : `Sube ${pctTxt} SIN siniestros en el ciclo anterior: no hay penalización que lo justifique → candidata a retarificar.`,
  }
}

const ETIQUETA: Record<VeredictoPrima, string> = {
  sube_por_siniestros: '🔺 Sube por siniestros',
  sube_sin_siniestro: '🔺 Sube sin siniestro',
  no_atribuible: '🔺 Sube (no atribuible)',
  igual: '➡️ Igual',
  baja: '🔻 Baja',
  sin_datos: '❔ Sin anualidad anterior',
}

export function etiquetaVeredictoPrima(v: VeredictoPrima): string {
  return ETIQUETA[v]
}
