import { interpretarCapital, importeEiac } from '@central/module-seguros'

/**
 * Cómo ve el CLIENTE una cobertura: capital, franquicia y vigencia propia.
 * Puro y testeado (`docs/ASEGURA-CIMA-COBERTURAS.md`). Nada de comisiones, primas
 * por cobertura ni `datos_extra` crudo: solo estos tres textos.
 *
 * Capital (misma lectura que el operador, `interpretarCapital`):
 *  - importe → `2.162,49€`; `0` → «sin capital propio» (pintar «0€» es mentir: está cubierto);
 *  - `INF` → «ilimitado»; NULL / texto que no sabemos leer → `null` (no se pinta).
 * Franquicia: solo un importe > 0 (el 0 no se afirma como «sin franquicia»).
 * Vigencia: solo si DIFIERE del periodo de la póliza (Mapfre repite la anualidad en cada línea).
 */
export type CoberturaVista = {
  capital: string | null
  franquicia: string | null
  vigencia: string | null
}

const EUR = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
const eur = (n: number) => `${EUR.format(n)}€`

const MADRID = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })

/** `AAAA-MM-DD` del día de Madrid en que cae el instante; `null` si no es fecha o es un centinela (año < 1900). */
function diaMadrid(d: Date | null | undefined): string | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900) return null
  return MADRID.format(d)
}

/** Las columnas `date` de la póliza llegan como medianoche UTC: su día es el UTC. */
function diaUtc(d: Date | null | undefined): string | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900) return null
  return d.toISOString().slice(0, 10)
}

const es = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export function vistaCobertura(
  c: { capitalAsegurado: string | null; franquicia: string | null; fechaInicio: Date | null; fechaFin: Date | null },
  periodoPoliza?: { inicio: Date | null; fin: Date | null },
): CoberturaVista {
  const cap = interpretarCapital(c.capitalAsegurado)
  const capital =
    cap.tipo === 'importe' ? eur(cap.importe) : cap.tipo === 'sin_capital' ? 'sin capital propio' : cap.tipo === 'ilimitado' ? 'ilimitado' : null

  const f = importeEiac(c.franquicia)
  const franquicia = f !== null && f > 0 ? eur(f) : null

  const ini = diaMadrid(c.fechaInicio)
  const fin = diaMadrid(c.fechaFin)
  const pIni = diaUtc(periodoPoliza?.inicio)
  const pFin = diaUtc(periodoPoliza?.fin)
  let vigencia: string | null = null
  if (ini !== null || fin !== null) {
    const igual = periodoPoliza !== undefined && ini === pIni && fin === pFin
    if (!igual) vigencia = ini && fin ? `del ${es(ini)} al ${es(fin)}` : ini ? `desde el ${es(ini)}` : `hasta el ${es(fin as string)}`
  }
  return { capital, franquicia, vigencia }
}
