import { formularioBotHogar, datosViviendaParaBot, eleccionesInicialesHogar, type CatalogosHogarLeidos, type RiesgoParaBotsHogar } from '@central/module-tarificacion'
import { aplicarCompaniaActual } from './tarificador-compania-actual.ts'
import { necesitaVehiculoEncadenado, riesgoConVehiculo, tieneVehiculo, vehiculoDeOrigenes, vehiculoDePolizaViva, type FilaOrigen } from './tarificador-espera-vehiculo.ts'

// Reglas PURAS de «relanzar» un trabajo del tarificador RPA por el puerto de operador (15/10/2026). Sin BD ni red.
// Relanzar = el MISMO trabajo (mismo riesgo, que sigue en la fila) vuelve a `pendiente`. Pensado para que una sesión de
// Claude itere arreglo→prueba sin la pantalla de Alberto. Solo TARIFICAR: emisión y exploración nunca se relanzan por aquí.

/** Estados desde los que se puede relanzar. `error_definitivo` NO: su riesgo ya está purgado (usa «probar» o la oportunidad). */
export const ESTADOS_RELANZABLES = ['atascado'] as const
// `requiere_humano` NO: es captcha/OTP/verificación y cada relanzamiento vuelve a disparar el SMS/aviso a Alberto.

/** Tope de relanzamientos por compañía en una ventana de 24 h. */
export const MAX_RELANZAMIENTOS_24H = 6

export type EntradaRelanzar = {
  estado: string
  modo: string | null
  /** `error.tipo` del trabajo (un abortado por el guard de emisión no se relanza, como en la bandeja). */
  tipoError?: string | null
  /** Otros trabajos de la misma compañía vivos (pendiente, en_curso, error_reintentable, autorizado_emision), sin contar este. */
  vivosCompania: number
  relanzamientos24h: number
  pausada: boolean
}

export type DecisionRelanzar = { ok: true } | { ok: false; status: 409 | 429; motivo: string }

export function decidirRelanzar(e: EntradaRelanzar): DecisionRelanzar {
  if ((e.modo ?? 'tarificar') !== 'tarificar') return { ok: false, status: 409, motivo: `un trabajo de ${e.modo} no se relanza por aquí (solo tarificar)` }
  if (e.tipoError === 'emision') return { ok: false, status: 409, motivo: 'un trabajo abortado por el guard de emisión no se relanza' }
  if (!(ESTADOS_RELANZABLES as readonly string[]).includes(e.estado)) {
    return { ok: false, status: 409, motivo: `el trabajo está ${e.estado}: solo se relanza desde ${ESTADOS_RELANZABLES.join(' o ')}` }
  }
  if (e.pausada) return { ok: false, status: 409, motivo: 'la compañía está en pausa por fallos seguidos del bot: reanúdala antes de relanzar' }
  if (e.vivosCompania > 0) return { ok: false, status: 409, motivo: 'ya hay un trabajo vivo de esa compañía (una ejecución por compañía): espera a que termine' }
  if (e.relanzamientos24h >= MAX_RELANZAMIENTOS_24H) {
    return { ok: false, status: 429, motivo: `tope alcanzado: ${MAX_RELANZAMIENTOS_24H} relanzamientos por compañía cada 24 h (llevas ${e.relanzamientos24h})` }
  }
  return { ok: true }
}

// ─── «Probar tarificación» con el trabajo anterior CERRADO (purgado) ─────────────────────────────────────────────
// Al cerrarse un trabajo su riesgo pierde matrícula y conductor (lista blanca de `module-tarificacion`). El botón de plataforma
// no copia nada: arma el riesgo con el formulario + la ficha. `probar` hace lo mismo desde lo que PERSISTE en asegura: la
// oportunidad del cliente (`info_riesgo.datosVehiculo`, `datosContrato`) + la ficha, con el MISMO constructor que el triaje
// de leads (`formularioBotDesdeLead`). El riesgo del último trabajo solo sirve de respaldo y solo si aún está completo.

export type ReconstruccionRiesgo =
  | { riesgo: unknown; bloqueos: readonly string[]; repreguntar: readonly string[] }
  | { riesgo: null; motivo: 'sin_oportunidad' | 'discrepancias' | 'sin_formulario' }
  /** Hogar: el constructor del botón «pedir precio» dice QUÉ falta (etiquetas de campo, nunca valores) → 422 `riesgo_incompleto`. */
  | { riesgo: null; motivo: 'faltan_datos'; faltan: readonly string[] }

