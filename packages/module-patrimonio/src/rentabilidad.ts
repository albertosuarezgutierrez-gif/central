// Rentabilidad por inmueble y periodo: renta devengada − gastos confirmados − seguros.
//
// Se apoya en `calcularRentabilidad` de @central/module-contabilidad: se le pasan Apuntes con CÉNTIMOS como
// `base_imponible` (la función solo suma y resta; su `round2` no toca un entero) y `entidad_id` = inmueble.
//
// Reglas (cada una es una frase de la pantalla):
// - Solo cuentan los gastos CONFIRMADOS por el cliente; los propuestos por la IA se cuentan aparte
//   (`gastosSinConfirmar`) para que la pantalla diga «tienes N facturas sin revisar».
// - Coste de un gasto = TOTAL con IVA, salvo que el titular deduzca IVA (`deduceIva === true`), que es la BASE.
//   `deduceIva === null` → total (lo conservador) y aviso `iva_sin_dato`. Sin el importe que toca → no se cuenta
//   y aviso `gasto_sin_importe` (nunca «0 €»).
// - Seguros: primas de las pólizas del inmueble prorrateadas por días del periodo. `primas === null` = no se han
//   podido leer → aviso `seguros_sin_leer` (el número NO incluye seguros y lo dice). Lista leída y ningún seguro
//   del inmueble → aviso `sin_seguro_conocido` (es una OPORTUNIDAD comercial, no un «0 €» tranquilo).
// - Gastos de categoría SEGURO subidos como factura cuentan como seguros; si además hay prima de cartera para el
//   mismo inmueble → aviso `posible_doble_seguro`.
// - Gastos sin inmueble (gestoría de la sociedad) NO se reparten solos: van a `sinImputar`.

import { calcularRentabilidad, type Apunte } from '@central/module-contabilidad'
import { aDateMediodia, diasEntre, maxFecha, minFecha, sumarDias, type Fecha } from './fechas.ts'
import { totalRentaDevengada } from './contrato.ts'
import type { Centimos, Contrato, Gasto, Inmueble, PrimaSeguroInmueble, Titular } from './tipos.ts'

export type AvisoRentabilidad =
  | 'seguros_sin_leer'
  | 'sin_seguro_conocido'
  | 'prima_sin_dato'
  | 'posible_doble_seguro'
  | 'iva_sin_dato'
  | 'gasto_sin_importe'
  | 'sin_contrato'
  /** UNIDAD de un edificio cuyos gastos no se han podido repartir (sin criterio, sin m²/% o % que no suman 100): su número NO incluye su parte. */
  | 'reparto_edificio_pendiente'

export interface RentabilidadInmueble {
  inmuebleId: string
  ingresos: Centimos
  /** Gastos confirmados SIN seguros. */
  gastos: Centimos
  /**
   * Esos mismos gastos (los que suman en `gastos`) desglosados por categoría; sin categoría = `SIN_CATEGORIA`. Las
   * facturas de SEGURO y las primas enlazadas NO están aquí: van en `seguros`. Suma de valores = `gastos`.
   */
  gastosPorCategoria: Record<string, Centimos>
  seguros: Centimos
  beneficio: Centimos
  /** % sobre ingresos con un decimal; `null` sin ingresos. */
  margenPct: number | null
  gastosSinConfirmar: number
  avisos: AvisoRentabilidad[]
}

export interface ResultadoRentabilidad {
  desde: Fecha
  hasta: Fecha
  inmuebles: RentabilidadInmueble[]
  /** Gastos confirmados del titular sin inmueble: no se reparten solos. */
  sinImputar: Centimos
}

export interface EntradaRentabilidad {
  titulares: readonly Titular[]
  inmuebles: readonly Inmueble[]
  contratos: readonly Contrato[]
  gastos: readonly Gasto[]
  /** `null` = no se han podido leer las pólizas (no es «sin seguros»). */
  primas: readonly PrimaSeguroInmueble[] | null
  desde: Fecha
  hasta: Fecha
}

/** Parte de la prima anual que cae en `[desde, hasta]`, por días de la anualidad. `null` si la prima no consta. */
export function primaProrrateada(p: PrimaSeguroInmueble, desde: Fecha, hasta: Fecha): Centimos | null {
  const ini = maxFecha(p.desde, desde)
  const fin = minFecha(sumarDias(p.hasta, -1), hasta) // `hasta` de la póliza = día del vencimiento (no cubre ese día dos veces)
  if (ini > fin) return 0
  if (p.primaAnual === null) return null
  const diasAnualidad = diasEntre(p.desde, p.hasta)
  if (diasAnualidad <= 0) return null
  return Math.round((p.primaAnual * (diasEntre(ini, fin) + 1)) / diasAnualidad)
}

function apunte(id: string, tipo: 'ingreso' | 'gasto', fecha: Fecha, importe: Centimos, entidad: string, categoria: string): Apunte {
  return {
    id, tipo, fecha: aDateMediodia(fecha),
    base_imponible: importe, porcentaje_iva: 0, cuota_iva: 0, total: importe,
    realizado: false, entidad_id: entidad, categoria,
  }
}

