// Ayudas PURAS del presupuesto por garantías (29/09/2026): lo que convierte la lista de precios en
// algo que el cliente —y Alberto— entienden sin leer 30 filas.
//
//   · `garantiasDeNecesidades` → las garantías que el cliente PIDIÓ («quiero grúa y lunas»), para
//     dejar esos interruptores ya marcados al abrir el presupuesto.
//   · `capitalServicio`        → el capital del servicio de decesos, que viene dentro de un aviso.
//   · `cambiosFrenteActual`    → «+ asistencia, − lunas» respecto a la póliza que tiene hoy.
//   · `seguimientoPendiente`   → si toca avisar a Alberto de que el cliente no ha abierto o no ha elegido.
//
// 🚨 Las cuatro son conservadoras: ante la duda NO marcan, NO afirman una pérdida y NO avisan dos veces.

import { CATALOGO_GARANTIAS, claveCobertura, type GarantiasClasificadas, type RamoGarantias } from './catalogo-garantias.ts'

// ─── Necesidades → garantías ─────────────────────────────────────────────────

const NEGACION = /\b(no|sin|ni|nada de|tampoco)\b/

/**
 * Las claves del catálogo que el texto de necesidades PIDE. Se lee cláusula a cláusula y una cláusula
 * con negación («no necesito lunas», «sin franquicia») no marca nada: marcar lo que el cliente dijo
 * que NO quiere sería peor que no marcar. Es una preselección: el cliente la cambia con un toque.
 */
export function garantiasDeNecesidades(ramo: RamoGarantias, texto: string | null | undefined): string[] {
  if (!texto) return []
  const clausulas = texto.split(/[.,;:\n]|\bpero\b|\by\b/i).map(claveCobertura).filter(Boolean)
  const out = new Set<string>()
  for (const c of clausulas) {
    if (NEGACION.test(c)) continue
    for (const g of CATALOGO_GARANTIAS[ramo]) {
      if (g.patrones.some((p) => p.test(c)) && !(g.excluye ?? []).some((p) => p.test(c))) out.add(g.clave)
    }
  }
  return [...out]
}

// ─── Decesos: capital del servicio ───────────────────────────────────────────

/**
 * «Capital de servicio por asegurado: 3.600,00 €» (literal de Codeoscopic) → 3600. `null` = no viene o
 * no se entiende; nunca 0 (un capital que no se ha leído no es un capital de cero euros).
 */
export function capitalServicio(avisos: readonly string[] | null | undefined): number | null {
  for (const a of avisos ?? []) {
    const m = /capital (?:de|del) servicio[^0-9]*([\d.]+(?:,\d{1,2})?)/i.exec(a)
    if (!m) continue
    const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

// ─── Qué cambia frente a la póliza actual ────────────────────────────────────

export type CambiosFrenteActual = {
  /** Garantías que la opción INCLUYE y la actual dice NO incluir (o no trae). Etiquetas. */
  ganas: string[]
  /** Garantías que la actual incluye y la opción dice explícitamente NO incluir. */
  pierdes: string[]
  /** Garantías que la actual incluye y de la opción no consta: ni ganar ni perder, se dice aparte. */
  sinDato: string[]
}

/**
 * La diferencia de garantías entre una opción y la póliza actual. `null` si falta cualquiera de las dos
 * clasificaciones: sin la actual leída no hay nada con qué comparar, y decir «no pierdes nada» sobre una
 * póliza que no se ha leído sería inventarse la tranquilidad.
 * 🚨 «Pierdes» exige un `no` EXPLÍCITO de la opción: un `no_consta` va a `sinDato`, nunca a pérdida.
 */
export function cambiosFrenteActual(
  ramo: RamoGarantias,
  opcion: GarantiasClasificadas | null,
  actual: GarantiasClasificadas | null,
): CambiosFrenteActual | null {
  if (!opcion || !actual) return null
  const r: CambiosFrenteActual = { ganas: [], pierdes: [], sinDato: [] }
  for (const g of CATALOGO_GARANTIAS[ramo]) {
    const o = opcion.porClave[g.clave] ?? 'no_consta'
    const a = actual.porClave[g.clave] ?? 'no_consta'
    if (o === 'si' && a !== 'si') r.ganas.push(g.etiqueta)
    else if (a === 'si' && o === 'no') r.pierdes.push(g.etiqueta)
    else if (a === 'si' && o === 'no_consta') r.sinDato.push(g.etiqueta)
  }
  return r
}

// ─── Seguimiento: ¿toca avisar a Alberto? ────────────────────────────────────

export const HORAS_SIN_ABRIR = 48
export const HORAS_SIN_ELEGIR = 72

export type EtapaSeguimiento = 'sin_abrir' | 'sin_elegir'

export type PresupuestoParaSeguimiento = {
  enviadoAt: Date | null
  vistoAt: Date | null
  elegidoAt: Date | null
  aceptadoAt: Date | null
  retiradoAt: Date | null
  venceEl: Date
  /** Etapas de las que YA se avisó (eventos `seguimiento_avisado`). */
  avisadas: readonly EtapaSeguimiento[]
}

/**
 * La etapa de la que toca avisar ahora, o `null`. Un aviso por etapa y presupuesto, nunca dos.
 * Solo presupuestos que de verdad salieron (`enviadoAt`; un WhatsApp solo «enlazado» no consta como
 * enviado), vivos y sin decidir.
 * ⚠️ `vistoAt` NULL es «no consta que lo abriera», no «no lo abrió»: el aviso lo dice con esas palabras.
 */
export function seguimientoPendiente(p: PresupuestoParaSeguimiento, ahora: Date): EtapaSeguimiento | null {
  if (!p.enviadoAt || p.retiradoAt || p.aceptadoAt || p.elegidoAt) return null
  if (p.venceEl.getTime() <= ahora.getTime()) return null
  const horas = (desde: Date) => (ahora.getTime() - desde.getTime()) / 3_600_000
  if (!p.vistoAt) {
    return horas(p.enviadoAt) >= HORAS_SIN_ABRIR && !p.avisadas.includes('sin_abrir') ? 'sin_abrir' : null
  }
  return horas(p.vistoAt) >= HORAS_SIN_ELEGIR && !p.avisadas.includes('sin_elegir') ? 'sin_elegir' : null
}
