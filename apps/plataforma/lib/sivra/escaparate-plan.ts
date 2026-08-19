// lib/sivra/escaparate-plan.ts — QUÉ ventanas de NUESTRO PROPIO anuncio hay que medir hoy.
//
// POR QUÉ EXISTE (19/08/2026). El motor convierte mercado→base con la recta del canal
// (`escaparate = markup × base + cuota_fija`, ver `pricing-canal.ts`). Esa recta solo se puede
// ajustar si alguien mira lo que el portal cobra POR NUESTRO PISO, y eso hay que pedírselo al
// conector ventana a ventana. Hasta hoy pasaba por CASUALIDAD: nuestro anuncio aparecía a veces
// entre los resultados de una búsqueda de comparables y el endpoint lo apartaba. Una medición que
// depende de aparecer por azar en una búsqueda ajena no es una medición: es un sorteo, y por eso
// el motor llevaba tres días tarifando con un ×1,20 inventado.
//
// Este módulo decide la lista EXPLÍCITA de ventanas a medir, y la decide con un criterio muy
// concreto: **lo que hace falta para que el ajuste sea posible**. No basta con medir tres veces —
// si las tres ventanas cuestan casi lo mismo, el multiplicador y la cuota fija son
// indistinguibles (infinitas parejas encajan igual de bien) y `ajusteCanal` responde
// `indeterminado`, que es lo honesto y lo inútil. Por eso el plan busca RECORRIDO de precio: mide
// una noche barata y una cara del calendario propio, no tres findes parecidos.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

import { MIN_VENTANAS_CANAL, RECORRIDO_MINIMO } from './pricing-canal.ts'

/** Una fecha candidata del calendario, con lo que costaría esa ventana a precio BASE de hoy. */
export interface CandidataEscaparate {
  /** YYYY-MM-DD */
  checkin: string
  noches: number
  /**
   * Suma de la base de Smoobu de esas noches. `null` = alguna noche sin snapshot: la ventana NO se
   * propone (medirla daría un precio de portal que no se puede cruzar con nada).
   */
  baseTotal: number | null
  /** por qué está esa fecha en el calendario (viaja al parte de la rutina) */
  motivo?: string
}

/** Una medición de escaparate que ya tenemos. */
export interface MedidaEscaparate {
  checkin: string
  noches: number
  guests: number
  baseTotal: number | null
  /** YYYY-MM-DD en que se midió */
  medidoEl: string
}

export interface PisoEscaparate {
  propertyId: string
  /** aforo con el que se mide (el mismo con el que se miden los comparables del piso) */
  aforo: number
  /** nombre EXACTO con el que el portal publica el piso; `null` = no lo sabemos */
  nombrePortal: string | null
  medidas: MedidaEscaparate[]
  /**
   * Fechas medibles CON SU BASE. Van por piso y no en una lista común a propósito: la base de una
   * misma noche es distinta en cada piso, y es justo la base lo que decide si una ventana aporta
   * recorrido al ajuste o no.
   */
  candidatas: CandidataEscaparate[]
}

export interface PeticionEscaparate {
  property_id: string
  nombre_portal: string
  checkin: string
  checkout: string
  noches: number
  guests: number
  /** lo que cuesta esa ventana a precio base hoy (para poder ordenar y explicar la elección) */
  base_total: number
  /** qué aporta esta ventana al ajuste */
  motivo: 'sin_ninguna' | 'faltan_ventanas' | 'falta_recorrido' | 'refresco'
}

export interface HuecoEscaparate {
  property_id: string
  motivo: string
}

export interface PlanEscaparate {
  peticiones: PeticionEscaparate[]
  /** pisos que NO se pueden medir y por qué. Un piso que desaparece del plan en silencio es un
   *  piso que nadie echa de menos: el ×1,20 supuesto sobrevivió así. */
  huecos: HuecoEscaparate[]
}

export interface OpcionesEscaparate {
  /** días tras los cuales una medición deja de contar para el ajuste (igual que el cron del canal) */
  ventanaDias?: number
  /** días tras los cuales una medición vigente se refresca igualmente (el portal se mueve) */
  refrescoDias?: number
  /** cuántas ventanas como mucho se piden por piso en una pasada */
  porPiso?: number
}

const DIA_MS = 86_400_000

function sumarDias(iso: string, dias: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + dias * DIA_MS).toISOString().slice(0, 10)
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) / DIA_MS)
}

/** Recorrido relativo de una lista de bases (0 = todas iguales). Es lo que separa m de F. */
export function recorrido(bases: number[]): number {
  if (bases.length < 2) return 0
  const max = Math.max(...bases), min = Math.min(...bases)
  return max > 0 ? (max - min) / max : 0
}

/**
 * Ventanas de escaparate que hay que medir hoy, por piso, ordenadas por urgencia.
 *
 * El criterio, en este orden:
 *   1. pisos SIN ninguna medición útil (el motor está tarifando con parámetros no contrastados);
 *   2. pisos con menos de `MIN_VENTANAS_CANAL`;
 *   3. pisos con ventanas suficientes pero SIN recorrido de precio (el ajuste sale `indeterminado`);
 *   4. refresco de lo más viejo.
 *
 * Dentro de un piso se elige la candidata que MÁS recorrido añade al conjunto: medir otra vez algo
 * que ya cuesta lo mismo que lo medido no acerca el ajuste ni un paso. A igualdad de recorrido gana
 * la que aporta una duración de estancia nueva (la cuota fija es POR ESTANCIA: verla repartida
 * entre 2 y entre 4 noches es lo que la hace visible).
 */
