import { test } from 'node:test'
import assert from 'node:assert/strict'
import { simularSalidas } from './salidas.ts'
import type { PuntoPrecio } from './precios-stooq.ts'

// Los retornos salen de divisiones (88/100−1) → coma flotante; se compara con tolerancia.
const igual = (real: number | null, esperado: number | null) => {
  if (esperado == null || real == null) assert.equal(real, esperado)
  else assert.ok(Math.abs(real - esperado) < 1e-9, `${real} ≉ ${esperado}`)
}

// Serie diaria sintética: cierres consecutivos desde el día SIGUIENTE a la fecha de entrada.
// El último punto se planta en fecha+92 para que haga de cierre del horizonte (91 días).
function serie(entrada: number, cierres: number[], conHorizonte = true): { puntos: PuntoPrecio[]; fecha: string } {
  const fecha = '2025-01-10'
  const dia = (n: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const puntos: PuntoPrecio[] = [{ fecha, cierre: entrada }]
  cierres.forEach((c, i) => puntos.push({ fecha: dia(i + 1), cierre: c }))
  if (conHorizonte) puntos.push({ fecha: dia(92), cierre: cierres[cierres.length - 1] })
  return { puntos, fecha }
}

test('sin precio de entrada → todo null (no se sabe, no 0)', () => {
  const s = simularSalidas([{ fecha: '2025-02-01', cierre: 100 }], '2025-01-10')
  assert.deepEqual(s, {
    salidaStop10: null, salidaStop20: null, salidaTrail15: null,
    salidaTrail25: null, salidaCoste10: null, salidaSma50: null, salidaSma200: null,
  })
})

test('sin tocar ningún stop, las tres salidas devuelven el retorno del horizonte', () => {
  const { puntos, fecha } = serie(100, [102, 105, 103, 108])
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaStop10, 0.08)
  igual(s.salidaStop20, 0.08)
  igual(s.salidaTrail15, 0.08)
})

test('caída al −12%: salta el stop10 (y vende AL CIERRE perforado), el stop20 y el trailing no', () => {
  const { puntos, fecha } = serie(100, [95, 88, 92, 110])
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaStop10, -0.12)           // vendió a 88 y se perdió la recuperación
  igual(s.salidaStop20, 0.10)            // aguantó hasta el horizonte
  igual(s.salidaTrail15, 0.10)           // 88 > 100×0,85 → no saltó
})

test('caída gradual al −21%: cada regla vende en SU cierre, no en el mismo', () => {
  const { puntos, fecha } = serie(100, [95, 88, 79, 90])
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaStop10, -0.12)           // primer cierre ≤ 90
  igual(s.salidaStop20, -0.21)           // primer cierre ≤ 80
  igual(s.salidaTrail15, -0.21)          // primer cierre ≤ 85 (pico=100)
})

test('el trailing protege la ganancia: sube a 120 y vende al volver a 100 (0%), los stops fijos no', () => {
  const { puntos, fecha } = serie(100, [110, 120, 100, 95, 130])
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaTrail15, 0)              // 100 ≤ 120×0,85=102 → vende a 100
  igual(s.salidaStop10, 0.30)            // 95 > 90 → nunca saltó, llega al horizonte
  igual(s.salidaStop20, 0.30)
})

test('hueco a la baja: el stop del −10% ejecuta al −30%, no al precio teórico del stop', () => {
  const { puntos, fecha } = serie(100, [70, 75, 80])
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaStop10, -0.3)
  igual(s.salidaStop20, -0.3)
  igual(s.salidaTrail15, -0.3)
})

test('ventana incompleta SIN disparo → null (coherente con el ret91 null del snapshot)', () => {
  const { puntos, fecha } = serie(100, [98, 97, 99], false)
  const s = simularSalidas(puntos, fecha)
  assert.deepEqual(s, {
    salidaStop10: null, salidaStop20: null, salidaTrail15: null,
    salidaTrail25: null, salidaCoste10: null, salidaSma50: null, salidaSma200: null,
  })
})

test('ventana incompleta CON disparo: lo disparado es un hecho y se conserva; el resto null', () => {
  const { puntos, fecha } = serie(100, [95, 89], false)
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaStop10, -0.11)
  igual(s.salidaStop20, null)
  igual(s.salidaTrail15, null)
})

test('los puntos ANTERIORES a la fecha de entrada no disparan nada (solo fijan la entrada)', () => {
  const fecha = '2025-01-10'
  const puntos: PuntoPrecio[] = [
    { fecha: '2025-01-02', cierre: 200 },       // caída previa 200→100: no es de esta operación
    { fecha: fecha, cierre: 100 },
    { fecha: '2025-01-15', cierre: 101 },
    { fecha: '2025-04-15', cierre: 105 },       // ≥ fecha+91 → cierre del horizonte
  ]
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaStop10, 0.05)
  igual(s.salidaTrail15, 0.05)
})

