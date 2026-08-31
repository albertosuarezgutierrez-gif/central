/**
 * LOO-246 Phase 2 — Blind-index HMAC-SHA256 for exact-lookup of encrypted PII.
 *
 * Pattern: ADR-016. Para cada campo PII Tier 1 que requiera lookup exacto
 * (email, telefono), almacenamos en `clientes`:
 *   - cipher AES-256-GCM no-determinístico (confidencialidad)
 *   - hash HMAC-SHA256 hex con clave separada `PII_LOOKUP_KEY` (equality lookup)
 *
 * El hash es **determinístico** (mismo plaintext → mismo hash) → permite
 * `WHERE emailLookupHash = $1` en sign-in portal y dedup imports. La clave
 * separada limita el blast-radius si fuga: con la lookup-key un atacante puede
 * confirmar emails ya conocidos pero NO desencriptar la BD.
 *
 * Uso:
 *
 *   const normalized = normalizeEmailForHash(submittedEmail);
 *   const hash = computeEmailLookupHash(normalized);
 *   await db.select().from(clientes).where(eq(clientes.emailLookupHash, hash));
 *
 * Dev mode: si `PII_LOOKUP_KEY` ausente y `NODE_ENV !== production`, retorna
 * `null` (lookup queda sin hash → caller decide fallback). En production sin
 * key → throw (fail-fast por config inválida).
 */

import { createHmac } from "node:crypto";

const HMAC_ALGO = "sha256";
const KEY_HEX_LENGTH = 64; // 32 bytes
const KEY_HEX_RE = /^[0-9a-f]{64}$/i;

