// ¿La fila de `gastos` está VIGENTE (no descartada como duplicado)? Módulo PURO.
//
// `gastos.descartado_at` lo crea `prisma/sql/2026-10-04_gastos_titular.sql` (aplicación con gate
// de 2 ojos, DESPUÉS del despliegue). Para no depender del orden se lee vía `to_jsonb(fila)`: si la
// columna no existe, `->> 'descartado_at'` es NULL y la fila cuenta como vigente (lo mismo que hoy);
// si existe, filtra de verdad. Sin detección, sin caché y sin vista (una vista pediría GRANTs y
// RLS propios, y el código que la nombrase rompería mientras no exista).
// Coste: `to_jsonb` por fila sobre una tabla de cientos de filas; despreciable. Cuando la migración
// esté aplicada en todos los entornos se puede cambiar el cuerpo por `<alias>.descartado_at IS NULL`
// (un solo sitio).

const IDENT = /^[a-z_][a-z0-9_]*$/

/**
 * Predicado SQL para el WHERE. `alias` = cómo se llama la fila en ESA consulta: `gastos` si va
 * `FROM gastos` a secas, `g` si va `FROM gastos g`. Va a `Prisma.raw`: solo admite un identificador.
 */
export function sqlGastoVigente(alias = 'gastos'): string {
  if (!IDENT.test(alias)) throw new Error(`sqlGastoVigente: alias no válido «${alias}»`)
  return `(to_jsonb(${alias}) ->> 'descartado_at') IS NULL`
}

/** La misma regla en memoria. `undefined` (columna inexistente) y `null` = vigente. */
export function esGastoVigente(f: { descartado_at?: string | Date | null }): boolean {
  return f.descartado_at == null
}
