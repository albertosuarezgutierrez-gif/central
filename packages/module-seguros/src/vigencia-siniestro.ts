// ────────────────────────────────────────────────────────────────────────────
// ¿Sigue vivo un siniestro «abierto»? Regla de LECTURA (no escribe nada).
//
// `seguros.siniestros.estado` es DEFAULT 'abierto' y CIMA casi nunca lo cierra:
// un «abierto» que nadie ha movido en meses NO es «abierto confirmado», es «no
// sabemos». Pintarlo como abierto/en tramitación mete ruido (cabecera ámbar,
// aviso de seguimiento) y, peor, afirma algo que nadie ha comprobado.
//
// Tres estados, y NUNCA se inventa «cerrado»:
//   · 'abierto'       → abierto con movimiento reciente (o a mano: no caduca).
//   · 'sin_confirmar' → abierto pero sin movimiento más allá del umbral, o sin
//                       ninguna fecha con la que juzgarlo. Se muestra aparte
//                       («sin confirmar con la compañía») y NO suma a abiertos.
//   · 'cerrado'       → cerrado o rechazado, tal cual lo dice el estado.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Días sin movimiento a partir de los cuales un abierto deja de estar
 * «confirmado». 180 = seis meses: un siniestro de daños con tramitación real
 * mueve algo (perito, pago, situación) bastante antes; pasado ese plazo el
 * «abierto» es casi siempre un cierre que la compañía no nos ha mandado.
 */
export const DIAS_SIN_MOVIMIENTO_ABIERTO = 180

/**
 * Umbral corto para Asistencia (grupo 11 de la tipología EIAC: 1102, 1104,
 * 1107…): grúa, auxilio en carretera, etc. Se resuelven en horas o días; un
 * «abierto» de asistencia con dos meses sin tocar casi seguro está terminado.
 */
export const DIAS_SIN_MOVIMIENTO_ASISTENCIA = 60

/** Prefijo EIAC del grupo Asistencia. */
export const PREFIJO_TIPO_ASISTENCIA = '11'

export type VigenciaSiniestro = 'abierto' | 'sin_confirmar' | 'cerrado'

export interface SiniestroParaVigencia {
  estado: string
  /** Tipología EIAC (`1102`…). `null` = no consta. */
  tipo?: string | null
  /** `'cima'` | `'gestionado_correduria'`. */
  origen?: string | null
  /** Ocurrencia. */
  fechaHora?: Date | string | null
  fechaDeclaracion?: Date | string | null
  /** jsonb de CIMA: `[{ fecha, codigo, descripcion }]`. */
  situacionesCima?: unknown
  /** jsonb de CIMA: `[{ fecha, accion, … }]`. */
  accionesCima?: unknown
  /** jsonb de CIMA: `[{ fecha, importe, … }]`. */
  pagosCima?: unknown
}

const MS_DIA = 86_400_000

function aMs(v: unknown): number | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime()
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) {
    const t = v.trim()
    const ms = Date.parse(t.length === 10 ? `${t}T00:00:00Z` : t)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

function fechasDeLista(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  const out: number[] = []
  for (const e of v) {
    if (e && typeof e === 'object') {
      const t = aMs((e as Record<string, unknown>).fecha)
      if (t !== null) out.push(t)
    }
  }
  return out
}

/** Fecha (ms) del último movimiento conocido, o `null` si no hay ninguna. */
export function ultimoMovimientoSiniestro(s: SiniestroParaVigencia): number | null {
  const todas = [
    ...fechasDeLista(s.situacionesCima),
    ...fechasDeLista(s.accionesCima),
    ...fechasDeLista(s.pagosCima),
    aMs(s.fechaDeclaracion),
    aMs(s.fechaHora),
  ].filter((t): t is number => t !== null)
  return todas.length === 0 ? null : Math.max(...todas)
}

/** ¿Es del grupo 11 (Asistencia)? */
export function esTipoAsistencia(tipo: string | null | undefined): boolean {
  return typeof tipo === 'string' && tipo.trim().startsWith(PREFIJO_TIPO_ASISTENCIA)
}

/** `hoy` se inyecta: nada de reloj real aquí. */
export function vigenciaSiniestro(s: SiniestroParaVigencia, hoy: Date): VigenciaSiniestro {
  const estado = s.estado.trim().toLowerCase()
  if (estado === 'cerrado' || estado === 'rechazado') return 'cerrado'
  // Un estado fuera del vocabulario no se promociona a «abierto confirmado».
  if (estado !== 'abierto' && estado !== 'en_tramitacion') return 'sin_confirmar'
  // Los abiertos a mano los cierra Alberto: no caducan por falta de ruido de CIMA.
  if (s.origen === 'gestionado_correduria') return 'abierto'
  const ultimo = ultimoMovimientoSiniestro(s)
  if (ultimo === null) return 'sin_confirmar'
  const umbral = esTipoAsistencia(s.tipo) ? DIAS_SIN_MOVIMIENTO_ASISTENCIA : DIAS_SIN_MOVIMIENTO_ABIERTO
  return (hoy.getTime() - ultimo) / MS_DIA > umbral ? 'sin_confirmar' : 'abierto'
}

/** Lectura tolerante para consumidores que reciben el dato por el puerto. */
export function leerVigenciaSiniestro(v: unknown, abiertoLegado: boolean): VigenciaSiniestro {
  if (v === 'abierto' || v === 'sin_confirmar' || v === 'cerrado') return v
  return abiertoLegado ? 'abierto' : 'cerrado'
}
