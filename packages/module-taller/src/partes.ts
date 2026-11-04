// Partes de horas por mecánico y coche (OT). NO es el fichaje legal (eso es apps/rrhh): solo atribuye horas.
// Regla: un mecánico, un parte abierto a la vez; abrir otro coche cierra el anterior en el mismo instante.
// Baremo y horas reales se guardan los dos; el margen sale de la diferencia. Sin uno de los dos → null, nunca 0.

import { dividirRedondeando } from './dinero.ts'

const MS_MINUTO = 60_000
const MINUTOS_HORA = 60

export interface ParteHoras {
  id: string
  otId: string
  mecanicoId: string
  inicio: Date
  fin: Date | null
}

export interface ParteNuevo {
  otId: string
  mecanicoId: string
  inicio: Date
}

export interface CambioDeParte {
  /** Partes del mecánico que hay que cerrar (con su `fin` ya puesto). */
  cerrar: ParteHoras[]
  /** Parte a abrir, o null si ya estaba trabajando en esa misma OT. */
  abrir: ParteNuevo | null
}

/** Abre un parte para `mecanicoId` en `otId` cerrando el que tuviera abierto en otro coche. */
export function abrirParte(partes: ParteHoras[], mecanicoId: string, otId: string, ahora: Date): CambioDeParte {
  const abiertos = partes.filter((p) => p.mecanicoId === mecanicoId && p.fin === null)
  const enEsta = abiertos.find((p) => p.otId === otId)
  const cerrar = abiertos
    .filter((p) => p !== enEsta)
    .map((p) => {
      if (ahora.getTime() < p.inicio.getTime()) throw new RangeError(`parte ${p.id}: «ahora» es anterior al inicio`)
      return { ...p, fin: ahora }
    })
  return { cerrar, abrir: enEsta ? null : { otId, mecanicoId, inicio: ahora } }
}

/** Cierra el parte abierto del mecánico (fin de jornada o «cerrar mi parte»). */
export function cerrarParte(partes: ParteHoras[], mecanicoId: string, ahora: Date): ParteHoras[] {
  return partes
    .filter((p) => p.mecanicoId === mecanicoId && p.fin === null)
    .map((p) => {
      if (ahora.getTime() < p.inicio.getTime()) throw new RangeError(`parte ${p.id}: «ahora» es anterior al inicio`)
      return { ...p, fin: ahora }
    })
}

/** Minutos de un parte CERRADO (redondeo al minuto). Abierto → null (no se sabe aún, no es 0). */
export function minutosParte(p: ParteHoras): number | null {
  if (p.fin === null) return null
  const ms = p.fin.getTime() - p.inicio.getTime()
  if (ms < 0) throw new RangeError(`parte ${p.id}: fin anterior al inicio`)
  return Math.round(ms / MS_MINUTO)
}

export interface HorasMecanicoCoche {
  mecanicoId: string
  otId: string
  minutosCerrados: number
  /** Partes aún abiertos: mientras > 0 el total NO es definitivo. */
  partesAbiertos: number
}

/** Agrega por (mecánico, OT). Los partes abiertos se cuentan aparte; no suman 0 minutos «como si nada». */
export function horasPorMecanicoYCoche(partes: ParteHoras[]): HorasMecanicoCoche[] {
  const m = new Map<string, HorasMecanicoCoche>()
  for (const p of partes) {
    const k = `${p.mecanicoId}\u0000${p.otId}`
    const acc = m.get(k) ?? { mecanicoId: p.mecanicoId, otId: p.otId, minutosCerrados: 0, partesAbiertos: 0 }
    const min = minutosParte(p)
    if (min === null) acc.partesAbiertos += 1
    else acc.minutosCerrados += min
    m.set(k, acc)
  }
  return [...m.values()]
}

/** Minutos reales de una OT, o null si queda algún parte abierto (el dato no está cerrado). */
export function minutosRealesOt(partes: ParteHoras[], otId: string): number | null {
  const deOt = partes.filter((p) => p.otId === otId)
  let total = 0
  for (const p of deOt) {
    const min = minutosParte(p)
    if (min === null) return null
    total += min
  }
  return total
}

export interface MargenHoras {
  baremoMinutos: number | null
  realesMinutos: number | null
  /** baremo − real (positivo = se tardó menos de lo tabulado). null si falta alguno. */
  diferenciaMinutos: number | null
  /** diferencia × precio hora, en céntimos. null si falta alguno. */
  margenCent: number | null
}

export function margenHoras(baremoMinutos: number | null, realesMinutos: number | null, precioHoraCent: number): MargenHoras {
  if (baremoMinutos === null || realesMinutos === null) {
    return { baremoMinutos, realesMinutos, diferenciaMinutos: null, margenCent: null }
  }
  const diferencia = baremoMinutos - realesMinutos
  return {
    baremoMinutos,
    realesMinutos,
    diferenciaMinutos: diferencia,
    margenCent: dividirRedondeando(diferencia * precioHoraCent, MINUTOS_HORA),
  }
}
