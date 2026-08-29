// ⚡ Precio EN VIVO (intradía, público) — para el botón «Actualizar» de /trading (23/08/2026).
// La pasada del agente es DIARIA, así que a mitad de sesión el panel enseñaba la película de ayer;
// este módulo lee el último precio negociado de la meta del chart de Yahoo (la misma fuente de
// respaldo que ya sirve los cierres cuando Stooq bloquea la IP de Vercel — el endpoint de quotes
// de Stooq `q/l` devuelve 404 a IPs de datacenter, verificado 23/08/2026 vía pg_net).
//
// SOLO PARA PINTAR: nada de lo que devuelve se persiste en ninguna tabla trading_* — el track
// record se sigue puntuando con la cadena vigilada de precios-guardia (landmine CVX, PR #1315).
// Aun así hereda sus dos lecciones antes de enseñar un número:
//   · la DIVISA del dato debe coincidir con la de la posición (mezclar unidades fabrica un P&L
//     plausible y falso, PR #1189 — y un ticker sin sufijo puede resolver a OTRO instrumento);
//   · banda ×2 contra una referencia conocida (cierre previo o último precio de IBKR): un precio
//     escandaloso no se pinta, se declara el hueco.
// Parseo PURO y testeado con la respuesta real del 23/08/2026; el fetch corre en Vercel.

import type { PosicionRealIn } from './cartera-real'

export type PrecioVivo = {
  precio: number
  /** Divisa que declara la fuente (meta.currency). Comparar SIEMPRE antes de usar el precio. */
  divisa: string
  /** Momento del último precio negociado (ISO). null = la fuente no lo dio. */
  horaISO: string | null
}

// 🏛️ Mercado de IBKR → sufijo de Yahoo + divisa que DEBE tener la posición para poder usarlo.
// Por qué existe (28/08/2026): Yahoo NO conoce el ticker pelado de un UCITS europeo — `VWCE`
// devuelve 404 «symbol may be delisted» y `VWCE.DE` devuelve 200 con `currency:'EUR'` y
// `fullExchangeName:'XETRA'` (ambas comprobadas contra la fuente real, no supuestas). Sin este
// mapa el botón «🔄 Actualizar» refrescaba CVX (NYSE) y dejaba el ETF núcleo —el 98,6% de la
// cuenta— con la foto de IBKR de la pasada de anoche, sin que la pantalla lo distinguiera.
//
// La tabla es CORTA a propósito: un sufijo inventado no falla en silencio, resuelve a OTRO
// instrumento con el mismo ticker (la landmine de unidades del PR #1189, y la que ya avisa la
// cabecera de este archivo). Para añadir un mercado, pide antes la respuesta REAL de Yahoo y
// comprueba `currency` + `fullExchangeName`; si no lo has mirado, no lo pongas.
const MERCADO_YAHOO: Record<string, { sufijo: string; divisa: string }> = {
  // Xetra (IBKR lo llama IBIS/IBIS2). Verificado 28/08/2026 con VWCE.DE → 200, EUR, XETRA.
  IBIS: { sufijo: '.DE', divisa: 'EUR' },
  IBIS2: { sufijo: '.DE', divisa: 'EUR' },
  // Borsa Italiana. Verificado 28/08/2026 con VWCE.MI → 200, EUR, Milan.
  BVME: { sufijo: '.MI', divisa: 'EUR' },
  'BVME.ETF': { sufijo: '.MI', divisa: 'EUR' },
}

const SUFIJOS_YAHOO = [...new Set(Object.values(MERCADO_YAHOO).map(m => m.sufijo))]

/** Sufijo de mercado que ya trae un símbolo (`VWCE.DE` → `.DE`), o `''` si no trae ninguno de los
 *  conocidos — un `.B` de clase (BRK.B) NO es un sufijo de mercado. */
function sufijoDe(simbolo: string): string {
  return SUFIJOS_YAHOO.find(x => simbolo.endsWith(x) && simbolo.length > x.length) ?? ''
}

/** Mercado que IBKR incrusta en la descripción de la posición (`VWCE @IBIS2`). null = no lo dice
 *  (las acciones USA llegan con la descripción a secas, p. ej. `CVX`). */
export function mercadoIbkr(descripcion: string | null | undefined): string | null {
  const m = /@([A-Z0-9.-]+)/i.exec(descripcion ?? '')
  return m ? m[1].toUpperCase() : null
}

/** Símbolo con el que preguntar a Yahoo por una posición real de IBKR. Solo añade sufijo cuando
 *  el mercado está en la tabla verificada Y la divisa de la posición coincide con la que cotiza
 *  ese mercado; ante cualquier duda devuelve el ticker tal cual (que es lo que ya se hacía). */
