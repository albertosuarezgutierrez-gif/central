// Productividad por compañía frente a los acuerdos (fase 2, 06/10/2026).
// Spec: docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md §3.
//
// Dos preguntas, puras (asegura lee los recibos y se los pasa):
//   1. ¿Cuánto se ha producido con cada compañía en el periodo?  → `produccionPorCompania`
//   2. ¿Cómo va cada objetivo del acuerdo?                        → `evaluarObjetivo`
//
// 🚨 Un objetivo solo tiene color si TODO lo que lo decide se sabe. Si falta la
// clave, el acuerdo está sin cotejar, el objetivo es colectivo, la base no es
// medible, los tramos no se leen o hay recibos que no se pueden atribuir, sale
// `pendiente` con su motivo. Nunca 🟢 por defecto, y nunca un 0 € que en
// realidad es «no lo sé» (regla raíz «dato que NO hay ≠ dato que NO se ha
// mirado»). La producción tampoco: una suma sin recibos detrás se devuelve con
// `recibos: 0`, que la pantalla pinta «sin recibos», no «0,00€».

import { importeEiac } from './importe-eiac.ts'
import {
  atribuirClave,
  type ClaveParaAtribuir,
  type LecturaTramos,
  type Tramo,
} from './acuerdos.ts'

/** Un recibo de CIMA tal como lo necesita el cálculo. Los importes, en TEXTO EIAC (se leen con `importeEiac`). */
export type ReciboProduccion = {
  polizaId: string
  companiaCodigoDgs: string
  /** `clase_recibo`: NP (nueva producción) · CA (cartera) · SU (suplemento)… */
  clase: string | null
  /** `situacion`: cobrado · pendiente · devuelto · anulado · emitido. */
  situacion: string | null
  /** Fecha de efecto 'YYYY-MM-DD'. */
  fechaEfecto: string | null
  primaNeta: string | null
  comisionBruta: string | null
  /** `polizas.tipo` */
  ramo: string | null
  /** `datos_extra.mediador.codigoInterno` del recibo. */
  codigoRecibo: unknown
  /** `datos_especificos.mediador.codigoInterno` de la póliza. */
  codigoPoliza: unknown
}

/** Una suma con lo que tiene detrás. `recibos: 0` = no hay recibos que sumar (≠ «suman 0 €»). */
export type Suma = { importe: number; recibos: number; ilegibles: number }

const SUMA_VACIA = (): Suma => ({ importe: 0, recibos: 0, ilegibles: 0 })

function sumar(s: Suma, texto: string | null): void {
  s.recibos++
  const n = importeEiac(texto)
  if (n === null) s.ilegibles++
  else s.importe = Math.round((s.importe + n) * 100) / 100
}

function claseDe(r: ReciboProduccion): string | null {
  return typeof r.clase === 'string' ? r.clase.trim().toUpperCase() : null
}

function enPeriodo(fecha: string | null, desde: string, hasta: string): boolean {
  if (typeof fecha !== 'string') return false
  const f = fecha.slice(0, 10)
  return f >= desde && f <= hasta
}

export type ProduccionCompania = {
  companiaCodigoDgs: string
  /** Prima neta de recibos NP cobrados con efecto en el periodo. */
  npCobrada: Suma
  /** Prima neta de recibos NP aún pendientes de cobro (en cobro, no producción cerrada). */
  npPendiente: Suma
  /** Prima neta de recibos CA cobrados. */
  carteraCobrada: Suma
  /** Comisión bruta que CIMA dice que la compañía ha aplicado en esos NP+CA cobrados. */
  comisionAplicada: Suma
  /** Pólizas distintas con recibo NP cobrado. */
  polizasNp: number
  /** Recibos del periodo sin fecha de efecto: no se pueden colocar en ningún periodo. */
  sinFecha: number
}

