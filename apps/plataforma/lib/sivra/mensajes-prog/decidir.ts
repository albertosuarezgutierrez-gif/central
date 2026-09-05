// lib/sivra/mensajes-prog/decidir.ts — qué mensajes del ciclo tocan HOY para una reserva. PURO.
//
// Ventanas (hora Madrid; el cron corre cada 30 min y esto decide si el hito ya "abrió" hoy):
//   confirmacion    en cuanto vemos la reserva
//   acceso          desde checkIn−7, a partir de las 09:00
//   vispera_llegada checkIn−1 ≥ 09:00
//   bienvenida      día de llegada ≥ 08:00
//   estancia        checkIn+1 ≥ 10:30, solo estancias de 3+ noches
//   vispera_salida  checkOut−1 ≥ 17:00
//   post_salida     día de salida ≥ 12:00 (la salida oficial es a las 11:00)
//
// REGLA DE ÚLTIMA HORA (el caso Samy, 20/08/2026: Smoobu le disparó la ristra entera DUPLICADA al
// reservar el mismo día de su llegada): si al ver la reserva ya hay ventanas de llegada vencidas,
// se emite como mucho `confirmacion` + el ÚLTIMO hito de acceso alcanzado (que con los códigos ya
// contiene todo lo anterior), nunca la ristra. `bienvenida`/`estancia` vencidas se OMITEN — saludar
// con retraso es ruido, no hospitalidad.
//
// La `fechaObjetivo` ancla el dedupe en BD (UNIQUE booking+tipo+fecha_objetivo): si una
// modificación mueve la llegada, los hitos de la fecha nueva se deben otra vez con clave nueva.

import type { TipoMensaje } from './plantillas.ts'

export type ReservaMin = {
  bookingId: string
  propertyId: string
  checkIn: string    // YYYY-MM-DD
  checkOut: string   // YYYY-MM-DD
  noches: number
  /** Fecha de creación de la reserva en Smoobu (YYYY-MM-DD), si se conoce. */
  createdAt?: string
}

export type Debido = { tipo: TipoMensaje; fechaObjetivo: string; llegadaHoy: boolean }

function aDias(fecha: string): number | null {
  const t = Date.parse(`${fecha}T00:00:00Z`)
  return Number.isFinite(t) ? Math.floor(t / 86400000) : null
}

function sumar(fecha: string, dias: number): string {
  const t = Date.parse(`${fecha}T00:00:00Z`)
  return new Date(t + dias * 86400000).toISOString().slice(0, 10)
}

function minutos(hhmm: string): number {
  const [h, m] = (hhmm || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function claveHito(tipo: string, fechaObjetivo: string): string {
  return `${tipo}:${fechaObjetivo}`
}

export type HitoRegistrado = { tipo: string; fechaObjetivo: string; estado: string }

/** Qué hitos YA REGISTRADOS bloquean una emisión nueva.
 *
 * Una fila en `sombra` NO bloquea si el piso ya está ACTIVO: se generó para validar el texto y
 * nunca llegó al huésped, así que darla por hecha lo deja sin ese mensaje para siempre. Con las
 * plantillas de Smoobu apagadas (05/09/2026) eso ya no es "validar sin riesgo": es un mensaje
 * perdido. Caso fundacional: la víspera con los CÓDIGOS de la reserva 154265696 (Luxury Busto) se
 * generó en sombra 12 h ANTES de activarse el piso; con Smoobu apagado nadie se los mandó.
 *
 * En sombra (piso aún inactivo) sí bloquean: si no, el mismo borrador se repetiría por Telegram en
 * cada pasada.
 */
export function hitosBloqueantes(filas: HitoRegistrado[], activo: boolean): Set<string> {
  const out = new Set<string>()
  for (const f of filas) {
    if (activo && f.estado === 'sombra') continue
    out.add(claveHito(f.tipo, f.fechaObjetivo))
  }
  return out
}

export function mensajesDebidos(
  r: ReservaMin,
  hoy: string,
  horaMadrid: string,
  yaHechos: Set<string>,
): Debido[] {
  const dHoy = aDias(hoy)
  const dIn = aDias(r.checkIn)
  const dOut = aDias(r.checkOut)
  if (dHoy === null || dIn === null || dOut === null) return []
  const min = minutos(horaMadrid)
  const out: Debido[] = []
  const debido = (tipo: TipoMensaje, fechaObjetivo: string, llegadaHoy = false) => {
    if (!yaHechos.has(claveHito(tipo, fechaObjetivo))) out.push({ tipo, fechaObjetivo, llegadaHoy })
  }

  // ── Hitos de LLEGADA ──────────────────────────────────────────────────────
  const faltan = dIn - dHoy   // días hasta la llegada (negativo = ya llegó)

  // Confirmación: SOLO antes de la llegada — o el mismo día si la reserva se hizo hoy (última
  // hora). Sin esto, el primer arranque del orquestador (registro vacío) daría las "gracias por
  // reservar" a huéspedes que ya están dentro o llegaron ayer, que es ruido de robot. Su fecha
  // objetivo es fija (la llegada) para que el dedupe no dependa del día en que el cron la vio.
  const creadaHoy = (r.createdAt || '').slice(0, 10) === hoy
  if (faltan >= 1 || (faltan === 0 && creadaHoy)) debido('confirmacion', r.checkIn)

  if (faltan > 1) {
    // Camino normal: solo el mensaje de acceso cuando abre su ventana de 7 días.
    if (faltan <= 7 && min >= 9 * 60) debido('acceso', r.checkIn)
  } else if (faltan === 1) {
    // Víspera. Si el acceso de 7 días nunca llegó a salir (reserva vista tarde), NO se recupera:
    // la víspera ya contiene todo (dirección + pasos + códigos).
    if (min >= 9 * 60) debido('vispera_llegada', r.checkIn)
  } else if (faltan === 0 && dHoy <= dOut) {
    // Día de llegada. Última hora: si la víspera no salió ayer, sale HOY con los códigos ("hoy te
    // esperamos"), como único hito de acceso. La bienvenida solo si la víspera YA había salido
    // (con su fecha de ayer) — dos mensajes nuestros el mismo día serían la ristra de Smoobu.
    const visperaAyer = yaHechos.has(claveHito('vispera_llegada', r.checkIn))
    if (!visperaAyer) {
      debido('vispera_llegada', r.checkIn, true)
    } else if (min >= 8 * 60) {
      debido('bienvenida', r.checkIn)
    }
  }

  // ── Hitos de ESTANCIA y SALIDA (independientes del camino de llegada) ─────
  // Estancia: solo el día siguiente EXACTO a la llegada (no se pregunta "¿qué tal?" con retraso).
  if (r.noches >= 3 && dHoy === dIn + 1 && dHoy < dOut && min >= 10 * 60 + 30) {
    debido('estancia', sumar(r.checkIn, 1))
  }

  // Víspera de salida: solo su día exacto. En estancias de 1 noche la víspera de salida ES el día
  // de llegada — ahí se omite (la víspera de llegada de hoy ya lleva todo y dos mensajes son ruido).
  if (dHoy === dOut - 1 && dOut - dIn >= 2 && min >= 17 * 60) {
    debido('vispera_salida', sumar(r.checkOut, -1))
  }

  // Post-salida: el día de la salida desde las 12:00, o como tarde al día siguiente (un cron caído
  // esa mañana no debe robar el "gracias"; más tarde de eso ya es ruido).
  if ((dHoy === dOut && min >= 12 * 60) || dHoy === dOut + 1) {
    debido('post_salida', r.checkOut)
  }

  return out
}