/**
 * HOGAR (27/10/2026): el riesgo se arma como cuando Alberto pulsa «pedir precio» en la oportunidad de hogar de plataforma:
 * `datosVivienda` de la oportunidad MÁS RECIENTE del cliente (`leerRiesgo`, el mismo que lee la pantalla) → `datosViviendaParaBot` +
 * `eleccionesInicialesHogar` (solo lo que casa exactamente) → `formularioBotHogar`. Todo en `@central/module-tarificacion`: el
 * mismo código que el botón. Lo que falta sale como etiquetas de campo (422), nunca un valor supuesto. El tomador lo pone el encolado.
 */
export function riesgoHogarDeRiesgoOportunidad(r: RiesgoParaBotsHogar, ahora = new Date(), catalogos: CatalogosHogarLeidos = {}): ReconstruccionRiesgo {
  // `catalogos` = los mismos catálogos vivos que lee la pantalla (`useCatalogosHogar`): lo guardado es el ID de Codeoscopic
  // (p. ej. `TerracedHouse`) y solo su NOMBRE en el catálogo lo traduce a la clave del bot. Sin ellos, solo valen los ids atestiguados.
  const f = formularioBotHogar({ ...datosViviendaParaBot(r), ...eleccionesInicialesHogar(r, catalogos) }, ahora)
  return f.ok ? { riesgo: f.riesgo, bloqueos: [], repreguntar: [] } : { riesgo: null, motivo: 'faltan_datos', faltan: f.faltan }
}

/**
 * Rellena `companiaAnterior` del riesgo RECONSTRUIDO (Allianz/Mapfre/Generali auto con cambio de seguro) con la compañía que deduce la cartera
 * (`companiaActualUnica`: solo con exactamente una póliza de auto en vigor). `actual` null → mismo objeto. No pisa lo que ya trae.
 * Sin reconstrucción no hace nada. PURA; después sigue pasando por `validar`.
 */
export function conCompaniaActualUnica(r: ReconstruccionRiesgo, compania: string, ramo: string, actual: string | null): ReconstruccionRiesgo {
  if (r.riesgo === null || actual === null) return r
  const riesgo = aplicarCompaniaActual(compania, ramo, r.riesgo, actual)
  return riesgo === r.riesgo ? r : { ...r, riesgo }
}

/**
 * Generali auto no busca el vehículo por matrícula: si el riesgo RECONSTRUIDO no lo trae, se toma de los últimos `ok` de
 * Allianz/Mapfre auto del cliente (`filas`). Mismo helper que el encolado normal (`vehiculoDeOrigenes`: solo `vehiculoCatalogo`
 * y `vehiculoConfirmado`, validados) y mismo inyector (`riesgoConVehiculo`: solo `seleccionVehiculo`/`vehiculoConfirmado`);
 * nada personal se copia. Sin origen, otra compañía/ramo, o ya con vehículo → mismo objeto. PURA.
 */
export function conVehiculoDeOrigen(r: ReconstruccionRiesgo, compania: string, ramo: string, filas: readonly FilaOrigen[]): ReconstruccionRiesgo {
  if (r.riesgo === null || !necesitaVehiculoEncadenado(compania, ramo) || tieneVehiculo(r.riesgo)) return r
  const v = vehiculoDeOrigenes(filas)
  return v ? { ...r, riesgo: riesgoConVehiculo(r.riesgo, v) } : r
}

/**
 * 31/10/2026 · Generali auto sin vehículo de origen (ningún `ok` de Allianz/Mapfre): marca, modelo y versión de la póliza de auto VIVA
 * vinculada a la oportunidad (`datosEspecificos` = su `datos_especificos`, solo esas tres claves; `vehiculoDePolizaViva`). Va DESPUÉS de
 * `conVehiculoDeOrigen` (lo confirmado por un bot manda). Sin póliza, sin marca/modelo, otra compañía/ramo, o ya con vehículo → mismo
 * objeto (sigue el 422 `generali_sin_vehiculo`). PURA.
 */
export function conVehiculoDePoliza(r: ReconstruccionRiesgo, compania: string, ramo: string, datosEspecificos: unknown): ReconstruccionRiesgo {
  if (r.riesgo === null || !necesitaVehiculoEncadenado(compania, ramo) || tieneVehiculo(r.riesgo)) return r
  const v = vehiculoDePolizaViva(datosEspecificos)
  return v ? { ...r, riesgo: riesgoConVehiculo(r.riesgo, v) } : r
}

