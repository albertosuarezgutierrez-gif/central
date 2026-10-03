import { interpretarCapital, importeEiac, extraerDetalleCobertura } from '@central/module-seguros'

/**
 * Cómo ve el CLIENTE una cobertura: capital, franquicia y vigencia propia.
 * Puro y testeado (`docs/ASEGURA-CIMA-COBERTURAS.md`). Nada de comisiones, primas
 * por cobertura ni `datos_extra` crudo: solo estos tres textos.
 *
 * Capital (misma lectura que el operador, `interpretarCapital`):
 *  - importe → `2.162,49€`; `0` → «sin capital propio» (pintar «0€» es mentir: está cubierto);
 *  - `INF` → «ilimitado» (solo si es explícito); NULL / texto que no sabemos leer → `null` (no se pinta);
 *  - RC obligatoria → «Límites legales del seguro obligatorio» (nunca «ilimitado»); «RC Explotación»
 *    con INF → `null`;
 *  - 🚨 si `datos_extra` trae un límite POR SINIESTRO (`ClaseLimite` PS), ESE es el de la cobertura:
 *    `capital_asegurado` es entonces el capital del riesgo entero repetido en cada línea (medido
 *    03/10/2026: un Clio de 11.800€ traía 77.202 en Cristales/Incendio/Robo). Un límite ≤ 1 no es dinero
 *    (Allianz auto manda «1.00» en Fenómenos de la naturaleza) → `null`, nunca el capital heredado.
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

/** Erratas conocidas de las compañías en el NOMBRE de la garantía («Fenónemos Naturaleza», Mapfre auto). */
export function nombreCobertura(n: string): string {
  return n.replace(/Fen[oó]nemos/g, 'Fenómenos').replace(/fen[oó]nemos/g, 'fenómenos')
}

export const LIMITES_LEGALES = 'Límites legales del seguro obligatorio'

const esRcObligatoria = (n: string | null | undefined) => /(^|\b)(r\.?\s?c\.?|responsabilidad civil)\b.*obligatori/i.test(n ?? '')
const esRcExplotacion = (n: string | null | undefined) => /(r\.?\s?c\.?|responsabilidad civil)\b.*explotaci/i.test(n ?? '')

export type CapitalVista =
  | { tipo: 'importe'; importe: number }
  | { tipo: 'sin_capital' }
  | { tipo: 'ilimitado' }
  | { tipo: 'legal' }
  | { tipo: 'nada' }

/** El capital que SE AFIRMA de una cobertura (ver la cabecera). Una sola fuente para la ficha y la lista. */
export function capitalDeCobertura(c: { descripcion?: string | null; capitalAsegurado: string | null; datosExtra?: unknown }): CapitalVista {
  const limites = extraerDetalleCobertura(c.datosExtra)?.limites ?? null
  const lim = limites ? (limites.find(l => l.clase === 'PS' && l.maximo !== null) ?? limites.find(l => l.maximo !== null) ?? null) : null
  const cap = interpretarCapital(c.capitalAsegurado)
  const rcObl = esRcObligatoria(c.descripcion)
  if (lim !== null && lim.clase === 'PS') {
    return lim.maximo !== null && lim.maximo > 1 ? { tipo: 'importe', importe: lim.maximo } : { tipo: 'nada' }
  }
  if (cap.tipo === 'importe') return { tipo: 'importe', importe: cap.importe }
  if (rcObl) return { tipo: 'legal' }
  if (cap.tipo === 'sin_capital') return { tipo: 'sin_capital' }
  if (cap.tipo === 'ilimitado') return esRcExplotacion(c.descripcion) ? { tipo: 'nada' } : { tipo: 'ilimitado' }
  if (lim !== null && lim.maximo !== null && lim.maximo > 1) return { tipo: 'importe', importe: lim.maximo }
  return { tipo: 'nada' }
}

export function vistaCobertura(
  c: { descripcion?: string | null; capitalAsegurado: string | null; franquicia: string | null; fechaInicio: Date | null; fechaFin: Date | null; datosExtra?: unknown },
  periodoPoliza?: { inicio: Date | null; fin: Date | null },
): CoberturaVista {
  const cap = capitalDeCobertura(c)
  const capital =
    cap.tipo === 'importe'
      ? eur(cap.importe)
      : cap.tipo === 'sin_capital'
        ? 'sin capital propio'
        : cap.tipo === 'ilimitado'
          ? 'ilimitado'
          : cap.tipo === 'legal'
            ? LIMITES_LEGALES
            : null

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