function getLookupKey(): Buffer | null {
  const hex = process.env.PII_LOOKUP_KEY?.trim();
  if (!hex) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PII_LOOKUP_KEY is required in production");
    }
    return null;
  }
  if (!KEY_HEX_RE.test(hex)) {
    throw new Error(
      `PII_LOOKUP_KEY must be exactly ${KEY_HEX_LENGTH} hex characters (256 bits)`
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Normaliza email para hash determinístico: lowercase + trim.
 *
 * Mismo normalize() debe aplicarse en sign-in lookup y en INSERT/UPDATE
 * (de lo contrario el hash no matchea y rompe el flow).
 */
export function normalizeEmailForHash(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim();
  if (trimmed.length === 0) return null;
  return trimmed.toLowerCase();
}

/**
 * Normaliza telefono para hash determinístico: solo dígitos. Descarta espacios,
 * guiones, paréntesis, prefijos `+`. Esto significa que `+34 600 12 34 56` y
 * `0034600123456` y `600123456` (si el resto es prefijo país) producirán el
 * mismo hash si los dígitos coinciden — conviene normalizar a E.164 sin `+`
 * antes de hashear si el caller necesita prefijo.
 *
 * Para MVP single-tenant España: la mayoría de phones son 9 dígitos sin
 * prefijo. Aceptable. Si futuro multi-país requiere E.164 strict, ajustar
 * aquí.
 */
export function normalizeTelefonoForHash(
  telefono: string | null | undefined
): string | null {
  if (typeof telefono !== "string") return null;
  const digits = telefono.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits;
}

/**
 * HMAC-SHA256(plaintext) con clave `PII_LOOKUP_KEY`. Devuelve `null` si:
 *  - input es null/undefined/vacío,
 *  - dev mode sin key (caller decide fallback).
 *
 * Lanza si la key existe pero está malformed.
 */
function computeLookupHash(plaintext: string | null): string | null {
  if (plaintext === null || plaintext === "") return null;
  const key = getLookupKey();
  if (!key) return null;
  return createHmac(HMAC_ALGO, key).update(plaintext, "utf8").digest("hex");
}

/**
 * Hash blind-index para email. Aplica `normalizeEmailForHash` automáticamente
 * — el caller pasa el plaintext crudo y se normaliza antes de hashear.
 *
 * Devuelve `null` si email vacío/null o dev mode sin key.
 */
export function computeEmailLookupHash(
  email: string | null | undefined
): string | null {
  const normalized = normalizeEmailForHash(email);
  return computeLookupHash(normalized);
}

/**
 * Hash blind-index para telefono. Aplica `normalizeTelefonoForHash`.
 */
export function computeTelefonoLookupHash(
  telefono: string | null | undefined
): string | null {
  const normalized = normalizeTelefonoForHash(telefono);
  return computeLookupHash(normalized);
}

/**
 * LOO-519 — Normaliza un DNI/NIE/CIF para hash determinístico: trim + uppercase
 * + strip de todo lo que no sea [A-Z0-9] (espacios, guiones, puntos). NO valida
 * la letra de control: el blind-index solo necesita una clave estable y
 * determinística; la validez del documento no es responsabilidad de este módulo.
 *
 * A diferencia de `normalizeTelefonoForHash` (solo dígitos), aquí conservamos
 * las letras porque el identificador fiscal español las lleva (NIE X/Y/Z, letra
 * de control del DNI, CIF). El MISMO normalize debe aplicarse en `resolveCliente`
 * (PR-7) y en el backfill (PR-6) o el hash no matchea y la reconciliación falla.
 *
 * Ejemplos: " 12.345.678-z " → "12345678Z"; "x-1234567-l" → "X1234567L".
 */
export function normalizeDniForHash(
  dni: string | null | undefined
): string | null {
  if (typeof dni !== "string") return null;
  const normalized = dni.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length === 0) return null;
  return normalized;
}

/**
 * LOO-519 — Hash blind-index para DNI/NIE/CIF. Aplica `normalizeDniForHash` y
 * delega en `computeLookupHash` → hereda la misma semántica que email/telefono:
 * dev sin key → `null`; production sin key → throw; key malformed → throw.
 *
 * Devuelve `null` si el DNI es vacío/null o dev mode sin key.
 */
export function computeDniLookupHash(
  dni: string | null | undefined
): string | null {
  const normalized = normalizeDniForHash(dni);
  return computeLookupHash(normalized);
}

/**
 * `true` si la value parece un email completo plausible (heurística:
 * tiene `@` y al menos un `.` después). Usado por search reformulada para
 * decidir si el query del operador es exact-match candidate (lookup vía
 * hash) o partial-match (descartar email/telefono del search).
 */
export function looksLikeFullEmail(value: string): boolean {
  const at = value.indexOf("@");
  if (at <= 0) return false;
  const domain = value.slice(at + 1);
  return domain.includes(".") && domain.length >= 3;
}

/**
 * `true` si la value es un telefono plausible (mínimo 6 dígitos contiguos
 * tras strip de no-dígitos). Usado por search reformulada.
 */
export function looksLikeFullTelefono(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 6;
}

/**
 * LOO-828 — `true` si la value parece un DNI/NIE/CIF COMPLETO plausible tras
 * `normalizeDniForHash` (el blind-index solo sirve para equality lookup, así
 * que un fragmento parcial nunca matchea — igual criterio que
 * `looksLikeFullEmail`/`looksLikeFullTelefono`). NO valida la letra de control
 * (responsabilidad fuera de este módulo, ver `normalizeDniForHash`):
 *  - DNI: 8 dígitos + letra ("12345678Z").
 *  - NIE: X/Y/Z + 7 dígitos + letra ("X1234567L").
 *  - CIF: letra de organización + 7 dígitos + dígito/letra de control ("B1234567H").
 */
export function looksLikeDniNieCif(value: string): boolean {
  const norm = normalizeDniForHash(value);
  if (!norm) return false;
  return (
    /^\d{8}[A-Z]$/.test(norm) ||
    /^[XYZ]\d{7}[A-Z]$/.test(norm) ||
    /^[A-HJNP-SUVW]\d{7}[0-9A-J]$/.test(norm)
  );
}
