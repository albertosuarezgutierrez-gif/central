// "🧭 Qué haría yo": consejo BREVE y DETERMINISTA sobre la declaración de la renta, derivado SOLO de los
// números que ya calcula `calcularEstadoDeclaracion` (comparativa-declaracion.ts). NADA de IA aquí: cero
// riesgo de cifras alucinadas, instantáneo, y funciona aunque la pasarela de IA esté caída — el mismo
// patrón "determinista primero" del resto del módulo fiscal.
//
// Aporta lo que las tarjetas de "Mi declaración" NO dicen en una frase:
//   1. Reencuadra los números en lenguaje llano (vas camino de pagar / que te devuelvan X, y en qué
//      modalidad).
//   2. PROVISIÓN de tesorería: si sale a pagar y el año sigue abierto, cuánto apartar al mes hasta la
//      campaña de renta para no llevarse el susto en junio. Ninguna otra pantalla lo da.
//
// NO repite la palanca de gasto/tramo: de eso ya se ocupa la tarjeta verde que va justo debajo. Lo
// consumen las dos puertas fiscales: /finanzas/fiscal (DeclaracionBlock) y el segmento 🧾 Fiscal de
// /banca (FiscalResumen).
import { eur, eurSinDecimales } from './dinero.ts'

// Entrada estructural mínima (subconjunto de EstadoDeclaracion) para que el helper sea PURO y testeable
// con `node --test` sin arrastrar Prisma/finanzas. El EstadoDeclaracion real es asignable a esto.
export type EntradaConsejo = {
  year: number
  finAnio: {
    conjunta: { resultado: number }
    separada: { titular: { resultado: number } }
    recomendacion: 'conjunta' | 'separada'
  }
}

export type AccionConsejo = { icono: string; texto: string }

export type ConsejoFiscal = {
  titular: string
  acciones: AccionConsejo[]
  tono: 'pagar' | 'devolver'
}

// Umbral por debajo del cual no vale la pena sugerir provisión mensual (el consejo quedaría en el titular).
const MIN_PROVISION_ANUAL = 300

// Meses desde `hoy` hasta el 30 de junio del año siguiente al ejercicio (1ª fracción de pago de la renta).
// Ese es el horizonte real para tener el dinero apartado antes de pagar. Mínimo 1 para no dividir por 0.
export function mesesHastaPagoRenta(year: number, hoy: Date): number {
  const objetivo = { anio: year + 1, mes: 5 } // junio = índice 5
  const meses = (objetivo.anio - hoy.getFullYear()) * 12 + (objetivo.mes - hoy.getMonth())
  return Math.max(1, meses)
}

// Consejo breve y determinista. `hoy` se inyecta (no `new Date()` dentro) para que sea reproducible.
export function consejoFiscal(estado: EntradaConsejo, hoy: Date): ConsejoFiscal {
  const rec = estado.finAnio.recomendacion
  const escenario = rec === 'conjunta' ? estado.finAnio.conjunta : estado.finAnio.separada.titular
  const resultado = escenario.resultado // > 0 = a pagar · <= 0 = a devolver
  const saleAPagar = resultado > 0
  const modalidadTxt = rec === 'conjunta' ? 'en conjunta con Pilar' : 'individual (solo tú)'
  const anioVigente = hoy.getFullYear() === estado.year

  const titular = anioVigente
    ? saleAPagar
      ? `Vas camino de pagar ${eur(resultado)} en la renta ${estado.year}, declarando ${modalidadTxt}.`
      : `Vas camino de que te devuelvan ${eur(-resultado)} en la renta ${estado.year}, declarando ${modalidadTxt}.`
    : saleAPagar
      ? `En la renta ${estado.year} te sale a pagar ${eur(resultado)}, declarando ${modalidadTxt}.`
      : `En la renta ${estado.year} te sale a devolver ${eur(-resultado)}, declarando ${modalidadTxt}.`

  const acciones: AccionConsejo[] = []

  // Provisión mensual: solo si sale a pagar una cantidad relevante y el ejercicio sigue abierto.
  if (anioVigente && saleAPagar && resultado >= MIN_PROVISION_ANUAL) {
    const meses = mesesHastaPagoRenta(estado.year, hoy)
    const mensual = resultado / meses
    acciones.push({
      icono: '🏦',
      texto: `Aparta ~${eurSinDecimales(mensual)}/mes hasta junio de ${estado.year + 1} (${meses} meses) y no te llevas el susto en la campaña.`,
    })
  }

  return { titular, acciones, tono: saleAPagar ? 'pagar' : 'devolver' }
}
