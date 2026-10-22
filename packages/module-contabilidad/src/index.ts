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
  MovimientoCaja,
  CuadreCaja,
  CuadreEmpleado,
  FilaArqueoEmpleado,
  ResumenDescuadreEmpleado,
  PuntoSerieDescuadre,
} from './types.ts'

// IVA
export { round2, calcularCuotaIva, calcularTotal, calcularIVA } from './iva.ts'

// Resultado / PyG
export { calcularPyG } from './pyg.ts'

// Tesorería
export { calcularTesoreria } from './tesoreria.ts'

// Cuadre / arqueo de caja
export {
  calcularCuadreCaja, calcularCuadrePorEmpleado, totalDesglose, DENOMINACIONES_EUR,
  resumirDescuadresEmpleado, detectarPatronRecurrente, serieDescuadreEmpleado,
} from './caja.ts'
export type { OpcionesCuadre } from './caja.ts'

// Rentabilidad por entidad
export { calcularRentabilidad } from './rentabilidad.ts'

// Recurrentes
export { generarFechasRecurrente } from './recurrentes.ts'
