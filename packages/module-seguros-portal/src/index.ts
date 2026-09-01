export { NIVELES, camposVisibles } from './acceso.ts'
export type { Nivel, CamposVisibles } from './acceso.ts'
export { PROCEDENCIAS, fiabilidad, etiquetaProcedencia, sePuedeAfirmar } from './procedencia.ts'
export type { Procedencia } from './procedencia.ts'
export { VALIDEZ_MINUTOS, MAX_INTENTOS, generarCodigo, estadoCodigo } from './codigo.ts'
export type { EstadoCodigo, CodigoGuardado } from './codigo.ts'
export {
  RAMOS_POLIZA,
  polizaLeidaVacia,
  normalizarPolizaLeida,
  seLeyoAlgo,
} from './poliza-leida.ts'
export type { RamoPoliza, PolizaLeida } from './poliza-leida.ts'
