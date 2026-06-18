export type Frecuencia = 'mensual' | 'bimestral_impar' | 'anual_marzo'
export type Destino = 'turistico_pisos' | 'turistico_duplex' | 'personal'

export type ProveedorRecurrente = {
  id: string
  label: string
  frecuencia: Frecuencia
  destino: Destino
  importeAprox: string
  carpetaDrive: string
}

export const PROVEEDORES_RECURRENTES: ProveedorRecurrente[] = [
  { id: 'si_que_brilla',   label: 'Si Que Brilla (limpieza)',         frecuencia: 'mensual',         destino: 'turistico_pisos',  importeAprox: '800–1.440€',  carpetaDrive: 'Pisos turísticos' },
  { id: 'giraldillo',      label: 'El Giraldillo (lavandería)',        frecuencia: 'mensual',         destino: 'turistico_pisos',  importeAprox: '400–600€',    carpetaDrive: 'Pisos turísticos' },
  { id: 'endesa_socorro',  label: 'ENDESA Socorro',                    frecuencia: 'mensual',         destino: 'turistico_pisos',  importeAprox: '38–134€',     carpetaDrive: 'Pisos turísticos' },
  { id: 'endesa_luxury',   label: 'ENDESA Luxury (Bustos Bajo DER)',   frecuencia: 'mensual',         destino: 'turistico_pisos',  importeAprox: '38–134€',     carpetaDrive: 'Pisos turísticos' },
  { id: 'endesa_bustos',   label: 'ENDESA Bustos Reform (Bajo IZQ)',  frecuencia: 'mensual',         destino: 'turistico_pisos',  importeAprox: '38–134€',     carpetaDrive: 'Pisos turísticos' },
  { id: 'endesa_duplex',   label: 'ENDESA Dúplex (Pasaje Francisco)', frecuencia: 'mensual',         destino: 'turistico_duplex', importeAprox: '63–79€',      carpetaDrive: 'Duplex' },
  { id: 'emasesa_socorro', label: 'EMASESA Socorro',                   frecuencia: 'bimestral_impar', destino: 'turistico_pisos',  importeAprox: '84–166€',     carpetaDrive: 'Pisos turísticos' },
  { id: 'emasesa_bustos',  label: 'EMASESA Bustos Reform',             frecuencia: 'bimestral_impar', destino: 'turistico_pisos',  importeAprox: '33–57€',      carpetaDrive: 'Pisos turísticos' },
  { id: 'emasesa_luxury',  label: 'EMASESA Luxury',                    frecuencia: 'bimestral_impar', destino: 'turistico_pisos',  importeAprox: '59–91€',      carpetaDrive: 'Pisos turísticos' },
  { id: 'digi',            label: 'DIGI (2/3 negocio)',                frecuencia: 'mensual',         destino: 'turistico_pisos',  importeAprox: '~51€',        carpetaDrive: 'Pisos turísticos' },
  { id: 'pricelabs',       label: 'PriceLabs',                         frecuencia: 'mensual',         destino: 'turistico_pisos',  importeAprox: '55–65 USD',   carpetaDrive: 'Pisos turísticos' },
  { id: 'chekin',          label: 'Chekin Soluciones',                 frecuencia: 'mensual',         destino: 'turistico_pisos',  importeAprox: 'variable',    carpetaDrive: 'Pisos turísticos' },
  { id: 'renta_luxury',    label: 'Renta Gutierrez Alcalá — Luxury',  frecuencia: 'mensual',         destino: 'turistico_pisos',  importeAprox: '~309€',       carpetaDrive: 'Pisos turísticos' },
  { id: 'renta_bustos',    label: 'Renta Gutierrez Alcalá — Bustos',  frecuencia: 'mensual',         destino: 'turistico_pisos',  importeAprox: '~259€',       carpetaDrive: 'Pisos turísticos' },
  { id: 'comunidad_pasaje', label: 'Comunidad Pasaje Francisco',       frecuencia: 'mensual',         destino: 'turistico_duplex', importeAprox: '76,18€',      carpetaDrive: 'Duplex' },
  { id: 'comunidad_monte', label: 'Comunidad Monte Carmelo',           frecuencia: 'mensual',         destino: 'personal',         importeAprox: '~110€',       carpetaDrive: 'Personal' },
  { id: 'smoobu',          label: 'Smoobu (anual)',                    frecuencia: 'anual_marzo',     destino: 'turistico_pisos',  importeAprox: '~1.018€',     carpetaDrive: 'Pisos turísticos' },
]

export function esperadoEnMes(p: ProveedorRecurrente, _año: number, mes: number): boolean {
  if (p.frecuencia === 'mensual') return true
  if (p.frecuencia === 'bimestral_impar') return mes % 2 === 1
  if (p.frecuencia === 'anual_marzo') return mes === 3
  return false
}

export type EstadoFactura = 'ok' | 'falta' | 'pendiente'

export function calcularEstado(driveUrl: string | null, año: number, mes: number): EstadoFactura {
  if (driveUrl) return 'ok'
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const currentDay = now.getDate()
  const esMesActual = año === currentYear && mes === currentMonth
  if (esMesActual && currentDay <= 15) return 'pendiente'
  return 'falta'
}
