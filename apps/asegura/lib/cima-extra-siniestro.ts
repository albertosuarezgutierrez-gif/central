// «Más datos de CIMA» de un siniestro (solo operador): normalización PURA, sin BD, para poder testearla.

/** `cimaExtra` crudo de `cima_extra`: `null` si la clave no es una lista (null ≠ []); solo pares {ruta, valor} de texto. */
export function leerCimaExtraSiniestro(v: unknown): Array<{ ruta: string; valor: string }> | null {
  if (!Array.isArray(v)) return null
  const out: Array<{ ruta: string; valor: string }> = []
  for (const it of v) {
    if (it && typeof it === 'object' && typeof (it as { ruta?: unknown }).ruta === 'string' && typeof (it as { valor?: unknown }).valor === 'string') {
      out.push({ ruta: (it as { ruta: string }).ruta, valor: (it as { valor: string }).valor })
    }
  }
  return out
}
