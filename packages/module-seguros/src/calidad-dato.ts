// Calidad del dato de la cartera EN VIGOR: reglas que dicen qué ficha o póliza tiene un hueco que
// estorba a la hora de avisar, renovar o tarificar, y qué hacer con él. Cada regla es un hallazgo
// medido, no un «podría faltar»: la consulta vive en `apps/asegura/lib/calidad-cartera.ts`.

export const REGLAS_CALIDAD = {
  vencida_sin_renovar: {
    titulo: 'Vencida y sin renovación',
    queHacer: 'CIMA la sigue dando por activa pero su vencimiento ya pasó y no ha llegado la renovación. Pídesela a la compañía o confirma si se anuló.',
  },
  sin_prima: {
    titulo: 'Póliza sin prima',
    queHacer: 'No consta la prima (o es 0). Sin ella no se puede comparar al renovar ni cuadrar la comisión: cógela del recibo o de la compañía.',
  },
  dni_duplicado: {
    titulo: 'Dos fichas con el mismo DNI',
    queHacer: 'La misma persona está en dos fichas: sus pólizas, avisos y portal se reparten entre las dos. Revisa las dos y déjalo en una.',
  },
  sin_dni: {
    titulo: 'Cliente sin DNI',
    queHacer: 'Sin DNI no se puede tarificar ni emitir, y la ficha no casa con lo que manda CIMA. Pídeselo en el próximo contacto.',
  },
  sin_nacimiento: {
    titulo: 'Cliente sin fecha de nacimiento',
    queHacer: 'La piden al tarificar auto, vida y salud. Pídesela en el próximo contacto.',
  },
} as const

export type ReglaCalidad = keyof typeof REGLAS_CALIDAD

/** Orden de la pantalla: primero lo que cuesta dinero o esconde una pérdida. */
export const ORDEN_REGLAS: readonly ReglaCalidad[] = ['vencida_sin_renovar', 'dni_duplicado', 'sin_prima', 'sin_dni', 'sin_nacimiento']

export type IncidenciaCalidad = {
  regla: ReglaCalidad
  clienteId: string
  cliente: string | null
  polizaId: string | null
  numeroPoliza: string | null
  compania: string | null
  /** El dato que la explica (p. ej. el vencimiento, `AAAA-MM-DD`); `null` si la regla no lleva. */
  dato: string | null
  /** La OTRA ficha, en `dni_duplicado`. */
  relacionadoId: string | null
}

export type GrupoCalidad = { regla: ReglaCalidad; titulo: string; queHacer: string; filas: IncidenciaCalidad[] }

export function esReglaCalidad(v: unknown): v is ReglaCalidad {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(REGLAS_CALIDAD, v)
}

/** Agrupa por regla en el orden de `ORDEN_REGLAS`; las reglas sin filas no salen. */
export function agruparCalidad(filas: readonly IncidenciaCalidad[]): GrupoCalidad[] {
  return ORDEN_REGLAS.map((regla) => ({ regla, ...REGLAS_CALIDAD[regla], filas: filas.filter((f) => f.regla === regla) }))
    .filter((g) => g.filas.length > 0)
}
