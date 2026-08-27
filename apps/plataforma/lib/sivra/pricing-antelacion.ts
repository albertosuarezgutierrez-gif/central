// lib/sivra/pricing-antelacion.ts — la palanca de ANTICIPACIÓN: el espejo que le faltaba a la urgencia.
//
// POR QUÉ (26/08/2026). `pricing-lastminute.ts` sabe BAJAR el precio cuando la fecha se acerca sin
// venderse. No existía la mitad simétrica: nada subía el precio por el hecho de que la fecha esté
// LEJOS. Consecuencia práctica: quien reserva con cinco meses de antelación paga exactamente lo
// mismo que pagaría la semana antes, y el motor se queda sin la única palanca que convierte «si no
// se llena ya bajaremos» en una estrategia en vez de en una intención.
//
// El caso que lo destapó: 8-9 de enero de 2027 (viernes y sábado) se vendieron el 26/08/2026 —a 135
// días vista— a 365€ y 342€, con el suelo del piso en 300€. La antelación MEDIANA de House Sevillana
// en enero es de 28 días (n=12 desde 2024): esa reserva llegó a casi 5× la antelación normal del mes
// y se le cobró precio de enero corriente. El propio agente de precios había pedido 410€ para el 9
// dos días antes (p50 del mercado 456€), pero corrió en `dry_run` y no se aplicó.
//
// LA REFERENCIA ES LA MISMA QUE LA DE LA URGENCIA, Y ES DELIBERADO: la antelación mediana MEDIDA del
// piso PARA ESE MES (`incomes.reserved_at`, ver la consulta `antelacionRows` de apply/route.ts). Un
// umbral fijo («más de 90 días = caro») volvería a mezclar Feria con noviembre, que es justo el fallo
// que costó corregir el 01/08/2026 en la palanca hermana. Con la mediana por piso y mes, «lejos»
// significa lejos PARA ESE PISO EN ESE MES: 135 días en enero de House es rarísimo; en su Semana
// Santa sería lo normal.
//
// FORMA DE LA CURVA. El premio vale 0 en la mediana y llega al máximo en `saturacion` × mediana,
// creciendo despacio al principio (curva cuadrática). Quien reserva un poco antes de lo normal no
// paga premio: solo lo paga el madrugador de verdad, que es el que revela que esa fecha le importa
// más que el precio. Con la mediana de enero de House (28 días): a 60 días +3,6%, a 90 días +13,6%,
// a 135 días el tope.
//
// 🚨 Y EL TOPE NO PUEDE LLEGAR A LA VUELTA DE LA ESQUINA (`saturacionMinDias`, 27/08/2026). El 4×
// mediana funciona para un piso que se vende con un mes de antelación; para uno que se vende en 12
// días —Busto Reform y Dúplex Center, medianas típicas de 12— dejaría el tope en el día 48, o sea
// TODO el calendario más allá de mes y medio al +25% fijo. Eso ya no es un premio por anticipación:
// es una subida lineal a casi todo el año, y encima justo en la franja de 15-45 días donde esos
// pisos venden de verdad. Peor aún, hay meses con mediana de 2-4 días (agosto de House: 1): el tope
// caería en el día 8. El suelo de 60 días hace que la palanca signifique lo mismo en los cuatro:
// «mucho más lejos de lo normal Y encima lejos en términos absolutos». Con mediana 12: a 30 días
// +3,5%, a 60 días el tope. House no se entera (su 4×28 = 112 ya pasa de 60).
//
// SOLO SUBE — nunca baja — y aguas abajo siguen mandando el raíl de ±%/día, el suelo de coste, el
// techo del propietario y el techo de mercado MEDIDO (`pricing-techo-mercado.ts`), que es el que
// impide que esto se convierta en un precio de fantasía: el premio no puede sacar la noche por
// encima de 1,5× la mediana de su propia fecha.
//
// NOCHES DE EVENTO: inerte, igual que la urgencia. Una noche de evento ya lleva su propio factor y
// su propio suelo estacional; multiplicar encima sería contar dos veces la misma señal.

