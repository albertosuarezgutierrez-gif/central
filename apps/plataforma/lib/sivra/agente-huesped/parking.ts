// lib/sivra/agente-huesped/parking.ts — info de aparcamiento para responder al huésped.
//
// El apartamento no tiene plaza de parking propia disponible para el huésped (o está ocupada).
// Cuando un huésped pregunta por aparcamiento, el agente debe disculparse y recomendar uno de
// estos parkings públicos cercanos (centro de Sevilla), con su teléfono y web por si quiere
// consultar tarifas/disponibilidad.
//
// Por qué vive aquí (constante) y se inyecta en la `ficha`:
//  - La guía de Smoobu (guest-app-url) es una SPA ilegible → no es fuente fiable.
//  - El guardrail anti-invención (`contieneDatoInventado`) valida teléfonos/URLs contra las
//    FUENTES (ficha + guía + historial). Si la ficha contiene estos teléfonos, el agente puede
//    darlos SIN que el guardrail escale a humano. Por eso van en la ficha, no solo en el prompt.
//  - La categoría `parking` ya está en la allowlist de graduación → puede auto-enviarse.

export type Parking = { nombre: string; direccion: string; telefono: string; web: string }

// Datos obtenidos por búsqueda web (junio 2026). Webs oficiales verificadas; en el parking de
// Plaza de la Concordia (SABA) los directorios devolvían teléfonos en conflicto, así que se
// remite a su web oficial para tarifas/contacto.
export const PARKINGS_CERCANOS: Parking[] = [
  { nombre: 'Parking José Laguillo (AUSSA)', direccion: 'Av. José Laguillo, s/n', telefono: '954 21 02 19', web: 'aussa.com' },
  { nombre: 'Parking Escuelas Pías', direccion: 'Pl. Ponce de León, 11', telefono: '954 56 17 58', web: 'parkingescuelaspias.es' },
  { nombre: 'Parking Imagen', direccion: 'C/ Santa Ángela de la Cruz, 2', telefono: '954 21 00 68', web: 'parkingimagen.es' },
  { nombre: 'Parking Plaza de la Concordia (SABA)', direccion: 'Pl. de la Concordia, s/n', telefono: '', web: 'saba.es' },
]

// Bloque de texto que se añade a la `ficha` del piso. El agente lo usará SOLO si el huésped
// pregunta por aparcamiento (REGLA DE ORO: no añadir información no pedida).
export function bloqueParking(spots: Parking[] = PARKINGS_CERCANOS): string {
  const lista = spots
    .map(p => {
      const contacto = [p.telefono ? `Tel. ${p.telefono}` : '', p.web].filter(Boolean).join(' · ')
      return `  • ${p.nombre} — ${p.direccion} · ${contacto}`
    })
    .join('\n')
  return [
    'PARKING: nuestro parking está ocupado / el apartamento no dispone de plaza de aparcamiento propia para el huésped.',
    'Si el huésped pregunta por aparcamiento, discúlpate brevemente ("Siento comunicarle que nuestro parking está ocupado") y recomiéndale estas opciones de parkings públicos en los alrededores, con su teléfono y web por si quiere consultar tarifas o disponibilidad:',
    lista,
  ].join('\n')
}
