// Familia de un seguro para las tarjetas de «Inicio» del portal (spec 24/10/2026 §1.2, decisión de Alberto del
// mismo día: los vehículos van DENTRO de «Patrimoniales», como sublínea, no en tarjeta propia).
//
// 🚨 El titular manda sobre el ramo: toda póliza cuyo titular es persona JURÍDICA es «De tu empresa», sea del ramo
// que sea (una salud colectiva es de la empresa, no personal). `titularEsEmpresa` llega del adaptador: en la cartera,
// `tipoPersona === 'juridica'` (el NULL de la BD ya viene colapsado a `fisica`, el lado restrictivo); en las
// declaradas, `titularTipo === 'empresa'`.
//
// 🚨 Un ramo que no se reconoce (`otros`, `null`, un texto libre de una declarada) va a «Otros»: ni se esconde ni se
// mete a la fuerza en otra familia. La tarjeta «Otros» solo se pinta si tiene algo.

export const FAMILIAS_SEGURO = ['personales', 'patrimoniales', 'empresa', 'otros'] as const
export type FamiliaSeguro = (typeof FAMILIAS_SEGURO)[number]

/** Sublínea dentro de «Patrimoniales». `null` = patrimonial sin bien físico (RC, ciber, caución…). */
export type SublineaPatrimonial = 'inmuebles' | 'vehiculos' | null

export interface ClaseSeguro {
  familia: FamiliaSeguro
  sublinea: SublineaPatrimonial
}

const PERSONALES = new Set(['vida', 'salud', 'accidentes', 'decesos', 'viaje', 'mascotas'])
const INMUEBLES = new Set(['hogar', 'comercio', 'comunidades', 'comunidad', 'impago_alquiler', 'alquiler', 'decenal', 'empresas'])
const VEHICULOS = new Set(['auto', 'moto', 'embarcaciones', 'flotas', 'flota', 'camion', 'furgoneta'])
const OTROS_PATRIMONIALES = new Set([
  'responsabilidad_civil',
  'rc_profesional',
  'dyo',
  'ciberriesgos',
  'transporte_mercancias',
  'caucion',
])

export function familiaSeguro(ramo: string | null | undefined, titularEsEmpresa: boolean): ClaseSeguro {
  const r = (ramo ?? '').trim().toLowerCase()
  const sublinea: SublineaPatrimonial = INMUEBLES.has(r) ? 'inmuebles' : VEHICULOS.has(r) ? 'vehiculos' : null
  if (titularEsEmpresa) return { familia: 'empresa', sublinea }
  if (PERSONALES.has(r)) return { familia: 'personales', sublinea: null }
  if (sublinea !== null || OTROS_PATRIMONIALES.has(r)) return { familia: 'patrimoniales', sublinea }
  return { familia: 'otros', sublinea: null }
}

export const NOMBRE_FAMILIA: Readonly<Record<FamiliaSeguro, string>> = Object.freeze({
  personales: 'Personales',
  patrimoniales: 'Patrimoniales',
  empresa: 'De tu empresa',
  otros: 'Otros',
})
