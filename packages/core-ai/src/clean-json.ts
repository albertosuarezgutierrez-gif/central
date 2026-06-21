/**
 * Limpia el markdown (```json … ```) que algunos modelos añaden alrededor del
 * JSON. Función pura, sin dependencias. Implementación canónica del núcleo IA.
 */
export function cleanJSON(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}
