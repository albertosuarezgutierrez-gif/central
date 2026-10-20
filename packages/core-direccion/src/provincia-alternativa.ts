// El nombre CLÁSICO de una provincia bilingüe, para preguntarle al callejero del Catastro (servicio de los 90) cuando el nombre
// CO-OFICIAL moderno de `provinciaPorCp()` no encuentra nada. Copia de `apps/asegura/lib/direccion/provincia.ts` (que podrá
// reexportar de aquí).
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
