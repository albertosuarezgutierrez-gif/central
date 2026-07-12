// lib/sivra/agente-huesped/fases.ts — fase temporal de una reserva (pura y testeable).
//
// El DÍA DE LLEGADA es un caso propio y NO "en-estancia": el huésped puede no haber entrado aún
// (llega esa misma tarde), así que las preguntas de entrada anticipada / dónde dejar el equipaje
// siguen aplicando. Tratar el día de llegada como "ya está dentro" hacía que el agente NO ofreciera
// el early check-in el mismo día de la entrada y improvisara un hedge equivocado ("no puedo
// confirmar la entrada anticipada hasta el día anterior"). Lo detectó Alberto en el borrador a
// Gyongyi (12/07/2026): la entrada era HOY y la víspera estaba libre → SÍ se podía confirmar.
//
// Fechas 'YYYY-MM-DD' (zona horaria Madrid) → comparación lexicográfica.

export type FaseReserva = 'pre-llegada' | 'dia-llegada' | 'en-estancia' | 'post-estancia'

export function faseReserva(hoy: string, checkIn: string, checkOut: string): FaseReserva {
  if (checkOut && hoy > checkOut) return 'post-estancia'
  if (checkIn && hoy < checkIn) return 'pre-llegada'
  if (checkIn && hoy === checkIn) return 'dia-llegada'
  // Sin fechas fiables o entre medias → se trata como en-estancia (comportamiento previo).
  return 'en-estancia'
}

// El early check-in tiene sentido ANTES de entrar: en los días previos Y el propio día de llegada.
// En-estancia y post-estancia no aplica (el huésped ya entró / ya se fue).
export function aplicaEarlyCheckin(fase: FaseReserva): boolean {
  return fase === 'pre-llegada' || fase === 'dia-llegada'
}
