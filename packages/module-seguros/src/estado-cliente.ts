// El ESTADO de un cliente se DERIVA de los hechos, no se guarda (visión del CRM,
// docs/CORREDURIA-CRM-VISION.md §3). Alberto pide tres: con póliza · con
// presupuesto · sin póliza. Se añade «ex-cliente» (tuvo y ya no tiene) porque
// llamarlo «lead» a quien fue cliente ocho años es perder la historia.
//
// Y la regla de fondo: «cliente» es quien tiene una póliza CONFIRMADA por CIMA
// (`import_ref IS NULL` y `id_poliza_entidad` informado). Una póliza emitida
// por nosotros que CIMA aún no ha traído es «pendiente de confirmación», no
// convierte a nadie en cliente todavía.

export type EstadoCliente = 'cliente' | 'con_presupuesto' | 'lead' | 'ex_cliente'

export type SenalesCliente = {
  /** Pólizas confirmadas por CIMA y NO canceladas. */
  polizasConfirmadasActivas: number
  /** Pólizas confirmadas por CIMA pero canceladas. */
  polizasConfirmadasCanceladas: number
  /** Pólizas del volcado histórico (con `import_ref`). */
  polizasHistoricas: number
  /** Emitidas por nosotros y aún sin confirmar por CIMA. */
  polizasPendientesCima: number
  /** Cotizaciones vivas (pendiente/enviada, recientes). `null` = no se pudo contar. */
  cotizacionesVivas: number | null
}

export type EstadoClienteDerivado = {
  estado: EstadoCliente
  etiqueta: string
  /** Por qué: la pantalla lo enseña en el `title` para que el rótulo no sea un acto de fe. */
  motivo: string
}

export function estadoCliente(s: SenalesCliente): EstadoClienteDerivado {
  if (s.polizasConfirmadasActivas > 0) {
    return { estado: 'cliente', etiqueta: '✅ Cliente (CIMA)', motivo: `${s.polizasConfirmadasActivas} póliza(s) confirmada(s) por CIMA` }
  }
  if (s.polizasPendientesCima > 0) {
    return {
      estado: 'con_presupuesto',
      etiqueta: '📝 Póliza emitida, pendiente de CIMA',
      motivo: `${s.polizasPendientesCima} póliza(s) emitida(s) que CIMA aún no ha confirmado`,
    }
  }
  if (s.cotizacionesVivas !== null && s.cotizacionesVivas > 0) {
    return { estado: 'con_presupuesto', etiqueta: '📝 Con presupuesto', motivo: `${s.cotizacionesVivas} presupuesto(s) reciente(s) sin póliza` }
  }
  if (s.polizasConfirmadasCanceladas > 0 || s.polizasHistoricas > 0) {
    return {
      estado: 'ex_cliente',
      etiqueta: '⚫ Ex-cliente',
      motivo: `${s.polizasConfirmadasCanceladas} cancelada(s) en CIMA · ${s.polizasHistoricas} histórica(s) del volcado; ninguna viva`,
    }
  }
  return {
    estado: 'lead',
    etiqueta: '🕐 Lead',
    motivo: s.cotizacionesVivas === null ? 'sin póliza; presupuestos sin poder contar' : 'sin póliza ni presupuesto reciente',
  }
}

/** Días que un presupuesto cuenta como «vivo» para el estado. */
export const DIAS_PRESUPUESTO_VIVO = 60
