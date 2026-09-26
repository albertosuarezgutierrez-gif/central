/**
 * «Siguiente paso» de la ficha de un cliente: UNA frase y UN botón, derivados de
 * lo que la ficha ya sabe (idea §W, 26/09/2026). Antes esa conclusión la sacaba
 * Alberto leyendo cinco bloques.
 *
 * Orden (el primero que aplica gana):
 *   1. recibo devuelto → llamar (el cliente puede estar sin cobertura, art. 15 LCS);
 *   2. vence dentro del preaviso → mirar precio (LCS art. 22: pasada la fecha, se prorroga);
 *   3. tiene auto o moto viva y ningún hogar vivo → presupuestar hogar (venta cruzada).
 *
 * 🚨 Un dato no leído NO dispara ni descarta nada: `devueltos === null` no es
 * «no hay devueltos» (simplemente no se afirma), y con `cotizacionesVivas === null`
 * el texto no dice que no haya presupuesto. Sin regla que aplique devuelve `null`
 * y la ficha no pinta nada: no hay «todo en orden» que no se haya comprobado.
 */

export type EntradaSiguientePaso = {
  recibosDevueltos: number | null
  proximo: {
    polizaId: string
    vencimiento: string
    limiteAviso: string
    diasHastaLimiteAviso: number
    enPlazo: boolean
  } | null
  /** Presupuestos vivos del cliente. `null` = no se sabe. */
  cotizacionesVivas: number | null
  /** Ramos (`tipo`) con alguna póliza VIVA. */
  ramosVivos: readonly string[]
}

export type SiguientePaso = {
  tono: 'urgente' | 'aviso' | 'venta'
  texto: string
  accion: { tipo: 'llamar' } | { tipo: 'retarificar'; polizaId: string } | { tipo: 'hogar' }
}

/** Ventana en la que merece la pena empezar a mirar precio antes del límite de preaviso. */
export const DIAS_AVISO_RENOVACION = 60

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function siguientePaso(e: EntradaSiguientePaso): SiguientePaso | null {
  if (e.recibosDevueltos !== null && e.recibosDevueltos > 0) {
    const n = e.recibosDevueltos
    return {
      tono: 'urgente',
      texto: `${n} recibo${n === 1 ? '' : 's'} devuelto${n === 1 ? '' : 's'}: llama para reclamar el cobro antes de que quede sin cobertura.`,
      accion: { tipo: 'llamar' },
    }
  }
  const p = e.proximo
  if (p && p.enPlazo && p.diasHastaLimiteAviso <= DIAS_AVISO_RENOVACION) {
    const sinPresupuesto = e.cotizacionesVivas === 0
    if (e.cotizacionesVivas === null || sinPresupuesto) {
      return {
        tono: 'aviso',
        texto: `Vence el ${fechaCorta(p.vencimiento)} (preaviso hasta el ${fechaCorta(p.limiteAviso)})${sinPresupuesto ? ' y no hay presupuesto' : ''}: mira precio.`,
        accion: { tipo: 'retarificar', polizaId: p.polizaId },
      }
    }
  }
  const tieneVehiculo = e.ramosVivos.some((r) => r === 'auto' || r === 'moto')
  if (tieneVehiculo && !e.ramosVivos.includes('hogar')) {
    return {
      tono: 'venta',
      texto: 'Tiene vehículo con nosotros y no hogar: presupuéstale el hogar.',
      accion: { tipo: 'hogar' },
    }
  }
  return null
}
