// 🐕 Perro guardián de la pasada nocturna de trading.
//
// La app en Vercel NO habla con IBKR: el NAV del bróker lo refresca CADA NOCHE LABORABLE la rutina
// `trading-analista` (sesión Claude con el MCP de IBKR) vía POST /api/trading/saldo → `broker_saldos`.
// Si esa rutina desaparece (se borra/pausa) o falla en silencio (IBKR caído, token 401, egress 403),
// nadie se entera: el saldo simplemente se queda viejo en /banca. Este guardián cierra ese hueco —
// un cron mañanero (mar-sáb) comprueba que el NAV se refrescó "anoche" y avisa por Telegram si no.
//
// Cadencia esperada de la pasada: L-V ~22:15 CEST (≈20:15 UTC). Por eso se comprueba las mañanas de
// MAR-SÁB (el refresco de la noche anterior); dom/lun no se espera pasada (sáb/dom noche no corre).
// Función PURA (sin IO) para poder testearla; el cron le pasa `ahora` y el último refresco de la BD.

/** Umbral por defecto: un refresco sano ronda las ~10 h a la hora del chequeo; una noche saltada deja
 *  el NAV ≥ ~34 h viejo. 18 h separa limpiamente ambos casos con margen para pasadas que tarden. */
export const MAX_HORAS_SIN_REFRESCO = 18

export type EvalWatchdog = {
  /** true = hay que avisar (NAV viejo o inexistente). */
  alerta: boolean
  /** Horas transcurridas desde el último refresco (null si nunca se refrescó). */
  horas: number | null
  /** Motivo legible para el aviso / log. */
  motivo: string
}

/** ¿Se espera una pasada la noche ANTERIOR a este día? La rutina corre L-V noche, así que el refresco
 *  aparece las mañanas de mar(2)…sáb(6). Dom(0) y lun(1) el último refresco es de el viernes → no alarmar. */
export function seEsperaRefresco(ahora: Date): boolean {
  const dow = ahora.getUTCDay() // 0=domingo … 6=sábado
  return dow >= 2 && dow <= 6
}

export function evaluarWatchdog(params: {
  ahora: Date
  ultimoRefresco: Date | null
  maxHoras?: number
  /** Qué huella se está mirando, para que el «nunca» diga la VERDAD. Por defecto, el NAV — pero el
   *  mismo evaluador vigila ya las tesis y el cierre de /puntuar, y decirles «nunca se ha refrescado
   *  el NAV (broker_saldos vacío)» manda a Alberto a mirar la tabla equivocada. */
  huella?: string
}): EvalWatchdog {
  const { ahora, ultimoRefresco } = params
  const maxHoras = params.maxHoras ?? MAX_HORAS_SIN_REFRESCO
  const huella = params.huella ?? 'el NAV de IBKR (broker_saldos vacío)'

  if (!ultimoRefresco) {
    return { alerta: true, horas: null, motivo: `nunca se ha registrado ${huella}` }
  }
  const horas = (ahora.getTime() - ultimoRefresco.getTime()) / 3_600_000
  if (horas > maxHoras) {
    return {
      alerta: true,
      horas,
      motivo: `el NAV de IBKR lleva ${horas.toFixed(1)} h sin refrescarse (umbral ${maxHoras} h)`,
    }
  }
  return { alerta: false, horas, motivo: `NAV fresco (${horas.toFixed(1)} h)` }
}
