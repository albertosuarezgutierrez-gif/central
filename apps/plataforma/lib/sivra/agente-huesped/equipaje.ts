// lib/sivra/agente-huesped/equipaje.ts — info de consigna / guardado de equipaje para el huésped.
//
// El apartamento NO ofrece servicio de consigna ni de guardado de maletas (ni antes del check-in
// ni después del check-out). Cuando un huésped pregunta dónde dejar/guardar las maletas, el agente
// se disculpa por no tener ese servicio y recomienda consignas cercanas del centro de Sevilla.
//
// Mismo patrón que `parking.ts`: se inyecta en la `ficha` del piso → el agente lo da SIN que el
// guardrail anti-invención escale (valida webs/teléfonos contra las fuentes, y la ficha es una
// fuente), y la categoría `equipaje` está en la allowlist de graduación → puede auto-enviarse.
//
// Son REDES de consigna con varios puntos por el centro (Radical Storage, Bounce) + una consigna
// automática (LOCK & enjoy!), así que sirven para los 4 pisos (todos céntricos). Si una cierra o
// cambia, edita esta constante. Datos obtenidos por búsqueda web (junio 2026); reserva por web/app.

export type Consigna = { nombre: string; web: string; nota: string }

export const CONSIGNAS_CERCANAS: Consigna[] = [
  { nombre: 'Radical Storage', web: 'radicalstorage.com/luggage-storage/seville', nota: 'red de puntos por todo el centro, 24/7, reserva por web/app, desde ~1,60 €/día' },
  { nombre: 'Bounce', web: 'bounce.com/luggage-storage/seville', nota: '+80 puntos en Sevilla (centro, Plaza de Armas, Santa Justa), reserva online' },
  { nombre: 'LOCK & enjoy!', web: 'lockandenjoy.com', nota: 'consigna con lockers automáticos cerca del centro / estación de Santa Justa, 24/7' },
]

// Bloque que se añade a la `ficha` del piso. El agente lo usará SOLO si el huésped pregunta por
// dónde guardar/dejar las maletas (REGLA DE ORO: no añadir info no pedida).
export function bloqueEquipaje(spots: Consigna[] = CONSIGNAS_CERCANAS): string {
  const lista = spots.map(c => `  • ${c.nombre} — ${c.web} (${c.nota})`).join('\n')
  return [
    'CONSIGNA / GUARDAR MALETAS: el apartamento NO dispone de servicio de consigna ni de guardado de equipaje (ni antes del check-in ni después del check-out).',
    'Si el huésped pregunta dónde dejar o guardar las maletas, discúlpate brevemente por no ofrecer ese servicio y recomiéndale estas consignas cercanas del centro de Sevilla (se reservan por su web/app):',
    lista,
  ].join('\n')
}
