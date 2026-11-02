/**
 * PORT central (fase 3): copia LITERAL de `encryptClientePiiInput` de
 * `asegura/src/lib/clientes/pii.ts` (el único helper de ese fichero que usa la ingesta).
 * Cripto e índice ciego de `@central/module-seguros-pii` (mismos hashes que el CRM).
 */
import {
  computeDniLookupHash,
  computeEmailLookupHash,
  computeTelefonoLookupHash,
  encryptFieldNullable,
} from "@central/module-seguros-pii";


/**
 * Encrypt los campos Phase 1 + Phase 2 antes de INSERT/UPDATE. Devuelve además
 * `emailLookupHash`, `telefonoLookupHash` y `dniLookupHash` (LOO-828)
 * calculados sobre el plaintext normalizado (lower+trim para email,
 * digits-only para telefono, uppercase+strip-no-alfanumérico para dni —
 * `normalizeDniForHash` LOO-519) — el caller usa el spread sin pensar en el
 * helper blind-index.
 *
 * Si lookup key ausente (dev mode sin `PII_LOOKUP_KEY`), los hashes salen
 * `null`. El cipher se mantiene plaintext en dev sin `PII_ENCRYPTION_KEY`.
 * Input dni null/undefined/vacío → `dniLookupHash: null` (coherente con la
 * semántica de email/telefono).
 */
export function encryptClientePiiInput(input: {
  dni?: string | null;
  fechaNacimiento?: string | null;
  direccion?: string | null;
  email?: string | null;
  telefono?: string | null;
}): {
  dni: string | null;
  fechaNacimiento: string | null;
  direccion: string | null;
  email: string | null;
  telefono: string | null;
  emailLookupHash: string | null;
  telefonoLookupHash: string | null;
  dniLookupHash: string | null;
} {
  return {
    dni: encryptFieldNullable(input.dni ?? null) ?? null,
    fechaNacimiento:
      encryptFieldNullable(input.fechaNacimiento ?? null) ?? null,
    direccion: encryptFieldNullable(input.direccion ?? null) ?? null,
    email: encryptFieldNullable(input.email ?? null) ?? null,
    telefono: encryptFieldNullable(input.telefono ?? null) ?? null,
    emailLookupHash: computeEmailLookupHash(input.email ?? null),
    telefonoLookupHash: computeTelefonoLookupHash(input.telefono ?? null),
    dniLookupHash: computeDniLookupHash(input.dni ?? null),
  };
}
