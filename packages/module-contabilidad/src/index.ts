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

// Núcleo de DOBLE PARTIDA (partida): dinero en céntimos, plan de cuentas, asientos, hechos→asientos, libros.
export * from './partida/index.ts'

// ── F2: análisis (KPI, series, previsión, rentabilidad por dimensión, antigüedad), plantillas de sector y avisos ──
export * from './analisis/periodos.ts'
export * from './analisis/kpis.ts'
export * from './analisis/gastos.ts'
export * from './analisis/series.ts'
export * from './analisis/antiguedad.ts'
export * from './analisis/prevision.ts'
export * from './analisis/dimensiones.ts'
export * from './plantillas/plantillas.ts'
export * from './plantillas/reglas.ts'
export * from './avisos/fiscal.ts'
export * from './avisos/motor.ts'
export * from './analisis/medios.ts'

// ── F3: CNAE → plantilla, facturas recibidas (compras) ──
export * from './plantillas/cnae.ts'
export * from './compras/compras.ts'
