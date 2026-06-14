// PORT del módulo de Control Horario. Cada vertical normaliza sus turnos a TurnoFichaje.
// El módulo es PURO: no consulta BD, solo recibe filas ya normalizadas.

export interface TurnoFichaje {
  camarero_id: string | null
  camarero_nombre: string | null
  fecha: string                 // 'YYYY-MM-DD' (día de la jornada)
  entrada_at: string            // ISO timestamp (clock-in)
  salida_at: string | null      // ISO timestamp (clock-out); null = turno activo → se excluye del cómputo
  horas_totales: number | null  // si viene calculado de BD se usa; si no, se calcula salida-entrada
  tipo: string                  // 'normal' | 'extra' | 'partido' | ...
}

// Límites legales/configurables por local (RD 8/2019 + convenio). Defaults en LIMITES_DEFECTO.
export interface LimitesJornada {
  jornada_max_diaria: number          // h/día
  jornada_max_semanal: number         // h/semana
  descanso_min_entre_jornadas: number // h entre fin de una jornada y el inicio de la siguiente
  descanso_semanal_horas: number      // h de descanso semanal ininterrumpido
  tope_extra_anual: number            // h extra/año (tope legal 80)
}

export interface ExcesoJornada {
  tipo: 'dia' | 'semana'
  clave: string                 // fecha 'YYYY-MM-DD' (día) o 'YYYY-Www' (semana ISO)
  horas: number
  limite: number
}

export interface ResumenJornadaEmpleado {
  camarero_id: string | null
  camarero_nombre: string | null
  dias_trabajados: number
  horas_totales: number
  media_diaria: number
  horas_por_semana: Record<string, number> // 'YYYY-Www' → horas
  excesos: ExcesoJornada[]
}

export interface AvisoDescanso {
  camarero_id: string | null
  camarero_nombre: string | null
  tipo: 'entre_jornadas' | 'semanal'
  fecha: string                 // fecha del turno cuyo descanso previo incumple
  horas: number                 // descanso real (h)
  minimo: number                // descanso mínimo exigido (h)
}

export interface ResumenHorasExtra {
  camarero_id: string | null
  camarero_nombre: string | null
  horas_extra: number
  tope_anual: number
  supera_tope: boolean
}

export interface PuntoSerieJornada { fecha: string; horas: number }