/**
 * Producción por compañía en `[desde, hasta]` (fechas de EFECTO, bordes
 * incluidos). Una compañía sin ningún recibo en el periodo NO aparece: la
 * pantalla distingue «no hay recibos» (lista sin ella) de «hay recibos que
 * suman X».
 */
export function produccionPorCompania(
  recibos: readonly ReciboProduccion[],
  periodo: { desde: string; hasta: string },
): ProduccionCompania[] {
  const mapa = new Map<string, ProduccionCompania & { _polizas: Set<string> }>()
  for (const r of recibos) {
    const p = mapa.get(r.companiaCodigoDgs) ?? {
      companiaCodigoDgs: r.companiaCodigoDgs,
      npCobrada: SUMA_VACIA(), npPendiente: SUMA_VACIA(), carteraCobrada: SUMA_VACIA(),
      comisionAplicada: SUMA_VACIA(), polizasNp: 0, sinFecha: 0, _polizas: new Set<string>(),
    }
    mapa.set(r.companiaCodigoDgs, p)
    if (typeof r.fechaEfecto !== 'string') { p.sinFecha++; continue }
    if (!enPeriodo(r.fechaEfecto, periodo.desde, periodo.hasta)) continue
    const clase = claseDe(r)
    if (clase === 'NP' && r.situacion === 'cobrado') {
      sumar(p.npCobrada, r.primaNeta)
      sumar(p.comisionAplicada, r.comisionBruta)
      p._polizas.add(r.polizaId)
    } else if (clase === 'NP' && r.situacion === 'pendiente') {
      sumar(p.npPendiente, r.primaNeta)
    } else if (clase === 'CA' && r.situacion === 'cobrado') {
      sumar(p.carteraCobrada, r.primaNeta)
      sumar(p.comisionAplicada, r.comisionBruta)
    }
  }
  return [...mapa.values()]
    .map(({ _polizas, ...p }) => ({ ...p, polizasNp: _polizas.size }))
    .filter((p) => p.npCobrada.recibos + p.npPendiente.recibos + p.carteraCobrada.recibos + p.sinFecha > 0)
    .sort((a, b) => a.companiaCodigoDgs.localeCompare(b.companiaCodigoDgs))
}

// ─── Objetivos ───────────────────────────────────────────────────────────────

export type MotivoPendiente =
  | 'sin_clave'
  | 'sin_cotejar'
  | 'colectivo'
  | 'base_no_calculable'
  | 'valor_fuera_de_lista'
  | 'siniestralidad'
  | 'tramos_ilegibles'
  | 'sin_tramos'
  | 'periodo_sin_empezar'
  | 'lectura_incompleta'
  | 'recibos_sin_atribuir'
  | 'importes_ilegibles'
  | 'pronto_para_proyectar'

export const TEXTO_PENDIENTE: Record<MotivoPendiente, string> = {
  sin_clave: 'Sin clave asignada: no se sabe qué producción cuenta para este acuerdo.',
  sin_cotejar: 'Acuerdo sin cotejar con el documento original: no se da por bueno ningún resultado.',
  colectivo: 'Depende de la producción de toda la asociación, no solo de la tuya.',
  base_no_calculable: 'La base de este objetivo no se puede medir con los datos de CIMA.',
  valor_fuera_de_lista: 'El objetivo tiene un valor que no se reconoce: revísalo.',
  siniestralidad: 'Exige una siniestralidad máxima, y CIMA no manda el importe de los siniestros.',
  tramos_ilegibles: 'Los tramos del objetivo no tienen una forma legible.',
  sin_tramos: 'El objetivo no tiene tramos estructurados (solo texto).',
  periodo_sin_empezar: 'El periodo del objetivo aún no ha empezado.',
  lectura_incompleta: 'La lectura de recibos llegó a su techo: la producción está incompleta.',
  recibos_sin_atribuir: 'Hay recibos de esta compañía que no se pueden atribuir a ninguna clave.',
  importes_ilegibles: 'Hay recibos con una prima que no se puede leer.',
  pronto_para_proyectar: 'Menos de 30 días de periodo: aún no se puede proyectar.',
}

