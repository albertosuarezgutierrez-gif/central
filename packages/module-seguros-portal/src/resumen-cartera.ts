// Las tres cifras de cabecera de la bóveda: cuántas pólizas, cuánto al año y
// cuál vence antes. Puro y sin BD.
//
// ── Por qué existe (07/09/2026) ─────────────────────────────────────────────
//
// Alberto, viendo el panel de ejemplo de `grupoasegura.es`: «lo ideal es que
// sea igual la intranet, y ese diseño que aparece en la web es mejor que el que
// hay ahora mismo». La web promete tres baldosas —Pólizas · Al año · Próximo—
// que el portal real no tenía: quien las ve ahí, entra y no las encuentra.
//
// 🚨 Pero el panel de la web es un EJEMPLO con cinco pólizas escritas a mano,
// todas completas. La cartera real no lo es, y por eso este módulo existe: las
// mismas tres cifras, dichas sin afirmar lo que no se sabe.
//
// ── Lo que se midió antes de escribirlo (07/09/2026, `seguros.polizas`) ─────
//
//   111 vivas · 111 con fecha de vencimiento · 85 con prima · 26 SIN NINGUNA
//   · 0 con prima neta pero sin bruta.
//
// O sea: casi una de cada cuatro pólizas vivas no tiene importe. Un total que
// sume las 85 y se pinte como «lo que pagas al año» es más bajo que la realidad
// y no lo parece — es exactamente la mentira plausible que persigue la regla
// global «dato que NO hay ≠ dato que NO se ha mirado». Por eso `gastoAnual`
// viaja SIEMPRE con `sinPrima`, y quien lo pinta tiene que decirlo.
//
// ── Y por qué solo la BRUTA ─────────────────────────────────────────────────
//
// `prima.anual` es la NETA y `prima.bruta` es lo que el cliente paga de verdad
// (neta + impuestos y recargos). Sumar unas y otras da un número perfectamente
// plausible en la unidad equivocada, que es el otro fallo que el CLAUDE.md de
// la raíz marca como el peor: «la clave de un dato es su periodo y su unidad».
// Se elige UNA —la que el cliente reconoce en su recibo— y se propaga. Y no
// cuesta cobertura: las 85 que tienen neta tienen también bruta.

/** Lo mínimo de una póliza para resumirla. No incluye titular: resumir no es agrupar. */
export type PolizaResumible = {
  /** `null` = no nos consta cuándo vence. */
  fechaVencimiento: Date | null
  /**
   * `null` = el nivel de esta persona no ve primas (no «no tiene prima»).
   * `bruta: null` = la compañía no la ha informado. Los dos cuentan como
   * «no lo sé» para la suma, y por eso van juntos a `sinPrima`.
   */
  prima: { bruta: number | null } | null
}

export type ResumenCartera = {
  /** Cuántas pólizas se han resumido. Esta cifra sí es un hecho redondo. */
  polizas: number
  /**
   * Suma de las primas brutas CONOCIDAS, en euros.
   *
   * 🚨 `null` = no se conoce ninguna. No es `0`: un cero se lee como «no pagas
   * nada», que es una afirmación, y aquí lo que hay es una ausencia.
   */
  gastoAnual: number | null
  /** Cuántas pólizas aportan a `gastoAnual`. */
  conPrima: number
  /** Cuántas NO aportan. Mientras sea > 0, `gastoAnual` es un MÍNIMO, no el total. */
  sinPrima: number
  /**
   * El vencimiento más cercano que aún está por llegar.
   *
   * 🚨 `null` = ninguna vence en el futuro. Devolver aquí el mínimo global
   * pondría una fecha PASADA bajo la palabra «Próximo», que es justo lo que ya
   * pasa con las pólizas vencidas que siguen en estado activa.
   */
  proximoVencimiento: Date | null
  /** Vivas cuya fecha de vencimiento ya pasó. Se cuentan aparte, no se esconden. */
  vencidas: number
  /** Vivas de las que no consta fecha. Tampoco es «no vence». */
  sinFecha: number
}

/** Redondeo a céntimos: sumar decimales en coma flotante deja colas de 0,000000001. */
const aCentimos = (n: number) => Math.round(n * 100) / 100

/**
 * Resume una lista de pólizas ya leídas.
 *
 * `hoy` entra como parámetro y no se calcula dentro a propósito: la bóveda es
 * `force-dynamic` y lo resuelve en el servidor, así que el «hoy» del render y
 * el de esta función son el mismo. Calcularlo aquí daría uno distinto en el
 * navegador y otro más en cada zona horaria.
 */
export function resumirCartera(
  polizas: readonly PolizaResumible[],
  hoy: Date,
): ResumenCartera {
  let suma = 0
  let conPrima = 0
  let vencidas = 0
  let sinFecha = 0
  let proximo: Date | null = null

  for (const p of polizas) {
    const bruta = p.prima?.bruta ?? null
    // `Number.isFinite` y no un `!= null` suelto: un NaN colado desde un
    // `parseFloat` envenenaría la suma entera y saldría «NaN€» en pantalla.
    if (bruta !== null && Number.isFinite(bruta)) {
      suma += bruta
      conPrima += 1
    }

    const v = p.fechaVencimiento
    if (v === null) {
      sinFecha += 1
      continue
    }
    if (v.getTime() < hoy.getTime()) {
      vencidas += 1
      continue
    }
    if (proximo === null || v.getTime() < proximo.getTime()) proximo = v
  }

  return {
    polizas: polizas.length,
    gastoAnual: conPrima === 0 ? null : aCentimos(suma),
    conPrima,
    sinPrima: polizas.length - conPrima,
    proximoVencimiento: proximo,
    vencidas,
    sinFecha,
  }
}
