import type { Cifra } from '../cifras'
import type { Centimos, Ppm } from '../dinero'

export type GrupoMensual = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type GrupoDiario = 8 | 9 | 10 | 11

export interface ParTipos {
  empresa: Cifra<Ppm>
  trabajador: Cifra<Ppm>
}

export interface TramoSolidaridad {
  /** Límite superior del tramo como % de exceso sobre la base máxima (10 → hasta +10 %); null = sin límite. */
  hastaPctSobreMax: number | null
  /** Tipo TOTAL (empresa + trabajador) del tramo. */
  tipo: Cifra<Ppm>
  /** Reparto que fija la Orden de cotización para el tramo (2026: art. 17.1). Sin él se usa `repartoComoCC`. */
  reparto?: ParTipos
}

/** Tabla de un AÑO. Todo en céntimos (bases) y ppm (tipos). */
export interface TablaAnual {
  año: number
  /** Bases mensuales (céntimos/mes), grupos 1-7. */
  basesMensuales: Record<GrupoMensual, { min: Cifra<Centimos>; max: Cifra<Centimos> }>
  /** Bases diarias (céntimos/día), grupos 8-11: se multiplican por los días naturales del mes. */
  basesDiarias: Record<GrupoDiario, { min: Cifra<Centimos>; max: Cifra<Centimos> }>
  smi: { mensual: Cifra<Centimos>; anual: Cifra<Centimos> }
  /** Tope mínimo de la base de AT/EP (y de desempleo, FOGASA y FP), mensual, jornada completa, grupos 1-7. */
  topeMinimoCP: Cifra<Centimos>
  /** Tiempo parcial: base mínima POR HORA trabajada (CC por grupo; AT/EP-desempleo-FOGASA-FP única). */
  parcial: { minimoHoraCC: Record<GrupoMensual | GrupoDiario, Cifra<Centimos>>; minimoHoraCP: Cifra<Centimos> }
  tipos: {
    contingenciasComunes: ParTipos
    desempleoIndefinido: ParTipos
    desempleoTemporal: ParTipos
    fogasa: Cifra<Ppm> // solo empresa
    fp: ParTipos
    /** Mecanismo de Equidad Intergeneracional: sobre la base de contingencias comunes. */
    mei: { total: Cifra<Ppm> } & ParTipos
  }
  /** Cotización adicional de solidaridad: sobre la retribución que excede la base máxima. */
  solidaridad: {
    tramos: TramoSolidaridad[]
    /** Reparto empresa/trabajador por la proporción de contingencias comunes, para tramos sin `reparto` propio. */
    repartoComoCC?: Cifra<boolean>
  }
}