export type AntelacionInput = {
  /** días que faltan para la fecha (0 = hoy) */
  diasVista: number
  /** antelación MEDIANA medida de ese piso PARA ESE MES, en días (null = sin medir) */
  antelacionMediana: number | null
  /** nº de reservas observadas que sostienen esa mediana (para no fiarnos de 3 datos) */
  muestra: number
  /** factor de evento de la fecha: una noche de evento NO lleva premio encima */
  factorEvento?: number
}

export type AntelacionOpts = {
  /** intensidad por piso (`pricing_settings.antelacion_k`). 0 = palanca APAGADA */
  k?: number
  /** premio máximo con k=1, alcanzado en `saturacion` × mediana */
  premioMax?: number
  /** reservas observadas mínimas para fiarnos de la mediana */
  muestraMinima?: number
  /** múltiplo de la mediana en el que el premio llega al máximo */
  saturacion?: number
  /** suelo en DÍAS de ese punto de saturación: un piso que vende en 12 días no llega al tope el 48 */
  saturacionMinDias?: number
  /** a partir de este factor de evento no se aplica premio (ya lo lleva por su lado) */
  factorEventoProtegido?: number
  /** exponente de la curva: >1 = suave al principio, fuerte al final */
  curva?: number
}

export type AntelacionResult = {
  /** multiplicador ≥ 1 que se aplica al objetivo (1 = no tocar) */
  factor: number
  /** false = no había con qué decidir. NO confundir con «no hace falta premio». */
  evaluado: boolean
  motivo: string
}

const NEUTRO = (motivo: string, evaluado = false): AntelacionResult => ({ factor: 1, evaluado, motivo })

export function factorAntelacion(i: AntelacionInput, o: AntelacionOpts = {}): AntelacionResult {
  const k = o.k ?? 0
  const premioMax = o.premioMax ?? 0.25
  const muestraMinima = o.muestraMinima ?? 10
  const saturacion = o.saturacion ?? 4
  const saturacionMinDias = o.saturacionMinDias ?? 60
  const factorEventoProtegido = o.factorEventoProtegido ?? 1.15
  const curva = o.curva ?? 2

  if (!(k > 0)) return NEUTRO('palanca apagada para este piso (antelacion_k = 0)')
  if (i.antelacionMediana == null || !(i.antelacionMediana > 0)) {
    return NEUTRO('sin antelación medida: no sabemos cuándo se vende este piso')
  }
  if (i.muestra < muestraMinima) {
    return NEUTRO(`solo ${i.muestra} reservas observadas: muestra insuficiente para fiarse de la mediana`)
  }
  if (!Number.isFinite(i.diasVista) || i.diasVista < 0) return NEUTRO('días vista inválidos')
  if (!(saturacion > 1)) return NEUTRO('saturación mal configurada (debe ser > 1)')
  if ((i.factorEvento ?? 1) >= factorEventoProtegido) {
    return NEUTRO(`noche de evento (x${i.factorEvento}): ya lleva su propio premio`, true)
  }
  if (i.diasVista <= i.antelacionMediana) {
    return {
      factor: 1,
      evaluado: true,
      motivo:
        `faltan ${i.diasVista} días y este piso vende con ${i.antelacionMediana} de mediana: ` +
        `no es una reserva anticipada`,
    }
  }

  // 0 en la mediana → 1 en el punto de saturación (4× la mediana, nunca antes del día 60).
  const finDias = Math.max(i.antelacionMediana * saturacion, saturacionMinDias)
  const progreso = Math.min(1, (i.diasVista - i.antelacionMediana) / (finDias - i.antelacionMediana))
  const premio = Math.min(1, Math.max(0, k)) * premioMax * Math.pow(progreso, curva)
  return {
    factor: 1 + premio,
    evaluado: true,
    motivo:
      `quedan ${i.diasVista} días y este piso vende con ${i.antelacionMediana} de mediana ` +
      `→ +${Math.round(premio * 100)}% de anticipación`,
  }
}
