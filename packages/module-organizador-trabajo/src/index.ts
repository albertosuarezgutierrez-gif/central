// Organizador de Trabajo (casa de marcas) — entry point único. Lógica PURA:
// sin BD, sin secretos, sin LLM. Cada vertical normaliza sus filas a los puertos.

// Puertos y tipos de dominio
export type {
  Prioridad,
  EstadoTarea,
  Tarea,
  Trabajador,
  EstadoCarga,
  Asignacion,
  PlanAsignacion,
  TareaPlanificada,
  ParteTrabajo,
  ResumenTrabajador,
  Aviso,
  CargaPartida,
} from './types.ts'

// Señal de carga
export { estaOcioso } from './carga.ts'

// Planificación por caducidad
export { planificarPorCaducidad } from './planificar.ts'

// Asignación de trabajo
export { asignarTrabajo } from './asignar.ts'

// Siguiente tarea del trabajador ocioso (carga viva)
export { siguienteTarea } from './siguiente.ts'

// Partes de trabajo / tiempo imputado
export { construirParte, resumirPartes } from './partes.ts'

// Dependencias entre tareas (avisos encadenados entre partidas)
export { tareasDesbloqueadas, tareasBloqueadas, avisosAlCompletar } from './dependencias.ts'

// Partidas (frío / caliente / corte / montaje): carga por sección
export { agruparPorPartida } from './partidas.ts'

// Estimación de producción (croquetas → minutos), personal y previsión por día
export { estimarMinutosProduccion, personasNecesarias, personalPorDia } from './produccion.ts'
export type { LineaProduccion, CargaDia } from './produccion.ts'

// Estimación de compra con factor de holgura que aprende (±10%)
export { estimarCompra, aprenderFactor } from './compra.ts'
export type { AprendizajeCompra } from './compra.ts'

// Caducidad: FEFO de lotes y avisos de certificados (manipulador) a punto de vencer
export { ordenarPorCaducidad, proximosACaducar } from './caducidad.ts'
export type { ConCaducidad } from './caducidad.ts'

// Costes: costeo de elaboraciones/mermas/fondos y rentabilidad por evento
export { costearElaboracion, rentabilidadEvento } from './costes.ts'
export type {
  ElaboracionCosteable,
  CosteElaboracion,
  EntradaRentabilidad,
  RentabilidadEvento,
} from './costes.ts'
