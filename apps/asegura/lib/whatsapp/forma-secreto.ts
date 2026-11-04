// Helpers PUROS de secretos (sin imports de workspace, para poder testearlos con node --test).

/** Quita espacios/saltos de línea de los bordes (típico al pegar en Vercel); vacío → null. */
export function recortarSecreto(v: string): string | null {
  const t = v.trim()
  return t === '' ? null : t
}

/** Diagnóstico de la FORMA de un secreto (valor crudo, sin trim) sin revelar ningún carácter suyo. */
export function formaSecreto(v: string | null): string {
  if (v === null) return 'ausente'
  const t = v.trim()
  return `len=${v.length} hex=${/^[0-9a-f]+$/i.test(t)} espacios_borde=${v !== t}`
}
