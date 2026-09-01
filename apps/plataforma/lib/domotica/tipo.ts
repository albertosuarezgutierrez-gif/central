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

// Tipo EFECTIVO: si hay override manual guardado (`config.tipoManual`), manda sobre la categoría
// autodetectada. Necesario porque la categoría Tuya del NIVIAN puede no estar en la lista conocida
// (o venir vacía) y entonces la cerradura se pintaría como ventilador. El override desbloquea eso.
// `config` va como `unknown` a propósito: distintos llamantes pasan `Record<string,unknown>` o
// `Partial<ConfigAcceso>`, y un parámetro con solo props opcionales dispara el "weak type check" de TS.
export function tipoEfectivo(config: unknown, categoria: string | null | undefined): TipoDispositivo {
  const m = (config as { tipoManual?: unknown } | null | undefined)?.tipoManual
  if (m === 'acceso' || m === 'ventilador' || m === 'otro') return m
  return tipoDispositivo(categoria)
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
  // ENTRADA ESTRICTA / SALIDA FLEXIBLE (decisión de Alberto, 31/08/2026). No son simétricas porque
  // el riesgo no lo es: abrir antes de tiempo es meter a alguien en un piso que puede estar todavía
  // ocupado o sin limpiar, y por eso una entrada distinta de la oficial se concede a mano (PATCH del
  // PIN). Cerrar en punto, en cambio, solo castiga al huésped que baja a por la maleta a las 11:15 o
  // vuelve a dejar las llaves: no hay nada que proteger a las 11:00 que no siga protegido a las 13:00.
  margenEntradaMin: 0,
  // 120 min NO es un número redondo al azar: el check-out es a las 11:00 y el check-in siguiente a
  // las 15:00, así que la ventana muere a las 13:00 y deja 2 h limpias antes de que llegue nadie.
  // Subirlo por encima de 240 haría que el PIN del que se va siguiera vivo cuando entra el siguiente.
  margenSalidaMin: 120,
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
