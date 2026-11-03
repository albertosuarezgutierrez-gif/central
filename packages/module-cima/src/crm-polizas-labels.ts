/**
 * Copia LITERAL de `src/lib/polizas/labels.ts` del CRM (repo `asegura`), solo la
 * parte que consume `eiac-pol-mapper` (`CIMA_DGS_CARRIERS` + `nombreCarrierCima`).
 * Portada tal cual para que el mapper produzca exactamente la misma salida.
 * Unificar con el catálogo de compañías de `@central/module-seguros` es un paso
 * aparte (cambiaría el nombre de compañía que se persiste).
 */
/**
 * LOO-743 — Procedencia CIMA. Una poliza esta "sincronizada con CIMA" cuando
 * trae la huella del XML EIAC (`eiacXmlHash`) que la origino/refresco desde el
 * feed oficial de TIREA. Client-safe (sin imports de `@/db`).
 *
 * `CIMA_DGS_CARRIERS`: codigo DGS (clave administrativa DGSFP) -> nombre de
 * compania, verificados contra el registro oficial DGSFP. Ojo: C0058 = **Mapfre**
 * y C0109 = **Allianz** (se confirmo tras corregir un error de etiquetado que
 * daba ambos por Allianz). El resto del set MVP se anade cuando emitan.
 */
export const CIMA_DGS_CARRIERS: Record<string, string> = {
  C0058: "Mapfre",
  C0109: "Allianz",
  C0072: "Generali",
  C0468: "Occident",
  C0613: "Reale",
};

/** Nombre de compania a partir del codigo DGS, o `null` si no esta mapeado. */
export function nombreCarrierCima(
  codigoEntidadDgs: string | null | undefined,
): string | null {
  if (!codigoEntidadDgs) return null;
  return CIMA_DGS_CARRIERS[codigoEntidadDgs.trim().toUpperCase()] ?? null;
}
