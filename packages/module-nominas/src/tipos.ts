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
  importe: number // euros
}

export interface ContratoLaboral {
  tipoContrato: TipoContrato
  jornadaPct: number          // 100 = jornada completa
  salarioBase: number         // bruto mensual para jornada completa
  grupoCotizacion: GrupoCotizacion
  irpfRetencionPct: number    // % acordado (Modelo 145), ej. 15.5
  conceptosFijos: ConceptoSalarial[]
}

export interface IncidenciaMes {
  tipo: TipoIncidencia
  concepto: string
  importe?: number   // euros (plus_puntual, descuento)
  horas?: number     // horas extra
  dias?: number      // días de baja/ausencia
}

export interface TiposCotizacion {
  contingencias_comunes: { empresa: number; trabajador: number }
  desempleo_indefinido:  { empresa: number; trabajador: number }
  desempleo_temporal:    { empresa: number; trabajador: number }
  fogasa: number
  fp:     { empresa: number; trabajador: number }
  at_ep:  number // específico por CNAE de la empresa
}

export interface BaseCotizacion {
  min: number // euros/mes (grupos 1-7) o euros/día (grupos 8-11)
  max: number
}

export interface TablasCotizacion {
  año: number
  bases: Record<GrupoCotizacion, BaseCotizacion>
  tipos: TiposCotizacion
  smi: number        // salario mínimo interprofesional mensual
  diasLaborablesMes: number // días laborables del mes (para proporcionar bajas/ausencias)
}

export interface DevengoLinea {
  concepto: string
  importe: number
}

export interface Devengos {
  salarioBase: number
  complementosFijos: DevengoLinea[]
  horasExtra: number
  pluses: DevengoLinea[]
  descuentos: number    // importe total de deducciones salariales (positivo)
  total: number         // total devengado bruto
}

export interface DeduccionesEmpleado {
  contingencias_comunes: number
  desempleo: number
  fp: number
  irpf: number
  total: number
}

export interface CuotaPatronal {
  contingencias_comunes: number
  desempleo: number
  fogasa: number
  fp: number
  at_ep: number
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
}
