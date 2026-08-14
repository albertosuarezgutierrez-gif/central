import test from 'node:test'
import assert from 'node:assert/strict'
import { filtrarPreciosAnomalos, resumenDescartes, contrastarFuentes, resumenDivergencias, saltoDeSaldo, detectarSuplantaciones, resumenSuplantaciones, juzgarPuntos, resumenDesfase, juzgarDiferido, resumenDiferido, juzgarHuerfana, resumenHuerfanas, fechaMas, diasEntre, SALTO_PRECIO_DIA_MAX } from './precios-guardia.ts'

test('el caso real del 03/08/2026: CVX a 590,17 con referencia 192,31 se descarta', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ CVX: 590.17 }, { CVX: 192.31 })
  assert.equal(limpios.CVX, undefined)
  assert.equal(descartados.length, 1)
  assert.equal(descartados[0].simbolo, 'CVX')
  assert.ok(descartados[0].ratio! > 3)
})

test('un movimiento normal pasa intacto', () => {
  const precios = { CVX: 190.41, MSFT: 487.46, SPY: 769.79 }
  const { limpios, descartados } = filtrarPreciosAnomalos(precios, { CVX: 193.18, MSFT: 492.82, SPY: 771.24 })
  assert.deepEqual(limpios, precios)
  assert.equal(descartados.length, 0)
})

test('sin referencia NO se juzga: el precio pasa (un símbolo nuevo no tiene con qué compararse)', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ NUEVO: 12.5 }, {})
  assert.equal(limpios.NUEVO, 12.5)
  assert.equal(descartados.length, 0)
})

test('una referencia inválida (0) tampoco juzga: no convierte un «no lo sé» en descarte', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ X: 100 }, { X: 0 })
  assert.equal(limpios.X, 100)
  assert.equal(descartados.length, 0)
})

test('el desplome simétrico también se caza (÷2, no solo ×2)', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ X: 45 }, { X: 190 })
  assert.equal(limpios.X, undefined)
  assert.equal(descartados.length, 1)
  assert.ok(descartados[0].ratio! < 0.5)
})

test('precios imposibles se descartan aunque no haya referencia', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ A: 0, B: -5, C: Number.NaN }, {})
  assert.deepEqual(limpios, {})
  assert.equal(descartados.length, 3)
  assert.ok(descartados.every(d => d.referencia === null))
})

test('el umbral es el límite exacto: justo por debajo pasa, justo en el umbral no', () => {
  assert.equal(filtrarPreciosAnomalos({ X: 199 }, { X: 100 }).limpios.X, 199)
  assert.equal(filtrarPreciosAnomalos({ X: 200 }, { X: 100 }).limpios.X, undefined)
  assert.equal(SALTO_PRECIO_DIA_MAX, 2)
})

test('descartar un símbolo no arrastra a los demás de la misma pasada', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos(
    { CVX: 590.17, MSFT: 487.46 },
    { CVX: 192.31, MSFT: 492.82 },
  )
  assert.deepEqual(limpios, { MSFT: 487.46 })
  assert.equal(descartados.length, 1)
})

test('resumenDescartes: cadena vacía cuando no hay nada que contar', () => {
  assert.equal(resumenDescartes([]), '')
  assert.match(resumenDescartes(filtrarPreciosAnomalos({ CVX: 590.17 }, { CVX: 192.31 }).descartados), /^1 precio\(s\) descartado\(s\): CVX 590\.17/)
})

// --- contraste con la segunda fuente ---

test('contraste: precios de acuerdo con la 2ª fuente pasan', () => {
  const { conformes, divergentes, sinContraste } = contrastarFuentes(
    { CVX: 193.18, MSFT: 487.46 },
    { CVX: 193.18, MSFT: 487.20 },
  )
  assert.deepEqual(conformes, { CVX: 193.18, MSFT: 487.46 })
  assert.equal(divergentes.length, 0)
  assert.equal(sinContraste.length, 0)
})

test('contraste: el CVX del 03/08 lo habría cazado la 2ª fuente aunque la referencia fuera de ayer', () => {
  const { conformes, divergentes } = contrastarFuentes({ CVX: 590.17 }, { CVX: 193.18 })
  assert.equal(conformes.CVX, undefined)
  assert.equal(divergentes.length, 1)
  assert.ok(divergentes[0].desvio > 2)
})

test('contraste: caza el error del 10% que la guardia del ×2 deja pasar', () => {
  // 212,50 contra 193,18 real: +10%. Para la guardia del ×2 es un día movido y pasa; aquí no.
  assert.equal(filtrarPreciosAnomalos({ CVX: 212.5 }, { CVX: 193.18 }).limpios.CVX, 212.5)
  assert.equal(contrastarFuentes({ CVX: 212.5 }, { CVX: 193.18 }).divergentes.length, 1)
})

