// Tipos del núcleo de firma. Puros y portables (sin acoplar a ninguna vertical).

/** Quién firma. La vertical rellena estos datos desde su modelo (empleado, etc.). */
export interface Firmante {
  /** Id estable del firmante en su vertical (empleado_id en rrhh). */
  id: string
  nombre: string
  email?: string | null
  dni?: string | null
}

/** Sello de tiempo + datos de auditoría del momento de la firma. */
export interface ContextoFirma {
  /** ISO 8601. Sello de tiempo de la firma. */
  fecha: string
  ip?: string | null
  user_agent?: string | null
}

/** Cómo se ejerció el control exclusivo del firmante (eIDAS art.26.c). */
export type MetodoFirma = 'sesion_token' | 'otp_email'

/** Lo que la vertical pasa al proveedor para firmar. */
export interface EntradaFirma {
  firmante: Firmante
  documento_id: string
  /** Contenido EXACTO del documento que se firma (para el hash de integridad). */
  bytes: Uint8Array | ArrayBuffer
  contexto: ContextoFirma
  metodo: MetodoFirma
  /** Nombre tecleado por el firmante al confirmar (vínculo con el firmante). */
  nombre_confirmado: string
}

/** Evidencia de firma: el artefacto verificable que se persiste. */
export interface Evidencia {
  version: 1
  proveedor: string
  firmante: Firmante
  documento_id: string
  /** SHA-256 (hex) del contenido firmado. Detecta alteraciones posteriores (eIDAS art.26.d). */
  doc_hash: string
  algoritmo: 'SHA-256'
  /** ISO 8601. */
  sello_tiempo: string
  metodo: MetodoFirma
  contexto: ContextoFirma
  /** Texto del consentimiento aceptado por el firmante. */
  consentimiento: string
  nombre_confirmado: string
}

export interface ResultadoVerificacion {
  integro: boolean
  motivo?: string
}

/** Las cuatro condiciones del art. 26 eIDAS, evaluadas sobre una evidencia. */
export interface Art26 {
  ok: boolean
  condiciones: {
    a_vinculada_al_firmante: boolean
    b_identifica_al_firmante: boolean
    c_control_exclusivo: boolean
    d_integridad_detectable: boolean
  }
}

/** Puerto: un proveedor de firma (propia, Firmafy, …) implementa esto. */
export interface ProveedorFirma {
  id: string
  firmar(input: EntradaFirma): Promise<Evidencia>
  verificar(evidencia: Evidencia, hashActual: string): ResultadoVerificacion
}
