// Ficha del cliente y del vehículo en recepción/entrega (07/11/2026, encargo de Alberto):
//   · MÓVIL OBLIGATORIO al guardar la ficha de un cliente (nuevo o antiguo sin móvil): sin un móvil español válido no se guarda.
//     Reutiliza `normalizarMovil` (citas.ts), el validador del taller; el correo sigue siendo opcional.
//   · VENCIMIENTO DEL SEGURO del vehículo (`vehiculos.seguro_hasta`): NULL = «no se sabe», nunca un valor por defecto.
//     Lo teclea el recepcionista en la recepción o en la entrega; queda quién, cuándo y desde qué momento (SQL 0013).
//     Campo vacío = «no se toca» (nunca borra un dato conocido ni inventa uno).
// Este dato NO sale del taller por sí solo: al back office de Grupo ASegura solo llegaría con el consentimiento `asegura`
// vigente (decidirLeadSeguros); hoy no hay transporte de leads (F3).
import { normalizarMovil } from './citas.ts'

export const MENSAJE_MOVIL_OBLIGATORIO = 'El móvil es obligatorio para poder localizar al propietario'
export const MENSAJE_MOVIL_INVALIDO = 'El móvil no es válido: escribe un móvil español de 9 cifras (admite +34)'

export type ResultadoMovil = { ok: true; movil: string } | { ok: false; motivo: string }

/** Móvil obligatorio de la ficha del cliente. Devuelve el móvil NORMALIZADO (9 cifras) o el motivo del rechazo. */
export function validarMovilCliente(texto: string | null | undefined): ResultadoMovil {
  const t = (texto ?? '').trim()
  if (!t) return { ok: false, motivo: MENSAJE_MOVIL_OBLIGATORIO }
  const movil = normalizarMovil(t)
  return movil ? { ok: true, movil } : { ok: false, motivo: MENSAJE_MOVIL_INVALIDO }
}

/**
 * Margen admitido para el vencimiento del seguro, en días respecto a hoy (≈ 2 años a cada lado). Un seguro de coche se renueva
 * cada año: más de 2 años en el futuro es casi seguro un error de tecleo (año mal puesto); más de 2 años en el pasado no sirve
 * para nada (ni avisos ni lead) y suele ser también un error. No es configuración del taller: es una regla de cordura del dato.
 */
export const VENCIMIENTO_SEGURO_MARGEN_DIAS = 730

export const ORIGENES_VENCIMIENTO_SEGURO = ['recepcion', 'entrega'] as const
export type OrigenVencimientoSeguro = (typeof ORIGENES_VENCIMIENTO_SEGURO)[number]

export type ResultadoVencimiento = { ok: true; fecha: Date | null } | { ok: false; motivo: string }

const DIA_MS = 86_400_000
const diaUtc = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/**
 * Valida el texto de un `<input type="date">` (AAAA-MM-DD). Vacío → `fecha: null` («no se toca»). La fecha resultante es la
 * medianoche UTC de ese día (columna `date`). Rechaza fechas inexistentes (30 de febrero) y fuera de ± `VENCIMIENTO_SEGURO_MARGEN_DIAS`.
 */
export function validarVencimientoSeguro(texto: string | null | undefined, hoy: Date): ResultadoVencimiento {
  const t = (texto ?? '').trim()
  if (!t) return { ok: true, fecha: null }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return { ok: false, motivo: 'Fecha de vencimiento del seguro inválida' }
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const f = new Date(Date.UTC(a, mes - 1, dia))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) {
    return { ok: false, motivo: 'Fecha de vencimiento del seguro inválida' }
  }
  const dias = Math.round((f.getTime() - diaUtc(hoy)) / DIA_MS)
  if (dias < -VENCIMIENTO_SEGURO_MARGEN_DIAS) return { ok: false, motivo: 'El vencimiento del seguro es de hace más de 2 años: revisa la fecha' }
  if (dias > VENCIMIENTO_SEGURO_MARGEN_DIAS) return { ok: false, motivo: 'El vencimiento del seguro es de dentro de más de 2 años: revisa la fecha' }
  return { ok: true, fecha: f }
}

export type CambioVencimientoSeguro = {
  seguroHasta: Date; seguroHastaPor: string | null; seguroHastaEn: Date; seguroHastaOrigen: OrigenVencimientoSeguro
}

/**
 * Qué escribir en el vehículo. `null` = nada: no se tecleó fecha, o es la misma que ya constaba (no se pisa quién la puso).
 * Nunca devuelve un borrado: un dato conocido no pasa a «no se sabe» desde esta pantalla.
 */
export function cambioVencimientoSeguro(
  actual: Date | null, nueva: Date | null, o: { usuarioId: string | null; origen: OrigenVencimientoSeguro; ahora: Date },
): CambioVencimientoSeguro | null {
  if (!nueva) return null
  if (actual && diaUtc(actual) === diaUtc(nueva)) return null
  return { seguroHasta: nueva, seguroHastaPor: o.usuarioId, seguroHastaEn: o.ahora, seguroHastaOrigen: o.origen }
}

/** `AAAA-MM-DD` de una columna `date` (para precargar el `<input type="date">`), o '' si no se sabe. */
export const fechaInputDe = (d: Date | null | undefined): string => (d ? new Date(diaUtc(d)).toISOString().split('T')[0] : '')