test('contraste: sin dato de la 2ª fuente NO se juzga — el precio pasa y queda anotado', () => {
  const { conformes, divergentes, sinContraste } = contrastarFuentes({ NUEVO: 12.5 }, {})
  assert.equal(conformes.NUEVO, 12.5)
  assert.equal(divergentes.length, 0)
  assert.deepEqual(sinContraste, ['NUEVO'])
})

test('contraste: el umbral es simétrico y se respeta en el borde', () => {
  assert.equal(contrastarFuentes({ X: 102 }, { X: 100 }).divergentes.length, 0)     // +2% justo
  assert.equal(contrastarFuentes({ X: 102.5 }, { X: 100 }).divergentes.length, 1)   // +2,5%
  assert.equal(contrastarFuentes({ X: 97.5 }, { X: 100 }).divergentes.length, 1)    // −2,5%
})

test('resumenDivergencias: vacío cuando no hay nada, con signo cuando lo hay', () => {
  assert.equal(resumenDivergencias([]), '')
  const txt = resumenDivergencias(contrastarFuentes({ CVX: 590.17 }, { CVX: 193.18 }).divergentes)
  assert.match(txt, /CVX 590\.17 vs 193\.18/)
})

// --- suplantación: el precio es de otra empresa ---
//
// Los tres casos son las pasadas REALES que envenenaron el corpus, con los precios tal cual quedaron
// en `trading_tesis` y los cierres verdaderos contrastados contra IBKR. La lección del PR #1189 es que
// un fixture inventado se escribe con la misma suposición equivocada que el código, así que aquí no
// hay números de adorno: si un día estos tests dejan de pasar, es que la guardia dejó de ver el bug
// que ya ocurrió tres veces.

// Payload del 17/07/2026 — primera pasada del corpus, hecha a mano: NINGÚN símbolo tenía referencia.
const PASADA_17_07 = {
  CVX: 187.38, IWM: 294.04, LLY: 1179.11, META: 393.82, MSFT: 478.14, NFLX: 1179.11,
  NVDA: 202.81, NVO: 50.32, PLTR: 132.38, QQQ: 695.33, RBLX: 51.68, SPOT: 68.95, SPY: 743.29,
}

// Cierres del 31/07/2026, que son las referencias con las que corrió la pasada del 03/08.
const REFERENCIAS_31_07 = {
  CVX: 192.31, IWM: 292.59, LLY: 1154.97, META: 539.03, MSFT: 451.10, NFLX: 73.17,
  NVDA: 195.04, NVO: 51.61, PLTR: 122.26, QQQ: 683.55, RBLX: 48.67, SPOT: 522.61, SPY: 741.69,
}

test('17/07/2026 sin referencias: el duplicado exacto LLY/NFLX cae igual (NFLX se llevó el cierre de LLY)', () => {
  const { limpios, suplantados } = detectarSuplantaciones(PASADA_17_07, {})
  assert.deepEqual(suplantados.map(s => s.simbolo).sort(), ['LLY', 'NFLX'])
  assert.equal(limpios.NFLX, undefined)
  assert.equal(limpios.LLY, undefined)
  // Los otros tres barajados de ese día (META←MSFT, MSFT←SPOT, SPOT←NFLX) NO se pueden ver sin
  // referencias: son números únicos y plausibles. Los caza el contraste con la 2ª fuente, no esto.
  assert.equal(limpios.META, 393.82)
  assert.equal(Object.keys(limpios).length, 11)
})

test('03/08/2026: LLY con el cierre de CVX y META con el de LLY se cazan por cruce de referencias', () => {
  const pasada = {
    CVX: 193.18, IWM: 296.23, LLY: 193.18, META: 1121.09, MSFT: 487.58, NFLX: 73.33,
    NVDA: 206.68, NVO: 47.09, PLTR: 125.86, QQQ: 700.06, RBLX: 36.67, SPOT: 486.16, SPY: 757.67,
  }
  const { limpios, suplantados } = detectarSuplantaciones(pasada, REFERENCIAS_31_07)
  const caidos = suplantados.map(s => s.simbolo).sort()
  // CVX y LLY comparten número → duplicado; META cuadra con la referencia de LLY y no con la suya.
  assert.deepEqual(caidos, ['CVX', 'LLY', 'META'])
  assert.equal(suplantados.find(s => s.simbolo === 'META')!.culpable, 'LLY')
  assert.equal(limpios.META, undefined)
  // Y lo que NO puede caer: los movimientos REALES y gordos de ese día siguen su camino.
  assert.equal(limpios.MSFT, 487.58)   // +8,1% real sobre su referencia
  assert.equal(limpios.RBLX, 36.67)    // −24,7% real
  assert.equal(limpios.NVO, 47.09)     // −8,8% real, a un 3,25% de la referencia de RBLX: se salva por poco
})

