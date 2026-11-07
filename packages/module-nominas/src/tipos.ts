export type GrupoCotizacion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
export type TipoContrato = 'indefinido' | 'temporal' | 'parcial'
export type TipoIncidencia =
  | 'horas_extra'
  | 'ausencia_injustificada'
  | 'plus_puntual'
  | 'descuento'
  | 'baja_it'
  | 'vacaciones'

export interface ConceptoSalarial {
  nombre: string
  importe: number // euros (adaptador: el motor trabaja en céntimos)
}

export interface ContratoLaboral {
  tipoContrato: TipoContrato
  jornadaPct: number          // 100 = jornada completa
  salarioBase: number         // bruto mensual para jornada completa
  grupoCotizacion: GrupoCotizacion
  irpfRetencionPct: number    // % acordado (Modelo 145), ej. 15.5
  conceptosFijos: ConceptoSalarial[]
  /** 12 (por defecto, como antes) o 14 pagas. */
  pagas?: 12 | 14
  /** Con 14 pagas: extras prorrateadas en cada nómina. Por defecto false (se cobran en junio y diciembre). */
  prorrataExtras?: boolean
  /** Duración real. Con `tipoContrato: 'parcial'` y sin esto, el desempleo queda «no se sabe» (pendiente). */
  duracion?: 'indefinido' | 'temporal'
}

export interface IncidenciaMes {
  tipo: TipoIncidencia
  concepto: string
  importe?: number   // euros (plus_puntual, descuento)
  horas?: number     // horas extra
  dias?: number      // días de baja/ausencia
}

export interface DevengoLinea {
  concepto: string
  importe: number
}

export interface Devengos {
  salarioBase: number
  complementosFijos: DevengoLinea[]
  horasExtra: number
  prorrataExtras?: number
  pagaExtra?: number
  pluses: DevengoLinea[]
  descuentos: number    // importe total de deducciones salariales (positivo)
  total: number         // total devengado bruto
}

export interface DeduccionesEmpleado {
  contingencias_comunes: number
  desempleo: number
  fp: number
  mei?: number
  solidaridad?: number
  irpf: number
  total: number
}

export interface CuotaPatronal {
  contingencias_comunes: number
  desempleo: number
  fogasa: number
  fp: number
  at_ep: number
  mei?: number
  solidaridad?: number
  total: number
}

export interface NominaDesglose {
  periodo: string           // "2026-06"
  devengos: Devengos
  baseCotizacion: number
  baseIrpf: number
  deducciones: DeduccionesEmpleado
  netoAPagar: number
  cuotaPatronal: CuotaPatronal
  costeTotalEmpresa: number // devengos.total + cuotaPatronal.total
  /** N0 (05/11/2026). Ausentes en borradores anteriores = «no se sabe» con qué tablas se calcularon. */
  baseContingenciasProfesionales?: number
  tablasAño?: number
  modo?: 'calculo' | 'simulacion'
  cifrasPendientes?: string[]
  avisos?: string[]
  /** Retención por el algoritmo AEAT: tipo (%, 2 decimales) y motivo. null = % plano del contrato; ausente = borrador anterior. */
  irpfAlgoritmo?: { tipoPct: number; motivo: string } | null
}
