// Proyección PÚBLICA (public-safe) de una firma para la página de verificación /v/[id].
// Módulo PURO (sin prisma) para poder testearlo aislado. NUNCA incluir campos sensibles
// (ip, user_agent, email, dni, empleado_id, empresa_id, evidencia).

export type FirmaPublica = {
  firmante_nombre: string
  sello_tiempo: string
  doc_hash: string
  algoritmo: string
  metodo: string
  documento_nombre: string
}

const ETIQUETA_METODO: Record<string, string> = {
  otp_email: 'Firma avanzada con código por email (OTP)',
  sesion_token: 'Firma avanzada con sesión autenticada',
}
export const etiquetaMetodo = (m: string) => ETIQUETA_METODO[m] ?? m

/**
 * Toma una fila cruda de `rrhh.firmas` (+ nombre de documento) y devuelve SOLO los campos
 * públicos. Cualquier campo sensible que venga en `row` se descarta a propósito.
 */
export function aFirmaPublica(row: {
  firmante_nombre: string
  sello_tiempo: unknown
  doc_hash: string
  algoritmo: string
  metodo: string
  documento_nombre: string
}): FirmaPublica {
  return {
    firmante_nombre: row.firmante_nombre,
    sello_tiempo: String(row.sello_tiempo),
    doc_hash: row.doc_hash,
    algoritmo: row.algoritmo,
    metodo: row.metodo,
    documento_nombre: row.documento_nombre,
  }
}