test('04/08/2026: NFLX se llevó el precio de PLTR — mismo número, los dos fuera', () => {
  const { limpios, suplantados } = detectarSuplantaciones(
    { NFLX: 162.61, PLTR: 162.61, META: 587.77 },
    { NFLX: 73.33, PLTR: 125.86, META: 1121.09 },
  )
  assert.deepEqual(suplantados.map(s => s.simbolo).sort(), ['NFLX', 'PLTR'])
  assert.equal(limpios.NFLX, undefined)
  assert.equal(limpios.PLTR, undefined)   // PLTR traía SU precio bueno: es el coste aceptado de vetar el par
})

test('sin referencia propia no se juzga: un símbolo que se estrena pasa aunque coincida con otro', () => {
  const { limpios, suplantados } = detectarSuplantaciones(
    { NUEVO: 192.5, CVX: 193.4 },
    { CVX: 192.31 },   // NUEVO no tiene referencia; CVX cuadra con la suya
  )
  assert.equal(suplantados.length, 0)
  assert.equal(limpios.NUEVO, 192.5)
})

test('una pasada sana no dispara nada', () => {
  const pasada = { CVX: 190.41, LLY: 1116.84, META: 587.77, NFLX: 73.57 }
  const { limpios, suplantados } = detectarSuplantaciones(pasada, { CVX: 193.18, LLY: 1121.36, META: 590.24, NFLX: 73.33 })
  assert.equal(suplantados.length, 0)
  assert.deepEqual(limpios, pasada)
})

// Las referencias REALES del 06/08/2026 (últimos `precio_ref` no anulados de la watchlist activa).
// Con ellas se fijan las dos propiedades que decidieron el umbral, medidas contra el corpus entero.
const REFERENCIAS_06_08 = {
  CVX: 186.41, IWM: 299.77, LLY: 1169.86, META: 588.77, MSFT: 487.46, NFLX: 74.20, NVDA: 219.22,
  NVO: 44.53, PLTR: 158.43, QQQ: 717.30, RBLX: 36.19, SNDK: 1350.50, SPOT: 482.23, SPY: 769.79,
  STX: 837.66, WDC: 519.17,
}

test('el envenenamiento de META se caza también con la referencia de HOY, no solo con la del 31/07', () => {
  // Con el umbral viejo del 3% esto pasaba limpio: META recibió 1121,09 y la referencia de LLY se había
  // movido a 1169,86, un 4,2% — fuera del 3% por muy poco. El caso histórico se cazaba por 0,1 pp de
  // margen, o sea por suerte. Este test es el que impide volver a estrechar el umbral.
  const { suplantados } = detectarSuplantaciones({ META: 1121.09 }, REFERENCIAS_06_08)
  assert.equal(suplantados.length, 1)
  assert.equal(suplantados[0].culpable, 'LLY')
})

test('un día de mercado normal sobre la watchlist real no veta a nadie', () => {
  // Cierres reales del 07/08/2026 (IBKR, consolidados) contra las referencias del 06/08.
  const cierres = { MSFT: 499.99, SPOT: 488.14, NFLX: 74.14, LLY: 1185.71, META: 592.10 }
  const { limpios, suplantados } = detectarSuplantaciones(cierres, REFERENCIAS_06_08)
  assert.equal(suplantados.length, 0)
  assert.deepEqual(limpios, cierres)
})

test('límite conocido: dos símbolos al mismo nivel son intercambiables sin que la regla lo vea', () => {
  // MSFT y SPOT cotizan a un 1,1% el 06/08. Si se barajan —como ya pasó el 17/07— el precio ajeno cuadra
  // con la referencia propia y la regla no lo examina. NO es un fallo que arregle el umbral: se afirma
  // aquí para que el hueco esté medido y quede claro que solo lo tapa el contraste con la 2ª fuente.
  const barajado = { MSFT: REFERENCIAS_06_08.SPOT, SPOT: REFERENCIAS_06_08.MSFT }
  const { suplantados } = detectarSuplantaciones(barajado, REFERENCIAS_06_08)
  assert.equal(suplantados.length, 0)
})

test('resumenSuplantaciones: vacío cuando no hay nada, nombra al culpable cuando lo hay', () => {
  assert.equal(resumenSuplantaciones([]), '')
  const { suplantados } = detectarSuplantaciones({ LLY: 193.18 }, { LLY: 1154.97, CVX: 192.31 })
  assert.match(resumenSuplantaciones(suplantados), /LLY 193\.18 .*CVX/)
})

// --- salto del NAV ---

test('NAV: sin saldo anterior no se avisa (es el primero, no un salto)', () => {
  assert.deepEqual(saltoDeSaldo(10_000, null), { avisa: false, variacion: null })
  assert.deepEqual(saltoDeSaldo(10_000, 0), { avisa: false, variacion: null })
})

