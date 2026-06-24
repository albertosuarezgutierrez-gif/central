// lib/sivra/agente-huesped/horarios.ts — horario OFICIAL de entrada/salida por piso.
//
// Por qué existe: en Smoobu la hora de check-in se graba EN CADA RESERVA al crearse; cambiar el
// ajuste del apartamento solo afecta a reservas NUEVAS, no a las ya existentes (que se quedan con
// la hora vieja), y la API del apartamento no expone la hora. Resultado: `reserva['check-in']`
// puede venir desfasado (p.ej. 13:00 cuando la entrada real es 15:00). Este override es la fuente
// de verdad del agente para las horas; manda por encima de lo que diga Smoobu.
//
// Regla de Alberto (23/06/2026): todos los pisos entran a las 15:00, salvo Busto Reform (13:00).
// Salida 11:00 en todos. Mantener esta tabla cuando cambien los horarios.
export const HORARIOS_PISO: Record<string, { checkIn: string; checkOut: string }> = {
  prop_house_sevillana: { checkIn: '15:00', checkOut: '11:00' },
  prop_busto_reform: { checkIn: '13:00', checkOut: '11:00' },
  prop_luxury_busto: { checkIn: '15:00', checkOut: '11:00' },
  prop_duplex_center: { checkIn: '15:00', checkOut: '11:00' },
}

// Horario del piso: usa el override si el piso es conocido; si no, cae a lo que diga Smoobu.
export function horarioPiso(
  propertyId: string,
  smoobuCheckIn = '',
  smoobuCheckOut = '',
): { checkIn: string; checkOut: string } {
  const o = HORARIOS_PISO[propertyId]
  return {
    checkIn: o?.checkIn || smoobuCheckIn,
    checkOut: o?.checkOut || smoobuCheckOut,
  }
}
