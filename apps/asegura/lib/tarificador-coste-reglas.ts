// Coste por tarificación del bot (07/10/2026). PURO: sin BD ni red (`node --test`).
//
// Dos partes: IA (tabla `ai_usos`, app='asegura') + máquina de Fly (segundos de ejecución × tarifa).
// 🚨 Dato que no hay ≠ 0: sin lectura de `ai_usos`, o con suma 0 (columna con DEFAULT 0), la IA es `null`
//    («no consta»); un trabajo sin segundos de ejecución no suma Fly. Nunca se pinta 0 por no saber.
// ⚠️ La IA NO se puede asociar a un trabajo: `ai_usos` no guarda referencia de trabajo (la pasarela no la recibe).
//    Se PRORRATEA por día: el gasto de IA del día se reparte entre los trabajos terminados ese día (incluye
//    cualquier otro uso de IA de asegura del mismo día, así que es una cota por arriba). La UI lo dice.

/**
 * Tarifa de Fly de la máquina del worker (`shared-cpu-2x`, 2 GB: `services/tarificador-rpa/fly.toml`).
 * ORIGEN: lista de precios publicada de Fly.io (cuota mensual de la máquina, facturada por segundo en marcha),
 * ~11,39 US$/mes anotada el 07/10/2026 DE MEMORIA, sin contrastar con la factura: REVISAR en fly.io/docs/about/pricing.
 * Se mantiene como estimación orientativa; el coste real es el de la factura de Fly.
 */
export const FLY_USD_POR_MES_MAQUINA = 11.39
export const SEGUNDOS_MES_FLY = 30 * 86_400
/** US$ → € aproximado (07/10/2026). Orientativo. */
export const EUR_POR_USD = 0.92
export const FLY_EUR_POR_SEG = (FLY_USD_POR_MES_MAQUINA / SEGUNDOS_MES_FLY) * EUR_POR_USD

const msDia = 86_400_000
const FALLIDOS = new Set(['error_definitivo', 'requiere_humano'])

export type TrabajoCoste = {
  compania: string
  estado: string
  creadoEn: string
  iniciadoEn: string | null
  terminadoEn: string | null
}
/** Gasto de IA de un día (Madrid, AAAA-MM-DD). `null` = no consta. */
export type IaDia = { dia: string; eur: number | null }

export type FilaCoste = {
  dia: string
  compania: string
  /** Trabajos terminados (ok o fallidos) ese día de esa compañía. */
  trabajos: number
  ok: number
  /** Segundos de ejecución sumados; `null` = ningún trabajo con tiempos. */
  segundos: number | null
  flyEur: number | null
  /** IA prorrateada por día entre los trabajos terminados; `null` = no consta. */
  iaEur: number | null
  /** Fly + IA de lo que conste; `null` = nada consta. */
  totalEur: number | null
}

export type CosteResumen = {
  /** Mes natural en curso (Madrid): AAAA-MM. */
  mes: string
  /** Coste del mes (Fly + IA de lo que conste); `null` = nada consta. */
  costeMesEur: number | null
  trabajosMes: number
  /** Coste medio por tarificación (trabajo `ok`) en 30 días: TODO el gasto (también el de los fallidos) / ok. `null` = sin dato o sin ok. */
  costeMedioEur: number | null
  /** Coste medio de la parte Fly por trabajo terminado con tiempos (30 días). */
  flyMedioPorTrabajoEur: number | null
  /** ¿El coste medio incluye la IA? `false` = solo Fly (la IA no consta). */
  iaIncluida: boolean
  proyeccion100Eur: number | null
  proyeccion1000Eur: number | null
}

export type CostePanel = {
  disponible: true
  tarifaFlyEurPorSeg: number
  resumen: CosteResumen
  /** Más reciente primero, ≤ 60 filas. */
  filas: FilaCoste[]
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000
const r2 = (n: number) => Math.round(n * 100) / 100

export function diaMadrid(iso: string): string | null {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }) : null
}

/** Segundos de ejecución (iniciado→terminado); `null` si falta un extremo o no cuadra. */
export function segundosEjecucion(t: Pick<TrabajoCoste, 'iniciadoEn' | 'terminadoEn'>): number | null {
  if (!t.iniciadoEn || !t.terminadoEn) return null
  const s = (Date.parse(t.terminadoEn) - Date.parse(t.iniciadoEn)) / 1000
  return Number.isFinite(s) && s >= 0 ? s : null
}

/** Euros de Fly de `segundos`; `null` si no consta. */
export function costeFly(segundos: number | null, eurPorSeg: number = FLY_EUR_POR_SEG): number | null {
  return segundos === null || !Number.isFinite(segundos) ? null : segundos * eurPorSeg
}

