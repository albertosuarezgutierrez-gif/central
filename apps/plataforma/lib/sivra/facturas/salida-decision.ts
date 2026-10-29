// lib/sivra/facturas/salida-decision.ts — ¿qué hace el cron de salida con UNA solicitud de factura? PURO.
//
// Regla (aprobada por Alberto el 29/10/2026): la factura del huésped con datos VALIDADOS se emite y envía SOLA el día
// de salida (Europe/Madrid) o, si la salida ya pasó sin factura, en el siguiente pase, con una ventana máxima de
// `VENTANA_DIAS` hacia atrás (al desplegar no se emiten en masa facturas de estancias viejas). Si falta algo (datos,
// importe, serie) → UN aviso a Alberto (marcado en la solicitud, no se repite cada día).
// Idempotencia: una factura ya emitida no se vuelve a emitir (además lo garantiza `emitirFactura` con FOR UPDATE); el
// único reintento de envío automático es el de una emitida a la que NUNCA se le intentó mandar el correo
// (`envio_intentos = 0`, p. ej. la función se cortó entre emitir y enviar). Un envío fallido o dudoso lo decide Alberto (🔁).

export const VENTANA_DIAS = 30

/** `iso` (YYYY-MM-DD) menos `n` días, en calendario (sin horas: no le afectan los cambios de hora). */
export function restarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export type Momento = 'sin_fecha' | 'antes' | 'toca' | 'demasiado_vieja'

/** Salida `hasta` respecto a `hoy` (ambas YYYY-MM-DD en Madrid). Hoy o pasada dentro de la ventana → `toca`. */
export function momentoSalida(hasta: string | null | undefined, hoy: string, ventana: number = VENTANA_DIAS): Momento {
  if (!hasta || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return 'sin_fecha'
  if (hasta > hoy) return 'antes'
  if (hasta < restarDias(hoy, ventana)) return 'demasiado_vieja'
  return 'toca'
}

export type EntradaDecision = {
  hoy: string
  hasta: string | null
  estadoSolicitud: string
  factura: { estado: string; envioIntentos: number } | null
  /** Lo que impide emitir (datos del receptor, importe, serie…). `[]` = nada falta. */
  faltan: string[]
  /** Ya se avisó a Alberto de esta solicitud. */
  avisoYa: boolean
}

export type DecisionSalida =
  | { accion: 'nada'; porque: string }
  | { accion: 'emitir' }
  | { accion: 'enviar' }
  | { accion: 'avisar'; motivos: string[] }

export function decidirSalida(e: EntradaDecision): DecisionSalida {
  const m = momentoSalida(e.hasta, e.hoy)
  if (m !== 'toca') return { accion: 'nada', porque: m }
  if (e.estadoSolicitud === 'cancelada') return { accion: 'nada', porque: 'cancelada' }
  if (e.factura && e.factura.estado !== 'borrador') {
    if (e.factura.estado === 'emitida' && e.factura.envioIntentos === 0) return { accion: 'enviar' }
    return { accion: 'nada', porque: `factura ${e.factura.estado}` }
  }
  if (e.faltan.length) return e.avisoYa ? { accion: 'nada', porque: 'ya avisado' } : { accion: 'avisar', motivos: e.faltan }
  return { accion: 'emitir' }
}

const fecha = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—')

/** Aviso a Alberto (HTML: el llamador escapa lo que viene del huésped antes de pasarlo). */
export function textoAvisoIncompleta(d: { piso: string; reservationId: string; hasta: string | null; motivos: string[] }): string {
  return [
    '🧾 <b>Factura de huésped: NO se ha podido emitir sola</b>',
    `${d.piso} · reserva ${d.reservationId} · salida ${fecha(d.hasta)}`,
    '',
    'Falta:',
    ...d.motivos.map((m) => `• ${m}`),
    '',
    'Complétalo en /sivra/facturas (alta manual, misma reserva). Este aviso no se repite.',
  ].join('\n')
}
