// Panel de control «Objetivos y producción» de Compañías (07/10/2026): cruza la
// cartera EN VIGOR por compañía × ramo con los acuerdos y los objetivos evaluados,
// para decidir qué compañía interesa en cada ramo. Lo PURO: sin red ni React.
// Spec: docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
//
// 🚨 NULL ≠ 0. Un % que el acuerdo no dice es `null` y nunca gana una comparación;
// un objetivo pendiente no tiene avance (`null`), no «0 %»; sin cartera leída
// (`cartera === null`) las pólizas son `null` («sin dato»), no 0. Un acuerdo sin
// cotejar marca la candidata como PROVISIONAL (nunca se recomienda en firme).
// 🔒 Aquí no hay cifras de ningún acuerdo: todo llega por parámetro.

/** Lo mínimo de una póliza EN VIGOR (`esCarteraEnVigor`) para agregarla. */
export type PolizaVigor = {
  companiaCodigoDgs: string | null | undefined
  ramo: string | null | undefined
  primaAnual: number | null | undefined
}

export type FilaCartera = {
  companiaCodigoDgs: string
  ramo: string
  polizas: number
  /** Suma de las primas LEÍDAS. Con `sinPrima > 0` es un total incompleto. */
  prima: number
  /** Pólizas sin `prima_anual`: no suman 0, se cuentan aparte. */
  sinPrima: number
}

const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * Agrupa pólizas en vigor por compañía × ramo. Sin compañía (o sin ramo) no se
 * puede asignar: se cuenta en `sinCompania` / `sinRamo` y NO se reparte.
 */
export function agregarCarteraVigor(polizas: readonly PolizaVigor[]): { filas: FilaCartera[]; sinCompania: number; sinRamo: number } {
  const mapa = new Map<string, FilaCartera>()
  let sinCompania = 0
  let sinRamo = 0
  for (const p of polizas) {
    const c = typeof p.companiaCodigoDgs === 'string' ? p.companiaCodigoDgs.trim() : ''
    if (c === '') { sinCompania++; continue }
    const r = typeof p.ramo === 'string' ? p.ramo.trim() : ''
    if (r === '') { sinRamo++; continue }
    const k = `${c}\u0000${r}`
    const f = mapa.get(k) ?? { companiaCodigoDgs: c, ramo: r, polizas: 0, prima: 0, sinPrima: 0 }
    f.polizas++
    if (typeof p.primaAnual === 'number' && Number.isFinite(p.primaAnual)) f.prima = redondear(f.prima + p.primaAnual)
    else f.sinPrima++
    mapa.set(k, f)
  }
  return {
    filas: [...mapa.values()].sort((a, b) => a.companiaCodigoDgs.localeCompare(b.companiaCodigoDgs) || a.ramo.localeCompare(b.ramo)),
    sinCompania,
    sinRamo,
  }
}

export type TotalCartera = { polizas: number; prima: number; sinPrima: number }

/** Total por compañía (todas sus filas) o `null` si la cartera no se ha leído. */
export function totalesPorCompania(cartera: readonly FilaCartera[] | null): Map<string, TotalCartera> | null {
  if (cartera === null) return null
  const m = new Map<string, TotalCartera>()
  for (const f of cartera) {
    const t = m.get(f.companiaCodigoDgs) ?? { polizas: 0, prima: 0, sinPrima: 0 }
    t.polizas += f.polizas
    t.prima = redondear(t.prima + f.prima)
    t.sinPrima += f.sinPrima
    m.set(f.companiaCodigoDgs, t)
  }
  return m
}

// ─── Entradas (estructurales: valen los tipos de plataforma tal cual) ────────

export type AcuerdoControl = {
  id: string
  companiaCodigoDgs: string
  /** Texto ya resuelto («APROMES», «Directo»…). */
  fuente: string
  revisado: boolean
  comisiones: readonly { ramo: string | null; pctNp: number | null; pctCartera: number | null }[]
  objetivos: readonly { id: string; base: string | null; ramos: readonly string[] }[]
}

export type EstadoObjetivoControl =
  | { color: 'pendiente'; motivo: string }
  | { color: 'alcanzado' | 'en_camino' | 'por_debajo' | 'no_llega'; medido: number; umbral: number; falta: number | null }

export type ObjetivoEvaluadoControl = { acuerdoId: string; objetivoId: string; estado: EstadoObjetivoControl }

// ─── Salida ──────────────────────────────────────────────────────────────────