export function rentabilidadPorInmueble(e: EntradaRentabilidad): ResultadoRentabilidad {
  const titularDe = new Map(e.titulares.map((t) => [t.id, t]))
  const apuntes: Apunte[] = []
  const seguros = new Map<string, Centimos>()
  const avisos = new Map<string, Set<AvisoRentabilidad>>()
  const sinConfirmar = new Map<string, number>()
  const porCategoria = new Map<string, Map<string, Centimos>>()
  const conPrima = new Set<string>()
  const conFacturaSeguro = new Set<string>()
  const ids = new Set(e.inmuebles.map((i) => i.id))
  const avisar = (id: string, a: AvisoRentabilidad) => {
    const s = avisos.get(id) ?? new Set<AvisoRentabilidad>()
    s.add(a)
    avisos.set(id, s)
  }
  let sinImputar = 0

  // Ingresos: renta devengada de cada contrato.
  for (const inm of e.inmuebles) {
    const cs = e.contratos.filter((c) => c.inmuebleId === inm.id)
    if (cs.length === 0) avisar(inm.id, 'sin_contrato')
    for (const c of cs) {
      const renta = totalRentaDevengada(c, e.desde, e.hasta)
      if (renta > 0) apuntes.push(apunte(`renta:${c.id}`, 'ingreso', e.desde, renta, inm.id, 'RENTA'))
    }
  }

  // Gastos confirmados.
  for (const g of e.gastos) {
    if (g.fecha < e.desde || g.fecha > e.hasta || g.estado === 'descartado') continue
    if (g.inmuebleId !== null && !ids.has(g.inmuebleId)) continue // de otro inmueble: no es de esta lista
    if (g.estado === 'propuesto') {
      if (g.inmuebleId) sinConfirmar.set(g.inmuebleId, (sinConfirmar.get(g.inmuebleId) ?? 0) + 1)
      continue
    }
    const deduce = titularDe.get(g.titularId)?.deduceIva ?? null
    let importe: Centimos | null
    if (deduce === true) importe = g.base
    else importe = g.total
    if (deduce === null && g.inmuebleId) avisar(g.inmuebleId, 'iva_sin_dato')
    if (importe === null) {
      if (g.inmuebleId) avisar(g.inmuebleId, 'gasto_sin_importe')
      continue
    }
    if (g.inmuebleId === null) {
      sinImputar += importe
      continue
    }
    if (g.categoria === 'SEGURO') {
      seguros.set(g.inmuebleId, (seguros.get(g.inmuebleId) ?? 0) + importe)
      conFacturaSeguro.add(g.inmuebleId)
    } else {
      const cat = g.categoria ?? 'SIN_CATEGORIA'
      const m = porCategoria.get(g.inmuebleId) ?? new Map<string, Centimos>()
      m.set(cat, (m.get(cat) ?? 0) + importe)
      porCategoria.set(g.inmuebleId, m)
    }
    apuntes.push(apunte(`gasto:${g.id}`, 'gasto', g.fecha, importe, g.inmuebleId, g.categoria ?? 'SIN_CATEGORIA'))
  }

  // Seguros de la cartera / declarados.
  if (e.primas === null) {
    for (const inm of e.inmuebles) avisar(inm.id, 'seguros_sin_leer')
  } else {
    for (const p of e.primas) {
      if (!ids.has(p.inmuebleId)) continue
      conPrima.add(p.inmuebleId)
      const parte = primaProrrateada(p, e.desde, e.hasta)
      if (parte === null) {
        avisar(p.inmuebleId, 'prima_sin_dato')
        continue
      }
      if (parte === 0) continue
      seguros.set(p.inmuebleId, (seguros.get(p.inmuebleId) ?? 0) + parte)
      apuntes.push(apunte(`prima:${p.inmuebleId}:${p.desde}`, 'gasto', maxFecha(p.desde, e.desde), parte, p.inmuebleId, 'SEGURO'))
    }
    for (const inm of e.inmuebles) {
      if (!conPrima.has(inm.id) && !conFacturaSeguro.has(inm.id)) avisar(inm.id, 'sin_seguro_conocido')
      if (conPrima.has(inm.id) && conFacturaSeguro.has(inm.id)) avisar(inm.id, 'posible_doble_seguro')
    }
  }

  const porEntidad = new Map(calcularRentabilidad(apuntes).map((r) => [r.entidad_id, r]))
  const inmuebles = e.inmuebles.map((inm): RentabilidadInmueble => {
    const r = porEntidad.get(inm.id)
    const seg = seguros.get(inm.id) ?? 0
    const ingresos = r?.ingresos ?? 0
    const gastosTotales = r?.gastos ?? 0
    return {
      inmuebleId: inm.id,
      ingresos,
      gastos: gastosTotales - seg,
      gastosPorCategoria: Object.fromEntries(porCategoria.get(inm.id) ?? []),
      seguros: seg,
      beneficio: r?.beneficio ?? 0,
      margenPct: r?.margen_pct ?? null,
      gastosSinConfirmar: sinConfirmar.get(inm.id) ?? 0,
      avisos: [...(avisos.get(inm.id) ?? [])].sort(),
    }
  })
  return { desde: e.desde, hasta: e.hasta, inmuebles, sinImputar }
}
