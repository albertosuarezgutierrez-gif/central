// apps/plataforma/lib/normalizar-contraparte.ts
// Normaliza el nombre de un comercio/contraparte para usarlo como CLAVE de regla aprendida
// (banca_destino_reglas). Módulo PURO (sin BD ni SDKs) para que lo importen el barrido de
// subcategorías y la ruta de asignación sin arrastrar dependencias pesadas.
export function normalizarContraparte(raw: string | null): string {
  if (!raw) return ''
  return raw
    .toUpperCase()
    .replace(/\b\d{3,}\b/g, '')
    .replace(/\bS\.?A\.?\b/g, '')
    .replace(/\bSL\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