export function planEscaparate(
  pisos: PisoEscaparate[],
  hoy: string,
  opts: OpcionesEscaparate = {},
): PlanEscaparate {
  const ventanaDias = opts.ventanaDias ?? 45
  const refrescoDias = opts.refrescoDias ?? 14
  const porPiso = opts.porPiso ?? 2

  const peticiones: PeticionEscaparate[] = []
  const huecos: HuecoEscaparate[] = []

  for (const piso of pisos) {
    const utiles = (piso.candidatas ?? []).filter(c =>
      c.baseTotal != null && Number(c.baseTotal) > 0 && Number(c.noches) > 0 && c.checkin > hoy)
    if (!piso.nombrePortal) {
      // Sin el nombre con el que el portal lo publica no se puede pedir. Es un hueco REAL, no un
      // «ya está medido»: se declara para que alguien lo busque (ver `NOMBRE_PORTAL`).
      huecos.push({ property_id: piso.propertyId, motivo: 'sin nombre de portal: no se puede consultar el anuncio' })
      continue
    }
    if (!utiles.length) {
      huecos.push({ property_id: piso.propertyId, motivo: 'ninguna fecha candidata tiene base conocida (faltan snapshots)' })
      continue
    }

    const vigentes = piso.medidas.filter(m =>
      Number(m.guests) === Number(piso.aforo) &&
      m.baseTotal != null && Number(m.baseTotal) > 0 &&
      diasEntre(m.medidoEl, hoy) <= ventanaDias)
    const basesVigentes = vigentes.map(m => Number(m.baseTotal))
    const nochesVistas = new Set(vigentes.map(m => Number(m.noches)))
    const recienMedida = new Set(
      piso.medidas
        .filter(m => diasEntre(m.medidoEl, hoy) < refrescoDias)
        .map(m => `${m.checkin}|${m.noches}|${m.guests}`))

    const faltanVentanas = vigentes.length < MIN_VENTANAS_CANAL
    const faltaRecorrido = !faltanVentanas && recorrido(basesVigentes) < RECORRIDO_MINIMO
    const motivo: PeticionEscaparate['motivo'] =
      vigentes.length === 0 ? 'sin_ninguna'
      : faltanVentanas ? 'faltan_ventanas'
      : faltaRecorrido ? 'falta_recorrido'
      : 'refresco'

    // Un piso ya ajustable solo pide UNA ventana por pasada: no hay que gastar consultas del
    // conector en algo que ya se sabe, pero tampoco se deja envejecer (el portal cambia de tarifa).
    const cupo = motivo === 'refresco' ? 1 : porPiso
    const acumuladas = [...basesVigentes]
    const acumNoches = new Set(nochesVistas)

    for (let i = 0; i < cupo; i++) {
      let mejor: CandidataEscaparate | null = null
      let mejorPuntos = -1
      for (const c of utiles) {
        const clave = `${c.checkin}|${c.noches}|${piso.aforo}`
        if (recienMedida.has(clave)) continue
        if (peticiones.some(p => p.property_id === piso.propertyId && p.checkin === c.checkin && p.noches === c.noches)) continue
        // Cuánto RECORRIDO deja el conjunto si se añade esta candidata: es exactamente lo que el
        // ajuste necesita para poder separar el multiplicador de la cuota fija.
        const puntos = recorrido([...acumuladas, Number(c.baseTotal)])
          + (acumNoches.has(Number(c.noches)) ? 0 : 0.02)   // desempate: duración nueva
        if (puntos > mejorPuntos) { mejorPuntos = puntos; mejor = c }
      }
      if (!mejor) break
      acumuladas.push(Number(mejor.baseTotal))
      acumNoches.add(Number(mejor.noches))
      peticiones.push({
        property_id: piso.propertyId,
        nombre_portal: piso.nombrePortal,
        checkin: mejor.checkin,
        checkout: sumarDias(mejor.checkin, mejor.noches),
        noches: mejor.noches,
        guests: piso.aforo,
        base_total: Number(mejor.baseTotal),
        motivo,
      })
    }

    if (!peticiones.some(p => p.property_id === piso.propertyId) && motivo !== 'refresco') {
      huecos.push({
        property_id: piso.propertyId,
        motivo: `hacen falta ventanas (${vigentes.length}/${MIN_VENTANAS_CANAL}) pero todas las candidatas se midieron hace <${refrescoDias}d`,
      })
    }
  }

  // Primero lo que impide ajustar, luego el mantenimiento.
  const orden: Record<PeticionEscaparate['motivo'], number> = {
    sin_ninguna: 0, faltan_ventanas: 1, falta_recorrido: 2, refresco: 3,
  }
  peticiones.sort((a, b) => orden[a.motivo] - orden[b.motivo] || a.checkin.localeCompare(b.checkin))
  return { peticiones, huecos }
}
