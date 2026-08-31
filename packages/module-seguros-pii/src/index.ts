// ⚠️ CONTRATO DE SINCRONÍA: estas primitivas deben producir EXACTAMENTE los
// mismos ciphertexts/hashes que las de la app asegura original
// (src/lib/crypto/field-encryption.ts + src/lib/clientes/blind-index.ts,
// commit b620251) mientras las dos apps convivan sobre la misma base de datos.
// Cualquier divergencia en la normalización rompe los lookups EN SILENCIO:
// el buscador devuelve «no encontrado» para clientes que sí están.
// Claves: PII_ENCRYPTION_KEY (AES-256-GCM) y PII_LOOKUP_KEY (HMAC-SHA256),
// ambas de 64 hex. Razonado en los ADR-016 y ADR-025 del repo asegura.
export {
  encryptField,
  decryptField,
  encryptFieldNullable,
  decryptFieldNullable,
} from './field-encryption'
export {
  normalizeEmailForHash,
  normalizeTelefonoForHash,
  normalizeDniForHash,
  computeEmailLookupHash,
  computeTelefonoLookupHash,
  computeDniLookupHash,
  looksLikeFullEmail,
  looksLikeFullTelefono,
  looksLikeDniNieCif,
} from './blind-index'