test('el cierre del horizonte es el PRIMER cierre ≥ fecha+91 (mismo criterio que retornoForward)', () => {
  const fecha = '2025-01-10'
  const puntos: PuntoPrecio[] = [
    { fecha, cierre: 100 },
    { fecha: '2025-02-10', cierre: 104 },
    { fecha: '2025-04-12', cierre: 120 },       // primer cierre tras fecha+91 (2025-04-11)
    { fecha: '2025-05-01', cierre: 90 },        // posterior: NO cuenta
  ]
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaStop10, 0.20)
})


// ─────────────────────────────────────────────────────────────────────────────
// H10 (firmada 28/08/2026): trailing ANCHO, stop a COSTE y pérdida de MEDIA.
// ─────────────────────────────────────────────────────────────────────────────

// Como `serie`, pero SEMBRANDO `n` cierres ANTERIORES a la fecha de entrada — es lo que necesitan
// las medias: sin historia previa, SMA50/SMA200 no se pueden calcular y deben quedarse en null.
function serieConHistoria(n: number, previo: number, entrada: number, cierres: number[]) {
  const fecha = '2025-01-10'
  const dia = (k: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10)
  const puntos: PuntoPrecio[] = []
  for (let k = n; k >= 1; k--) puntos.push({ fecha: dia(-k), cierre: previo })
  puntos.push({ fecha, cierre: entrada })
  cierres.forEach((c, i) => puntos.push({ fecha: dia(i + 1), cierre: c }))
  puntos.push({ fecha: dia(92), cierre: cierres[cierres.length - 1] })
  return { puntos, fecha }
}

test('trail25: una caída del 20% desde el pico NO dispara el trailing ancho', () => {
  // Pico 120 → 96 es −20%: por debajo del −15% (que sí dispara) y por encima del −25%.
  const { puntos, fecha } = serie(100, [120, 96, 110])
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaTrail15, -0.04)   // vendió en 96 → 96/100−1
  igual(s.salidaTrail25, 0.10)    // no disparó → retorno del horizonte (110)
})

test('trail25: −25% desde el pico dispara y vende en ese cierre', () => {
  const { puntos, fecha } = serie(100, [120, 90, 130])
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaTrail25, -0.10)   // 120 × 0,75 = 90 → vende en 90
})

test('coste10: si nunca toca +10%, el stop a coste no se arma y sale por tiempo', () => {
  const { puntos, fecha } = serie(100, [105, 95, 108, 103])
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaCoste10, 0.03)    // pasó por debajo de la entrada, pero sin armar → horizonte
})

test('coste10: una vez tocado el +10%, vuelve a la entrada y cierra plano', () => {
  const { puntos, fecha } = serie(100, [112, 99, 130])
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaCoste10, -0.01)   // armado en 112; vende en el primer cierre ≤ 100 → 99
})

test('sma50: el cierre que pierde la media dispara; el que la respeta, no', () => {
  const { puntos, fecha } = serie(100, [])   // sin historia previa
  assert.equal(simularSalidas(puntos, fecha).salidaSma50, null)
  const h = serieConHistoria(60, 100, 100, [101, 99, 120])
  const s = simularSalidas(h.puntos, h.fecha)
  igual(s.salidaSma50, -0.01)     // media ≈ 100 → vende en 99
})

test('sma50/200 sin historia suficiente se quedan en NULL, no en el retorno del horizonte', () => {
  // 60 cierres previos: llegan para la SMA50, NUNCA para la SMA200. Un null aquí es «no se pudo
  // evaluar la regla», no «la regla no vendió» — colapsarlos contaría una regla que no se midió.
  const { puntos, fecha } = serieConHistoria(60, 100, 100, [105, 108, 112])
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaSma50, 0.12)      // evaluable y nunca perdió la media → horizonte
  assert.equal(s.salidaSma200, null)
})

test('las medias NO miran al futuro: se comparan contra los cierres ya conocidos', () => {
  // Historia plana a 100 y luego una subida sostenida. Si la SMA se calculase con la serie entera,
  // los primeros días quedarían por debajo de esa media inflada y venderían por error.
  const { puntos, fecha } = serieConHistoria(60, 100, 100, [102, 104, 106, 108, 110])
  const s = simularSalidas(puntos, fecha)
  igual(s.salidaSma50, 0.10)      // ningún cierre pierde su media móvil → horizonte
})
