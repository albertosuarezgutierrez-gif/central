// lib/sivra/agente-huesped/equipaje.ts — info de consigna / guardado de equipaje para el huésped.
//
// El apartamento NO ofrece servicio de consigna ni de guardado de maletas (ni antes del check-in
// ni después del check-out). Cuando un huésped pregunta dónde dejar/guardar las maletas, el agente
// se disculpa por no tener ese servicio y recomienda consignas cercanas del centro de Sevilla.
//
// Mismo patrón que `parking.ts`: se inyecta en la `ficha` del piso → el agente lo da SIN que el
// guardrail anti-invención escale (valida webs contra las fuentes, y la ficha es una fuente), y la
// categoría `equipaje` está en la allowlist de graduación → puede auto-enviarse.
//
// POR ZONA del piso (los 4 están en 41003, alrededor de Encarnación/Las Setas, a pocos minutos
// entre sí, pero damos el punto físico más pegado a cada uno) + REDES con puntos por toda la ciudad:
//  - Socorro 24 / Bustos Tavera (House Sevillana, Busto Reform, Luxury Busto) → Alfalfa.
//  - Dúplex Center (Pasaje Francisco Molina / C. Martín Villa, La Campana) → Plaza del Duque.
// Datos obtenidos por búsqueda web (junio 2026); reserva por web/app. Si una cierra/cambia, edita aquí.

export type Consigna = { nombre: string; web: string; nota: string }

// Redes con puntos por toda la ciudad — sirven a cualquier piso (el huésped busca el más cercano).
export const CONSIGNAS_RED: Consigna[] = [
  { nombre: 'Radical Storage', web: 'radicalstorage.com/luggage-storage/seville', nota: 'puntos por todo el centro, 24/7, reserva por web/app, desde ~1,60 €/día' },
  { nombre: 'Bounce', web: 'bounce.com/luggage-storage/seville', nota: '+80 puntos en Sevilla, reserva online' },
  { nombre: 'LOCK & enjoy!', web: 'lockandenjoy.com', nota: 'taquillas automáticas en varios puntos del centro, 24/7' },
]

// Punto físico concreto (taquillas 24/7) por ZONA del piso, a pocos minutos andando.
export const CONSIGNA_POR_ZONA: Record<'busto' | 'duplex', Consigna> = {
  busto: { nombre: 'Locker in the City – Alfalfa', web: 'lockerinthecity.com/consignas/espana/sevilla/alfalfa', nota: 'taquillas automáticas 24/7 en Alfalfa, a ~5 min andando' },
  duplex: { nombre: 'Locker in the City – Plaza del Duque', web: 'lockerinthecity.com/consignas/espana/sevilla/plaza-del-duque-estacion-autobus', nota: 'taquillas automáticas 24/7 junto a Plaza del Duque, a ~3 min andando' },
}

// Mapea el property_id interno a su zona (para elegir la consigna más cercana). null = sin zona
// conocida → solo redes.
export function zonaDePiso(propertyId: string): 'busto' | 'duplex' | null {
  if (propertyId === 'prop_duplex_center') return 'duplex'
  if (propertyId === 'prop_house_sevillana' || propertyId === 'prop_busto_reform' || propertyId === 'prop_luxury_busto') return 'busto'
  return null
}

// Bloque que se añade a la `ficha` del piso. El agente lo usará SOLO si el huésped pregunta por
// dónde guardar/dejar las maletas (REGLA DE ORO: no añadir info no pedida).
export function bloqueEquipaje(propertyId = ''): string {
  const zona = zonaDePiso(propertyId)
  const cercana = zona ? CONSIGNA_POR_ZONA[zona] : null
  const red = CONSIGNAS_RED.map(c => `  • ${c.nombre} — ${c.web} (${c.nota})`).join('\n')
  const lineas = [
    'CONSIGNA / GUARDAR MALETAS: el apartamento NO dispone de servicio de consigna ni de guardado de equipaje (ni antes del check-in ni después del check-out).',
    'Si el huésped pregunta dónde dejar o guardar las maletas, discúlpate brevemente por no ofrecer ese servicio y recomiéndale una consigna cercana:',
  ]
  if (cercana) {
    lineas.push(`  • La más cercana a este apartamento: ${cercana.nombre} — ${cercana.web} (${cercana.nota}).`)
    lineas.push('  Y, si le viene mejor otra ubicación, estas redes tienen puntos por toda la ciudad (se reservan por su web/app):')
  } else {
    lineas.push('  Estas redes tienen puntos por todo el centro (se reservan por su web/app):')
  }
  lineas.push(red)
  return lineas.join('\n')
}
