/**
 * Corte de SINIESTROS en la ingesta de CIMA — la avería que nadie vio.
 *
 * Desde el 28/09/2026 no entraba ningún fichero SIN mientras POL y REC seguían
 * llegando. `saludIngesta` solo avisa de un tipo a los 30 días y no compara tipos:
 * un tipo mudo con los hermanos vivos es el patrón que señala un fallo SUYO (filtro
 * del envío, tipo desactivado en la compañía), no un fin de semana tranquilo.
 *
 * Tres estados, ninguno «ok» por descarte:
 *  - `sin_dato`: no se sabe (SIN o la referencia viva no constan). NO es «va bien».
 *  - `ok`: SIN dentro del umbral, o los hermanos tampoco llegan (parada general:
 *    la cubre el vigía del cron, no esta señal).
 *  - `alerta`: SIN lleva > 72 h callado y POL o REC SÍ han llegado en ese periodo.
 *
 * Puro: decide con horas, sin BD ni red. Una fecha ausente es `null`/`undefined`,
 * jamás 0 (0 h = «acaba de llegar»).
 */

export const HORAS_CORTE_SINIESTROS = 72

/** Horas desde el último fichero de un tipo. `null`/`undefined` = no consta. */
export type HorasPorTipo = Record<string, number | null | undefined>

export type EntradaCorte = {
  /** Agregado de todas las compañías, por tipo (POL, REC, SIN, CEF…). */
  porTipo: HorasPorTipo | null | undefined
  /** Opcional: el mismo cuadro por compañía (código DGS → horas por tipo). */
  porEntidad?: Record<string, HorasPorTipo> | null
  umbralHoras?: number
}

export type CorteSiniestros =
  | { estado: 'sin_dato'; motivo: string }
  | { estado: 'ok' }
  | {
      estado: 'alerta'
      /** Horas que lleva SIN sin entrar. */
      horasSin: number
      /** Tipos hermanos que sí llegaron en ese periodo, con sus horas. */
      vivos: Array<{ tipo: string; horas: number }>
      /** Compañías con el mismo patrón (SIN callado, POL/REC vivos). Vacío = sin desglose. */
      entidades: Array<{ entidad: string; horasSin: number | null }>
    }

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

function vivosEn(t: HorasPorTipo, umbral: number, tipos: string[]) {
  return tipos.flatMap(tipo => {
    const h = t[tipo]
    return num(h) && h < umbral ? [{ tipo, horas: h }] : []
  })
}

export function corteSiniestros(e: EntradaCorte): CorteSiniestros {
  const umbral = e.umbralHoras ?? HORAS_CORTE_SINIESTROS
  const t = e.porTipo
  if (!t) return { estado: 'sin_dato', motivo: 'no se ha podido leer el último fichero por tipo' }
  const sin = t.SIN
  // SIN nunca llegó / no consta: no hay referencia de «cuándo se cortó».
  if (!num(sin)) return { estado: 'sin_dato', motivo: 'no consta cuándo llegó el último fichero SIN' }
  if (sin <= umbral) return { estado: 'ok' }
  const vivos = vivosEn(t, umbral, ['POL', 'REC'])
  if (vivos.length === 0) {
    // POL y REC tampoco llegan (o no constan): o es parada general, o no sabemos.
    const algunoSinDato = !num(t.POL) || !num(t.REC)
    return algunoSinDato
      ? { estado: 'sin_dato', motivo: 'SIN callado pero no consta POL/REC para compararlo' }
      : { estado: 'ok' }
  }
  const entidades = Object.entries(e.porEntidad ?? {}).flatMap(([entidad, ht]) => {
    const s = ht.SIN
    if (num(s) && s <= umbral) return []
    if (vivosEn(ht, umbral, ['POL', 'REC']).length === 0) return []
    return [{ entidad, horasSin: num(s) ? s : null }]
  })
  return { estado: 'alerta', horasSin: sin, vivos, entidades }
}

/** Mensaje de aviso; la fecha dd/mm del último SIN se calcula hacia atrás desde `ahora`. */
export function textoCorteSiniestros(c: Extract<CorteSiniestros, { estado: 'alerta' }>, ahora: Date = new Date()): string {
  const desde = new Date(ahora.getTime() - c.horasSin * 3_600_000)
  const f = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit' }).format(desde).replace(/\b(\d)\//, '0$1/').replace(/\/(\d)$/, '/0$1')
  const dias = Math.floor(c.horasSin / 24)
  const hermanos = c.vivos.map(v => v.tipo === 'POL' ? 'pólizas' : 'recibos').join('/')
  let t = `⚠️ CIMA: no entra ningún fichero de siniestros desde ${f} (${dias} días) y sí ${hermanos}. Revisar con Manuel/Codeoscopic.`
  if (c.entidades.length > 0) {
    t += '\nCompañías: ' + c.entidades.slice(0, 8).map(x =>
      `${x.entidad}${x.horasSin === null ? ' (nunca)' : ` (${Math.floor(x.horasSin / 24)} d)`}`).join(' · ')
  }
  return t
}
