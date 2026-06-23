// lib/sivra/agente-huesped/sensibilidad.ts — clasificación pura de mensajes "sensibles".
// Un mensaje sensible NUNCA se auto-responde: siempre se propone a Alberto.
const RE_SENSIBLE = /queja|reclamac|reembols|devoluc|no funciona|averi|roto|sucio|desastre|cambiar (las )?fechas?|cancelar|emergencia|urgenc|estafa|denuncia|abogad/i

export function esSensible(text: string): boolean {
  return RE_SENSIBLE.test(text || '')
}
