// Tipos (PORT del módulo — cada vertical normaliza sus filas a Apunte)
export type {
  TipoApunte,
  PeriodicidadRecurrente,
  Apunte,
  ResultadoMensual,
  IVATrimestral,
  ResumenTesoreria,
  RentabilidadEntidad,
  PlantillaRecurrente,
} from './types'

// IVA
export { round2, calcularCuotaIva, calcularTotal, calcularIVA } from './iva'

// Resultado / PyG
export { calcularPyG } from './pyg'

// Tesorería
export { calcularTesoreria } from './tesoreria'

// Rentabilidad por entidad
export { calcularRentabilidad } from './rentabilidad'

// Recurrentes
export { generarFechasRecurrente } from './recurrentes'
