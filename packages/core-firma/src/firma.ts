import type {
  Art26, Evidencia, EntradaFirma, ProveedorFirma, ResultadoVerificacion,
} from './tipos'

/** Texto de consentimiento que el firmante acepta. Firma avanzada (eIDAS art. 26). */
export const TEXTO_CONSENTIMIENTO =
  'He leído el documento y lo firmo electrónicamente. Acepto que esta firma electrónica ' +
  'avanzada (Reglamento eIDAS, art. 26) queda vinculada a mi identidad y al contenido del ' +
  'documento, y tiene la misma validez que mi firma manuscrita.'

/** SHA-256 (hex) del contenido. Usa WebCrypto (Node 18+/Edge/navegador). */
export async function hashDocumento(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Normaliza un nombre para comparar (minúsculas, sin acentos, espacios colapsados). */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** ¿El nombre tecleado coincide con el del firmante? (vínculo con el firmante). */
export function nombreCoincide(tecleado: string, real: string): boolean {
  const a = norm(tecleado)
  return a.length > 0 && a === norm(real)
}

/** Evalúa las cuatro condiciones del art. 26 eIDAS sobre una evidencia. */
export function cumpleArt26(e: Evidencia): Art26 {
  const condiciones = {
    a_vinculada_al_firmante: !!e.firmante.id && nombreCoincide(e.nombre_confirmado, e.firmante.nombre),
    b_identifica_al_firmante: !!e.firmante.nombre && (!!e.firmante.email || !!e.firmante.dni),
    c_control_exclusivo: e.metodo === 'otp_email' || e.metodo === 'sesion_token',
    d_integridad_detectable: e.algoritmo === 'SHA-256' && /^[0-9a-f]{64}$/.test(e.doc_hash),
  }
  return { ok: Object.values(condiciones).every(Boolean), condiciones }
}

/** Verifica que el documento no ha cambiado desde la firma (art. 26.d). */
export function verificarIntegridad(e: Evidencia, hashActual: string): ResultadoVerificacion {
  if (e.algoritmo !== 'SHA-256') return { integro: false, motivo: 'Algoritmo no soportado' }
  if (e.doc_hash !== hashActual) {
    return { integro: false, motivo: 'El documento ha cambiado desde la firma (el hash no coincide)' }
  }
  return { integro: true }
}

/**
 * Proveedor de firma PROPIO (eIDAS art. 26). Construye la evidencia:
 * identidad del firmante + hash del documento + sello de tiempo + consentimiento + auditoría.
 * El control exclusivo lo aporta la vertical (sesión autenticada por token personal / OTP).
 */
export class FirmaPropia implements ProveedorFirma {
  id = 'propia'

  async firmar(input: EntradaFirma): Promise<Evidencia> {
    const doc_hash = await hashDocumento(input.bytes)
    if (!nombreCoincide(input.nombre_confirmado, input.firmante.nombre)) {
      throw new Error('El nombre confirmado no coincide con el firmante')
    }
    return {
      version: 1,
      proveedor: this.id,
      firmante: input.firmante,
      documento_id: input.documento_id,
      doc_hash,
      algoritmo: 'SHA-256',
      sello_tiempo: input.contexto.fecha,
      metodo: input.metodo,
      contexto: input.contexto,
      consentimiento: TEXTO_CONSENTIMIENTO,
      nombre_confirmado: input.nombre_confirmado.trim(),
    }
  }

  verificar(evidencia: Evidencia, hashActual: string): ResultadoVerificacion {
    return verificarIntegridad(evidencia, hashActual)
  }
}