type ValidacionProbar<E extends { riesgo: unknown } = { riesgo: unknown }> = { ok: true; entrada: E } | { ok: false; mensaje: string; errores?: readonly string[] }

export type DecisionProbar<E extends { riesgo: unknown } = { riesgo: unknown }> =
  | { ok: true; origen: 'oportunidad' | 'trabajo_previo'; entrada: E }
  | { ok: false; status: 409 | 422; motivo: string; errores?: readonly string[] }

/**
 * Qué riesgo se reencola. Orden: 1) el reconstruido de la oportunidad+ficha, si valida; 2) el del último trabajo, si valida
 * (no purgado); 3) rechazo que dice QUÉ falta (solo etiquetas de campo, nunca valores). `validar` es `validarEntradaRamo` con
 * ramo y compañía ya puestos. PURA.
 */
export function decidirRiesgoProbar<E extends { riesgo: unknown }>(e: { reconstruccion: ReconstruccionRiesgo; previo: unknown | null; soloPurgados: boolean; validar: (riesgo: unknown) => ValidacionProbar<E> }): DecisionProbar<E> {
  const r = e.reconstruccion
  let faltan: readonly string[] | undefined
  if (r.riesgo !== null) {
    // El bot solo tarifica al propio cliente como conductor y titular; una duda del texto del cliente se repregunta antes.
    if (r.bloqueos.length) return { ok: false, status: 409, motivo: 'oportunidad_no_tarificable', errores: r.bloqueos }
    if (r.repreguntar.length) return { ok: false, status: 409, motivo: 'oportunidad_con_dudas', errores: r.repreguntar }
    const v = e.validar(r.riesgo)
    if (v.ok) return { ok: true, origen: 'oportunidad', entrada: v.entrada }
    faltan = v.errores ?? [v.mensaje]
  } else if ('motivo' in r && r.motivo === 'discrepancias') {
    return { ok: false, status: 409, motivo: 'oportunidad_con_discrepancias' }
  } else if ('motivo' in r && r.motivo === 'faltan_datos') {
    faltan = r.faltan
  }
  if (e.previo !== null && e.previo !== undefined) {
    const v = e.validar(e.previo)
    if (v.ok) return { ok: true, origen: 'trabajo_previo', entrada: v.entrada }
    return { ok: false, status: 422, motivo: faltan ? 'riesgo_incompleto' : 'riesgo_previo_invalido', errores: faltan ?? v.errores ?? [] }
  }
  if (faltan) return { ok: false, status: 422, motivo: 'riesgo_incompleto', errores: faltan }
  return { ok: false, status: 409, motivo: e.soloPurgados ? 'origen_purgado' : 'sin_riesgo_previo' }
}

// 01/11/2026 · «probar» AUTO/MOTO: el trabajo cuelga de la oportunidad ABIERTA del cliente en ese ramo (así entra en el presupuesto
// automático y usa el vehículo de referencia). Abierta = ni ganada ni perdida ni cerrada. Varias abiertas → la más reciente + aviso.
export const RAMOS_PROBAR_VINCULA_ABIERTA = ['auto', 'moto'] as const
export type FilaOportunidadProbar = { id: string; estado: string; cerradaAt: Date | string | null; createdAt: Date | string }
const msDe = (v: Date | string): number => (v instanceof Date ? v.getTime() : Date.parse(v)) || 0

export function elegirOportunidadAbiertaProbar(ramo: string, filas: readonly FilaOportunidadProbar[]): { oportunidadId: string | null; avisos: string[] } {
  if (!(RAMOS_PROBAR_VINCULA_ABIERTA as readonly string[]).includes(ramo)) return { oportunidadId: null, avisos: [] }
  const abiertas = filas
    .filter((f) => f.cerradaAt == null && f.estado !== 'ganada' && f.estado !== 'perdida')
    .sort((a, b) => msDe(b.createdAt) - msDe(a.createdAt))
  if (abiertas.length === 0) return { oportunidadId: null, avisos: [] }
  return {
    oportunidadId: abiertas[0].id,
    avisos: abiertas.length > 1 ? [`hay ${abiertas.length} oportunidades abiertas de ${ramo}: se vincula a la más reciente`] : [],
  }
}
