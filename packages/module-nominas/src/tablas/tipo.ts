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
}

/** Tabla de un AÑO. Todo en céntimos (bases) y ppm (tipos). */
export interface TablaAnual {
  año: number
  /** Bases mensuales (céntimos/mes), grupos 1-7. */
  basesMensuales: Record<GrupoMensual, { min: Cifra<Centimos>; max: Cifra<Centimos> }>
  /** Bases diarias (céntimos/día), grupos 8-11: se multiplican por los días naturales del mes. */
  basesDiarias: Record<GrupoDiario, { min: Cifra<Centimos>; max: Cifra<Centimos> }>
  smi: { mensual: Cifra<Centimos>; anual: Cifra<Centimos> }
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
    /** Reparto empresa/trabajador del tipo de cada tramo (se aplica la proporción de contingencias comunes). */
    repartoComoCC: Cifra<boolean>
  }
}
