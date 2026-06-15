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
