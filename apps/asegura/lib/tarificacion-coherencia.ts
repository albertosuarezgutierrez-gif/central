// Comprobador de COHERENCIA de los precios de una tarificación (04/11/2026, plan del tarificador): antes de avisar a Alberto por
// Telegram se buscan señales de lectura errónea del portal. PURA (sin BD ni red). Los avisos NO bloquean nada: van al Telegram
// como «⚠️ Revisar: …» y se guardan en `presupuestos.estudio.rpa.coherencia`. Textos cortos y SIN datos personales (solo
// compañía, producto, importes y fechas del riesgo).
import { eur } from './dinero.ts'

export type FraccionamientoCoherencia = 'anual' | 'semestral' | 'trimestral' | 'mensual'

export type PrecioCoherencia = {
  compania: string
  producto: string
  primaAnualEur: number
  fraccionamiento: FraccionamientoCoherencia | null
  /** Importe de cada recibo con ese fraccionamiento. `null` = el portal no lo dice (no se compara). */
  importeReciboEur: number | null
  /** Coberturas leídas. `null`/ausente/[] = no se leyeron (no se compara por coberturas). */
  coberturas?: readonly { estado: 'incluida' | 'excluida' | null }[] | null
}

export type RiesgoCoherencia = {
  ramo: string | null
  /** Fecha de efecto ISO `AAAA-MM-DD` con la que se tarificó. `null` = no consta (no se avisa: no se sabe). */
  fechaEfecto: string | null
}

export type CodigoCoherencia =
  | 'prima_invalida'
  | 'prima_fuera_rango'
  | 'modalidad_incoherente'
  | 'desviacion_mediana'
  | 'precio_repetido'
  | 'fraccionado_descuadrado'
  | 'efecto_pasado'

export type AvisoCoherencia = { codigo: CodigoCoherencia; texto: string }

/** Rangos de prima ANUAL razonables por ramo (€/año). Ramo sin rango → solo se comprueba prima ≤0. Configurable aquí. */
export const RANGOS_PRIMA_POR_RAMO: Readonly<Record<string, { min: number; max: number }>> = {
  auto: { min: 80, max: 6000 },
  moto: { min: 40, max: 3000 },
  hogar: { min: 40, max: 3000 },
  comunidades: { min: 100, max: 20000 },
}

/** Una prima es «desviada» si es > FACTOR × la mediana del resto de compañías (o < mediana / FACTOR). */
export const FACTOR_DESVIACION = 3
/** Mínimo de precios de OTRAS compañías para que la mediana signifique algo. */
export const MIN_PRECIOS_MEDIANA = 2
/** Tolerancia entre recibo × nº de recibos y la prima anual. */
export const TOLERANCIA_FRACCIONADO = 0.05

const RECIBOS_POR_ANIO: Record<FraccionamientoCoherencia, number> = { anual: 1, semestral: 2, trimestral: 4, mensual: 12 }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const fechaEs = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const nombre = (p: PrecioCoherencia): string => `${p.compania} · ${p.producto}`
const valida = (n: number): boolean => Number.isFinite(n) && n > 0
const centimos = (n: number): number => Math.round(n * 100)

function ramoNormalizado(ramo: string | null): string | null {
  const r = (ramo ?? '').trim().toLowerCase()
  if (r === 'coche') return 'auto'
  return r || null
}

