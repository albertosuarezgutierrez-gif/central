// lib/domotica/tipo.ts — clasificación pura del tipo de aparato Tuya y config de acceso por defecto.
export type TipoDispositivo = 'ventilador' | 'acceso' | 'otro'

// Categorías Tuya conocidas. Control de acceso / cerraduras vs ventiladores.
// (La sonda de Fase 0 confirma la categoría real del NIVIAN; si sale una nueva, se añade aquí.)
const CATS_ACCESO = new Set(['mk', 'ms', 'jtmspro', 'bxx', 'menfry', 'videolock', 'jtmsbh'])
const CATS_VENTILADOR = new Set(['fs', 'fsd', 'fskg'])

export function tipoDispositivo(categoria: string | null | undefined): TipoDispositivo {
  const c = (categoria || '').toLowerCase()
  if (CATS_ACCESO.has(c)) return 'acceso'
  if (CATS_VENTILADOR.has(c)) return 'ventilador'
  return 'otro'
}

export type ConfigAcceso = {
  smoobuApartmentIds: number[]
  autoPin: boolean
  entrega: 'huesped' | 'aviso' | 'ambos' | 'manual'
  pinLongitud: number
  usarHorarioPiso: boolean
  margenEntradaMin: number
  margenSalidaMin: number
  autoBorrarTrasCheckout: boolean
  botonAbrir: boolean
}

export const CONFIG_ACCESO_DEFAULT: ConfigAcceso = {
  smoobuApartmentIds: [],
  autoPin: true,
  entrega: 'ambos',
  pinLongitud: 6,
  usarHorarioPiso: true,
  margenEntradaMin: 0,
  margenSalidaMin: 0,
  autoBorrarTrasCheckout: true,
  botonAbrir: true,
}
