/**
 * LOO-555 — Sanitizer anti-PII para campos string libres que viajan al payload
 * de `operational_events` (audit Art. 30 LOPD-GDD). Aplicar a `errorDetalle`,
 * `reason`, mensaje de excepción, o cualquier string libre del pipeline CIMA
 * ANTES de escribirlo al payload jsonb.
 *
 * Por qué: helpers de error (mensajes Postgres, exceptions Java del adapter,
 * `match.reason`/`resolved.reason`) propagan strings literales que pueden
 * contener PII Tier 1 españolas (DNI/NIE/CIF/email/teléfono). Sin sanitizer,
 * un mensaje de driver tipo `Key (dni_lookup_hash)=(00000000T)` o `INSERT
 * cliente nombre=Juan Pérez email=juan@example.com` llegaría a `payload.errorDetalle`
 * → audit hole + LOPD breach.
 *
 * Política: redact (no truncate). Truncar solo elimina PII al FINAL del mensaje
 * (memoria `feedback_truncate_error_summary_logs`). Esta función sustituye los
 * patrones por placeholders anonimizados.
 *
 * NOTA: complementa pero NO sustituye la whitelist de campos del payload. El
 * primer line of defense es NO incluir campos PII en el payload (memoria
 * `feedback_workflow_adversarial_pre_irreversible`). Este sanitizer es defensa
 * en profundidad para strings libres que SÍ entran (errorDetalle).
 */

// DNI ES: 8 dígitos + letra.
const DNI_RE = /\b\d{8}[A-HJ-NP-TV-Z]\b/gi;
// NIE ES: [XYZ] + 7 dígitos + letra.
const NIE_RE = /\b[XYZ]\d{7}[A-HJ-NP-TV-Z]\b/gi;
// CIF ES: letra + 8 dígitos (la última puede ser dígito o letra).
const CIF_RE = /\b[A-HJNPQRSUVW]\d{7}[\dA-J]\b/gi;
// Email RFC simple — suficiente para detectar en mensajes de error.
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// Teléfono ES móvil/fijo: opcionalmente prefijo +34/0034/34, luego 9 dígitos (6/7/8/9 inicial).
// Captura también 9 dígitos sueltos empezando por 6/7/8/9 (con/sin espacios entre grupos).
// Lookbehind `(?<![0-9A-Z])` para incluir el "+" del prefijo internacional (que NO es \w).
// Lookahead `(?!\d)` para no consumir dígitos extra colindantes.
const PHONE_ES_RE = /(?<![0-9A-Z])(?:(?:\+|00)?34[\s.-]?)?[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}(?!\d)/g;
// IBAN ES: ES + 22 dígitos (frecuente en EIAC recibos).
// `\s?` líder en la repetición (no trailing) para evitar consumir el espacio post-IBAN.
const IBAN_ES_RE = /\bES\d{2}(?:\s?\d{4}){5}\b/gi;

interface SanitizeOptions {
  /** Cap final de longitud post-redact. Default 200 (más estricto que `errorSummary` 500). */
  maxLength?: number;
}

/**
 * Sustituye PII española por placeholders en un string libre.
 * Aplica redact ANTES de truncar (orden importa: si trunca primero, PII al final
 * se preserva inadvertidamente).
 */
export function sanitizePiiES(input: string | null | undefined, opts: SanitizeOptions = {}): string {
  if (input == null || input === "") return "";
  const max = opts.maxLength ?? 200;
  let s = input
    .replace(DNI_RE, "[dni]")
    .replace(NIE_RE, "[nie]")
    .replace(CIF_RE, "[cif]")
    .replace(EMAIL_RE, "[email]")
    .replace(IBAN_ES_RE, "[iban]")
    .replace(PHONE_ES_RE, "[tel]");
  if (s.length > max) s = s.slice(0, max);
  return s;
}
