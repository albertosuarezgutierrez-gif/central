import type {
  PuntoControl,
  ResultadoControl,
  ElaboracionTraza,
  VeredictoSalida,
  TipoControl,
} from './types.ts'

// Umbrales del parte real (Catering Joaquín Jaén).
const OBJETIVO = {
  termico: 70,        // Tª interior > 70 °C
  abatimiento: 10,    // bajar a ≤ 10 °C…
  abatimiento_min: 120, // …en < 2 h
  congelacion: -18,   // ≤ −18 °C
  refrigeracion: 4,   // ≤ 4 °C
} as const

/** Texto legible del objetivo de cada control (para UI/dossier). */
export function objetivoControl(tipo: TipoControl): string {
  switch (tipo) {
    case 'termico': return 'Tª interior > 70 °C mantenida 2 min'
    case 'abatimiento': return 'De 60 °C a ≤ 10 °C en < 2 h'
    case 'congelacion': return 'Conservación ≤ −18 °C'
    case 'refrigeracion': return 'Conservación ≤ 4 °C'
  }
}

/**
 * Valida un punto de control contra su objetivo APPCC.
 * - Sin `valor` → no registrado (conforme=false, motivo "sin registrar").
 * - termico:     conforme si valor > 70.
 * - abatimiento: conforme si valor ≤ 10 Y minutos < 120 (si se aportan minutos).
 * - congelacion: conforme si valor ≤ −18.
 * - refrigeracion: conforme si valor ≤ 4.
 */
export function validarPuntoControl(p: PuntoControl): ResultadoControl {
  const v = p.valor
  if (v == null || !Number.isFinite(v)) {
    return { tipo: p.tipo, registrado: false, conforme: false, motivo: 'sin registrar' }
  }
  let conforme = false
  let motivo: string | undefined
  switch (p.tipo) {
    case 'termico':
      conforme = v > OBJETIVO.termico
      if (!conforme) motivo = `Tª ${v} °C ≤ 70 °C (no alcanza tratamiento térmico)`
      break
    case 'abatimiento': {
      const tempOk = v <= OBJETIVO.abatimiento
      const tiempoOk = p.minutos == null || p.minutos < OBJETIVO.abatimiento_min
      conforme = tempOk && tiempoOk
      if (!tempOk) motivo = `Tª ${v} °C > 10 °C (no abate)`
      else if (!tiempoOk) motivo = `${p.minutos} min ≥ 2 h (abatimiento lento)`
      break
    }
    case 'congelacion':
      conforme = v <= OBJETIVO.congelacion
      if (!conforme) motivo = `Tª ${v} °C > −18 °C`
      break
    case 'refrigeracion':
      conforme = v <= OBJETIVO.refrigeracion
      if (!conforme) motivo = `Tª ${v} °C > 4 °C`
      break
  }
  return { tipo: p.tipo, registrado: true, conforme, motivo }
}

/** Valida todos los controles de una elaboración. */
export function validarControles(elab: ElaboracionTraza): ResultadoControl[] {
  return elab.controles.map(validarPuntoControl)
}

/**
 * ¿La elaboración puede expedirse? (mi idea: BLOQUEO de salida).
 * No es apta si falta registrar algún control, si alguno está fuera de rango,
 * si requiere muestra testigo y no se ha guardado, o si no está firmada.
 */
export function evaluarSalida(elab: ElaboracionTraza): VeredictoSalida {
  const resultados = validarControles(elab)
  const faltan_controles = resultados.filter(r => !r.registrado).map(r => r.tipo)
  const no_conformes = resultados.filter(r => r.registrado && !r.conforme).map(r => r.tipo)
  const sin_muestra_testigo = elab.muestra_testigo !== true
  const sin_firma = !elab.firma || elab.firma.trim() === ''
  const apta =
    faltan_controles.length === 0 &&
    no_conformes.length === 0 &&
    !sin_muestra_testigo &&
    !sin_firma
  return { apta, faltan_controles, no_conformes, sin_muestra_testigo, sin_firma }
}
