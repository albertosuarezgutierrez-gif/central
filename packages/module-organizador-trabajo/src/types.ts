// PUERTOS del Organizador de Trabajo. Cada vertical normaliza sus filas a estos tipos.
// El módulo es PURO: no consulta BD, solo recibe estructuras ya normalizadas.

export type Prioridad = 'urgente' | 'alta' | 'normal' | 'baja'
export type EstadoTarea = 'pendiente' | 'en_proceso' | 'hecha'

/** Una unidad de trabajo: una elaboración de cocina, una tarea operativa de sala, una limpieza… */
export interface Tarea {
  id: string
  nombre: string
  tipo: string                     // 'elaboracion' | 'operativa' | 'limpieza' | ...
  duracion_estimada_min: number    // tiempo estimado (escandallo / catalogo_tarifas.tiempo_min)
  prioridad: Prioridad
  vence_at?: string | null         // ISO 8601: cuándo debe estar HECHA (caducidad / "listo para")
  requiere_rol?: string | null     // rol/capacidad requerida; null/ausente = cualquiera la puede hacer
  estado?: EstadoTarea             // ausente = se trata como 'pendiente'
  depende_de?: string[]            // ids de tareas que deben estar HECHAS antes (avisos encadenados)
}

/** Aviso de que una tarea ha quedado lista para empezar (un prerequisito se completó). */
export interface Aviso {
  tarea_id: string
  nombre: string
  desbloqueada_por: string         // id de la tarea recién completada que la destrabó
  mensaje: string
}

/** Quien ejecuta el trabajo: cocinero, camarero, limpiadora… */
export interface Trabajador {
  id: string
  nombre: string
  rol: string                      // 'cocinero' | 'camarero' | 'limpiadora' | ...
  disponible: boolean              // fichado/activo AHORA
  roles?: string[]                 // capacidades extra (qué `requiere_rol` puede cubrir además del suyo)
}

/** Señal de carga viva. `nivel` = carga actual (p.ej. nº de comandas abiertas u horas en cola). */
export interface EstadoCarga {
  nivel: number
  umbral_ocioso: number            // nivel <= umbral_ocioso → el trabajador está "ocioso"
}

export interface Asignacion {
  trabajador_id: string
  tarea_id: string
}

export interface PlanAsignacion {
  asignaciones: Asignacion[]
  sin_asignar: string[]                            // ids de tareas que nadie pudo coger
  minutos_por_trabajador: Record<string, number>   // tiempo imputado por trabajador
}

export interface TareaPlanificada {
  tarea_id: string
  empezar_antes_de: string | null  // ISO = vence_at − duracion_estimada; null si la tarea no vence
  holgura_min: number | null       // minutos desde "ahora" hasta empezar_antes_de; null si no vence
  en_riesgo: boolean               // holgura < 0 → no llega a tiempo
}

export interface ParteTrabajo {
  trabajador_id: string
  tarea_id: string
  concepto: string
  minutos_estimados: number
  minutos_reales: number | null
  desviacion_min: number | null    // minutos_reales − minutos_estimados (null si no hay real)
}

export interface ResumenTrabajador {
  trabajador_id: string
  tareas: number
  minutos_estimados: number
  minutos_reales: number
}