test('NAV: una variación normal de mercado no molesta', () => {
  const r = saltoDeSaldo(10_300, 10_000)
  assert.equal(r.avisa, false)
  assert.ok(Math.abs(r.variacion! - 0.03) < 1e-9)
})

test('NAV: un cero de más se avisa (es lo que multiplicaría el tamaño de las compras)', () => {
  const r = saltoDeSaldo(100_000, 10_000)
  assert.equal(r.avisa, true)
  assert.equal(r.variacion, 9)
})

test('NAV: también avisa a la baja (retirada real o lectura rota — Alberto decide cuál)', () => {
  const r = saltoDeSaldo(5_000, 10_000)
  assert.equal(r.avisa, true)
  assert.equal(r.variacion, -0.5)
})

// ---------------------------------------------------------------------------
// ¿Es de HOY el cierre de la 2ª fuente? (el fallo del 10/08/2026)
// ---------------------------------------------------------------------------

// Cierres REALES del viernes 07/08/2026, verificados uno a uno contra IBKR el sábado 08/08. Son
// exactamente los que Stooq/Yahoo devolvieron el lunes 10/08 a las 20:33 UTC, media hora después del
// cierre de Wall Street, cuando aún no habían publicado la sesión del lunes.
const CIERRES_VIERNES_07_08 = {
  CVX: 186.55999755859375, LLY: 1185.7099609375, NFLX: 74.13999938964844, NVDA: 223.9600067138672,
  SPOT: 488.1400146484375, APP: 346.79998779296875, ORCL: 147.02000427246094, SNDK: 1212.2099609375,
}

// Precios REALES de la sesión del lunes 10/08/2026, los que la pasada mandó a `/analizar`.
const SESION_LUNES_10_08 = {
  CVX: 194.97, LLY: 1231.52, NFLX: 76.31, NVDA: 217.59,
  SPOT: 511.9, APP: 338.86, ORCL: 151.03, SNDK: 1237.19,
}

test('el cierre de HOY vale como contraste', () => {
  const v = juzgarPuntos([{ fecha: '2026-08-07', cierre: 186.56 }, { fecha: '2026-08-10', cierre: 194.97 }], '2026-08-10')
  assert.deepEqual(v, { estado: 'vale', fecha: '2026-08-10', cierre: 194.97 })
})

test('el cierre de la sesión ANTERIOR no vale: es un contraste de otra cosa, no uno más flojo', () => {
  const v = juzgarPuntos([{ fecha: '2026-08-06', cierre: 185.1 }, { fecha: '2026-08-07', cierre: 186.56 }], '2026-08-10')
  assert.deepEqual(v, { estado: 'desfasado', fecha: '2026-08-07', cierre: 186.56 })
})

test('una fuente muda es «sin dato», no un contraste vacío', () => {
  assert.deepEqual(juzgarPuntos([], '2026-08-10'), { estado: 'sin-dato' })
})

test('los cierres POSTERIORES a hoy se ignoran (nunca se contrasta contra el futuro)', () => {
  const v = juzgarPuntos([{ fecha: '2026-08-10', cierre: 194.97 }, { fecha: '2026-08-11', cierre: 199 }], '2026-08-10')
  assert.deepEqual(v, { estado: 'vale', fecha: '2026-08-10', cierre: 194.97 })
})

test('el fallo real del 10/08/2026: con el cierre del viernes, los 8 vetos eran el hueco del fin de semana', () => {
  // Cómo se comportaba ANTES del arreglo: se le daba el cierre del viernes como si fuera el de hoy y
  // cantaba divergencia en los 8. Ninguno de esos precios estaba mal.
  const { divergentes } = contrastarFuentes(SESION_LUNES_10_08, CIERRES_VIERNES_07_08)
  assert.equal(divergentes.length, 8)

  // Cómo se comporta AHORA: ese cierre nunca llega a `contrastarFuentes`, así que no veta a nadie y
  // los 8 quedan explícitamente sin juzgar.
  for (const [simbolo, cierre] of Object.entries(CIERRES_VIERNES_07_08)) {
    assert.equal(juzgarPuntos([{ fecha: '2026-08-07', cierre }], '2026-08-10').estado, 'desfasado', simbolo)
  }
  const { divergentes: ninguno, sinContraste } = contrastarFuentes(SESION_LUNES_10_08, {})
  assert.equal(ninguno.length, 0)
  assert.equal(sinContraste.length, 8)
})

test('el signo de cada «divergencia» del 10/08 era el movimiento viernes→lunes de esa acción', () => {
  // Es la firma que delata el fallo: no era ruido de fuente, era un dato bueno leído con el periodo
  // equivocado. NVDA y APP bajaron el lunes y por eso su desvío salía negativo; el resto subió.
  const { divergentes } = contrastarFuentes(SESION_LUNES_10_08, CIERRES_VIERNES_07_08)
  for (const d of divergentes) {
    const viernes = CIERRES_VIERNES_07_08[d.simbolo as keyof typeof CIERRES_VIERNES_07_08]
    const movimiento = SESION_LUNES_10_08[d.simbolo as keyof typeof SESION_LUNES_10_08] / viernes - 1
    assert.equal(Math.sign(d.desvio), Math.sign(movimiento), d.simbolo)
  }
})

