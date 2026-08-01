// lib/sivra/pricing-lastminute.ts — la palanca de URGENCIA que el motor daba por supuesta.
//
// POR QUÉ (01/08/2026). Tres comentarios de `apply/route.ts` dicen «cerca dejamos que el last-minute
// suavice»… y ese last-minute no existía: el motor nunca bajaba un precio por el hecho de que la fecha
// se acercara sin venderse. Justo lo mismo que hace PriceLabs, medido sobre nuestros propios snapshots:
// House pasa de 460€ a 23 días vista a 428€ el día de entrada —un 7% en tres semanas— y se queda con el
// 70% de las noches vacías. Aguantar el precio hasta el final no es una estrategia, es no tener una.
//
// LA REFERENCIA NO ES UN NÚMERO INVENTADO, ES LA ANTELACIÓN REAL DE CADA PISO. Se mide en
// `rate_snapshots`: cada vez que una fecha pasa de libre a ocupada entre dos snapshots, eso es una
// reserva entrando, y `rate_date - snapshot_date` es su antelación. Medido el 01/08/2026:
//   Busto 108 días · Luxury 57 · House 32 · Dúplex 7.
// Esa dispersión es la razón de que un umbral único no valga: a 60 días, Busto va tardísimo y Dúplex
// ni ha empezado a vender. Con la mediana de cada piso, la misma fórmula sirve para los cuatro.
//
// La urgencia arranca en la mediana y crece hasta el día de entrada, despacio al principio (curva
// cuadrática): pasada la mediana ya se ha vendido la MITAD de lo que se suele vender, así que seguir
// libre a partir de ahí es la señal. Solo BAJA — nunca sube — y aguas abajo siguen mandando el suelo
// de coste, el techo del propietario y el raíl de ±%/día.

export type LastMinuteInput = {
  /** días que faltan para la fecha (0 = hoy) */
  diasVista: number
  /** antelación MEDIANA medida de ese piso, en días (null = sin medir) */
  antelacionMediana: number | null
  /** nº de noches observadas que sostienen esa mediana (para no fiarnos de 3 datos) */
  muestra: number
  /** factor de evento de la fecha: una noche de evento NO se rebaja */
  factorEvento?: number
}

export type LastMinuteOpts = {
  /** intensidad por piso (`pricing_settings.lastminute_k`). 0 = palanca APAGADA */
  k?: number
  /** descuento máximo el día de entrada, con k=1 */
  descuentoMax?: number
  /** noches observadas mínimas para fiarnos de la mediana */
  muestraMinima?: number
  /** a partir de este factor de evento no se rebaja (la noche se vende sola) */
  factorEventoProtegido?: number
  /** exponente de la curva: >1 = suave al principio, fuerte al final */
  curva?: number
}

export type LastMinuteResult = {
  /** multiplicador ≤ 1 que se aplica al objetivo (1 = no tocar) */
  factor: number
  /** false = no había con qué decidir. NO confundir con «no hace falta rebajar». */
  evaluado: boolean
  motivo: string
}

const NEUTRO = (motivo: string, evaluado = false): LastMinuteResult => ({ factor: 1, evaluado, motivo })

export function factorLastMinute(i: LastMinuteInput, o: LastMinuteOpts = {}): LastMinuteResult {
  const k = o.k ?? 0
  const descuentoMax = o.descuentoMax ?? 0.25
  const muestraMinima = o.muestraMinima ?? 10
  const factorEventoProtegido = o.factorEventoProtegido ?? 1.15
  const curva = o.curva ?? 2

  if (!(k > 0)) return NEUTRO('palanca apagada para este piso (lastminute_k = 0)')
  if (i.antelacionMediana == null || !(i.antelacionMediana > 0)) {
    return NEUTRO('sin antelación medida: no sabemos cuándo se vende este piso')
  }
  if (i.muestra < muestraMinima) {
    return NEUTRO(`solo ${i.muestra} noches observadas: muestra insuficiente para fiarse de la mediana`)
  }
  if (!Number.isFinite(i.diasVista) || i.diasVista < 0) return NEUTRO('días vista inválidos')
  if ((i.factorEvento ?? 1) >= factorEventoProtegido) {
    return NEUTRO(`noche de evento (x${i.factorEvento}): se vende sola, no se rebaja`, true)
  }
  if (i.diasVista >= i.antelacionMediana) {
    return {
      factor: 1,
      evaluado: true,
      motivo: `faltan ${i.diasVista} días y este piso vende con ${i.antelacionMediana} de mediana: aún no toca`,
    }
  }

  // 0 en la mediana → 1 el día de entrada.
  const progreso = 1 - i.diasVista / i.antelacionMediana
  const descuento = Math.min(1, Math.max(0, k)) * descuentoMax * Math.pow(progreso, curva)
  const factor = 1 - descuento
  return {
    factor,
    evaluado: true,
    motivo:
      `quedan ${i.diasVista} días y este piso vende con ${i.antelacionMediana} de mediana ` +
      `→ ${Math.round(descuento * 100)}% de urgencia`,
  }
}
