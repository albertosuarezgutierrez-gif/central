// Puertos de la orquestación RR.HH. AGNÓSTICA DE VERTICAL.
// El módulo no sabe si el titular es un empleado (rrhh) o una limpiadora (ialimp): cada
// vertical inyecta su acceso a BD/Storage/email implementando estos puertos.

import type { Evidencia, Firmante, ContextoFirma } from '@central/core-firma'

/** Documento firmable, ya cargado por la vertical (scoped a su owner + empresa). */
export interface DocFirmable {
  /** Estado de firma actual: 'sin_firma' | 'pendiente' | 'firmado' (o el que use la vertical). */
  estadoFirma: string
  /** Ruta del binario en el Storage de la vertical (para hashear al firmar). */
  storagePath: string
  /** Identidad del titular que debe firmar (nombre/email/dni). */
  titular: Firmante
}

/** OTP vigente para un documento, tal como lo persiste la vertical (código hasheado). */
export interface OtpGuardado {
  codigoHash: string
  expiraAt: string | Date
  intentos: number
}

/**
 * Puerto de persistencia del flujo de firma. Cada vertical lo implementa con SU SQL/tablas
 * (rrhh: `rrhh.documentos/firmas/firma_otps`; ialimp: `documentos/firmas/firma_otps_limpiadora`).
 * El módulo solo orquesta; la persistencia y el scope multi-tenant viven en la implementación.
 */
export interface RepoFirma {
  /** Carga el documento firmable. Devuelve null si no existe / no pertenece al owner. */
  cargarDoc(docId: string): Promise<DocFirmable | null>
  /** Upsert del OTP (hasheado) del documento, reiniciando intentos. */
  guardarOtp(docId: string, codigoHash: string, expiraAt: Date): Promise<void>
  /** Carga el OTP vigente del documento, o null si no se emitió. */
  cargarOtp(docId: string): Promise<OtpGuardado | null>
  /** Suma 1 a los intentos del OTP del documento. */
  sumarIntentoOtp(docId: string): Promise<void>
  /** Marca el documento como pendiente de firma. */
  marcarPendiente(docId: string): Promise<void>
  /**
   * Registra la firma de forma ATÓMICA: inserta la evidencia, marca el documento 'firmado'
   * y borra el OTP. La vertical lo resuelve en una transacción.
   */
  registrarFirma(docId: string, evidencia: Evidencia, contexto: ContextoFirma): Promise<void>
}

/** Puerto de envío del código OTP al titular. Cada vertical usa su remitente (Resend propio). */
export interface PuertoEmailFirma {
  /** Envía el código al titular. Devuelve true si se envió correctamente. */
  enviarCodigo(opts: { to: string; nombre: string; codigo: string }): Promise<boolean>
}

/** Puerto de descarga del binario del documento (para calcular el hash de integridad). */
export interface PuertoDescarga {
  descargar(storagePath: string): Promise<ArrayBuffer>
}