export function simboloYahoo(p: { simbolo: string; descripcion?: string | null; divisa?: string | null }): string {
  const base = p.simbolo.trim().toUpperCase()
  if (sufijoDe(base)) return base                       // ya viene cualificado
  const mercado = mercadoIbkr(p.descripcion)
  const mapa = mercado ? MERCADO_YAHOO[mercado] : undefined
  if (!mapa) return base
  if (mapa.divisa !== (p.divisa ?? '').trim().toUpperCase()) return base   // otra divisa = otro papel
  return base + mapa.sufijo
}

export function urlYahooVivo(simbolo: string): string {
  const s = simbolo.trim().toUpperCase()
  // El punto de CLASE va a guion (BRK.B → BRK-B); el de MERCADO se conserva (VWCE.DE), que es
  // justo lo que Yahoo espera — cambiarlo a `VWCE-DE` devuelve 404 (comprobado 28/08/2026).
  const suf = sufijoDe(s)
  const consulta = (suf ? s.slice(0, -suf.length) : s).replace(/\./g, '-') + suf
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(consulta)}?interval=1d&range=1d`
}

// Meta del chart de Yahoo → precio vivo. Defensivo: sin regularMarketPrice finito>0 o sin
// currency legible → null (nunca un 0 ni un precio de otra cosa).
export function parseYahooVivo(json: unknown): PrecioVivo | null {
  const meta = (json as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: unknown; currency?: unknown; regularMarketTime?: unknown } }> } })
    ?.chart?.result?.[0]?.meta
  if (!meta) return null
  const precio = meta.regularMarketPrice
  if (typeof precio !== 'number' || !Number.isFinite(precio) || precio <= 0) return null
  const divisa = typeof meta.currency === 'string' && meta.currency.trim() ? meta.currency.trim().toUpperCase() : null
  if (!divisa) return null
  const t = meta.regularMarketTime
  const horaISO = typeof t === 'number' && Number.isFinite(t) && t > 0 ? new Date(t * 1000).toISOString() : null
  return { precio, divisa, horaISO }
}

/** Banda ×2 contra una referencia conocida (misma guarda que precios-guardia, PR #1315): sin
 *  referencia NO se juzga — y por tanto no se usa el vivo, que es el estado conservador. */
export function precioVivoFiable(vivo: number, referencia: number | null | undefined): boolean {
  if (!Number.isFinite(vivo) || vivo <= 0) return false
  if (referencia == null || !Number.isFinite(referencia) || referencia <= 0) return false
  return vivo <= referencia * 2 && vivo >= referencia / 2
}

/** Posición de la cartera real re-valorada con el precio vivo — SOLO si la divisa coincide y el
 *  precio pasa la banda ×2 contra el último precio que dio IBKR (sin referencia de IBKR no se
 *  toca nada: mejor la foto de ayer declarada que un número sin contraste). Devuelve la posición
 *  intacta con `esVivo:false` cuando no procede. */
export function conPrecioVivo<T extends PosicionRealIn>(p: T, vivo: PrecioVivo | null | undefined): { posicion: T; esVivo: boolean } {
  if (!vivo || vivo.divisa !== p.divisa || !precioVivoFiable(vivo.precio, p.precioActual)) {
    return { posicion: p, esVivo: false }
  }
  return {
    posicion: {
      ...p,
      precioActual: vivo.precio,
      valorMercado: p.cantidad * vivo.precio,
      pnlNoRealizado: p.precioMedio != null ? (vivo.precio - p.precioMedio) * p.cantidad : null,
      // pnlDiario NO se recalcula: es el dato de IBKR de SU sesión, no lo sabemos en vivo.
    },
    esVivo: true,
  }
}

const UA = 'Mozilla/5.0 (compatible; central-trading/1.0; paper-research)'

// Último precio negociado de UN símbolo. Best-effort: cualquier fallo → null (el caller pinta
// el cierre/última lectura que ya tenía, nunca un hueco disfrazado de 0).
export async function precioVivoYahoo(simbolo: string, timeoutMs = 3000): Promise<PrecioVivo | null> {
  try {
    const res = await fetch(urlYahooVivo(simbolo), {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return parseYahooVivo(await res.json())
  } catch {
    return null
  }
}

/** Precios vivos de un lote de símbolos (dedupe interno). Un símbolo sin precio queda en el mapa
 *  con null — «no lo sé ahora mismo», que el caller debe declarar, no colapsar. */
export async function preciosVivos(simbolos: string[], timeoutMs = 3000): Promise<Map<string, PrecioVivo | null>> {
  const unicos = [...new Set(simbolos.map(s => s.trim().toUpperCase()).filter(Boolean))]
  const resultados = await Promise.all(unicos.map(s => precioVivoYahoo(s, timeoutMs)))
  return new Map(unicos.map((s, i) => [s, resultados[i]]))
}
