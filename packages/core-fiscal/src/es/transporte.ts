// Interfaz del TRANSPORTE a la AEAT (VeriFactu). Aquí no hay envío real ni firma: solo el contrato.
//
// Cada app inyecta su implementación (certificado del obligado o de un colaborador social, mTLS, reintentos).
// Regla de la casa: «no se sabe» ≠ «falló» ≠ «no se envió». Un timeout NO es un rechazo: es `incierto`, y quien
// lo recibe NO reenvía a ciegas (consulta antes el estado en la AEAT), porque un duplicado es otro error.

import type { EntornoAeat } from './qr.ts'

export const ENDPOINT_VERIFACTU: Record<EntornoAeat, string> = {
  produccion: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  pruebas:    'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
}

export interface PeticionEnvio {
  /** Documento completo (xmlSuministroLR con `soap: true`). */
  xml:          string
  nifObligado:  string
  entorno:      EntornoAeat
}

export interface ErrorRegistroAeat { numSerie: string | null; codigo: string; descripcion: string }

export type RespuestaTransporte =
  /** La AEAT aceptó todos los registros. */
  | { estado: 'aceptado'; csv: string | null; respuestaXml: string }
  /** Aceptado con errores admisibles: hay que subsanar los registros indicados. */
  | { estado: 'aceptado_con_errores'; csv: string | null; respuestaXml: string; errores: ErrorRegistroAeat[] }
  /** Rechazado (todo o parte): los registros rechazados NO constan en la AEAT. */
  | { estado: 'rechazado'; respuestaXml: string; errores: ErrorRegistroAeat[] }
  /** No se intentó (transporte desactivado, sin certificado…): seguro que no llegó. */
  | { estado: 'no_enviado'; motivo: string }
  /** Se intentó y no se sabe si llegó (timeout, conexión cortada): NO reintentar sin consultar. */
  | { estado: 'incierto'; motivo: string }

export interface TransporteVerifactu {
  enviar(peticion: PeticionEnvio): Promise<RespuestaTransporte>
}

/** Transporte que no envía nada (fase actual): siempre `no_enviado` con el motivo dado. */
export function transporteDesactivado(motivo = 'Envío a la AEAT desactivado'): TransporteVerifactu {
  return { enviar: async () => ({ estado: 'no_enviado', motivo }) }
}
