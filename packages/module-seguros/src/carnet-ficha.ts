// Puro: el carné de conducir que Alberto teclea en la ficha del cliente (29/09/2026, «añadir o
// modificar fecha de carnet»). La fecha es la de EXPEDICIÓN o última renovación: la antigüedad es
// lo que tarifica, y de ella se DERIVA la caducidad (`caducidadCarnet`), que no se teclea ni se guarda.

/** Los permisos de la DGT que se pueden anotar en la ficha: coche, moto y profesionales. */
export const TIPOS_CARNET = ['B', 'A', 'A2', 'A1', 'AM', 'BE', 'C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'] as const
export type TipoCarnet = (typeof TIPOS_CARNET)[number]

/** Ningún carné español se saca antes de los 15 (AM): una fecha anterior es un error de tecleo. */
const EDAD_MINIMA = 15

/** `' b '` → `'B'`. Es la clave para decir si dos filas son el MISMO carné. */
export function claveTipoCarnet(v: unknown): string {
  return typeof v === 'string' ? v.toUpperCase().replace(/\s/g, '') : ''
}

function fechaReal(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export type CarnetRevisado =
  | { ok: true; tipo: TipoCarnet; fecha: string }
  | { ok: false; campo: 'tipo' | 'fecha'; motivo: string }

/**
 * Tipo conocido y fecha real (`aaaa-mm-dd` o `dd/mm/aaaa`), no futura y no anterior a cumplir 15.
 * Sin fecha de nacimiento legible la edad no se comprueba: no se inventa, y el carné se guarda igual.
 */
export function revisarCarnet(entrada: {
  tipo: unknown
  fecha: unknown
  fechaNacimiento: string | null
  hoy: string
}): CarnetRevisado {
  const tipo = claveTipoCarnet(entrada.tipo)
  if (!(TIPOS_CARNET as readonly string[]).includes(tipo)) {
    return { ok: false, campo: 'tipo', motivo: tipo === '' ? 'Falta el tipo de carné.' : `Tipo de carné desconocido: ${tipo}.` }
  }
  const crudo = typeof entrada.fecha === 'string' ? entrada.fecha.trim() : ''
  const es = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(crudo)
  const fecha = es ? `${es[3]}-${es[2]}-${es[1]}` : crudo
  if (fecha === '') return { ok: false, campo: 'fecha', motivo: 'Falta la fecha del carné.' }
  if (!fechaReal(fecha)) return { ok: false, campo: 'fecha', motivo: 'La fecha del carné no es una fecha válida.' }
  if (fecha > entrada.hoy) return { ok: false, campo: 'fecha', motivo: 'La fecha del carné no puede ser futura.' }
  const nac = entrada.fechaNacimiento
  if (nac && fechaReal(nac) && fecha < `${Number(nac.slice(0, 4)) + EDAD_MINIMA}${nac.slice(4)}`) {
    return { ok: false, campo: 'fecha', motivo: `Esa fecha es de antes de cumplir ${EDAD_MINIMA} años: revisa el carné o la fecha de nacimiento.` }
  }
  return { ok: true, tipo: tipo as TipoCarnet, fecha }
}
