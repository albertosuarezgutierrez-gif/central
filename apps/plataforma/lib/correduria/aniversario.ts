// El vencimiento de una OPORTUNIDAD (seguro que el cliente tiene en OTRA compañía) es un
// ANIVERSARIO: el año da igual, solo cuentan día y mes, y se avisa todos los años (Alberto,
// 06/10/2026). Una póliza propia NO pasa por aquí: su vencimiento es una fecha concreta.
//
// Puro (sin BD ni red): `node --test`.

const ISO = /^\d{4}-\d{2}-\d{2}$/

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `YYYY-MM-DD` real (ida y vuelta: un 2026-02-30 no cuenta) o `null`. */
function valida(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string') return null
  const dia = iso.trim().slice(0, 10)
  if (!ISO.test(dia)) return null
  const d = new Date(`${dia}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia ? null : dia
}

/** Hoy de MADRID como `YYYY-MM-DD` (entre 00:00 y 02:00 el día UTC sigue siendo ayer). */
function hoyIso(hoy: string | Date): string | null {
  return typeof hoy === 'string' ? valida(hoy) : Number.isNaN(hoy.getTime()) ? null : hoy.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

function ultimoDiaDelMes(año: number, mes: number): number {
  return new Date(Date.UTC(año, mes, 0)).getUTCDate()
}

/**
 * La próxima ocurrencia (hoy incluido) del día y mes de `fecha`, sin mirar su año: una fecha
 * guardada en 2017, 2024 o 2027 da lo mismo. El 29/02 pasa al 28/02 en los años no bisiestos.
 * `null` si la fecha o `hoy` no se pueden leer: no se inventa un día.
 */
export function proximoAniversario(fecha: string | null | undefined, hoy: string | Date): string | null {
  const f = valida(fecha)
  const h = hoyIso(hoy)
  if (!f || !h) return null
  const mes = Number(f.slice(5, 7))
  const dia = Number(f.slice(8, 10))
  const añoHoy = Number(h.slice(0, 4))
  for (const año of [añoHoy, añoHoy + 1]) {
    const d = Math.min(dia, ultimoDiaDelMes(año, mes))
    const iso = `${año}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (iso >= h) return iso
  }
  return null
}

/** «1 de junio» (día y mes, sin año). `null` si la fecha no se puede leer. */
export function diaYMesEs(fecha: string | null | undefined): string | null {
  const f = valida(fecha)
  return f ? `${Number(f.slice(8, 10))} de ${MESES[Number(f.slice(5, 7)) - 1]}` : null
}

/** «Vence cada año el 1 de junio». `null` si la fecha no se puede leer. */
export function textoVenceCadaAño(fecha: string | null | undefined): string | null {
  const t = diaYMesEs(fecha)
  return t ? `Vence cada año el ${t}` : null
}

/** Días en cada mes (el 29/02 se admite), para los selects de día y mes. */
export const DIAS_POR_MES: readonly number[] = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
export const NOMBRES_MES: readonly string[] = MESES

/** Día y mes elegidos → fecha con el año de su próxima ocurrencia (compatible con la columna `date`). */
export function fechaDeDiaYMes(dia: number, mes: number, hoy: string | Date): string | null {
  if (!Number.isInteger(dia) || !Number.isInteger(mes) || mes < 1 || mes > 12 || dia < 1 || dia > DIAS_POR_MES[mes - 1]) return null
  // Una referencia bisiesta (2000) admite el 29/02; `proximoAniversario` ya lo lleva al 28/02 si toca.
  return proximoAniversario(`2000-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, hoy)
}