test('el desfase se canta con su fecha; sin desfase no se dice nada', () => {
  assert.equal(resumenDesfase([]), '')
  const linea = resumenDesfase([
    { simbolo: 'CVX', fecha: '2026-08-07', cierre: 186.56 },
    { simbolo: 'LLY', fecha: '2026-08-07', cierre: 1185.71 },
  ])
  assert.match(linea, /2 símbolo\(s\)/)
  assert.match(linea, /2026-08-07/)
  assert.match(linea, /no vetado/)
})

// ---------------------------------------------------------------------------
// Contraste DIFERIDO: se juzga el ayer que la fuente sí ha publicado
// ---------------------------------------------------------------------------

test('sesión que cuadra con la 2ª fuente: no se sospecha de nada', () => {
  const d = juzgarDiferido({
    CVX: [{ fecha: '2026-08-07', fuente: 186.56, propio: 186.41 }, { fecha: '2026-08-10', fuente: 194.97, propio: 194.97 }],
  })
  assert.deepEqual(d.sospechosas, [])
  assert.deepEqual(d.reescalados, [])
  assert.equal(d.simbolosConDato, 1)
})

test('el caso fundacional al revés: CVX 590,17 del 03/08 lo desmiente la 2ª fuente una sesión después', () => {
  // Cierre real de CVX el 03/08/2026: 193,18. El `precio_ref` que entró fue 590,17.
  const d = juzgarDiferido({
    CVX: [
      { fecha: '2026-07-31', fuente: 192.31, propio: 192.31 },
      { fecha: '2026-08-03', fuente: 193.18, propio: 590.17 },
      { fecha: '2026-08-04', fuente: 190.41, propio: 190.41 },
    ],
  })
  assert.equal(d.sospechosas.length, 1)
  assert.equal(d.sospechosas[0].fecha, '2026-08-03')
  assert.equal(d.sospechosas[0].propio, 590.17)
  assert.equal(d.masiva, false)
})

test('un SPLIT no es un precio malo: todas las sesiones desplazadas por el mismo factor NO se anulan', () => {
  // Split 2:1 — la fuente publica el histórico ajustado, nuestro `precio_ref` es el precio de aquel día.
  const d = juzgarDiferido({
    NVDA: [
      { fecha: '2026-08-05', fuente: 108.40, propio: 216.80 },
      { fecha: '2026-08-06', fuente: 110.15, propio: 220.30 },
      { fecha: '2026-08-07', fuente: 111.98, propio: 223.96 },
    ],
  })
  assert.deepEqual(d.sospechosas, [])
  assert.equal(d.reescalados.length, 1)
  assert.equal(d.reescalados[0].simbolo, 'NVDA')
  assert.ok(Math.abs(d.reescalados[0].factor - 0.5) < 0.001)
})

test('con UNA sola sesión no se concede el beneficio de la duda: se anula', () => {
  // No hay forma de distinguir un split de un precio envenenado con un solo par. Perder una tesis buena
  // cuesta un dato; conservar una envenenada mueve el torneo.
  const d = juzgarDiferido({ WDC: [{ fecha: '2026-08-07', fuente: 259.6, propio: 519.17 }] })
  assert.equal(d.sospechosas.length, 1)
  assert.equal(d.reescalados.length, 0)
})

test('si desvía solo UNA de tres sesiones, no es reescalado aunque las otras dos cuadren', () => {
  const d = juzgarDiferido({
    LLY: [
      { fecha: '2026-08-05', fuente: 1170.0, propio: 1169.86 },
      { fecha: '2026-08-06', fuente: 1180.0, propio: 1450.00 },
      { fecha: '2026-08-07', fuente: 1185.71, propio: 1185.71 },
    ],
  })
  assert.equal(d.sospechosas.length, 1)
  assert.equal(d.sospechosas[0].fecha, '2026-08-06')
  assert.equal(d.reescalados.length, 0)
})

test('si la fuente discrepa en MÁS de la mitad del universo, la sospechosa es la FUENTE: no se anula nada', () => {
  const pares = (mal: boolean) => [
    { fecha: '2026-08-06', fuente: mal ? 50 : 100, propio: 100 },
    { fecha: '2026-08-07', fuente: mal ? 90 : 101, propio: 101 },
  ]
  const d = juzgarDiferido({ A: pares(true), B: pares(true), C: pares(true), D: pares(false) })
  assert.equal(d.masiva, true)
  assert.deepEqual(d.sospechosas, [])
  assert.match(resumenDiferido(d), /revisar la FUENTE/)
})

