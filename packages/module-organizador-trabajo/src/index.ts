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

// Estimación de producción (croquetas → minutos) y personal necesario
export { estimarMinutosProduccion, personasNecesarias } from './produccion.ts'
export type { LineaProduccion } from './produccion.ts'

// Estimación de compra con factor de holgura que aprende (±10%)
export { estimarCompra, aprenderFactor } from './compra.ts'
export type { AprendizajeCompra } from './compra.ts'