export type ObjetivoCandidata =
  | { estado: 'sin_objetivo' }
  | { estado: 'pendiente'; motivo: string }
  | {
      estado: 'medido'
      color: 'alcanzado' | 'en_camino' | 'por_debajo' | 'no_llega'
      /** 0..1, `medido / umbral` acotado a 1. Un umbral 0 no se divide: `null`. */
      avance: number | null
      base: string | null
      medido: number
      umbral: number
      /** Lo que falta para el siguiente tramo (`null` = no hay siguiente / no consta). */
      falta: number | null
    }

export type CandidataRamo = {
  companiaCodigoDgs: string
  acuerdoId: string
  fuente: string
  /** Acuerdo sin cotejar con su documento: cifras PROVISIONALES. */
  sinCotejar: boolean
  pctNp: number | null
  pctCartera: number | null
  /** `null` = cartera no leída (sin dato); 0 = leída y sin pólizas. */
  polizas: number | null
  prima: number | null
  sinPrima: number
  objetivo: ObjetivoCandidata
}

export type RamoControl = {
  ramo: string
  candidatas: CandidataRamo[]
  /** Código DGS de la compañía recomendada, o `null` si no hay base para recomendar. */
  recomendada: string | null
  motivo: string
  /** Cartera en vigor de ese ramo, todas las compañías. `null` = cartera no leída. */
  cartera: TotalCartera | null
}

export type PanelControl = {
  ramos: RamoControl[]
  /** Ramos con pólizas en vigor y NINGÚN acuerdo con línea para ellos (no casan o no hay). */
  ramosSinAcuerdo: { ramo: string; polizas: number }[]
  /** Líneas de acuerdo cuyo ramo no se pudo mapear: se enseñan en la ficha, aquí no calculan. */
  lineasSinRamo: number
}

/** Dos comisiones a menos de tantos puntos se consideran parecidas: manda el objetivo. */
export const MARGEN_COMISION_PUNTOS = 1

function objetivoDe(
  acuerdo: AcuerdoControl,
  ramo: string,
  evaluados: ReadonlyMap<string, ObjetivoEvaluadoControl>,
): ObjetivoCandidata {
  const aplicables = acuerdo.objetivos.filter((o) => o.ramos.length === 0 || o.ramos.includes(ramo))
  if (aplicables.length === 0) return { estado: 'sin_objetivo' }
  let mejor: Extract<ObjetivoCandidata, { estado: 'medido' }> | null = null
  let pendiente: string | null = null
  for (const o of aplicables) {
    const ev = evaluados.get(o.id)
    if (!ev) { pendiente = pendiente ?? 'no se ha podido evaluar'; continue }
    const e = ev.estado
    if (e.color === 'pendiente') { pendiente = pendiente ?? e.motivo; continue }
    const avance = e.umbral > 0 ? Math.min(1, Math.max(0, e.medido / e.umbral)) : null
    const cand = { estado: 'medido' as const, color: e.color, avance, base: o.base, medido: e.medido, umbral: e.umbral, falta: e.falta }
    if (mejor === null || (cand.avance ?? -1) > (mejor.avance ?? -1)) mejor = cand
  }
  if (mejor) return mejor
  return { estado: 'pendiente', motivo: pendiente ?? 'no se ha podido evaluar' }
}

const avanceDe = (c: CandidataRamo): number => (c.objetivo.estado === 'medido' && c.objetivo.avance !== null ? c.objetivo.avance : -1)

/**
 * Por ramo, qué compañías tienen acuerdo (mejor línea de cada una), con su
 * producción en cartera y el avance de su objetivo, y cuál conviene.
 *
 * Recomendada: entre las candidatas con % de nueva producción conocido, las que
 * están a ≤ `MARGEN_COMISION_PUNTOS` de la mejor comisión; de ellas, la de objetivo
 * más avanzado (un objetivo pendiente o sin medir cuenta como «sin avance»), y a
 * igualdad la de más comisión y luego la de más prima en cartera. Sin ningún %
 * conocido NO se recomienda ninguna.
 */