test('justo en el umbral (mitad exacta) todavía se anula: solo se frena por ENCIMA de la mitad', () => {
  const d = juzgarDiferido({
    A: [{ fecha: '2026-08-06', fuente: 50, propio: 100 }, { fecha: '2026-08-07', fuente: 101, propio: 101 }],
    B: [{ fecha: '2026-08-06', fuente: 100, propio: 100 }, { fecha: '2026-08-07', fuente: 101, propio: 101 }],
  })
  assert.equal(d.masiva, false)
  assert.equal(d.sospechosas.length, 1)
})

test('un par sin referencia propia no cuenta como símbolo con dato (no se inventa un cero)', () => {
  const d = juzgarDiferido({ XYZ: [{ fecha: '2026-08-07', fuente: 100, propio: 0 }] })
  assert.equal(d.simbolosConDato, 0)
  assert.deepEqual(d.sospechosas, [])
  assert.equal(resumenDiferido(d), '')
})

test('el interruptor de «fuente rota» NO se dispara con una muestra minúscula (un símbolo no es el universo)', () => {
  // Este es el fallo que tuvo la primera versión: con un solo símbolo, «más de la mitad diverge» era
  // siempre cierto y la guardia entera quedaba muda justo en el caso que existe para cazar.
  const d = juzgarDiferido({ CVX: [{ fecha: '2026-08-03', fuente: 193.18, propio: 590.17 }] })
  assert.equal(d.masiva, false)
  assert.equal(d.sospechosas.length, 1)
})

// ---------------------------------------------------------------------------
// La etiqueta corrida: `precio_ref` bueno guardado con la fecha del día siguiente
// ---------------------------------------------------------------------------

// Cierres REALES de IBKR (verificados el 12/08/2026) y los `precio_ref` REALES que la pasada manual del
// 06/08 a las 09:34 UTC —con Wall Street aún cerrado— dejó en `trading_tesis`. El ref del 06/08 es, al
// céntimo, el cierre del 05/08: la pasada guardó el último cierre que existía cuando preguntó.
const MSFT_REAL = { c05: 487.46, c06: 499.86, ref06: 487.46 }
const CVX_REAL = { c05: 186.41, c06: 189.23, ref06: 186.41 }

test('el caso real de MSFT 06/08: −2,48% de desvío que NO es un precio malo sino la fecha corrida', () => {
  // Sin el freno esto pasaba del umbral del 2% y anulaba tesis buenas.
  assert.ok(Math.abs(MSFT_REAL.c06 / MSFT_REAL.ref06 - 1) > 0.02)
  const d = juzgarDiferido({
    MSFT: [{ fecha: '2026-08-06', fuente: MSFT_REAL.c06, propio: MSFT_REAL.ref06, fuentePrevia: MSFT_REAL.c05 }],
  })
  assert.deepEqual(d.sospechosas, [])
  assert.equal(d.etiquetadas.length, 1)
  assert.equal(d.etiquetadas[0].simbolo, 'MSFT')
  assert.equal(d.etiquetadas[0].fecha, '2026-08-06')
  assert.match(resumenDiferido(d), /fecha corrida/)
  assert.match(resumenDiferido(d), /NO anulado/)
})

test('CVX el mismo día tenía la MISMA fecha corrida, pero su desvío no llegaba al umbral', () => {
  // −1,49%: no habría saltado ni sin el freno. Se guarda como recordatorio de que el fallo del 06/08 no
  // se vio antes por suerte del mercado, no porque no estuviera.
  assert.ok(Math.abs(CVX_REAL.c06 / CVX_REAL.ref06 - 1) < 0.02)
  const d = juzgarDiferido({
    CVX: [{ fecha: '2026-08-06', fuente: CVX_REAL.c06, propio: CVX_REAL.ref06, fuentePrevia: CVX_REAL.c05 }],
  })
  assert.deepEqual(d.sospechosas, [])
  assert.deepEqual(d.etiquetadas, [])
})

test('un precio ENVENENADO no se parece al cierre de ayer, así que el freno no lo salva', () => {
  // CVX 590,17 del 03/08 no era ni el cierre del 03/08 (193,18) ni el del 31/07 (192,31).
  const d = juzgarDiferido({
    CVX: [{ fecha: '2026-08-03', fuente: 193.18, propio: 590.17, fuentePrevia: 192.31 }],
  })
  assert.equal(d.sospechosas.length, 1)
  assert.deepEqual(d.etiquetadas, [])
})

test('sin cierre previo no se puede reconocer la etiqueta corrida: se juzga igual', () => {
  const d = juzgarDiferido({
    MSFT: [{ fecha: '2026-08-06', fuente: MSFT_REAL.c06, propio: MSFT_REAL.ref06, fuentePrevia: null }],
  })
  assert.equal(d.sospechosas.length, 1)
  assert.deepEqual(d.etiquetadas, [])
})

