// Ayudas de presentación (puras): tono de la pastilla de estado de OR / presupuesto / cita. No cambia ningún dato.
export type TonoEstado = 'ok' | 'aviso' | 'alerta' | 'marca' | 'neutro'

const TONO: Record<string, TonoEstado> = {
  // Orden de reparación
  recepcion: 'neutro', presupuesto: 'aviso', aceptado: 'ok', en_curso: 'marca', ampliacion_pendiente: 'aviso',
  terminado: 'ok', facturado: 'ok', entregado: 'ok', cancelada: 'alerta',
  // Presupuesto / ampliación / cita
  borrador: 'neutro', enviado: 'aviso', pendiente: 'aviso', rechazado: 'alerta', rechazada: 'alerta', caducado: 'alerta',
  pedida: 'aviso', confirmada: 'ok', realizada: 'marca', no_presentado: 'alerta',
}

/** Clases de la pastilla de estado: `estado estado-<tono>` (ver globals.css). */
export const claseEstado = (estado: string): string => `estado estado-${TONO[estado] ?? 'neutro'}`
