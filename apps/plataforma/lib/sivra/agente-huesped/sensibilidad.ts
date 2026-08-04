// lib/sivra/agente-huesped/sensibilidad.ts — clasificación pura de mensajes "sensibles".
// Un mensaje sensible NUNCA se auto-responde: siempre se propone a Alberto.
//
// La detección de CANCELACIÓN va por RAÍZ, no por el infinitivo exacto: un huésped casi nunca
// escribe "cancelar" sino "¿está cancelada mi reserva?", "cancelación", "my booking is cancelled",
// "annuler", "stornieren"… El patrón anterior `cancelar` dejaba pasar TODAS esas variantes (y el
// huésped se quedaba sin respuesta cuando además la IA estaba caída). Preguntar por el estado de una
// cancelación es de lo más sensible que hay (afecta a reserva/dinero) → SIEMPRE debe escalar a Alberto.
//   cancel   → ES cancela/cancelar/cancelada/cancelación/cancelado · EN cancel/cancelled/cancellation · IT cancellare
//   an?nul   → ES anular/anulación · FR annuler/annulé/annulation · IT annullare
//   storn    → DE Storno/stornieren/Stornierung
const RE_SENSIBLE = /queja|reclamac|reembols|devoluc|no funciona|averi|roto|sucio|desastre|cambiar (las )?fechas?|cancel|an?nul|storn|emergencia|urgenc|estafa|denuncia|abogad/i

export function esSensible(text: string): boolean {
  return RE_SENSIBLE.test(text || '')
}
