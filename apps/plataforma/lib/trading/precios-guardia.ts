// Guardia de cordura de los precios que la pasada de trading manda a `/api/trading/puntuar`.
//
// 🚨 LANDMINE FUNDACIONAL (08/08/2026) — el track record se envenenó con UN dato. El 03/08 la pasada
// mandó `CVX = 590,17` cuando Chevron cerró a 193,18 (contrastado contra IBKR): un ×3,06. El endpoint
// cogía `precios[simbolo]` tal cual, sin preguntarse nada, así que ese número:
//   · fue el `precio_ref` de las tesis de CVX de ese día (tesis construidas sobre un precio falso), y
//   · fue el `precio_despues` con el que se puntuaron 12 tesis ya vencidas → tres de ellas a +205 pp.
// Efecto en las estadísticas por estrategia, que son el walk-forward del que depende desplegar dinero
// real: «momentum alcista» pasaba de +0,91 pp a **+88,09 pp** de media, y «reversión bajista» cambiaba
// de SIGNO (−21,08 pp con el dato malo, +2,01 pp sin él). Un solo precio daba la vuelta al veredicto.
//
// Es el hermano diario del `serieDiscontinua` de `velas.ts` y la misma lección del PR #1189 (ORCL): un
// número plausible no delata nada por sí solo, hay que contrastarlo contra lo que ya se sabía.
//
// Tres estados, como manda la regla del repo:
//   · sin referencia reciente del símbolo → **no se juzga** y el precio pasa. No saber si el salto es
//     raro NO autoriza a descartar un dato bueno (un símbolo nuevo no tiene con qué compararse).
//   · referencia + salto dentro de rango → el precio se usa.
//   · referencia + salto fuera de rango → se DESCARTA. La tesis se queda sin puntuar (pendiente), que
//     es un «todavía no lo sé» recuperable en la pasada siguiente; un +205 pp falso no se recupera:
//     se cuela en las stats y decide.
//
// Un split/contrasplit sin ajustar cae aquí a propósito: el precio es real pero el RETORNO que saldría
// de cruzarlo con un `precio_ref` pre-split es ficticio, así que tampoco se debe puntuar a ciegas.

// Salto máximo de un día contra la última referencia conocida. Más estricto que el ×3 de
// `SALTO_PRECIO_MAX` (velas.ts) porque aquel mide barras mensuales/semanales y esto es un día suelto.
export const SALTO_PRECIO_DIA_MAX = 2

// Antigüedad máxima de la referencia. Con un hueco mayor (símbolo que lleva semanas fuera de la
// watchlist) un ×2 ya puede ser movimiento legítimo y la comparación dejaría de significar nada.
export const DIAS_REFERENCIA_MAX = 10

export type PrecioDescartado = {
  simbolo: string
  precio: number
  referencia: number | null   // null = el precio es inválido de por sí (≤0 o no finito)
  ratio: number | null
  motivo: string
}

export type FiltroPrecios = {
  limpios: Record<string, number>
  descartados: PrecioDescartado[]
}

// Separa los precios usables de los que no superan la guardia. `referencias` = último precio conocido
// por símbolo ANTERIOR a la fecha de la pasada (nunca el de hoy: si la pasada viene envenenada, el
// precio de hoy está envenenado en las dos puntas y la comparación se validaría a sí misma).
export function filtrarPreciosAnomalos(
  precios: Record<string, number>,
  referencias: Record<string, number>,
  saltoMax = SALTO_PRECIO_DIA_MAX,
): FiltroPrecios {
  const limpios: Record<string, number> = {}
  const descartados: PrecioDescartado[] = []

  for (const [simbolo, precio] of Object.entries(precios)) {
    if (!Number.isFinite(precio) || precio <= 0) {
      descartados.push({ simbolo, precio, referencia: null, ratio: null, motivo: 'precio no positivo o no finito' })
      continue
    }
    const referencia = referencias[simbolo]
    if (!Number.isFinite(referencia) || !(referencia > 0)) {
      limpios[simbolo] = precio   // sin con qué comparar: no se juzga
      continue
    }
    const ratio = precio / referencia
    if (ratio >= saltoMax || ratio <= 1 / saltoMax) {
      descartados.push({
        simbolo, precio, referencia, ratio,
        motivo: `×${ratio.toFixed(2)} sobre la última referencia (${referencia})`,
      })
      continue
    }
    limpios[simbolo] = precio
  }

  return { limpios, descartados }
}

// Resumen de una línea para el latido y el aviso. Cadena vacía si no se descartó nada — así el que la
// consume no tiene que acordarse de comprobarlo.
export function resumenDescartes(descartados: PrecioDescartado[]): string {
  if (descartados.length === 0) return ''
  const lista = descartados.map(d => `${d.simbolo} ${d.precio} (${d.motivo})`).join(' · ')
  return `${descartados.length} precio(s) descartado(s): ${lista}`
}