function mediana(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Nº de coberturas incluidas; `null` = no se leyeron coberturas (no se compara). */
function incluidas(p: PrecioCoherencia): number | null {
  if (!p.coberturas || p.coberturas.length === 0) return null
  return p.coberturas.filter((c) => c.estado === 'incluida').length
}

/**
 * Avisos de coherencia de los precios de una tarificación. `hoy` = `AAAA-MM-DD` (inyectado: nada de reloj real dentro).
 * Orden estable: por regla y, dentro de cada una, por el orden de los precios recibidos.
 */
export function comprobarCoherenciaPrecios(
  precios: readonly PrecioCoherencia[],
  riesgo: RiesgoCoherencia,
  opts: { hoy: string; rangos?: Readonly<Record<string, { min: number; max: number }>> },
): AvisoCoherencia[] {
  const out: AvisoCoherencia[] = []
  const ramo = ramoNormalizado(riesgo.ramo)
  const rango = ramo ? (opts.rangos ?? RANGOS_PRIMA_POR_RAMO)[ramo] : undefined

  // 1. Prima ≤0 / no numérica, o fuera del rango del ramo.
  for (const p of precios) {
    if (!valida(p.primaAnualEur)) out.push({ codigo: 'prima_invalida', texto: `${nombre(p)}: prima anual ${Number.isFinite(p.primaAnualEur) ? eur(p.primaAnualEur) : 'no numérica'} (≤0).` })
    else if (rango && (p.primaAnualEur < rango.min || p.primaAnualEur > rango.max)) {
      out.push({ codigo: 'prima_fuera_rango', texto: `${nombre(p)}: ${eur(p.primaAnualEur)}/año fuera de lo normal en ${ramo} (${eur(rango.min)}–${eur(rango.max)}).` })
    }
  }
  const buenas = precios.filter((p) => valida(p.primaAnualEur))

  // 2. Misma compañía: la modalidad con MÁS coberturas incluidas no puede ser más barata que la de menos.
  for (let i = 0; i < buenas.length; i++) {
    for (let j = 0; j < buenas.length; j++) {
      const a = buenas[i], b = buenas[j]
      if (i === j || a.compania.trim().toLowerCase() !== b.compania.trim().toLowerCase()) continue
      const ca = incluidas(a), cb = incluidas(b)
      if (ca === null || cb === null) continue
      if (ca > cb && a.primaAnualEur < b.primaAnualEur) {
        out.push({ codigo: 'modalidad_incoherente', texto: `${a.compania}: «${a.producto}» (${ca} coberturas, ${eur(a.primaAnualEur)}) más barata que «${b.producto}» (${cb} coberturas, ${eur(b.primaAnualEur)}).` })
      }
    }
  }

  // 3. Desviación > FACTOR respecto a la mediana del resto de compañías.
  for (const p of buenas) {
    const resto = buenas.filter((q) => q.compania.trim().toLowerCase() !== p.compania.trim().toLowerCase()).map((q) => q.primaAnualEur)
    if (resto.length < MIN_PRECIOS_MEDIANA) continue
    const med = mediana(resto)
    if (p.primaAnualEur > med * FACTOR_DESVIACION || p.primaAnualEur * FACTOR_DESVIACION < med) {
      out.push({ codigo: 'desviacion_mediana', texto: `${nombre(p)}: ${eur(p.primaAnualEur)} se aleja más de ${FACTOR_DESVIACION}× de la mediana del resto (${eur(med)}).` })
    }
  }

  // 4. El MISMO importe (al céntimo) en compañías distintas: señal de que se leyó la misma pantalla dos veces.
  const porImporte = new Map<number, Set<string>>()
  for (const p of buenas) {
    const k = centimos(p.primaAnualEur)
    const s = porImporte.get(k) ?? new Set<string>()
    s.add(p.compania.trim())
    porImporte.set(k, s)
  }
  for (const [k, companias] of porImporte) {
    const distintas = [...new Map([...companias].map((c) => [c.toLowerCase(), c])).values()]
    if (distintas.length > 1) out.push({ codigo: 'precio_repetido', texto: `${eur(k / 100)} idéntico en ${distintas.join(', ')} (¿lectura repetida?).` })
  }

  // 5. Recibo × nº de recibos debe cuadrar con la prima anual (±TOLERANCIA).
  for (const p of buenas) {
    if (!p.fraccionamiento || p.importeReciboEur === null || !valida(p.importeReciboEur)) continue
    const n = RECIBOS_POR_ANIO[p.fraccionamiento]
    if (!n) continue
    const total = p.importeReciboEur * n
    if (Math.abs(total - p.primaAnualEur) / p.primaAnualEur > TOLERANCIA_FRACCIONADO) {
      out.push({ codigo: 'fraccionado_descuadrado', texto: `${nombre(p)}: ${n} recibos de ${eur(p.importeReciboEur)} (${eur(total)}) no cuadran con ${eur(p.primaAnualEur)}/año.` })
    }
  }

  // 6. Fecha de efecto ya pasada (sin fecha → no se sabe, no se avisa).
  if (riesgo.fechaEfecto && ISO.test(riesgo.fechaEfecto) && riesgo.fechaEfecto < opts.hoy) {
    out.push({ codigo: 'efecto_pasado', texto: `fecha de efecto ${fechaEs(riesgo.fechaEfecto)} ya pasada (hoy ${fechaEs(opts.hoy)}).` })
  }
  return out
}

/** La fecha de efecto MÁS TEMPRANA de los riesgos con que se tarificó (`riesgo.fechaEfecto`). `null` = ninguna consta. PURA. */
export function fechaEfectoDeRiesgos(riesgos: readonly unknown[]): string | null {
  const fechas = riesgos
    .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>).fechaEfecto : null))
    .filter((f): f is string => typeof f === 'string' && ISO.test(f))
    .sort()
  return fechas[0] ?? null
}

/** Máximo de líneas «⚠️ Revisar» en el Telegram (el resto se cuenta). */
export const MAX_LINEAS_REVISAR = 6

/** Las líneas del Telegram (texto plano: quien las pinte en HTML las escapa). */
export function lineasRevisar(avisos: readonly AvisoCoherencia[]): string[] {
  const textos = [...new Set(avisos.map((a) => a.texto))]
  const lineas = textos.slice(0, MAX_LINEAS_REVISAR).map((t) => `⚠️ Revisar: ${t}`)
  if (textos.length > MAX_LINEAS_REVISAR) lineas.push(`⚠️ Revisar: y ${textos.length - MAX_LINEAS_REVISAR} aviso(s) más en la oportunidad.`)
  return lineas
}
