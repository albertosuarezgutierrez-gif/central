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

// Un código/tarjeta permanente (limpiadora, mantenimiento, maestro, emergencia).
export type CodigoFijo = { etiqueta: string; tipo: 'pin' | 'tarjeta'; horario?: string; activo: boolean }

export type ConfigAccesoAlertas = {
  primeraEntrada: boolean      // avisar cuando el huésped entra por 1ª vez (confirma llegada)
  fueraDeVentana: boolean      // entrada sin reserva activa → sospechoso
  sabotaje: boolean            // tamper / puerta forzada
  timbre: boolean              // pulsación del timbre integrado
  offlineAntesCheckin: boolean // cerradura caída con check-in próximo
  offlineLeadHoras: number     // antelación del aviso offline (default 12)
}

export type ConfigAcceso = {
  // Vínculo con reservas (1 cerradura ↔ N pisos)
  smoobuApartmentIds: number[]
  // PIN automático por reserva
  autoPin: boolean
  entrega: 'huesped' | 'aviso' | 'ambos' | 'manual'
  pinLongitud: number
  usarHorarioPiso: boolean
  margenEntradaMin: number
  margenSalidaMin: number
  autoBorrarTrasCheckout: boolean
  // Apertura remota
  botonAbrir: boolean
  // Códigos permanentes y alertas
  codigosFijos: CodigoFijo[]
  alertas: ConfigAccesoAlertas
}

export const CONFIG_ACCESO_ALERTAS_DEFAULT: ConfigAccesoAlertas = {
  primeraEntrada: true,
  fueraDeVentana: true,
  sabotaje: true,
  timbre: false,
  offlineAntesCheckin: true,
  offlineLeadHoras: 12,
}

export const CONFIG_ACCESO_DEFAULT: ConfigAcceso = {
  smoobuApartmentIds: [],
  autoPin: true,
  entrega: 'aviso', // por defecto SOLO avisa a Alberto (Telegram); 'huesped'/'ambos' se activan a mano por cerradura
  pinLongitud: 6,
  usarHorarioPiso: true,
  margenEntradaMin: 0,
  margenSalidaMin: 0,
  autoBorrarTrasCheckout: true,
  botonAbrir: true,
  codigosFijos: [],
  alertas: CONFIG_ACCESO_ALERTAS_DEFAULT,
}

// Fusiona la config guardada (jsonb parcial) con los defaults, incluido el sub-objeto `alertas`.
export function normalizarConfigAcceso(raw: Partial<ConfigAcceso> | null | undefined): ConfigAcceso {
  const c = raw || {}
  return {
    ...CONFIG_ACCESO_DEFAULT,
    ...c,
    smoobuApartmentIds: Array.isArray(c.smoobuApartmentIds) ? c.smoobuApartmentIds.map(Number).filter(n => Number.isFinite(n)) : [],
    codigosFijos: Array.isArray(c.codigosFijos) ? c.codigosFijos : [],
    alertas: { ...CONFIG_ACCESO_ALERTAS_DEFAULT, ...(c.alertas || {}) },
  }
}
