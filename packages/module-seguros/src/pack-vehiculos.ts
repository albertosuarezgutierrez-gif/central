// PACK coche + moto OPCIONAL (03/10/2026, Alberto): tarificar los dos vehículos del cliente y
// ver, por compañía, lo que sumarían. Puro: lo que decide está aquí con su test; la pantalla solo
// pinta y la llamada de pago (0,50€ cada una) la lanza el corredor tras ver el coste.
//
// Tres estados: una compañía sin precio en uno de los dos lados NO suma (no se rellena con 0), y
// se dice cuál se queda fuera.

import { claveCompania } from './compania-oportunidad.ts'
import { esAllianz } from './bloqueo-compania.ts'
import { esCarteraEnVigor } from './cartera-viva.ts'

export type PrecioPack = {
  compania?: string | null
  producto?: string | null
  categoria?: string | null
  primaEur?: number | null
}

export type LadoPack = { compania: string; producto: string | null; categoria: string | null; primaEur: number }

export type FilaPack = {
  compania: string
  a: LadoPack
  b: LadoPack
  total: number
}

export type CuadroPack = {
  /** Compañías con precio en LOS DOS vehículos, de la suma más barata a la más cara. */
  filas: FilaPack[]
  /** Compañías con precio en un solo vehículo: no suman, y se dice cuáles. */
  soloEnUno: { compania: string; enA: boolean; enB: boolean }[]
}

const redondea = (n: number) => Math.round(n * 100) / 100

/** El precio más barato con prima de cada compañía (clave por compañía, no por producto). */
function mejorPorCompania(precios: readonly PrecioPack[]): Map<string, LadoPack> {
  const m = new Map<string, LadoPack>()
  for (const p of precios) {
    const clave = claveCompania(p.compania ?? null)
    const prima = p.primaEur
    if (!clave || typeof prima !== 'number' || !Number.isFinite(prima) || prima <= 0) continue
    const previo = m.get(clave)
    if (!previo || prima < previo.primaEur) {
      m.set(clave, { compania: (p.compania ?? '').trim(), producto: p.producto ?? null, categoria: p.categoria ?? null, primaEur: prima })
    }
  }
  return m
}

/** La suma por compañía de los dos vehículos. Sin precios válidos en alguno, `filas` queda vacía. */
export function cuadroPack(a: readonly PrecioPack[], b: readonly PrecioPack[]): CuadroPack {
  const ma = mejorPorCompania(a)
  const mb = mejorPorCompania(b)
  const filas: FilaPack[] = []
  const soloEnUno: CuadroPack['soloEnUno'] = []
  for (const [clave, la] of ma) {
    const lb = mb.get(clave)
    if (lb) filas.push({ compania: la.compania, a: la, b: lb, total: redondea(la.primaEur + lb.primaEur) })
    else soloEnUno.push({ compania: la.compania, enA: true, enB: false })
  }
  for (const [clave, lb] of mb) if (!ma.has(clave)) soloEnUno.push({ compania: lb.compania, enA: false, enB: true })
  filas.sort((x, y) => x.total - y.total)
  return { filas, soloEnUno }
}

/** Coste del pack: una llamada por vehículo. `null` = el precio de la llamada no se conoce. */
export function costePack(costePorLlamada: number | null | undefined, llamadas: number): number | null {
  if (typeof costePorLlamada !== 'number' || !Number.isFinite(costePorLlamada) || costePorLlamada < 0) return null
  return redondea(costePorLlamada * llamadas)
}

export type PolizaParaFamilia = {
  aseguradora: string | null | undefined
  estado: string | null | undefined
  /** Cartera VIVA (origen CIMA): `esCarteraViva`. */
  viva: boolean
  /** CIMA la ha confirmado: una emitida por nosotros y aún sin confirmar no cuenta como viva. */
  confirmadaCima: boolean
  /** Otra póliza la sustituye: ya no está en vigor. */
  sustituida: boolean
}

/** ¿Tiene el cliente alguna póliza EN VIGOR en Allianz? (`esCarteraEnVigor` + compañía). */
export function tienePolizaAllianzEnVigor(polizas: readonly PolizaParaFamilia[]): boolean {
  return polizas.some(
    (p) =>
      esAllianz(p.aseguradora) &&
      p.confirmadaCima &&
      esCarteraEnVigor({ importRef: p.viva ? null : 'volcado', eiacXmlHash: null, estado: p.estado, sustituidaAt: p.sustituida ? 'sustituida' : null }),
  )
}

export type DecisionFamiliaAllianz =
  | { familia: true; motivo: string }
  /** `null` = no se toca `insuredFamilyInAllianz` (comportamiento de siempre: sale `false`). */
  | { familia: null; motivo: string }

/**
 * `insuredFamilyInAllianz` = sí SOLO con el pack ENCENDIDO y, además, si el cliente tiene póliza viva en
 * Allianz o se ha tarifado el pack (la otra póliza sería también suya en Allianz). Con el pack apagado
 * NO se toca nada: es el comportamiento de siempre (sale `false`), tenga o no cartera en Allianz.
 * `carteraAllianz === null` (no se pudo leer la cartera) no autoriza a decir sí.
 */
export function decidirFamiliaAllianz(e: { packActivo: boolean; packTarificado: boolean; carteraAllianz: boolean | null }): DecisionFamiliaAllianz {
  if (!e.packActivo) return { familia: null, motivo: 'el pack está apagado: no se toca' }
  if (e.carteraAllianz === true) return { familia: true, motivo: 'el cliente tiene una póliza en vigor en Allianz' }
  if (e.packTarificado) return { familia: true, motivo: 'se ha tarifado el pack coche + moto (la otra póliza sería también suya en Allianz)' }
  return { familia: null, motivo: e.carteraAllianz === null ? 'no se ha podido mirar su cartera: no se marca' : 'no tiene póliza en Allianz y el otro vehículo aún no está tarifado' }
}
