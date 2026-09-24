// lib/agentes-salud-clasificar.ts — decisión PURA sobre el veredicto que el vigía de agentes
// (/api/cron/agentes-latido, diario 07:45 UTC) persiste en `agente_veredicto`. Vive aparte del
// fichero que consulta la BD para poder testearse con `node --test` sin arrastrar Prisma.
//
// Contexto (02/09/2026): hasta hoy el vigía evaluaba los 27 agentes de AGENTES_VIGILADOS cada
// mañana y TIRABA el resultado — solo iba al JSON de su respuesta y a un Telegram que en 8
// rutinas no está cableado. /operador/agentes pintaba entonces ⚪ «sin telemetría» sobre 23 de
// los 29 agentes del catálogo, con el dato real calculándose y perdiéndose a diario.

export type EstadoSalud = 'verde' | 'ambar' | 'rojo' | 'gris'

export type SaludAgente = { ultima: string | null; horas: number | null; estado: EstadoSalud; detalle: string }

export type SaludLatido = SaludAgente & {
  /** Etiqueta del registro AGENTES_VIGILADOS (la misma que va en el Telegram). */
  etiqueta: string
  /** Qué hacer si está en rojo. */
  nota: string | null
  /** Cuándo lo evaluó el vigía. Si es viejo, `estado` ya viene degradado a 'gris'. */
  evaluadoAt: string
  /** Horas desde que el vigía evaluó esto. */
  antiguedadH: number
}

export type FilaSalud = {
  agente: string
  evaluado_at: Date
  alerta: boolean
  horas: number | null
  motivo: string
  max_horas: number
  etiqueta: string
  nota: string | null
  sonda_error: string | null
}

// El cron corre a diario (07:45 UTC); 36 h = un día perdido + margen.
const VIGIA_MAX_H = 36

/**
 * Decisión PURA sobre un veredicto persistido. Vive aparte de la consulta a propósito: es la
 * lógica que decide qué color ve Alberto, y por tanto la que tiene que estar bajo test.
 *
 * Tres cosas que NO se pueden colapsar, y que son la razón de que esto no sea un `if` suelto:
 *   1. Un veredicto CADUCADO no es el veredicto. Si el vigía lleva más de VIGIA_MAX_H sin pasar,
 *      su último parte —aunque fuera verde— deja de valer: se degrada a gris diciendo que nadie
 *      ha mirado. Sin esto, un vigía muerto congela la pantalla en el último verde que escribió.
 *   2. Una SONDA ROTA no es un agente sano: es «no se ha podido comprobar», que va en rojo.
 *   3. `horas === null` significa «ni una sola ejecución ha dejado huella», NO «0 horas». Por eso
 *      con alerta y sin horas el estado es rojo y no ámbar: no hay dato con el que ser indulgente.
 *   4. Un ESTRENO (sin alerta y sin horas) no es verde. Ver el bloque de abajo.
 */
export function clasificarSalud(f: FilaSalud, ahoraMs: number): SaludLatido {
  const evaluadoMs = new Date(f.evaluado_at).getTime()
  const antiguedadH = (ahoraMs - evaluadoMs) / 3_600_000
  const base = {
    etiqueta: f.etiqueta,
    nota: f.nota,
    evaluadoAt: new Date(f.evaluado_at).toISOString(),
    antiguedadH,
  }

  if (antiguedadH > VIGIA_MAX_H) {
    const dias = Math.max(1, Math.round(antiguedadH / 24))
    return { ...base, ultima: null, horas: null, estado: 'gris',
      detalle: `sin comprobar desde hace ${dias}d — el vigía no ha pasado` }
  }

  if (f.sonda_error) {
    return { ...base, ultima: null, horas: null, estado: 'rojo',
      detalle: 'no se ha podido comprobar: la sonda falló' }
  }

  const horas = f.horas == null ? null : Number(f.horas)

  // 4. ESTRENO (04/09/2026): declarado hace poco, aún sin ninguna señal, y su primera pasada todavía
  //    no ha vencido. `evaluarLatido` no alerta —es lo correcto: no hay avería— pero pintarlo VERDE
  //    sería peor que la falsa alarma que se acaba de quitar: diría «está bien» de un agente del que
  //    no se sabe absolutamente nada. Es «todavía no se sabe», y para eso ya está el gris.
  //
  //    Se reconoce por la COMBINACIÓN `sin alerta` + `horas === null`, no por el texto del motivo:
  //    `evaluarLatido` solo devuelve `alerta:false` en dos sitios, y el otro (agente activo) SIEMPRE
  //    trae un número de horas. Es un invariante del módulo, no una heurística sobre una cadena —
  //    y lo fija un test en `lib/monitoring/latidos.test.ts`.
  if (!f.alerta && horas === null) {
    return { ...base, ultima: null, horas: null, estado: 'gris', detalle: f.motivo }
  }

  const estado: EstadoSalud = !f.alerta
    ? 'verde'
    : horas !== null && horas <= f.max_horas * 2 ? 'ambar' : 'rojo'

  return { ...base, ultima: null, horas, estado, detalle: f.motivo }
}