export type ColorObjetivo = 'alcanzado' | 'en_camino' | 'por_debajo' | 'no_llega'

export type EstadoObjetivo =
  | { color: 'pendiente'; motivo: MotivoPendiente; detalle: string | null; medido: number | null }
  | {
      color: ColorObjetivo
      /** Lo producido en la base del objetivo (€ o nº de pólizas). */
      medido: number
      /** «A este ritmo», lineal. `null` con el periodo ya cerrado. */
      proyectado: number | null
      umbral: number
      tramoAlcanzado: Tramo | null
      siguiente: Tramo | null
      /** Lo que falta para el siguiente tramo. */
      falta: number | null
      /** Rappel del tramo alcanzado (`null` = no se puede estimar: sin %, o base en pólizas). */
      rappelEstimado: number | null
      diasRestantes: number
    }

export type ObjetivoParaEvaluar = {
  tipo: string | null
  ambito: string | null
  base: string | null
  criterioCobro: string | null
  ramos: readonly string[]
  periodoDesde: string
  periodoHasta: string
  tramos: LecturaTramos
  siniestralidadMaxPct: number | null
}

/** Días por debajo de los cuales una proyección lineal no se hace (todo es ruido). */
export const DIAS_MINIMOS_PROYECCION = 30
/** Con menos días restantes que estos, «no llega» deja de ser «por debajo del ritmo». */
export const DIAS_ALERTA = 90

const DIA = 86_400_000
const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)

/**
 * ¿Cómo va un objetivo? `recibos` son los de ESA compañía (cualquier periodo:
 * aquí se filtran). `completo = false` si la lectura tocó su techo.
 */
