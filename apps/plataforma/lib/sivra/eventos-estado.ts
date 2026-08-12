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
// LA DECISIÓN CENTRAL (v2, 09/08/2026, decisión de Alberto) — un previsto LEJANO sí puede subir el
// precio, PONDERADO por su confianza; cerca de la fecha vuelve a ser solo-suelo.
//
// La v1 (01/08) dejaba a los previstos solo el suelo, para no «inventarse demanda que nadie ha
// comprado». Alberto le dio la vuelta con el argumento correcto de teoría de decisión: el riesgo es
// ASIMÉTRICO cuando la fecha está lejos.
//   · Inflar y que el evento no cuaje → se baja a tiempo (el raíl ±%/día tarda 2-3 pasadas) y a
//     meses vista apenas había reservas que perder. Recuperable.
//   · NO inflar y que cuaje → las reservas que entraron ANTES de la confirmación se fueron a precio
//     de sábado corriente. Irrecuperable (el caso Karol G, otra vez).
// Por eso el premio de un previsto va PONDERADO (`1 + (factor−1) × confianza × peso`), nunca al
// factor pleno: la final de Copa tiene DOS fechas candidatas y solo una será verdad — inflarlas
// ambas al 100% sobrevalora una seguro; ponderar reparte la apuesta. Y SOLO a distancia
// (`diasVistaMinimosPrecio`): un rumor a dos semanas no da tiempo a deshacerse. Al acercarse la
// fecha sin confirmarse, el premio se retira SOLO (el gate de distancia deja de cumplirse) — la
// «bajada a tiempo» no depende de que nadie se acuerde.
//
// El camino completo de un previsto: la prensa lo propone → premio ponderado (si está lejos) +
// suelo + entra en el barrido de mercado → cuando el mercado sube (o Ticketmaster lo publica, o la
// prensa lo cierra) pasa a confirmado y tarifica al factor pleno. Si era falso, se descarta y no se
// vuelve a proponer.
//
// 🚨 QUIÉN CIERRA ESE CAMINO (v3, 12/08/2026, petición de Alberto: «esto tiene q ser automático, yo
// no sé de esta información»). Hasta hoy los dos finales —confirmar y descartar— los ponía ÉL a
// mano desde un Telegram, y por tanto casi nunca se ponían: un previsto se quedaba moviendo el
// suelo y el precio de una fecha para siempre. Ahora lo decide el cron
// `/api/sivra/eventos/verificar` contra tres señales independientes (otra fila ya confirmada,
// búsqueda dirigida en prensa, y el mercado real de esa noche), con caducidad a
// `DIAS_CADUCIDAD` días. La lógica vive en `eventos-verificacion.ts`; este fichero solo dice qué
// EFECTO tiene cada estado, que no ha cambiado.
//
// ⚠️ ALCANCE REAL DE LA PROTECCIÓN DE SUELO — medido, no supuesto (01/08/2026).
// El factor de suelo que sale de aquí pasa DESPUÉS por `seasonalFloorFactor`, que lo vuelve a
// amortiguar a la mitad y lo compara con el suelo estacional del mes. Encadenados los dos
// amortiguadores, un previsto solo mueve el suelo en los meses de temporada BAJA:
//
//   Bienal, 12/09/2026, factor 1.25 → suelo del previsto 1,125 → eventFloor 1,0625
//   … pero FLOOR_SEASONAL de septiembre ya es 1,25, así que el suelo final NO cambia. Inerte.
//
// No es un defecto: en temporada alta el suelo estacional ya hace ese trabajo, y donde una sorpresa
// duele de verdad es en un mes flojo (enero, febrero, julio, agosto, noviembre tienen FLOOR_SEASONAL
// 1,00). Ahí sí levanta el suelo. Pero conviene saberlo antes de esperar un efecto que no llega: si
// un previsto de temporada alta tuviera que mover el precio, hay que CONFIRMARLO, no subirle la
// confianza.

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
  /**
   * Cuánto del premio (ya ponderado por confianza) se concede al PRECIO de un previsto LEJANO.
   * 0.5 por la misma razón que el suelo: apuesta, no hecho.
   */
  pesoPrecioPrevisto?: number
  /** días vista mínimos para que un previsto toque el PRECIO (cerca no hay tiempo de deshacer) */
  diasVistaMinimosPrecio?: number
  /**
   * Días que faltan para la fecha (contexto de la llamada, no configuración). Sin él —o negativo—
   * el previsto NO toca el precio: es el comportamiento clásico y el conservador.
   */
  diasVista?: number | null
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
  // El PRECIO solo con la fecha LEJOS, y ponderado por confianza (v2, decisión de Alberto 09/08).
  const pesoPrecio = o.pesoPrecioPrevisto ?? 0.5
  const diasMinimos = o.diasVistaMinimosPrecio ?? 60
  const lejos = o.diasVista != null && Number.isFinite(o.diasVista) && o.diasVista >= diasMinimos
  const factorPrecio = lejos ? 1 + (factor - 1) * confianza * pesoPrecio : 1
  return {
    factorPrecio,
    factorSuelo,
    // Un previsto SIEMPRE merece barrido si llega a la confianza mínima: medirlo es justo lo que
    // permite confirmarlo o tirarlo, y sin comps se queda en el limbo para siempre.
    mereceBarrido: true,
    motivo: lejos
      ? `previsto (x${factor}, confianza ${confianza}) a ${o.diasVista} días: premio ponderado ` +
        `x${factorPrecio.toFixed(2)}, suelo x${factorSuelo.toFixed(2)} y pide mercado`
      : `previsto (x${factor}, confianza ${confianza}): cerca o sin días vista NO mueve el precio, ` +
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
