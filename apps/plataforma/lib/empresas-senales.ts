// Traduce una fila de enriquecimiento (empresas_enriquecimiento) a las SenalesFinancieras que consume
// el scoring. PURO (sin BD ni red) → testeable con `node --test`. Aplica los umbrales de Alberto.
import type { SenalesFinancieras } from './empresas-scoring'

// Fila tal cual la devuelve la BD (numeric → number|null; fechas → 'YYYY-MM-DD'|null).
export interface FilaEnriquecimiento {
  patrimonio_neto: number | null
  ebitda_n: number | null
  ebitda_n1: number | null
  fondo_maniobra: number | null
  ultimo_deposito: string | null
  incidencias_pago: boolean | null
  deuda_ebitda: number | null
  refinanciaciones: number | null
}

/** Umbral de "patrimonio neto muy cercano a cero" en €: por debajo de esto se considera señal. */
const PN_CASI_CERO = 1_000
/** Nº de refinanciaciones a partir del cual se considera "frecuentes". */
const REFIS_FRECUENTES = 2

/** Meses transcurridos desde una fecha 'YYYY-MM-DD' hasta `hoy` (fecha de referencia, inyectable para test). */
export function mesesDesde(fechaISO: string, hoy: Date): number {
  const [y, m, d] = fechaISO.split('-').map(Number)
  if (!y || !m) return 0
  const meses = (hoy.getUTCFullYear() - y) * 12 + (hoy.getUTCMonth() + 1 - m)
  // Ajuste fino por día del mes para no contar de más justo en el corte.
  return hoy.getUTCDate() < (d || 1) ? meses - 1 : meses
}

/** Convierte la fila de enriquecimiento en señales para `puntuarEmpresa`. `hoy` inyectable (default: ahora). */
export function enriquecimientoASenales(f: FilaEnriquecimiento, hoy = new Date()): SenalesFinancieras {
  const s: SenalesFinancieras = {}
  if (f.patrimonio_neto != null) s.patrimonioNetoNegativo = f.patrimonio_neto < PN_CASI_CERO
  if (f.ebitda_n != null && f.ebitda_n1 != null) s.ebitdaNegativo2Anios = f.ebitda_n < 0 && f.ebitda_n1 < 0
  if (f.fondo_maniobra != null) s.fondoManiobraNegativo = f.fondo_maniobra < 0
  if (f.ultimo_deposito) s.cuentasRetrasoMeses = mesesDesde(f.ultimo_deposito, hoy)
  if (f.incidencias_pago != null) s.incidenciasPago = f.incidencias_pago
  if (f.deuda_ebitda != null) s.deudaEbitda = f.deuda_ebitda
  if (f.refinanciaciones != null) s.refinanciacionesFrecuentes = f.refinanciaciones >= REFIS_FRECUENTES
  return s
}
