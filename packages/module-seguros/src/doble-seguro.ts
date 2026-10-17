/**
 * «Póliza sustituida que sigue viva» → posible DOBLE SEGURO (03/10/2026). Puro: sin BD, sin red.
 *
 * Una sustitución registrada (vieja → nueva) no anula la vieja: hay que pedírselo a su compañía. Si la
 * vieja sigue en un estado vigente y cubre (vencimiento) o cobra (recibo) bastante DESPUÉS del efecto de
 * la nueva, el cliente paga dos seguros del mismo riesgo. Caso real: GPAFS0900547 (C0468, vence 09/09/2027)
 * → 61048939 (C0109, efecto 17/09/2026).
 *
 * Tolerancia (`DOBLE_SEGURO_DIAS_TOLERANCIA`, la misma que `solicitudPorSustitucion`): un cambio a
 * vencimiento (la nueva empieza como mucho 30 días antes de que venza la vieja) es lo normal y NO avisa.
 * Falta de fecha = «no se sabe» → sin aviso (no se inventa), nunca «no hay doble seguro».
 * El texto NO lleva datos personales: solo nº de póliza y compañía.
 */
import { esEstadoVigente } from './vigencia.ts'

export const DOBLE_SEGURO_DIAS_TOLERANCIA = 30

export type ViejaParaDobleSeguro = {
  aseguradora: string
  numeroPoliza: string | null
  estado: string
  /** `YYYY-MM-DD`. `null` = no consta. */
  fechaVencimiento: string | null
  /** Efecto (`YYYY-MM-DD`) del recibo más tardío de la vieja que NO está anulado ni devuelto. `null` = ninguno/no consta. */
  fechaEfectoUltimoRecibo: string | null
}
/** `estado` de la nueva: si no está vigente (anulada, rechazada…) no hay doble seguro. */
export type NuevaParaDobleSeguro = { fechaEfecto: string | null; estado: string }

export type AvisoDobleSeguro = {
  motivos: Array<'vencimiento_posterior' | 'recibo_posterior'>
  texto: string
}

function dia(iso: string | null): number | null {
  if (iso === null) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(t) ? null : Math.floor(t / 86_400_000)
}

/**
 * ¿La vieja se SOLAPA con la nueva? La misma comparación que usa `avisoDobleSeguro` (vencimiento o recibo de
 * la vieja más allá del efecto de la nueva + `toleranciaDias`), separada para que el seguimiento de sustituciones
 * no la duplique. `avisoDobleSeguro` la usa con `DOBLE_SEGURO_DIAS_TOLERANCIA`; el seguimiento, con 0.
 * Tres estados: `solapa` · `no_solapa` (fechas CONOCIDAS y la vieja vence a más tardar cuando empieza la nueva +
 * tolerancia) · `no_se_sabe` (falta el efecto de la nueva o el vencimiento de la vieja: nunca «no solapa»).
 */
export type SolapeViejaNueva = { solape: 'solapa' | 'no_solapa' | 'no_se_sabe'; motivos: AvisoDobleSeguro['motivos'] }

export function solapeViejaNueva(
  vieja: Pick<ViejaParaDobleSeguro, 'fechaVencimiento' | 'fechaEfectoUltimoRecibo'>,
  fechaEfectoNueva: string | null,
  toleranciaDias: number = DOBLE_SEGURO_DIAS_TOLERANCIA,
): SolapeViejaNueva {
  const efecto = dia(fechaEfectoNueva)
  if (efecto === null) return { solape: 'no_se_sabe', motivos: [] }
  const corte = efecto + toleranciaDias
  const motivos: AvisoDobleSeguro['motivos'] = []
  const venc = dia(vieja.fechaVencimiento)
  if (venc !== null && venc > corte) motivos.push('vencimiento_posterior')
  const rec = dia(vieja.fechaEfectoUltimoRecibo)
  if (rec !== null && rec > corte) motivos.push('recibo_posterior')
  if (motivos.length > 0) return { solape: 'solapa', motivos }
  // Sin vencimiento conocido no se puede decir que la vieja se acabe: un recibo «antiguo» no lo prueba.
  return { solape: venc === null ? 'no_se_sabe' : 'no_solapa', motivos }
}

export function avisoDobleSeguro(vieja: ViejaParaDobleSeguro, nueva: NuevaParaDobleSeguro): AvisoDobleSeguro | null {
  if (!esEstadoVigente(vieja.estado) || !esEstadoVigente(nueva.estado)) return null
  const s = solapeViejaNueva(vieja, nueva.fechaEfecto)
  if (s.solape !== 'solapa') return null
  const num = vieja.numeroPoliza?.trim() || 'la póliza sustituida'
  return { motivos: s.motivos, texto: `posible doble seguro: pedir anulación de ${num} a ${vieja.aseguradora}` }
}

/** Por qué una vieja que CIMA sigue dando en vigor ya NO está pendiente de anular. */
export type CierreViejaSustituida = 'anulacion_confirmada'

/** Qué hay que confirmar con la compañía de la vieja: que se ANULE (doble seguro) o que NO RENUEVE. */
export type AvisoViejaSustituida = 'doble_seguro' | 'no_renovacion'

/**
 * Seguimiento de sustituciones (17/10/2026): ¿sigue pendiente confirmar la anulación de la vieja?
 * 🚨 La FECHA no cierra nunca el caso: una vieja que vence cuando empieza la nueva RENUEVA tácitamente al vencer
 * si nadie comunicó la baja (art. 22 LCS). Solo cierran: CIMA ya no la da en vigor, o la compañía confirmó la
 * anulación (sello del corredor o expediente `confirmada`).
 *  - `pendiente`: `false` (cerrada) · `true` · `null` (estado en CIMA ilegible: no se sabe).
 *  - `aviso` (solo si pendiente): `no_renovacion` cuando la vieja vence a más tardar el día que empieza la nueva
 *    (`solapeViejaNueva` con tolerancia 0 = `no_solapa`); si no (o no se sabe), `doble_seguro`.
 */
export function viejaPendienteDeAnular(e: {
  enVigorCima: boolean | null
  anulacionConfirmada: boolean
  /** `solapeViejaNueva(…, 0).solape`; `null` = no hay nueva enlazada. */
  solape: SolapeViejaNueva['solape'] | null
}): { pendiente: boolean | null; cierre: CierreViejaSustituida | null; aviso: AvisoViejaSustituida | null } {
  if (e.enVigorCima === false) return { pendiente: false, cierre: null, aviso: null }
  if (e.anulacionConfirmada) return { pendiente: false, cierre: 'anulacion_confirmada', aviso: null }
  if (e.enVigorCima === null) return { pendiente: null, cierre: null, aviso: null }
  return { pendiente: true, cierre: null, aviso: e.solape === 'no_solapa' ? 'no_renovacion' : 'doble_seguro' }
}