test('la etiqueta corrida se aparta ANTES del juicio de reescalado, no cuenta como sesión que desvía', () => {
  // Dos sesiones: una con la fecha corrida y otra buena. Si la corrida contase, «todas desvían» sería
  // falso o verdadero por accidente y el veredicto de split saldría del ruido.
  const d = juzgarDiferido({
    MSFT: [
      { fecha: '2026-08-06', fuente: MSFT_REAL.c06, propio: MSFT_REAL.ref06, fuentePrevia: MSFT_REAL.c05 },
      { fecha: '2026-08-10', fuente: 506.06, propio: 505.93, fuentePrevia: 499.99 },
    ],
  })
  assert.deepEqual(d.sospechosas, [])
  assert.deepEqual(d.reescalados, [])
  assert.equal(d.etiquetadas.length, 1)
})

test('la sesión real del 11/08 cuadra al céntimo: la pasada de la noche no tiene la fecha corrida', () => {
  // Contraste de control con los datos reales de la pasada de las 20:41 UTC.
  const d = juzgarDiferido({
    MSFT: [{ fecha: '2026-08-11', fuente: 503.81, propio: 503.74, fuentePrevia: 506.06 }],
    CVX: [{ fecha: '2026-08-11', fuente: 196.66, propio: 196.66, fuentePrevia: 194.91 }],
  })
  assert.deepEqual(d.sospechosas, [])
  assert.deepEqual(d.etiquetadas, [])
  assert.equal(d.simbolosConDato, 2)
})

// --- Tesis huérfanas: vencieron y su símbolo ya no viene en la pasada -------------------------------

// Series REALES de IBKR (12/08/2026) de los cuatro símbolos que se cayeron del universo dejando 16
// tesis del sábado 18/07 sin puntuar. Sus `precio_ref` son los que están en `trading_tesis`.
const SERIE_CEG = [
  { fecha: '2026-07-16', cierre: 251.77 }, { fecha: '2026-07-17', cierre: 252.39 },
  { fecha: '2026-07-20', cierre: 253.5 }, { fecha: '2026-07-21', cierre: 262.22 },
  { fecha: '2026-07-22', cierre: 274.9 }, { fecha: '2026-07-23', cierre: 275.6 },
  { fecha: '2026-07-24', cierre: 274.35 }, { fecha: '2026-07-27', cierre: 270 },
  { fecha: '2026-07-28', cierre: 259.82 }, { fecha: '2026-07-29', cierre: 257.95 },
]
const REF_18_07 = { CEG: 252.39, ISRG: 345.42, SYM: 41.25, UEC: 9.28 }
const CIERRE_28_07 = { CEG: 259.82, ISRG: 361.8, SYM: 42.34, UEC: 9.44 }
const CIERRE_17_07 = { CEG: 252.39, ISRG: 345.42, SYM: 41.25, UEC: 9.28 }

const serieDe = (simbolo: keyof typeof REF_18_07) => [
  { fecha: '2026-07-17', cierre: CIERRE_17_07[simbolo] },
  { fecha: '2026-07-28', cierre: CIERRE_28_07[simbolo] },
]

test('fechaMas y diasEntre trabajan en días naturales UTC', () => {
  assert.equal(fechaMas('2026-07-18', 10), '2026-07-28')
  assert.equal(fechaMas('2026-07-28', -10), '2026-07-18')
  assert.equal(diasEntre('2026-07-18', '2026-07-28'), 10)
  assert.equal(diasEntre('2026-08-12', '2026-08-12'), 0)
  assert.ok(Number.isNaN(diasEntre('no-es-fecha', '2026-08-12')))
})

test('el caso real de las 16 huérfanas del 18/07: los cuatro símbolos se puntúan con el cierre del 28/07', () => {
  for (const simbolo of ['CEG', 'ISRG', 'SYM', 'UEC'] as const) {
    const v = juzgarHuerfana(
      { simbolo, fecha: '2026-07-18', vence: '2026-07-28', precioRef: REF_18_07[simbolo] },
      serieDe(simbolo),
    )
    assert.equal(v.estado, 'puntuable', simbolo)
    if (v.estado !== 'puntuable') return
    assert.equal(v.precio, CIERRE_28_07[simbolo])
    // Ventana REAL medida desde la fecha de la tesis, no el horizonte declarado.
    assert.equal(v.ventanaDias, 10)
  }
})

test('la tesis es de SÁBADO y el precio_ref es el cierre del VIERNES: ancla igual (fecha exacta la habría perdido)', () => {
  // Sin esto, las 16 huérfanas reales quedan sin resolver: el 18/07/2026 no fue sesión.
  assert.equal(SERIE_CEG.find(p => p.fecha === '2026-07-18'), undefined)
  const v = juzgarHuerfana({ simbolo: 'CEG', fecha: '2026-07-18', vence: '2026-07-28', precioRef: 252.39 }, SERIE_CEG)
  assert.equal(v.estado, 'puntuable')
  if (v.estado !== 'puntuable') return
  assert.equal(v.precio, 259.82)
})

