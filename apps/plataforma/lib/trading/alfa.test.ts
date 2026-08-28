import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cierreEn, retornoBench, TOLERANCIA_BENCH_DIAS } from './alfa.ts'
import type { PuntoContraste } from './precios-guardia.ts'

const igual = (real: number | null, esperado: number | null) => {
  if (esperado == null || real == null) assert.equal(real, esperado)
  else assert.ok(Math.abs(real - esperado) < 1e-9, `${real} ≉ ${esperado}`)
}

const SERIE: PuntoContraste[] = [
  { fecha: '2026-08-10', cierre: 100 },
  { fecha: '2026-08-11', cierre: 102 },
  { fecha: '2026-08-14', cierre: 105 },   // hueco: 12 y 13 sin sesión
]

test('cierreEn devuelve el último cierre <= la fecha pedida, con su fecha', () => {
  assert.deepEqual(cierreEn(SERIE, '2026-08-13'), { fecha: '2026-08-11', cierre: 102 })
  assert.deepEqual(cierreEn(SERIE, '2026-08-11'), { fecha: '2026-08-11', cierre: 102 })
  assert.equal(cierreEn(SERIE, '2026-08-09'), null)   // antes de la serie
})

test('retornoBench mide entre los dos extremos', () => {
  igual(retornoBench(SERIE, '2026-08-10', '2026-08-14'), 0.05)
})

test('un fin de semana por medio SÍ vale: el cierre del viernes es el del sábado', () => {
  // 15 y 16 son sábado y domingo; el cierre vigente es el del 14, a 1-2 días.
  igual(retornoBench(SERIE, '2026-08-10', '2026-08-16'), 0.05)
})

test('si el índice se queda MUY atrás, la ventana ya no es la de la tesis → NULL', () => {
  const lejos = `2026-08-${14 + TOLERANCIA_BENCH_DIAS + 1}`   // más allá de la holgura
  assert.equal(retornoBench(SERIE, '2026-08-10', lejos), null)
})

test('sin serie, sin extremo o con fechas al revés → NULL, nunca 0', () => {
  assert.equal(retornoBench(undefined, '2026-08-10', '2026-08-14'), null)
  assert.equal(retornoBench([], '2026-08-10', '2026-08-14'), null)
  assert.equal(retornoBench(SERIE, '2026-08-01', '2026-08-14'), null)   // no hay cierre de partida
  assert.equal(retornoBench(SERIE, '2026-08-14', '2026-08-10'), null)   // orden invertido
})

test('la holgura se mide en los DOS extremos, no solo en el final', () => {
  // Partida pedida muy anterior al primer cierre disponible: no es el arranque de esta tesis.
  const serie: PuntoContraste[] = [{ fecha: '2026-08-14', cierre: 100 }, { fecha: '2026-08-24', cierre: 110 }]
  assert.equal(retornoBench(serie, '2026-08-01', '2026-08-24'), null)
})

test('un precio de partida no positivo no se divide: NULL', () => {
  assert.equal(retornoBench([{ fecha: '2026-08-10', cierre: 0 }, { fecha: '2026-08-14', cierre: 105 }], '2026-08-10', '2026-08-14'), null)
})
