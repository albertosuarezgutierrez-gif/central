// Varios contactos por compañía aseguradora (docs/superpowers/specs/
// 2026-09-13-companias-contactos-multiples-design.md). `area` es una lista
// CERRADA a propósito: si fuera texto libre, el minado de correo acabaría
// escribiendo "ventas"/"comercial"/"vendedor" como si fueran tres cosas
// distintas, y no se podría resaltar el contacto correcto por contexto.

export const AREAS_CONTACTO = [
  'comercial',
  'siniestros',
  'administracion',
  'tecnico',
  'general',
] as const

export type AreaContacto = (typeof AREAS_CONTACTO)[number]

const ETIQUETAS_AREA: Record<AreaContacto, string> = {
  comercial: 'Comercial',
  siniestros: 'Siniestros',
  administracion: 'Administración',
  tecnico: 'Técnico',
  general: 'General',
}

/** `null` = no está en la lista cerrada (o no se ha clasificado) — nunca se inventa un valor. */
export function areaContacto(v: unknown): AreaContacto | null {
  return typeof v === 'string' && (AREAS_CONTACTO as readonly string[]).includes(v)
    ? (v as AreaContacto)
    : null
}

export function etiquetaArea(a: AreaContacto | null): string | null {
  return a === null ? null : ETIQUETAS_AREA[a]
}

export type ContactoCompania = {
  id: string
  nombre: string
  cargo: string | null
  area: AreaContacto | null
  email: string | null
  telefono: string | null
  notas: string | null
  orden: number
  ultimoContactoEn: string | null
}

/**
 * Orden de pintado: por `orden` ascendente (el migrado desde el contacto
 * único nace en 0 y sale primero salvo que se reordene a mano).
 */
export function ordenarContactos(contactos: ContactoCompania[]): ContactoCompania[] {
  return [...contactos].sort((a, b) => a.orden - b.orden)
}

/**
 * El contacto a DESTACAR cuando el llamador ya sabe el motivo (p. ej. una
 * ficha de siniestro abierto). Si hay uno con esa `area`, el primero por
 * orden; si no hay ninguno clasificado así, `null` — nunca se elige "el que
 * más se parece", eso sería inventar una coincidencia.
 */
export function contactoDestacado(
  contactos: ContactoCompania[],
  area: AreaContacto,
): ContactoCompania | null {
  const de = ordenarContactos(contactos).filter((c) => c.area === area)
  return de[0] ?? null
}