/** Suma lo que conste; si nada consta, `null` (nunca 0). */
export function sumarConocidos(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return v.length ? v.reduce((s, x) => s + x, 0) : null
}

/** Una suma de `ai_usos` que sale 0 (DEFAULT 0) o negativa no es un coste conocido. */
export function iaConocida(suma: number | null | undefined): number | null {
  return typeof suma === 'number' && Number.isFinite(suma) && suma > 0 ? suma : null
}

export function calcularCoste(
  trabajos: TrabajoCoste[],
  ia: IaDia[] | null,
  ahora: Date,
  eurPorSeg: number = FLY_EUR_POR_SEG,
): CostePanel {
  const iaPorDia = new Map<string, number | null>()
  for (const x of ia ?? []) iaPorDia.set(x.dia, iaConocida(x.eur))

  const desde30 = ahora.getTime() - 30 * msDia
  const hoy = diaMadrid(ahora.toISOString()) as string
  const mes = hoy.slice(0, 7)

  type T = TrabajoCoste & { dia: string; seg: number | null }
  const terminados: T[] = []
  for (const t of trabajos) {
    if (t.estado !== 'ok' && !FALLIDOS.has(t.estado)) continue
    const dia = diaMadrid(t.terminadoEn ?? t.creadoEn)
    if (!dia) continue
    terminados.push({ ...t, dia, seg: segundosEjecucion(t) })
  }
  const trabajosPorDia = new Map<string, number>()
  for (const t of terminados) trabajosPorDia.set(t.dia, (trabajosPorDia.get(t.dia) ?? 0) + 1)

  // IA prorrateada del día a cada trabajo terminado ese día.
  const iaDeTrabajo = (t: T): number | null => {
    const d = iaPorDia.get(t.dia)
    const n = trabajosPorDia.get(t.dia) ?? 0
    return d === null || d === undefined || n === 0 ? null : d / n
  }

  const filasMap = new Map<string, { dia: string; compania: string; trabajos: number; ok: number; seg: (number | null)[]; ia: (number | null)[] }>()
  for (const t of terminados) {
    const k = `${t.dia}|${t.compania}`
    let f = filasMap.get(k)
    if (!f) filasMap.set(k, (f = { dia: t.dia, compania: t.compania, trabajos: 0, ok: 0, seg: [], ia: [] }))
    f.trabajos++
    if (t.estado === 'ok') f.ok++
    f.seg.push(t.seg)
    f.ia.push(iaDeTrabajo(t))
  }
  const filas: FilaCoste[] = [...filasMap.values()]
    .map((f) => {
      const segundos = sumarConocidos(f.seg)
      const flyEur = costeFly(segundos, eurPorSeg)
      const iaEur = sumarConocidos(f.ia)
      const total = sumarConocidos([flyEur, iaEur])
      return {
        dia: f.dia, compania: f.compania, trabajos: f.trabajos, ok: f.ok,
        segundos: segundos === null ? null : Math.round(segundos),
        flyEur: flyEur === null ? null : r4(flyEur),
        iaEur: iaEur === null ? null : r4(iaEur),
        totalEur: total === null ? null : r4(total),
      }
    })
    .sort((a, b) => b.dia.localeCompare(a.dia) || a.compania.localeCompare(b.compania))

  const del30 = terminados.filter((t) => Date.parse(t.terminadoEn ?? t.creadoEn) >= desde30)
  const delMes = terminados.filter((t) => t.dia.slice(0, 7) === mes)
  const costeTrabajo = (t: T) => sumarConocidos([costeFly(t.seg, eurPorSeg), iaDeTrabajo(t)])
  const costeMes = sumarConocidos(delMes.map(costeTrabajo))
  const coste30 = sumarConocidos(del30.map(costeTrabajo))
  const ok30 = del30.filter((t) => t.estado === 'ok').length
  const medio = coste30 !== null && ok30 > 0 ? coste30 / ok30 : null
  const flyTrabajos = del30.map((t) => costeFly(t.seg, eurPorSeg)).filter((x): x is number => x !== null)
  const iaIncluida = del30.some((t) => iaDeTrabajo(t) !== null)

  return {
    disponible: true,
    tarifaFlyEurPorSeg: eurPorSeg,
    resumen: {
      mes,
      costeMesEur: costeMes === null ? null : r2(costeMes),
      trabajosMes: delMes.length,
      costeMedioEur: medio === null ? null : r4(medio),
      flyMedioPorTrabajoEur: flyTrabajos.length ? r4(flyTrabajos.reduce((s, x) => s + x, 0) / flyTrabajos.length) : null,
      iaIncluida,
      proyeccion100Eur: medio === null ? null : r2(medio * 100),
      proyeccion1000Eur: medio === null ? null : r2(medio * 1000),
    },
    filas: filas.slice(0, 60),
  }
}
