// lib/sivra/eventos-estado.ts — qué puede hacer un evento según lo seguro que sea.
//
// POR QUÉ (01/08/2026, idea de Alberto: «ver de qué forma podríamos revisar noticias e intentar
// adelantarnos a las fechas — ejemplo, final de Copa del Rey»).
//
// El descubrimiento automático solo veía el PRESENTE: Ticketmaster lista lo que ya tiene entradas a
// la venta, y el prompt de búsqueda web pedía eventos «CONFIRMADOS». Pero lo que de verdad mueve el
// precio se sabe MESES antes de que exista una entrada — la sede de una final, un congreso grande
// que firma con FIBES, una gira que anuncia ciudades antes que fechas. Y esa ventana previa es
// justamente la buena: con 6 meses por delante, el raíl de ±%/día tiene tiempo de sobra para llegar
// al precio; con 3 semanas, ya no.
//
// LA DECISIÓN CENTRAL — un evento previsto NO toca el precio objetivo, solo el suelo.
//
// Porque los dos errores no cuestan lo mismo:
//   · Proteger el suelo de una fecha que al final no era nada → unas noches sin vender a precio
//     bajo, en una fecha que probablemente tampoco se habría vendido al mínimo. Recuperable.
//   · NO protegerla y que sí fuera la final → esa noche se vendió a precio de sábado corriente y no
//     vuelve. Irrecuperable.
// Subir el PRECIO por una noticia de prensa, en cambio, sería inventarse demanda que nadie ha
// comprado todavía: el centinela #7 («evento sin respaldo de mercado») tendría toda la razón al
// saltar, y con razón. Así que la previsión entra por la puerta del suelo, no por la del precio.
//
// El camino completo de un previsto: la prensa lo propone → protege suelo + entra en el barrido de
// mercado + avisa a Alberto → cuando el mercado sube (o Ticketmaster lo publica) pasa a confirmado y
// ya sí tarifica. Si era falso, Alberto lo descarta y no se vuelve a proponer.

export type EstadoEvento = 'confirmado' | 'previsto' | 'descartado'

export type EventoBruto = {
  estado?: string | null
  factor: number
  confianza?: number | null
}

export type EfectoEvento = {
  /** multiplicador que puede mover el PRECIO objetivo (1 = no lo toca) */
  factorPrecio: number
  /** multiplicador que protege el SUELO (1 = no lo toca) */
  factorSuelo: number
  /** ¿debe el barrido de mercado gastar una ventana en esta fecha? */
  mereceBarrido: boolean
  motivo: string
}

const NEUTRO: EfectoEvento = { factorPrecio: 1, factorSuelo: 1, mereceBarrido: false, motivo: 'sin efecto' }

export type EfectoOpts = {
  /** confianza mínima para que un previsto haga algo */
  confianzaMinima?: number
  /**
   * Cuánto del premio se le concede al SUELO de un previsto. 0.5 = la mitad del camino.
   * No es 1 a propósito: es una apuesta, no un hecho.
   */
  pesoSueloPrevisto?: number
  /** a partir de aquí una fecha cuenta como evento para el barrido */
  factorMinimo?: number
}

export function normalizarEstado(v?: string | null): EstadoEvento {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'previsto') return 'previsto'
  if (s === 'descartado') return 'descartado'
  // Todo lo demás —incluido NULL y el vacío— es 'confirmado': las filas anteriores a esta columna
  // vienen de fuentes que SOLO publican lo confirmado, así que es el valor correcto del histórico,
  // no un «no se sabe» disfrazado de dato.
  return 'confirmado'
}

export function efectoDeEvento(e: EventoBruto, o: EfectoOpts = {}): EfectoEvento {
  const confianzaMinima = o.confianzaMinima ?? 0.6
  const peso = o.pesoSueloPrevisto ?? 0.5
  const factorMinimo = o.factorMinimo ?? 1.15

  const estado = normalizarEstado(e.estado)
  const factor = Number(e.factor)
  if (!Number.isFinite(factor) || factor <= 1) return NEUTRO

  if (estado === 'descartado') {
    return { ...NEUTRO, motivo: 'descartado a mano: no vuelve a contar' }
  }

  if (estado === 'confirmado') {
    return {
      factorPrecio: factor,
      factorSuelo: factor,
      mereceBarrido: factor >= factorMinimo,
      motivo: `confirmado (x${factor})`,
    }
  }

  // previsto
  const confianza = e.confianza == null ? 0 : Number(e.confianza)
  if (!Number.isFinite(confianza) || confianza < confianzaMinima) {
    return { ...NEUTRO, motivo: `previsto con confianza ${confianza || 0} < ${confianzaMinima}: solo informativo` }
  }

  // El suelo recorre parte del camino hacia el factor, nunca todo.
  const factorSuelo = 1 + (factor - 1) * peso
  return {
    factorPrecio: 1,
    factorSuelo,
    // Un previsto SIEMPRE merece barrido si llega a la confianza mínima: medirlo es justo lo que
    // permite confirmarlo o tirarlo, y sin comps se queda en el limbo para siempre.
    mereceBarrido: true,
    motivo:
      `previsto (x${factor}, confianza ${confianza}): NO mueve el precio, ` +
      `protege el suelo a x${factorSuelo.toFixed(2)} y pide mercado`,
  }
}

/**
 * Combina TODOS los eventos de una misma fecha (pueden ser varios: Ticketmaster, búsqueda web y
 * la mano de Alberto sobre el mismo concierto). Manda el mayor de cada cosa por separado — un
 * previsto no puede rebajar lo que ya aporta un confirmado.
 */
export function combinarEventosDeFecha(eventos: EventoBruto[], o: EfectoOpts = {}): EfectoEvento {
  let factorPrecio = 1
  let factorSuelo = 1
  let mereceBarrido = false
  const motivos: string[] = []

  for (const e of eventos) {
    const ef = efectoDeEvento(e, o)
    factorPrecio = Math.max(factorPrecio, ef.factorPrecio)
    factorSuelo = Math.max(factorSuelo, ef.factorSuelo)
    mereceBarrido = mereceBarrido || ef.mereceBarrido
    if (ef.factorPrecio > 1 || ef.factorSuelo > 1) motivos.push(ef.motivo)
  }

  return {
    factorPrecio,
    factorSuelo,
    mereceBarrido,
    motivo: motivos.join(' · ') || 'sin efecto',
  }
}
