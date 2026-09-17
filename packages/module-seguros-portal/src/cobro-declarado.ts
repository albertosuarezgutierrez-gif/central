/**
 * Cuándo le van a pasar el PRÓXIMO recibo a una póliza que el cliente ha
 * declarado él mismo, para poder avisarle antes de que se lo carguen.
 *
 * Solo aplica a las DECLARADAS: la cartera de CIMA ya trae sus propios recibos
 * reales en `poliza_recibos` (ver `@central/module-seguros/recibos.ts`), y ahí
 * NO hace falta adivinar nada. Aquí no hay recibos: lo único que el cliente
 * puede darnos es la PERIODICIDAD (cuántas veces al año paga) y el
 * vencimiento (el aniversario del contrato), y de los dos se deriva el resto.
 *
 * 🚨 `'anual'` NO genera obligación de recibo, y no es un descuido: con un solo
 * pago al año, ese pago ES la renovación, que ya tiene su propia obligación
 * (`tipo: 'poliza'`). Una segunda fila con el mismo día sería el mismo aviso
 * dos veces, con dos textos distintos que no cuadran.
 *
 * El vocabulario (`anual`/`semestral`/`trimestral`/`mensual`) es el MISMO que
 * `FRACCIONES` de `@central/module-seguros` (la fracción de la cartera real):
 * dos listas de las mismas cuatro palabras habrían divergido el día que se
 * añadiera una quinta.
 */
import { FRACCIONES } from '@central/module-seguros'

export const PERIODICIDADES_PAGO = Object.keys(FRACCIONES) as readonly (keyof typeof FRACCIONES)[]

export type PeriodicidadPago = (typeof PERIODICIDADES_PAGO)[number]

export function esPeriodicidadPagoValida(valor: string): valor is PeriodicidadPago {
  return (PERIODICIDADES_PAGO as readonly string[]).includes(valor)
}

/**
 * Preaviso del recibo. NO es el plazo del art. 22 LCS (ese es
 * `DIAS_PREAVISO_TOMADOR`, de `obligacion.ts`, y es sobre la RENOVACIÓN): este
 * es un margen nuestro, para que a la persona le dé tiempo a tener fondos en
 * la cuenta antes de que pasen el cargo. No hay un mínimo legal que lo fije.
 */
export const DIAS_PREAVISO_RECIBO = 5

const MS_DIA = 86_400_000

function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function fechaAccionableRecibo(fechaEvento: Date): Date {
  return new Date(diaUtc(fechaEvento).getTime() - DIAS_PREAVISO_RECIBO * MS_DIA)
}

/** Último día del mes `y`-`m` (0-indexado), en UTC. */
function ultimoDiaDelMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
}

/**
 * `base` desplazada `meses` (puede ser negativo), conservando el DÍA salvo que
 * el mes destino sea más corto — entonces se ajusta al último día de ESE mes
 * (31 de enero + 1 mes = 28/29 de febrero, nunca un 3 de marzo inventado por
 * el desbordamiento silencioso de `setUTCMonth`).
 */
function sumarMesesClamp(base: Date, meses: number): Date {
  const dia = base.getUTCDate()
  const indice = base.getUTCFullYear() * 12 + base.getUTCMonth() + meses
  const anio = Math.floor(indice / 12)
  const mes = indice - anio * 12
  return new Date(Date.UTC(anio, mes, Math.min(dia, ultimoDiaDelMes(anio, mes))))
}

/**
 * El próximo cobro a partir de HOY (inclusive), o `null` si no se puede
 * calcular: sin vencimiento, sin periodicidad declarada, o periodicidad
 * `anual` (ver la cabecera).
 *
 * Los cobros de un contrato fraccionado caen cada `12 / fracciones` meses,
 * anclados en el aniversario del vencimiento — el mismo ciclo que
 * `dentroDelCiclo()` de `@central/module-seguros/pago.ts` usa para la cartera
 * real, aplicado hacia delante en vez de sobre un histórico de recibos.
 */
export function proximoCobroDeclarado(args: {
  vencimiento: Date
  periodicidad: string | null
  hoy: Date
}): Date | null {
  const { vencimiento, periodicidad, hoy } = args
  if (periodicidad === null || !esPeriodicidadPagoValida(periodicidad)) return null
  const fracciones = FRACCIONES[periodicidad]
  if (fracciones <= 1) return null

  const pasoMeses = 12 / fracciones
  const vencUtc = diaUtc(vencimiento)
  const hoyUtc = diaUtc(hoy)

  // Estimación inicial: cuántos pasos de `pasoMeses` hay entre el vencimiento y
  // hoy, contando meses enteros (ignora el día — se corrige justo debajo).
  const mesesEntre = (hoyUtc.getUTCFullYear() - vencUtc.getUTCFullYear()) * 12 + (hoyUtc.getUTCMonth() - vencUtc.getUTCMonth())
  let k = Math.floor(mesesEntre / pasoMeses)
  let candidato = sumarMesesClamp(vencUtc, k * pasoMeses)

  // La estimación por meses puede quedarse corta o pasarse por el DÍA del mes
  // (p. ej. hoy es después del día del vencimiento en su mes): un par de pasos
  // en cada sentido basta para encontrar el primero que ya no es anterior a hoy.
  while (candidato.getTime() < hoyUtc.getTime()) {
    k += 1
    candidato = sumarMesesClamp(vencUtc, k * pasoMeses)
  }
  while (true) {
    const anterior = sumarMesesClamp(vencUtc, (k - 1) * pasoMeses)
    if (anterior.getTime() < hoyUtc.getTime()) break
    k -= 1
    candidato = anterior
  }

  return candidato
}
