// ────────────────────────────────────────────────────────────────────────────
// Reparto del tiempo del cron `subastas-mercado`. PURO y testeado.
//
// POR QUÉ EXISTE (incidente 06/08/2026): el handler encadena 8 pasos en serie y
// los dos de enriquecimiento pueden comerse, ELLOS SOLOS, más que todo el
// presupuesto de la función: `enriquecerAnunciantesFotocasa` son 8 fichas ×
// 30 s de timeout (240 s) y `referenciaZonasFotocasa` 6 zonas × 30 s (180 s).
// Los pasos que Alberto realmente consume —avisar chollos y bajadas— van al
// FINAL, así que son los primeros en morir cuando el portal va lento.
//
// El 05/08 la pasada tardó ~285 s (se salvó por 15 s) y el 06/08 murió con un
// 504 a los 300 s justo antes de avisar chollos: cero avisos ese día, sin un
// solo error visible. Es el «0 en silencio» del CLAUDE.md — «no he podido
// mirar» servido como «no hay nada».
//
// La lección del repo (landmine de `facturas-scan`, 31/07/2026) es explícita:
// **subir el techo solo mueve la pared; el presupuesto es lo que garantiza que
// la pasada VUELVE**. Aquí el presupuesto reserva tiempo para los avisos ANTES
// de repartir el resto entre los pasos caros.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Techo de trabajo del handler, por debajo del `maxDuration` de 300 s: deja
 * margen para el arranque en frío, la conexión a BD y la serialización de la
 * respuesta. Si se agota, la pasada devuelve lo hecho en vez de morir en 504.
 */
export const PRESUPUESTO_TOTAL_MS = 265_000

/**
 * Tiempo RESERVADO para el tramo final (referencia de mercado + avisar chollos
 * + avisar bajadas + IPV): son consultas SQL y un par de mensajes de Telegram,
 * rápidos, pero es justo lo que decide si Alberto se entera hoy de un chollo.
 * Nunca se reparte entre los pasos de red.
 */
export const RESERVA_AVISOS_MS = 70_000

/**
 * Instante límite (epoch ms) hasta el que pueden estirarse los pasos de
 * enriquecimiento por red. A partir de ahí el handler sigue con el tramo final.
 */
export function deadlineEnriquecimiento(
  inicio: number,
  totalMs: number = PRESUPUESTO_TOTAL_MS,
  reservaMs: number = RESERVA_AVISOS_MS,
): number {
  // Con una reserva mayor que el total no se enriquece nada: el tramo final
  // manda. Nunca se devuelve un deadline anterior al inicio.
  return inicio + Math.max(0, totalMs - reservaMs)
}

/**
 * ¿Cabe otra iteración de red antes del `deadline`?
 *
 * `margenMs` es lo que se estima que tarda UNA iteración: sin él, un bucle
 * arranca una petición de 30 s a falta de 2 s del límite y se pasa igual — que
 * es exactamente cómo se cruzó el techo el 06/08.
 */
export function quedaTiempo(deadline: number, ahora: number, margenMs = 0): boolean {
  return ahora + margenMs <= deadline
}

/** Coste estimado de una ficha/zona del portal: su propio `AbortSignal.timeout`. */
export const COSTE_PETICION_PORTAL_MS = 30_000

/**
 * Parte legible de por qué se cortó una fase, para el detalle del latido y la
 * respuesta del cron. `null` cuando la fase terminó su cola entera.
 *
 * Se dice SIEMPRE que se cortó, aunque no haya fallado nada: una cola truncada
 * por tiempo no es «ya no queda trabajo», y confundirlas es el fallo que este
 * módulo existe para evitar.
 */
export function motivoCorte(cortado: boolean, hechos: string, pendientes: number): string | null {
  if (!cortado) return null
  const cola = pendientes > 0 ? `; ${pendientes} pendiente(s) para la próxima pasada` : ''
  return `cortado por presupuesto de tiempo tras ${hechos}${cola}`
}
