// ────────────────────────────────────────────────────────────────────────────
// Lógica PURA del cursor incremental de las alertas de portales inmobiliarios.
//
// POR QUÉ EXISTE (auditoría del 08/08/2026): el cron `subastas-mercado` corre
// UNA vez al día y pedía «los correos de los últimos 30 días, hasta 150 por
// portal». Como el corpus de alertas es diario y estable, eso significaba
// releer y reparsear ~300 correos CADA día para encontrar los 2-10 nuevos. Esa
// relectura se comía sola casi todo el presupuesto de tiempo de la pasada, y
// por eso el latido del 07/08 cantaba «cortado por presupuesto tras 0 ficha(s);
// 8 pendiente(s)»: la ingesta no dejaba tiempo ni para una sola ficha.
//
// El arreglo es el mismo patrón del triaje de correo (`lib/correo/imap.ts`):
// recordar hasta qué UID se leyó y pedir solo lo posterior. Aquí la lógica de
// selección vive aparte y sin IO para poder testearla — el resto (IMAP, BD) es
// una cáscara fina alrededor.
// ────────────────────────────────────────────────────────────────────────────

/** Lo que se recuerda de la última pasada de UN remitente. */
export type CursorCorreo = {
  /** Último UID YA PROCESADO. 0 = nunca se ha leído nada. */
  lastUid: number
  /** `UIDVALIDITY` del buzón cuando se guardó. null = no se apuntó. */
  uidValidity: number | null
}

export type PlanLectura =
  | {
      modo: 'bootstrap'
      /** Por qué no se puede leer incremental (va al log/parte, no se traga). */
      motivo: 'sin-cursor' | 'uidvalidity-cambiado'
      /** Ventana de fechas de la primera pasada. */
      desde: Date
    }
  | { modo: 'incremental'; desdeUid: number }

/**
 * Decide cómo leer este remitente.
 *
 * `uidValidity` es la promesa de IMAP de que los UID siguen significando lo
 * mismo. Si cambia (Gmail renumera el buzón), un `lastUid` viejo puede saltarse
 * correos o traer los equivocados: se vuelve a la ventana por fecha, que es
 * lenta pero honesta. Ante la duda, bootstrap — reprocesar es idempotente
 * (`ON CONFLICT (portal, ref_anuncio)`), saltarse correos no se ve nunca.
 */
export function planificarLectura(params: {
  cursor: CursorCorreo | null
  uidValidityActual: number
  dias: number
  ahora?: number
}): PlanLectura {
  const { cursor, uidValidityActual, dias, ahora = Date.now() } = params
  const desde = new Date(ahora - dias * 86400_000)
  if (!cursor || cursor.lastUid <= 0) return { modo: 'bootstrap', motivo: 'sin-cursor', desde }
  if (cursor.uidValidity != null && uidValidityActual > 0 && cursor.uidValidity !== uidValidityActual) {
    return { modo: 'bootstrap', motivo: 'uidvalidity-cambiado', desde }
  }
  return { modo: 'incremental', desdeUid: cursor.lastUid }
}

/**
 * Qué UID de los que devolvió la búsqueda se leen en esta pasada.
 *
 * 🚨 Landmine de IMAP (RFC 3501): el rango `N:*` SIEMPRE incluye el último
 * mensaje del buzón, aunque su UID sea MENOR que N. Sin el filtro `> desdeUid`
 * el último correo ya procesado volvería en cada pasada. Lo mismo hace
 * `lib/correo/imap.ts`.
 *
 * El orden importa y es distinto en cada modo:
 *  · incremental → ASCENDENTE. Si el tope corta el lote, el cursor avanza hasta
 *    lo procesado y la pasada siguiente sigue justo ahí: no se pierde nada.
 *  · bootstrap → los MÁS NUEVOS primero (conducta histórica). Aquí el tope sí
 *    deja fuera correos viejos para siempre; por eso el modo se dice en el parte.
 */
export function uidsALeer(uids: number[], plan: PlanLectura, max: number): number[] {
  if (max <= 0) return []
  if (plan.modo === 'incremental') {
    return uids
      .filter((u) => u > plan.desdeUid)
      .sort((a, b) => a - b)
      .slice(0, max)
  }
  return [...uids].sort((a, b) => b - a).slice(0, max)
}

/**
 * Cursor a guardar TRAS procesar el lote (at-least-once: nunca antes).
 *
 * Con lote vacío el `lastUid` no retrocede — pero sí se apunta el `uidValidity`
 * actual, para que un buzón renumerado no vuelva a bootstrapear eternamente.
 */
export function avanzarCursor(
  anterior: CursorCorreo | null,
  procesados: number[],
  uidValidityActual: number,
): CursorCorreo {
  const previo = anterior?.lastUid ?? 0
  const maxLote = procesados.length ? Math.max(...procesados) : 0
  return {
    lastUid: Math.max(previo, maxLote),
    uidValidity: uidValidityActual > 0 ? uidValidityActual : (anterior?.uidValidity ?? null),
  }
}

/**
 * Línea del parte por portal. El modo NO es un detalle interno: un `bootstrap`
 * repetido día tras día significa que el cursor no se está guardando, y sin
 * decirlo se vería igual que una ingesta sana (solo que lenta).
 */
export function detalleLectura(remitente: string, plan: PlanLectura, leidos: number): string {
  const modo = plan.modo === 'incremental' ? `desde uid ${plan.desdeUid}` : `primera lectura (${plan.motivo})`
  return `${remitente}: ${leidos} correo(s), ${modo}`
}
