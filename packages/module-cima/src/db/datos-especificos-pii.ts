/**
 * PORT central (fase 3): copia LITERAL de `encryptPolizaDatosEspecificos` de
 * `asegura/src/lib/polizas/datos-especificos-pii.ts` (lo único que usa la ingesta).
 *
 * LOO-421 / LOO-711 — El IBAN es PII financiera y la `direccion` de riesgo es PII
 * Tier-1: ambas van AES-256-GCM. Semántica conservadora `field in out`: NO inyecta
 * claves ausentes, string vacío no se cifra, valores no-string intactos.
 */
import { encryptFieldNullable } from "@central/module-seguros-pii";

/** Claves PII dentro de `datosEspecificos` que se cifran en reposo. */
export const POLIZA_DATOS_PII_FIELDS = ["iban", "direccion"] as const;

/** Cifra las claves PII del objeto `datosEspecificos` antes de persistir. */
export function encryptPolizaDatosEspecificos(
  datos: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...datos };
  for (const field of POLIZA_DATOS_PII_FIELDS) {
    if (!(field in out)) continue;
    const v = out[field];
    out[field] =
      typeof v === "string" && v.length > 0
        ? (encryptFieldNullable(v) ?? null)
        : v;
  }
  return out;
}
