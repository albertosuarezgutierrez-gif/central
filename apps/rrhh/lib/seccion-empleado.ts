// Secciones del portal del empleado (/e). Viven en la URL (`#documentos` o `?seccion=documentos`) para que
// enlaces y avisos push sigan funcionando. Módulo puro: se testea sin navegador.
export const SECCIONES = ['inicio', 'documentos', 'vacaciones', 'fichaje'] as const
export type Seccion = (typeof SECCIONES)[number]

export function esSeccion(v: unknown): v is Seccion {
  return typeof v === 'string' && (SECCIONES as readonly string[]).includes(v)
}

/** Sección pedida por la URL: primero el hash, luego `?seccion=`; cualquier otra cosa = inicio. */
export function seccionDeUrl(hash: string, search: string): Seccion {
  const h = hash.replace(/^#/, '').trim().toLowerCase()
  if (esSeccion(h)) return h
  const q = new URLSearchParams(search).get('seccion')?.trim().toLowerCase()
  return esSeccion(q) ? q : 'inicio'
}

/** Sin fichaje en la empresa, la sección «fichaje» no existe y su enlace cae en inicio. */
export function seccionDisponible(s: Seccion, tieneFichaje: boolean): Seccion {
  return s === 'fichaje' && !tieneFichaje ? 'inicio' : s
}
