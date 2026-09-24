// El nombre CLÁSICO de una provincia bilingüe, para preguntarle al callejero
// del Catastro (servicio de los 90) cuando el nombre CO-OFICIAL moderno de
// `provinciaPorCp()` no encuentra nada. Extraído de `codeoscopic/tipo-via-catastro.ts`
// el 21/09/2026 para que el confirmador genérico de direcciones lo reutilice
// sin duplicar la tabla.
const PROVINCIA_CLASICA: Record<string, string> = {
  bizkaia: 'Vizcaya',
  gipuzkoa: 'Guipúzcoa',
  araba: 'Álava',
  'a coruña': 'La Coruña',
  girona: 'Gerona',
  lleida: 'Lérida',
  ourense: 'Orense',
  'illes balears': 'Baleares',
}

export function provinciaAlternativa(provincia: string): string | null {
  return PROVINCIA_CLASICA[provincia.trim().toLowerCase()] ?? null
}
