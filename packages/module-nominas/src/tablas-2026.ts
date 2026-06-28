import type { TablasCotizacion, GrupoCotizacion, BaseCotizacion } from './tipos'

// Bases de cotización SS 2026 (BOE — actualizar cada año con nueva LPGE)
// Grupos 1-7: euros/mes. Grupos 8-11: euros/día.
const BASES_2026: Record<GrupoCotizacion, BaseCotizacion> = {
  1:  { min: 1847.40, max: 4909.50 },
  2:  { min: 1531.80, max: 4909.50 },
  3:  { min: 1332.90, max: 4909.50 },
  4:  { min: 1184.10, max: 4909.50 },
  5:  { min: 1184.10, max: 4909.50 },
  6:  { min: 1184.10, max: 4909.50 },
  7:  { min: 1184.10, max: 4909.50 },
  8:  { min:   39.47, max:  163.65 }, // diario
  9:  { min:   39.47, max:  163.65 },
  10: { min:   39.47, max:  163.65 },
  11: { min:   39.47, max:  163.65 },
}

/**
 * Devuelve las TablasCotizacion para 2026 con el tipo AT/EP específico de la empresa.
 * El parámetro atEp viene de rrhh.empresas.at_ep_tipo (resuelto por CNAE via at-ep-agente).
 */
export function tablas2026(atEp: number, diasLaborablesMes = 22): TablasCotizacion {
  return {
    año: 2026,
    bases: BASES_2026,
    tipos: {
      contingencias_comunes: { empresa: 0.236, trabajador: 0.047 },
      desempleo_indefinido:  { empresa: 0.055, trabajador: 0.0155 },
      desempleo_temporal:    { empresa: 0.067, trabajador: 0.016 },
      fogasa: 0.002,
      fp:     { empresa: 0.006, trabajador: 0.001 },
      at_ep:  atEp,
    },
    smi: 1184.10,
    diasLaborablesMes,
  }
}
