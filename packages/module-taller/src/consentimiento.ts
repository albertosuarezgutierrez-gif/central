// Consentimientos del cliente final del taller (spec §6) y GUARDIA del puente a `seguros`.
//
// Dos casillas, dos finalidades, sin marcar y sin condicionar el servicio (RGPD art. 7.4):
//   - `asegura`: que Grupo ASegura le contacte para ofrecerle seguros. Texto y versión FIJOS aquí:
//     NO es configuración del taller (decisión de Alberto, 04/11/2026).
//   - `taller_comercial`: promociones propias del taller. Su texto SÍ lo configura el taller (`TextosTaller`).
//
// Registro solo-añadir (`taller.consentimientos`): una fila por otorgamiento; retirar = poner `retiradoEn`
// (única modificación permitida). El estado VIGENTE es la fila más reciente de esa finalidad.
// Ante la duda, NO hay consentimiento: fila futura, texto que no coincide o versión desconocida = no vale.

export const FINALIDADES_CONSENTIMIENTO = ['asegura', 'taller_comercial'] as const
export type FinalidadConsentimiento = (typeof FINALIDADES_CONSENTIMIENTO)[number]

export const CANALES_CONSENTIMIENTO = ['recepcion', 'presupuesto_casa', 'app'] as const
export type CanalConsentimiento = (typeof CANALES_CONSENTIMIENTO)[number]

/**
 * Textos de la casilla de Grupo ASegura por versión, palabra por palabra. Una versión nueva se AÑADE
 * (nunca se reescribe una existente): las filas antiguas siguen probando lo que la persona vio.
 * ⚠️ Borrador hasta F0 (texto legal revisado por Alberto).
 */
export const TEXTOS_CONSENTIMIENTO_ASEGURA: Readonly<Record<string, string>> = Object.freeze({
  '2026-11-t1': 'Acepto que Grupo ASegura me contacte para ofrecerme seguros.',
})
/** La versión que se enseña HOY en recepción, presupuesto desde casa y app. */
export const VERSION_TEXTO_ASEGURA_VIGENTE = '2026-11-t1'

export interface Consentimiento {
  id: string
  tallerId: string
  clienteId: string
  finalidad: FinalidadConsentimiento
  /** Casilla marcada. Una fila con false documenta que se le ofreció y no aceptó. */
  otorgado: boolean
  versionTexto: string
  /** Texto exacto que se mostró. */
  textoMostrado: string
  canal: CanalConsentimiento
  otorgadoEn: Date
  retiradoEn: Date | null
}

/** Fila más reciente de esa finalidad para ese cliente y taller, sin contar filas con fecha futura. */
export function ultimoConsentimiento(
  consentimientos: readonly Consentimiento[],
  tallerId: string,
  clienteId: string,
  finalidad: FinalidadConsentimiento,
  hoy: Date,
): Consentimiento | null {
  let ultimo: Consentimiento | null = null
  for (const c of consentimientos) {
    if (c.tallerId !== tallerId || c.clienteId !== clienteId || c.finalidad !== finalidad) continue
    if (c.otorgadoEn.getTime() > hoy.getTime()) continue
    if (!ultimo || c.otorgadoEn.getTime() > ultimo.otorgadoEn.getTime()) ultimo = c
  }
  return ultimo
}

export type MotivoSinConsentimiento =
  | 'sin_registro'
  | 'no_otorgado'
  | 'retirado'
  | 'version_no_registrada'
  | 'texto_no_coincide'
  | 'canal_desconocido'
  | 'consentimiento_no_coincide'

export type DecisionConsentimiento =
  | { permitido: true; consentimientoId: string; versionTexto: string }
  | { permitido: false; motivo: MotivoSinConsentimiento }

function evaluar(c: Consentimiento | null): DecisionConsentimiento {
  if (!c) return { permitido: false, motivo: 'sin_registro' }
  if (c.otorgado !== true) return { permitido: false, motivo: 'no_otorgado' }
  if (c.retiradoEn !== null) return { permitido: false, motivo: 'retirado' }
  if (!(CANALES_CONSENTIMIENTO as readonly string[]).includes(c.canal)) return { permitido: false, motivo: 'canal_desconocido' }
  return { permitido: true, consentimientoId: c.id, versionTexto: c.versionTexto }
}

/** Consentimiento vigente de Grupo ASegura: otorgado, no retirado y con una versión de texto REGISTRADA aquí. */
export function consentimientoAseguraVigente(
  consentimientos: readonly Consentimiento[],
  tallerId: string,
  clienteId: string,
  hoy: Date,
): DecisionConsentimiento {
  const c = ultimoConsentimiento(consentimientos, tallerId, clienteId, 'asegura', hoy)
  const d = evaluar(c)
  if (!d.permitido || !c) return d
  const texto = Object.prototype.hasOwnProperty.call(TEXTOS_CONSENTIMIENTO_ASEGURA, c.versionTexto)
    ? TEXTOS_CONSENTIMIENTO_ASEGURA[c.versionTexto]
    : undefined
  if (texto === undefined) return { permitido: false, motivo: 'version_no_registrada' }
  if (c.textoMostrado !== texto) return { permitido: false, motivo: 'texto_no_coincide' }
  return d
}

/** Consentimiento vigente para promociones del propio taller (texto configurable, debe constar). */
export function consentimientoTallerVigente(
  consentimientos: readonly Consentimiento[],
  tallerId: string,
  clienteId: string,
  hoy: Date,
): DecisionConsentimiento {
  const c = ultimoConsentimiento(consentimientos, tallerId, clienteId, 'taller_comercial', hoy)
  const d = evaluar(c)
  if (!d.permitido || !c) return d
  if (!c.versionTexto.trim() || !c.textoMostrado.trim()) return { permitido: false, motivo: 'version_no_registrada' }
  return d
}

export interface SolicitudLead {
  tallerId: string
  clienteId: string
  /** El id de consentimiento que el puente enviará a `/api/operador/*`. Debe ser el VIGENTE. */
  consentimientoId: string | null
}

/**
 * 🚨 GUARDIA DEL PUENTE A `seguros`. Un lead del taller solo sale si el cliente tiene el consentimiento
 * de Grupo ASegura vigente y el id que se va a enviar es exactamente ese. Destino (apps/asegura) vuelve a
 * comprobarlo; esto es el rechazo en ORIGEN. Cepo: test/consentimiento.test.ts («guardián lead»).
 */
export function decidirLeadSeguros(
  solicitud: SolicitudLead,
  consentimientos: readonly Consentimiento[],
  hoy: Date,
): DecisionConsentimiento {
  const d = consentimientoAseguraVigente(consentimientos, solicitud.tallerId, solicitud.clienteId, hoy)
  if (!d.permitido) return d
  if (solicitud.consentimientoId !== d.consentimientoId) return { permitido: false, motivo: 'consentimiento_no_coincide' }
  return d
}
