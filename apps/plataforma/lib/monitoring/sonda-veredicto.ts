// Veredicto de la sonda de proveedores de IA (Check 13) — módulo PURO, testeado con node --test.
//
// Por qué existe (04/08/2026): la sonda pintó NIM como «NO responde … revisar key/cuota» por UN
// timeout, mientras `ai_usos` tenía 40 llamadas reales OK de la víspera con la MISMA key y el
// MISMO modelo (p50 ~25 s contra un timeout de 30 s — tier gratis con cola). Un «va lento»
// servido como «está muerto» manda a revisar una key sana: es la regla global «dato que NO hay ≠
// dato que NO se ha mirado» aplicada a un vigilante. Aquí se separan los TRES estados:
//   ok        — respondió a la primera.
//   degradado — vivo pero lento: respondió al reintento, o agotó el timeout mientras el tráfico
//               real del proveedor SÍ completa (la key/cuota están vivas; es cola).
//   muerto    — error determinista (401/404/429…) o timeout sin tráfico real que lo desmienta →
//               revisar key/cuota. Si el proveedor muere de verdad, la ventana de tráfico se
//               vacía sola y un «degradado» escala a «muerto» en la pasada siguiente.

export interface SondaResultado {
  proveedor: string
  modelo: string
  ok: boolean
  ms: number
  error?: string
  /** Reintentos consumidos tras un timeout (0 = respondió a la primera). */
  reintentos?: number
}

/** Tráfico REAL (endpoint <> 'sonda') del proveedor en la ventana consultada. */
export interface TraficoRealProveedor {
  exitos: number
  p50Ms: number | null
  ventanaHoras: number
}

export type NivelSonda = 'ok' | 'degradado' | 'muerto'

/** Un timeout/abort es ambiguo (¿muerto o solo lento?); un HTTP 4xx/5xx es determinista. */
export function esErrorDeTimeout(error?: string): boolean {
  return !!error && /^(TimeoutError|AbortError)\b/.test(error)
}

const seg = (ms: number) => `${Math.round(ms / 1000)} s`

export function veredictoSonda(
  s: SondaResultado,
  trafico: TraficoRealProveedor | undefined,
  timeoutMs: number,
): { nivel: NivelSonda; linea: string } {
  const intentos = 1 + (s.reintentos ?? 0)

  if (s.ok && intentos === 1) return { nivel: 'ok', linea: '' }

  if (s.ok) {
    return {
      nivel: 'degradado',
      linea:
        `🟠 Sonda IA «${s.proveedor}» (${s.modelo}): respondió al ${intentos}º intento en ${seg(s.ms)} ` +
        `(el 1º agotó el timeout de ${seg(timeoutMs)}). Vivo pero LENTO — la cola del proveedor roza el ` +
        `timeout y el tráfico real que la pille paga un intento muerto antes del fallback.`,
    }
  }

  if (esErrorDeTimeout(s.error) && trafico && trafico.exitos > 0) {
    const p50 = trafico.p50Ms != null ? `, mediana ${seg(trafico.p50Ms)}` : ''
    return {
      nivel: 'degradado',
      linea:
        `🟠 Sonda IA «${s.proveedor}» (${s.modelo}): timeout de ${seg(timeoutMs)} en ${intentos} intento(s), ` +
        `pero el tráfico REAL sí completa (${trafico.exitos} éxitos en ${trafico.ventanaHoras} h${p50}) — ` +
        `la key/cuota están vivas; es la cola del proveedor rozando el timeout. No es «revisar la key»: ` +
        `o se convive con el peaje del intento muerto o se cambia de modelo/tier (buscador-ia).`,
    }
  }

  return {
    nivel: 'muerto',
    linea:
      `🔴 Sonda IA «${s.proveedor}» (${s.modelo}) NO responde: ${s.error ?? 'sin detalle'}. ` +
      `El tráfico real no lo notará (la cadena de fallback lo tapa), pero cada llamada está ` +
      `pagando este intento muerto — revisar key/cuota hoy.`,
  }
}
