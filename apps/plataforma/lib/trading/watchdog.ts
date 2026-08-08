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
  /** Cómo se NOMBRA esa huella cuando sí existe pero está vieja. Va aparte de `huella` porque las dos
   *  frases piden gramática distinta («nunca se ha registrado ninguna tesis» vs «el análisis lleva
   *  21 h sin refrescarse»). Sin esto, los tramos 2 y 3 salían con el texto del NAV cableado: el aviso
   *  del 07/08/2026 decía «Análisis/tesis: el NAV de IBKR lleva 21.0 h sin refrescarse» con el NAV
   *  fresco de 10 h — mandaba a mirar IBKR y la rutina cuando el que no se había movido era el análisis. */
  etiqueta?: string
}): EvalWatchdog {
  const { ahora, ultimoRefresco } = params
  const maxHoras = params.maxHoras ?? MAX_HORAS_SIN_REFRESCO
  const huella = params.huella ?? 'el NAV de IBKR (broker_saldos vacío)'
  const etiqueta = params.etiqueta ?? 'el NAV de IBKR'

  if (!ultimoRefresco) {
    return { alerta: true, horas: null, motivo: `nunca se ha registrado ${huella}` }
  }
  const horas = (ahora.getTime() - ultimoRefresco.getTime()) / 3_600_000
  if (horas > maxHoras) {
    return {
      alerta: true,
      horas,
      motivo: `${etiqueta} lleva ${horas.toFixed(1)} h sin refrescarse (umbral ${maxHoras} h)`,
    }
  }
  return { alerta: false, horas, motivo: `${etiqueta}: fresco (${horas.toFixed(1)} h)` }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🩺 DIAGNÓSTICO de una pasada que falta (08/08/2026)
//
// Caso real que lo motiva: el viernes 07/08 la pasada nocturna no corrió y las cuatro huellas
// (`broker_saldos`, `trading_tesis`, `trading_pasadas`, latido `trading_puntuar`) se quedaron en el
// jueves. El aviso decía «no se ha refrescado» y mandaba a buscar un trigger roto o IBKR caído. La
// causa real, según Alberto: **se había quedado sin cupo de tokens esa mañana** (5 sesiones Claude el
// viernes entre 06:41 y 10:32 UTC y ninguna después). La rutina no estaba rota ni borrada: no PUDO
// arrancar.
//
// Ese es un TERCER estado que el vigía colapsaba con el primero. `evaluarLatido` ya distinguía «no se
// dispara» de «se dispara y no termina»; faltaba «no pudo dispararse». Desde fuera los dos primeros
// dejan la MISMA huella (ninguna), así que este helper NO adivina: enumera las causas candidatas en
// orden de lo que compensa mirar. Un aviso que señala UNA causa que no puede distinguir manda a mirar
// al sitio equivocado — que es exactamente lo que pasó.
//
// 🚨 Lo que NO se puede auto-reparar, escrito aquí para que nadie vuelva a prometerlo (yo lo prometí
// el 08/08 y era falso): los tres tramos reciben del cliente los datos de mercado, así que un cron de
// Vercel NO los rehace solo.
//   · `/api/trading/saldo`    ← `body.saldo`: el NAV sale del MCP de IBKR. Solo una sesión Claude.
//   · `/api/trading/analizar` ← `body.nav` + `simbolos`. Depende del NAV ⇒ tampoco.
//   · `/api/trading/puntuar`  ← `body.precios`: son CIERRES, y de esos el servidor SÍ tiene fuente
//     propia y gratis (`precios-stooq.ts`, Stooq→Yahoo). **Es el único tramo recuperable sin sesión**,
//     y encima es el que cierra tesis y alimenta el track record: el dato que no se puede rellenar
//     hacia atrás y del que depende la escalera de capital. Pendiente de decisión de Alberto porque
//     exige marcar la fila con la FUENTE del precio (patrón `market_rates.fuente`): un cierre de Stooq
//     y uno de IBKR no son el mismo dato, y colapsarlos es el error que este repo ya ha pagado dos veces.

export type CausaAusencia = 'no-disparada' | 'disparada-sin-terminar'

export type DiagnosticoPasada = {
  causa: CausaAusencia
  /** Causas candidatas en orden de lo que compensa mirar. Nunca UNA sola si no se pueden distinguir. */
  candidatas: string[]
  /** Tramos que un cron podría rehacer sin sesión Claude. Hoy vacío: ninguno implementado. */
  recuperables: string[]
  motivo: string
}

/** Por qué falta la pasada. `ultimoIntento` = la sesión ARRANCÓ; `ultimoOk` = terminó bien. Puro. */
export function diagnosticarPasada(params: {
  ahora: Date
  ultimoIntento: Date | null
  ultimoOk: Date | null
  maxHoras?: number
}): DiagnosticoPasada {
  const { ahora, ultimoIntento, ultimoOk } = params
  const maxHoras = params.maxHoras ?? MAX_HORAS_SIN_REFRESCO
  const h = (d: Date | null) => (d ? (ahora.getTime() - d.getTime()) / 3_600_000 : null)
  const hIntento = h(ultimoIntento)
  const hOk = h(ultimoOk)

  // Arrancó dentro de la ventana pero sin OK ⇒ murió a mitad. Aquí sí se puede señalar el sitio.
  if (hIntento !== null && hIntento <= maxHoras && (hOk === null || hOk > maxHoras)) {
    return {
      causa: 'disparada-sin-terminar',
      candidatas: [
        'arrancó y no terminó: mira el log de la sesión y el último endpoint que respondió',
        'IBKR caído o sin sesión en el MCP',
        '401 contra /api/trading/* (ALERTA_TOKEN desincronizado con el proyecto Vercel)',
      ],
      recuperables: [],
      motivo: `arrancó hace ${hIntento.toFixed(1)} h pero no completó (último OK: ${hOk === null ? 'nunca' : `hace ${hOk.toFixed(1)} h`})`,
    }
  }

  // Ni arrancó. Las tres causas dejan la MISMA huella (ninguna) — no se elige una.
  return {
    causa: 'no-disparada',
    candidatas: [
      'sin cupo de tokens: ¿corrió alguna OTRA rutina Claude esa tarde? Si ninguna, es la cuenta, no trading',
      'la rutina no se disparó (trigger pausado o borrado) — ojo: la lista de triggers no las enseña todas',
      'egress 403 o red del entorno de la rutina',
    ],
    recuperables: [],
    motivo: `sin huella de que la sesión llegara a arrancar (último intento: ${hIntento === null ? 'nunca' : `hace ${hIntento.toFixed(1)} h`})`,
  }
}