export function panelControl(e: {
  acuerdos: readonly AcuerdoControl[]
  objetivos: readonly ObjetivoEvaluadoControl[]
  /** `null` = la cartera no se ha podido leer. */
  cartera: readonly FilaCartera[] | null
}): PanelControl {
  const evaluados = new Map(e.objetivos.map((o) => [o.objetivoId, o]))
  const filaDe = new Map((e.cartera ?? []).map((f) => [`${f.companiaCodigoDgs}\u0000${f.ramo}`, f]))
  let lineasSinRamo = 0

  // ramo → compañía → mejor línea (mayor % NP conocido; sin % pierde frente a uno con %).
  const porRamo = new Map<string, Map<string, { a: AcuerdoControl; pctNp: number | null; pctCartera: number | null }>>()
  for (const a of e.acuerdos) {
    for (const l of a.comisiones) {
      if (l.ramo === null) { lineasSinRamo++; continue }
      const m = porRamo.get(l.ramo) ?? new Map()
      const previa = m.get(a.companiaCodigoDgs)
      if (!previa || (l.pctNp ?? -1) > (previa.pctNp ?? -1)) m.set(a.companiaCodigoDgs, { a, pctNp: l.pctNp, pctCartera: l.pctCartera })
      porRamo.set(l.ramo, m)
    }
  }

  const ramos: RamoControl[] = []
  for (const [ramo, m] of porRamo) {
    const candidatas: CandidataRamo[] = [...m.entries()].map(([compania, x]) => {
      const f = e.cartera === null ? null : filaDe.get(`${compania}\u0000${ramo}`) ?? null
      return {
        companiaCodigoDgs: compania, acuerdoId: x.a.id, fuente: x.a.fuente, sinCotejar: !x.a.revisado,
        pctNp: x.pctNp, pctCartera: x.pctCartera,
        polizas: e.cartera === null ? null : f?.polizas ?? 0,
        prima: e.cartera === null ? null : f?.prima ?? 0,
        sinPrima: f?.sinPrima ?? 0,
        objetivo: objetivoDe(x.a, ramo, evaluados),
      }
    })

    const conPct = candidatas.filter((c) => c.pctNp !== null)
    let recomendada: CandidataRamo | null = null
    let motivo: string
    if (conPct.length === 0) {
      motivo = 'Ninguna comisión consta en el acuerdo: sin base para recomendar.'
    } else {
      const maxPct = Math.max(...conPct.map((c) => c.pctNp as number))
      const grupo = conPct.filter((c) => (c.pctNp as number) >= maxPct - MARGEN_COMISION_PUNTOS)
      grupo.sort((a, b) =>
        avanceDe(b) - avanceDe(a) || (b.pctNp as number) - (a.pctNp as number) || (b.prima ?? -1) - (a.prima ?? -1))
      recomendada = grupo[0]
      if (conPct.length === 1 && candidatas.length === 1) motivo = 'Única compañía con acuerdo para este ramo.'
      else if (recomendada.pctNp === maxPct) motivo = grupo.length > 1 && avanceDe(recomendada) >= 0 ? 'Comisión entre las mejores y objetivo más avanzado.' : 'Mejor comisión de nueva producción.'
      else motivo = `Comisión a ${MARGEN_COMISION_PUNTOS} punto o menos de la mejor y objetivo más avanzado.`
      if (recomendada.sinCotejar) motivo += ' Provisional: acuerdo sin cotejar.'
    }

    const orden = [...candidatas].sort((a, b) =>
      (a === recomendada ? -1 : 0) - (b === recomendada ? -1 : 0) || (b.pctNp ?? -1) - (a.pctNp ?? -1) || a.companiaCodigoDgs.localeCompare(b.companiaCodigoDgs))

    let cartera: TotalCartera | null = null
    if (e.cartera !== null) {
      cartera = { polizas: 0, prima: 0, sinPrima: 0 }
      for (const f of e.cartera) if (f.ramo === ramo) {
        cartera.polizas += f.polizas
        cartera.prima = redondear(cartera.prima + f.prima)
        cartera.sinPrima += f.sinPrima
      }
    }
    ramos.push({ ramo, candidatas: orden, recomendada: recomendada?.companiaCodigoDgs ?? null, motivo, cartera })
  }

  ramos.sort((a, b) => (b.cartera?.polizas ?? -1) - (a.cartera?.polizas ?? -1) || a.ramo.localeCompare(b.ramo))

  const totalRamo = new Map<string, number>()
  for (const f of e.cartera ?? []) totalRamo.set(f.ramo, (totalRamo.get(f.ramo) ?? 0) + f.polizas)
  const ramosSinAcuerdo = [...totalRamo.entries()]
    .filter(([r]) => !porRamo.has(r))
    .map(([ramo, polizas]) => ({ ramo, polizas }))
    .sort((a, b) => b.polizas - a.polizas)

  return { ramos, ramosSinAcuerdo, lineasSinRamo }
}
