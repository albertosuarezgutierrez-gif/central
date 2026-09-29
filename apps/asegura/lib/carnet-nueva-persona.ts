// Puro: el carné que trae «+ Nueva persona» del riesgo (29/09/2026). Quien conduce un coche o una
// moto necesita la fecha de su carné para pedir precio (Avant2 la exige en `drivingLicenses`), y
// pedirla al darle de alta evita que el hueco aparezca después, en la pantalla de tarificar.

/** Tipos que se aceptan: el B de coche y los de moto del catálogo `/motorcycle/driving-licenses`. */
export const TIPOS_CARNET_NUEVA = ['B', 'A', 'A2', 'A1', 'AM'] as const
export type TipoCarnetNueva = (typeof TIPOS_CARNET_NUEVA)[number]

/** Ningún carné español se saca antes de los 15 (AM): una fecha anterior es un error de tecleo. */
const EDAD_MINIMA = 15

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

function fechaReal(v: string): boolean {
  const m = RE_FECHA.exec(v)
  if (!m) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function aIso(v: string): string {
  const es = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v)
  return es ? `${es[3]}-${es[2]}-${es[1]}` : v
}

export type CarnetNueva = { tipo: TipoCarnetNueva; fecha: string }

/**
 * `null` = no viene carné (se guarda la persona sin él, como hasta ahora). Un carné que viene mal
 * NO se ignora: se rechaza el alta entera, porque guardar la persona sin él diría que se guardó.
 */
export function carnetDeNuevaPersona(
  persona: Record<string, unknown>,
  hoy: string,
): { ok: true; carnet: CarnetNueva | null } | { ok: false; motivo: string } {
  // El asistente de Telegram dicta las fechas en `dd/mm/aaaa`; la pantalla, en `aaaa-mm-dd`.
  const fecha = aIso(typeof persona.fechaCarnet === 'string' ? persona.fechaCarnet.trim() : '')
  const tipoTxt = typeof persona.tipoCarnet === 'string' ? persona.tipoCarnet.trim().toUpperCase().replace(/\s/g, '') : ''
  if (fecha === '') {
    return tipoTxt === '' ? { ok: true, carnet: null } : { ok: false, motivo: 'falta la fecha del carné' }
  }
  if (!fechaReal(fecha)) return { ok: false, motivo: 'la fecha del carné tiene que ser aaaa-mm-dd' }
  if (fecha > hoy) return { ok: false, motivo: 'la fecha del carné no puede ser futura' }
  const tipo = (tipoTxt === '' ? 'B' : tipoTxt) as TipoCarnetNueva
  if (!TIPOS_CARNET_NUEVA.includes(tipo)) return { ok: false, motivo: `tipo de carné desconocido: ${tipoTxt}` }
  const nac = aIso(typeof persona.fechaNacimiento === 'string' ? persona.fechaNacimiento.trim() : '')
  if (fechaReal(nac)) {
    const minimo = `${Number(nac.slice(0, 4)) + EDAD_MINIMA}${nac.slice(4)}`
    if (fecha < minimo) return { ok: false, motivo: `el carné es de antes de cumplir ${EDAD_MINIMA} años: revisa las dos fechas` }
  }
  return { ok: true, carnet: { tipo, fecha } }
}
