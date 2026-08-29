// Constantes puras de sivra — sin dependencias de servidor.
// Importables desde componentes cliente ('use client') y desde lib/ de servidor.

export const CATEGORIAS_GASTO = [
  'ALQUILER', 'LIMPIEZA', 'MANTENIMIENTO', 'SUMINISTROS', 'COMUNIDAD',
  'SEGURO', 'IMPUESTOS', 'PLATAFORMAS', 'MOBILIARIO', 'REFORMAS', 'OTRO',
] as const

export type CategoriaGasto = typeof CATEGORIAS_GASTO[number]

// Propiedades de Alberto para gastos (incluye compartidos y personal)
export const PROPS_GASTO = [
  { id: 'prop_busto_reform',       name: 'Busto Reform' },
  { id: 'prop_duplex_center',      name: 'Duplex Center' },
  { id: 'prop_house_sevillana',    name: 'House Sevillana' },
  { id: 'prop_luxury_busto',       name: 'Luxury Busto' },
  { id: 'prop_multi_apartamentos', name: 'Gastos compartidos' },
  { id: 'prop_personal',           name: 'Personal (no pisos)' },
] as const

export const PROP_NAMES_GASTO: Record<string, string> = Object.fromEntries(
  PROPS_GASTO.map(p => [p.id, p.name])
)

// Propiedades para visualización en calendario (4 pisos activos con Smoobu)
export const PROPS_CALENDARIO = [
  { id: 'prop_house_sevillana', label: 'House Sevillana', color: '#84cc16', short: 'HS' },
  { id: 'prop_busto_reform',    label: 'Busto Reform',    color: '#f59e0b', short: 'BR' },
  { id: 'prop_duplex_center',   label: 'Duplex Center',   color: '#10b981', short: 'DC' },
  { id: 'prop_luxury_busto',    label: 'Luxury Busto',    color: '#ef4444', short: 'LB' },
] as const

// Slugs de los 4 pisos de Alberto en cleaning_sessions/incomes. Sirve para acotar las consultas
// de limpiezas a SUS pisos (cleaning_sessions es multi-tenant: ialimp escribe ahí las de otras
// empresas con propiedad_id uuid; sin este filtro se ven sesiones ajenas).
export const PROPS_CALENDARIO_IDS: string[] = PROPS_CALENDARIO.map(p => p.id)
