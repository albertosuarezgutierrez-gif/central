// ────────────────────────────────────────────────────────────────────────────
// Estado REAL de una conexión con el PMS (Smoobu/iCal). Puro: sin BD ni red.
//
// 🚨 Por qué existe: el panel pintaba un chip «● Activo» verde a partir de
// `activa` y `sync_error`. Ninguna de las dos dice si la sincronización SIGUE
// funcionando: `activa` es una casilla de configuración y `sync_error IS NULL`
// significa «no consta error», que incluye «lleva tres semanas sin ejecutarse».
// Encima la fecha del último sync no se veía nunca, porque el panel leía la
// columna `ultimo_sync` y el proceso escribe `last_sync_at` (auditoría
// 30/07/2026: `ultimo_sync` está a NULL en producción desde siempre).
//
// Con la sincronización muerta, `cleaning_sessions` deja de recibir reservas y
// TODO lo que cuelga de ella —la app de la limpiadora, el briefing de la
// mañana, el panel— dice «no hay limpiezas hoy» con total naturalidad. Este
// helper es el que permite decir «no lo sé» en vez de eso.
// ────────────────────────────────────────────────────────────────────────────

/** Cada cuánto corre el cron `/api/pms/sync` (10 min). El umbral es MUY generoso
 *  respecto a esa cadencia: solo salta cuando se han perdido decenas de pasadas. */
export const HORAS_SYNC_FRESCO = 3

export type EstadoSync = 'inactiva' | 'nunca' | 'desactualizado' | 'error' | 'ok'

export interface ConexionPms {
  activa: boolean
  /** Columna `last_sync_at` — la que el sync escribe DE VERDAD en cada pasada. */
  lastSyncAt: Date | string | null
  syncError: string | null
}

export interface ResumenSync {
  estado: EstadoSync
  /** Texto corto del chip. */
  etiqueta: string
  /** Explicación para el usuario: qué significa y qué mirar. */
  detalle: string
  /** Horas desde la última pasada. `null` = nunca ha corrido. */
  horas: number | null
}

function horasDesde(v: Date | string | null, ahora: Date): number | null {
  if (!v) return null
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v))
  if (!Number.isFinite(t)) return null
  return (ahora.getTime() - t) / 3_600_000
}

/** Texto humano de una antigüedad en horas. */
export function antiguedadTexto(horas: number): string {
  if (horas < 1) return `hace ${Math.max(1, Math.round(horas * 60))} min`
  if (horas < 48) return `hace ${Math.round(horas)} h`
  return `hace ${Math.round(horas / 24)} días`
}

export function estadoSync(
  c: ConexionPms,
  ahora: Date = new Date(),
  maxHoras: number = HORAS_SYNC_FRESCO,
): ResumenSync {
  if (!c.activa) {
    return { estado: 'inactiva', etiqueta: '○ Inactiva', detalle: 'La conexión está desactivada a propósito.', horas: null }
  }

  const horas = horasDesde(c.lastSyncAt, ahora)

  // Nunca ha corrido: NO es «activa», es que no se ha sincronizado jamás.
  if (horas == null) {
    return {
      estado: 'nunca',
      etiqueta: '⚠ Sin sincronizar',
      detalle: 'Esta conexión no ha sincronizado nunca: las reservas del PMS no están entrando.',
      horas: null,
    }
  }

  // Cron muerto. Va ANTES que el error porque, si lleva días sin correr, el
  // último `sync_error` es historia vieja y lo urgente es que no se ejecuta.
  if (horas > maxHoras) {
    return {
      estado: 'desactualizado',
      etiqueta: `⚠ Sin sincronizar ${antiguedadTexto(horas)}`,
      detalle:
        `La última sincronización fue ${antiguedadTexto(horas)} (debería ser cada 10 min). ` +
        'Las reservas nuevas NO están llegando: lo que veas de limpiezas puede estar incompleto.',
      horas,
    }
  }

  if (c.syncError) {
    return {
      estado: 'error',
      etiqueta: '⚠ Error',
      detalle: `Sincronizó ${antiguedadTexto(horas)} pero con errores: ${c.syncError}`,
      horas,
    }
  }

  return {
    estado: 'ok',
    etiqueta: `● Activo · ${antiguedadTexto(horas)}`,
    detalle: `Última sincronización ${antiguedadTexto(horas)}, sin errores.`,
    horas,
  }
}

/** ¿El chip debe pintarse en rojo/ámbar? (verde solo con dato fresco y sin error). */
export function esSyncSano(r: ResumenSync): boolean {
  return r.estado === 'ok'
}