export function evaluarObjetivo(e: {
  acuerdo: { claveId: string | null; revisado: boolean }
  objetivo: ObjetivoParaEvaluar
  recibos: readonly ReciboProduccion[]
  claves: readonly ClaveParaAtribuir[]
  hoy: string
  completo: boolean
}): EstadoObjetivo {
  const o = e.objetivo
  const pendiente = (motivo: MotivoPendiente, detalle: string | null = null, medido: number | null = null): EstadoObjetivo =>
    ({ color: 'pendiente', motivo, detalle, medido })

  if (e.acuerdo.claveId === null) return pendiente('sin_clave')
  if (!e.acuerdo.revisado) return pendiente('sin_cotejar')
  if (o.tipo === null || o.ambito === null || o.base === null) return pendiente('valor_fuera_de_lista')
  if (o.ambito === 'colectivo') return pendiente('colectivo')
  if (o.base === 'otra' || o.base === 'crecimiento_pct') return pendiente('base_no_calculable')
  if (o.siniestralidadMaxPct !== null) return pendiente('siniestralidad')
  if (o.tramos.estado !== 'ok') return pendiente('tramos_ilegibles', o.tramos.motivo)
  const tramos = o.tramos.tramos
  if (tramos.length === 0) return pendiente('sin_tramos')
  if (e.hoy < o.periodoDesde) return pendiente('periodo_sin_empezar')
  if (!e.completo) return pendiente('lectura_incompleta')

  const delPeriodo = e.recibos.filter((r) => enPeriodo(r.fechaEfecto, o.periodoDesde, o.periodoHasta))
  let sinAtribuir = 0
  const deLaClave = delPeriodo.filter((r) => {
    const a = atribuirClave({ companiaCodigoDgs: r.companiaCodigoDgs, codigoRecibo: r.codigoRecibo, codigoPoliza: r.codigoPoliza }, e.claves)
    if (a.estado !== 'clave') { sinAtribuir++; return false }
    return a.claveId === e.acuerdo.claveId
  })
  if (sinAtribuir > 0) return pendiente('recibos_sin_atribuir', `${sinAtribuir} recibo(s)`)

  const situaciones = o.criterioCobro === 'emitidas' ? ['cobrado', 'pendiente'] : ['cobrado']
  const clases = o.base === 'primas_np' || o.base === 'polizas_np' ? ['NP'] : o.base === 'primas_cartera' ? ['CA'] : ['NP', 'CA']
  const cuentan = deLaClave.filter((r) =>
    r.situacion !== null && situaciones.includes(r.situacion) &&
    clases.includes(claseDe(r) ?? '') &&
    (o.ramos.length === 0 || (r.ramo !== null && o.ramos.includes(r.ramo))),
  )

  let medido: number
  if (o.base === 'polizas_np') {
    medido = new Set(cuentan.map((r) => r.polizaId)).size
  } else {
    const s = SUMA_VACIA()
    for (const r of cuentan) sumar(s, r.primaNeta)
    if (s.ilegibles > 0) return pendiente('importes_ilegibles', `${s.ilegibles} recibo(s)`, s.importe)
    medido = s.importe
  }

  const conPago = tramos.find((t) => (t.pct ?? 0) > 0 || (t.importe ?? 0) > 0)
  const umbral = o.tipo === 'rappel'
    ? (conPago ?? tramos[0]).desde
    : (tramos.find((t) => t.desde > 0) ?? tramos[0]).desde

  const tramoAlcanzado = [...tramos].reverse().find((t) => medido >= t.desde) ?? null
  const siguiente = tramos.find((t) => t.desde > medido) ?? null
  const falta = siguiente ? Math.round((siguiente.desde - medido) * 100) / 100 : null
  let rappelEstimado: number | null = null
  if (o.tipo === 'rappel' && tramoAlcanzado) {
    if (tramoAlcanzado.importe !== null) rappelEstimado = tramoAlcanzado.importe
    else if (tramoAlcanzado.pct !== null && o.base !== 'polizas_np') rappelEstimado = Math.round(medido * tramoAlcanzado.pct) / 100
  }

  const inicio = ms(o.periodoDesde)
  const fin = ms(o.periodoHasta) + DIA
  const ahora = Math.min(ms(e.hoy) + DIA, fin)
  const diasTotales = Math.round((fin - inicio) / DIA)
  const diasPasados = Math.round((ahora - inicio) / DIA)
  const diasRestantes = Math.max(0, diasTotales - diasPasados)
  const cerrado = diasRestantes === 0
  const proyectado = cerrado ? null : diasPasados >= DIAS_MINIMOS_PROYECCION
    ? Math.round((medido * diasTotales / diasPasados) * 100) / 100
    : null

  const base = { medido, proyectado, umbral, tramoAlcanzado, siguiente, falta, rappelEstimado, diasRestantes }
  if (medido >= umbral) return { color: 'alcanzado', ...base }
  if (cerrado) return { color: 'no_llega', ...base }
  if (proyectado === null) return pendiente('pronto_para_proyectar', null, medido)
  if (proyectado >= umbral) return { color: 'en_camino', ...base }
  return { color: diasRestantes > DIAS_ALERTA ? 'por_debajo' : 'no_llega', ...base }
}

/**
 * ¿Es un CÓDIGO de producto de la compañía (lo que CIMA trae en `ramoEntidad`:
 * '1434', '01480', 'HR', '302') y no un nombre comercial («Hogar Plus», «Autos
 * nuevo producto / Patinetes»)? Solo los códigos se pueden cruzar con los
 * recibos; un nombre comercial queda fuera del cruce hasta que se le asigne
 * su código (fase 5). Criterio: sin espacios, ≤ 12 caracteres, solo letras,
 * cifras y `./-`.
 */
export function esCodigoProducto(v: unknown): boolean {
  return typeof v === 'string' && /^[0-9A-Za-z./-]{1,12}$/.test(v.trim()) && v.trim() === v
}
