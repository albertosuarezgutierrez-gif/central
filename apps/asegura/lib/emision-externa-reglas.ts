// Reglas puras de `emision-externa.ts` (sin BD ni red), aparte para poder testearlas con `node --test`.

/**
 * La misma coincidencia que `/emitir`: nombre común del catálogo vs el del vendor.
 * Un nombre vacío (tras trim) NO coincide con nada: `includes('')` es siempre true y acuñaría con
 * cualquier compañía del catálogo.
 */
export function coincideCompania(nombreComun: string, aseguradora: string): boolean {
  const a = nombreComun.trim().toLowerCase()
  const b = aseguradora.trim().toLowerCase()
  if (a === '' || b === '') return false
  return a === b || a.includes(b) || b.includes(a)
}