test('precio_ref con la fecha corrida (cierre de la sesión anterior) también ancla', () => {
  // Pasada lanzada antes del cierre: la tesis del 17/07 lleva el cierre del 16/07. La serie sigue siendo
  // la nuestra y en nuestra escala, que es lo único que el ancla tiene que confirmar.
  const v = juzgarHuerfana({ simbolo: 'CEG', fecha: '2026-07-17', vence: '2026-07-27', precioRef: 251.77 }, SERIE_CEG)
  assert.equal(v.estado, 'puntuable')
  if (v.estado !== 'puntuable') return
  assert.equal(v.precio, 270)
})

test('SPLIT: la serie ajustada no cuadra con nuestro precio_ref → NO se puntúa', () => {
  // El riesgo de fondo: la fuente publica histórico ajustado y nuestro ref es sin ajustar. Cruzarlos
  // daría un retorno inventado de −50% perfectamente plausible.
  const mitad = SERIE_CEG.map(p => ({ ...p, cierre: p.cierre / 2 }))
  const v = juzgarHuerfana({ simbolo: 'CEG', fecha: '2026-07-18', vence: '2026-07-28', precioRef: 252.39 }, mitad)
  assert.equal(v.estado, 'sin-ancla')
})

test('ticker reciclado por otra empresa: el precio_ref no cuadra con nada de la serie → NO se puntúa', () => {
  const v = juzgarHuerfana({ simbolo: 'CEG', fecha: '2026-07-18', vence: '2026-07-28', precioRef: 41.25 }, SERIE_CEG)
  assert.equal(v.estado, 'sin-ancla')
})

test('serie que no llega a la sesión de la tesis: no ancla en un cierre de hace semanas', () => {
  const vieja = [{ fecha: '2026-06-01', cierre: 252.39 }, { fecha: '2026-07-28', cierre: 259.82 }]
  const v = juzgarHuerfana({ simbolo: 'CEG', fecha: '2026-07-18', vence: '2026-07-28', precioRef: 252.39 }, vieja)
  assert.equal(v.estado, 'sin-ancla')
})

test('la fuente aún no llega al vencimiento: sin-cierre, no se inventa un desenlace', () => {
  const v = juzgarHuerfana({ simbolo: 'CEG', fecha: '2026-07-18', vence: '2026-08-30', precioRef: 252.39 }, SERIE_CEG)
  assert.equal(v.estado, 'sin-cierre')
})

test('el primer cierre tras el vencimiento llega demasiado tarde: mide deriva, no la ventana', () => {
  // Deja de cotizar y vuelve un mes después: ese cierre ya no es el de la ventana de la tesis.
  const conHueco = [{ fecha: '2026-07-17', cierre: 252.39 }, { fecha: '2026-08-25', cierre: 300 }]
  const v = juzgarHuerfana({ simbolo: 'CEG', fecha: '2026-07-18', vence: '2026-07-28', precioRef: 252.39 }, conHueco)
  assert.equal(v.estado, 'sin-cierre')
})

test('vencimiento en viernes con el cierre en lunes: dentro del margen, se puntúa', () => {
  const s = [{ fecha: '2026-07-17', cierre: 252.39 }, { fecha: '2026-07-27', cierre: 270 }]
  const v = juzgarHuerfana({ simbolo: 'CEG', fecha: '2026-07-18', vence: '2026-07-25', precioRef: 252.39 }, s)
  assert.equal(v.estado, 'puntuable')
  if (v.estado !== 'puntuable') return
  assert.equal(v.fecha, '2026-07-27')
  assert.equal(v.ventanaDias, 9)
})

test('sin serie (la fuente no respondió) no se puntúa: es un «no lo sé», no un cero', () => {
  const v = juzgarHuerfana({ simbolo: 'CEG', fecha: '2026-07-18', vence: '2026-07-28', precioRef: 252.39 }, [])
  assert.equal(v.estado, 'sin-ancla')
})

test('resumenHuerfanas: vacío solo si no hubo ninguna; en cuanto hay una, se dice', () => {
  assert.equal(resumenHuerfanas(0, [], 0), '')
  assert.match(resumenHuerfanas(16, [], 0), /16 tesis huérfana\(s\) puntuada/)
  const parte = resumenHuerfanas(0, [{ simbolo: 'CEG', fecha: '2026-07-18', vence: '2026-07-28', motivo: 'sin serie' }], 0)
  assert.match(parte, /1 huérfana\(s\) sin resolver/)
  assert.match(parte, /CEG 2026-07-18→2026-07-28/)
  assert.match(resumenHuerfanas(0, [], 4), /fuera de plazo/)
})
